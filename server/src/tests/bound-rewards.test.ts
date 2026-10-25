import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {applyInventory,applyTrade,loadGameData,starterInventory,stackItemId} from '@the-beginning-online/shared';
import {MemoryStore} from '../store/memory.js';
import {PostgresStore} from '../store/postgres.js';
const data=loadGameData(),profile={...data.stats.defaultBuild,level:20};

test('gift stacks stay separate through loot, storage, trade and use; starter and quest gifts cannot be sold',()=>{
 const profile={...data.stats.defaultBuild,level:2};
 let state={gold:0,inventory:starterInventory(5,randomUUID)};
 assert.ok(state.inventory.items.every(i=>i.bound));
 const run=(op:Parameters<typeof applyInventory>[1])=>state=applyInventory(state,op,profile,data,randomUUID).state;
 for(const i of state.inventory.items.filter(i=>i.location==='bag'))assert.throws(()=>run({op:'sell',id:i.id}),/ผูกมัด/);
 run({op:'levelReward',levels:[1,2]});run({op:'pickup',loot:[{template:'red_small',qty:3}]});
 const gift=stackItemId('red_small','bag',true),normal=stackItemId('red_small');
 assert.equal(state.inventory.items.find(i=>i.id===gift)!.qty,55);
 assert.equal(state.inventory.items.find(i=>i.id===normal)!.qty,3);
 run({op:'store',id:gift,qty:10});run({op:'store',id:normal,qty:2});
 run({op:'retrieve',id:stackItemId('red_small','storage',true),qty:10});
 assert.equal(state.inventory.items.find(i=>i.id===gift)!.qty,55);
 const other={gold:0,inventory:starterInventory(3,randomUUID)};
 assert.throws(()=>applyTrade({state,offer:{items:[{id:gift,qty:1}],gold:0},profile},{state:other,offer:{items:[],gold:0},profile},data),/แลกเปลี่ยนไม่ได้/);
 const traded=applyTrade({state,offer:{items:[{id:normal,qty:1}],gold:0},profile},{state:other,offer:{items:[],gold:0},profile},data);
 assert.equal(traded.b.state.inventory.items.find(i=>i.id===normal)!.qty,1);
 assert.equal(traded.b.state.inventory.items.find(i=>i.id===gift)!.qty,3);
 run({op:'use',id:gift});assert.equal(state.inventory.items.find(i=>i.id===gift)!.qty,54);
 run({op:'quest',reward:[{template:'red_small',qty:2}]});assert.equal(state.inventory.items.find(i=>i.id===gift)!.qty,56);
 for(const i of state.inventory.items.filter(i=>i.bound&&i.location==='bag'))assert.throws(()=>run({op:'sell',id:i.id}),/ผูกมัด/);
});

test('Postgres migration binds historical mixed gifts once and preserves deleted recipients account receipts',{skip:!process.env.PG_TEST_URL},async()=>{
 const admin=new PostgresStore(process.env.PG_TEST_URL!),schema='reward_test_'+randomUUID().replaceAll('-','');
 const url=new URL(process.env.PG_TEST_URL!);url.searchParams.set('options','-csearch_path='+schema);
 const store=new PostgresStore(url.href);
 try{
  await admin.pool.query(`CREATE SCHEMA ${schema}`);await store.init();
  const a=await store.createGuest(randomUUID()),c=await store.createCharacter(a.id,'Migration','migration');await store.inventory(a.id,c.id);
  await store.pool.query('UPDATE tn2_characters SET upgraded_level_rewards=$2 WHERE id=$1',[c.id,[1,5]]);
  await store.deleteCharacter(a.id,c.id);
  // Reconstruct the previous schema and a stack whose first source was a drop, then merged a gift.
  await store.pool.query('DROP TABLE tn2_account_level_rewards');
  await store.pool.query('ALTER TABLE tn2_item_stacks DROP CONSTRAINT tn2_item_stacks_pkey');
  await store.pool.query('ALTER TABLE tn2_item_stacks DROP COLUMN bound');
  await store.pool.query('ALTER TABLE tn2_item_stacks ADD PRIMARY KEY(character_id,template,location)');
  await store.pool.query("INSERT INTO tn2_item_stacks(character_id,template,qty,location,source) VALUES($1,'blue_potion',53,'bag','drop'),($1,'jelly_slime',3,'bag','drop')",[c.id]);
  await store.pool.query("INSERT INTO tn2_ledger(kind,character_id,template,qty,gold_delta,request_id) VALUES('level_reward',$1,'blue_potion',50,0,$2)",[c.id,randomUUID()]);
  await store.pool.query('UPDATE tn2_items SET bound=false WHERE character_id=$1',[c.id]);
  await store.init();
  assert.equal((await store.pool.query("SELECT bound,qty FROM tn2_item_stacks WHERE character_id=$1 AND template='blue_potion'",[c.id])).rows[0].qty,53);
  assert.ok((await store.pool.query("SELECT bound FROM tn2_item_stacks WHERE character_id=$1 AND template='blue_potion'",[c.id])).rows[0].bound);
  assert.equal((await store.pool.query("SELECT bound FROM tn2_item_stacks WHERE character_id=$1 AND template='jelly_slime'",[c.id])).rows[0].bound,false);
  assert.ok((await store.pool.query('SELECT bool_and(bound) AS bound FROM tn2_items WHERE character_id=$1',[c.id])).rows[0].bound);
  await store.pool.query("INSERT INTO tn2_item_stacks(character_id,template,qty,location,source,bound) VALUES($1,'blue_potion',3,'bag','drop',false)",[c.id]);
  await store.init();assert.equal((await store.pool.query("SELECT count(*)::int AS n FROM tn2_item_stacks WHERE character_id=$1 AND template='blue_potion'",[c.id])).rows[0].n,2);
  const next=await store.createCharacter(a.id,'NewRecipient','newrecipient');
  assert.deepEqual((await store.inventory(a.id,next.id)).claimedLevelRewards,[1,5]);
  assert.ok((await store.inventoryOp(a.id,next.id,randomUUID(),{op:'levelReward',levels:[1]},{profile})).error);
 }finally{await store.close();await admin.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.close();}
});

