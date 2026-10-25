import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGameData,validateGameData,rollDrops,applyInventory,LAYOUTS,FIELD_BOSS,THORN_NEST,FORGE_FRAGMENT} from '../src/index.node.js';
const data=loadGameData();

test('drop references require physical items, and card items require effects in both directions',()=>{
 const missing=structuredClone(data);
 missing.items.items=missing.items.items.filter(i=>i.id!=='card_king_jelly');
 assert.throws(()=>validateGameData(missing),/monsters.json:.*unknown item card_king_jelly/);
 const noEffects=structuredClone(data);
 noEffects.cards.cards=noEffects.cards.cards.filter(c=>c.id!=='card_king_jelly');
 assert.throws(()=>validateGameData(noEffects),/items.json: card_king_jelly: missing card effects/);
 const wrongType=structuredClone(data);
 wrongType.items.items.find(i=>i.id==='card_king_jelly')!.type='material';
 assert.throws(()=>validateGameData(wrongType),/cards.json: card_king_jelly: missing card item/);
});

test('every material and card has a live drop or earned source; every monster table rolls and can be picked up intact',()=>{
 const live=new Set([...Object.values(LAYOUTS).flatMap(m=>m.spawns.map(s=>s.dataId)),...Object.values(FIELD_BOSS).map(b=>b.dataId),THORN_NEST.dataId]);
 const dropped=new Set<string>();let id=0;
 for(const m of data.monsters.monsters){
  assert.equal(new Set(m.drops.map(d=>d.item)).size,m.drops.length,`${m.id}: duplicate drop`);
  for(const d of m.drops){assert.ok(d.rate>0,`${m.id}/${d.item}: unreachable drop`);if(live.has(m.id))dropped.add(d.item);}
  const loot=rollDrops(m,()=>0,data);
  assert.deepEqual(new Set(loot.map(d=>d.template)),new Set(m.drops.map(d=>d.item)),m.id);
  const profile={...data.stats.defaultBuild,level:100};
  const state={gold:0,inventory:{version:1 as const,autoPickup:true,items:[]}};
  const out=applyInventory(state,{op:'pickup',loot},profile,data,()=>String(++id));
  for(const template of new Set(loot.map(d=>d.template)))assert.equal(out.state.inventory.items.filter(i=>i.template===template).reduce((n,i)=>n+i.qty,0),loot.filter(d=>d.template===template).reduce((n,d)=>n+d.qty,0),`${m.id}/${template}: pickup`);
  assert.deepEqual(state.inventory.items,[],`${m.id}: input state unchanged`);
 }
 for(const i of data.items.items.filter(i=>i.type==='material'||i.type==='card')){
  if(i.id===FORGE_FRAGMENT){
   assert.equal(i.bind,'account');assert.equal(dropped.has(i.id),false);
   assert.ok(data.quests.quests.some(q=>q.rewards.items.some(reward=>reward.template===i.id&&reward.qty>0)),`${i.id}: no earned source`);
  }else assert.ok(dropped.has(i.id),`${i.id}: no drop source`);
 }
});

test('material and card drop thresholds include bonuses, auto penalties and inclusive quantity bounds',()=>{
 for(const m of data.monsters.monsters)for(const d of m.drops){
  const item=data.items.items.find(i=>i.id===d.item)!;
  if(item.type!=='material'&&item.type!=='card')continue;
  for(const [seconds,bonus] of [[0,0],[0,.5],[data.economy.autoRareAfterSeconds,0],[data.economy.autoRareAfterSeconds+1,0]]){
   const rare=['rare','epic','legendary'].includes(item.rarity);
   const rate=Math.min(1,d.rate*data.economy.dropMultiplier*(item.type==='card'?data.economy.cardDropMultiplier:1)*(1+bonus)*(rare&&seconds>data.economy.autoRareAfterSeconds?data.economy.autoRareMultiplier:1));
   const monster={...m,drops:[d]};let calls=0;
   const roll=(chance:number,quantity:number)=>{calls=0;return rollDrops(monster,()=>calls++===0?chance:quantity,data,seconds,bonus);};
   if(rate<1)assert.deepEqual(roll(rate,0),[],`${m.id}/${d.item}: exclusive threshold`);
   assert.equal(roll(rate-Number.EPSILON,0)[0]?.qty,d.min,`${m.id}/${d.item}: minimum`);
   assert.equal(roll(rate-Number.EPSILON,1-Number.EPSILON)[0]?.qty,d.max,`${m.id}/${d.item}: maximum`);
  }
 }
});
