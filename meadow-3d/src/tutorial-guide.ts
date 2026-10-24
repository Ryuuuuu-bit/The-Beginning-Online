import {keyLabel} from '@the-beginning-online/shared';
import {KEYS} from './keys';
import {GATES,GATE_CAPTAIN,LAYOUTS,gateRoute,type MapId} from '@the-beginning-online/shared/maps';
import jobs from '../../shared/data/jobs.json';
import './tutorial-guide.css';

/**
 * Early-game navigator: one small glass card that teaches the first steps one at a time, an arrow on screen
 * toward the next goal and a ring on the minimap. It never pauses the game or takes clicks away from the world.
 * Progress is kept per character in localStorage (tn-guide:<characterId>), so it does not repeat.
 */
type Point={x:number;z:number;label:string};
interface Ctx{map:MapId;p:any;game:any;mobile:boolean;quests:{active:Record<string,{progress:number[]}>;done:Record<string,number>}}
interface Step{id:string;title:string;text:(c:Ctx)=>string;target?:(c:Ctx)=>Point|null;focus?:string;start?:(c:Ctx,s:any)=>void;done:(c:Ctx,s:any)=>boolean}
export interface GuideOptions{characterId:string;started:()=>boolean;map:()=>MapId;game:()=>any;project:(x:number,z:number,y:number)=>{x:number;y:number};autoPotionOn:()=>boolean;quests:()=>Ctx['quests']|undefined}

const ANGEL={x:jobs.angel.x,z:jobs.angel.z};
const tier=(id:string)=>jobs.jobs.find(j=>j.id===id)?.tier??1;
const learnedTotal=(p:any)=>Object.values(p.skills||{}).reduce((a:number,b:any)=>a+(Number(b)||0),0);
/** The gate on the current map that leads toward `dest` (city sits between the meadow and the forest). */
function gateToward(map:MapId,dest:MapId):Point|null{
 if(map===dest)return null;
 const step=gateRoute(map,dest)[0];if(!step)return null;
 const at=(GATES[map] as Record<string,{x:number;z:number}>)[step.gate];
 return {...at,label:'ประตู'+({north:'เหนือ',south:'ใต้',east:'ตะวันออก',west:'ตะวันตก'} as Record<string,string>)[step.gate]};
}
const nearestMonster=(c:Ctx):Point|null=>{let best:any=null,d=Infinity;for(const e of c.game.enemies)if(!e.dead&&!e.boss){const n=Math.hypot(e.x-c.p.x,e.z-c.p.z);if(n<d){d=n;best=e;}}return best&&d>4?{x:best.x,z:best.z,label:'มอนสเตอร์'}:null;};
const inField=(c:Ctx)=>c.map!=='city_plaza';
const FIRST='guard_first_hunt',took=(c:Ctx)=>!!c.quests.active[FIRST]||c.quests.done[FIRST]!==undefined;

