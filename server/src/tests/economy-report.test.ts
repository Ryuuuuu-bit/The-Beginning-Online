import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {loadGameData} from '@the-beginning-online/shared';
import {makeEconomyReport} from '../economy-report.js';
import {MemoryStore} from '../store/memory.js';
import {PostgresStore} from '../store/postgres.js';
import {createApp} from '../app.js';
const data=loadGameData(),context={profile:data.stats.defaultBuild};
test('economy totals exclude GM/transfers, preserve gross item usage, and fill idle hours',()=>{
 const now=Date.parse('2026-10-25T06:00:00Z');
 const report=makeEconomyReport(1,now,{total:1300,characters:2},[
  {kind:'pickup',incoming:500,outgoing:0,requests:2},{kind:'npc_buy',incoming:0,outgoing:120,requests:1},{kind:'craft',incoming:0,outgoing:80,requests:1},
  {kind:'admin',incoming:1000,outgoing:0,requests:1},{kind:'trade_in',incoming:100,outgoing:0,requests:1},{kind:'trade_out',incoming:0,outgoing:100,requests:1}],
 [{at:'2026-10-25T05:00:00.000Z',incoming:500,outgoing:200}],
 [{kind:'quest',template:'forge_fragment',positive:8,negative:2},{kind:'craft',template:'forge_fragment',positive:0,negative:6},{kind:'use',template:'weapon_stone',positive:1,negative:0},{kind:'trade_in',template:'forge_fragment',positive:99,negative:0},{kind:'level_reward',template:'red_small',positive:100,negative:0}]);
 assert.equal(report.incoming,500);assert.equal(report.outgoing,200);assert.equal(report.net,300);assert.equal(report.wallets.average,650);
 assert.equal(report.hourly.length,25);assert.equal(report.hourly.filter(h=>h.net).length,1);assert.equal(report.hourly.find(h=>h.net)!.net,300);
 assert.deepEqual(report.items.find(i=>i.template==='forge_fragment'),{template:'forge_fragment',created:8,consumed:8});
 assert.equal(report.items.find(i=>i.template==='weapon_stone')!.consumed,1);
 assert.equal(report.items.find(i=>i.template==='red_small')!.created,100);
});
for(const backend of ['memory','postgres'] as const)test(`${backend}: reports use committed ledger totals and count multi-row requests once`,{skip:backend==='postgres'&&!process.env.PG_TEST_URL},async()=>{
 const store=backend==='memory'?new MemoryStore():new PostgresStore(process.env.PG_TEST_URL!);
 try{
  await store.init();const before=await store.economyReport(1),a=await store.createGuest(randomUUID()),name='e'+randomUUID().slice(0,8),c=await store.createCharacter(a.id,name,name);
  const run=(op:any,req=randomUUID())=>store.inventoryOp(a.id,c.id,req,op,context);
  await run({op:'admin',gold:1000});await run({op:'pickup',gold:500});await run({op:'buy',shop:'forge',template:'training_sword'});
  await run({op:'quest',gold:30,reward:[{template:'forge_fragment',qty:8}]});
  const req=randomUUID();await run({op:'craft',template:'weapon_stone'},req);await run({op:'craft',template:'weapon_stone'},req);
  const report=await store.economyReport(1);
  assert.equal(report.incoming-before.incoming,530);assert.equal(report.outgoing-before.outgoing,180);assert.equal(report.net-before.net,350);
  assert.equal(report.wallets.total-before.wallets.total,1350);
  const count=(r:typeof report)=>r.flows.find(f=>f.kind==='craft')?.requests??0;assert.equal(count(report)-count(before),1);
  assert.equal((await store.economyReport(7)).days,7);
 }finally{await store.close();}
});
test('economy API checks current admin role and strictly bounds the report range',async t=>{
 const store=new MemoryStore(),server=createApp({store}).listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));});
 const base=`http://127.0.0.1:${(server.address() as any).port}`,get=(query='',cookie='')=>fetch(base+'/api/admin/economy'+query,{headers:{Cookie:cookie}});
 assert.equal((await get()).status,403);
 const guest=await fetch(base+'/api/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),cookie=guest.headers.get('set-cookie')!.split(';')[0],account=(await guest.json() as any).account;
 assert.equal((await get('',cookie)).status,403);await store.setAdmin(account.uid,true,{accountId:'test',uid:'test'});
 for(const query of ['?days=0','?days=365','?days=1&days=7','?days[]=7'])assert.equal((await get(query,cookie)).status,400);
 const response=await get('?days=7',cookie);assert.equal(response.status,200);assert.match(response.headers.get('cache-control')!,/no-store/);assert.equal((await response.json() as any).days,7);
 const other=await store.createGuest(randomUUID());await store.setAdmin(other.uid,true,{accountId:'test',uid:'test'});await store.setAdmin(account.uid,false,{accountId:'test',uid:'test'});
 assert.equal((await get('',cookie)).status,403);
});
