import test from 'node:test';
import assert from 'node:assert/strict';
import {CITY_LAYOUT,CITY_COLLISION,CITY_BUILDINGS,HEALER,cityWalkable,cityLayoutGeometry,travelDestination} from '@the-beginning-online/shared/maps';
import {parseDraft} from '../src/city-layout-model.ts';
import {route} from '../src/city-2d-layout.ts';
import {windowEmission,CityLighting} from '../src/city-lighting.ts';
import jobs from '../../shared/data/jobs.json' with {type:'json'};

test('approved city preserves the saved 238 placements, facing, scale and NPC service coordinates',()=>{
 const parsed=parseDraft(CITY_LAYOUT,new Set(CITY_LAYOUT.items.map(p=>p.assetId)));
 assert.equal(parsed.items.length,238);
 assert(!parsed.items.some(p=>/^(gate:|theme:(warp-core|portal|marker):)/.test(p.assetId)));
 const gazebo=parsed.items.find(p=>p.assetId==='theme:gazebo:5:5');
 assert.deepEqual([gazebo.x,gazebo.z],[-12,19.5]);
 const merchant=parsed.items.find(p=>p.assetId==='npc:merchant');
 assert.deepEqual([merchant.x,merchant.z,merchant.scale],[17,6.5,1.2]);
 assert.deepEqual(CITY_BUILDINGS.find(b=>b.id==='market').talk,merchant);
 assert.equal(parsed.items.filter(p=>p.assetId.startsWith('npc:')).length,6);
 assert.ok(parsed.items.filter(p=>p.assetId.startsWith('npc:')).every(p=>!p.flip));
 const angel=parsed.items.find(p=>p.assetId==='npc:angel');assert.deepEqual([jobs.angel.x,jobs.angel.z],[angel.x,angel.z]);
});
test('collision follows moved, removed, rotated and scaled scenery',()=>{
 assert.equal(cityWalkable(-12,19.5,.2),false,'moved gazebo is solid');
 assert.equal(cityWalkable(-9,22,.2),true,'old gazebo footprint is released');
 assert.equal(cityWalkable(27,24,.2),true,'removed well leaves no invisible obstacle');
 assert.equal(cityWalkable(-16.5,8,.2),true,'removed bench leaves no invisible obstacle');
 assert.ok(CITY_COLLISION.boxes.some(p=>p.x===-33&&p.z===23.5&&p.w===1.4&&p.d===3),'rotated flowerbed follows the latest placement');
 assert.ok(CITY_COLLISION.circles.some(p=>p.x===-22.5&&p.z===23.5&&p.r===2.5),'fountain collision moves with its artwork');
 assert.ok(CITY_COLLISION.boxes.some(p=>p.x===0&&p.z===0&&p.w===4.4&&p.d===4.4));
 assert.throws(()=>cityLayoutGeometry([{assetId:'theme:unknown',x:0,z:0,scale:1,facing:0}]),/footprint/);
});
test('all services and four gates remain reachable from the player spawn',()=>{
 for(const p of [...CITY_BUILDINGS.map(b=>b.talk),HEALER,{x:-3,z:5},{x:0,z:44},{x:44,z:0},{x:0,z:-44},{x:-44,z:0}]){
  assert.ok(cityWalkable(p.x,p.z,.38),`service or gate at ${p.x},${p.z}`);
  assert.ok(route({x:0,z:14},p).length,`route to ${p.x},${p.z}`);
 }
});
test('window emission selects warm painted lights and preserves cool water, foliage and stone',()=>{
 assert.ok(windowEmission(240,155,55)>0);
 for(const rgb of [[100,125,70],[155,150,140],[70,150,200],[255,255,255],[60,35,15]])assert.equal(windowEmission(...rgb),0);
});
test('city lamps share cached stamps, cull offscreen lights and restore compositing',()=>{
 const previous=globalThis.document;
 let stamps=0,draws=0;
 globalThis.document={createElement:()=>{stamps++;return{getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})};}};
 try{
  const states=[],lights=new CityLighting(),c={globalCompositeOperation:'source-over',save(){states.push(this.globalCompositeOperation);},restore(){this.globalCompositeOperation=states.pop();},drawImage(){draws++;}};
  const items=[{assetId:'theme:lamp:3.2',x:50,z:50,scale:1},{assetId:'theme:lamp:3.2',x:500,z:500,scale:1},{assetId:'theme:bench:2.2:0.7',x:50,z:50,scale:1}];
  for(let i=0;i<2;i++)lights.draw(c,items,(x,z)=>({x,y:z}),10,100,100);
  assert.equal(stamps,3);assert.equal(draws,2);assert.equal(c.globalCompositeOperation,'source-over');
 }finally{globalThis.document=previous;}
});