const STEPS:Step[]=[
 {id:'move',title:'ก้าวแรก',text:c=>c.mobile?'ลากจอยสติ๊กมุมซ้ายล่างเพื่อเดิน หรือแตะพื้นที่อยากไป':'เดินด้วย WASD / ลูกศร หรือคลิกที่พื้นเพื่อเดินไป',
  start:(c,s)=>{s.x=c.p.x;s.z=c.p.z;},done:(c,s)=>Math.hypot(c.p.x-s.x,c.p.z-s.z)>4},
 {id:'talk',title:'ทักทายชาวเมือง',text:()=>'เดินไปหาหัวหน้าทหารประตู แล้วกด “คุย” เพื่อรับภารกิจแรก (แตะไอคอน ⚑ บนแผนที่ย่อก็เดินไปเองได้)',
  target:c=>c.map==='city_plaza'?{...GATE_CAPTAIN,label:'หัวหน้าทหารประตู'}:null,done:(c,s)=>took(c)||!!s.talked||inField(c)},
 {id:'gate',title:'ออกสู่ทุ่งวุ้นจิ๋ว',text:()=>'เดินออกประตูใต้ของเมืองเพื่อไปทุ่งวุ้นจิ๋ว (ระดับ 1–5)',
  target:c=>gateToward(c.map,'meadow'),done:c=>inField(c)},
 {id:'attack',title:'ปราบมอนสเตอร์',text:c=>c.mobile?'แตะวุ้นเพื่อเลือกเป้าหมาย แล้วกดปุ่มโจมตี ⚔ ปราบให้ได้ 1 ตัว':'คลิกวุ้นเพื่อเข้าหาและโจมตี (หรือกด Space / คลิกซ้ายค้าง) ปราบให้ได้ 1 ตัว',
  target:c=>inField(c)?nearestMonster(c):gateToward(c.map,'meadow'),start:(c,s)=>{s.kills=c.game.kills;},done:(c,s)=>c.game.kills>s.kills},
 {id:'skill',title:'ใช้สกิล',text:c=>c.mobile?'แตะสกิลในแถบด้านล่างใส่มอนสเตอร์ใกล้ ๆ':'กดปุ่ม 1–5 หรือคลิกสกิลในแถบด้านล่างใส่มอนสเตอร์ใกล้ ๆ',
  target:c=>inField(c)?nearestMonster(c):gateToward(c.map,'meadow'),focus:'#job-hotbar',done:(c,s)=>!!s.cast},
 {id:'auto',title:'เปิดออโต้',text:c=>c.mobile?'แตะปุ่ม ⟳ เพื่อให้ตัวละครล่าเอง · เดินหรือแตะอีกครั้งเพื่อหยุด':'กด F หรือปุ่ม ⟳ เพื่อออโต้ล่ามอนสเตอร์ · เดินหรือกด Esc เพื่อหยุด',
  target:c=>gateToward(c.map,'meadow'),focus:'#auto-hunt',done:c=>!!c.p.auto},
 {id:'bag',title:'เปิดกระเป๋าดูของ',text:c=>c.mobile?'เปิดกระเป๋าจากเมนูเพื่อดูของที่ได้ · เปิด “เก็บของอัตโนมัติ” ในกระเป๋าเพื่อเก็บของดรอปใกล้ตัว':'กด I เปิดกระเป๋าดูของที่ได้ · เปิด “เก็บของอัตโนมัติ” ในกระเป๋าเพื่อเก็บของดรอปใกล้ตัว',
  focus:'#inventory-button',done:()=>!!document.querySelector('#inventory-window[open]')},
 {id:'learn',title:'เรียนสกิล',text:c=>c.p.skillPoints>0?`มีแต้มสกิล ${c.p.skillPoints} แต้ม · เปิดสมุดสกิล${c.mobile?'':' (K)'} เลือกสกิล แล้วกดยืนยันเรียน`:'แต้มสกิลได้จากการเพิ่มระดับอาชีพ · เปิดสมุดสกิลดูสกิลที่เรียนได้ แล้วลากลงแถบ',
  focus:'#skills-button',start:(c,s)=>{s.learned=learnedTotal(c.p);},done:(c,s)=>learnedTotal(c.p)>s.learned||(c.p.skillPoints<=0&&!!document.querySelector('#skills-window[open]'))},
 {id:'potion',title:'ยาฟื้นพลัง',text:c=>c.mobile?'แตะปุ่ม ✚ เพื่อดื่มยาแดง หรือตั้ง “เติมยาอัตโนมัติ” ในเมนู ตั้งค่า':`กด ${keyLabel(KEYS.potion[0])} ดื่มยา HP · ${keyLabel(KEYS.manaPotion[0])} ดื่มยา MP · ตั้งเติมยาอัตโนมัติได้ที่ตั้งค่า AUTO`,
  focus:'[data-action="potion"]',start:(c,s)=>{s.potions=c.p.potions;},done:(c,s)=>!!s.drank||c.p.potions<s.potions||!!s.autoPotion},
 {id:'home',title:'กลับเมือง',text:c=>c.map==='city_plaza'?'ถึงเมืองแล้ว':`กด${c.mobile?'ปุ่ม ⌂':' H'} เพื่อร่ายกลับเมือง หรือเดินตามป้ายกลับเมือง · นักบวชหมอข้างน้ำพุฟื้นพลังให้ฟรี`,
  target:c=>gateToward(c.map,'city_plaza'),focus:'#return-city',start:(c,s)=>{s.away=inField(c);},done:(c,s)=>{if(inField(c))s.away=true;return s.away&&c.map==='city_plaza';}},
 {id:'turnin',title:'ส่งเควสต์แรก',text:c=>{const a=c.quests.active[FIRST];if(!a)return 'คุยกับหัวหน้าทหารประตูเพื่อรับและส่งเควสต์ “ล่าครั้งแรกนอกกำแพง” · เควสต์ทั้งหมดดูได้ในบันทึกการเดินทาง';const n=a.progress[0]??0;return n>=8?'ปราบวุ้นครบแล้ว · กลับไปส่งเควสต์ที่หัวหน้าทหารประตู รับยาและเงินรางวัล':`ปราบวุ้นจิ๋วให้ครบ ${n}/8 ตัว แล้วกลับมาส่งที่หัวหน้าทหารประตู`;},
  target:c=>{const a=c.quests.active[FIRST];if(a&&(a.progress[0]??0)<8)return inField(c)?nearestMonster(c):gateToward(c.map,'meadow');return c.map==='city_plaza'?{...GATE_CAPTAIN,label:'หัวหน้าทหารประตู'}:gateToward(c.map,'city_plaza');},
  done:c=>c.quests.done[FIRST]!==undefined},
 {id:'boss',title:'บอสสนาม',text:()=>'ราชาวุ้น (ทุ่งวุ้นจิ๋ว) และผู้เฝ้าป่าหมอก (ป่าหมอกส่วนลึก Lv.15) ฟื้นทุก 30 นาที · รับเควสต์ล่าบอสจากหัวหน้าทหารประตู ความคืบหน้าจะขึ้นในบันทึกการเดินทาง',
  start:(c,s)=>{s.at=performance.now();},done:(c,s)=>performance.now()-s.at>20000||Object.keys(c.quests.active).some(id=>/king|warden/.test(id))},
 {id:'angel',title:'อาชีพขั้นที่สอง',text:c=>c.p.jobLevel>=40?'ระดับอาชีพครบ 40 แล้ว · ไปคุยกับทูตสวรรค์กลางเมืองเพื่อเลือกเส้นทางใหม่':`ล่ามอนสเตอร์จนระดับอาชีพถึง 40 (ตอนนี้ ${c.p.jobLevel}/40) แล้วทูตสวรรค์กลางเมืองจะเปลี่ยนอาชีพให้ · เริ่มที่ทุ่งทางใต้ Lv.1–5 แล้วไปป่าหมอกทางตะวันออก Lv.5–10`,
  target:c=>c.p.jobLevel>=40?(c.map==='city_plaza'?{...ANGEL,label:'ทูตสวรรค์'}:gateToward(c.map,'city_plaza')):null,done:c=>tier(c.p.jobId)>=2},
];

