import '../web.css';import '../web-glass.css';import '../web-modern.css';import '../web-fantasy.css';import './world.css';import './navigation';
import {mountAccountChip} from './session';
import {mountWorldAtlas,atlasLevel} from '../world-atlas';
import {REGIONS,regionMonsters,regionDrops,regionsForLevel,cityRoute} from './world-catalog';
import {itemIconCell} from '../item-icon';
void mountAccountChip();
const picker=document.querySelector<HTMLSelectElement>('#world-region')!,band=document.querySelector<HTMLSelectElement>('#world-band')!,detail=document.querySelector<HTMLElement>('#world-detail')!,list=document.querySelector<HTMLElement>('.world-region-list')!;
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const atlas=mountWorldAtlas(document.querySelector<HTMLElement>('#player-atlas')!,{onSelect:r=>r.id==='city'?showCity():show(r.id)});
function showCity(){
 const url=new URL(location.href);url.searchParams.delete('region');history.replaceState(null,'',url);
 list.querySelectorAll('[data-region]').forEach(b=>b.setAttribute('aria-pressed','false'));
 atlas.select('city',false);picker.value='';detail.innerHTML='<p class="realm-kicker">เมืองสี่ประตู · เขตปลอดภัย</p><h2>นครที่ถูกลืมเลือน</h2><p>เตรียมอุปกรณ์ พบชาวเมือง และรวมปาร์ตี้ ก่อนเลือกประตูออกไปล่า</p><dl><dt>ใต้</dt><dd>ทุ่งและสวนริมน้ำ</dd><dt>ตะวันออก</dt><dd>ป่าชื้นและบึงหมอก</dd><dt>เหนือ</dt><dd>นครร้างและหออักขระ</dd><dt>ตะวันตก</dt><dd>หุบผาและเหมืองแร่</dd></dl><a class="outline-button" href="/#play-now">เริ่มการผจญภัย →</a>';
}
function show(id:string){
 const region=REGIONS.find(r=>r.id===id);if(!region)return;
 if(![...picker.options].some(o=>o.value===id)){band.value='all';filter();}
 picker.value=id;atlas.select(id,false);
 const monsters=regionMonsters(id),bosses=monsters.filter(m=>m.boss),drops=regionDrops(id).filter(i=>i.id.startsWith('unique_')||i.id.startsWith('card_')).sort((a,b)=>Number(b.id.startsWith('unique_'))-Number(a.id.startsWith('unique_'))).slice(0,3);
 const level=atlasLevel(region),route=cityRoute(id);
 detail.innerHTML=`<p class="realm-kicker">${esc(region.myth)}</p><h2>${esc(region.name)}</h2><span class="world-level">${level}</span><p>${esc(region.climate)}</p><dl><dt>ล่าเพื่ออะไร</dt><dd>${esc(region.hunt)}</dd><dt>ลักษณะเส้นทาง</dt><dd>${esc(region.travel)}</dd><dt>บอสประจำพื้นที่</dt><dd>${esc(bosses.map(m=>m.name).join(' · ')||'ดูมอนสเตอร์ประจำพื้นที่')}</dd></dl>${id==='confluence'?'<p class="world-access">ต้อง Lv.100 และผ่านเควสต์เชิญสู่แกนโลก · เข้าเดี่ยวหรือปาร์ตี้ได้</p>':''}<div class="world-treasures">${drops.map(i=>`<a href="/items.html?item=${encodeURIComponent(i.id)}"><img src="${itemIconCell(i.id).image}" width="52" height="52" alt=""><span>${esc(i.nameTh)}</span></a>`).join('')}</div><details><summary>เส้นทางจากเมือง · ${route.length-1} ประตู</summary><p>${esc(route.join(' → '))}</p></details><a class="outline-button" href="/monsters.html?map=${encodeURIComponent(region.mapId)}">ดูมอนสเตอร์และของดรอป →</a>`;
 const url=new URL(location.href);url.searchParams.set('region',id);history.replaceState(null,'',url);
 list.querySelectorAll<HTMLElement>('[data-region]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.region===id)));
}
function filter(){
 const [min,max]=band.value==='all'?[1,100]:band.value.split('-').map(Number),regions=regionsForLevel(min,max);
 picker.replaceChildren(new Option('เลือกภูมิภาค',''),...regions.map(r=>new Option(`${r.name} · ${atlasLevel(r)}`,r.id)));
 list.innerHTML=regions.map(r=>`<button type="button" data-region="${r.id}"><span>${atlasLevel(r)}</span><b>${esc(r.name)}</b><small>${esc(r.myth)}</small></button>`).join('');
 document.querySelector('#world-count')!.textContent=regions.length+' ภูมิภาค';
 return regions;
}
band.onchange=()=>{const regions=filter();atlas.focusRegions(regions.map(r=>r.id));if(regions[0])show(regions[0].id);};picker.onchange=()=>picker.value?show(picker.value):showCity();list.onclick=e=>{const b=(e.target as Element).closest<HTMLElement>('[data-region]');if(b)show(b.dataset.region!);};
filter();const initial=new URLSearchParams(location.search).get('region');if(initial&&REGIONS.some(r=>r.id===initial))show(initial);else showCity();
