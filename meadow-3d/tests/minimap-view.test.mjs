import test from 'node:test';
import assert from 'node:assert/strict';
import {LAYOUTS} from '@the-beginning-online/shared/maps';
import {minimapView,minimapToMap,minimapPlayer,paintMinimapLayer,paintMinimapPlayer} from '../src/minimap-view.ts';
const size=168,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('all map edges keep the terrain rectangle covering the circular viewport',()=>{
 for(const layout of Object.values(LAYOUTS)){
  const k=2.8/(160/(layout.halfX*2));
  for(const x of [0,80,160])for(const y of [0,66,132]){
   const v=minimapView(size,k,x,y);
   assert.ok(v.ox<=1e-8&&v.oy<=1e-8);assert.ok(v.ox+160*v.k>=size-1e-8);assert.ok(v.oy+132*v.k>=size-1e-8);
   const p=minimapPlayer(size,v,x,y);assert.ok(Math.hypot(p.x-84,p.y-84)<=75+1e-8);
  }
 }
});
test('player stays centred in the interior; screenshot position shifts player instead of exposing outside world',()=>{
 const k=2.8/(160/112),v=minimapView(size,k,80,66);near(80*v.k+v.ox,84);near(66*v.k+v.oy,84);
 const edge=minimapView(size,k,2/112*160,67/100*132),p=minimapPlayer(size,edge,2/112*160,67/100*132);
 near(edge.ox,0);assert.ok(p.x<20);assert.equal(p.outside,false);
 const corner=minimapPlayer(size,minimapView(size,k,0,132),0,132);assert.equal(corner.outside,true);assert.ok(corner.x<84&&corner.y>84);
});
test('clamped NPC and route coordinates round-trip through the exact click transform',()=>{
 for(const [x,y]of [[0,0],[160,0],[0,132],[160,132],[80,66]]){
  const v=minimapView(size,2,x,y);
  for(const [px,py]of [[12,30],[80,66],[140,110]]){const clicked=minimapToMap(v,px*v.k+v.ox,py*v.k+v.oy);near(clicked.x,px);near(clicked.y,py);}
 }
 const tiny=minimapView(size,.2,80,66);assert.ok(tiny.k*132>=size);assert.ok(tiny.k*160>=size);
});
test('each layer restores clips on failure, and corner player rendering restores the shared transform',()=>{
 const calls=[],ctx=new Proxy({save:()=>calls.push('save'),restore:()=>calls.push('restore'),rotate:a=>calls.push(a)},{get:(o,k)=>o[k]??(()=>{})}),v=minimapView(size,2,0,132);
 assert.throws(()=>paintMinimapLayer(ctx,size,v,()=>{throw Error('draw failed');}));assert.deepEqual(calls.slice(0,2),['save','restore']);
 calls.length=0;assert.equal(paintMinimapPlayer(ctx,size,v,0,132,0),true);assert.equal(calls[0],'save');assert.equal(calls.at(-1),'restore');assert.ok(calls.some(x=>typeof x==='number'&&x!==0));
});
