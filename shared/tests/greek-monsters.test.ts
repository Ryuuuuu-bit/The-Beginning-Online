import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,loadGameData,spawn,step,action,LAYOUTS,walkable,rollDrops,refreshStats,tickPlayerLoot,FIELD_HABITATS,FIELD_BOSS,FIELD_PLACES,MAP_ENTRY,GATES,travelDestination,gateRoute,buildForLevel} from '../src/index.node.js';
import {createPathfinder} from '../src/game/pathfinding.js';
const data=loadGameData(),ids=['greek_satyr','greek_harpy','greek_gorgon','greek_minotaur'];
const tick=(g:ReturnType<typeof createGame>,n:number)=>{for(let t=0;t<n;t+=.02)step(g,.02);};
function fixture(id:string){const g=createGame(7,undefined,'greek-test',data,'ruins');g.enemies=[];g.random=()=>.5;g.p.x=0;g.p.z=0;g.p.hp=g.p.maxHp=1000;g.p.invulnerable=0;const e=spawn(g,0,2,false,'pink',false,id);e.cooldown=0;e.aggro=10;return{g,e};}

test('Greek roster has separate habitats, cards, materials and authoritative rolled equipment drops',()=>{
 const materials=new Set<string>();
 for(const id of ids){const m=data.monsters.monsters.find(m=>m.id===id)!;assert.ok(m.tags.includes('greek'));assert.ok(m.level>=30&&m.level<=35);assert.equal(m.artId,id);const maps=Object.entries(LAYOUTS).filter(([,l])=>l.spawns.some(s=>s.dataId===id));assert.equal(maps.length,m.boss?0:1);if(m.boss)assert.equal(createGame(1,undefined,'boss',data,'temple').enemies.find(e=>e.boss)?.dataId,id);for(const [map,l]of maps)for(const s of l.spawns.filter(s=>s.dataId===id))assert.ok(walkable(s.x,s.z,.4,map as any),id);
  const drops=rollDrops(m,()=>0,data);assert.ok(drops.some(d=>d.template==='card_'+id));assert.ok(drops.some(d=>d.template.startsWith('field_')&&d.roll));assert.ok(!drops.some(d=>d.template.startsWith('unique_')));materials.add(m.drops.find(d=>d.item.startsWith('greek_'))!.item);
 }assert.equal(materials.size,4);
});

test('Gorgon gaze is locked, delayed, avoidable and applies a bounded slow instead of an unavoidable stun',()=>{
 const {g,e}=fixture('greek_gorgon');step(g,.02);assert.equal(e.telegraph?.shape,'cone');assert.equal(g.p.hp,1000);tick(g,.9);assert.ok(!g.p.statuses.some(s=>s.sourceId==='greek_gaze'));tick(g,.4);assert.ok(g.p.statuses.some(s=>s.sourceId==='greek_gaze'&&s.value===.5));tick(g,3.2);assert.ok(!g.p.statuses.some(s=>s.sourceId==='greek_gaze'));
 const other=fixture('greek_gorgon');step(other.g,.02);other.g.p.x=4;tick(other.g,1.4);assert.ok(!other.g.p.statuses.some(s=>s.sourceId==='greek_gaze'));
 const interrupted=fixture('greek_gorgon');step(interrupted.g,.02);interrupted.g.p.x=interrupted.e.x;interrupted.g.p.z=interrupted.e.z+1;action(interrupted.g,'earth_break');tick(interrupted.g,.5);assert.equal(interrupted.e.telegraph,undefined);assert.ok(!interrupted.g.p.statuses.some(s=>s.sourceId==='greek_gaze'));
});

