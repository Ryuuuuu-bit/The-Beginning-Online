import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadGameData,starterInventory,applyInventory,IntentSchema,type InventoryOp} from '../src/index.js';
const data=loadGameData(),profile=data.stats.defaultBuild;
function fixture(){let n=0;const inventory=starterInventory(10,()=>`item-${++n}`);inventory.items=inventory.items.map(i=>({...i,id:i.id.replace("stack:bound:","stack:"),bound:false,source:"drop"}));return {inventory,gold:1000};}
test('a mixed sale removes only chosen quantities and credits exact ledger values atomically',()=>{
 const before=fixture(),potion=before.inventory.items.find(i=>i.template==='red_small')!,weapon=before.inventory.items.find(i=>i.location==='bag'&&i.template==='training_sword')!;
 const items=[{id:potion.id,qty:3},{id:weapon.id,qty:1}];
 const result=applyInventory(before,{op:'sell',items},profile,data,randomUUID);
 assert.equal(result.state.inventory.items.find(i=>i.id===potion.id)!.qty,7);
 assert.ok(!result.state.inventory.items.some(i=>i.id===weapon.id));
 const expected=items.reduce((sum,row)=>sum+Math.floor(data.items.items.find(t=>t.id===before.inventory.items.find(i=>i.id===row.id)!.template)!.npcPrice*data.economy.sellMultiplier)*row.qty,0);
 assert.equal(result.state.gold,before.gold+expected);assert.equal(result.ledger.reduce((sum,row)=>sum+row.goldDelta,0),expected);
 assert.equal(potion.qty,10);
 for(const bad of [0,-1,1.5,NaN,Infinity,99999,11])assert.throws(()=>applyInventory(before,{op:'sell',items:[items[1],{id:potion.id,qty:bad}]},profile,data,randomUUID));
 assert.equal(before.inventory.items.find(i=>i.id===weapon.id)!.qty,1);
});
test('batch sale rejects duplicate, bound, equipped and foreign items without mutating inventory',()=>{
 const state=fixture(),potion=state.inventory.items.find(i=>i.template==='red_small')!,armour=state.inventory.items.find(i=>i.location==='equip')!;
 for(const items of [[],[{id:potion.id,qty:1},{id:potion.id,qty:1}],[{id:'foreign',qty:1}],[{id:armour.id,qty:1}]])assert.throws(()=>applyInventory(state,{op:'sell',items},profile,data,randomUUID));
 potion.bound=true;const before=structuredClone(state);assert.throws(()=>applyInventory(state,{op:'sell',items:[{id:potion.id,qty:1}]},profile,data,randomUUID));assert.deepEqual(state,before);
 for(const op of [{op:'sell',id:potion.id,items:[{id:potion.id,qty:1}]},{op:'discard',items:[{id:potion.id,qty:1}]}])assert.throws(()=>applyInventory(state,op as InventoryOp,profile,data,randomUUID));
});
test('sale network quantities are bounded and cannot contain client prices',()=>{
 const packet={t:'inv',op:'sell',req:randomUUID(),shop:'market',items:[{id:'owned',qty:3}]};assert.ok(IntentSchema.safeParse(packet).success);
 for(const qty of [0,-1,1.2,10000,NaN])assert.equal(IntentSchema.safeParse({...packet,items:[{id:'owned',qty}]}).success,false);
 assert.equal(IntentSchema.safeParse({...packet,items:[{id:'owned',qty:1,price:999}]}).success,false);
 assert.equal(IntentSchema.safeParse({...packet,items:Array(101).fill({id:'owned',qty:1})}).success,false);
});
test('legacy full-stack sales still accept stored stacks above the per-request quantity limit',()=>{
 const state=fixture(),potion=state.inventory.items.find(i=>i.template==='red_small')!;potion.qty=12000;
 const result=applyInventory(state,{op:'sell',ids:[potion.id]},profile,data,randomUUID);
 assert.ok(!result.state.inventory.items.some(i=>i.id===potion.id));assert.equal(result.ledger[0].qty,12000);
});
test('forge sells Common starter weapons for every current weapon class at configured prices',()=>{
 for(const id of ['training_sword','training_greatsword','training_knuckles','reed_dagger','wood_staff','bamboo_bow']){
  const price=data.economy.shops.forge[id];assert.ok(price>0,id);const state=fixture();const result=applyInventory(state,{op:'buy',shop:'forge',template:id,qty:1},profile,data,randomUUID);assert.equal(result.state.gold,state.gold-price);
 }
});
