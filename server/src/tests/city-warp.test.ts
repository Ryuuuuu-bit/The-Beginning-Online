import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import WebSocket from 'ws';
import {GATES} from '@the-beginning-online/shared';
import {createApp} from '../app.js';
import {mountRealtime} from '../realtime/index.js';
import {MemoryStore} from '../store/memory.js';
import {PostgresStore} from '../store/postgres.js';

test('discovered maps are idempotent, isolated by character/account and protected by the lease',async()=>{
 const store=new MemoryStore();await store.init();
 try{
  const account=await store.createGuest(randomUUID()),other=await store.createGuest(randomUUID());
  const first=await store.createCharacter(account.id,'WarpA','warpa'),second=await store.createCharacter(account.id,'WarpB','warpb');
  await store.claimLease(first.id,'owner');
  assert.deepEqual(await store.discoverMap(account.id,first.id,'forest','owner'),['city_plaza','forest']);
  assert.deepEqual(await store.discoverMap(account.id,first.id,'forest','owner'),['city_plaza','forest']);
  await assert.rejects(()=>store.discoverMap(other.id,first.id,'meadow','owner'));
  await assert.rejects(()=>store.discoverMap(account.id,first.id,'meadow','old-owner'),/Lease lost/);
  await store.saveProgress(account.id,first.id,{...first,xp:5},'owner');
  assert.deepEqual((await store.character(account.id,first.id))!.discoveredMaps,['city_plaza','forest']);
  assert.equal((await store.character(account.id,second.id))!.discoveredMaps,undefined);
 }finally{await store.close();}
});

test('normal first entry unlocks city warp; locked, remote, dead and special-map requests cannot bypass rules',async t=>{
 const store=new MemoryStore();await store.init();
 const server=createApp({store,build:'warp-test'}).listen(0,'127.0.0.1');await once(server,'listening');
 const rt=mountRealtime(server,{store,build:'warp-test',reconnectMs:100,heartbeatMs:5000});
 const base='http://127.0.0.1:'+(server.address() as any).port,sockets:WebSocket[]=[];
 t.after(async()=>{for(const ws of sockets)ws.terminate();await rt.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await store.close();});
 const post=async(path:string,data:unknown={},cookie='')=>{
  const res=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});
  assert.equal(res.ok,true,path);return {data:await res.json() as any,cookie:res.headers.get('set-cookie')?.split(';')[0]??cookie};
 };
 const guest=await post('/api/guest'),created=await post('/api/characters',{name:'Warp'+randomUUID().slice(0,6),jobId:'swordsman'},guest.cookie),character=created.data.character;
 await post('/api/characters/'+character.id+'/select',{},guest.cookie);
 const own=()=>{for(const r of rt.rooms.values()){const p=r.game.players.get(character.id);if(p)return p;}throw Error('Player missing');};
 async function open(){
  const ws=new WebSocket(base.replace('http','ws')+'/api/ws?v=warp-test&area=meadow-01',{headers:{Cookie:guest.cookie}}),messages:any[]=[];sockets.push(ws);
  ws.on('message',b=>messages.push(JSON.parse(b.toString())));ws.on('error',()=>{});
  const until=async(fn:(m:any)=>boolean,after=0)=>{for(let i=0;i<300;i++){const found=messages.slice(after).find(fn);if(found)return found;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for message');};
  await once(ws,'open');await until(m=>m.t==='welcome');
  const request=async(message:unknown,fn:(m:any)=>boolean)=>{const at=messages.length;ws.send(JSON.stringify(message));return until(fn,at);};
  const initial=await request({t:'spawnReady'},m=>m.t==='mapDiscovery');return {ws,request,initial};
 }
 let client=await open();assert.deepEqual(client.initial.maps,['city_plaza']);
 await client.request({t:'cityWarp',mapId:'forest'},m=>m.t==='ev'&&m.list.some((e:any)=>e.text?.includes('ครั้งแรก')));
 assert.equal(own().mapId,'city_plaza');
 await client.request({t:'travel',gate:'east'},m=>m.t==='ev'&&m.list.some((e:any)=>e.text?.includes('หมอก')));
 assert.equal((await store.character(character.accountId,character.id))!.discoveredMaps!.includes('forest'),false);
 const gate=GATES.city_plaza.east!;Object.assign(own(),{x:gate.x,z:gate.z,target:null,destination:null,auto:false});
 const discover=store.discoverMap.bind(store);
 store.discoverMap=async(...args)=>{if(args[2]==='forest')throw Error('test discovery write failure');return discover(...args);};
 await client.request({t:'travel',gate:'east'},m=>m.t==='ev'&&m.list.some((e:any)=>e.text?.includes('บันทึกจุดวาร์ปไม่สำเร็จ')));
 assert.equal(own().mapId,'city_plaza');store.discoverMap=discover;
 await client.request({t:'travel',gate:'east'},m=>m.t==='mapDiscovery'&&m.maps.includes('forest'));
 assert.equal(own().mapId,'forest');assert((await store.character(character.accountId,character.id))!.discoveredMaps!.includes('forest'));
 await client.request({t:'cityWarp',mapId:'forest'},m=>m.t==='ev'&&m.list.some((e:any)=>e.text?.includes('ในเมืองเท่านั้น')));
 const back=GATES.forest.west!;Object.assign(own(),{x:back.x,z:back.z,target:null,destination:null,auto:false});
 await client.request({t:'travel',gate:'west'},m=>m.t==='snap'&&m.mapId==='city_plaza');
 own().dead=true;
 await client.request({t:'cityWarp',mapId:'forest'},m=>m.t==='ev'&&m.list.some((e:any)=>e.text?.includes('หมดสติ')));
 own().dead=false;
 await client.request({t:'cityWarp',mapId:'forest'},m=>m.t==='snap'&&m.mapId==='forest');assert.equal(own().mapId,'forest');
 Object.assign(own(),{x:back.x,z:back.z,target:null,destination:null,auto:false});
 await client.request({t:'travel',gate:'west'},m=>m.t==='snap'&&m.mapId==='city_plaza');
 client.ws.close();await once(client.ws,'close');
 // A previously discovered raid still needs the current level/quest entry requirements.
 await store.discoverMap(character.accountId,character.id,'confluence');
 client=await open();assert(client.initial.maps.includes('forest'));
 await client.request({t:'cityWarp',mapId:'confluence'},m=>m.t==='ev'&&m.list.some((e:any)=>e.text?.includes('Lv.100')));
 assert.equal(own().mapId,'city_plaza');
 await client.request({t:'cityWarp',mapId:'forest'},m=>m.t==='snap'&&m.mapId==='forest');
});

test('Postgres retains map discovery across progress saves, migrations and process restart',{skip:!process.env.PG_TEST_URL&&'PG_TEST_URL not set'},async()=>{
 let store=new PostgresStore(process.env.PG_TEST_URL!);await store.init();
 try{
  const account=await store.createGuest(randomUUID()),name='Warp'+randomUUID().slice(0,7),character=await store.createCharacter(account.id,name,name.toLowerCase());
  await store.discoverMap(account.id,character.id,'forest');await store.saveProgress(account.id,character.id,{...character,xp:7});
  await store.close();store=new PostgresStore(process.env.PG_TEST_URL!);await store.init();
  assert.deepEqual((await store.character(account.id,character.id))!.discoveredMaps,['city_plaza','forest']);
 }finally{await store.close();}
});
