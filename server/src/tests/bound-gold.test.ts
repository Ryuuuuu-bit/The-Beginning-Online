import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadGameData,applyInventory,applyTrade,starterInventory,IntentSchema} from '@the-beginning-online/shared';
import {MemoryStore} from '../store/memory.js';
import {PostgresStore} from '../store/postgres.js';
const data=loadGameData(),profile={...data.stats.defaultBuild,level:20};

test('ordinary gold remains tradable; reward gold cannot be laundered through NPC purchases or upgrades',()=>{
 const reward=applyInventory({gold:100,inventory:starterInventory(0,randomUUID)},{op:'levelReward',levels:[5]},profile,data,randomUUID).state;
 assert.equal(reward.gold,5100);assert.equal(reward.boundGold,5000);
 const normal=applyInventory(reward,{op:'buy',shop:'forge',template:'training_sword'},profile,data,randomUUID).state;
 assert.equal(normal.boundGold,5000);assert.ok(normal.inventory.items.some(i=>i.source==='npc'&&!i.bound));
 const subsidized=applyInventory(normal,{op:'buy',shop:'forge',template:'training_sword'},profile,data,randomUUID).state;
 assert.equal(subsidized.boundGold,4940);const bought=subsidized.inventory.items.find(i=>i.source==='npc'&&i.bound)!;assert.ok(bought);
 assert.throws(()=>applyInventory(subsidized,{op:'sell',id:bought.id},profile,data,randomUUID),/ผูกมัด/);
 const other={gold:0,inventory:starterInventory(0,randomUUID)},side={state:subsidized,offer:{items:[],gold:1},profile},receiver={state:other,offer:{items:[],gold:0},profile};
 assert.throws(()=>applyTrade(side,receiver,data),/ทองแจก/);
 assert.throws(()=>applyTrade({...side,offer:{items:[{id:bought.id,qty:1}],gold:0}},receiver,data),/แลกเปลี่ยนไม่ได้/);
 const gear=normal.inventory.items.find(i=>i.source==='npc'&&!i.bound)!;
 const material=applyInventory({...normal,gold:5000,boundGold:5000},{op:'pickup',loot:[{template:'weapon_stone',qty:1}]},profile,data,randomUUID).state;
 const refined=applyInventory(material,{op:'refine',id:gear.id,roll:0},profile,data,randomUUID).state;
 assert.equal(refined.inventory.items.find(i=>i.id===gear.id)!.bound,true);
 const old={gold:500,inventory:starterInventory(0,randomUUID)};
 assert.equal(applyTrade({state:old,offer:{items:[],gold:500},profile},receiver,data).b.state.gold,500);
 for(const boundGold of [-1,501,NaN,1.5])assert.throws(()=>applyInventory({...old,boundGold},{op:'settings',on:true},profile,data,randomUUID),/ทองแจก/);
 assert.equal(IntentSchema.safeParse({t:'trade',op:'offer',gold:1,boundGold:0}).success,false);
 const tutorial=applyInventory({gold:0,inventory:starterInventory(0,randomUUID)},{op:'quest',gold:30,boundRewardGold:true},profile,data,randomUUID).state;assert.equal(tutorial.boundGold,30);
 const hunt=applyInventory({gold:0,inventory:starterInventory(0,randomUUID)},{op:'quest',gold:80},profile,data,randomUUID).state;assert.equal(hunt.boundGold,undefined);
 const converted=applyInventory(reward,{op:'quest',loot:[{template:'red_large',qty:1}],gold:30},profile,data,randomUUID).state;assert.equal(converted.boundGold,5030);
 const earnedItems=applyInventory(reward,{op:'pickup',loot:[{template:'red_large',qty:1}]},profile,data,randomUUID).state;const earnedTurnIn=applyInventory(earnedItems,{op:'quest',loot:[{template:'red_large',qty:1}],gold:30},profile,data,randomUUID).state;assert.equal(earnedTurnIn.boundGold,5000);
});

for(const backend of ['memory','postgres'] as const)test(`${backend}: separate accounts cannot funnel reward gold or purchased goods; earned trades and persisted restrictions survive retries`,{skip:backend==='postgres'&&!process.env.PG_TEST_URL},async()=>{
 let store=backend==='memory'?new MemoryStore():new PostgresStore(process.env.PG_TEST_URL!);
 try{
  await store.init();const suffix=randomUUID().slice(0,6),receiver=await store.createGuest(randomUUID()),collector=await store.createCharacter(receiver.id,'Bank'+suffix,('Bank'+suffix).toLowerCase());
  const receive={accountId:receiver.id,id:collector.id,profile,offer:{items:[],gold:0}};
  for(let n=0;n<2;n++){
   const account=await store.createGuest(randomUUID()),c=await store.createCharacter(account.id,'Gold'+n+suffix,('Gold'+n+suffix).toLowerCase());await store.saveProgress(account.id,c.id,{...c,level:5});
   const run=(op:Parameters<typeof store.inventoryOp>[3],req=randomUUID())=>store.inventoryOp(account.id,c.id,req,op,{profile});
   const req=randomUUID(),paid=await run({op:'levelReward',levels:[5]},req);assert.equal(paid.error,undefined);assert.equal(paid.gold,5000);assert.equal(paid.boundGold,5000);
   assert.ok((await run({op:'levelReward',levels:[5]},req)).duplicate);assert.equal((await store.inventory(account.id,c.id)).boundGold,5000);
   const give=(gold:number,items:{id:string;qty:number}[]=[])=>store.trade({accountId:account.id,id:c.id,profile,offer:{gold,items}},receive,{tradeId:randomUUID()});
   assert.match((await give(5000)).error!,/ทองแจก/);
   assert.equal((await run({op:'pickup',gold:100})).error,undefined);
   const race=await Promise.all([give(100),give(100)]);assert.equal(race.filter(r=>!r.error).length,1);
   assert.equal((await store.inventory(account.id,c.id)).gold,5000);assert.equal((await store.inventory(account.id,c.id)).boundGold,5000);
   const purchase=await run({op:'buy',shop:'forge',template:'training_sword'});assert.equal(purchase.error,undefined);assert.equal(purchase.boundGold,4920);
   const bought=purchase.inventory.items.find(i=>i.source==='npc')!;assert.ok(bought.bound);assert.ok((await give(0,[{id:bought.id,qty:1}])).error);assert.ok((await run({op:'sell',id:bought.id})).error);
   await store.saveProgress(account.id,c.id,{...c,level:5,gold:0,boundGold:0} as any);
   if(backend==='postgres'){await store.close();store=new PostgresStore(process.env.PG_TEST_URL!);await store.init();await store.init();}
   const saved=await store.inventory(account.id,c.id);assert.equal(saved.gold,4920);assert.equal(saved.boundGold,4920);assert.deepEqual(saved.inventory.items.sort((a,b)=>a.id.localeCompare(b.id)),purchase.inventory.items.sort((a,b)=>a.id.localeCompare(b.id)));
  }
  assert.equal((await store.inventory(receiver.id,collector.id)).gold,200);
 }finally{await store.close();}
});
