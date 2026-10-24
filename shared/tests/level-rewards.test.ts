import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadGameData,levelReward,validateRewardLevels,applyInventory,starterInventory} from '../src/index.node.js';
const data=loadGameData();

test('level mail supplies stay within the early hunting budget and equipment never exceeds its reward level',()=>{
 let gold=0,hp=0;
 for(let level=2;level<=100;level++){
  const reward=levelReward(level,data);assert.equal(reward.gold,level%5===0?(level<50?5000:10000):0);
  for(const item of reward.items){const template=data.items.items.find(i=>i.id===item.template)!;assert.ok(template);assert.ok(template.level<=level);if(level<=20&&template.effect==='hp')hp+=item.qty;}
  if(level<=20)gold+=reward.gold;
 }
 assert.equal(gold,20000);assert.equal(hp,1150);
 assert.equal(levelReward(5,data).items[0].template,'red_small');
 assert.equal(levelReward(6,data).items[0].template,'red_medium');
 assert.equal(levelReward(11,data).items[0].template,'red_large');
});

test('retroactive delivery shows fixed contents, binds equipment and ignores injected amounts',()=>{
 const state={gold:0,inventory:starterInventory(0,randomUUID)},before=structuredClone(state),levels=Array.from({length:20},(_,i)=>i+1);
 const out=applyInventory(state,{op:'levelReward',levels,gold:999999,loot:[{template:'eternal_sword',qty:99}]},{...data.stats.defaultBuild,level:20},data,randomUUID);
 assert.equal(out.state.gold,20000);assert.deepEqual(state,before);
 const equipment=out.state.inventory.items.filter(i=>i.source==='level_reward'&&data.items.items.find(t=>t.id===i.template)!.slot);
 assert.deepEqual(equipment.map(i=>i.template),['iron_amulet','sentinel_amulet','relic_amulet']);assert.ok(equipment.every(i=>i.bound));
 assert.throws(()=>applyInventory(out.state,{op:'sell',id:equipment[0].id},data.stats.defaultBuild,data,randomUUID),/ผูกมัด/);
 for(const levels of [[],[0],[101],[2,2],[21],[2.5]])assert.throws(()=>validateRewardLevels(levels,20));
});

test('mail delivery rolls back the whole bundle when the bag is full or gold overflows',()=>{
 const state={gold:0,inventory:starterInventory(0,randomUUID)};
 state.inventory.items=Array.from({length:data.economy.inventorySlots},()=>({id:randomUUID(),template:'training_sword',qty:1,location:'bag' as const,slot:null,refine:0,cards:[],bound:false,source:'test'}));
 const before=structuredClone(state);
 assert.throws(()=>applyInventory(state,{op:'levelReward',levels:[2,3,4,5]},{...data.stats.defaultBuild,level:5},data,randomUUID),/กระเป๋าเต็ม|น้ำหนักเกิน/);assert.deepEqual(state,before);
 assert.throws(()=>applyInventory({gold:2147483647,inventory:starterInventory(0,randomUUID)},{op:'levelReward',levels:[5]},{...data.stats.defaultBuild,level:5},data,randomUUID),/ทองเกิน/);
});
