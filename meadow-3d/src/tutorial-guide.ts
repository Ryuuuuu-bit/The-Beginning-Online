import {keyLabel,loadGameData} from '@the-beginning-online/shared';
import {KEYS} from './keys';
import {GATES,GATE_CAPTAIN,CITY_BUILDINGS,LAYOUTS,gateRoute,type MapId} from '@the-beginning-online/shared/maps';
import {readGuideProgress} from './guide-progress';
import './tutorial-guide.css';

/**
 * Early-game navigator: one small glass card that teaches the first steps one at a time, an arrow on screen
 * toward the next goal and a ring on the minimap. It never pauses the game or takes clicks away from the world.
 * Progress is kept per character in localStorage (tn-guide:<characterId>), so it does not repeat.
 */
type Point={x:number;z:number;label:string;kind?:string};
interface Ctx{map:MapId;p:any;game:any;mobile:boolean;quests:{active:Record<string,{progress:number[]}>;done:Record<string,number>}}
interface Step{id:string;title:string;text:(c:Ctx)=>string;target?:(c:Ctx)=>Point|null;focus?:string;start?:(c:Ctx,s:any)=>void;done:(c:Ctx,s:any)=>boolean}
export interface GuideOptions{characterId:string;started:()=>boolean;map:()=>MapId;game:()=>any;project:(x:number,z:number,y:number)=>{x:number;y:number};autoPotionOn:()=>boolean;quests:()=>Ctx['quests']|undefined;onOpen:()=>void;navigate:(point:{x:number;z:number;kind:string;name:string})=>void}

const learnedTotal=(p:any)=>Object.values(p.skills||{}).reduce((a:number,b:any)=>a+(Number(b)||0),0);
/** The gate on the current map that leads toward `dest` (city sits between the meadow and the forest). */
function gateToward(map:MapId,dest:MapId):Point|null{
 if(map===dest)return null;
 const step=gateRoute(map,dest)[0];if(!step)return null;
 const at=(GATES[map] as Record<string,{x:number;z:number}>)[step.gate];
 return {...at,kind:'gate:'+step.gate,label:'ประตู'+({north:'เหนือ',south:'ใต้',east:'ตะวันออก',west:'ตะวันตก'} as Record<string,string>)[step.gate]};
}
const firstQuest=loadGameData().quests.quests.find(q=>q.id==='guard_first_hunt')!;
const firstObjective=firstQuest.objectives[0],firstMonsters=new Set(firstObjective.kind==='kill'?firstObjective.monsters:[]);
const nearestMonster=(c:Ctx):Point|null=>{let best:any=null,d=Infinity;for(const e of c.game.enemies)if(!e.dead&&firstMonsters.has(e.dataId)){const n=Math.hypot(e.x-c.p.x,e.z-c.p.z);if(n<d){d=n;best=e;}}if(!best)best=LAYOUTS[c.map].spawns.find(e=>firstMonsters.has(e.dataId));return best?{x:best.x,z:best.z,kind:'hunt',label:firstObjective.label}:null;};
const inField=(c:Ctx)=>c.map!=='city_plaza';
const FIRST='guard_first_hunt',took=(c:Ctx)=>!!c.quests.active[FIRST]||c.quests.done[FIRST]!==undefined;
const actionLabel=(s:Step)=>({skill:'ดูแถบสกิล',auto:'เปิด / ปิด AUTO',bag:'เปิดกระเป๋า',learn:'เปิดสมุดสกิล',potion:'ดื่มยา HP',home:'กลับเมือง',mail:'เปิดกล่องจดหมาย',explore:'เปิดบันทึกการเดินทาง'}[s.id]??'เปิดหน้าต่าง');

