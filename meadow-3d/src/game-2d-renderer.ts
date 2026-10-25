import {bossAnticipation} from './boss-anticipation';
import {CityLighting,drawCityWindowGlow} from './city-lighting';
import {CITY_LAYOUT} from '@the-beginning-online/shared/maps';
import {heroPresentation,heroAnimationAssets} from './hero-presentation';
import {ShadowHero} from './shadow-hero';
import {Atmosphere2D,type AtmosphereTree} from './atmosphere-2d';
import {titleDefinition} from '@the-beginning-online/shared';
import {LAYOUTS,FIELD_BOSS,FIELD_PLACES,GATES,MAP_INFO,isField,travelDestination,type MapId} from '@the-beginning-online/shared/maps';
import {CanvasAssets} from './game-2d-assets';
import {loadCity2DScene} from './city-2d-scene';
import {drawNpcSprite} from './city-npc-sprite';
import {TOWN_NPCS} from './city-2d-locations';
import {drawFountainWater} from './city-2d-fountain';
import {loadField2D} from './game-2d-fields';
import {loadMapBackdrop} from './game-2d-backdrop';
import {project2D,unproject2D} from './game-2d-projection';
import {MOTION_DURATION,motionFor,facingFor,facing8For,WALK_DIRECTIONS} from './sprite-animation';
import {BORROWED_MOTION,shownMotion,SKILL_DURATION,SKILL_FRAMES,SKILL_V2,skillFrame,isSkillMotion,type SkillMotion} from './skill-motions';
import {monsterSpecies,monsterVisual,monsterCell,monsterOpacity,monsterHue,SPECIES_SCALE} from './monster-animation';
import {huntingCell,HUNTING_ASSET_ROOT,EXPANSION_ASSET_ROOT} from './hunting-monster-animation';
import {HERO_METRES,HERO_PIXEL_METRES,BOSS_METRES} from './world-scale';
import type {CombatFeel} from './combat-feel';
import type {SwordVfxPixi} from './sword-vfx-pixi';
import {SkillVfx2D} from './skill-vfx-2d';
// Registers boss telegraph/blast effects into the shared skill VFX layer.
import './boss-vfx-2d';
import {MasteryVfx2D} from './mastery-vfx-2d';
import {masteryMotion,summonPose} from './mastery-visuals';
import {SHIELD_BASH_ART} from './shield-bash-art';
import {sceneryOpacity,placeWorldLabel,type Rect} from './world-labels';
import {drawAreaRing,drawAreaTag} from './world-area';
import {drawWarpPortal,prepareWarpPortal} from './warp-portal';
import warpFloorUrl from '../art/warp-portal-v1/floor.png';

const tint:Record<string,string>={ruin_shroom:'hue-rotate(40deg) saturate(.65)',relic_hound:'sepia(.45)',relic_wisp:'hue-rotate(125deg)',ruin_guard:'saturate(.65)',relic_warden:'sepia(.3)',crag_slime:'sepia(.8) saturate(.7)',crag_wolf:'sepia(.75)',dust_wisp:'saturate(.7)',crag_guard:'sepia(.8)',crag_titan:'sepia(.8) saturate(1.2)'};

