export interface MinimapView {k:number;ox:number;oy:number}
/** Clamp the same map-space transform used by terrain, markers, routes and hit testing. */
export function minimapView(size:number,k:number,x:number,y:number,width=160,height=132):MinimapView{
 k=Math.max(k,size/width,size/height);
 const half=size/(2*k),clamp=(v:number,max:number)=>Math.max(half,Math.min(max-half,v));
 return {k,ox:size/2-k*clamp(x,width),oy:size/2-k*clamp(y,height)};
}
export const minimapToMap=(view:MinimapView,x:number,y:number)=>({x:(x-view.ox)/view.k,y:(y-view.oy)/view.k});
export function minimapPlayer(size:number,view:MinimapView,x:number,y:number){
 const dx=x*view.k+view.ox-size/2,dy=y*view.k+view.oy-size/2,d=Math.hypot(dx,dy),radius=size/2-9;
 const scale=d>radius?radius/d:1;
 return {x:size/2+dx*scale,y:size/2+dy*scale,outside:d>size/2,bearing:Math.atan2(dy,dx)+Math.PI/2};
}
/** At a rectangular world's corner the player can lie beyond the circular viewport. */
export function paintMinimapPlayer(ctx:CanvasRenderingContext2D,size:number,view:MinimapView,x:number,y:number,heading:number){
 const p=minimapPlayer(size,view,x,y);ctx.save();
 try{
  ctx.setTransform(1,0,0,1,0,0);ctx.translate(p.x,p.y);
  if(p.outside){ctx.fillStyle='#102921';ctx.strokeStyle='#dfc78a';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.fill();ctx.stroke();}
  ctx.rotate(p.outside?p.bearing:heading);ctx.fillStyle='#fff';ctx.strokeStyle='#132b27';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(4,5);ctx.lineTo(0,3);ctx.lineTo(-4,5);ctx.closePath();ctx.fill();ctx.stroke();
 }finally{ctx.restore();}
 return p.outside;
}
/** Each layer owns its clip, so UI markers cannot escape and clips cannot accumulate. */
export function paintMinimapLayer(ctx:CanvasRenderingContext2D,size:number,view:MinimapView,draw:()=>void,background?:string){
 ctx.save();
 try{
  ctx.setTransform(1,0,0,1,0,0);ctx.beginPath();ctx.arc(size/2,size/2,size/2,0,Math.PI*2);ctx.clip();
  if(background){ctx.fillStyle=background;ctx.fillRect(0,0,size,size);}
  ctx.setTransform(view.k,0,0,view.k,view.ox,view.oy);draw();
 }finally{ctx.restore();}
}
