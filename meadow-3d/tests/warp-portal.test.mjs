import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {drawWarpPortal,prepareWarpPortal} from '../src/warp-portal.ts';

test('portal layers match their provenance and retain transparent PNG pixels',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../art/warp-portal-v1/provenance.json',import.meta.url),'utf8'));
 for(const layer of manifest.layers){
  const image=readFileSync(new URL('../art/warp-portal-v1/'+layer.file,import.meta.url));
  assert.equal(createHash('sha256').update(image).digest('hex'),layer.sha256);
  assert.equal(image.readUInt32BE(16),layer.width);assert.equal(image.readUInt32BE(20),layer.height);
  assert.equal(image[25],6,'RGBA PNG');assert(layer.alpha.transparentPixels>0&&layer.alpha.partialPixels>0);
  assert(image.length<3000000);
 }
 assert.equal(manifest.layers.length,2);
});

test('warp stays on the ground, visibly rotates without a column, and reduced motion keeps positions still',t=>{
 const previous=globalThis.document;let canvases=0;
 t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
 globalThis.document={createElement(){canvases++;return {getContext:()=>({drawImage(){},fillRect(){},createRadialGradient(){return {addColorStop(){}};}})};}};
 const art=prepareWarpPortal({width:1254,height:1254});
 for(const image of [art.floor])assert(Math.max(image.width,image.height)<=512);
 const calls=[];
 const context=new Proxy({}, {get:(_,key)=>(...args)=>calls.push([key,...args]),set:(_,key,value)=>{calls.push([key,value]);return true;}});
 const draw=(time,reduced=false)=>{
  calls.length=0;
  for(const layer of ['ground','light'])drawWarpPortal(context,art,320,480,30,time,reduced,false,layer);
  assert.equal(calls.filter(c=>c[0]==='save').length,2);assert.equal(calls.filter(c=>c[0]==='restore').length,2);
  for(const c of calls)for(const n of c)if(typeof n==='number')assert(Number.isFinite(n));
  return [...calls];
 };
 const still=draw(0,true),reduced=draw(45,true);assert.deepEqual(reduced.filter(c=>!['globalAlpha'].includes(c[0])),still.filter(c=>!['globalAlpha'].includes(c[0])),'reduced motion has no rotation or travel');
 assert.notDeepEqual(draw(1),draw(2));
 for(let i=0;i<1000;i++)draw(i/200);
 assert.equal(canvases,2,'rendering reuses floor and contact with no column image');
 const floor=calls.find(c=>c[0]==='drawImage'&&c[1]===art.floor);assert(calls.filter(c=>c[0]==='drawImage').every(c=>[art.floor,art.contact].includes(c[1])));
 assert.equal(floor[2]+floor[4]/2,0);assert.equal(floor[3]+floor[5]/2,0);
 assert(calls.some(c=>c[0]==='translate'&&c[1]===320&&c[2]===480));
 assert(calls.some(c=>c[0]==='scale'&&c[1]===1&&c[2]===Math.SQRT1_2));
 assert(calls.some(c=>c[0]==='rotate'&&Math.abs(c[1]-999/200*.65)<1e-9),'rune disc rotates fast enough to be visible');
 const heads=calls.filter(c=>c[0]==='arc'&&c[3]===3&&c[4]===0&&c[5]===Math.PI*2);
 assert.equal(heads.length,3,'three bright orbiting heads remain legible at gameplay scale');
 const earlier=draw(4).filter(c=>c[0]==='arc'&&c[3]===3);
 const later=draw(4.5).filter(c=>c[0]==='arc'&&c[3]===3);
 assert(Math.hypot(later[0][1]-earlier[0][1],later[0][2]-earlier[0][2])>40,'a head travels visibly within half a second');
 assert(!calls.some(c=>c[0]==='filter'||c[0]==='shadowBlur'||c[0].startsWith('create')));
});