const STEPS:Step[]=[
 {id:'move',title:'ก้าวแรก',text:c=>c.mobile?'ลากจอยสติ๊กมุมซ้ายล่างเพื่อเดิน หรือแตะพื้นที่อยากไป':'เดินด้วย WASD / ลูกศร หรือคลิกที่พื้นเพื่อเดินไป',
  start:(c,s)=>{s.x=c.p.x;s.z=c.p.z;},done:(c,s)=>Math.hypot(c.p.x-s.x,c.p.z-s.z)>4},
 {id:'talk',title:'รับภารกิจแรก',text:()=>'ไปคุยกับหัวหน้าทหารประตู รับเควสต์ “ล่าครั้งแรกนอกกำแพง” · กดนำทางเพื่อเดินไปคุยได้เลย',
  target:c=>c.map==='city_plaza'?{...GATE_CAPTAIN,kind:'guard',label:'หัวหน้าทหารประตู'}:gateToward(c.map,'city_plaza'),done:c=>took(c)},
 {id:'gate',title:'ออกสู่ทุ่งวุ้นจิ๋ว',text:()=>'เดินออกประตูใต้ของเมืองเพื่อไปทุ่งวุ้นจิ๋ว (ระดับ 1–5)',
  target:c=>gateToward(c.map,'meadow'),done:c=>c.map==='meadow'},
 {id:'attack',title:'ปราบมอนสเตอร์',text:c=>c.mobile?'แตะวุ้นเพื่อเลือกเป้าหมาย แล้วกดปุ่มโจมตี ⚔ ปราบให้ได้ 1 ตัว':'คลิกวุ้นเพื่อเข้าหาและโจมตี (หรือกด Space / คลิกซ้ายค้าง) ปราบให้ได้ 1 ตัว',
  target:c=>c.map==='meadow'?nearestMonster(c):gateToward(c.map,'meadow'),start:(c,s)=>{s.kills=c.game.kills;},done:(c,s)=>c.game.kills>s.kills},
 {id:'skill',title:'ใช้สกิล',text:c=>c.mobile?'แตะสกิลในแถบด้านล่างใส่มอนสเตอร์ใกล้ ๆ':'กดปุ่ม 1–5 หรือคลิกสกิลในแถบด้านล่างใส่มอนสเตอร์ใกล้ ๆ',
  target:c=>c.map==='meadow'?nearestMonster(c):gateToward(c.map,'meadow'),focus:'#job-hotbar',done:(c,s)=>!!s.cast},
 {id:'auto',title:'เปิดออโต้',text:()=>`กด ${keyLabel(KEYS.auto[0])} หรือปุ่ม AUTO เพื่อออโต้ล่ามอนสเตอร์ · เดินหรือกด Esc เพื่อหยุด`,
  target:c=>gateToward(c.map,'meadow'),focus:'#auto-hunt',done:c=>!!c.p.auto},
 {id:'bag',title:'เปิดกระเป๋าดูของ',text:c=>c.mobile?'เปิดกระเป๋าจากเมนูเพื่อดูของที่ได้ · เปิด “เก็บของอัตโนมัติ” ในกระเป๋าเพื่อเก็บของดรอปใกล้ตัว':'กด I เปิดกระเป๋าดูของที่ได้ · เปิด “เก็บของอัตโนมัติ” ในกระเป๋าเพื่อเก็บของดรอปใกล้ตัว',
  focus:'#inventory-button',done:()=>!!document.querySelector('#inventory-window[open]')},
 {id:'learn',title:'เรียนสกิล',text:c=>c.p.skillPoints>0?`มีแต้มสกิล ${c.p.skillPoints} แต้ม · เปิดสมุดสกิล (${keyLabel(KEYS.skills[0])}) เลือกสกิล แล้วกดยืนยันเรียน`:'เปิดสมุดสกิลดูผังความชำนาญทั้ง 7 ศาสตร์ · ใช้อาวุธและสกิลเพื่อพัฒนาความชำนาญ แล้วลากสกิลที่เรียนแล้วลงแถบ',
  focus:'#skills-button',start:(c,s)=>{s.learned=learnedTotal(c.p);},done:(c,s)=>learnedTotal(c.p)>s.learned||(c.p.skillPoints<=0&&!!document.querySelector('#skills-window[open]'))},
 {id:'potion',title:'ยาฟื้นพลัง',text:c=>c.mobile?'แตะปุ่ม ✚ เพื่อดื่มยาแดง หรือตั้ง “เติมยาอัตโนมัติ” ในเมนู ตั้งค่า':`กด ${keyLabel(KEYS.potion[0])} ดื่มยา HP · ${keyLabel(KEYS.manaPotion[0])} ดื่มยา MP · ตั้งเติมยาอัตโนมัติได้ที่ตั้งค่า AUTO`,
  focus:'[data-action="potion"]',start:(c,s)=>{s.potions=c.p.potions;},done:(c,s)=>!!s.drank||c.p.potions<s.potions||!!s.autoPotion},
 {id:'home',title:'กลับเมือง',text:c=>c.map==='city_plaza'?'ถึงเมืองแล้ว':`กด${c.mobile?'ปุ่ม ⌂':' H'} เพื่อร่ายกลับเมือง หรือเดินตามป้ายกลับเมือง · นักบวชหมอข้างน้ำพุฟื้นพลังให้ฟรี`,
  target:c=>gateToward(c.map,'city_plaza'),focus:'#return-city',start:(c,s)=>{s.away=inField(c);},done:(c,s)=>{if(inField(c))s.away=true;return s.away&&c.map==='city_plaza';}},
 {id:'turnin',title:'ส่งเควสต์แรก',text:c=>{const a=c.quests.active[FIRST];if(!a)return 'คุยกับหัวหน้าทหารประตูเพื่อรับและส่งเควสต์ “ล่าครั้งแรกนอกกำแพง” · เควสต์ทั้งหมดดูได้ในบันทึกการเดินทาง';const n=a.progress[0]??0;return n>=8?'ปราบวุ้นครบแล้ว · กลับไปส่งเควสต์ที่หัวหน้าทหารประตู รับยาและเงินรางวัล':`ปราบวุ้นจิ๋วให้ครบ ${n}/8 ตัว แล้วกลับมาส่งที่หัวหน้าทหารประตู`;},
  target:c=>{const a=c.quests.active[FIRST];if(a&&(a.progress[0]??0)<8)return c.map==='meadow'?nearestMonster(c):gateToward(c.map,'meadow');return c.map==='city_plaza'?{...GATE_CAPTAIN,kind:'guard',label:'หัวหน้าทหารประตู'}:gateToward(c.map,'city_plaza');},
  done:c=>c.quests.done[FIRST]!==undefined},
 {id:'mail',title:'รางวัลทุกเลเวล',text:()=>'เปิดกล่องจดหมายจากเมนู รับยาและรางวัลเลเวลย้อนหลังได้ · ขนาดยาตามเลเวลตอนรับ · ทองพิเศษทุก 5 เลเวล',focus:'#mailbox-button',done:()=>!!document.querySelector('#mailbox-window[open]')},
 {id:'explore',title:'พร้อมออกเดินทาง',text:()=> 'กด M เปิดแผนที่โลก · Lv.1–5 ทุ่งวุ้นจิ๋ว → Lv.5–10 ป่าหมอก → Lv.10–15 ซากนคร → Lv.15–20 หุบเขาหิน · รับเควสต์และกดนำทางไปเป้าหมายได้จากบันทึกการเดินทาง',focus:'#quest-button',done:(_c,s)=>!!s.opened||!!document.querySelector('#world-map[open]')},
 {id:'forge',title:'ย่อยของและคราฟต์',text:()=> 'สะสมเศษผลึกช่างจากเควสต์หรือย่อยอุปกรณ์เหลือใช้ แล้วคราฟต์หินตีบวกที่ศิลา · เปิดแท็บ “คราฟต์” หรือ “ย่อยของ” · ของเริ่มต้นและของแจกย่อยไม่ได้',
  target:c=>c.map==='city_plaza'?{...CITY_BUILDINGS.find(b=>b.id==='forge')!.talk,kind:'forge',label:'ศิลา · ช่างตีเหล็ก'}:gateToward(c.map,'city_plaza'),
  done:()=>!!document.querySelector('#inventory-window[open][data-tab=craft],#inventory-window[open][data-tab=salvage]')},
];

