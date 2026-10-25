import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioEngine} from '../src/audio.ts';

function fixture(t){
 const events={},sources=[];const storage=globalThis.localStorage,win=globalThis.window,doc=globalThis.document;
 globalThis.localStorage={getItem(){return null;},setItem(){}};
 globalThis.window={addEventListener(){}};globalThis.document={hidden:false,addEventListener(id,fn){events[id]=fn;}};
 t.after(()=>{globalThis.localStorage=storage;globalThis.window=win;globalThis.document=doc;});
 const node=()=>({connect(){},disconnect(){},gain:{value:0,setTargetAtTime(v){this.value=v;},setValueAtTime(){},linearRampToValueAtTime(){}},frequency:{value:0},Q:{value:0},pan:{value:0}});
 const sound=new AudioEngine('test');const ctx={currentTime:10,state:'running',createGain:node,createBiquadFilter:node,createStereoPanner:node,createBufferSource(){const s={...node(),playbackRate:{value:0},start(...args){this.started=args;},stop(){this.stopped=true;}};sources.push(s);return s;}};
 sound.ctx=ctx;sound.master=node();sound.buses={sfx:node(),music:node(),ambience:node()};sound.manifest={sounds:Object.fromEntries(['npc_market_greet','npc_forge_greet','refine_hammer'].map(id=>[id,{group:'sfx-town',start:0,duration:2,pitch:0,cooldown:id.startsWith('npc_')?8:.15,voices:1}]))};sound.buffers.set('sfx-town',{});sound.set({sfx:.8,music:.6,ambience:.5});
 return {sound,ctx,sources,events};
}

test('greetings play at fixed pitch, duck both backgrounds, resist repeats and restore on completion',t=>{
 const {sound,ctx,sources}=fixture(t);const before={music:sound.buses.music.gain.value,ambience:sound.buses.ambience.gain.value};
 sound.play('npc_market_greet');assert.equal(sources.length,1);assert.equal(sources[0].playbackRate.value,1);assert.equal(sound.buses.music.gain.value,before.music*.5);assert.equal(sound.buses.ambience.gain.value,before.ambience*.7);
 ctx.currentTime+=.5;sound.play('npc_market_greet');assert.equal(sources.length,1);
 sound.play('npc_forge_greet');assert.equal(sources[0].stopped,true);assert.equal(sources.length,2);sources[0].onended();assert.equal(sound.greeting,sources[1]);sources[1].onended();assert.equal(sound.buses.music.gain.value,before.music);assert.equal(sound.buses.ambience.gain.value,before.ambience);
});

test('map changes, hidden, mute, zero SFX and death stop dialogue and release background ducking',async t=>{
 for(const mode of ['map','hidden','mute','sfx','dead']){
  await t.test(mode,t=>{
  const {sound,sources}=fixture(t);sound.play('npc_market_greet');
  if(mode==='map')sound.setMap('forest');
  if(mode==='hidden'){document.hidden=true;sound.apply();}
  if(mode==='mute')sound.set({muted:true});
  if(mode==='sfx')sound.set({sfx:0});
  if(mode==='dead')sound.updateMusic({...sound.musicState,dead:true});
  assert.equal(sources[0].stopped,true,mode);assert.equal(sound.greeting,undefined,mode);
  assert.equal(sound.buses.ambience.gain.value,sound.settings.ambience*.8,mode);
  });
 }
});

test('muted or zero SFX dialogue never ducks backgrounds; forge effects do not duck',t=>{
 const {sound,sources}=fixture(t);sound.set({sfx:0});sound.play('npc_market_greet');assert.equal(sources.length,0);
 sound.set({sfx:.8,muted:true});sound.play('npc_market_greet');assert.equal(sources.length,0);
 sound.set({muted:false});const bg=sound.buses.music.gain.value;sound.play('refine_hammer');assert.equal(sound.buses.music.gain.value,bg);assert.equal(sound.greeting,undefined);
});