export class GameCanvas2D{
 shadowHero?:ShadowHero;
 private remoteHeroes=new Map<string,ShadowHero>();
 readonly atmosphere=new Atmosphere2D();
 portalMotion:boolean|null=null;
 private cityLighting=new CityLighting();
 private portalArt?:ReturnType<typeof prepareWarpPortal>;
 readonly canvas=document.createElement('canvas');readonly ctx:CanvasRenderingContext2D;readonly assets:CanvasAssets;
 private city?:Awaited<ReturnType<typeof loadCity2DScene>>;
 private fields=new Map<MapId,Awaited<ReturnType<typeof loadField2D>>>();private monsterManifest:any;
 private huntingManifest:any;private expansionManifest:any;private monsterImages=new Set<string>();
 private companionImages=new Set<string>();
 private backdrops=new Map<MapId,Awaited<ReturnType<typeof loadMapBackdrop>>>();
 combatFeel?:CombatFeel;private shakeOffset={x:0,y:0};private monsterFrames=new Map<number,{motion:string;time:number}>();
 private heroStates=new Map<string,{motion:string;clock:number;skill?:SkillMotion;elapsed:number;swing?:number}>();
 private effects:any[]=[];private hits:{id:number;left:number;top:number;right:number;bottom:number}[]=[];
 private swordVfx?:SwordVfxPixi;private swordAttempted=false;readonly skillVfx=new SkillVfx2D();private enemyData=new Map<number,string>();readonly masteryVfx=new MasteryVfx2D();
 private width=1;private height=1;private dpr=1;
 /** Static ground (backdrop, roads, map plane) rendered once with a margin, then blitted; redrawn on zoom, resize or after the camera moves past the margin. */
 private groundCache:{canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;key:string;ox:number;oy:number}|null=null;
 /** Hue-shifted copies of slime atlases (canvas filters are far too slow to run per sprite per frame). */
 private tints=new WeakMap<CanvasImageSource,Map<string,HTMLCanvasElement>>();private focus={x:0,y:0};private map:MapId='city_plaza';
 scale=30;zoomHeight=27.5;overview=false;highQuality=true;drawCalls=0;
 constructor(manifest:Record<string,{webp:string}>,private swordEffects:'canvas'|'pixi'='canvas'){this.assets=new CanvasAssets(manifest);this.canvas.setAttribute('aria-label','โลกเกม 2D');this.canvas.tabIndex=0;const context=this.canvas.getContext('2d');if(!context)throw Error('เบราว์เซอร์ไม่รองรับ Canvas 2D');this.ctx=context;this.resize();window.addEventListener('pagehide',e=>{if(!e.persisted)this.swordVfx?.destroy();});}
 resize(){this.width=innerWidth;this.height=innerHeight;const dpr=this.highQuality?Math.min(devicePixelRatio,this.map==='city_plaza'?2:1.5,Math.sqrt(3840*2160/(this.width*this.height))):1;this.dpr=dpr;this.canvas.width=Math.round(this.width*dpr);this.canvas.height=Math.round(this.height*dpr);this.canvas.style.width='100%';this.canvas.style.height='100%';this.ctx.setTransform(dpr,0,0,dpr,0,0);this.swordVfx?.resize(this.width,this.height,dpr);}
 private async prepareSwordVfx(){
  if(this.swordEffects==='canvas'||this.swordAttempted)return;this.swordAttempted=true;
  let layer:SwordVfxPixi|undefined;
  try{const {SwordVfxPixi}=await import('./sword-vfx-pixi');layer=new SwordVfxPixi();await layer.init(this.width,this.height,this.dpr);this.canvas.after(layer.canvas);this.swordVfx=layer;}
  catch(error){try{layer?.destroy();}catch{}console.warn('Sword effects use Canvas2D fallback',error);}
 }
 async init(map:MapId){
  this.monsterManifest=await this.assets.json('/assets/monsters-painted/manifest.json');
  await Promise.all([SHIELD_BASH_ART.url,...heroAnimationAssets(!!this.shadowHero?.combat),'/assets/skills-painted/angel-v1.png','/assets/hero-painted/portrait-v1.png','/assets/skills-painted/skills-v2.png','/assets/skills-painted/skills-vfx-v1.png','/assets/skills-painted/skills-vfx-job2-v1.png'].map(p=>this.assets.image(p)));
  this.companionImages=new Set(Object.values<any>(this.monsterManifest.species.wolf.motions).map(clip=>'/assets/monsters-painted/'+clip.file));
  await Promise.all([...this.companionImages].map(path=>this.assets.image(path)));
  const shield=this.assets.get(SHIELD_BASH_ART.url)!;
  this.skillVfx.setShieldArt(shield,SHIELD_BASH_ART.rect);
  const portal=await this.assets.image(warpFloorUrl).catch(error=>{console.warn('Warp art unavailable; using gate marker',error);return null;});
  if(portal)this.portalArt=prepareWarpPortal(portal);
  await this.prepareMap(map);
 }
 async prepareMap(id:MapId){
  const neededMonsters=new Set<string>();
  if(!this.backdrops.has(id))this.backdrops.set(id,await loadMapBackdrop(id,this.assets));
  if(id==='city_plaza'){if(!this.city)this.city=await loadCity2DScene();}
  else{if(!this.fields.has(id))this.fields.set(id,await loadField2D(id,this.assets));
   await this.prepareSwordVfx();
   const ids=[...new Set([...LAYOUTS[id].spawns.map(m=>monsterVisual(m.dataId).id),...(FIELD_BOSS[id]?[FIELD_BOSS[id]!.dataId]:[]),...(id==='forest'?['thorn_nest_mother']:[])])];
   this.expansionManifest??=await this.assets.json(EXPANSION_ASSET_ROOT+'manifest.json');
   for(const dataId of ids)for(const clip of Object.values<any>(this.expansionManifest.species[dataId]?.motions??{}))neededMonsters.add(EXPANSION_ASSET_ROOT+clip.file);
   if(id==='ruins'||id==='canyon'){
    this.huntingManifest??=await this.assets.json(HUNTING_ASSET_ROOT+'manifest.json');
    for(const dataId of ids)for(const clip of Object.values<any>(this.huntingManifest.species[dataId]?.motions??{}))neededMonsters.add(HUNTING_ASSET_ROOT+clip.file);
   }
   const species=[...new Set(ids.filter(dataId=>!this.expansionManifest.species[dataId]&&!this.huntingManifest?.species[dataId]).map(dataId=>monsterSpecies(dataId,dataId===FIELD_BOSS[id]?.dataId)))];
   for(const s of species)for(const clip of Object.values<any>(this.monsterManifest.species[s].motions))neededMonsters.add('/assets/monsters-painted/'+clip.file);
   await Promise.all([...neededMonsters].map(p=>this.assets.image(p)));
  }
  // Commit only after the destination is ready. Keep shared atlases, release
  // every previous-map monster (including meadow/forest, not just hunting art).
  for(const path of this.monsterImages)if(!neededMonsters.has(path)&&!this.companionImages.has(path))this.assets.release(path);
  this.monsterImages=neededMonsters;
  const resized=this.map!==id;this.map=id;if(resized)this.resize();this.effects.length=0;this.swordVfx?.clear();this.skillVfx.clear();this.enemyData.clear();this.masteryVfx.clear();this.heroStates.clear();this.remoteHeroes.clear();this.monsterFrames.clear();
  // Each baked region plane is about 25–35 MB; retain only the current region
  // and two recent regions while travelling across the expanded world.
  for(const cache of [this.fields,this.backdrops])while(cache.size>3){const old=[...cache.keys()].find(key=>key!==id);if(old===undefined)break;cache.delete(old);}
 }
 screen(x:number,z:number,h=0){const p=project2D(x,z,h);return{x:this.width/2+(p.x-this.focus.x)*this.scale+this.shakeOffset.x,y:this.height/2+(p.y-this.focus.y)*this.scale+this.shakeOffset.y};}
 npcHead(x:number,z:number,art:string){const sprite=this.city?.npcSprites.get(art);return this.screen(x,z,sprite?sprite.height*(sprite.anchor?.[1]??1):0);}
 ground(x:number,y:number){const b=this.canvas.getBoundingClientRect();return unproject2D((x-b.left-this.width/2-this.shakeOffset.x)/this.scale+this.focus.x,(y-b.top-this.height/2-this.shakeOffset.y)/this.scale+this.focus.y);}
 pickEnemy(x:number,y:number){return [...this.hits].reverse().find(p=>x>=p.left&&x<=p.right&&y>=p.top&&y<=p.bottom)?.id??null;}
 event(e:any){
  this.shadowHero?.event(e);this.remoteHeroes.get(e.playerId)?.event(e);
  if(e.type==='skill'&&!e.autoSpell&&isSkillMotion(e.skillId)&&!masteryMotion(e.learnedSkill)){const s=this.heroStates.get(e.playerId)??{motion:'idle',clock:0,elapsed:0};s.skill=shownMotion(e.skillId);s.elapsed=0;this.heroStates.set(e.playerId,s);}
  // A basic swing plays the attack motion from its own event, in step with the slash VFX.
  if(e.type==='slash'&&e.playerId){const s=this.heroStates.get(e.playerId)??{motion:'idle',clock:0,elapsed:0};s.swing=0;this.heroStates.set(e.playerId,s);}
  if(this.masteryVfx.event(e))return;
  // Boss events carry only the enemy id; the VFX pick each boss's look from its data id.
  if(e.id!=null&&!e.dataId&&['warning','bossBlast','slam','sweep','spit'].includes(e.type)){const dataId=this.enemyData.get(e.id);if(dataId)e={...e,dataId};}
  if(this.skillVfx.event(e))return;
  if(this.swordVfx?.event(e))return;
  if(e.type==='yokai_decoy_break'){this.effects=this.effects.filter(v=>v.type!=='yokai_decoy'||v.playerId!==e.playerId);return;}
  if(e.type==='warningCancel'){this.effects=this.effects.filter(v=>v.id!==e.id||!['warning','safe_zone','frost_ward','yokai_echo','yokai_stance'].includes(v.type));return;}
  if(['hazardDestroyed','illusionDestroyed','yokai_echo','yokai_puddle','yokai_stance','yokai_decoy','warning','safe_zone','frost_signal','frost_ward','frost_tracks','sand_patch','sun_scroll','item_pool','bossBlast','slash','skill','skillImpact','heal','level','dash','impact','slam','hit','kill','meteor'].includes(e.type))this.effects.push({...e,age:0,life:e.duration??(e.type==='level'?.9:.45)});
  if(this.effects.length>140)this.effects.splice(0,this.effects.length-140);
 }
 private text(text:string,x:number,y:number,color='#eee1bc',size=12){const c=this.ctx;c.font=`500 ${size}px Inter,"Noto Sans Thai",sans-serif`;c.textAlign='center';c.lineJoin='round';c.lineWidth=3;c.strokeStyle='#17251ee0';c.strokeText(text,x,y);c.fillStyle=color;c.fillText(text,x,y);}
 private circle(x:number,z:number,r:number,fill:string,stroke?:string,inner=0,start=0,end=Math.PI*2){const c=this.ctx,q=this.screen(x,z),s=this.scale,m=c.getTransform();c.beginPath();
  // Build the path in world space through the projection, then restore the transform so the line width is not skewed.
  c.transform(.83205*s,.39223*s,-.5547*s,.58835*s,q.x,q.y);if(end-start<6.28)c.moveTo(0,0);else c.moveTo(Math.cos(start)*r,Math.sin(start)*r);c.arc(0,0,r,start,end);c.closePath();
  if(inner){c.moveTo(inner,0);c.arc(0,0,inner,0,Math.PI*2,true);c.closePath();}c.setTransform(m);
  if(fill!=='transparent'){c.fillStyle=fill;c.fill('evenodd');}if(stroke){c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke();}}
 private tinted(image:CanvasImageSource&{width:number;height:number},filter:string){let byFilter=this.tints.get(image);if(!byFilter)this.tints.set(image,byFilter=new Map());let out=byFilter.get(filter);
  if(!out){out=document.createElement('canvas');out.width=image.width;out.height=image.height;const t=out.getContext('2d')!;t.filter=filter;t.drawImage(image,0,0);byFilter.set(filter,out);}return out;}
 private drawGround(c:CanvasRenderingContext2D,backdrop:Awaited<ReturnType<typeof loadMapBackdrop>>|undefined,s:number){
  const M=320,o=this.screen(0,0),w=this.width,h=this.height,dpr=this.dpr,field=this.fields.get(this.map);
  const key=`${this.map}|${s}|${w}|${h}|${dpr}|${!!this.city}|${!!field}`;let g=this.groundCache;
  if(!g||g.key!==key||Math.abs(o.x-g.ox)>M||Math.abs(o.y-g.oy)>M){
   if(!g){const canvas=document.createElement('canvas');g=this.groundCache={canvas,ctx:canvas.getContext('2d')!,key:'',ox:0,oy:0};}
   const W=Math.ceil((w+2*M)*dpr),H=Math.ceil((h+2*M)*dpr);if(g.canvas.width!==W||g.canvas.height!==H){g.canvas.width=W;g.canvas.height=H;}
   const gc=g.ctx,at={x:o.x+M,y:o.y+M};gc.setTransform(dpr,0,0,dpr,0,0);gc.fillStyle=this.map==='forest'?'#223d35':'#364f36';gc.fillRect(0,0,w+2*M,h+2*M);
   backdrop?.draw(gc,at,s,w+2*M,h+2*M);
   if(this.map==='city_plaza'){if(this.city)gc.drawImage(this.city.ground,at.x-75*s,at.y-55.5556*s,150*s,111.1111*s);}
   else if(field){const l=field.layout,p=project2D(-l.halfX,-l.halfZ);gc.save();gc.transform(.83205*s,.39223*s,-.5547*s,.58835*s,at.x+p.x*s,at.y+p.y*s);gc.drawImage(field.plane,0,0,l.halfX*2,l.halfZ*2);gc.restore();}
   g.key=key;g.ox=o.x;g.oy=o.y;}
  c.drawImage(g.canvas,(M-(o.x-g.ox))*dpr,(M-(o.y-g.oy))*dpr,w*dpr,h*dpr,0,0,w,h);this.drawCalls++;
 }
 /** Additive, tinted copy of a hero frame (dash and leap afterimages). */
 private ghostSprite(image:CanvasImageSource&{width:number;height:number},cell:{column:number;row:number;columns:number;rows:number},x:number,y:number,w:number,h:number,tint:string,alpha:number){
  const o=this.ghostCanvas??=document.createElement('canvas'),t=o.getContext('2d')!,cw=Math.ceil(w),ch=Math.ceil(h);if(o.width!==cw||o.height!==ch){o.width=cw;o.height=ch;}
  t.globalCompositeOperation='source-over';t.clearRect(0,0,cw,ch);t.drawImage(image,cell.column*image.width/cell.columns,cell.row*image.height/cell.rows,image.width/cell.columns,image.height/cell.rows,0,0,w,h);t.globalCompositeOperation='source-atop';t.fillStyle=tint;t.fillRect(0,0,cw,ch);
  const c=this.ctx;c.save();c.globalAlpha=alpha;c.globalCompositeOperation='lighter';c.drawImage(o,x,y,w,h);c.restore();this.drawCalls++;
 }
 private ghostCanvas?:HTMLCanvasElement;private paperShadowsDrawn=0;
 private hero(p:any,dt:number,time:number,own:boolean){
  const state=this.heroStates.get(p.id)??{motion:'idle',clock:0,elapsed:0};this.heroStates.set(p.id,state);const baseMotion=motionFor(p),motion=(baseMotion==='attack'&&masteryMotion(p.attackKind))||baseMotion;state.clock=motion===state.motion?state.clock+dt:0;state.motion=motion;state.elapsed+=dt;
  if(state.skill&&(state.elapsed>SKILL_DURATION[state.skill]||p.dead||p.hurt>0))state.skill=undefined;
  if(state.swing!==undefined){state.swing+=dt;if(state.swing>=MOTION_DURATION.attack||p.dead||p.hurt>0)state.swing=undefined;}
  const swinging=state.swing!==undefined&&(motion==='idle'||motion==='walk'||motion==='run'),shown=swinging?'attack':motion;
  let actor=this.shadowHero;
  if(!own&&actor){let remote=this.remoteHeroes.get(p.id);if(!remote){remote=new ShadowHero(actor.manifest);remote.combat=true;this.remoteHeroes.set(p.id,remote);}actor=remote;}
  if(actor)actor.outfit=p.gender==='female'?'female':own?actor.outfit:'male';
  const shadow=actor?.combat?actor.combatPose(own?p:{...p,stats:{weaponType:p.weaponType}},dt):actor?.pose(state.skill?'cast':shown,p.fx,p.fz,state.skill?state.elapsed:swinging?state.swing!:state.clock);
  const pose=shadow??heroPresentation(shown,p.fx,p.fz,swinging?state.swing!:state.clock);let {cell,key}=pose;
  const skill=shadow?undefined:state.skill,v2=skill?SKILL_V2[skill]:undefined,px=skill?(v2??{w:384,h:256,feet:240}):pose;
  if(skill){key=`/assets/hero-skills/hero-skill-${skill}-${v2?'v2':'v1'}.png`;cell={column:skillFrame(skill,state.elapsed),row:v2?WALK_DIRECTIONS.indexOf(facing8For(p.fx,p.fz)):['SE','SW','NE','NW'].indexOf(facingFor(p.fx,p.fz)),columns:SKILL_FRAMES[skill],rows:v2?8:4};}
  const scale=skill?1:pose.scale,image=this.assets.get(key)!;const q=this.screen(p.x,p.z),qs=p.lift?this.screen(p.x,p.z,p.lift):q,w=px.w*HERO_PIXEL_METRES*this.scale*scale,h=px.h*HERO_PIXEL_METRES*this.scale*scale,foot=px.feet/px.h,anchorX=shadow?.anchorX??.5;
  for(const g of p.ghosts??[]){const gq=this.screen(g.x,g.z,g.lift);this.ghostSprite(image,cell,gq.x-w*anchorX,gq.y-h*foot,w,h,g.tint??p.ghostTint,g.alpha);}
  this.atmosphere.actorShadow(this.ctx,q,this.scale,.76);if(this.map!=='city_plaza')this.circle(p.x,p.z,.42,this.atmosphere.settings.enabled?'transparent':'#162c2940',own?'#e7d39b88':undefined);this.ctx.drawImage(image,cell.column*image.width/cell.columns,cell.row*image.height/cell.rows,image.width/cell.columns,image.height/cell.rows,qs.x-w*anchorX,qs.y-h*foot,w,h);this.drawCalls++;
  if(!this.overview&&!p.dead){const title=titleDefinition(p.titleId);if(title)this.text(title.name,qs.x,qs.y-(HERO_METRES+.7)*this.scale,title.color,10);this.text(p.name||'นักผจญภัย',qs.x,qs.y-(HERO_METRES+.3)*this.scale);}
  for(const [i,status]of (p.statuses??[]).entries()){if(i>4)break;this.circle(p.x,p.z,.55+i*.08,'transparent',status.id==='guard'?'#b9d9ed88':'#d6d28c66');}
 }
 private companion(pet:any,owner:any,time:number){
  if(pet.dead||pet.hp<=0)return;
  const def=this.monsterManifest.species.wolf,pose=summonPose(pet,this.masteryVfx.time,this.masteryVfx.petAttacks.get(pet.id));
  const cell=huntingCell({motion:pose.motion,motionTime:pose.time,motionDuration:pose.duration,fx:pet.fx,fz:pet.fz},pose.windup,def.motions.attack.columns),info=def.motions[cell.motion],image=this.assets.get('/assets/monsters-painted/'+info.file);if(!image)return;
  const q=this.screen(pet.x,pet.z),w=def.quadWorldSize[0]*this.scale*.65,h=def.quadWorldSize[1]*this.scale*.65,c=this.ctx;
  this.atmosphere.actorShadow(c,q,this.scale,.48);this.circle(pet.x,pet.z,.5,'#93dece15','#b6decd');
  c.save();c.globalAlpha=.9;c.drawImage(image,cell.column*image.width/info.columns,cell.row*image.height/info.rows,image.width/info.columns,image.height/info.rows,q.x-w*def.anchor[0],q.y-h*(1-def.anchor[1]),w,h);c.restore();this.drawCalls++;
  c.fillStyle='#172a25';c.fillRect(q.x-15,q.y-h*.85,30,3);c.fillStyle='#9bcdb7';c.fillRect(q.x-15,q.y-h*.85,30*Math.max(0,Math.min(1,pet.hp/pet.maxHp)),3);
  if(!this.overview)this.text('ผู้พิทักษ์',q.x,q.y-h*.85-6,'#bce3d2',9);
 }
 private monster(e:any,selected:boolean){
  if(e.dataId==='endgame_focus'){
   const q=this.screen(e.x,e.z),c=this.ctx,s=this.scale,r=s*.55;c.save();c.globalAlpha=monsterOpacity(e);this.atmosphere.actorShadow(c,q,s,.6);
   if(selected)this.circle(e.x,e.z,.75,'#d3b65b33','#f7d987');
   c.fillStyle='#223b42';c.strokeStyle='#b5d5d1';c.lineWidth=2;c.beginPath();c.moveTo(q.x-r,q.y);c.lineTo(q.x-r*.8,q.y-s*.7);c.lineTo(q.x+r*.8,q.y-s*.7);c.lineTo(q.x+r,q.y);c.closePath();c.fill();c.stroke();
   c.fillStyle='#d7bd76';c.beginPath();c.moveTo(q.x,q.y-s*1.5);c.lineTo(q.x+r*.65,q.y-s);c.lineTo(q.x,q.y-s*.5);c.lineTo(q.x-r*.65,q.y-s);c.closePath();c.fill();c.stroke();c.restore();
   if(!e.dead){this.hits.push({id:e.id,left:q.x-r,right:q.x+r,top:q.y-s*1.5,bottom:q.y});this.text('ทำลายตรา · '+Math.ceil(e.hp),q.x,q.y-s*1.7,'#e8d08e',11);}this.drawCalls++;return;
  }
  if(e.dataId==='desert_sand_ball'||e.dataId==='desert_binding_knot'){
   const q=this.screen(e.x,e.z),c=this.ctx,s=this.scale,r=s*.5;this.atmosphere.actorShadow(c,q,s,.5);c.save();c.globalAlpha=monsterOpacity(e);
   if(selected)this.circle(e.x,e.z,.65,'#e5b94d22','#efcb82');
   if(e.dataId==='desert_sand_ball'){const g=c.createRadialGradient(q.x-r*.3,q.y-r*1.25,r*.1,q.x,q.y-r,r);g.addColorStop(0,'#f2d99a');g.addColorStop(1,'#826038');c.fillStyle=g;c.beginPath();c.arc(q.x,q.y-r,r,0,Math.PI*2);c.fill();c.strokeStyle='#b59763';c.lineWidth=1.2;for(let i=0;i<5;i++){c.beginPath();c.ellipse(q.x,q.y-r,r*.85,r*.24,i*.7+e.motionTime*3,0,Math.PI*2);c.stroke();}}
   else{c.lineCap='round';c.strokeStyle='#8e6340';c.lineWidth=s*.2;c.beginPath();c.moveTo(q.x,q.y);c.lineTo(q.x,q.y-s*.9);c.stroke();c.strokeStyle='#e8d9b0';c.lineWidth=s*.12;for(let i=0;i<4;i++){c.beginPath();c.ellipse(q.x,q.y-s*(.2+i*.15),s*.3,s*.09,-.2,0,Math.PI*2);c.stroke();}c.beginPath();c.moveTo(q.x,q.y-s*.7);c.bezierCurveTo(q.x+s*.6,q.y-s*.9,q.x+s*.6,q.y-s*.25,q.x+s*.9,q.y-s*.3);c.stroke();}
   c.restore();if(!e.dead)this.hits.push({id:e.id,left:q.x-r*1.2,right:q.x+r*1.2,top:q.y-s*1.05,bottom:q.y});this.drawCalls++;return;
  }
  if(e.nestEgg){const q=this.screen(e.x,e.z),c=this.ctx,r=this.scale*.65;c.save();c.globalAlpha=monsterOpacity(e);c.fillStyle='#d9d4b6';c.strokeStyle='#587159';c.lineWidth=2;c.beginPath();c.ellipse(q.x,q.y-r,r*.75,r,0,0,Math.PI*2);c.fill();c.stroke();for(let n=0;n<4;n++){c.beginPath();c.ellipse(q.x,q.y-r,r*.75,r*.3,n*.7,0,Math.PI*2);c.stroke();}c.restore();if(!e.dead)this.text('ถุงไข่ · '+Math.ceil(e.nestEgg.hatch),q.x,q.y-r*2.3,'#f4e7ba',11);if(!e.dead)this.hits.push({id:e.id,left:q.x-r,top:q.y-r*2,right:q.x+r,bottom:q.y});return;}

  const visual=monsterVisual(e.dataId),species=monsterSpecies(e.dataId,e.boss),expansion=this.expansionManifest?.species[visual.id],fresh=expansion??this.huntingManifest?.species[visual.id],def=fresh??this.monsterManifest.species[species];
  const legacyMotion=def.motions[e.motion]?e.motion:'idle',cell=fresh||def.sourceId?huntingCell(e,['thorn_nest_mother','greek_minotaur'].includes(e.dataId)&&e.motion==='attack'?e.motionDuration-.35:def.attackWindup,def.motions.attack.columns):monsterCell(species,legacyMotion,e.fx,e.fz,e.motionTime),motion='motion' in cell?cell.motion:legacyMotion;
  const info=def.motions[motion],image=this.assets.get((expansion?EXPANSION_ASSET_ROOT:fresh?HUNTING_ASSET_ROOT:'/assets/monsters-painted/')+info.file);if(!image)return;
  const factor=visual.scale*(fresh?1:SPECIES_SCALE[species]*(e.boss?BOSS_METRES/(def.bodyWorldHeight||6.9):1)),w=def.quadWorldSize[0]*factor*this.scale,h=def.quadWorldSize[1]*factor*this.scale,q=this.screen(e.x,e.z),x=q.x-w*def.anchor[0],y=q.y-h*(1-def.anchor[1]);
  if(selected)this.circle(e.x,e.z,e.boss?1.6:.7,'#a66e3322','#eec68b');
  if(!e.illusion&&!(e.dataId==='yokai_06'&&e.summoned))this.atmosphere.actorShadow(this.ctx,q,this.scale,e.boss?1.3:.55);

  const c=this.ctx,hue=monsterHue(e.dataId,e.variant),src=fresh?image:tint[e.dataId]?this.tinted(image as HTMLImageElement,tint[e.dataId]):species==='slime'&&hue?this.tinted(image as HTMLImageElement,`hue-rotate(${hue*360}deg)`):image,alpha=monsterOpacity(e),sx=cell.column*image.width/info.columns,sy=cell.row*image.height/info.rows,sw=image.width/info.columns,sh=image.height/info.rows;
  const anticipation=bossAnticipation(e,info.file===def.motions.attack?.file);
  c.save();if(anticipation){c.translate(q.x,q.y);c.transform(anticipation.x,0,anticipation.skew,anticipation.y,0,0);c.translate(-q.x,-q.y);}
  c.globalAlpha=alpha*(e.illusion?.55:1)*(e.dataId==='desert_03'&&e.motion==='attack'&&e.windup>0&&e.motionTime>.3?.3:1);c.drawImage(src,sx,sy,sw,sh,x,y,w,h);this.drawCalls++;
  // Hit flash: add 35 % of the sprite again (≈ brightness(1.35)) instead of a canvas filter.
  if(e.hurt>0){c.globalCompositeOperation='lighter';c.globalAlpha=alpha*.35;c.drawImage(src,sx,sy,sw,sh,x,y,w,h);c.globalCompositeOperation='source-over';this.drawCalls++;}c.restore();
  const bounds=info.directions?.[cell.row]?.[cell.column]?.bounds;const b=bounds?{left:x+bounds[0]/def.cellSize[0]*w,top:y+bounds[1]/def.cellSize[1]*h,right:x+bounds[2]/def.cellSize[0]*w,bottom:y+bounds[3]/def.cellSize[1]*h}:{left:q.x-w*.25,top:q.y-h*.7,right:q.x+w*.25,bottom:q.y};
  if(!e.dead){this.hits.push({id:e.id,...b});if(selected||e.hp<e.maxHp){const by=q.y-(e.boss?4.8:1.5)*this.scale;c.fillStyle='#17251e';c.fillRect(q.x-22,by,44,4);c.fillStyle='#d99491';c.fillRect(q.x-22,by,44*e.hp/e.maxHp,4);}if(e.statuses?.length)this.text(e.statuses.map((s:any)=>s.id==='stun'?'มึนงง':s.id==='taunt'?'ยั่วยุ':'↓').join(' '),q.x,q.y-1.8*this.scale,'#e7d79d',10);}
 }
 render(game:any,others:any[],dt:number,time:number){
  const visiblePlayers=new Set(others.map(p=>p.id));for(const id of this.remoteHeroes.keys())if(!visiblePlayers.has(id))this.remoteHeroes.delete(id);
  const c=this.ctx;this.drawCalls=0;this.paperShadowsDrawn=0;this.hits=[];this.scale=this.overview?Math.min(this.width/145,this.height/112):this.height/this.zoomHeight;
  const now=performance.now(),shake=(this.combatFeel?.camera(dt)??0)*this.scale;this.shakeOffset={x:Math.sin(time*113)*shake,y:Math.cos(time*97)*shake*.7};
  // NetworkWorld already smooths movement; a second camera lag moves the hero off centre.
  this.focus=this.overview?{x:0,y:0}:project2D(game.p.x,game.p.z,HERO_METRES/2);
  c.clearRect(0,0,this.width,this.height);c.fillStyle=this.map==='forest'?'#223d35':'#364f36';c.fillRect(0,0,this.width,this.height);
  const draws:{depth:number;draw:()=>void}[]=[],s=this.scale,add=(x:number,z:number,draw:()=>void)=>draws.push({depth:project2D(x,z).y,draw});
  const visible=(q:{x:number;y:number},r=220)=>q.x>-r&&q.x<this.width+r&&q.y>-r&&q.y<this.height+r;
  const protectedActors=[game.p,...game.enemies.filter((e:any)=>!e.dead&&(e.id===game.target||(e.boss&&Math.hypot(e.x-game.p.x,e.z-game.p.z)<12)))].map((a:any)=>{
   const q=this.screen(a.x,a.z),height=(a.boss?BOSS_METRES:HERO_METRES+.6)*s,width=(a.boss?2:.82)*s;
   return{left:q.x-width/2,top:q.y-height,right:q.x+width/2,bottom:q.y,footY:q.y};
  });
  const backdrop=this.backdrops.get(this.map);this.drawGround(c,backdrop,s);
  if(this.map!=='city_plaza'){
   for(const p of LAYOUTS[this.map].camps){const q=this.screen(p.x,p.z);if(visible(q,2*s))drawAreaRing(c,q,2,s,'#a9d3b4',Math.hypot(p.x-game.p.x,p.z-game.p.z)<2);}
  }
  if(this.map==='city_plaza')this.cityLighting.draw(c,CITY_LAYOUT.items,(x,z)=>this.screen(x,z),s,this.width,this.height,true);
  const sceneryTrees:AtmosphereTree[]=[];this.atmosphere.water(c,this.map,(x,z,h)=>this.screen(x,z,h),s,time,this.width,this.height,this.highQuality);
  for(const p of backdrop?.props??[]){const q=this.screen(p.x,p.z);if(!visible(q,p.h*s))continue;if(p.tree)sceneryTrees.push(p);add(p.x,p.z,()=>{c.save();if(p.tree){const sway=this.atmosphere.sway(p.x,p.z,time);c.transform(1,0,sway,1,-sway*q.y,0);}const x=q.x-p.w*p.anchor[0]*s,y=q.y-p.h*p.anchor[1]*s;c.globalAlpha=sceneryOpacity({left:x,top:y,right:x+p.w*s,bottom:y+p.h*s},q.y,protectedActors);c.drawImage(p.image,...p.rect as [number,number,number,number],x,y,p.w*s,p.h*s);c.restore();this.drawCalls++;});}
  if(this.map==='city_plaza'&&this.city){
   for(const p of this.city.props){const q=this.screen(p.x,p.z);if(!visible(q))continue;if(p.tree)sceneryTrees.push({x:p.x,z:p.z,h:p.image.height/28,w:p.image.width/28});add(p.x,p.z,()=>{c.save();if(p.tree||p.foliage){const sway=this.atmosphere.sway(p.x,p.z,time);c.transform(1,0,sway,1,-sway*q.y,0);}const x=q.x+p.image.left*s,y=q.y+p.image.top*s,w=p.image.width/28*s,h=p.image.height/28*s;c.globalAlpha=p.fade?sceneryOpacity({left:x,top:y,right:x+w,bottom:y+h},q.y,protectedActors):1;c.drawImage(p.image,x,y,w,h);drawCityWindowGlow(c,p.glow,q.x,q.y,s);c.restore();if(p.water)drawFountainWater(c,q.x,q.y,s,time,this.atmosphere.reducedMotion);});}
   for(const [i,n] of TOWN_NPCS.entries()){const q=this.screen(n.x,n.z);if(!visible(q))continue;add(n.x,n.z,()=>{this.atmosphere.actorShadow(c,q,s,.48);drawNpcSprite(c,this.city!.npcSprites.get(n.art)!,q.x,q.y,s,time+i*.173);});}
  }else{const field=this.fields.get(this.map);if(field){
   for(const p of field.props){const q=this.screen(p.x,p.z);if(!visible(q))continue;if(p.tree)sceneryTrees.push(p);add(p.x,p.z,()=>{c.save();if(p.tree||p.foliage){const sway=this.atmosphere.sway(p.x,p.z,time);c.transform(1,0,sway,1,-sway*q.y,0);}const x=q.x-p.w*p.anchor[0]*s,y=q.y-p.h*p.anchor[1]*s;c.globalAlpha=sceneryOpacity({left:x,top:y,right:x+p.w*s,bottom:y+p.h*s},q.y,protectedActors);c.drawImage(p.image,...p.rect as [number,number,number,number],x,y,p.w*s,p.h*s);c.restore();});}
  }}
  this.atmosphere.shadows(c,sceneryTrees,(x,z,h)=>this.screen(x,z,h),s,time);
  const portalReducedMotion=this.portalMotion===null?this.atmosphere.reducedMotion:!this.portalMotion;
  for(const [gate,p] of Object.entries(GATES[this.map])){
   const destination=travelDestination(this.map,gate,p),q=this.screen(p.x,p.z);if(!destination||!visible(q,120))continue;
   const to=destination.mapId,high=to!=='city_plaza'&&!LAYOUTS[to].exploration&&parseInt(MAP_INFO[to].levels,10)>game.p.level+2;
   const portal=this.portalArt;
   if(portal){drawWarpPortal(c,portal,q.x,q.y,s,now/1000,portalReducedMotion,high,'ground');this.drawCalls++;
    add(p.x,p.z,()=>{drawWarpPortal(c,portal,q.x,q.y,s,now/1000,portalReducedMotion,high,'light');this.drawCalls++;});
   }else this.circle(p.x,p.z,1.1,'#58caff22','#b8efff');
  }
  for(const effect of this.effects){effect.age+=dt;if(effect.type==='frost_ward'||effect.type==='frost_signal')this.circle(effect.x,effect.z,effect.r??1.5,'#9bcae033','#d0eeff');if(effect.type==='frost_tracks'){for(let i=0;i<10;i++){const t=i/9;this.circle(effect.x+(effect.targetX-effect.x)*t+(i%2?.18:-.18),effect.z+(effect.targetZ-effect.z)*t,.13,'#577a9b99');}}if(effect.type==='sand_patch')this.circle(effect.x,effect.z,effect.r??1.3,'#d1ae6555','#bc8a3c');if((effect.type==='item_pool'||effect.type==='safe_zone'))this.circle(effect.x,effect.z,effect.r??2,'#79cdbc44','#a7f1dd');if(effect.type==='warning'){const half=(effect.angle??360)*Math.PI/360,start=effect.shape==='cone'?Math.atan2(effect.fz,effect.fx)-half:0,end=effect.shape==='cone'?start+half*2:Math.PI*2;this.circle(effect.x,effect.z,effect.r??2,'#e5503a42','#ff8264',effect.shape==='ring'?effect.inner:0,start,end);}}
  for(const e of this.effects){
   if(e.type==='yokai_puddle')this.circle(e.x,e.z,e.r??1.5,'#6ca9b455','#add3cc');
   if(e.type==='yokai_stance'){
    const color=e.text==='กระบองหนัก'?'#ffac79':'#bdb4ff';this.circle(e.x,e.z,e.r??1.5,'transparent',color);
    for(const lamp of LAYOUTS[this.map].obstacles.filter(o=>o.kind==='yokai-lantern'))add(lamp.x,lamp.z,()=>{const q=this.screen(lamp.x,lamp.z,1.2),r=s*.48;c.save();const glow=c.createRadialGradient(q.x,q.y,0,q.x,q.y,r);glow.addColorStop(0,color+'ee');glow.addColorStop(.4,color+'aa');glow.addColorStop(1,color+'00');c.fillStyle=glow;c.beginPath();c.arc(q.x,q.y,r,0,Math.PI*2);c.fill();c.restore();});
   }
   if(e.type==='yokai_echo'){const source=game.enemies.find((v:any)=>v.id===e.id);if(source?.dataId==='yokai_bamboo_kodama')add(e.x,e.z,()=>{const hits=this.hits.length;this.monster({...source,x:e.x,z:e.z,illusion:true},false);this.hits.length=hits;});else this.circle(e.x,e.z,e.r??2,'#adb8de33','#d6c2dd');}
   if(e.type==='yokai_decoy'){const owner=[game.p,...others].find(p=>p.id===e.playerId);if(owner){const pose=heroPresentation('idle',owner.fx,owner.fz,0),image=this.assets.get(pose.key);if(image)add(e.x,e.z,()=>{const q=this.screen(e.x,e.z),w=pose.w*HERO_PIXEL_METRES*s*pose.scale,h=pose.h*HERO_PIXEL_METRES*s*pose.scale;this.ghostSprite(image,pose.cell,q.x-w/2,q.y-h*pose.feet/pose.h,w,h,'#b5cbea',.7);this.paperShadowsDrawn++;});}}
  }
  for(const drop of game.drops){const q=this.screen(drop.x,drop.z);add(drop.x,drop.z,()=>{c.fillStyle='#e6ce79';c.beginPath();c.moveTo(q.x,q.y-11);c.lineTo(q.x+5,q.y-5);c.lineTo(q.x,q.y+1);c.lineTo(q.x-5,q.y-5);c.closePath();c.fill();});}
  for(const p of [game.p,...others])if(p.summon&&visible(this.screen(p.summon.x,p.summon.z),100))add(p.summon.x,p.summon.z,()=>this.companion(p.summon,p,time));
  for(const p of [game.p,...others]){const pose=this.skillVfx.heroPose(p.id,p.x,p.z);let drawn=pose?{...p,x:pose.x,z:pose.z,lift:pose.lift,ghosts:pose.ghosts,ghostTint:pose.tint}:p;if(p.decoy&&!p.decoy.dead)drawn={...drawn,ghosts:[...(drawn.ghosts??[]),{x:p.decoy.x,z:p.decoy.z,lift:0,alpha:.5,tint:'#b3a0d2'}]};if(visible(this.screen(drawn.x,drawn.z),100))add(drawn.x,drawn.z,()=>this.hero(drawn,this.combatFeel?.frozen(p.id,now)?0:dt,time,p===game.p));}
  const liveIds=new Set<number>();
  for(const e of game.enemies){liveIds.add(e.id);this.enemyData.set(e.id,e.dataId);const last=this.monsterFrames.get(e.id),frozen=this.combatFeel?.frozen('monster:'+e.id,now)&&last?.motion===e.motion,motionTime=frozen?last!.time:e.motionTime;this.monsterFrames.set(e.id,{motion:e.motion,time:motionTime});if(visible(this.screen(e.x,e.z),160)){const n=this.combatFeel?.nudge(e.id,now)??{x:0,z:0};add(e.x,e.z,()=>this.monster({...e,x:e.x+n.x,z:e.z+n.z,motionTime,hurt:Math.max(e.hurt,this.combatFeel?.flash(e.id,now)??0)},e.id===game.target));}}
  for(const id of this.monsterFrames.keys())if(!liveIds.has(id))this.monsterFrames.delete(id);
  for(const id of this.enemyData.keys())if(!liveIds.has(id))this.enemyData.delete(id);
  const vfxFrame={ctx:c,width:this.width,height:this.height,dpr:this.dpr,scale:s,screen:(x:number,z:number,h?:number)=>this.screen(x,z,h),locate:(id:string)=>[game.p,...others].find(p=>p.id===id),highQuality:this.highQuality,reducedMotion:this.atmosphere.reducedMotion,enemy:(id:number)=>game.enemies.find((e:any)=>e.id===id)};
  this.masteryVfx.advance(dt);this.masteryVfx.pre(vfxFrame,[game.p,...others],game.smokeFields??[],game.time);
  this.skillVfx.pre(vfxFrame,dt);
  draws.sort((a,b)=>a.depth-b.depth).forEach(d=>d.draw());
  this.atmosphere.light(c,this.width,this.height,this.map);
  if(this.map==='city_plaza'&&this.atmosphere.settings.enabled)this.cityLighting.finish(c,this.width,this.height,this.atmosphere.settings.sun,this.highQuality,this.atmosphere.settings.hour);
  if(this.map==='city_plaza')this.cityLighting.draw(c,CITY_LAYOUT.items,(x,z)=>this.screen(x,z),s,this.width,this.height);
  this.atmosphere.leaves(c,sceneryTrees,(x,z,h)=>this.screen(x,z,h),s,time,this.width,this.height,this.highQuality);
  const labelSpace:Rect[]=[...protectedActors];
  c.save();c.font='500 12px Inter,"Noto Sans Thai",sans-serif';
  for(const p of [game.p,...others])if(!p.dead){
   const q=this.screen(p.x,p.z),width=c.measureText(p.name||'นักผจญภัย').width;
   labelSpace.push({left:q.x-width/2-4,top:q.y-(HERO_METRES+.3)*s-15,right:q.x+width/2+4,bottom:q.y-(HERO_METRES+.3)*s+4});
   if(p.titleId)labelSpace.push({left:q.x-100,top:q.y-(HERO_METRES+.7)*s-15,right:q.x+100,bottom:q.y-(HERO_METRES+.7)*s+4});
  }c.restore();
  const label=(value:string,x:number,z:number,color='#f4e4b5',lift=28)=>{const q=this.screen(x,z);if(!visible(q,80))return;c.save();c.font='12px "Noto Sans Thai",sans-serif';const r=placeWorldLabel(q.x,q.y-lift,c.measureText(value).width+16,labelSpace);if(r){labelSpace.push(r);c.fillStyle='#10251ee8';c.fillRect(r.left,r.top,r.right-r.left,18);this.text(value,q.x,r.bottom-4,color);}c.restore();};
  for(const [gate,p] of Object.entries(GATES[this.map])){
   const destination=travelDestination(this.map,gate,p),q=this.screen(p.x,p.z);if(!destination||!visible(q,100))continue;
   const to=destination.mapId,explore=LAYOUTS[to].exploration,high=to!=='city_plaza'&&!explore&&parseInt(MAP_INFO[to].levels,10)>game.p.level+2,color=high?'#ffcb96':'#b8efff';
   label('◇ วาร์ปไป'+MAP_INFO[to].name+(to==='city_plaza'?' · เขตปลอดภัย':' · Lv.'+MAP_INFO[to].levels)+(explore?' · สำรวจ':high?' · ระดับสูง':''),p.x,p.z,color,1.8*s);
  }
  if(this.map!=='city_plaza')for(const [i,p] of LAYOUTS[this.map].camps.entries()){
   const q=this.screen(p.x,p.z);if(visible(q,2*s)&&Math.hypot(p.x-game.p.x,p.z-game.p.z)<12){const r=drawAreaTag(c,{x:q.x,y:q.y-2*s*.71-14},`แคมป์พักฟื้น ${i+1}`,'ฟื้น HP · ยังมีอันตราย','camp','#a9d3b4',labelSpace);if(r)labelSpace.push(r);}
  }
  if(isField(this.map))for(const p of FIELD_PLACES[this.map])if(p.kind!=='boss'&&Math.hypot(p.x-game.p.x,p.z-game.p.z)<(p.kind==='sign'?10:14))label((p.kind==='sign'?'':'⌖ ')+p.name,p.x,p.z);
  for(const e of this.effects){if(['yokai_echo','yokai_puddle','yokai_stance','yokai_decoy','warning','sand_patch','frost_tracks','frost_ward','frost_signal'].includes(e.type))continue;const ratio=e.age/e.life,r=e.r??(e.type==='hit'?.3:1.6);this.circle(e.x??game.p.x,e.z??game.p.z,r*(.4+ratio),'transparent',e.type==='heal'?'#b9e49e':e.type==='bossBlast'?'#f3a67a':'#e8d4a4');
   if(e.type==='skill'||e.type==='skillImpact'){const id=BORROWED_MOTION[e.skillId as SkillMotion]??e.skillId,index=['slash','whirlwind','dash_strike','earth_break','provoke','endure'].indexOf(id),image=this.assets.get('/assets/skills-painted/skills-vfx-v1.png');if(index>=0&&image){const q=this.screen(e.x??game.p.x,e.z??game.p.z,.6),w=s*(3+ratio);c.save();c.globalAlpha=(1-ratio)*.85;c.drawImage(image,index%3*image.width/3,Math.floor(index/3)*image.height/2,image.width/3,image.height/2,q.x-w/2,q.y-w/2,w,w);c.restore();}}
  }
  this.effects=this.effects.filter(e=>e.age<e.life);
  this.skillVfx.post(vfxFrame);this.masteryVfx.post(vfxFrame,[game.p,...others],game.enemies,game.time);
  for(const p of game.projectiles){const q=this.screen(p.x,p.z,.6);c.fillStyle=p.attack==='bolt'?'#f4dfa5':'#add6d5';c.shadowColor=c.fillStyle;c.shadowBlur=8;c.beginPath();c.arc(q.x,q.y,Math.max(3,s*.13),0,Math.PI*2);c.fill();c.shadowBlur=0;}
  this.swordVfx?.render(dt,(x,z,h)=>this.screen(x,z,h),s);
 }
 snapshot(){return{renderer:'Canvas2D',map:this.map,citizens:0,npcs:this.map==='city_plaza'?TOWN_NPCS.length:0,drawCalls:this.drawCalls,paperShadows:this.paperShadowsDrawn,yokaiStance:this.effects.find(e=>e.type==='yokai_stance')?.text??null,atmosphere:this.atmosphere.snapshot(),assets:this.assets.snapshot(),swordVfx:this.swordVfx?.snapshot()??{engine:'canvas'},skillVfx:this.skillVfx.snapshot(),masteryVfx:this.masteryVfx.snapshot()};}
}
