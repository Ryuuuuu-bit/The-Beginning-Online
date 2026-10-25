import test from 'node:test';
import assert from 'node:assert/strict';
import {playEventAudio,monsterAudioFamily} from '../src/audio-events.ts';

function recorder() {
  const plays = [], ducks = [];
  return {plays, ducks, play: (...args) => plays.push(args), duckMusic: (...args) => ducks.push(args)};
}
test('leap takeoff and landing play on distinct authoritative events, not each AoE hit', () => {
  const sound = recorder();
  const event = {playerId:'you',skillId:'dash_strike',learnedSkill:'leap_strike',x:0,z:0};
  playEventAudio(sound,{...event,type:'skill'},'you');
  assert.deepEqual(sound.plays.map(p=>p[0]),['leap_strike']);
  playEventAudio(sound,{...event,type:'skillImpact'},'you');
  assert.deepEqual(sound.plays.map(p=>p[0]),['leap_strike','leap_strike_land']);
  for(let id=1;id<=3;id++)playEventAudio(sound,{...event,type:'hit',id,boss:false},'you');
  assert.equal(sound.plays.filter(p=>p[0]==='leap_strike_land').length,1);
});
test('ground impact waits for resolution and rapid attacks retain one sound per hit', () => {
  const sound = recorder();
  playEventAudio(sound,{type:'skill',skillId:'earth_break',playerId:'you'},'you');
  assert.equal(sound.plays.length,0);
  playEventAudio(sound,{type:'skillImpact',skillId:'earth_break',playerId:'you',x:2,z:3},'you');
  assert.equal(sound.plays[0][0],'earth_break');
  for(let i=0;i<3;i++)playEventAudio(sound,{type:'hit',skillId:'frenzy_slash',playerId:'you',id:1,x:2,z:3},'you');
  assert.equal(sound.plays.filter(p=>p[0]==='frenzy_slash').length,3);
  assert.equal(sound.plays.filter(p=>p[0]==='hit_thock').length,3);
  assert.equal(sound.plays.filter(p=>p[0]==='mat_jelly').length,3);
});
test('remote sound attenuation and local-only rewards remain intact', () => {
  const sound = recorder();
  playEventAudio(sound,{type:'slash',playerId:'other',combo:2,x:1,z:1},'you');
  assert.equal(sound.plays[0][0],'combo3');assert.equal(sound.plays[0][3],true);
  playEventAudio(sound,{type:'pickup',playerId:'other'},'you');assert.equal(sound.plays.length,1);
  playEventAudio(sound,{type:'pickup',playerId:'you'},'you');assert.equal(sound.plays[1][0],'pickup');
});

test('monster voices follow actual identities and art aliases, never unrelated renderer fallbacks',()=>{
  for(const [id,family] of Object.entries({shade_wolf:'wolf',relic_hound:'wolf',crag_wolf:'wolf',mist_shroom:'shroom',ruin_shroom:'shroom',forest_young_1:'shroom',forest_young_3:'shroom',volcano_red_smoke_shroom:'shroom',stump_guard:'wood',ruin_guard:'wood',crag_guard:'wood',lantern_wisp:'wisp',relic_wisp:'wisp',dust_wisp:'wisp'}))assert.equal(monsterAudioFamily(id),family,id);
  for(const id of ['jelly_pink','amber_mantis','dawn_owl','moon_crab','missing'])assert.equal(monsterAudioFamily(id),undefined,id);
});

test('each creature family reacts to server wind-up, direct injury and kill at the monster position',()=>{
  for(const [dataId,family] of Object.entries({shade_wolf:'wolf',mist_shroom:'shroom',stump_guard:'wood',lantern_wisp:'wisp'})){
    const sound=recorder(),monster={dataId,boss:false,dead:false,x:7,z:8};
    const play=e=>playEventAudio(sound,{id:4,x:1,z:2,playerId:'other',...e},'you',undefined,()=>monster);
    play({type:family==='wisp'?'bolt':'warning',attack:'attack'});
    play({type:'hit',damage:4});
    monster.dead=true;play({type:'hit',damage:100});play({type:'kill',dataId});
    const voices=sound.plays.filter(p=>p[0].startsWith('mon_'));
    assert.deepEqual(voices.map(p=>p[0]),['attack','hurt','death'].map(a=>`mon_${family}_${a}`));
    assert.ok(voices.every(p=>p[1]===monster&&p[3]!==true),'monster voices use distance, not other-player attenuation');
  }
});

test('DoT, zero damage, unrelated warnings and bosses do not trigger creature injury/attack voices',()=>{
  const sound=recorder(),monster={dataId:'shade_wolf',boss:false,dead:false,x:0,z:0};
  for(const e of [{type:'hit',damage:0},{type:'hit',damage:2,dot:true},{type:'hit',damage:100,fatal:true},{type:'warning',attack:'slam'}])playEventAudio(sound,{id:1,...e},'you',undefined,()=>monster);
  monster.boss=true;
  for(const type of ['warning','bolt','kill'])playEventAudio(sound,{id:1,type,boss:true,attack:'attack'},'you',undefined,()=>monster);
  assert.ok(!sound.plays.some(p=>p[0].startsWith('mon_')));
  playEventAudio(sound,{type:'kill',dataId:'relic_wisp'},'you');
  assert.equal(sound.plays.at(-1)[0],'mon_wisp_death','kill carries identity even after snapshot removal');
  playEventAudio(sound,{type:'kill',dataId:'jelly_pink'},'you');assert.equal(sound.plays.at(-1)[0],'jelly_death');
});
