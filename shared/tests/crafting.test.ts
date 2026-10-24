import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadGameData,applyInventory,starterInventory,inventorySlots,salvageQuote,craftQuote,CRAFT_RECIPES,IntentSchema,type OwnedItem} from '../src/index.node.js';
const data=loadGameData(),profile=data.stats.defaultBuild;
const gear:OwnedItem={id:randomUUID(),template:'training_sword',qty:1,location:'bag',slot:null,refine:0,cards:[],bound:false,source:'drop'};

test('salvage protects starter/mail, worn and carded gear and converts real gear atomically',()=>{
 for(const source of ['migration','level_reward','quest','admin'])assert.equal(typeof salvageQuote({...gear,source},data),'string');
 for(const patch of [{location:'equip' as const},{cards:['card_jelly_pink']}])assert.equal(typeof salvageQuote({...gear,...patch},data),'string');
 const state={gold:0,inventory:{version:1 as const,items:[gear],autoPickup:true}},before=structuredClone(state);
 const out=applyInventory(state,{op:'salvage',id:gear.id},profile,data,randomUUID);
 assert.deepEqual(state,before);assert.equal(out.state.inventory.items.length,1);
 assert.equal(out.state.inventory.items[0].template,'forge_fragment');assert.equal(out.state.inventory.items[0].qty,1);assert.equal(out.state.inventory.items[0].bound,true);
 assert.deepEqual(out.ledger.map(e=>e.qty),[-1,1]);
 assert.throws(()=>applyInventory(state,{op:'salvage',id:gear.id,qty:2},profile,data,randomUUID));assert.deepEqual(state,before);
});

test('craft uses closed server prices and rolls back materials/gold when capacity is exceeded',()=>{
 const inventory=starterInventory(5,randomUUID);
 inventory.items.push({id:'stack:forge_fragment',template:'forge_fragment',qty:16,location:'bag',slot:null,refine:0,cards:[],bound:true,source:'quest'});
 const state={inventory,gold:1000},before=structuredClone(state);
 const out=applyInventory(state,{op:'craft',template:'weapon_stone',gold:0},profile,data,randomUUID);
 assert.equal(out.state.gold,900);assert.equal(out.state.inventory.items.find(i=>i.template==='forge_fragment')!.qty,8);
 assert.equal(out.state.inventory.items.find(i=>i.template==='weapon_stone')!.qty,1);assert.deepEqual(state,before);
 const full=structuredClone(data);full.economy.inventorySlots=inventorySlots(inventory,data);
 assert.throws(()=>applyInventory(state,{op:'craft',template:'weapon_stone'},profile,full,randomUUID),/กระเป๋าเต็ม/);assert.deepEqual(state,before);
 for(const op of [{op:'craft' as const,template:'weapon_stone',qty:2},{op:'craft' as const,template:'training_sword'}])assert.throws(()=>applyInventory(state,op,profile,data,randomUUID));
 assert.throws(()=>craftQuote('exp_boost_scroll'));
 for(const message of [{t:'inv',op:'craft',template:'weapon_stone',gold:0},{t:'inv',op:'salvage',id:gear.id,fragments:999}])assert.equal(IntentSchema.safeParse({...message,req:randomUUID()}).success,false);
});

test('buying equipment to salvage and craft cannot create NPC sale profit',()=>{
 const value=Math.max(...CRAFT_RECIPES.map(r=>(Math.floor(data.items.items.find(t=>t.id===r.template)!.npcPrice*data.economy.sellMultiplier)-r.gold)/r.fragments));
 for(const [id,price] of Object.entries(data.economy.shops.forge)){
  const qty=salvageQuote({...gear,template:id,source:'npc'},data);
  if(typeof qty==='number')assert.ok(qty*value<=price,`${id} creates gold`);
 }
});
