import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGameData,deriveStats,inventoryProfile,refineBase,refineBonusValue,refineKind,createGame,spawn,action,step,resolveSkill,computeDamage,monsterStats,type OwnedItem,type Inventory} from '../src/index.node.js';
import {refreshStats} from '../src/game/sim.js';
import {lootEvadedWarning} from '../src/game/loot-effects.js';
const data=loadGameData();
const owned=(template:string,refine=0,extra:Partial<OwnedItem>={}):OwnedItem=>({id:template,template,qty:1,location:'equip',slot:'weapon',refine,cards:[],bound:false,source:'test',...extra});
const inventory=(...items:OwnedItem[]):Inventory=>({version:1,autoPickup:true,items});
const profile={...data.stats.defaultBuild,level:100,equipment:[],cards:[],classId:'mage',skills:{}};
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('all weapon templates refine their primary damage stat and reach every matching damage skill formula',()=>{
 const defender=monsterStats(data.monsters.monsters[0],data);
 for(const t of data.items.items.filter(t=>t.type==='weapon'&&refineKind(t))){
  const magic=(t.matk??0)>(t.atk??0),stat=magic?'matk':'atk',classId=data.classes.classes.find(c=>c.weapons.includes(t.weaponType!))?.id;
  assert.equal(refineBase(t).stat,stat,t.id);
  if(!classId)continue; // Legacy dagger has no playable class; do not bypass equipment validation.
  const build={...profile,classId},base=deriveStats(inventoryProfile(build,inventory(owned(t.id)),data),data),plus=deriveStats(inventoryProfile(build,inventory(owned(t.id,15)),data),data);
  assert.equal(refineBase(t).stat,stat,t.id);
  assert.ok(plus[stat]>=base[stat]+refineBonusValue(t,15),t.id);
  for(const skill of data.skills.skills.filter(s=>!s.passive&&s.percent>0&&s.type===(magic?'magic':'physical'))){
   const before=computeDamage(base,defender,skill,{rng:()=>.5},data),after=computeDamage(plus,defender,skill,{rng:()=>.5},data);
   assert.ok(after.breakdown.base>before.breakdown.base,`${t.id}: ${skill.id}`);
  }
 }
});
function spellFixture(refine:number,ray=false,dex=3){
 const g=createGame(8,{...profile,baseStats:{...profile.baseStats,dex}},'mage',data);g.enemies=[];
 const p=g.p;p.jobId='mage';p.skills={basic:1,fire_bolt:1};p.inventory=inventory(owned('wood_staff',refine));
 if(ray){const armour=data.items.items.find(t=>t.type==='armour'&&t.slots>0)!;p.inventory.items.push(owned(armour.id,0,{slot:'body',cards:['card_astral_orbital_ray']}));}
 refreshStats(g,p);Object.assign(p,{x:0,z:4,mp:10000,maxMp:10000});
 const e=spawn(g,0,7);e.hp=e.maxHp=1000000;e.cooldown=e.wander=999;e.wx=e.x;e.wz=e.z;g.random=()=>.5;
 if(ray)lootEvadedWarning(p,g);
 return {g,p,e};
}
test('real magic casts combine refine, DEX and one-use card reduction, with matching impact and animation timing',()=>{
 for(const ray of [false,true]){
  const{g,p,e}=spellFixture(10,ray),skill=resolveSkill(data,'fire_bolt',1);
  const expected=skill.cast*p.stats.castMul*(ray?.95:1),hp=e.hp;
  assert.ok(action(g,'fire_bolt'));close(p.castRemaining,expected);close(g.meteors[0].time,expected);
  close(g.events.find(e=>e.type==='skill'&&e.skillId==='fire_bolt')!.duration as number,expected);
  assert.equal(p.cd.fire_bolt,skill.cooldown,'cast reduction does not reduce cooldown');
  let elapsed=0;while(elapsed+.01<expected-1e-7){step(g,.01);elapsed+=.01;}
  assert.equal(e.hp,hp,'no damage before the cast completes');step(g,.02);assert.ok(e.hp<hp,'damage resolves at the reduced cast time');
  p.cd.fire_bolt=0;p.castRemaining=0;assert.ok(action(g,'fire_bolt'));close(p.castRemaining,skill.cast*p.stats.castMul);
 }
 const base=spellFixture(0),plus=spellFixture(10);assert.ok(action(base.g,'fire_bolt'));assert.ok(action(plus.g,'fire_bolt'));
 assert.ok(plus.p.castRemaining<base.p.castRemaining);
 step(base.g,1);step(plus.g,1);assert.ok(plus.e.maxHp-plus.e.hp>base.e.maxHp-base.e.hp,'refined MATK raises actual spell damage');
});
test('cast reduction caps hold with DEX, refine and the ray card stacked',()=>{
 const{g,p}=spellFixture(15,true,10000);assert.ok(action(g,'fire_bolt'));
 close(p.castRemaining,resolveSkill(data,'fire_bolt',1).cast*.42);
});
test('every current cast-time skill uses derived casting speed and the same impact delay',()=>{
 for(const skill of data.skills.skills.filter(s=>!s.passive&&s.cast>0)){
  const g=createGame(8,{...profile,classId:skill.jobId,equipment:data.mastery.skills.some(s=>s.id===skill.id&&s.school==='Swordsman')?['training_sword']:[]},'caster',data);g.enemies=[];Object.assign(g.p,{jobId:skill.jobId,skills:{[skill.id]:1},x:0,z:4,mp:10000,maxMp:10000});g.p.masteries.Swordsman=100;g.p.stats.castMul=.8;
  const e=spawn(g,0,5);e.cooldown=e.wander=999;g.target=e.id;
  assert.ok(action(g,skill.id),skill.id);const actual=resolveSkill(data,skill.id,1);
  close(g.p.castRemaining,actual.cast*.8);close(g.meteors[0].time,actual.cast*.8);
 }
});
test('defence milestones add real protection even with zero base MDEF, and unequipping removes it',()=>{
 for(const [id,slot,threshold,mdef] of [['wood_shield','shield',15,20],['leaf_cloak','garment',10,15]] as const){
  const statAt=(level:number)=>deriveStats(inventoryProfile(profile,inventory(owned(id,level,{slot})),data),data);
  const before=statAt(threshold-1),after=statAt(threshold);assert.equal(before.hardMdef,0);assert.equal(after.hardMdef,mdef);
  const magic=data.skills.skills.find(s=>s.type==='magic'&&s.percent>0)!;
  const attacker={...deriveStats(profile,data),matk:10000};
  assert.ok(computeDamage(attacker,after,magic,{rng:()=>.5},data).damage<computeDamage(attacker,before,magic,{rng:()=>.5},data).damage);
  const unequipped=deriveStats(inventoryProfile(profile,inventory(owned(id,threshold,{location:'bag',slot:null})),data),data);assert.equal(unequipped.hardMdef,0);
 }
});

test('a single-target cast follows only its original living in-range target and never hits a replacement',()=>{
 for(const outcome of ['moved','dead','out-of-range']){
  const{g,e}=spellFixture(10);const other=spawn(g,0,7);other.hp=other.maxHp=1000000;other.cooldown=other.wander=999;
  g.target=e.id;assert.ok(action(g,'fire_bolt'));
  if(outcome==='moved'){e.x=1;e.wx=e.x;}else if(outcome==='dead'){e.dead=true;e.respawn=999;}else{e.x=30;e.wx=e.x;}
  step(g,1);assert.equal(other.hp,other.maxHp);
  assert.equal(e.hp<e.maxHp,outcome==='moved',outcome);
 }
});
