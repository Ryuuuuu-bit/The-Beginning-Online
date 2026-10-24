import '../web.css';import '../web-glass.css';import '../web-modern.css';import '../web-fantasy.css';import './bestiary.css';import './navigation';
import {mountAccountChip} from './session';
import {MONSTERS,FIELDS,filterMonsters,monsterMaps,mapLabel,elementName,itemName,dropPercent,respawnMinutes,type MonsterRecord} from './bestiary-model';
import {hudIcon,lootIcon} from './bestiary-icons';
import {paintMonster} from './bestiary-art';
void mountAccountChip();
const fieldTotal=document.querySelector('#field-total');if(fieldTotal)fieldTotal.textContent=String(FIELDS.length);
document.querySelectorAll<HTMLElement>('[data-be-icon]').forEach(el=>el.innerHTML=hudIcon(el.dataset.beIcon!));
const $=<T extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const fmt=(n:number)=>n.toLocaleString('en-US');
const race:Record<string,string>={formless:'ไร้รูปร่าง',plant:'พืช',brute:'สัตว์',demon:'ปีศาจ',undead:'อมนุษย์',insect:'แมลง',fish:'ปลา',dragon:'มังกร',demihuman:'กึ่งมนุษย์'};
const size:Record<string,string>={small:'เล็ก',medium:'กลาง',large:'ใหญ่'};
let map='all';const query=new URLSearchParams(location.search);
$<HTMLInputElement>('#monster-search').value=query.get('q')??'';
if(FIELDS.includes(query.get('map') as any))map=query.get('map')!;
if(['all','normal','boss'].includes(query.get('type')??''))$<HTMLSelectElement>('#monster-type').value=query.get('type')!;
$('#species-total').textContent=String(MONSTERS.length).padStart(2,'0');$('#boss-total').textContent=String(MONSTERS.filter(m=>m.boss).length).padStart(2,'0');
const tabs=$('.be-map-tabs');for(const [id,label]of [['all','ทุกพื้นที่'],...FIELDS.map(id=>[id,mapLabel(id)])]){const b=document.createElement('button');b.type='button';b.innerHTML=hudIcon('map')+label;b.dataset.map=id;b.onclick=()=>{map=id;render();};tabs.append(b);}
const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){const c=entry.target as HTMLCanvasElement;observer.unobserve(c);const m=MONSTERS.find(m=>m.id===c.dataset.monsterArt);if(m)void paintMonster(c,m.id,m.boss).catch(()=>{const note=document.createElement('span');note.className='be-art-error';note.textContent='โหลดภาพไม่สำเร็จ';c.replaceWith(note);});}},{rootMargin:'180px'});
function observe(){document.querySelectorAll<HTMLCanvasElement>('canvas[data-monster-art]').forEach(c=>observer.observe(c));}
function render(){
 const q=$<HTMLInputElement>('#monster-search').value,type=$<HTMLSelectElement>('#monster-type').value,sort=$<HTMLSelectElement>('#monster-sort').value,list=filterMonsters(q,map,type,sort);
 tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.map===map)));
 $('#monster-count').textContent=`พบ ${list.length} จาก ${MONSTERS.length} ชนิด`;
 observer.disconnect();$('#monster-grid').innerHTML=list.map(m=>`<button class="be-card ${m.boss?'is-boss':''}" type="button" data-monster="${m.id}" aria-label="ดูข้อมูล ${esc(m.nameTh)}"><div class="be-card-top"><span>NO. ${String(MONSTERS.indexOf(m)+1).padStart(3,'0')}</span><b>Lv. ${m.level}</b></div><div class="be-card-art"><span class="be-ground"></span><canvas width="300" height="190" data-monster-art="${m.id}" aria-label="${esc(m.nameTh)}" role="img"></canvas>${m.boss?`<span class="be-boss-tag">${hudIcon('crown')} FIELD BOSS</span>`:''}</div><div class="be-card-copy"><span class="be-element" data-element="${m.element}">${hudIcon(m.element)}${elementName(m.element)}</span><h3>${esc(m.nameTh)}</h3><p>${monsterMaps(m.id).map(mapLabel).join(' · ')}${m.id==='jelly_summon'?' · ถูกเรียกโดยบอส':''}</p><div class="be-card-stats"><span>${hudIcon('hp')} HP <b>${fmt(m.hp)}</b></span><span>${hudIcon('exp')} EXP <b>${fmt(m.exp)}</b></span><span aria-hidden="true">${hudIcon('arrow')}</span></div></div></button>`).join('');
 $('#monster-empty').hidden=list.length>0;observe();
 const params=new URLSearchParams();if(q)params.set('q',q);if(map!=='all')params.set('map',map);if(type!=='all')params.set('type',type);history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);
}
const dialog=$<HTMLDialogElement>('#monster-detail');
function details(m:MonsterRecord){
 const minutes=respawnMinutes(m.id),regions=monsterMaps(m.id),stat=(label:string,value:string|number)=>`<div><dt>${hudIcon(({HP:'hp',ATK:'atk',MATK:'matk',DEF:'def',MDEF:'mdef','HIT / FLEE':'hit',EXP:'exp','JOB EXP':'job'} as Record<string,string>)[label])}${label}</dt><dd>${typeof value==='number'?fmt(value):esc(value)}</dd></div>`;
 $('#detail-content').innerHTML=`<div class="be-detail-art"><small>FIELD JOURNAL / ${String(MONSTERS.indexOf(m)+1).padStart(3,'0')}</small><div class="be-detail-stage"><canvas width="480" height="350" data-monster-art="${m.id}" aria-label="${esc(m.nameTh)}" role="img"></canvas></div><span class="be-element" data-element="${m.element}">${hudIcon(m.element)}${elementName(m.element)}</span><h2 id="detail-name">${esc(m.nameTh)}</h2><p>Lv. ${m.level} · ${m.boss?'บอสประจำแมพ':'มอนสเตอร์ทั่วไป'}</p><div class="be-traits"><span>${race[m.race]??m.race}</span><span>ขนาด${size[m.size]??m.size}</span></div>${m.weakness.length?`<p class="be-weakness">จุดอ่อน · ${m.weakness.map(elementName).join(' / ')}</p>`:''}</div><div class="be-detail-info"><section><h3>${hudIcon('atk')}ค่าสถานะพื้นฐาน</h3><dl class="be-stat-grid">${stat('HP',m.hp)+stat('ATK',m.atk)+stat('MATK',m.matk)+stat('DEF',m.hardDef+' + '+m.softDef)+stat('MDEF',m.hardMdef+' + '+m.softMdef)+stat('HIT / FLEE',m.hit+' / '+m.flee)+stat('EXP',m.exp)+stat('JOB EXP',m.jobExp??0)}</dl><small>EXP และ Job EXP เป็นค่าพื้นฐานก่อนโบนัสเผ่า ปาร์ตี้ และการลดตามระดับที่ห่างกัน</small></section><section class="be-habitat"><h3>${hudIcon('map')}ถิ่นอาศัย</h3><p>${regions.map(id=>`<button data-region="${id}">${mapLabel(id)} ↗</button>`).join('')}</p>${minutes?`<small>เกิดใหม่ ${minutes} นาทีหลังถูกปราบ</small>`:''}${m.id==='jelly_summon'?'<small>ถูกอัญเชิญโดยราชาวุ้น</small>':''}</section><section><div class="be-drop-title"><h3>${hudIcon('loot')}ของดรอป</h3><small>อัตราพื้นฐานต่อครั้ง</small></div><div class="be-gold">${hudIcon('gold')} ทอง <strong>${m.gold[0]}–${m.gold[1]}</strong></div><ul class="be-drops">${m.drops.map(d=>`<li><div>${lootIcon(d.item)}<span><a href="/items.html?item=${encodeURIComponent(d.item)}">${esc(itemName(d.item))}</a><small>จำนวน ${d.min===d.max?d.min:d.min+'–'+d.max}</small></span></div><b>${dropPercent(d.rate)}</b></li>`).join('')}</ul></section></div>`;
 dialog.showModal();observe();
}
function openMonster(id:string){const m=MONSTERS.find(m=>m.id===id);if(!m)return;if(dialog.open)dialog.close();details(m);}
document.addEventListener('click',event=>{const target=event.target as HTMLElement;const card=target.closest<HTMLElement>('[data-monster]');if(card)location.hash=card.dataset.monster!;const region=target.closest<HTMLElement>('[data-region]');if(region){dialog.close();map=region.dataset.region!;render();$('#library-title').scrollIntoView({behavior:'smooth',block:'start'});}});
$('.be-close').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',()=>history.replaceState(null,'',location.pathname+location.search));window.addEventListener('hashchange',()=>{if(location.hash)openMonster(decodeURIComponent(location.hash.slice(1)));else if(dialog.open)dialog.close();});
for(const id of ['monster-search','monster-type','monster-sort'])$('#'+id).addEventListener(id==='monster-search'?'input':'change',render);
$('#reset-filters').onclick=()=>{$<HTMLInputElement>('#monster-search').value='';$<HTMLSelectElement>('#monster-type').value='all';$<HTMLSelectElement>('#monster-sort').value='level';map='all';render();};
document.addEventListener('keydown',e=>{if(e.key==='/'&&!dialog.open&&!(document.activeElement instanceof HTMLInputElement)){e.preventDefault();$<HTMLInputElement>('#monster-search').focus();}});
render();if(location.hash)openMonster(decodeURIComponent(location.hash.slice(1)));
