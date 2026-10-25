import test from 'node:test';
import assert from 'node:assert/strict';
import {readGuideProgress,readGuideCache,createGuideSync} from '../src/guide-progress.ts';

test('guide progress preserves existing characters and safely handles damaged storage',()=>{
 assert.deepEqual(readGuideProgress('{"step":8,"off":true,"min":true}',13),{step:8,off:true,min:true});
 assert.deepEqual(readGuideProgress('{"step":999,"off":"false"}',13),{step:13,off:false,min:false});
 assert.equal(readGuideProgress('{',13),null);
 assert.equal(readGuideProgress(null,13),null);
 assert.equal(readGuideProgress('[]',13),null);
 for(const step of [-2,1.5,'8',null])assert.equal(readGuideProgress(JSON.stringify({step}),13).step,0);
});

const progress=step=>({version:1,step,off:false,min:false});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(cloud,cached=null,initial=progress(0)){
 const applied=[],statuses=[],writes=[];let savedCache=cached,remote=cloud;
 const options={initial,cached,read:async()=>remote,write:async(value,revision)=>{writes.push({value,revision});if((remote?.revision??0)!==revision)return {guide:remote,conflict:true};remote={...value,revision:revision+1};return {guide:remote,conflict:false};},cache:value=>savedCache=structuredClone(value),apply:value=>applied.push(value),status:value=>statuses.push(value)};
 return {options,applied,statuses,writes,get cache(){return savedCache;},get cloud(){return remote;},set cloud(value){remote=value;}};
}
test('server state overrides legacy/browser progress and a new browser restores the same character',async()=>{
 const cloud={...progress(8),off:true,min:true,revision:4},f=fixture(cloud,null,progress(2));
 const sync=createGuideSync(f.options);await sync.start();assert.equal(sync.ready,true);assert.deepEqual(f.applied.at(-1),{...progress(8),off:true,min:true});assert.equal(f.writes.length,0);
 const second=fixture(f.cloud);await createGuideSync(second.options).start();assert.deepEqual(second.applied.at(-1),f.applied.at(-1));
});
test('legacy progress imports once with revision zero; rapid changes serialize and coalesce',async()=>{
 const f=fixture(null,null,progress(7)),sync=createGuideSync(f.options);await sync.start();assert.equal(f.writes[0].revision,0);assert.equal(f.cloud.step,7);
 let release;const gate=new Promise(resolve=>release=resolve),write=f.options.write;let first=true;
 f.options.write=async(...args)=>{if(first){first=false;await gate;}return write(...args);};
 sync.update(progress(8));sync.update(progress(9));sync.update(progress(10));assert.equal(f.cache.dirty,true);release();await tick();
 assert.deepEqual(f.writes.map(w=>w.value.step),[7,8,10]);assert.deepEqual(f.writes.map(w=>w.revision),[0,1,2]);assert.equal(f.cache.dirty,false);assert.equal(f.cloud.step,10);
});
test('failed writes retain an outbox across reloads and lost acknowledgements cannot duplicate an import',async()=>{
 const f=fixture({...progress(0),revision:1});f.options.write=async()=>{throw Error('offline');};const sync=createGuideSync(f.options);await sync.start();sync.update(progress(4));await tick();
 assert.equal(f.statuses.at(-1),'error');assert.equal(f.cache.dirty,true);
 const resumed=fixture(f.cloud,f.cache);await createGuideSync(resumed.options).start();assert.equal(resumed.cloud.step,4);assert.equal(resumed.cache.dirty,false);
 const lostAck=fixture(resumed.cloud,{progress:progress(4),revision:1,dirty:true});await createGuideSync(lostAck.options).start();assert.equal(lostAck.writes.length,0);assert.equal(lostAck.cache.dirty,false);
});
test('stale-device conflicts load the newer server state instead of retrying the stale update',async()=>{
 const f=fixture({...progress(1),revision:1}),sync=createGuideSync(f.options);await sync.start();f.cloud={...progress(12),revision:3};sync.update(progress(2));await tick();
 assert.equal(f.cloud.step,12);assert.equal(f.applied.at(-1).step,12);assert.equal(f.writes.length,1);assert.equal(f.cache.dirty,false);assert.equal(f.statuses.at(-1),'conflict');
});
test('a lost save acknowledgement preserves newer queued progress across a reload',async()=>{
 const f=fixture({...progress(0),revision:1});let release;const gate=new Promise(resolve=>release=resolve);
 f.options.write=async(value,revision)=>{await gate;f.cloud={...value,revision:revision+1};throw Error('ack lost');};
 const sync=createGuideSync(f.options);await sync.start();sync.update(progress(1));sync.update(progress(2));release();await tick();
 assert.equal(f.cloud.step,1);assert.equal(f.cache.progress.step,2);assert.equal(f.cache.sent.step,1);
 const resumed=fixture(f.cloud,f.cache);await createGuideSync(resumed.options).start();assert.equal(resumed.cloud.step,2);assert.equal(resumed.cloud.revision,3);assert.equal(resumed.cache.dirty,false);
});
test('load failures never initialize over unknown server state and malformed outboxes are ignored',async()=>{
 const f=fixture({...progress(9),revision:2});let fail=true;f.options.read=async()=>{if(fail)throw Error('offline');return f.cloud;};const sync=createGuideSync(f.options);await sync.start();assert.equal(sync.ready,false);assert.equal(f.writes.length,0);fail=false;await sync.retry();assert.equal(f.applied.at(-1).step,9);
 for(const raw of ['{','null','[]',JSON.stringify({progress:progress(15),revision:1,dirty:true}),JSON.stringify({progress:progress(1),revision:-1,dirty:true})])assert.equal(readGuideCache(raw),null);
 assert.deepEqual(readGuideCache(JSON.stringify(f.cache)),f.cache);
});