test('exit auras sit inside the four gates, label destinations and stay still with reduced motion',()=>{
 const previous=globalThis.document;
 globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
 try{
  const lights=new CityLighting(),exits=[{id:'south',name:'south'},{id:'east',name:'east'},{id:'north',name:'north'},{id:'west',name:'west'}],original=structuredClone(exits);
  function frame(time,reduced){
   const images=[],labels=[],arrows=[],anchors=[];
   const c={save(){},restore(){},drawImage(...args){images.push(args.slice(1));},beginPath(){},moveTo(...p){arrows.push(p);},lineTo(...p){arrows.push(p);},stroke(){},measureText(text){return{width:text.length*7};},fillRect(){},fillText(text){labels.push(text);}};
   lights.exits(c,exits,(x,z)=>{anchors.push([x,z]);return{x:100+x,y:100+z};},10,time,200,200,reduced);
   return{images,labels,arrows,anchors};
  }
  const still=frame(0,true);assert.deepEqual(still,frame(3,true));
  assert.equal(still.images.length,8);assert.deepEqual(still.labels,['south','east','north','west']);
  for(const [i,[x,z]] of still.anchors.entries()){assert.ok(cityWalkable(x,z,.38));assert.ok(travelDestination('city_plaza',exits[i].id,{x,z}),'aura must sit inside the server gate activation radius');}
  assert.notDeepEqual(frame(0,false).arrows,frame(3,false).arrows);
  assert.deepEqual(exits,original);
 }finally{globalThis.document=previous;}
});

test('city keeps painted shadows and caches a soft light veil without per-frame blur',()=>{
 const previous=globalThis.document;let canvases=0,filters=0;
 const gradient=()=>({addColorStop(){}});
 globalThis.document={createElement:()=>{canvases++;return{getContext:()=>({createRadialGradient:gradient,createLinearGradient:gradient,fillRect(){},drawImage(){},save(){},restore(){},transform(){},set filter(value){if(value!=='none')filters++;}})};}};
 try{
  const lights=new CityLighting(),states=[];
  const c={globalCompositeOperation:'source-over',globalAlpha:1,save(){states.push([this.globalCompositeOperation,this.globalAlpha]);},restore(){[this.globalCompositeOperation,this.globalAlpha]=states.pop();},transform(){},drawImage(){}};
  lights.finish(c,1920,1080,.72,true);
  const allocated=canvases,blurred=filters;
  for(let i=0;i<3;i++){lights.finish(c,1920,1080,.72,true);}
  assert.equal(canvases,allocated,'camera movement reuses the same light veil');assert.equal(filters,blurred,'no per-frame blur');
  assert.equal(c.globalCompositeOperation,'source-over');assert.equal(c.globalAlpha,1);
  lights.finish(c,1440,900,.72,false);lights.finish(c,1440,900,0,true);assert.equal(canvases,allocated);
  lights.finish(c,1440,900,.72,true);assert.equal(canvases,allocated+1,'resize rebuilds the light veil once');lights.finish(c,1440,900,.72,true,15);assert.equal(canvases,allocated+2,'afternoon changes the direction of the sunlight');
 }finally{globalThis.document=previous;}
});
