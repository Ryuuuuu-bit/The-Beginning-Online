import {keyLabel,loadGameData, type Inventory, type QuestState} from '@the-beginning-online/shared';
import {MAP_INFO, type MapId} from '@the-beginning-online/shared/maps';
import {adventureAdvice, type GuideLesson} from './adventure-advice';
import type {QuestDestination} from './quest-navigation';
import './angel.css';
import {KEYS} from './keys';

const data=loadGameData();
interface AngelPlayer {level:number;x:number;z:number;hp:number;maxHp:number;dead?:boolean;inventory?:Inventory}
export function mountAngel(o:{player:()=>AngelPlayer;map:()=>MapId;guide:()=>GuideLesson;quests:()=>QuestState|undefined;onOpen:()=>void;resumeGuide:()=>void;openGuide:()=>void;openMap:()=>void;navigate:(point:QuestDestination)=>void}){
 const panel=document.querySelector<HTMLDialogElement>('#angel-window')!,talk=document.querySelector<HTMLButtonElement>('#angel-talk')!;
 panel.innerHTML=`<header><span class="angel-seal" aria-hidden="true">✦</span><div><small>THE GUIDING LIGHT</small><h2 id="angel-title">ทูตสวรรค์</h2><p id="angel-note">ผู้ดูแลเส้นทางนักผจญภัย</p></div><button type="button" id="angel-close" aria-label="ปิดบทสนทนา">×</button></header>
<p class="angel-welcome">ไม่ว่าเจ้าจะเพิ่งเริ่มต้น หรือกลับมาจากการเดินทางไกล ข้าจะช่วยหาก้าวถัดไปให้เจ้า</p>
<div class="angel-summary"><span class="angel-level"></span><span class="angel-weapon"></span><span class="angel-guide-count"></span></div>
<section class="angel-recommendation" aria-labelledby="angel-question"><div class="angel-card-top"><span>เป้าหมายแนะนำ</span><span class="angel-kind"></span></div><h3 id="angel-question">ตอนนี้ฉันควรทำอะไรต่อ?</h3><h4 class="angel-goal"></h4><p class="angel-detail" aria-live="polite"></p><p class="angel-destination"></p><button type="button" class="angel-next"></button></section>
<section class="angel-tools" aria-label="เส้นทางของคุณ"><button type="button" data-angel="guide"><span aria-hidden="true">⌖</span><span><b>เล่น Guide ต่อ</b><small>กลับไปขั้นเดิมที่บันทึกไว้</small></span><i aria-hidden="true">↗</i></button><button type="button" data-angel="skills"><span aria-hidden="true">✧</span><span><b>สำรวจสายการเล่น</b><small>อาวุธ · สกิล · ความชำนาญ</small></span><i aria-hidden="true">↗</i></button><button type="button" data-angel="handbook"><span aria-hidden="true">▤</span><span><b>คู่มือนักผจญภัย</b><small>เลือกทบทวนบทเรียนที่สนใจ</small></span><i aria-hidden="true">↗</i></button><button type="button" data-angel="map"><span aria-hidden="true">◇</span><span><b>แผนที่โลก</b><small>ดูพื้นที่และช่วงเลเวลก่อนเดินทาง</small></span><i aria-hidden="true">↗</i></button></section>
<footer><span class="angel-progress-label"></span><progress class="angel-progress" aria-label="ความคืบหน้า Guide"></progress><small>นำทางด้วยการเดินจริง · เดินเองหรือกด Esc เพื่อหยุด</small></footer>`;
 const $=<T extends HTMLElement=HTMLElement>(s:string)=>panel.querySelector<T>(s)!;
 const recommendation=()=>adventureAdvice({map:o.map(),player:o.player(),guide:o.guide(),quests:o.quests()},data,Date.now());
 const near=()=>{const p=o.player(),a=data.jobs.angel;return o.map()==='city_plaza'&&!p.dead&&Math.hypot(p.x-a.x,p.z-a.z)<=a.range;};
 let nextDraw=0;
 function draw(){
  const p=o.player(),lesson=o.guide(),advice=recommendation(),weapon=p.inventory?.items.find(i=>i.location==='equip'&&i.slot==='weapon');
  $('.angel-level').textContent=`Lv.${p.level}`;
  $('.angel-weapon').textContent=weapon?`${weapon.refine?'+'+weapon.refine+' ':''}${data.items.items.find(t=>t.id===weapon.template)?.nameTh??weapon.template}`:'มือเปล่า';
  $('.angel-guide-count').textContent=lesson.ready?`Guide ${Math.min(lesson.step+1,lesson.total)}/${lesson.total}`:'กำลังโหลด Guide';
  $('.angel-kind').textContent={loading:'บันทึกตัวละคร',heal:'เตรียมตัว',guide:'เรียนรู้',quest:'ภารกิจ',hunt:'ออกผจญภัย'}[advice.kind];
  $('.angel-goal').textContent=advice.title;
  if($('.angel-detail').textContent!==advice.text)$('.angel-detail').textContent=advice.text;
  $('.angel-destination').textContent=advice.destination?`⌖ ${advice.destination.name} · ${MAP_INFO[advice.destination.map].name}`:'';
  const next=$<HTMLButtonElement>('.angel-next');next.textContent=advice.action;next.disabled=advice.kind==='loading';
  $<HTMLButtonElement>('[data-angel=guide]').disabled=!lesson.ready;
  $('[data-angel=guide] b').textContent=lesson.step>=lesson.total?'ทบทวน Guide':'เล่น Guide ต่อ';
  $('[data-angel=guide] small').textContent=lesson.step>=lesson.total?'เรียนครบแล้ว · เลือกดูบทเรียนได้':'กลับไปขั้นเดิมที่บันทึกไว้';
  $('.angel-progress-label').textContent=lesson.ready?`บันทึก Guide · ผ่านแล้ว ${lesson.step}/${lesson.total} ขั้นตอน`:'กำลังโหลดความคืบหน้าจากเซิร์ฟเวอร์…';
  const progress=$<HTMLProgressElement>('.angel-progress');progress.max=lesson.total;progress.value=lesson.step;
 }
 talk.onclick=()=>{if(!near())return;o.onOpen();draw();if(!panel.open)panel.showModal();};
 $('#angel-close').onclick=()=>panel.close();
 $('.angel-next').onclick=()=>{const advice=recommendation();if(advice.kind==='loading')return;panel.close();if(advice.destination)o.navigate(advice.destination);else if(o.guide().step>=o.guide().total)o.openGuide();else o.resumeGuide();};
 panel.querySelectorAll<HTMLButtonElement>('[data-angel]').forEach(button=>button.onclick=()=>{
  panel.close();if(button.dataset.angel==='guide')o.resumeGuide();else if(button.dataset.angel==='handbook')o.openGuide();else if(button.dataset.angel==='map')o.openMap();else document.querySelector<HTMLButtonElement>('#skills-button')!.click();
 });
 return {update(){const nearby=near();talk.hidden=!nearby;const label=`✧ คุย [${keyLabel(KEYS.talk[0])}] · ทูตสวรรค์`;if(talk.textContent!==label)talk.textContent=label;if(panel.open&&!nearby){panel.close();return;}if(panel.open&&performance.now()>=nextDraw){draw();nextDraw=performance.now()+500;}}};
}
