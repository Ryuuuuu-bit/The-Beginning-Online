import {masteryStatusArt} from './mastery-visuals';
import {TOWN_NPCS} from './city-2d-locations';
import {DEFAULT_UI,type UISettings,loadGameData,KEY_ACTIONS,DEFAULT_KEYS,resolveKeys,bindingProblem,keyLabel,BINDABLE_KEY,type KeyAction} from '@the-beginning-online/shared';
import {setKeyBindings} from './keys';
import './control-hints.css';
/** Thai names for the rebindable actions, in settings order. */
const ACTION_NAMES:Record<KeyAction,string>={attack:'โจมตี',dash:'หลบ',potion:'ดื่มยา HP',manaPotion:'ดื่มยา MP',auto:'เปิด/ปิด AUTO',talk:'คุยกับ NPC',nextTarget:'เปลี่ยนเป้าหมาย',inventory:'กระเป๋า',skills:'สมุดสกิล',stats:'สเตตัส',returnCity:'กลับเมือง'};
import {GATES,LAYOUTS,MAP_INFO,FIELD_PLACES,FIELD_HABITATS,FIELD_BOSS,THORN_NEST,fieldHabitatAt,isField,gateRoute,type MapId} from '@the-beginning-online/shared/maps';
import {paintMinimapLayer} from './minimap-view';
const $=<T extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
import {createPlayerPathfinder,createTravelRoute,gateApproach} from './hud-path';
import {updateMonsterTags} from './monster-tags';
export function mountHUDQOL(o:{send:(m:any)=>void;map:()=>MapId;player:()=>any;talk:(kind:string)=>void;settings:()=>void;party:()=>void;stop:()=>void;notice:(text:string)=>void;/** release held movement without touching AUTO */release:()=>void;/** world-map travel reached its map */arrived?:(name:string)=>void}){
 const signature=(s:UISettings)=>JSON.stringify([s.scale,resolveKeys(s.keys),...(['bag','stats','skills'] as const).map(k=>s.windows[k]?[s.windows[k]!.x,s.windows[k]!.y]:null)]);
 let confirmed=structuredClone(DEFAULT_UI);
 let settings:UISettings=structuredClone(DEFAULT_UI),dirty=false,saving=false,lastTarget:any=null,targetUntil=0;
 let lastBarKeys='';
 let arrival:string|null=null,nextWaypoint=0,routeMap=o.map(),destinationName='';
 /** World-map travel: the map we are walking to, one gate at a time. */
 let goalMap:MapId|null=null;
 let goalPoint:{map:MapId;x:number;z:number;kind:string;name?:string}|null=null;
 const travel=document.createElement('div');travel.id='travel-status';travel.hidden=true;travel.innerHTML='<b id="travel-destination"></b><span id="travel-next"></span><button type="button">หยุดเดินทาง</button>';$('.quest').append(travel);
 const data=loadGameData();const text=(id:string,value:string)=>{const el=$(id);if(el.textContent!==value)el.textContent=value;};
 const huntingArea=document.createElement('div');huntingArea.id='hunting-area';huntingArea.hidden=true;$('#quest-name').after(huntingArea);
 const targetTags=document.createElement('div'),bossTags=document.createElement('div');
 targetTags.id='target-tags';bossTags.id='boss-tags';
 for(const tags of [targetTags,bossTags]){tags.className='monster-tags';tags.setAttribute('role','group');tags.setAttribute('aria-label','ธาตุ ขนาด และเผ่าของมอนสเตอร์');}
 $('#target .bar').before(targetTags);$('#boss-hud .bar').before(bossTags);
 const character=$('.player');character.append($('#buff-status'));$('.player-info').append($('#job-progress'));
 $('#job-progress').append($('#job-xp').parentElement!);
 $('.rewards').innerHTML='<span id="wallet"></span><span id="kills"></span><b id="gold" hidden></b>';
 $('#skills-more').textContent=matchMedia('(max-width:650px)').matches?'เพิ่มเติม':'▲';
 const extra=document.createElement('section');extra.id='qol-controls';extra.innerHTML='<button id="return-city">กลับเมือง H</button>';$('.combat-ui .legacy-actions').append(extra);
 const cast=document.createElement('div');cast.id='return-cast';cast.hidden=true;cast.innerHTML='<span></span><progress max="5"></progress>';$('#ui').append(cast);
 const menu=document.createElement('dialog');menu.id='game-menu-window';menu.setAttribute('aria-labelledby','game-menu-title');
 const tile=(icon:string,label:string,tint:string,attrs='',key='')=>`<button type="button" class="menu-tile" data-icon="${icon}" style="--tint:${tint}" ${attrs}><i></i><span>${label}</span>${key?`<kbd>${key}</kbd>`:''}</button>`;
 menu.innerHTML='<button class="close" aria-label="ปิดเมนู">×</button><p class="menu-eyebrow">THE BEGINNING ONLINE</p><h2 id="game-menu-title">เมนูผจญภัย</h2>'
  +'<section class="menu-group"><p class="caption">ตัวละคร</p><div class="menu-grid">'
   +tile('character','สเตตัส','#e8a35f','data-go="#stats-button"','C')+tile('skills','สกิล','#c495f2','data-go="#skills-button"','K')+tile('bag','กระเป๋า','#e6c98f','data-go="#inventory-button"','I')+tile('quest','เควส','#8fd18a','data-go="#quest-button"')
   +tile('auto','ตั้งค่า AUTO','#5fb6e8','data-go="#auto-settings-button"')+'</div></section>'
  +'<section class="menu-group"><p class="caption">เกม</p><div class="menu-grid menu-play">'+tile('party','ปาร์ตี้','#9bcba5','id="menu-party"')+tile('settings','ตั้งค่า','#9fb3c8','id="menu-settings"','Esc')+'</div></section>'
  +'<section class="menu-group menu-exit"><div class="menu-grid"><a class="menu-tile danger" data-icon="exit" style="--tint:#e8656a" href="/characters.html"><i></i><span>ออกจากเกม</span></a></div><p class="menu-key-hint"><kbd>Esc</kbd> กลับสู่การผจญภัย</p></section>';document.body.append(menu);
 // Quality and help live in Settings; character actions stay in this launcher.
 menu.addEventListener('click',e=>{const go=(e.target as HTMLElement).closest<HTMLElement>('[data-go]');if(!go)return;menu.close();document.querySelector<HTMLElement>(go.dataset.go!)?.click();});
 menu.querySelector<HTMLAnchorElement>('a[href="/characters.html"]')!.onclick=e=>{const p=o.player();if((p.attack>0||p.hurt>0||p.target!=null)&&!confirm('ออกจากเกม?'))e.preventDefault();};
 $('#game-menu').onclick=()=>{o.release();menu.showModal();};menu.querySelector<HTMLButtonElement>('.close')!.onclick=()=>menu.close();$('#menu-settings').onclick=()=>{menu.close();o.settings();};$('#menu-party').onclick=()=>{menu.close();o.party();};
 const preferences=document.createElement('section');preferences.id='hud-settings';preferences.innerHTML='<h3>หน้าจอและปุ่ม</h3><label>ขนาดหน้าจอ <select id="ui-scale">'+[90,100,110,120].map(n=>`<option value="${n}">${n}%</option>`).join('')+'</select></label><div id="action-keys" class="action-keys"><p class="caption">ปุ่มคำสั่ง</p><p class="settings-hint">แตะช่องแล้วกดปุ่มที่ต้องการ · ปุ่มเดิน WASD/ลูกศร, Esc และ M (แผนที่) เปลี่ยนไม่ได้</p>'+KEY_ACTIONS.map(a=>`<label class="key-row"><span>${ACTION_NAMES[a]}</span><input id="key-${a}" data-action-key="${a}" readonly aria-label="ปุ่ม${ACTION_NAMES[a]}"></label>`).join('')+'<button id="reset-action-keys" type="button">คืนปุ่มเริ่มต้น</button></div><button id="reset-windows">คืนตำแหน่งหน้าต่าง</button><p id="hud-save" role="status"></p>';$('#audio-settings').append(preferences);
 const apply=()=>{const keys=resolveKeys(settings.keys,(o.player().hotbar??[]).map((s:any)=>s.key));setKeyBindings(keys);for(const hint of document.querySelectorAll<HTMLElement>('[data-hint-key]'))hint.textContent=keyLabel(keys[hint.dataset.hintKey as KeyAction]);for(const [sel,action,label] of [['#stats-button','stats','สเตตัส'],['#skills-button','skills','สกิล'],['#inventory-button','inventory','กระเป๋า']] as const){const b=$(sel);b.title=b.ariaLabel=`${label} (${keyLabel(keys[action])})`;}const home=$('#return-city');home.title=home.ariaLabel='กลับเมือง';home.innerHTML=`<span aria-hidden="true">⌂</span><kbd>${keyLabel(keys.returnCity)}</kbd>`;for(const [sel,a] of [['[data-action="attack"]','attack'],['[data-action="dash"]','dash'],['[data-action="potion"]','potion'],['#mana-potion','manaPotion'],['#auto-hunt','auto']] as const){const kbd=document.querySelector(sel+' kbd');if(kbd)kbd.textContent=keyLabel(keys[a]);if(a==='potion'||a==='manaPotion'){const button=$(sel);button.title=button.ariaLabel=`ดื่มยา ${a==='potion'?'HP':'MP'} (${keyLabel(keys[a])})`;}}document.documentElement.style.setProperty('--ui-scale',String(settings.scale/100));$<HTMLSelectElement>('#ui-scale').value=String(settings.scale);for(const a of KEY_ACTIONS){const input=$<HTMLInputElement>('#key-'+a);input.value=keyLabel(keys[a]);input.dataset.code=keys[a];input.classList.toggle('changed',keys[a]!==DEFAULT_KEYS[a]);}for(const [id,key]of [['inventory-window','bag'],['stats-window','stats'],['skills-window','skills']] as const){const el=$('#'+id),position=settings.windows[key];if(position){el.style.margin='0';el.style.left=`${position.x*Math.max(0,innerWidth-el.offsetWidth)}px`;el.style.top=`${position.y*Math.max(0,innerHeight-el.offsetHeight)}px`;}else{el.style.margin='';el.style.left='';el.style.top='';}}};
 const save=()=>{settings.keys=resolveKeys(settings.keys,(o.player().hotbar??[]).map((s:any)=>s.key));dirty=true;$('#hud-save').textContent='กำลังบันทึก…';if(!saving){saving=true;o.send({t:'uiSettings',settings:structuredClone(settings)});}};
 $<HTMLSelectElement>('#ui-scale').onchange=e=>{settings.scale=Number((e.target as HTMLSelectElement).value) as UISettings['scale'];apply();save();};
 for(const a of KEY_ACTIONS)$<HTMLInputElement>('#key-'+a).onkeydown=e=>{if(e.code==='Tab'||e.code==='Escape')return;e.preventDefault();e.stopPropagation();
  // Same rules as the server: bindable code, not movement/Esc, not another action, not a hotbar slot.
  const next={...resolveKeys(settings.keys,(o.player().hotbar??[]).map((s:any)=>s.key)),[a]:e.code},problem=BINDABLE_KEY.test(e.code)?bindingProblem(next,(o.player().hotbar??[]).map((s:any)=>s.key)):'ใช้ปุ่มนี้ไม่ได้';
  if(problem){$('#hud-save').textContent=problem;return;}settings.keys=next;apply();save();};
 $('#reset-action-keys').onclick=()=>{const next={...DEFAULT_KEYS},problem=bindingProblem(next,(o.player().hotbar??[]).map((s:any)=>s.key));if(problem){$('#hud-save').textContent='คืนค่าไม่ได้: '+problem;return;}settings.keys=next;apply();save();};
 $('#reset-windows').onclick=()=>{settings.windows={};apply();save();};
 for(const [id,key]of [['inventory-window','bag'],['stats-window','stats'],['skills-window','skills']] as const){const el=$('#'+id),title=el.querySelector<HTMLElement>('h2')!;title.classList.add('window-handle');let drag:{x:number;y:number;left:number;top:number}|null=null;
 title.onpointerdown=e=>{const b=el.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:b.left,top:b.top};title.setPointerCapture(e.pointerId);e.preventDefault();};
 title.onpointermove=e=>{if(!drag)return;el.style.margin='0';el.style.left=Math.max(0,Math.min(innerWidth-el.offsetWidth,drag.left+e.clientX-drag.x))+'px';el.style.top=Math.max(0,Math.min(innerHeight-el.offsetHeight,drag.top+e.clientY-drag.y))+'px';};
 const finish=()=>{if(!drag)return;drag=null;settings.windows[key]={x:Math.max(0,Math.min(1,parseFloat(el.style.left)/Math.max(1,innerWidth-el.offsetWidth))),y:Math.max(0,Math.min(1,parseFloat(el.style.top)/Math.max(1,innerHeight-el.offsetHeight)))};save();};title.onpointerup=finish;title.onpointercancel=finish;new MutationObserver(()=>{if(el.hasAttribute('open'))apply();}).observe(el,{attributes:true,attributeFilter:['open']});}
 window.addEventListener('resize',apply);
 const hint=document.createElement('aside');hint.id='control-hints';hint.hidden=true;hint.setAttribute('aria-labelledby','control-hints-title');hint.innerHTML=`
  <header class="hints-heading"><span class="hints-emblem" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="12"/><path d="m21 11-3 7-7 3 3-7 7-3Z"/><path d="M16 1v4m0 22v4M1 16h4m22 0h4"/></svg></span><div><p class="hints-eyebrow">คู่มือนักผจญภัย</p><h2 id="control-hints-title">ทุกการเดินทาง เริ่มที่ก้าวแรก</h2></div></header>
  <p class="hints-intro">รู้จักปุ่มสำคัญ แล้วออกไปสำรวจโลกของคุณ</p>
  <div class="hints-basics"><section><h3><span>01</span> เดินและสำรวจ</h3><div class="hints-wasd" aria-label="ปุ่ม W A S D"><kbd>W</kbd><div><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div></div><p>ใช้ <b>WASD</b> หรือปุ่มลูกศร<br>คลิกพื้นเพื่อเดินไปยังจุดหมาย</p></section><section><h3><span>02</span> พูดคุยและต่อสู้</h3><div class="hints-mouse" aria-hidden="true"><svg viewBox="0 0 32 40" fill="none"><rect x="6" y="2" width="20" height="34" rx="10"/><path d="M16 2v14M6 16h20"/><path d="M9 12V9a7 7 0 0 1 4-5v9H9Z" fill="currentColor" stroke="none"/></svg></div><p>กด <kbd data-hint-key="talk">F</kbd> หรือคลิกชาวเมืองเพื่อคุย<br>คลิกมอนสเตอร์เพื่อเข้าจู่โจม</p></section></div>
  <dl class="hints-shortcuts"><div><dt><kbd data-hint-key="skills">K</kbd></dt><dd>สมุดสกิล</dd></div><div><dt><kbd data-hint-key="stats">C</kbd></dt><dd>สเตตัส</dd></div><div><dt><kbd data-hint-key="inventory">I</kbd></dt><dd>กระเป๋า</dd></div><div><dt><kbd>M</kbd></dt><dd>แผนที่</dd></div><div><dt><kbd data-hint-key="returnCity">H</kbd></dt><dd>กลับเมือง</dd></div></dl>
  <div class="hints-skill-note"><kbd>1–0</kbd><span>ใช้สกิลในแถบปุ่มลัด</span><kbd data-hint-key="auto">T</kbd><span>เปิด / ปิด AUTO</span></div>
  <footer class="hints-footer"><small>ปรับปุ่มคำสั่งได้ในตั้งค่า</small><button type="button" aria-label="เข้าใจแล้ว">เข้าใจแล้ว <span aria-hidden="true">→</span></button></footer>`;
 $('#ui').append(hint);hint.querySelector('button')!.onclick=()=>{hint.hidden=true;try{localStorage.setItem('tn-hints-dismissed','yes');}catch{}};
 $('#play').addEventListener('click',()=>{let n=0;try{n=Number(sessionStorage.getItem('tn-hint-session')??localStorage.getItem('tn-hint-sessions')??0);if(!sessionStorage.getItem('tn-hint-session')){sessionStorage.setItem('tn-hint-session',String(n+1));localStorage.setItem('tn-hint-sessions',String(n+1));}else n=Math.max(0,n-1);}catch{}let dismissed=false;try{dismissed=localStorage.getItem('tn-hints-dismissed')==='yes';}catch{}hint.hidden=n>=2||dismissed;});
 if(matchMedia('(max-width:650px)').matches)$('.quest').classList.add('collapsed');
 const fpsLabel=document.createElement('label');fpsLabel.innerHTML='<input type="checkbox">แสดง FPS';$('#audio-settings').append(fpsLabel);const fpsInput=fpsLabel.querySelector('input')!;fpsInput.checked=new URLSearchParams(location.search).get('debug')==='1'||localStorage.getItem('tn-fps')==='yes';const showFPS=()=>{$('#fps').hidden=!fpsInput.checked;};fpsInput.onchange=()=>{localStorage.setItem('tn-fps',fpsInput.checked?'yes':'no');showFPS();};showFPS();
 const collapse=document.createElement('button');collapse.id='journal-toggle';collapse.textContent='บันทึกการเดินทาง ▾';collapse.setAttribute('aria-expanded',String(!$('.quest').classList.contains('collapsed')));$('.quest .caption').replaceWith(collapse);collapse.onclick=()=>{const folded=$('.quest').classList.toggle('collapsed');collapse.setAttribute('aria-expanded',String(!folded));};
 const mapPanel=$('.map');const toggleMap=()=>{mapPanel.hidden=!mapPanel.hidden;if(mapPanel.hidden)mapPanel.classList.remove('expanded');};
 const map=$<HTMLCanvasElement>('#map');map.tabIndex=0;map.setAttribute('role','button');map.setAttribute('aria-label','แผนที่ย่อ แตะเพื่อขยายและเลือกจุดหมาย');map.title='M แผนที่โลก · คลิกจุดบนแผนที่เพื่อเดินไป';map.setAttribute('aria-keyshortcuts','M');
 const npcs=()=>o.map()==='city_plaza'?TOWN_NPCS:[];
 const points=()=>{const map=o.map();return [...npcs(),...(isField(map)?[...FIELD_PLACES[map].filter(p=>p.kind!=='boss').map(p=>({...p,kind:p.kind==='sign'?'sign':'place',icon:p.kind==='sign'?'➜':'⌖'})),...FIELD_HABITATS[map].map(h=>({...h,kind:'hunt',icon:'●',name:`${h.name} · Lv.${data.monsters.monsters.find(m=>m.id===h.dataId)!.level}`}))]:[]),...LAYOUTS[map].camps.map((c,i)=>({...c,kind:'camp',icon:'△',name:`แคมป์ ${i+1} · ฟื้น HP · ยังมีอันตราย`})),...Object.entries(GATES[map]).map(([kind,p])=>({...p,kind:'gate:'+kind,icon:'◇',name:'ประตู'}))];};
 const coords=(p:{x:number;z:number})=>{const l=LAYOUTS[o.map() as MapId];return{x:(p.x+l.halfX)/(l.halfX*2)*160,y:(p.z+l.halfZ)/(l.halfZ*2)*132};};
 /** Stops walking; `keepGoal` keeps world-map travel going (gates and map changes), a player's own input ends it. */
 const cancel=(keepGoal=false)=>{journey.clear();arrival=null;nextWaypoint=0;if(!keepGoal){goalMap=null;goalPoint=null;}};
 // Explicitly clear the server's last waypoint even when AUTO is already off.
 travel.querySelector('button')!.onclick=()=>{cancel();o.stop();o.send({t:'auto',on:false});};
 let pathfinder:ReturnType<typeof createPlayerPathfinder>|undefined,pathfinderMap:MapId|undefined;
 const journey=createTravelRoute((from,to)=>{if(!pathfinder||pathfinderMap!==o.map()){pathfinder=createPlayerPathfinder(o.map());pathfinderMap=o.map();}return pathfinder.findPath(from,to);});
 const navigate=(p:{x:number;z:number;kind:string;name?:string})=>{o.stop();const ok=journey.start(o.player(),p.kind.startsWith('gate:')?gateApproach(p):p,performance.now());arrival=ok?p.kind:null;destinationName=p.name??(p.kind==='ground'?'จุดที่เลือก':'จุดหมาย');nextWaypoint=0;routeMap=o.map();o.send({t:'auto',on:false});if(!ok){cancel();o.notice('ไม่พบทางเดินไปจุดหมาย ลองเลือกจุดใกล้เคียง');}return ok;};
 const returnCity=()=>{cancel();o.send({t:'returnCity'});};$('#return-city').onclick=returnCity;
 map.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('.map').classList.toggle('expanded');}};
 map.onclick=e=>{const box=map.getBoundingClientRect();if(innerWidth<650&&!$('.map').classList.contains('expanded')){$('.map').classList.add('expanded');return;}
 const v=(map as any).view||{k:1,ox:0,oy:0},x=((e.clientX-box.left)/box.width*map.width-v.ox)/v.k,y=((e.clientY-box.top)/box.height*map.height-v.oy)/v.k;const hit=points().sort((a,b)=>Math.hypot(coords(a).x-x,coords(a).y-y)-Math.hypot(coords(b).x-x,coords(b).y-y))[0];if(hit&&Math.hypot(coords(hit).x-x,coords(hit).y-y)<Math.max(16,22*160/box.width)){cancel();navigate(hit);$('.map').classList.remove('expanded');}};
 document.addEventListener('dragstart',()=>document.body.classList.add('dragging-hotbar'));document.addEventListener('dragend',()=>document.body.classList.remove('dragging-hotbar'));document.addEventListener('drop',()=>document.body.classList.remove('dragging-hotbar'));
 let bannerTimer:ReturnType<typeof setTimeout>;const banner=()=>{clearTimeout(bannerTimer);$('#area-name').classList.remove('area-faded');bannerTimer=setTimeout(()=>$('#area-name').classList.add('area-faded'),4000);};banner();
 return {cancel,banner,toggleMap,walkGround(p:{x:number;z:number}){navigate({...p,kind:'ground'});},
 /** Walk to a point of the current map (world map list): NPCs are talked to on arrival. */
 goTo(p:{x:number;z:number;kind:string;name?:string}){cancel();return navigate(p);},
 goToMap(p:{map:MapId;x:number;z:number;kind:string;name?:string}){cancel();if(p.map===o.map())return navigate(p);if(!gateRoute(o.map(),p.map,o.player().level).length){o.notice('ยังไม่มีเส้นทางไปจุดหมายนี้');return false;}o.stop();o.send({t:'auto',on:false});goalMap=p.map;goalPoint=p;return true;},
 /** Points of interest on the current map, as the minimap shows them. */
 points,
 /** Walk to another map through its gates; returns false when there is no way. */
 travelTo(map:MapId){if(!gateRoute(o.map(),map,o.player().level).length&&map!==o.map())return false;cancel();o.stop();o.send({t:'auto',on:false});goalMap=map;return true;},
 get goal(){return goalMap;},attacked(enemy:any){lastTarget=enemy;targetUntil=performance.now()+4000;},key(code:string){const keys=resolveKeys(settings.keys,(o.player().hotbar??[]).map((s:any)=>s.key));if(code===keys.returnCity){returnCity();return true;}return false;},
 clickNPC(project:(x:number,z:number,y:number)=>{x:number;y:number},x:number,y:number){const candidates=npcs().map(n=>({...n,screen:project(n.x,n.z,1.5)})).filter(n=>Math.hypot(n.screen.x-x,n.screen.y-y)<32).sort((a,b)=>Math.hypot(a.screen.x-x,a.screen.y-y)-Math.hypot(b.screen.x-x,b.screen.y-y));if(candidates[0]){cancel();navigate(candidates[0]);return true;}return false;},
 receive(m:any){if(m.t==='welcome'){saving=false;if(dirty)save();}if(m.t==='uiSettings'){if(saving){saving=false;if(signature(m.settings)!==signature(settings)){save();return;}dirty=false;}if(!dirty){confirmed=structuredClone(m.settings);settings=structuredClone(m.settings);apply();$('#hud-save').textContent='บันทึกแล้ว';}}if(m.t==='uiSettingsError'){saving=false;dirty=false;settings=structuredClone(confirmed);apply();$('#hud-save').textContent=m.text;}},
 update(game:any,position=game.p){const p=game.p;const barKeys=(p.hotbar??[]).map((s:any)=>s.key).join();if(barKeys!==lastBarKeys){lastBarKeys=barKeys;apply();}
 const huntingMap=o.map();huntingArea.hidden=!isField(huntingMap);
 if(isField(huntingMap)){const h=fieldHabitatAt(huntingMap,p.x,p.z),nest=huntingMap==='forest'&&Math.hypot(p.x-THORN_NEST.x,p.z-THORN_NEST.z)<7,boss=nest?THORN_NEST:FIELD_BOSS[huntingMap],nearBoss=!!boss&&(nest||Math.hypot(p.x-boss.x,p.z-boss.z)<LAYOUTS[huntingMap].arena!.r+3);
  huntingArea.dataset.variant=nearBoss?'boss':h?(huntingMap==='meadow'?h.variant:huntingMap):'road';
  const monster=data.monsters.monsters.find(m=>m.id===(nearBoss?boss!.dataId:h?.dataId));
  text('#hunting-area',nearBoss?`ลาน${monster!.nameTh} · Lv.${monster!.level}`:h?`${h.name} · Lv.${monster!.level}`:LAYOUTS[huntingMap].exploration?'แมปสำรวจ · มอนและของดรอปยังไม่เปิด':'ทางเดินเชื่อมพื้นที่ล่า');
 }
 if(routeMap!==o.map()||routeMap!==p.mapId||p.dead)cancel(!p.dead);
 const previousWaypoint=journey.points[0],routeState=journey.update(position,performance.now());
 if(previousWaypoint!==journey.points[0])nextWaypoint=0;
 if(routeState==='blocked'){cancel();o.send({t:'auto',on:false});o.notice('เดินต่อไม่ได้ ระบบหยุดนำทางแล้ว ลองเลือกจุดหมายใหม่');}
 if(goalMap&&!journey.points.length&&!arrival&&p.mapId===o.map()){
  if(o.map()===goalMap){goalMap=null;const point=goalPoint;goalPoint=null;if(point)navigate(point);else o.arrived?.(MAP_INFO[o.map()].name);}
  else{const step=gateRoute(o.map(),goalMap,p.level)[0],gate=step&&(GATES[o.map()] as Record<string,{x:number;z:number}>)[step.gate];
   // Standing on the gate: the controller sends the travel; just wait for the map to change.
   if(gate&&Math.hypot(p.x-gate.x,p.z-gate.z)>1.6){navigate({...gate,kind:'gate:'+step.gate});if(!journey.points.length)goalMap=null;}
   else if(!gate)goalMap=null;}
 }
 travel.hidden=!goalMap&&!arrival;
 if(goalMap){const steps=gateRoute(o.map(),goalMap,p.level),next=steps[0],destination=next&&(GATES[next.map] as Record<string,{x:number;z:number}>)[next.gate];
  text('#travel-destination','กำลังไป'+(goalPoint?.name??MAP_INFO[goalMap].name));
  text('#travel-next',next?`ถัดไป: ประตู${({north:'เหนือ',south:'ใต้',east:'ตะวันออก',west:'ตะวันตก'} as Record<string,string>)[next.gate]} · เหลือ ${steps.length} ประตู${destination?' · '+Math.round(Math.hypot(p.x-destination.x,p.z-destination.z))+' ม. ถึงประตู':''}`:'ถึงปลายทางแล้ว');
 }
 else if(arrival){let distance=0,previous=p;for(const point of journey.points){distance+=Math.hypot(point.x-previous.x,point.z-previous.z);previous=point;}text('#travel-destination','กำลังไป'+destinationName);text('#travel-next',`เหลือ ${Math.ceil(distance)} ม. · เดินเองหรือ Esc เพื่อหยุด`);}
 if(journey.points.length){const point=journey.points[0];if(performance.now()>nextWaypoint){o.send({t:'move',x:point.x,z:point.z,mapId:routeMap});nextWaypoint=performance.now()+600;}}
 else if(arrival){const kind=arrival;arrival=null;if(!kind.startsWith('gate:')){o.arrived?.(destinationName);if(!['ground','hunt','boss','place','camp','sign'].includes(kind))o.talk(kind);}}
 $('#wallet').textContent=`${p.gold.toLocaleString('th-TH')} ทอง · ${Math.round(p.carryWeight||0)}/${Math.round(p.weightLimit||0)}`;
 $('#kills').textContent=`ปราบแล้ว ${game.kills}`;$('#level').textContent=`${p.level}`;
 text('#job-label',`Lv.${p.level} · ความชำนาญ K`);
 $('#job-xp').parentElement!.hidden=true;$('#job-exp').textContent=`ประสบการณ์ ${p.level>=data.stats.maxLevel?'MAX':p.xp+'/'+p.nextXp}`;
 const effects=[...(p.statuses||[]),...Object.entries(p.consumableBuffs??{}).filter(([,buff]:any)=>buff.until>Date.now()).map(([key,buff]:any)=>({id:key==='speed'?'speed':key==='exp'?'boost_exp':'boost_drop',sourceId:'consumable',remaining:(buff.until-Date.now())/1000}))];if(p.carryWeight>=p.weightLimit*.5)effects.push({id:'weight',remaining:0});const buff=$('#buff-status');const ids=effects.map(s=>s.id).join(',');if(buff.dataset.effects!==ids){buff.dataset.effects=ids;buff.replaceChildren();for(const s of effects){const icon=document.createElement('span');icon.className='buff-icon';buff.append(icon);}}for(const [index,s] of effects.entries()){const names:Record<string,string>={boost_exp:'EXP/Job EXP ×2',boost_drop:'อัตราดรอป ×2',endure:'ใจเหล็ก',speed:'เคลื่อนไหวเร็วขึ้น',stun:'มึนงง',knockup:'ลอย',slow:'ช้าลง',weight:'น้ำหนักเกิน'};const icon=buff.children[index] as HTMLElement,art=masteryStatusArt(s.id,s.sourceId);icon.classList.toggle('job-icon',!!art?.file);icon.style.backgroundImage=art?.file?`url('/assets/mastery-painted/${art.file}')`:'';icon.style.backgroundPosition=art?.file?'center':'';icon.style.backgroundSize=art?.file?'100% 100%':'';icon.textContent=art?.file?'':s.id==='weight'?'⚖':s.id==='speed'?'✚':s.id==='boost_exp'?'E':s.id==='boost_drop'?'D':'✦';icon.title=`${art?.name||names[s.id]||'ผลสถานะ'}${s.remaining?' '+(s.remaining>=60?Math.ceil(s.remaining/60)+' นาที':s.remaining.toFixed(1)+' วินาที'):''}`;icon.setAttribute('aria-label',icon.title);icon.style.setProperty('--remaining',`${s.remaining?Math.min(1,s.remaining/(s.sourceId==='consumable'?3600:s.id==='endure'?8:s.id==='guard'?10:s.id==='rage'?12:60))*360:360}deg`);}
 cast.hidden=!p.returnRemaining;cast.querySelector('span')!.textContent=`กำลังกลับเมือง ${Math.ceil(p.returnRemaining||0)} วินาที`;(cast.querySelector('progress')!).value=5-(p.returnRemaining||0);
 const current=game.enemies.find((e:any)=>e.id===game.target&&!e.dead);if(current){lastTarget=current;targetUntil=performance.now()+4000;}else if(lastTarget){lastTarget=game.enemies.find((e:any)=>e.id===lastTarget.id)||lastTarget;}
 const target=current||(performance.now()<targetUntil?lastTarget:null);$('#target').hidden=!target||target.boss;if(target){const monster=data.monsters.monsters.find(m=>m.id===target.dataId);$('#target-name').textContent=monster?.nameTh||'ราชาวุ้น';$('#target-lv').textContent=`ระดับ ${monster?.level??1}`;updateMonsterTags(targetTags,monster);$('#target-hp').style.width=`${target.hp/target.maxHp*100}%`;let percent=$('#target-percent');if(!percent){percent=document.createElement('small');percent.id='target-percent';$('#target .bar').append(percent);}percent.textContent=`${Math.ceil(target.hp/target.maxHp*100)}%`;}
 // Field bosses live far across the big maps; only a boss whose bar is on screen replaces the target frame.
 const boss=$('#boss-hud').hidden?null:game.enemies.find((e:any)=>e.boss&&(!e.dead||e.deathAge<3.8)&&Math.hypot(e.x-game.p.x,e.z-game.p.z)<28);if(boss){$('#target').hidden=true;updateMonsterTags(bossTags,data.monsters.monsters.find(m=>m.id===boss.dataId));$('#boss-hud small').textContent=boss.dead?'ปราบแล้ว':`ระยะ ${boss.bossPhase} · ${Math.ceil(boss.hp/boss.maxHp*100)}%`;$('#boss-hud').style.setProperty('--phase',boss.bossPhase===2?'#f4a9ba':'#e4cc91');}
 const ctx=map.getContext('2d')!,view=(map as any).view||{k:1,ox:0,oy:0},mk=view.k;paintMinimapLayer(ctx,map.width,view,()=>{if(journey.points.length){ctx.save();ctx.strokeStyle='#9cead4';ctx.lineWidth=2/mk;ctx.setLineDash([4/mk,3/mk]);ctx.beginPath();const origin=coords(p);ctx.moveTo(origin.x,origin.y);for(const waypoint of journey.points){const point=coords(waypoint);ctx.lineTo(point.x,point.y);}ctx.stroke();ctx.restore();}ctx.font=`bold ${13/mk}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';for(const p of points()){const c=coords(p);ctx.fillStyle='#102921';ctx.beginPath();ctx.arc(c.x,c.y,7/mk,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff4d6';ctx.fillText(p.icon,c.x,c.y);}
 const c=coords(p);ctx.save();ctx.translate(c.x,c.y);ctx.scale(1/mk,1/mk);ctx.rotate(Math.atan2(p.fx,-p.fz));ctx.fillStyle='#fff';ctx.strokeStyle='#132b27';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(4,5);ctx.lineTo(0,3);ctx.lineTo(-4,5);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();});
 }};
}