export function mountTutorialGuide(o:GuideOptions){
 const key='tn-guide:'+o.characterId;
 let saved:{step:number;off?:boolean;min?:boolean}|null=null;
 try{saved=JSON.parse(localStorage.getItem(key)||'null');}catch{}
 let step=saved?.step??0,off=!!saved?.off,min=!!saved?.min,state:any=null,decided=!!saved;
 const save=()=>{try{localStorage.setItem(key,JSON.stringify({step,off,min}));}catch{}};
 const mobile=()=>matchMedia('(max-width:650px)').matches;

 const panel=document.createElement('aside');panel.id='guide-nav';panel.hidden=true;panel.setAttribute('aria-live','polite');
 panel.innerHTML='<header><button class="gn-toggle" aria-expanded="true"><span class="gn-badge">นำทาง</span><b class="gn-title"></b><small class="gn-count"></small></button><button class="gn-close" aria-label="ปิดคู่มือนำทาง" title="ปิดคู่มือนำทาง">×</button></header><p class="gn-text"></p><div class="gn-track"><i></i></div><footer><button class="gn-skip">ข้ามขั้นนี้</button></footer>';
 const arrow=document.createElement('div');arrow.id='guide-arrow';arrow.hidden=true;arrow.setAttribute('aria-hidden','true');arrow.innerHTML='<i></i><span></span>';
 const toast=document.createElement('div');toast.id='guide-step-toast';toast.setAttribute('role','status');
 const ui=document.querySelector('#ui')!;ui.append(panel,arrow,toast);
 const q=<T extends HTMLElement>(s:string)=>panel.querySelector<T>(s)!;
 let focused:Element|null=null;
 const setFocus=(sel?:string)=>{const el=sel?document.querySelector(sel):null;if(el===focused)return;focused?.classList.remove('guide-focus');focused=el;el?.classList.add('guide-focus');};
 const ctx=():Ctx=>({map:o.map(),p:o.game().p,game:o.game(),mobile:mobile(),quests:o.quests()??{active:{},done:{}}});
 const begin=()=>{state={};STEPS[step]?.start?.(ctx(),state);};
 const advance=(skipped=false)=>{const done=STEPS[step];step++;save();if(done&&!skipped){toast.textContent=`✓ ${done.title}`;toast.classList.remove('show');void toast.offsetWidth;toast.classList.add('show');}state=null;};
 q('.gn-skip').onclick=()=>advance(true);
 q('.gn-close').onclick=()=>{off=true;save();};
 q('.gn-toggle').onclick=()=>{min=!min;save();};

 // Talking to any town NPC counts; the quest dialog and the shop both open from the same talk button.
 const npc=document.querySelector('#npc-dialog'),watch=(el:Element|null)=>el&&new MutationObserver(()=>{if(el.hasAttribute('open')&&state)state.talked=true;}).observe(el,{attributes:true,attributeFilter:['open']});
 watch(npc);

 // Settings entry to bring the guide back after closing it, or to start over.
 const restart=document.createElement('button');restart.id='guide-restart';restart.textContent='คู่มือนำทางมือใหม่';
 restart.onclick=()=>{if(off||step>=STEPS.length){step=0;}off=false;min=false;decided=true;state=null;save();(document.querySelector('#settings-window') as HTMLDialogElement|null)?.close();};
 restart.className='settings-action';restart.textContent='เปิดคู่มือนำทางมือใหม่';
 document.querySelector('#settings-window .settings-help-host')?.append(restart);

 function draw(c:Ctx){
  const s=STEPS[step];
  q('.gn-title').textContent=s.title;q('.gn-count').textContent=`${step+1}/${STEPS.length}`;
  const text=s.text(c);if(q('.gn-text').textContent!==text)q('.gn-text').textContent=text;
  q<HTMLElement>('.gn-track i').style.width=`${step/STEPS.length*100}%`;
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
  event(e:any){if(!state)return;if(e.type==='skill')state.cast=true;if(e.type==='heal'||e.type==='autoPotion')state.drank=true;},
  update(){
   const c=ctx(),active=o.started()&&!off&&step<STEPS.length&&!!c.p;
   // A character met for the first time past the opening (Lv 8+ or already Job 2) skips straight to the end.
   if(active&&!decided&&c.p.level>0){decided=true;if(c.p.level>=8||tier(c.p.jobId)>=2){step=STEPS.length;save();}}
   if(!active||step>=STEPS.length){panel.hidden=true;arrow.hidden=true;setFocus();return;}
   const ctl=document.querySelector<HTMLElement>('#control-hints');if(ctl)ctl.hidden=true;
   if(!state)begin();
   if(o.autoPotionOn())state.autoPotion=true;
   if(STEPS[step].done(c,state)){advance();if(step>=STEPS.length)return;begin();}
   const s=STEPS[step],t=s.target?.(c)??null;
   panel.hidden=false;draw(c);point(c,t);minimap(t,c.map);setFocus(min?undefined:s.focus);
  },
 };
}
