import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadGameData,applyInventory} from '@the-beginning-online/shared';
import {MemoryStore} from '../store/memory.js';
import {PostgresStore} from '../store/postgres.js';
const data=loadGameData(),context={profile:data.stats.defaultBuild};
for(const backend of ['memory','postgres'] as const)test(`${backend}: quest fragments remain bound across reloads and request retries`,{skip:backend==='postgres'&&!process.env.PG_TEST_URL},async()=>{
 const store=backend==='memory'?new MemoryStore():new PostgresStore(process.env.PG_TEST_URL!);
 try{
  await store.init();const account=await store.createGuest(randomUUID()),name='q'+randomUUID().slice(0,8),character=await store.createCharacter(account.id,name,name);
  const req=randomUUID(),op={op:'quest' as const,reward:[{template:'forge_fragment',qty:4}]};
  const results=await Promise.all([store.inventoryOp(account.id,character.id,req,op,context),store.inventoryOp(account.id,character.id,req,op,context)]);
  assert.equal(results.filter(r=>!r.duplicate).length,1);
  const saved=await store.inventory(account.id,character.id),fragment=saved.inventory.items.find(i=>i.template==='forge_fragment')!;
  assert.equal(fragment.qty,4);assert.equal(fragment.bound,true);
  const sold=await store.inventoryOp(account.id,character.id,randomUUID(),{op:'sell',id:fragment.id},context);
  assert.match(sold.error!,/ผูกมัด/);assert.deepEqual(await store.inventory(account.id,character.id),saved);
  const old=structuredClone(saved);old.inventory.items.find(i=>i.id===fragment.id)!.bound=false;
  assert.throws(()=>applyInventory(old,{op:'sell',id:fragment.id},context.profile,data,randomUUID),/ผูกมัด/);
 }finally{await store.close();}
});
