import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import ffmpeg from 'ffmpeg-static';

const manifest=JSON.parse(readFileSync(new URL('../public/assets/audio/sprites.json',import.meta.url)));
const metadata=JSON.parse(readFileSync(new URL('../art/sfx-source/sfx-sources.json',import.meta.url)));
const picks=JSON.parse(readFileSync(new URL('../art/sfx-source/picks.json',import.meta.url)));
test('all approved takes are packed with short repeated-hit tails and soft loudness targets',()=>{
  assert.equal(Object.keys(manifest.sounds).length,64);
  for(const [id,sound]of Object.entries(manifest.sounds)){
    assert.equal(sound.source,`art/sfx-source/${picks[id]}`);
    const bytes=readFileSync(new URL('../'+sound.source,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),metadata[id].approved.wavSha256);
    assert.ok(sound.lufs>=(id.startsWith('mon_')?-30:-26)&&sound.lufs<=-21);
    if(metadata[id].max)assert.ok(sound.duration<=metadata[id].max+1/48000);
  }
  assert.ok(manifest.sounds.frenzy_slash.duration<=.143);
  assert.ok(manifest.sounds.blade_cyclone_tick.duration<=.1);
  for(const file of Object.values(manifest.groups['sfx-core']))if(file?.bytes)assert.ok(file.bytes<=400*1024);
});

test('six NPC cast selections and three forge takes retain their approved source and fixed pitch',()=>{
  const {sources}=JSON.parse(readFileSync(new URL('../art/sfx-source/town-v1/sources.json',import.meta.url)));
  assert.equal(sources.length,9);
  for(const source of sources){
    assert.equal(createHash('sha256').update(readFileSync(new URL('../'+source.raw,import.meta.url))).digest('hex'),source.rawSha256);
    const sound=manifest.sounds[source.id];assert.equal(sound.group,'sfx-town');assert.equal(sound.pitch,0);assert.equal(sound.voices,1);
    assert.equal(source.take,1);
    if(source.id.startsWith('npc_')){
      assert.equal(sound.cooldown,8);
      assert.ok(source.approvedSource.includes(['npc_forge_greet','npc_angel_greet'].includes(source.id)?'npc-elias-seraph-v4':'npc-game-acting-v3'));
    }else assert.ok(source.approvedSource.includes('npc-refine-soft-v1'));
  }
  assert.ok(manifest.sounds.refine_hammer.duration<=.38+1/48000);
});

test('12 monster voices retain approved raw takes and conservative repeat limits',()=>{
  const sources=JSON.parse(readFileSync(new URL('../art/sfx-source/monster-v1/sources.json',import.meta.url))).sources;
  assert.equal(sources.length,12);
  for(const source of sources){
    const raw=readFileSync(new URL('../'+source.raw,import.meta.url));
    assert.equal(createHash('sha256').update(raw).digest('hex'),source.rawSha256);
    assert.equal(source.take,1);
    const sound=manifest.sounds[source.id];assert.equal(sound.group,'sfx-monsters');
    assert.equal(sound.pitch,.015);assert.equal(sound.voices,2);
    if(source.id.endsWith('_hurt'))assert.equal(sound.cooldown,.35);
  }
});
test('both packed codecs decode without clipping, keep sprite bounds and have a continuous ambient wrap',()=>{
  for(const [name,group]of Object.entries(manifest.groups))for(const codec of ['opus','aac']){
    const file=new URL('../public'+group[codec].url,import.meta.url);
    assert.equal(statSync(file).size,group[codec].bytes);
    const decoded=spawnSync(ffmpeg,['-v','error','-i',fileURLToPath(file),'-f','f32le','-ar','48000','-ac','1','pipe:1'],{maxBuffer:32*1024*1024,windowsHide:true});
    assert.equal(decoded.status,0,decoded.stderr?.toString());
    const samples=new Float32Array(decoded.stdout.buffer,decoded.stdout.byteOffset,decoded.stdout.length/4);
    let peak=0;for(const value of samples){assert.ok(Number.isFinite(value));peak=Math.max(peak,Math.abs(value));}
    assert.ok(peak>0&&peak<.95,`${name}/${codec}: ${peak}`);
    for(const sound of Object.values(manifest.sounds).filter(s=>s.group===name)){
      assert.ok(sound.start>=0&&sound.duration>0&&sound.start+sound.duration<=samples.length/48000+.001);
      const id=sound.source.split('/').at(-1).replace('.wav','');
      if(metadata[id].lead!==undefined){
        const start=Math.round(sound.start*48000),end=Math.min(samples.length,Math.round((sound.start+sound.duration)*48000));
        const windows=[];
        for(let i=start;i+240<=end;i+=240){let energy=0;for(let j=i;j<i+240;j++)energy+=samples[j]*samples[j];windows.push(energy);}
        // Soft textures can peak later after lossy encoding; test the first substantial sound, not a late noise peak.
        const onset=windows.findIndex(energy=>energy>=Math.max(...windows)*.25)*.005;
        assert.ok(onset<=metadata[id].lead+.045,`${id}/${codec} impact starts too late: ${onset}s`);
      }
      if(name==='amb-meadow'){
        const end=Math.min(samples.length-1,Math.round((sound.start+sound.duration)*48000)-1);
        assert.ok(Math.abs(samples[Math.round(sound.start*48000)]-samples[end])<.02,`${codec} ambient seam`);
      }
    }
  }
});
