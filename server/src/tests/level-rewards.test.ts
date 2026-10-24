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
  const stale={...character,level:20,claimedLevelRewards:[],upgradedLevelRewards:[],consumableBuffs:{}};await store.saveProgress(account.id,character.id,stale);
  const run=(levels:number[],req=randomUUID())=>store.inventoryOp(account.id,character.id,req,{op:'levelReward',levels,gold:999999},{profile});
  const before=await store.inventory(account.id,character.id);
  assert.ok((await run([21])).error);assert.deepEqual(await store.inventory(account.id,character.id),before);
  const req=randomUUID(),results=await Promise.all([run([2,3,4,5],req),run([2,3,4,5])]);assert.equal(results.filter(r=>!r.error).length,1);
  const claimed=await store.inventory(account.id,character.id);assert.deepEqual(claimed.claimedLevelRewards,[2,3,4,5]);assert.equal(claimed.gold,5000);
  assert.ok((await run([2],randomUUID())).error);assert.ok((await run([2,6])).error);assert.deepEqual(await store.inventory(account.id,character.id),claimed);
  await store.saveProgress(account.id,character.id,stale);assert.deepEqual((await store.inventory(account.id,character.id)).claimedLevelRewards,[2,3,4,5]);
  const replay=await run([2,3,4,5],req);assert.ok(replay.duplicate);assert.equal((await store.inventory(account.id,character.id)).gold,5000);
  const other=await store.createGuest(randomUUID());await assert.rejects(()=>store.inventoryOp(other.id,character.id,randomUUID(),{op:'levelReward',levels:[6]},{profile}));
  const inv=(await store.inventory(account.id,character.id)).inventory;
  const fill=Array.from({length:data.economy.inventorySlots-inv.items.filter(i=>i.location==='bag').length},()=>({template:'card_jelly_pink',qty:1}));
  assert.ok(!(await store.inventoryOp(account.id,character.id,randomUUID(),{op:'admin',loot:fill},{profile})).error);
  const full=await store.inventory(account.id,character.id);assert.ok((await run([6,7,8,9,10])).error);assert.deepEqual(await store.inventory(account.id,character.id),full);
  const bag=full.inventory.items.filter(i=>i.location==='bag'&&i.template==='card_jelly_pink');
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
 for(const message of [{t:'mailbox',op:'claim',level:100,gold:100000},{t:'mailbox',op:'claim',level:0},{t:'inv',op:'levelReward',req:randomUUID(),levels:[2]}])assert.equal(IntentSchema.safeParse(message).success,false);
});

for(const backend of ['memory','postgres'] as const)test(`${backend}: legacy top-ups and buff consumption are permanent, atomic and deduplicated`,{skip:backend==='postgres'&&!process.env.PG_TEST_URL},async()=>{
 const store=backend==='memory'?new MemoryStore():new PostgresStore(process.env.PG_TEST_URL!);
 try{
  await store.init();const account=await store.createGuest(randomUUID()),name='Buff'+randomUUID().slice(0,8),character=await store.createCharacter(account.id,name,name.toLowerCase());
  await store.saveProgress(account.id,character.id,{...character,level:20});
  if(backend==='memory')(store as any).chars.get(character.id).claimedLevelRewards=[5];
  else await (store as any).pool.query('UPDATE tn2_characters SET claimed_level_rewards=$2 WHERE id=$1',[character.id,[5]]);
  const run=(op:any,req=randomUUID())=>store.inventoryOp(account.id,character.id,req,op,{profile});
  const reward=await run({op:'levelReward',levels:[1,5],legacyLevels:[]});assert.equal(reward.error,undefined);assert.equal(reward.gold,4975);
  assert.equal(reward.inventory.items.find(i=>i.template==='red_small')!.qty,97+5);
  assert.ok(!reward.inventory.items.some(i=>i.template==='iron_amulet'));
  const id=reward.inventory.items.find(i=>i.template==='exp_boost_scroll')!.id,req=randomUUID(),before=Date.now();
  const used=await run({op:'use',id},req);assert.equal(used.error,undefined);assert.ok(used.consumableBuffs!.exp!.until>=before+3600000);
  assert.ok((await run({op:'use',id},req)).duplicate);
  await store.saveProgress(account.id,character.id,{...character,level:20,consumableBuffs:{},upgradedLevelRewards:[]} as any);
  assert.deepEqual((await store.inventory(account.id,character.id)).consumableBuffs,used.consumableBuffs);
  assert.ok((await run({op:'use',id})).error);
  assert.deepEqual((await store.inventory(account.id,character.id)).consumableBuffs,used.consumableBuffs);
  assert.ok((await run({op:'levelReward',levels:[5]})).error);
  assert.deepEqual((await store.inventory(account.id,character.id)).legacyLevelRewards,[5]);
 }finally{await store.close();}
});