test('Greek combat roles retain ranged distance, circling movement and a readable heavy charge',()=>{
 const satyr=fixture('greek_satyr');satyr.g.p.z=-2;step(satyr.g,.02);tick(satyr.g,.8);assert.ok(satyr.g.projectiles.some(p=>p.owner===satyr.e.id));
 const harpy=fixture('greek_harpy');harpy.e.cooldown=2;const before={x:harpy.e.x,z:harpy.e.z};step(harpy.g,.1);assert.notEqual(harpy.e.x,before.x);assert.ok(Math.abs(harpy.e.z-before.z)<.05);
 const mino=fixture('greek_minotaur');mino.e.z=1.8;step(mino.g,.02);assert.equal(mino.e.motion,'attack');assert.equal(mino.e.telegraph?.shape,'cone');const hp=mino.g.p.hp;tick(mino.g,1.6);assert.equal(mino.g.p.hp,hp);tick(mino.g,.3);assert.ok(mino.g.p.hp<hp);assert.ok(mino.g.events.some(e=>e.type==='warning'));
});

test('Greek cards change their own stats or recover slow and stop affecting the player when removed',()=>{
 const {g}=fixture('greek_satyr'),p=g.p;
 const gear=[['field_ring','accessory1','card_greek_satyr'],['field_cloak','garment','card_greek_harpy'],['field_shield','shield','card_greek_gorgon'],['field_sword','weapon','card_greek_minotaur']];
 p.inventory={items:gear.map(([template,slot,card],i)=>({id:'greek-'+i,template,slot,cards:[],location:'equip',qty:1,refine:0,bound:false,source:'test'}))} as any;refreshStats(g,p);const before=structuredClone(p.stats);
 p.inventory!.items.forEach((item,i)=>item.cards=[gear[i][2]]);refreshStats(g,p);assert.ok(Math.abs(p.stats.spRegen-before.spRegen-.2)<1e-8);assert.ok(Math.abs(p.stats.elementResist.wind-before.elementResist.wind-.15)<1e-8);assert.ok(Math.abs((p.stats.sizeBonus.large??0)-(before.sizeBonus.large??0)-.1)<1e-8);
 p.statuses=[{id:'slow',sourceId:'test',remaining:3,value:.5}];tickPlayerLoot(g,p,1);assert.equal(p.statuses[0].remaining,2.75);
 p.inventory!.items.forEach(item=>item.cards=[]);refreshStats(g,p);assert.deepEqual(p.stats,before);tickPlayerLoot(g,p,1);assert.equal(p.statuses[0].remaining,2.75);
});


test('Greek temple is connected beyond summit, has reachable courts and preserves a quiet entry',()=>{
 const map='temple',layout=LAYOUTS.temple,entry=MAP_ENTRY.temple;assert.equal(layout.spawns.length,36);
 const path=createPathfinder((x,z)=>walkable(x,z,.4,map),layout);
 for(const p of [...layout.camps,...FIELD_HABITATS.temple,...FIELD_PLACES.temple,FIELD_BOSS.temple]){assert.ok(walkable(p.x,p.z,.4,map),JSON.stringify(p));assert.ok(path.findPath(entry,p).length,JSON.stringify(p));}
 assert.ok(layout.spawns.every(s=>Math.hypot(s.x-entry.x,s.z-entry.z)>10));
 const gate=GATES.summit.west,dest=travelDestination('summit','west',gate)!;assert.equal(dest.mapId,map);assert.ok(walkable(dest.x,dest.z,.4,map));
 assert.equal(travelDestination(map,'east',GATES.temple.east)?.mapId,'summit');assert.equal(gateRoute('city_plaza',map).at(-1)?.map,'summit');assert.equal(travelDestination('summit','west',{...gate,dead:true}),null);
 const g=createGame(7,buildForLevel('swordsman',40,data),'entry',data,map),e=g.enemies.find(e=>e.dataId==='greek_satyr')!;g.enemies=[e];g.random=()=>.5;g.p.x=e.x;g.p.z=e.z+1.2;g.target=e.id;
 for(let i=0;i<2400&&!e.dead&&!g.p.dead;i++){action(g,'attack');step(g,.05);}assert.ok(e.dead);assert.equal(g.p.dead,false);
});