test('gift upgrade materials cannot be laundered into tradable equipment',()=>{
 let state={gold:10000,inventory:starterInventory(0,randomUUID)};
 state=applyInventory(state,{op:'pickup',loot:[{template:'training_sword',qty:1}]},profile,data,randomUUID).state;
 const sword=state.inventory.items.find(i=>i.template==='training_sword'&&!i.bound)!;
 state=applyInventory(state,{op:'quest',reward:[{template:'weapon_stone',qty:1}]},profile,data,randomUUID).state;
 state=applyInventory(state,{op:'refine',id:sword.id,roll:0},profile,data,randomUUID).state;
 assert.equal(state.inventory.items.find(i=>i.id===sword.id)!.bound,true);
 assert.throws(()=>applyInventory(state,{op:'sell',id:sword.id},profile,data,randomUUID),/ผูกมัด/);
});

for(const backend of ['memory','postgres'] as const)test(`${backend}: account rewards survive delete/recreate and concurrent claims; bound stacks survive persistence`,{skip:backend==='postgres'&&!process.env.PG_TEST_URL},async()=>{
 let store=backend==='memory'?new MemoryStore():new PostgresStore(process.env.PG_TEST_URL!);
 try{
  await store.init();const a=await store.createGuest(randomUUID()),suffix=randomUUID().slice(0,6);
  const create=async(name:string)=>{const c=await store.createCharacter(a.id,name+suffix,(name+suffix).toLowerCase());await store.saveProgress(a.id,c.id,{...c,level:5});return c;};
  const first=await create('GiftA'),second=await create('GiftB');
  const claim=(id:string,levels:number[])=>store.inventoryOp(a.id,id,randomUUID(),{op:'levelReward',levels},{profile});
  const results=await Promise.all([claim(first.id,[1,5]),claim(second.id,[1,5])]);assert.equal(results.filter(r=>!r.error).length,1);
  assert.equal(results.reduce((sum,r)=>sum+r.gold,0),5000);
  const winner=results[0].error?second:first,loser=winner===first?second:first;
  const before=await store.inventory(a.id,winner.id);assert.ok(before.inventory.items.every(i=>i.bound));
  const run=(op:Parameters<typeof store.inventoryOp>[3])=>store.inventoryOp(a.id,winner.id,randomUUID(),op,{profile});
  assert.ok((await run({op:'sell',id:stackItemId('exp_boost_scroll','bag',true)})).error);
  assert.equal((await run({op:'pickup',loot:[{template:'red_small',qty:3}]})).error,undefined);
  assert.equal((await run({op:'store',id:stackItemId('red_small','bag',true),qty:2})).error,undefined);
  assert.equal((await run({op:'store',id:'stack:red_small',qty:1})).error,undefined);
  if(backend==='postgres'){await store.close();store=new PostgresStore(process.env.PG_TEST_URL!);await store.init();await store.init();}
  const persisted=await store.inventory(a.id,winner.id);
  for(const bound of [false,true])assert.ok(persisted.inventory.items.some(i=>i.id===stackItemId('red_small','storage',bound)&&i.bound===bound));
  const receiver=await store.createGuest(randomUUID()),collector=await store.createCharacter(receiver.id,'Keep'+suffix,('Keep'+suffix).toLowerCase());
  const trade=await store.trade({accountId:a.id,id:winner.id,profile,offer:{gold:0,items:[{id:stackItemId('exp_boost_scroll','bag',true),qty:1}]}},{accountId:receiver.id,id:collector.id,profile,offer:{gold:0,items:[]}},{tradeId:randomUUID()});assert.ok(trade.error);
  await store.deleteCharacter(a.id,winner.id);const recreated=await create('GiftC');
  assert.deepEqual((await store.inventory(a.id,recreated.id)).claimedLevelRewards,[1,5]);assert.ok((await claim(recreated.id,[1,5])).error);assert.ok((await claim(loser.id,[5])).error);
  assert.equal((await claim(recreated.id,[2])).error,undefined);
  assert.ok((await store.inventory(a.id,recreated.id)).inventory.items.every(i=>i.bound));
 }finally{await store.close();}
});
