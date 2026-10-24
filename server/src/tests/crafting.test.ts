import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadGameData} from '@the-beginning-online/shared';
import {MemoryStore} from '../store/memory.js';
import {PostgresStore} from '../store/postgres.js';
const data=loadGameData(),context={profile:data.stats.defaultBuild};
for(const backend of ['memory','postgres'] as const)test(`${backend}: salvage/craft commit once, serialize competing spends and survive repeat migrations`,{skip:backend==='postgres'&&!process.env.PG_TEST_URL},async()=>{
 const store=backend==='memory'?new MemoryStore():new PostgresStore(process.env.PG_TEST_URL!);
 try{
  await store.init();const a=await store.createGuest(randomUUID()),name='c'+randomUUID().slice(0,8),c=await store.createCharacter(a.id,name,name);
  const run=(op:any,req=randomUUID())=>store.inventoryOp(a.id,c.id,req,op,context);
  await run({op:'admin',gold:2000});await run({op:'buy',shop:'forge',template:'training_sword'});
  const before=await store.inventory(a.id,c.id),item=before.inventory.items.find(i=>i.template==='training_sword'&&i.source==='npc')!;
  assert.ok(item);const starter=before.inventory.items.find(i=>i.template==='training_sword'&&i.source==='migration')!;
  assert.ok((await run({op:'salvage',id:starter.id})).error);assert.deepEqual(await store.inventory(a.id,c.id),before);
  const req=randomUUID(),first=await run({op:'salvage',id:item.id},req);assert.ok(!first.error);
  assert.ok((await run({op:'salvage',id:item.id},req)).duplicate);
  await run({op:'quest',reward:[{template:'forge_fragment',qty:7}]});
  const requests=[randomUUID(),randomUUID()],results=await Promise.all(requests.map(req=>run({op:'craft',template:'weapon_stone',gold:0},req)));
  assert.equal(results.filter(r=>!r.error).length,1);
  const saved=await store.inventory(a.id,c.id);assert.equal(saved.gold,1820);
  assert.equal(saved.inventory.items.find(i=>i.template==='weapon_stone')!.qty,1);assert.ok(!saved.inventory.items.some(i=>i.id===item.id||i.template==='forge_fragment'));
  assert.ok((await run({op:'craft',template:'weapon_stone'},requests[results.findIndex(r=>!r.error)])).duplicate);
  await store.init();await store.init();assert.deepEqual(await store.inventory(a.id,c.id),saved);
  assert.ok((await store.integrity()).ok);
  const other=await store.createGuest(randomUUID());await assert.rejects(()=>store.inventoryOp(other.id,c.id,randomUUID(),{op:'craft',template:'weapon_stone'},context));
 }finally{await store.close();}
});
