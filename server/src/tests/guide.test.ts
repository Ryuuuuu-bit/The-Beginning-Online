import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {MemoryStore} from '../store/memory.js';
import {PostgresStore} from '../store/postgres.js';
import {createApp} from '../app.js';
const progress=(step:number)=>({version:1 as const,step,off:true,min:true});

for(const backend of ['memory','postgres'] as const)test(`${backend}: character Guide survives reloads, imports once and rejects stale writes without touching gameplay`,{skip:backend==='postgres'&&!process.env.PG_TEST_URL},async()=>{
 let store=backend==='memory'?new MemoryStore():new PostgresStore(process.env.PG_TEST_URL!);
 try{
  await store.init();const a=await store.createGuest(randomUUID()),b=await store.createGuest(randomUUID()),name='g'+randomUUID().slice(0,8),c=await store.createCharacter(a.id,name,name),other=await store.createCharacter(a.id,name+'b',name+'b');
  const inventory=await store.inventory(a.id,c.id);assert.equal(await store.guide(a.id,c.id),null);
  const imported=await Promise.all([store.saveGuide(a.id,c.id,progress(7),0),store.saveGuide(a.id,c.id,progress(2),0)]);
  assert.equal(imported.filter(r=>!r.conflict).length,1);const first=(await store.guide(a.id,c.id))!;
  assert.equal(first.revision,1);assert.equal(await store.guide(a.id,other.id),null);
  const changed=await store.saveGuide(a.id,c.id,progress(14),first.revision);assert.equal(changed.conflict,false);
  const stale=await store.saveGuide(a.id,c.id,progress(0),first.revision);assert.equal(stale.conflict,true);assert.equal(stale.guide!.step,14);
  await store.saveProgress(a.id,c.id,{...c,guideProgress:first} as any);
  assert.deepEqual(await store.guide(a.id,c.id),changed.guide);assert.deepEqual(await store.inventory(a.id,c.id),inventory);
  await assert.rejects(()=>store.guide(b.id,c.id));await assert.rejects(()=>store.saveGuide(b.id,c.id,progress(0),2));
  await assert.rejects(()=>store.saveGuide(a.id,c.id,progress(15),2));
  if(backend==='postgres'){await store.close();store=new PostgresStore(process.env.PG_TEST_URL!);await store.init();await store.init();assert.deepEqual(await store.guide(a.id,c.id),changed.guide);}
  await store.deleteCharacter(a.id,c.id);await assert.rejects(()=>store.guide(a.id,c.id));await assert.rejects(()=>store.saveGuide(a.id,c.id,progress(0),2));
 }finally{await store.close();}
});

test('Guide API requires ownership, validates its version/fields and protects other progress',async t=>{
 const store=new MemoryStore(),server=createApp({store}).listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));});
 const base=`http://127.0.0.1:${(server.address() as any).port}`;
 const call=async(path:string,method='GET',cookie='',body?:unknown,origin?:string)=>{const response=await fetch(base+'/api'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json',...(origin?{Origin:origin}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]??''};};
 const a=await call('/guest','POST','',{}),b=await call('/guest','POST','',{}),name='GuideApi',created=await call('/characters','POST',a.cookie,{name}),id=created.data.character.id,path='/characters/'+id+'/guide';
 assert.equal((await call(path)).status,401);assert.equal((await call(path,'GET',b.cookie)).status,404);
 assert.equal((await call(path,'PUT',b.cookie,{progress:progress(7),revision:0})).status,404);
 assert.deepEqual((await call(path,'GET',a.cookie)).data,{guide:null});
 for(const body of [{progress:{...progress(7),gold:999},revision:0},{progress:{...progress(7),version:2},revision:0},{progress:progress(15),revision:0},{progress:progress(7),revision:-1},{progress:progress(7),revision:0,accountId:a.data.account.id}])assert.equal((await call(path,'PUT',a.cookie,body)).status,400);
 assert.equal((await call(path,'PUT',a.cookie,{progress:progress(7),revision:0},'https://foreign.invalid')).status,403);
 const saved=await call(path,'PUT',a.cookie,{progress:progress(7),revision:0});assert.equal(saved.status,200);assert.equal(saved.data.guide.revision,1);
 const stale=await call(path,'PUT',a.cookie,{progress:progress(0),revision:0});assert.equal(stale.status,409);assert.deepEqual(stale.data.guide,saved.data.guide);
 assert.equal((await call('/characters/'+id+'/progress','POST',a.cookie,{gold:999})).status,410);
 assert.equal((await call('/characters/'+id,'GET',a.cookie)).data.character.gold,0);
});
