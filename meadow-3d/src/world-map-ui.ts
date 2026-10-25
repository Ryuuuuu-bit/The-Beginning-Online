import biomePlan from '../../maps/biome-plan.json';
import {huntList,loadGameData} from '@the-beginning-online/shared';
import {THORN_NEST,FIELD_BOSS,GATE_LINKS,MAP_INFO,LAYOUTS,gateRoute,type MapId} from '@the-beginning-online/shared/maps';
import {mountWorldAtlas,ATLAS_REGIONS,atlasLevel,type AtlasRegion} from './world-atlas';
import './world-map.css';
const data=loadGameData();
const groups:[string,(kind:string)=>boolean][]=[['บริการ',k=>!k.startsWith('gate:')&&!['camp','boss','place','sign','hunt'].includes(k)],['พื้นที่ล่า',k=>k==='hunt'],['จุดสำรวจ',k=>k==='place'],['ป้ายบอกทาง',k=>k==='sign'],['ประตู',k=>k.startsWith('gate:')],['แคมป์พักฟื้น',k=>k==='camp'],['บอส',k=>k==='boss']];
interface Point{x:number;z:number;kind:string;icon:string;name:string}
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** M selects a region for inspection; only the explicit travel action starts a real gate route. */
export function mountWorldMap(o:{discovered:()=>readonly MapId[];warpTo:(map:MapId)=>void;map:()=>MapId;level:()=>number;points:()=>Point[];goTo:(p:Point)=>void;travelTo:(map:MapId)=>boolean;goal:()=>MapId|null;notice:(text:string)=>void;onOpen?:()=>void;toggleMinimap?:()=>void}){
 const panel=document.createElement('dialog');panel.id='world-map';panel.setAttribute('aria-labelledby','wm-title');
 panel.innerHTML=`<header><div><small class="wm-eyebrow">THE BEGINNING ONLINE / WORLD ATLAS</small><h2 id="wm-title">ดินแดนที่รอการค้นพบ</h2></div><span class="wm-key">M เปิด / ปิด</span><button type="button" class="wm-mini">แผนที่ย่อ</button><button type="button" class="wm-close" aria-label="ปิดแผนที่">×</button></header><div class="wm-body"><section class="wm-world" aria-label="ภาพรวมแผนที่โลก"></section><aside class="wm-detail"><label class="wm-picker-label">สำรวจภูมิภาค<select class="wm-picker" aria-label="เลือกภูมิภาค">${ATLAS_REGIONS.map(r=>`<option value="${r.id}">${esc(r.name)} · ${atlasLevel(r)}${r.status==='planned'?' (แผน)':r.status==='exploration'?' (สำรวจ)':''}</option>`).join('')}</select></label><span class="wm-state"></span><h3 class="wm-here"></h3><p class="wm-level"></p><p class="wm-hint"></p><p class="wm-access"></p><p class="wm-exp">EXP เต็มเมื่อระดับห่างจากมอนไม่เกิน 5 · ห่าง 6–10 ได้ลดลง · เกิน 10 ไม่ได้รับ EXP/Job EXP</p><p class="wm-route"></p><p class="wm-discovery" role="status"></p><button class="wm-warp primary" type="button"></button><div class="wm-monsters"></div><p class="wm-boss"></p><button class="wm-travel" type="button"></button><a class="wm-plan" target="_blank" rel="noopener">ดูรายละเอียดแผนภูมิภาค ↗</a><div class="wm-places"></div></aside></div>`;
 document.body.append(panel);const $=<T extends Element>(s:string)=>panel.querySelector<T>(s)!;
 let chosen:AtlasRegion=ATLAS_REGIONS[0];
 const view=mountWorldAtlas($<HTMLElement>('.wm-world'),{currentMap:o.map(),level:o.level,onSelect:r=>show(r)});
 $<HTMLButtonElement>('.wm-close').onclick=()=>panel.close();$<HTMLButtonElement>('.wm-mini').onclick=()=>o.toggleMinimap?.();
 $<HTMLSelectElement>('.wm-picker').onchange=()=>{view.select($<HTMLSelectElement>('.wm-picker').value);if(innerWidth<761)view.focusRegions([chosen.id]);};
 function places(){const list=$<HTMLElement>('.wm-places');list.replaceChildren();if(chosen.mapId!==o.map())return;
  const m=o.map(),all=[...o.points()],boss=(FIELD_BOSS as Record<string,{dataId:string;x:number;z:number}>)[m];
  if(boss)all.push({x:boss.x,z:boss.z,kind:'boss',icon:'☠',name:'ลานบอส · '+(data.monsters.monsters.find(x=>x.id===boss.dataId)?.nameTh??'')});
  if(m==='forest')all.push({x:THORN_NEST.x,z:THORN_NEST.z,kind:'boss',icon:'☠',name:'ลานแม่รังหนาม · Lv.10'});
  for(const [title,test]of groups){const points=all.filter(p=>test(p.kind));if(!points.length)continue;const h=document.createElement('h4');h.textContent=title;list.append(h);
   for(const p of points){const b=document.createElement('button');b.type='button';const to=p.kind.startsWith('gate:')?GATE_LINKS[m][p.kind.slice(5)]:undefined;b.innerHTML='<span class="wm-icon"></span><span></span>';b.firstElementChild!.textContent=p.icon;b.lastElementChild!.textContent=to?'ประตูไป'+MAP_INFO[to].name+(to==='city_plaza'?' · เขตปลอดภัย':' · Lv.'+MAP_INFO[to].levels)+(LAYOUTS[to].exploration?' · สำรวจ':''):p.kind.startsWith('gate:')?'ประตู (ยังปิดอยู่)':p.name;b.disabled=p.kind.startsWith('gate:')&&!to;b.onclick=()=>{o.goTo(p);panel.close();};list.append(b);}
  }
 }
 function show(r:AtlasRegion){chosen=r;$<HTMLSelectElement>('.wm-picker').value=r.id;const here=r.mapId===o.map(),live=r.status!=='planned'&&r.mapId!==null,exploration=r.status==='exploration';
  $('.wm-state').textContent=exploration?(here?'คุณอยู่ที่นี่ · แมปสำรวจ':'แมปสำรวจ · มอนยังไม่เปิด'):here?'คุณอยู่ที่นี่':live?'เปิดแล้ว':'พื้นที่ในแผน · ยังไม่เปิด';$('.wm-state').className='wm-state '+(here?'here':live?'live':'planned');$('.wm-here').textContent=r.name;$('.wm-level').textContent=atlasLevel(r)+(r.levels.length&&o.level()<r.levels[0]-2?' · สูงกว่าระดับคุณ':'');
  $('.wm-hint').textContent=r.climate+(r.myth?' · '+r.myth:'');const spec=biomePlan.biomes.find(b=>b.id===r.id),monsters=live&&!exploration&&r.mapId!=='city_plaza'?huntList(r.mapId!,data):spec?.monsters?.map(m=>({name:m.name,level:m.level,boss:m.rank==='boss'}))??[];
  $('.wm-access').textContent=spec?.access??'';
  const steps=live&&!here?gateRoute(o.map(),r.mapId!,o.level()):[],transit=steps.slice(1).map(s=>s.map).filter(map=>map!=='city_plaza'&&!LAYOUTS[map].exploration&&parseInt(MAP_INFO[map].levels,10)>o.level()+2);
  $('.wm-route').textContent=steps.length?`ผ่าน ${steps.length} ประตู · ${transit.length?'พื้นที่ล่าระหว่างทางสูงกว่าระดับคุณ: '+transit.map(map=>MAP_INFO[map].name+' Lv.'+MAP_INFO[map].levels).join(' → '):'เลือกทางผ่านที่เหมาะกับระดับคุณ'}`:'';
  const regular=monsters.filter(m=>!m.boss),split=r.levels[1]-r.levels[0]>5?r.levels[0]+5:0;
  $('.wm-monsters').innerHTML=monsters.length?`<h4>${live&&!exploration?'มอนสเตอร์ในภูมิภาค':'มอนสเตอร์ที่เสนอ · ยังไม่เปิด'}</h4><ul>${regular.map((m,i)=>`${split&&(i===0||m.level>=split&&regular[i-1].level<split)?`<li><strong>โซน Lv.${m.level<split?r.levels[0]+'–'+(split-1):split+'–'+r.levels[1]}</strong></li>`:''}<li><span>${esc(m.name)}</span><small>Lv.${m.level}</small></li>`).join('')}</ul>`:'';
  $('.wm-boss').textContent=monsters.filter(m=>m.boss).map(m=>'บอส · '+m.name+' Lv.'+m.level).join(' / ');
  const travel=$<HTMLButtonElement>('.wm-travel');travel.hidden=!live||here;travel.textContent=exploration?'เดินทางไปสำรวจ'+r.name:o.goal()===r.mapId?'เดินทางต่อไป'+r.name:'เดินทางไป'+r.name;travel.onclick=()=>{if(!r.mapId||r.status==='planned')return;if(o.travelTo(r.mapId)){o.notice('กำลังเดินทางไป'+r.name);panel.close();}else o.notice('ยังไม่มีเส้นทางเดินทางไปภูมิภาคนี้');};
  const warp=$<HTMLButtonElement>('.wm-warp'),discovery=$<HTMLElement>('.wm-discovery'),opened=!!r.mapId&&o.discovered().includes(r.mapId);
  warp.hidden=discovery.hidden=!live||here;warp.disabled=!opened||o.map()!=='city_plaza';
  warp.textContent=!opened?'ยังไม่เปิดจุดวาร์ป':o.map()!=='city_plaza'?'กลับเมืองเพื่อวาร์ป':'วาร์ปไป'+r.name;
  discovery.textContent=!opened?'เดินทางไปถึงแมพนี้ครั้งแรกเพื่อเปิดจุดวาร์ปถาวร':o.map()!=='city_plaza'?'เปิดจุดวาร์ปแล้ว · ใช้บริการได้จากในเมือง':'เปิดจุดวาร์ปแล้ว · เลือกวาร์ปหรือเดินทางตามเส้นทางเดิม';
  warp.onclick=()=>{if(warp.disabled||!r.mapId)return;o.warpTo(r.mapId);panel.close();};
  const link=$<HTMLAnchorElement>('.wm-plan');link.hidden=live&&!exploration;link.href='/world-design.html?biome='+encodeURIComponent(r.id);places();
 }
 return {refresh(){if(panel.open)show(chosen);},toggle(){if(panel.open){panel.close();return;}o.onOpen?.();view.setCurrent(o.map());view.select(ATLAS_REGIONS.find(r=>r.mapId===o.map())?.id??'city');panel.showModal();requestAnimationFrame(()=>view.refresh());},get open(){return panel.open;}};
}
