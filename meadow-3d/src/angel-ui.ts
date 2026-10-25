import {keyLabel,loadGameData, type Inventory, type QuestState} from '@the-beginning-online/shared';
import {MAP_INFO, type MapId} from '@the-beginning-online/shared/maps';
import {adventureAdvice, type GuideLesson} from './adventure-advice';
import type {QuestDestination} from './quest-navigation';
import './npc-dialog.css';
import './angel.css';
import {KEYS} from './keys';

const data=loadGameData();
interface AngelPlayer {level:number;x:number;z:number;hp:number;maxHp:number;dead?:boolean;inventory?:Inventory}
export function mountAngel(o:{player:()=>AngelPlayer;map:()=>MapId;guide:()=>GuideLesson;quests:()=>QuestState|undefined;onOpen:()=>void;resumeGuide:()=>void;openGuide:()=>void;openMap:()=>void;navigate:(point:QuestDestination)=>void}){
 const panel=document.querySelector<HTMLDialogElement>('#angel-window')!,talk=document.querySelector<HTMLButtonElement>('#angel-talk')!;
 // Portrait column + content column (ui-mockup/npc-dialogs.html).
 panel.innerHTML=`<i class="nd-corner tl"></i><i class="nd-corner tr"></i><i class="nd-corner bl"></i><i class="nd-corner br"></i>
<aside class="nd-who"><img class="nd-figure" src="/assets/npc-portraits-v1/angel.webp" alt=""><div class="nd-plate"><small>THE GUIDING LIGHT</small><h2 id="angel-title">เซราฟ · ทูตสวรรค์</h2><p id="angel-note">ผู้ดูแลเส้นทางนักผจญภัย</p></div></aside>
<div class="nd-body"><button type="button" id="angel-close" class="nd-x" aria-label="ปิดบทสนทนา">×</button>
<p class="nd-say">ไม่ว่าเจ้าจะเพิ่งเริ่มต้น หรือกลับมาจากการเดินทางไกล <b>ข้าจะช่วยหาก้าวถัดไปให้เจ้า</b></p>
<div class="angel-summary"><span class="nd-chip"><svg viewBox="0 0 16 16" fill="none" stroke="#8fd8ab" stroke-width="1.6" aria-hidden="true"><path d="M8 1.5l1.9 4 4.4.5-3.3 3 .9 4.3L8 11.1 4.1 13.3l.9-4.3-3.3-3 4.4-.5z"/></svg>ระดับ <b class="angel-level"></b></span><span class="nd-chip"><svg viewBox="0 0 16 16" fill="none" stroke="#e8cb8f" stroke-width="1.6" aria-hidden="true"><path d="M3 13L12 4M10 2.5l3.5 3.5M2.5 10.5l3 3"/></svg>อาวุธ <b class="angel-weapon"></b></span><span class="nd-chip"><svg viewBox="0 0 16 16" fill="none" stroke="#9cc8ef" stroke-width="1.6" aria-hidden="true"><path d="M3 2.5h8l2 2v9H3z"/><path d="M5.5 7h5M5.5 10h3.5"/></svg><b class="angel-guide-count"></b></span></div>
<section class="angel-recommendation" aria-labelledby="angel-question"><div class="angel-card-top"><svg viewBox="0 0 16 16" fill="none" stroke="#e8cb8f" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.4" fill="#e8cb8f"/></svg><span id="angel-question">ก้าวถัดไปที่ข้าแนะนำ</span><span class="angel-kind"></span></div><h3 class="angel-goal"></h3><p class="angel-detail" aria-live="polite"></p><p class="angel-destination"></p><button type="button" class="angel-next"></button></section>
<div class="angel-steps"><span class="angel-progress-label"></span><div class="angel-dots" role="progressbar" aria-label="ความคืบหน้า Guide"></div></div>
<section class="angel-tools" aria-label="เส้นทางของคุณ"><button type="button" data-angel="guide"><span class="nd-ti" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 4l10 6-10 6z"/></svg></span><b>เล่น Guide ต่อ</b><small>กลับไปขั้นเดิมที่บันทึกไว้</small></button><button type="button" data-angel="skills"><span class="nd-ti" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 2.5l2 5 5 .5-3.8 3.3 1.2 5L10 13.6 5.6 16.3l1.2-5L3 8l5-.5z"/></svg></span><b>สำรวจสายการเล่น</b><small>อาวุธ · สกิล · ความชำนาญ</small></button><button type="button" data-angel="handbook"><span class="nd-ti" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 4.5c2.5-1 5-1 7 .5 2-1.5 4.5-1.5 7-.5v11c-2.5-1-5-1-7 .5-2-1.5-4.5-1.5-7-.5z"/><path d="M10 5v11"/></svg></span><b>คู่มือนักผจญภัย</b><small>เลือกทบทวนบทเรียนที่สนใจ</small></button><button type="button" data-angel="map"><span class="nd-ti" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2.5 5l5-2 5 2 5-2v12l-5 2-5-2-5 2z"/><path d="M7.5 3v12M12.5 5v12"/></svg></span><b>แผนที่โลก</b><small>พื้นที่และช่วงเลเวล</small></button></section>
<footer class="nd-hint"><span>นำทางด้วยการเดินจริง · เดินเองหรือกด <kbd>Esc</kbd> เพื่อหยุดนำทาง</span><span><kbd>Esc</kbd> ปิด</span></footer></div>`;
 const $=<T extends HTMLElement=HTMLElement>(s:string)=>panel.querySelector<T>(s)!;
 const PIN=document.createElement('template');PIN.innerHTML='<svg viewBox="0 0 18 18" fill="none" stroke="#e8cb8f" stroke-width="1.6" aria-hidden="true"><path d="M9 16s5-4.6 5-8.6A5 5 0 0 0 4 7.4C4 11.4 9 16 9 16z"/><circle cx="9" cy="7.4" r="1.8"/></svg>';
 const recommendation=()=>adventureAdvice({map:o.map(),player:o.player(),guide:o.guide(),quests:o.quests()},data,Date.now());
 const near=()=>{const p=o.player(),a=data.jobs.angel;return o.map()==='city_plaza'&&!p.dead&&Math.hypot(p.x-a.x,p.z-a.z)<=a.range;};
 let nextDraw=0;
 function draw(){
  const p=o.player(),lesson=o.guide(),advice=recommendation(),weapon=p.inventory?.items.find(i=>i.location==='equip'&&i.slot==='weapon');
  $('.angel-level').textContent=String(p.level);
  $('.angel-weapon').textContent=weapon?`${weapon.refine?'+'+weapon.refine+' ':''}${data.items.items.find(t=>t.id===weapon.template)?.nameTh??weapon.template}`:'มือเปล่า';
  $('.angel-guide-count').textContent=lesson.ready?`Guide ${Math.min(lesson.step+1,lesson.total)} / ${lesson.total}`:'กำลังโหลด Guide';
  $('.angel-kind').textContent={loading:'บันทึกตัวละคร',heal:'เตรียมตัว',guide:'เรียนรู้',quest:'ภารกิจ',hunt:'ออกผจญภัย'}[advice.kind];
  $('.angel-goal').textContent=advice.title;
  if($('.angel-detail').textContent!==advice.text)$('.angel-detail').textContent=advice.text;
  const destination=$('.angel-destination');destination.hidden=!advice.destination;
  if(advice.destination){const name=document.createElement('b'),where=document.createElement('span');name.textContent=advice.destination.name;where.textContent=`· ${MAP_INFO[advice.destination.map].name}`;destination.replaceChildren(PIN.content.cloneNode(true),'ไปที่ ',name,where);}
  const next=$<HTMLButtonElement>('.angel-next');next.textContent=advice.action;next.disabled=advice.kind==='loading';
  $<HTMLButtonElement>('[data-angel=guide]').disabled=!lesson.ready;
  $('[data-angel=guide] b').textContent=lesson.step>=lesson.total?'ทบทวน Guide':'เล่น Guide ต่อ';
  $('[data-angel=guide] small').textContent=lesson.step>=lesson.total?'เรียนครบแล้ว · เลือกดูบทเรียนได้':'กลับไปขั้นเดิมที่บันทึกไว้';
  $('.angel-progress-label').innerHTML=lesson.ready?`ความคืบหน้า Guide <b>${lesson.step} / ${lesson.total}</b>`:'กำลังโหลดความคืบหน้าจากเซิร์ฟเวอร์…';
  const dots=$('.angel-dots');dots.setAttribute('aria-valuemax',String(lesson.total));dots.setAttribute('aria-valuenow',String(lesson.step));
  if(dots.childElementCount!==lesson.total)dots.replaceChildren(...Array.from({length:lesson.total},()=>document.createElement('i')));
  [...dots.children].forEach((dot,i)=>dot.className=i<lesson.step?'done':i===lesson.step?'cur':'');
 }
 talk.onclick=()=>{if(!near())return;o.onOpen();draw();if(!panel.open)panel.showModal();};
 $('#angel-close').onclick=()=>panel.close();
 $('.angel-next').onclick=()=>{const advice=recommendation();if(advice.kind==='loading')return;panel.close();if(advice.destination)o.navigate(advice.destination);else if(o.guide().step>=o.guide().total)o.openGuide();else o.resumeGuide();};
 panel.querySelectorAll<HTMLButtonElement>('[data-angel]').forEach(button=>button.onclick=()=>{
  panel.close();if(button.dataset.angel==='guide')o.resumeGuide();else if(button.dataset.angel==='handbook')o.openGuide();else if(button.dataset.angel==='map')o.openMap();else document.querySelector<HTMLButtonElement>('#skills-button')!.click();
 });
 return {update(){const nearby=near();talk.hidden=!nearby;const label=`✧ คุย [${keyLabel(KEYS.talk[0])}] · เซราฟ`;if(talk.textContent!==label)talk.textContent=label;if(panel.open&&!nearby){panel.close();return;}if(panel.open&&performance.now()>=nextDraw){draw();nextDraw=performance.now()+500;}}};
}
