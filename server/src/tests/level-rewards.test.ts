import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadGameData,IntentSchema} from '@the-beginning-online/shared';
import {MemoryStore} from '../store/memory.js';
import {PostgresStore} from '../store/postgres.js';
const data=loadGameData(),profile={...data.stats.defaultBuild,level:20};

for(const backend of ['memory','postgres'] as const)test(`${backend}: level mail is retroactive, atomic, owner-scoped and cannot be reclaimed by stale saves or new requests`,{skip:backend==='postgres'&&!process.env.PG_TEST_URL},async()=>{
 let store=backend==='memory'?new MemoryStore():new PostgresStore(process.env.PG_TEST_URL!);
 try{
  await store.init();const account=await store.createGuest(randomUUID()),suffix=randomUUID().slice(0,8),character=await store.createCharacter(account.id,'Mail'+suffix,('Mail'+suffix).toLowerCase());
  const stale={...character,level:20,claimedLevelRewards:[]};await store.saveProgress(account.id,character.id,stale);
  const run=(levels:number[],req=randomUUID())=>store.inventoryOp(account.id,character.id,req,{op:'levelReward',levels,gold:999999},{profile});
  const before=await store.inventory(account.id,character.id);
  assert.ok((await run([21])).error);assert.deepEqual(await store.inventory(account.id,character.id),before);
  const req=randomUUID(),results=await Promise.all([run([2,3,4,5],req),run([2,3,4,5])]);assert.equal(results.filter(r=>!r.error).length,1);
  const claimed=await store.inventory(account.id,character.id);assert.deepEqual(claimed.claimedLevelRewards,[2,3,4,5]);assert.equal(claimed.gold,52);
  assert.ok((await run([2],randomUUID())).error);assert.ok((await run([2,6])).error);assert.deepEqual(await store.inventory(account.id,character.id),claimed);
  await store.saveProgress(account.id,character.id,stale);assert.deepEqual((await store.inventory(account.id,character.id)).claimedLevelRewards,[2,3,4,5]);
  const replay=await run([2,3,4,5],req);assert.ok(replay.duplicate);assert.equal((await store.inventory(account.id,character.id)).gold,52);
  const other=await store.createGuest(randomUUID());await assert.rejects(()=>store.inventoryOp(other.id,character.id,randomUUID(),{op:'levelReward',levels:[6]},{profile}));
  const inv=(await store.inventory(account.id,character.id)).inventory;
  const fill=Array.from({length:data.economy.inventorySlots-inv.items.filter(i=>i.location==='bag').length},()=>({template:'card_jelly_pink',qty:1}));
  assert.ok(!(await store.inventoryOp(account.id,character.id,randomUUID(),{op:'admin',loot:fill},{profile})).error);
  const full=await store.inventory(account.id,character.id);assert.ok((await run([6,7,8,9,10])).error);assert.deepEqual(await store.inventory(account.id,character.id),full);
  const bag=full.inventory.items.filter(i=>i.location==='bag'&&i.template==='card_jelly_pink').slice(0,5);
  for(const item of bag)await store.inventoryOp(account.id,character.id,randomUUID(),{op:'discard',id:item.id},{profile});
  assert.ok(!(await run([6,7,8,9,10])).error);assert.deepEqual((await store.inventory(account.id,character.id)).claimedLevelRewards,[2,3,4,5,6,7,8,9,10]);
  assert.ok((await store.integrity()).ok);
  if(backend==='postgres'){
   await store.close();store=new PostgresStore(process.env.PG_TEST_URL!);await store.init();await store.init();
   assert.deepEqual((await store.inventory(account.id,character.id)).claimedLevelRewards,[2,3,4,5,6,7,8,9,10]);assert.ok((await run([5])).error);
  }
 }finally{await store.close();}
});

test('mailbox protocol rejects forged rewards and inventory delivery from a client',()=>{
 assert.ok(IntentSchema.safeParse({t:'mailbox',op:'claim',level:5,req:randomUUID()}).success);
 for(const message of [{t:'mailbox',op:'claim',level:100,gold:100000},{t:'mailbox',op:'claim',level:1},{t:'inv',op:'levelReward',req:randomUUID(),levels:[2]}])assert.equal(IntentSchema.safeParse(message).success,false);
});