export function mountTutorialGuide(o:GuideOptions){
 const key='tn-guide:'+o.characterId;
 let saved:{step:number;off?:boolean;min?:boolean}|null=null;
 try{saved=readGuideProgress(localStorage.getItem(key),STEPS.length);}catch{}
 let step=saved?.step??0,off=!!saved?.off,min=!!saved?.min,state:any=null,decided=!!saved;
 const save=()=>{try{localStorage.setItem(key,JSON.stringify({step,off,min}));}catch{}};
 const mobile=()=>false; // PC gameplay only; window width does not select touch instructions.

 const panel=document.createElement('aside');panel.id='guide-nav';panel.hidden=true;panel.setAttribute('aria-label','คู่มือขั้นตอนปัจจุบัน');
 panel.innerHTML='<header><button class="gn-toggle" aria-expanded="true"><span class="gn-badge">GUIDE</span><b class="gn-title"></b><small class="gn-count"></small></button><button class="gn-close" aria-label="ซ่อนคำแนะนำ" title="เปิดกลับได้จากเมนู คู่มือนักผจญภัย">×</button></header><p class="gn-text"></p><p class="gn-destination"></p><div class="gn-track" role="progressbar" aria-label="ความคืบหน้าคู่มือ"><i></i></div><div class="gn-actions"><button type="button" class="gn-go">นำทางไปเป้าหมาย ↗</button><button type="button" class="gn-open">เปิดหน้าต่าง</button></div><footer><button class="gn-library">ดูคู่มือทั้งหมด</button><button class="gn-skip">ข้ามขั้นนี้</button></footer>';
 const library=document.createElement('dialog');library.id='adventure-guide';library.setAttribute('aria-labelledby','ag-title');
 library.innerHTML='<header><div><small>ADVENTURER’S HANDBOOK</small><h2 id="ag-title">คู่มือนักผจญภัย</h2><p>เรียนรู้ทีละก้าว แล้วออกไปค้นพบโลกของคุณ</p></div><button type="button" class="ag-close" aria-label="ปิดคู่มือนักผจญภัย">×</button></header><div class="ag-layout"><nav aria-label="บทเรียนเริ่มต้น"></nav><article><span class="ag-chapter"></span><h3></h3><p class="ag-copy"></p><p class="ag-target"></p><div class="ag-actions"><button type="button" class="ag-go">นำทางไปเป้าหมาย ↗</button><button type="button" class="ag-open">เปิดหน้าต่าง</button><button type="button" class="ag-track">ติดตามขั้นตอนนี้</button></div><aside>เดินทางอัตโนมัติหยุดได้ด้วยการเดินเองหรือ Esc · เกมยังดำเนินต่อระหว่างเปิดคู่มือ</aside></article></div><footer><span class="ag-progress"></span><button type="button" class="ag-resume">ติดตามขั้นตอนปัจจุบัน</button></footer>';
 document.body.append(library);
 let selected=step<STEPS.length?step:0,lastLibrary='',nextDraw=0;
 const arrow=document.createElement('div');arrow.id='guide-arrow';arrow.hidden=true;arrow.setAttribute('aria-hidden','true');arrow.innerHTML='<i></i><span></span>';
 const toast=document.createElement('div');toast.id='guide-step-toast';toast.setAttribute('role','status');
 const ui=document.querySelector('#ui')!;ui.append(panel,arrow,toast);
 const q=<T extends HTMLElement>(s:string)=>panel.querySelector<T>(s)!;
 q('.gn-title').setAttribute('aria-live','polite');
 let focused:Element|null=null;
 const setFocus=(sel?:string)=>{const el=sel?document.querySelector(sel):null;if(el===focused)return;focused?.classList.remove('guide-focus');focused=el;el?.classList.add('guide-focus');};
 const ctx=():Ctx=>({map:o.map(),p:o.game().p,game:o.game(),mobile:mobile(),quests:o.quests()??{active:{},done:{}}});
 const begin=()=>{state={};STEPS[step]?.start?.(ctx(),state);};
 let toastTimer:ReturnType<typeof setTimeout>;
 const advance=(skipped=false)=>{const done=STEPS[step];step++;save();if(done&&!skipped){toast.textContent=`✓ ${done.title}`;toast.classList.remove('show');void toast.offsetWidth;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2200);}state=null;};
 q('.gn-skip').onclick=()=>advance(true);
 q('.gn-close').onclick=()=>{off=true;save();};
 q('.gn-toggle').onclick=()=>{min=!min;save();};
 const openLibrary=()=>{o.onOpen();selected=Math.min(step,STEPS.length-1);lastLibrary='';drawLibrary(ctx());if(!library.open)library.showModal();};
 const go=(index:number)=>{const t=STEPS[index].target?.(ctx());if(!t)return;library.close();o.navigate({...t,kind:t.kind??'hunt',name:t.label});};
 const openAction=(index:number)=>{const s=STEPS[index];if(!s.focus)return;library.close();document.querySelector<HTMLElement>(s.focus)?.click();if(index===step&&state)state.opened=true;};
 q('.gn-go').onclick=()=>go(step);q('.gn-open').onclick=()=>openAction(step);q('.gn-library').onclick=openLibrary;
 library.querySelector<HTMLButtonElement>('.ag-close')!.onclick=()=>library.close();
 library.querySelector<HTMLButtonElement>('.ag-go')!.onclick=()=>go(selected);
 library.querySelector<HTMLButtonElement>('.ag-open')!.onclick=()=>openAction(selected);
 const track=(index:number)=>{step=index;off=false;min=false;decided=true;state=null;save();library.close();};
 library.querySelector<HTMLButtonElement>('.ag-track')!.onclick=()=>track(selected);
 library.querySelector<HTMLButtonElement>('.ag-resume')!.onclick=()=>track(Math.min(step,STEPS.length-1));
 for(const [index,s] of STEPS.entries()){
  const b=document.createElement('button');b.type='button';b.innerHTML=`<span>${String(index+1).padStart(2,'0')}</span><b>${s.title}</b><small></small>`;
  b.onclick=()=>{selected=index;lastLibrary='';drawLibrary(ctx());};library.querySelector('nav')!.append(b);
 }
 const launcher=document.createElement('button');launcher.type='button';launcher.id='menu-guide';launcher.innerHTML='<span aria-hidden="true">✧</span><span><b>คู่มือนักผจญภัย</b><small>เริ่มต้นเล่น · บทเรียน · นำทาง</small></span><span aria-hidden="true">↗</span>';
 document.querySelector('#game-menu-window .menu-exit')?.before(launcher);
 launcher.onclick=()=>{document.querySelector<HTMLDialogElement>('#game-menu-window')?.close();openLibrary();};

 // Settings entry to bring the guide back after closing it, or to start over.
 const restart=document.createElement('button');restart.id='guide-restart';restart.textContent='คู่มือนำทางมือใหม่';
 restart.onclick=()=>{(document.querySelector('#settings-window') as HTMLDialogElement|null)?.close();openLibrary();};
 restart.className='settings-action';restart.textContent='เปิดคู่มือนำทางมือใหม่';
 document.querySelector('#settings-window .settings-help-host')?.append(restart);

 function drawLibrary(c:Ctx){
  if(!c.p)return;
  const s=STEPS[selected],target=s.target?.(c),copy=s.text(c),signature=JSON.stringify([selected,step,off,copy,target?.label]);
  if(signature===lastLibrary)return;lastLibrary=signature;
  library.querySelector('.ag-chapter')!.textContent=`บทเรียน ${String(selected+1).padStart(2,'0')} / ${STEPS.length}`;
  library.querySelector('h3')!.textContent=s.title;library.querySelector('.ag-copy')!.textContent=copy;
  library.querySelector('.ag-target')!.textContent=target?'⌖ '+target.label:'✧ ทำตามคำแนะนำได้จากหน้าจอเล่น';
  library.querySelector<HTMLButtonElement>('.ag-go')!.hidden=!target;
  library.querySelector<HTMLButtonElement>('.ag-open')!.hidden=!s.focus;library.querySelector('.ag-open')!.textContent=actionLabel(s);
  library.querySelector('.ag-progress')!.textContent=`ผ่านขั้นตอน ${step} / ${STEPS.length}${off?' · ซ่อนคำแนะนำอยู่':''}`;
  library.querySelectorAll('nav button').forEach((b,i)=>{b.setAttribute('aria-current',i===selected?'step':'false');b.classList.toggle('ag-passed',i<step);b.querySelector('small')!.textContent=i<step?'✓':i===step?'กำลังเรียน':'';});
 }

 function draw(c:Ctx){
  const s=STEPS[step];
  q('.gn-title').textContent=s.title;q('.gn-count').textContent=`${step+1}/${STEPS.length}`;
  const text=s.text(c);if(q('.gn-text').textContent!==text)q('.gn-text').textContent=text;
  q<HTMLElement>('.gn-track i').style.width=`${step/STEPS.length*100}%`;
  q('.gn-track').setAttribute('aria-valuenow',String(step));q('.gn-track').setAttribute('aria-valuemin','0');q('.gn-track').setAttribute('aria-valuemax',String(STEPS.length));
  const target=s.target?.(c);q('.gn-go').hidden=!target;q('.gn-open').hidden=!s.focus;q('.gn-open').textContent=actionLabel(s);
  q('.gn-destination').textContent=target?`⌖ ${target.label} · ${Math.round(Math.hypot(target.x-c.p.x,target.z-c.p.z))} ม.`:'';
  panel.classList.toggle('min',min);q('.gn-toggle').setAttribute('aria-expanded',String(!min));
 }
 function point(c:Ctx,t:Point|null){
  if(!t||min){arrow.hidden=true;return;}
  const s=o.project(t.x,t.z,1.6),W=innerWidth,H=innerHeight,m=mobile()?56:70;
  const on=s.x>m&&s.x<W-m&&s.y>m+40&&s.y<H-m-90;arrow.hidden=false;arrow.classList.toggle('edge',!on);
  const dist=Math.round(Math.hypot(t.x-c.p.x,t.z-c.p.z));arrow.querySelector('span')!.textContent=on?t.label:`${t.label} · ${dist} ม.`;
  if(on){arrow.style.left=s.x+'px';arrow.style.top=(s.y-34)+'px';arrow.style.setProperty('--rot','180deg');return;}
  // Clamp to an inset rectangle on the ray from the screen centre toward the target.
  // The bottom inset clears the hotbar and wallet line.
  const cx=W/2,cy=H/2,dx=s.x-cx,dy=s.y-cy,hw=W/2-m,hh=dy<0?H/2-m-40:H/2-m-(mobile()?150:130),k=Math.min(Math.abs(hw/(dx||1e-6)),Math.abs(hh/(dy||1e-6)));
  const half=arrow.offsetWidth/2+4;arrow.style.left=Math.max(half,Math.min(W-half,cx+dx*k))+'px';arrow.style.top=(cy+dy*k)+'px';arrow.style.setProperty('--rot',`${Math.atan2(dy,dx)*180/Math.PI+90}deg`);
 }
 function minimap(t:Point|null,map:MapId){
  const canvas=document.querySelector<HTMLCanvasElement>('#map'),v=(canvas as any)?.view;if(!t||!canvas||!v||min)return;
  const l=LAYOUTS[map],x=v.k*((t.x+l.halfX)/(l.halfX*2)*160)+v.ox,y=v.k*((t.z+l.halfZ)/(l.halfZ*2)*132)+v.oy,R=canvas.width/2;
  const ctx=canvas.getContext('2d')!;ctx.save();ctx.setTransform(1,0,0,1,0,0);
  const dx=x-R,dy=y-R,d=Math.hypot(dx,dy),pulse=4+2*Math.sin(performance.now()/180);
  if(d<R-10){ctx.strokeStyle='#ffe39a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,6+pulse,0,Math.PI*2);ctx.stroke();}
  else{const a=Math.atan2(dy,dx),r=R-9;ctx.translate(R+Math.cos(a)*r,R+Math.sin(a)*r);ctx.rotate(a);ctx.fillStyle='#ffe39a';ctx.strokeStyle='#132b27';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(-5,-6);ctx.lineTo(-5,6);ctx.closePath();ctx.fill();ctx.stroke();}
  ctx.restore();
 }
 return {
  /** Own-player events (main.ts forwards e.playerId===you). */
  event(e:any){if(!state)return;if(e.type==='skill')state.cast=true;if(e.type==='autoPotion')state.drank=true;},
  update(){
   const c=ctx(),active=o.started()&&!off&&step<STEPS.length&&!!c.p;
   if(library.open)drawLibrary(c);
   // Established characters opt in from the menu instead of being interrupted by the opening.
   if(active&&!decided&&c.p.level>0){decided=true;if(c.p.level>=8){off=true;save();panel.hidden=true;arrow.hidden=true;return;}}
   if(!active||step>=STEPS.length){panel.hidden=true;arrow.hidden=true;setFocus();return;}
   const ctl=document.querySelector<HTMLElement>('#control-hints');if(ctl)ctl.hidden=true;
   if(!state)begin();
   if(o.autoPotionOn())state.autoPotion=true;
   if(STEPS[step].done(c,state)){advance();if(step>=STEPS.length)return;begin();}
   const s=STEPS[step],t=s.target?.(c)??null;
   panel.hidden=!!document.querySelector('dialog[open]');
   if(performance.now()>=nextDraw){draw(c);nextDraw=performance.now()+250;}
   point(c,panel.hidden?null:t);minimap(panel.hidden?null:t,c.map);setFocus(min||panel.hidden?undefined:s.focus);
  },
 };
}
