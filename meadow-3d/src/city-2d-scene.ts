import { CITY, CITY_LAYOUT, CITY_BUILDINGS, CITY_PLANTERS, CITY_BENCHES, CITY_STALLS } from '@the-beginning-online/shared/maps';
import {bake,type Sprite} from './city-2d-art';
import {CITY_HOUSES,CITY_ART_SOLIDS,DECOR,CITY2D_FOUNTAIN as CITY_FOUNTAIN,GARDEN_TREES,city2dWalkable} from './city-2d-layout';
import {TOWN_NPCS} from './city-2d-locations';
import {loadPaintedCityScene} from './city-2d-painted-scene';
import {makePaintedGround,isCityPlantingGround} from './city-2d-ground';
import type {NpcSprite} from './city-npc-sprite';
import {loadCitySpriteTheme} from './city-sprite-theme';
import {cityWindowGlow} from './city-lighting';
export type CityAssetCategory='อาคาร'|'ของตกแต่ง'|'ธรรมชาติ'|'กำแพงและประตู'|'NPC';
export type CitySceneAsset={id:string;name:string;category:CityAssetCategory};
export async function loadCity2DScene(editor=false){
 type Prop={x:number;z:number;image:Sprite;glow?:Sprite;asset:CitySceneAsset;label?:string;fade?:boolean;water?:boolean;tree?:boolean;foliage?:boolean};
 type PaintedAsset={id:string;rect:[number,number,number,number]};type PaintedGroup={image:string;assets:PaintedAsset[]};
 let manifest:Record<string,{webp:string}>,ground:HTMLCanvasElement,paintedSceneAssets=0;
 const props:Prop[]=[],npcSprites=new Map<string,NpcSprite>(),sprites=new Map<string,Sprite>();
 if(CITY.empty)return{ground:await makePaintedGround(!editor),props,npcSprites,paintedSceneAssets:0};
 const image=async(key:string)=>{const img=new Image();img.src=manifest[key]?.webp??key;await img.decode();return img;};
 function add(x:number,z:number,source:Sprite|((c:CanvasRenderingContext2D)=>void),id:string,name:string,category:CityAssetCategory,options:Partial<Pick<Prop,'label'|'fade'|'water'|'tree'|'foliage'>>={}){
   let sprite=sprites.get(id);if(!sprite){sprite=typeof source==='function'?bake(source):source;sprites.set(id,sprite);}
   props.push({x,z,image:sprite,asset:{id,name,category},...options});
 }
  manifest=await fetch('/texture-manifest.json').then(r=>{if(!r.ok)throw Error('โหลดรายการภาพไม่สำเร็จ');return r.json();});
  const env=await fetch('/assets/env-painted/manifest.json').then(r=>r.json());
  const tree=env.assets.find((a: {name:string})=>a.name==='tree-round');
  const treeAtlas=await image('/assets/env-painted/'+tree.atlas);ground=await makePaintedGround(!editor);
  const cityArt=await fetch('/assets/city-painted-v1/manifest.json').then(r=>r.json()) as {houses:PaintedGroup;npcs:PaintedGroup;residents:PaintedGroup};
  const houses=await image(cityArt.houses.image);
  const theme=await loadPaintedCityScene();paintedSceneAssets=theme.assetCount;
  const names:Record<string,string>={guild:'สมาคมนักผจญภัย',inn:'โรงเตี๊ยม',townhouse:'บ้านสองชั้น',cottage:'บ้านพัก',forge:'โรงตีเหล็ก',market:'ร้านค้า',chapel:'วิหาร',gazebo:'ศาลา',lamp:'เสาไฟ',banner:'ธงประดับ',dummy:'หุ่นฝึก',flowerbed:'แปลงดอกไม้',table:'โต๊ะ',stall:'แผงขายของ',notice:'กระดานประกาศ',wagon:'เกวียน',anvil:'ทั่งตีเหล็ก',barrels:'ถังไม้',bench:'ม้านั่ง',booth:'ป้อมยาม',hay:'กองฟาง',crates:'ลังไม้'};
  function themed(x:number,z:number,image:Sprite,id:string,name:string,category:CityAssetCategory='ของตกแต่ง',label?:string,fade=true){add(x,z,image,id,name,category,{label,fade});}
  function building(b:{x:number;z:number;w:number;d:number},id:string,label?:string){
    const asset=cityArt.houses.assets.find(a=>a.id===id)!;
    const w=(.83205*b.w+.5547*b.d)*1.13,h=w*asset.rect[3]/asset.rect[2];
    const foot=(.39223*b.w+.58835*b.d)/2;
    add(b.x,b.z,c=>c.drawImage(houses,...asset.rect,-w/2,foot-h,w,h),`building:${id}:${b.w}:${b.d}`,`${names[id]} · ${b.w} × ${b.d} ม.`,'อาคาร',{label,fade:true});
  }
  const paintedCache=new Map<string,Sprite>();
  async function painted(name:string,w:number,h:number){
    const key=`${name}:${w}:${h}`;if(paintedCache.has(key))return paintedCache.get(key)!;
    const asset=env.assets.find((a:{name:string})=>a.name===name);const atlas=asset.atlas===tree.atlas?treeAtlas:await image('/assets/env-painted/'+asset.atlas);
    // Fit inside the requested size without stretching the painted silhouette.
    const unit=Math.min(w/asset.rect[2],h/asset.rect[3]),drawW=asset.rect[2]*unit,drawH=asset.rect[3]*unit;
    const sprite=bake(c=>c.drawImage(atlas,...asset.rect as [number,number,number,number],-drawW*asset.anchor[0],-drawH*asset.anchor[1],drawW,drawH));paintedCache.set(key,sprite);return sprite;
  }
  const blossom=await painted('tree-flowering',5.4,5.4),tall=await painted('tree-tall',4.7,6.2);
  GARDEN_TREES.forEach(p=>add(p.x,p.z,p.flowering?blossom:tall,p.flowering?'nature:tree-flowering:5.4:5.4':'nature:tree-tall:4.7:6.2',p.flowering?'ต้นไม้ดอก':'ต้นไม้สูง','ธรรมชาติ',{fade:true,tree:true,foliage:true}));
  const shrub=await painted('bush-flowering',1.25,1),flowers=await painted('flowers-lavender',.6,.7),white=await painted('flowers-white',.6,.6),grass=await painted('grass-2',.5,.5);
  const plants=[{image:shrub,id:'nature:bush-flowering:1.25:1',name:'พุ่มไม้ดอก'},{image:white,id:'nature:flowers-white:0.6:0.6',name:'ดอกไม้สีขาว'},{image:flowers,id:'nature:flowers-lavender:0.6:0.7',name:'ดอกลาเวนเดอร์'},{image:grass,id:'nature:grass-2:0.5:0.5',name:'กอหญ้า'}];
  for(let i=0;i<180;i++){
    const a=i*2.39996,r=4+Math.sqrt(i)*1.45,x=-19+Math.cos(a)*r,z=26+Math.sin(a)*r*.65;
    if(x<-44||x>0||z>44||z<17||!city2dWalkable(x,z,.15)||!isCityPlantingGround(x,z))continue;
    if(Math.hypot(x-CITY_FOUNTAIN.x,z-CITY_FOUNTAIN.z)<6.8)continue;
    const plant=plants[i%4===0?0:i%3===0?1:i%2?2:3];add(x,z,plant.image,plant.id,plant.name,'ธรรมชาติ',{foliage:true});
  }
  for(const b of CITY_HOUSES)for(const dx of [-b.w/2-1,b.w/2+1])add(b.x+dx,b.z+1,shrub,plants[0].id,plants[0].name,'ธรรมชาติ');
  for(const p of DECOR){
    if(p.kind==='gate')continue;
    if(['guild','inn','workshop'].includes(p.kind)){building(p,p.kind==='workshop'?'cottage':p.kind,p.label);continue;}
    const sprite=p.kind==='lamp'?theme.upright('lamp',3.2):p.kind==='banner'?theme.upright('banner',4.2):p.kind==='dummy'?theme.upright('dummy',2.25):theme.footprint(p.kind,p.w,p.d);
    const size=p.kind==='lamp'?'3.2':p.kind==='banner'?'4.2':p.kind==='dummy'?'2.25':`${p.w}:${p.d}`;
    themed(p.x,p.z,sprite,`theme:${p.kind}:${size}`,names[p.kind]??p.label??p.kind,['chapel','gazebo'].includes(p.kind)?'อาคาร':'ของตกแต่ง',p.label,!['flowerbed','table'].includes(p.kind));
  }

  CITY_HOUSES.forEach((b,i)=>building(b,i%3===0?'townhouse':'cottage'));
  CITY_BUILDINGS.forEach(b=>building(b,b.id==='storage'?'guild':b.id,b.name));
  themed(0,0,theme.footprint('clocktower',4.4,4.4),'theme:clocktower:4.4:4.4','หอนาฬิกา','อาคาร','หอนาฬิกา');
  add(CITY_FOUNTAIN.x,CITY_FOUNTAIN.z,theme.sprite('fountain',6,1.6),'theme:fountain:6:1.6','น้ำพุธาราจันทร์','ของตกแต่ง',{label:'น้ำพุธาราจันทร์',water:true});
  for(const p of CITY_PLANTERS){
    themed(p.x,p.z,theme.footprint('flowerbed',1.3,1.3),'theme:flowerbed:1.3:1.3','กระถางดอกไม้','ของตกแต่ง',undefined,false);
    add(p.x,p.z,c=>{const [sx,sy,sw,sh]=tree.rect;const w=5.1,h=w*sh/sw;c.drawImage(treeAtlas,sx,sy,sw,sh,-w*tree.anchor[0],-h,w,h);},'nature:tree-round:5.1','ต้นไม้ทรงกลม','ธรรมชาติ',{fade:true,tree:true});
  }
  for(const b of CITY_BENCHES)themed(b.x,b.z,theme.footprint('bench',b.w,b.d),`theme:bench:${b.w}:${b.d}`,names.bench);
  for(const p of CITY_STALLS)themed(p.x,p.z,theme.footprint('stall',p.w,p.d),`theme:stall:${p.w}:${p.d}`,names.stall);
  for(const p of CITY_ART_SOLIDS){
    if(p.kind==='circle')themed(p.x,p.z,theme.sprite('well',p.r*2.2,p.r*.5),`theme:well:${p.r*2.2}:${p.r*.5}`,'บ่อน้ำ','ของตกแต่ง',undefined,false);
    else {const id=p.label.startsWith('guard')?'booth':p.label.startsWith('cart')?'wagon':p.label.startsWith('hay')?'hay':'crates';themed(p.x,p.z,theme.footprint(id,p.w,p.d),`theme:${id}:${p.w}:${p.d}`,names[id]);}
  }
  // Repeated painted panels are fitted at their ground endpoints, not tiled as rectangles.
  function wallRun(axis:'x'|'z',fixed:number,start:number,end:number){
    const count=Math.ceil((end-start)/8),length=(end-start)/count;
    const sprite=theme.wall(axis,length);
    for(let i=0;i<count;i++){const v=start+(i+.5)*length;themed(axis==='x'?v:fixed,axis==='x'?fixed:v,sprite,`wall:${axis}:${length}`,axis==='x'?'กำแพงแนวตะวันออก–ตะวันตก':'กำแพงแนวเหนือ–ใต้','กำแพงและประตู');}
  }
  for(const [start,end] of [[-47,-4.8],[4.8,47]])for(const side of [-47,47]){wallRun('x',side,start,end);wallRun('z',side,start,end);}
  for(const [x,z] of [[-47,-47],[47,-47],[-47,47],[47,47]])themed(x,z,theme.footprint('watchtower',3.4,3.4),'theme:watchtower:3.4:3.4','หอคอยกำแพง','กำแพงและประตู');
 const spriteTheme=await loadCitySpriteTheme();
 for(const prop of props)prop.image=spriteTheme.faces(prop.asset.id,prop.image)[0];
 for(const npc of TOWN_NPCS)npcSprites.set(npc.art,spriteTheme.npc(npc.art));
 paintedSceneAssets=Object.keys(spriteTheme.manifest.assets).length;
 if(!editor){
   const templates=new Map(props.map(p=>[p.asset.id,p]));
   const placed=CITY_LAYOUT.items.filter(p=>!p.assetId.startsWith('npc:')).map(item=>{
     const base=templates.get(item.assetId);if(!base)throw Error('ไม่มีภาพผังเมือง '+item.assetId);
     const source=spriteTheme.faces(item.assetId,base.image)[item.facing];
     const image=item.scale===1&&!item.flip?source:bake(c=>{c.scale(item.flip?-item.scale:item.scale,item.scale);c.drawImage(source,source.left,source.top,source.width/28,source.height/28);});
     const glow=base.asset.category==='อาคาร'||item.assetId.startsWith('theme:lamp:')?cityWindowGlow(image):undefined;
     return {...base,x:item.x,z:item.z,image,glow};
   });
   props.splice(0,props.length,...placed);
   for(const item of CITY_LAYOUT.items.filter(p=>p.assetId.startsWith('npc:'))){
     const art=item.assetId.slice(4) as Parameters<typeof spriteTheme.npc>[0],sprite=spriteTheme.npc(art,item.facing);
     npcSprites.set(art,{...sprite,width:sprite.width*item.scale,height:sprite.height*item.scale});
   }
 }
 return {ground,props,npcSprites,paintedSceneAssets};
}
