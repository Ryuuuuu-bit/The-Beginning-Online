import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGameData,deriveStats,refineKind,refineBonusValue,refineModifiers,refineMilestones,refineStatCaps,refineCapLines,WeaponSchema,IntentSchema,REFINE_TABLE,rollEquipment,validateItemRoll,inventoryProfile,computeDamage,monsterStats,type OwnedItem} from '../src/index.node.js';
const data=loadGameData(),profile={...data.stats.defaultBuild,level:100};

test('every card has useful passive stats and combines with its existing equipment slot',()=>{
 assert.equal(data.cards.cards.length,111);
 for(const card of data.cards.cards){
  assert.ok(card.modifiers.length>=2,card.id);
  const gear=data.items.items.find(t=>t.type===card.slot&&t.slots>0)!;
  assert.ok(gear,card.id);
  const base=deriveStats({...profile,equipment:[gear.id]},data),worn=deriveStats({...profile,equipment:[gear.id],cards:[card.id]},data);
  assert.notDeepEqual(worn,base,card.id);
  assert.ok(worn.castMul>=1-data.stats.caps.maxCastReduction,card.id);
  assert.ok(worn.crit<=data.stats.caps.maxCrit,card.id);
 }
});

test('each supported weapon type has distinct milestones at 5, 10 and 15',()=>{
 const signatures=new Set<string>(),base=data.items.items.find(t=>t.id==='training_sword')!;
 for(const weaponType of WeaponSchema.options){
  const t={...base,weaponType},milestones=refineMilestones(t);
  assert.deepEqual([...new Set(milestones.map(m=>m.level))],[5,10,15]);assert.equal(milestones.length,6);
  signatures.add(JSON.stringify(milestones));assert.ok(refineCapLines(t,15,data).length,weaponType);
 }
 assert.equal(signatures.size,WeaponSchema.options.length);
});

test('weapon cap tiers unlock at their exact threshold and preserve global damage protections',()=>{
 for(const [level,lift]of [[4,0],[5,.03],[9,.03],[10,.05],[14,.05],[15,.08]]){
  const bow=refineStatCaps('bow',level,data),staff=refineStatCaps('staff',level,data);
  assert.ok(Math.abs(bow.maxCrit-(.6+lift))<1e-9);assert.ok(Math.abs(staff.maxCastReduction-(.5+lift))<1e-9);
  for(const caps of [bow,staff]){assert.equal(caps.maxDamageReductionTotal,.8);assert.equal(caps.maxDefReduction,.7);assert.equal(caps.maxElementResist,.5);}
 }
 assert.equal(refineStatCaps('dagger',15,data).maxAspdMultiplier,2.5);
 assert.ok(Math.abs(refineStatCaps('unarmed',10,data).maxAspdMultiplier-2.4)<1e-9);
 assert.equal(refineStatCaps('sword2h',15,data).maxBonusPerCategory,1.3);
});

test('real worn stats and crit rolls use the unlocked cap, while bag items and forged projection fields cannot grant it',()=>{
 const t=data.items.items.find(t=>t.weaponType==='bow')!,mods=[{kind:'flat' as const,stat:'crit' as const,value:10}],base={...profile,classId:'archer',modifiers:mods,weaponRefine:15};
 const item:OwnedItem={id:'bow',template:t.id,qty:1,location:'equip',slot:'weapon',refine:15,cards:[],bound:true,source:'test'};
 const stats=(i:OwnedItem)=>deriveStats(inventoryProfile(base,{version:1,autoPickup:true,items:[i]},data),data);
 const worn=stats(item),bag=stats({...item,location:'bag',slot:null});assert.ok(Math.abs(worn.crit-.68)<1e-9);assert.equal(bag.crit,.6);
 const enemy=monsterStats(data.monsters.monsters[0],data),skill=data.skills.skills.find(s=>s.id==='basic')!;
 assert.ok(Math.abs(computeDamage(worn,enemy,skill,{rng:()=>.5},data).breakdown.critChance-.68)<1e-9);
 assert.ok(Math.abs(stats({...item,refine:9}).crit-.63)<1e-9);
 assert.equal(IntentSchema.safeParse({t:'inv',op:'refine',req:'123e4567-e89b-42d3-a456-426614174000',id:'bow',weaponRefine:15}).success,false);
});

test('all Unique items gain their fixed identity without changing saved affix rolls',()=>{
 const uniques=data.items.items.filter(t=>t.id.startsWith('unique_'));assert.equal(uniques.length,20);
 for(const t of uniques){
  assert.ok(t.modifiers.length>=3,t.id);
  for(const rng of [()=>0,()=>.999999]){const roll=rollEquipment(t.id,t.level,data,rng)!;assert.deepEqual(validateItemRoll(t.id,JSON.parse(JSON.stringify(roll)),data),roll);}
 }
 const mage=data.items.items.find(t=>t.id==='unique_ember_robe')!;assert.ok(mage.modifiers.some(m=>m.kind==='percent'&&m.stat==='matk'&&m.value>=.1));
 const healer=data.items.items.find(t=>t.id==='unique_lotus_vow')!;assert.ok(healer.modifiers.some(m=>m.kind==='percent'&&m.stat==='spRegen'&&m.value>=.3));
});

test('every refine step improves gear and high bands are worth substantially more than the old linear bonuses',()=>{
 for(const t of data.items.items.filter(t=>refineKind(t))){
  let previous=0;for(let level=1;level<=15;level++){const value=refineBonusValue(t,level);assert.ok(value>previous,`${t.id} +${level}`);previous=value;}
  assert.ok(refineBonusValue(t,10)>=17,t.id);assert.ok(refineBonusValue(t,15)>=34,t.id);
 }
 const t=data.items.items.find(t=>t.id==='crystal_sword')!;
 assert.ok(refineBonusValue(t,10)>=Math.round(t.atk!*.04*10)*2);
 assert.ok(refineBonusValue(t,15)>=Math.round(t.atk!*.04*15)*2);
 assert.equal(REFINE_TABLE[9].chance,.12);assert.equal(REFINE_TABLE[14].chance,.15);
 for(const level of [10,15])assert.ok(refineModifiers({refine:level},t).length>1);
});

test('strong refine and racial cards increase real physical damage and unequipping removes their bonuses',()=>{
 const t=data.items.items.find(t=>t.id==='crystal_sword')!,card=data.cards.cards.find(c=>c.id==='card_pebble_puff')!;
 const stats=(refine:number,worn=true)=>{const item:OwnedItem={id:'blade',template:t.id,qty:1,location:worn?'equip':'bag',slot:worn?'weapon':null,refine,cards:[card.id],bound:true,source:'test'};return deriveStats(inventoryProfile(profile,{version:1,autoPickup:true,items:[item]},data),data);};
 const enemy=monsterStats(data.monsters.monsters.find(m=>m.id==='crag_slime')!,data),skill=data.skills.skills.find(s=>s.id==='basic')!;
 const damage=(refine:number)=>computeDamage(stats(refine),enemy,skill,{rng:()=>.5},data).damage;
 assert.ok(damage(10)>damage(0));assert.ok(damage(15)>damage(10));
 assert.deepEqual(stats(15,false),deriveStats(inventoryProfile(profile,{version:1,autoPickup:true,items:[]},data),data));
});
