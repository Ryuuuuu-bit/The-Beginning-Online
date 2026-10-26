import test from 'node:test';
import assert from 'node:assert/strict';
import {followCamera} from '../src/camera-follow.ts';

test('camera settling is independent of frame rate and does not overshoot',()=>{
 const results=[];
 for(const hz of [30,60,120,200]){
  let p={x:0,y:0};
  for(let i=0;i<hz*.5;i++){p=followCamera(p,{x:1,y:-1},1/hz);assert(p.x>=0&&p.x<=1&&p.y>=-1&&p.y<=0);}
  results.push(p.x);
 }
 assert(Math.max(...results)-Math.min(...results)<1e-10);
 assert(results[0]>.999);
});

test('initial frame, map/overview reset and large relocations snap without sweeping',()=>{
 const target={x:1,y:2};
 assert.deepEqual(followCamera({x:0,y:0},target,0,true),target);
 assert.deepEqual(followCamera({x:0,y:0},{x:20,y:-30},.005),{x:20,y:-30});
 assert.deepEqual(followCamera({x:0,y:0},target,0),{x:0,y:0});
});

test('camera reduces snapshot velocity steps while keeping follow offset small',()=>{
 const hz=200,dt=1/hz,raw=[],filtered=[];let x=0,p={x:0,y:0};
 for(let i=0;i<hz*4;i++){
  x+=(Math.floor(i/20)%2?5.3:3.6)*dt;
  const next=followCamera(p,{x,y:0},dt);
  if(i>hz){raw.push(Math.floor(i/20)%2?5.3:3.6);filtered.push((next.x-p.x)/dt);assert(x-next.x<.27);}
  p=next;
 }
 const jump=v=>Math.max(...v.slice(1).map((x,i)=>Math.abs(x-v[i])));
 assert(jump(filtered)<jump(raw)*.15);
});
