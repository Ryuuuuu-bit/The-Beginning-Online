import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {drawWarpPortal,prepareWarpPortal} from '../src/warp-portal.ts';

test('portal layers match their provenance and retain transparent PNG pixels',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../art/warp-portal-v1/provenance.json',import.meta.url),'utf8'));
 const buildContext=readFileSync(new URL('../../.dockerignore',import.meta.url),'utf8');
 for(const layer of manifest.layers){
  assert(buildContext.includes('!meadow-3d/art/warp-portal-v1/'+layer.file),'Railway build context must contain '+layer.file);
  const image=readFileSync(new URL('../art/warp-portal-v1/'+layer.file,import.meta.url));
  assert.equal(createHash('sha256').update(image).digest('hex'),layer.sha256);
  assert.equal(image.readUInt32BE(16),layer.width);assert.equal(image.readUInt32BE(20),layer.height);
  assert.equal(image[25],6,'RGBA PNG');assert(layer.alpha.transparentPixels>0&&layer.alpha.partialPixels>0);
  assert(image.length<3000000);
 }
 assert.equal(manifest.layers.length,2);
});

test('floor follows the ground projection, column meets the gate center, and motion preferences are respected',t=>{
 const previous=globalThis.document;let canvases=0;
 t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
 globalThis.document={createElement(){canvases++;return {getContext:()=>({drawImage(){},fillRect(){},createRadialGradient(){return {addColorStop(){}};}})};}};
 const art=prepareWarpPortal({width:1217,height:1293},{width:1254,height:1254});
 for(const image of [art.column,art.floor])assert(Math.max(image.width,image.height)<=512);
 const calls=[];
 const context=new Proxy({}, {get:(_,key)=>(...args)=>calls.push([key,...args]),set:(_,key,value)=>{calls.push([key,value]);return true;}});
 const draw=(time,reduced=false)=>{
  calls.length=0;
  for(const layer of ['ground','light'])drawWarpPortal(context,art,320,480,30,time,reduced,false,layer);
  assert.equal(calls.filter(c=>c[0]==='save').length,2);assert.equal(calls.filter(c=>c[0]==='restore').length,2);
  for(const c of calls)for(const n of c)if(typeof n==='number')assert(Number.isFinite(n));
  return [...calls];
 };
 const still=draw(0,true);assert.deepEqual(draw(45,true),still);
 assert.notDeepEqual(draw(1),draw(2));
 for(let i=0;i<1000;i++)draw(i/200);
 assert.equal(canvases,3,'rendering reuses prepared floor, column and contact atlas');
 const floor=calls.find(c=>c[0]==='drawImage'&&c[1]===art.floor),column=calls.find(c=>c[0]==='drawImage'&&c[1]===art.column);
 assert.equal(floor[2]+floor[4]/2,0);assert.equal(floor[3]+floor[5]/2,0);
 assert(calls.some(c=>c[0]==='translate'&&c[1]===320&&c[2]===480));
 assert(calls.some(c=>c[0]==='scale'&&c[1]===1&&c[2]===Math.SQRT1_2));
 assert(Math.abs(column[3]+column[5]*.96-480)<1e-9,'column origin stays at the gate center');
 assert(!calls.some(c=>c[0]==='filter'||c[0]==='shadowBlur'||c[0].startsWith('create')));
});
