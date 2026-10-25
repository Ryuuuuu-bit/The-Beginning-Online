import type {Sprite} from './city-2d-art';
import {GATES} from '@the-beginning-online/shared/maps';
import {gateApproach} from './hud-path.ts';

type LightItem={assetId:string;x:number;z:number;scale:number;facing?:number;flip?:boolean};
type Project=(x:number,z:number)=>{x:number;y:number};
const windowGlows=new WeakMap<Sprite,Sprite>();
export function windowEmission(r:number,g:number,b:number){
 return r>145&&g>75&&r>g*1.2&&g>b*1.5?Math.min(140,(r-g)*2):0;
}
/** Extract painted windows and flames only; stone and foliage keep their original shadows. */
export function cityWindowGlow(image:Sprite):Sprite{
 const cached=windowGlows.get(image);if(cached)return cached;
 const pad=10,mask=document.createElement('canvas');mask.width=image.width;mask.height=image.height;
 const m=mask.getContext('2d')!;m.drawImage(image,0,0);const pixels=m.getImageData(0,0,mask.width,mask.height);
 for(let i=0;i<pixels.data.length;i+=4){const p=pixels.data,alpha=windowEmission(p[i],p[i+1],p[i+2])*p[i+3]/255;p[i]=255;p[i+1]=188;p[i+2]=83;p[i+3]=alpha;}
 m.putImageData(pixels,0,0);
 const glow=document.createElement('canvas') as Sprite;glow.width=image.width+pad*2;glow.height=image.height+pad*2;
 glow.left=image.left-pad/28;glow.top=image.top-pad/28;
 const c=glow.getContext('2d')!;c.filter='blur(4px)';c.drawImage(mask,pad,pad);windowGlows.set(image,glow);return glow;
}
export function drawCityWindowGlow(c:CanvasRenderingContext2D,glow:Sprite|undefined,x:number,y:number,s:number){
 if(!glow)return;c.save();c.globalCompositeOperation='screen';c.drawImage(glow,x+glow.left*s,y+glow.top*s,glow.width/28*s,glow.height/28*s);c.restore();
}

/** Reusable light stamps: no per-frame canvas filters or additional asset downloads. */
export class CityLighting{
 private halo:HTMLCanvasElement;private pool:HTMLCanvasElement;private portal:HTMLCanvasElement;
 private haze?:{width:number;height:number;morning:boolean;image:HTMLCanvasElement};
 constructor(){
  const stamp=(stops:[number,string][])=>{const out=document.createElement('canvas');out.width=out.height=128;const c=out.getContext('2d')!,g=c.createRadialGradient(64,64,0,64,64,64);for(const [at,color] of stops)g.addColorStop(at,color);c.fillStyle=g;c.fillRect(0,0,128,128);return out;};
  this.halo=stamp([[0,'#fff1c9e0'],[.07,'#ffdc88ae'],[.24,'#ffb54148'],[1,'#f4a23b00']]);
  this.pool=stamp([[0,'#ffd18a70'],[.35,'#e9ad4634'],[1,'#d99d3d00']]);
  this.portal=stamp([[0,'#d5fff2a0'],[.25,'#81dec973'],[.65,'#65b8bf29'],[1,'#65b8bf00']]);
 }
 /** Low-resolution light veil is rebuilt only on resize, never blurred every frame. */
 finish(c:CanvasRenderingContext2D,width:number,height:number,sun:number,high:boolean,hour=10){
  if(sun<=0||!high)return;
  const morning=hour<12;
  if(!this.haze||this.haze.width!==width||this.haze.height!==height||this.haze.morning!==morning){
   const image=document.createElement('canvas');image.width=Math.ceil(width/3);image.height=Math.ceil(height/3);
   const a=image.getContext('2d')!,w=image.width,h=image.height;if(!morning)a.transform(-1,0,0,1,w,0);
   const glow=a.createRadialGradient(w*.12,-h*.18,0,w*.12,-h*.18,w*.85);glow.addColorStop(0,'#ffe6ad24');glow.addColorStop(.45,'#ffdf9810');glow.addColorStop(1,'#ffdf9800');a.fillStyle=glow;a.fillRect(0,0,w,h);
   this.haze={width,height,morning,image};
  }
  c.save();c.globalCompositeOperation='screen';c.globalAlpha=sun*.4;c.drawImage(this.haze.image,0,0,width,height);c.restore();
 }
 draw(c:CanvasRenderingContext2D,items:readonly LightItem[],project:Project,s:number,width:number,height:number,ground=false){
  c.save();c.globalCompositeOperation='screen';
  for(const item of items){
   if(!item.assetId.startsWith('theme:lamp:'))continue;
   const q=project(item.x,item.z),rx=(ground?2.7:.95)*s*item.scale,ry=ground?rx*.48:rx;
   // The lantern hangs beside its post; follow the painted four-direction art.
   q.x+=([0,3].includes(item.facing??0)?-.38:.38)*s*item.scale*(item.flip?-1:1);
   if(!ground)q.y-=1.68*s*item.scale;
   if(q.x+rx<0||q.x-rx>width||q.y+ry<0||q.y-ry>height)continue;
   c.drawImage(ground?this.pool:this.halo,q.x-rx,q.y-ry,rx*2,ry*2);
  }
  c.restore();
 }
 exits(c:CanvasRenderingContext2D,exits:readonly {id:string;name:string}[],project:Project,s:number,time:number,width:number,height:number,reducedMotion:boolean){
  for(const exit of exits){
   const approach=gateApproach(GATES.city_plaza[exit.id]),q=project(approach.x,approach.z);
   if(q.x<-120||q.x>width+120||q.y<-20||q.y>height+4*s)continue;
   c.save();c.globalCompositeOperation='screen';c.globalAlpha=reducedMotion?1:.88+Math.sin(time*1.6)*.12;
   c.drawImage(this.portal,q.x-s*1.5,q.y-s*.5,s*3,s);
   c.drawImage(this.portal,q.x-s*.8,q.y-s*3,s*1.6,s*3);
   c.globalCompositeOperation='source-over';c.globalAlpha=1;
   const lift=reducedMotion?0:Math.sin(time*1.6)*s*.08;
   c.strokeStyle='#f2d69a';c.lineWidth=Math.max(2,s*.07);c.lineCap='round';
   c.beginPath();c.moveTo(q.x-s*.22,q.y-s*.65+lift);c.lineTo(q.x,q.y-s*.4+lift);c.lineTo(q.x+s*.22,q.y-s*.65+lift);c.stroke();
   c.font=`600 ${Math.max(11,Math.min(14,s*.5))}px "Noto Sans Thai",sans-serif`;c.textAlign='center';
   const label=exit.name,w=c.measureText(label).width+18,y=q.y-s*3.15;
   c.fillStyle='#102c2be8';c.fillRect(q.x-w/2,y-15,w,22);c.fillStyle='#f4dfad';c.fillText(label,q.x,y+1);c.restore();
  }
 }
}
