import {mountCombatBar} from './combat-bar';
import {bestPotion} from '@the-beginning-online/shared';
import {masteryTarget} from '@the-beginning-online/shared';
import {isBiomeMap,BIOME_SCENES} from './biome-scenes';
import {THORN_NEST} from '@the-beginning-online/shared/maps';
import { mountWorldMap } from './world-map-ui';
import {mountTitles} from './titles-ui';
import {mountMailbox} from './mailbox-ui';
import {loadUIFonts,UI_FONT_FAMILY} from './fonts';
import {monsterSpecies,SPECIES_HIT_COLOUR} from './monster-animation';
import {overlaps,type Rect} from './world-labels';
import {CONTACT_FRAME,CAST_SECONDS,isSkillMotion,preferOwnArt} from './skill-motions';
import {CombatFeel,AutoQuality} from './combat-feel';
import {mountInventory} from './inventory-ui';
import {mountAutoSettings} from './auto-ui';
import {mountSettingsWindow} from './settings-ui';
import {loadGameData,rarityColors,keyLabel} from '@the-beginning-online/shared';
import { CITY, MAP_INFO, isField, CITY_BUILDINGS, CITY_HOUSES, NEW_BUILDINGS, CITY_FOUNTAIN, HEALER, GATE_CAPTAIN, GATES, GATE_LINKS, LAYOUTS, FIELD_BOSS, type MapId } from '@the-beginning-online/shared/maps';
import jobs from '../../shared/data/jobs.json' with {type:'json'};
import { playEventAudio } from './audio-events';
import { mountSocial } from './social-ui';
import { mountTrade } from './trade-ui';
import { mountLevelUp } from './levelup-ui';
import { mountCardDrop } from './card-drop-ui';
import { mountQuests } from './quest-ui';
import { mountAudioSettings } from './audio-settings-ui';
import { mountAutoPotion } from './auto-potion-ui';
import{mountSkills}from'./skills-ui';
import{loadSelected,mountMenuAccount}from'./web/game-session';
import{assetJSON}from'./asset-request';
import{GameCanvas2D}from'./game-2d-renderer';
import{ShadowHero,parseShadowManifest}from'./shadow-hero';

import './shadow-combat.css';
import {TOWN_NPCS,nearbyTownNpc} from './city-2d-locations';
import {paintMinimapLayer} from './minimap-view';
import {MEADOW_LANDMARKS,FIELD_HABITATS} from '@the-beginning-online/shared/maps';
type TextureManifest=Record<string,{webp:string}>;
import{GameSocket}from'./net/socket';import{NetworkWorld}from'./net/world';
import{KEYS,isKey}from'./keys';
import './style.css';
import './card-drop.css';
import {mountHUDQOL} from './hud-qol';
import './hud-qol.css';
import './ui-glass.css';
import './ui-windows.css';
import './ui-theme.css';
import './game-menu.css';
import './combat-bar.css';
import {mountTutorialGuide} from './tutorial-guide';
import {mountAngel} from './angel-ui';
let angelUI:ReturnType<typeof mountAngel>|undefined;
let guide:ReturnType<typeof mountTutorialGuide>|undefined;
let qol:ReturnType<typeof mountHUDQOL>|undefined;let worldMap:ReturnType<typeof mountWorldMap>|undefined;let settingsUI:ReturnType<typeof mountSettingsWindow>|undefined;let pendingUI:any;
import{walkable,CD,CAMP,ARENA}from'./sim';import type{Action,Event}from'./sim';
import{AudioEngine}from'./audio';
const $=<E extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<E>(s)!;const $$=(s:string)=>[...document.querySelectorAll<HTMLElement>(s)];
window.tnBoot.stage(0);
const [selected,textureManifest]=await Promise.all([loadSelected(),assetJSON<TextureManifest>('/texture-manifest.json?v='+import.meta.env.VITE_BUILD_ID),loadUIFonts()]);window.tnBoot.stage(2);
let statsController:any=null,lastStats:any=null;const statsUI={get open(){return !!statsController?.open;},async toggle(){if(!statsController){const{mountStats}=await import('./stats-window');statsController=mountStats(message=>net.send(message),()=>clearInput());if(lastStats)statsController.receive(lastStats);}if(!statsController.open)sound.play('ui_open');statsController.toggle();},receive(e:any){if(e.type==='stats'){lastStats=e;$('#stats-button').classList.toggle('has-points',e.points>=2);}statsController?.receive(e);}};$('#stats-button').onclick=()=>void statsUI.toggle();
// Opening a window only releases held movement; AUTO keeps hunting on the server (players manage bag/skills mid-hunt).
const skillsUI=mountSkills(message=>net.send(message),()=>clearInput(),id=>doAction(id),id=>sound.play(id));$('#skills-button').onclick=()=>skillsUI.toggle();
const inventoryUI=mountInventory(message=>net.send(message),()=>clearInput());
const autoUI=mountAutoSettings({send:message=>net.send(message),player:()=>game.p,map:()=>activeMap,onOpen:()=>clearInput(),onToggle:()=>toggleAuto(),potion:()=>autoPotionUI});
// Action launcher: the action buttons (J ⇧ R F H Z, AUTO settings) sit in a tile popup opened from one button.
// They are the original buttons moved in, so their listeners and keys are unchanged. On phones the popup is
// display:contents and the old row layout applies.
const launcher=(()=>{const bar=$('.legacy-actions'),open=document.createElement('button'),panel=document.createElement('div');
 open.id='actions-toggle';open.type='button';open.title=open.ariaLabel='ปุ่มลัด';open.setAttribute('aria-expanded','false');panel.id='action-launcher';panel.setAttribute('role','group');panel.setAttribute('aria-label','ปุ่มลัด');
 panel.append(...[...bar.children].filter(el=>el.tagName==='BUTTON'));
 const gear=panel.querySelector('#auto-settings-button');if(gear&&!gear.querySelector('span'))gear.insertAdjacentHTML('afterbegin','<span aria-hidden="true"></span>');bar.prepend(open);bar.append(panel);
 const set=(on:boolean)=>{document.body.classList.toggle('actions-open',on);open.setAttribute('aria-expanded',String(on));};
 open.onclick=()=>set(!document.body.classList.contains('actions-open'));
 document.addEventListener('pointerdown',e=>{if(document.body.classList.contains('actions-open')&&!bar.contains(e.target as Node))set(false);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')set(false);});
 // any window opening (AUTO settings, menu, bag…) folds the popup away
 new MutationObserver(()=>{if(document.querySelector('dialog[open]'))set(false);}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
 return {adopt:(el:Element)=>panel.append(el)};})();
const itemData=loadGameData();
const cardDrop=mountCardDrop(itemData);
const combatBar=mountCombatBar(()=>drinkMana());
const worldState=new NetworkWorld(),game=worldState.game,sound=new AudioEngine(selected.character.id),keys=new Set<string>();let qualityPreference="high";try{qualityPreference=localStorage.getItem("tn-quality")||"high";}catch{}
let started=false,paused=false,quality=qualityPreference!=="low",time=0,previous=performance.now(),accumulator=0,shake=0,zoomHeight=innerWidth<650?19.5:27.5,deathReveal=0;
sound.restore(selected.character.audioSettings);
const combatFeel=new CombatFeel(),autoQuality=new AutoQuality();autoQuality.automatic=false;
const audioUI=mountAudioSettings(sound,message=>net.send(message));const autoPotionUI=mountAutoPotion(message=>net.send(message));
const feelLabel=document.createElement('label');feelLabel.innerHTML='<input type="checkbox" id="combat-feel">ภาพสั่น/หยุดภาพ';document.querySelector('#audio-settings')!.append(feelLabel);const feelInput=feelLabel.querySelector('input')!;feelInput.checked=combatFeel.enabled;feelInput.onchange=()=>combatFeel.setEnabled(feelInput.checked);
document.addEventListener('click',e=>{if(e.target instanceof Element&&e.target.closest('button:not(:disabled)'))sound.play('ui_click');},true);
let titles:ReturnType<typeof mountTitles>|undefined;
let levelUp:ReturnType<typeof mountLevelUp>|undefined;
let mailbox:ReturnType<typeof mountMailbox>|undefined;
let trade:ReturnType<typeof mountTrade>|undefined,social:ReturnType<typeof mountSocial>|undefined,quests:ReturnType<typeof mountQuests>|undefined;
let sceneReady=false,netOverlay=false;const net=new GameSocket({message(message){
 // Job 2 skills borrow a Job 1 skill's motion, VFX and sound until they get their own art; keep the real id as learnedSkill.
 if(message.t==='ev')message.list=message.list.map(preferOwnArt);
  if(mailbox?.receive(message)||titles?.receive(message)||trade?.receive(message)||social?.receive(message)||quests?.receive(message))return;
 audioUI.receive(message);autoPotionUI.receive(message);inventoryUI.receive(message);autoUI.receive(message);if(message.t==='uiSettings')pendingUI=message;qol?.receive(message);
 if(message.t==='ev')for(const e of message.list)if(e.playerId===net.you){if(e.type==='stats')game.p.stats=e.derived;audioUI.receive(e);autoPotionUI.receive(e);}
 if(message.t==='snap'){worldState.receive(message,net.you,performance.now());if(message.mapId!==activeMap)void switchMap(message.mapId);}
  if(message.t==='inv'&&message.inventory){game.p.inventory=message.inventory;game.p.gold=message.gold;quests?.refresh();}
 if(message.t==='welcome')window.tnBoot.stage(3);
 if(message.t==='ev'){for(const e of message.list)if(e.playerId===net.you&&['stats','statsError'].includes(e.type))statsUI.receive(e);for(const e of message.list)if(e.playerId===net.you)skillsUI.receive(e);game.events.push(...message.list.filter((e:any)=>!['death','level','notice','victory'].includes(e.type)||e.playerId===net.you||e.type==='victory'));events();}
},status(state){
 let banner=document.querySelector<HTMLElement>('#network-status');if(!banner){banner=document.createElement('div');banner.id='network-status';banner.role='status';document.querySelector('#ui')!.append(banner);}
 banner.hidden=state==='connected';banner.dataset.state=state;banner.textContent=state==='connecting'?'กำลังเชื่อมต่อ…':state==='reconnecting'?'การเชื่อมต่อขาด กำลังต่อใหม่':'';
 if(state==='offline'||state==='opened elsewhere'||state==='kicked'){if(window.tnBoot.progress<100)window.tnBoot.fail('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่','socket');netOverlay=true;overlay(`<h1>${state==='opened elsewhere'?'เข้าสู่ระบบจากที่อื่น':state==='kicked'?'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่':'เซิร์ฟเวอร์ไม่ตอบ ลองใหม่อีกครั้ง'}</h1><button id="net-retry" class="primary">ลองใหม่อีกครั้ง</button>`);$('#net-retry').onclick=()=>{if(state==='kicked')location.assign('/login.html');else net.retry();};}
 if(state==='offline'){banner.textContent='ขาดการเชื่อมต่อ · กำลังรอลองใหม่';const countdown=document.createElement('p');countdown.id='net-countdown';$('#overlay .welcome')?.append(countdown);}
 if(state==='connected'&&netOverlay){netOverlay=false;paused=false;$('#overlay').hidden=true;}
}});
document.querySelector('#player-name')!.textContent=selected.character.name;
if(game.bossSpawned){document.querySelector('#quest-name')!.textContent='ผู้พิทักษ์แห่งทุ่งหญ้า';document.querySelector('#quest-note')!.textContent='หลบวงสีแดง แล้วโจมตีในช่วงพักของบอส';}
const renderer=new GameCanvas2D(textureManifest);renderer.combatFeel=combatFeel;$('#world').appendChild(renderer.canvas);
const hero=new ShadowHero(parseShadowManifest(await assetJSON('/assets/hero-shadow-8dir-v1/manifest.json')));
hero.combat=true;hero.outfit=selected.character.gender==='female'?'female':'male';
await Promise.all(Object.values(hero.manifest.looks).flatMap(motions=>Object.values(motions)).map(c=>renderer.assets.image(c.url)));
renderer.shadowHero=hero;
document.querySelector<HTMLImageElement>('.avatar img')!.src=`/assets/hero-portraits-v1/${hero.outfit}-portrait.webp`;
let assetFailure=false,activeMap:MapId=selected.character.mapId||'city_plaza';
try{await renderer.init(activeMap);sceneReady=true;window.tnBoot.stage(1);net.ready();$('#load-state').textContent='พร้อมแล้ว · เดินด้วย WASD หรือคลิกที่พื้น';}catch(error){assetFailure=true;window.tnBoot.fail('โหลดภาพเมืองไม่สำเร็จ กรุณาลองใหม่','texture');throw error;}
sound.setMap(activeMap);
document.documentElement.style.setProperty('--portrait','url("'+`/assets/hero-portraits-v1/${hero.outfit}-portrait.webp`+'")');
document.documentElement.style.setProperty('--hero-full','url("'+`/assets/hero-portraits-v1/${hero.outfit}-full.webp`+'")');
document.documentElement.style.setProperty('--skill-atlas','url("'+renderer.assets.url('/assets/skills-painted/skills-v2.png')+'")');
const right={x:13/Math.hypot(13,9),z:-9/Math.hypot(13,9)},up={x:-9/Math.hypot(13,9),z:-13/Math.hypot(13,9)};
let point={x:0,z:0};
const areaName=(id:MapId)=>MAP_INFO[id].name+' · '+MAP_INFO[id].levels;
$('.location').hidden=true;
const area=document.createElement('div');area.id='area-name';area.textContent=areaName(activeMap);$('#ui').append(area);
const fade=document.createElement('div');fade.id='map-loading';fade.className='overlay center';fade.hidden=true;fade.textContent='กำลังเดินทาง…';document.body.append(fade);
let failedMap:MapId|undefined,mapRetryAt=0,switchAttempts=0;
let switching=false,lastGate=0,closedGate='',overviewOn=false;
async function switchMap(id:MapId){
 if(switching||(failedMap===id&&performance.now()<mapRetryAt))return;switching=true;qol?.cancel(true);net.clearMovement();fade.textContent='กำลังเดินทาง…';fade.hidden=false;clearInput();
 try{
  await renderer.prepareMap(id);activeMap=id;quests?.refresh();sound.setMap(id);$('#quest-name').textContent=MAP_INFO[id].name;resize();area.textContent=areaName(id);qol?.banner();
  markerTime=0;
  for(const tag of statusLabels.values())tag.remove();statusLabels.clear();
  await new Promise(r=>setTimeout(r,180));
  failedMap=undefined;switchAttempts=0;
 }catch(error){console.error('Map load failed',error);failedMap=id;mapRetryAt=Infinity;fade.replaceChildren();const title=document.createElement('h1');title.textContent='โหลดพื้นที่ไม่สำเร็จ';const retry=document.createElement('button');retry.textContent='ลองใหม่';retry.onclick=()=>{retry.disabled=true;setTimeout(()=>{mapRetryAt=0;void switchMap(id);},Math.min(30000,500*2**switchAttempts++));};fade.append(title,retry);
 }finally{switching=false;fade.hidden=failedMap!==id;}
}
const npcTalk=document.createElement('button');npcTalk.id='npc-talk';npcTalk.hidden=true;$('#ui').append(npcTalk);
const npcDialog=document.createElement('dialog');npcDialog.id='npc-dialog';npcDialog.setAttribute('aria-labelledby','npc-dialog-title');npcDialog.innerHTML='<header class="npc-dialog-head"><span>พูดคุยและเควส</span><h2 id="npc-dialog-title"></h2></header><div class="npc-dialog-body"><p class="npc-intro"></p><div class="npc-extra"></div></div><footer class="npc-dialog-foot"><span>Esc เพื่อปิด</span><button type="button" class="npc-close">ปิดหน้าต่าง</button></footer>';document.body.append(npcDialog);npcDialog.querySelector<HTMLButtonElement>('.npc-close')!.onclick=()=>npcDialog.close();npcDialog.addEventListener('close',()=>quests?.unmount());
let nearNpc: {name:string;kind:string;text:string}|null=null;
npcTalk.onclick=()=>{if(!nearNpc)return;clearInput();const kind=nearNpc.kind,shopKind=['market','forge','storage'].includes(kind);if(shopKind&&!quests?.pending(kind)){inventoryUI.shop(kind);return;}if(kind==='heal')net.send({t:'heal'});npcDialog.querySelector('h2')!.textContent=nearNpc.name;npcDialog.querySelector('p')!.textContent=shopKind?(kind==='storage'?'ฝากของไว้ที่นี่ได้ ของในคลังปลอดภัยเสมอ':'มาดูของก่อนสิ'):nearNpc.text;const extra=npcDialog.querySelector<HTMLElement>('.npc-extra')!;extra.replaceChildren();if(shopKind){const open=document.createElement('button');open.className='npc-shop-open primary';open.textContent=kind==='storage'?'เปิดคลังเก็บของ':'เปิดร้าน';open.onclick=()=>{npcDialog.close();inventoryUI.shop(kind);};extra.append(open);}quests?.mount(kind,extra);if(!npcDialog.open)npcDialog.showModal();};
function mapInteractions(){
 const mapTitle=document.querySelector('.map-head');if(mapTitle)mapTitle.textContent=areaName(activeMap);
 overview.hidden=activeMap!=='city_plaza';const p=game.p;nearNpc=null;
 if(activeMap==='city_plaza'&&!CITY.empty&&!p.dead){
  const n=nearbyTownNpc(p.x,p.z);
  if(n&&n.kind!=='angel')nearNpc={name:n.name,kind:n.kind,text:n.line};
 }
 npcTalk.hidden=!nearNpc;npcTalk.textContent=nearNpc?`คุย [${keyLabel(KEYS.talk[0])}] · ${nearNpc.name}`:'';
 const gates=GATES[activeMap];let closed='';
 for(const [gate,point]of Object.entries(gates))if(Math.hypot(p.x-point.x,p.z-point.z)<3){
  const open=!!GATE_LINKS[activeMap][gate];
  if(!open)closed=gate;
  else if(!p.dead&&!switching&&p.mapId===activeMap&&performance.now()-lastGate>1500&&Math.hypot(p.x-point.x,p.z-point.z)<1.25){lastGate=performance.now();qol?.cancel(true);clearInput();net.send({t:'travel',gate});}
 }
 if(closed&&closed!==closedGate)notice('หมอกหนาเกินไป ยังผ่านไม่ได้');closedGate=closed;
}
const npcLabels=TOWN_NPCS.map(n=>{const el=document.createElement('div');el.className='npc-world-label';el.dataset.npc=n.id;el.innerHTML='<span></span><small></small>';el.querySelector('span')!.textContent=n.icon+' '+n.name;el.querySelector('span')!.style.color=n.color;el.querySelector('small')!.textContent=n.role;$('#ui').append(el);return {...n,el};});
const statusLabels=new Map<number,HTMLElement>();
const numbers:any[]=[];let markerTime=0;const marker={x:0,z:0};const encounterLog:any[]=[];
const JELLY_IDS=new Set(['jelly_pink','jelly_mint','jelly_sky','jelly_summon','king_jelly']);
/** Robust loading/error fallback; painted species take over as soon as idle is available. */
const PLACEHOLDER:Record<string,{color:string;height:number}>={mist_shroom:{color:'#b9a7c9',height:1.2},shade_wolf:{color:'#4f5a6e',height:1.1},lantern_wisp:{color:'#f2d58a',height:1},stump_guard:{color:'#7a5c42',height:1.6},mist_warden:{color:'#6f8f86',height:4.8}};
const monsterSpec=(e:any)=>itemData.monsters.monsters.find(m=>m.id===e.dataId);
const enemyLabel=(e:any)=>e.dataId&&!JELLY_IDS.has(e.dataId)?(monsterSpec(e)?.nameTh??'มอนสเตอร์')+(e.boss&&e.bossPhase===2?' (คลั่ง)':''):e.boss?(e.bossPhase===2?'ราชาวุ้นกริ้ว':'ราชาวุ้น'):e.variant==='mint'?'วุ้นเขียว':e.variant==='sky'?'วุ้นฟ้า':'วุ้นจิ๋ว';
let lighterVfx=false;
/** On screen and kept in the chat log under ระบบ or รางวัล. */
function tell(text:string,chat?:'system'|'loot'){notice(text);if(chat)social?.note(chat,text);}
function notice(text:string){if([...$('#notices').children].some(el=>el.textContent===text))return;const el=document.createElement('div');el.className='notice';el.textContent=text;$('#notices').appendChild(el);while($('#notices').children.length>4)$('#notices').firstElementChild?.remove();setTimeout(()=>el.remove(),4000);}
// Floating combat text: anchored where it spawned (screen jitter fixed at birth), pops in, rises on an
// ease-out curve and fades. Numbers on the same spot within a moment stack upward instead of overlapping.
const NUMBER_LIFE:Record<string,number>={crit:1.15,reward:1.7,heal:1.1,hurt:1,evade:.85,'boss-skill':2};
function number(text:string,e:{x:number;z:number},kind='',height=1.8){if(document.hidden)return;while(numbers.length>=40)numbers.shift().el.remove();
 const el=document.createElement('span');el.className=`number ${kind} ${lighterVfx?'other':''}`;el.textContent=text;$('#numbers').appendChild(el);
 const stack=numbers.filter(n=>n.max-n.life<.35&&Math.hypot(n.x-e.x,n.z-e.z)<.6&&n.kind!=='reward').length;
 const life=NUMBER_LIFE[kind]??.95;
 numbers.push({el,kind,x:e.x,z:e.z,height:Math.min(height,1.5),life,max:life,jx:(Math.random()-.5)*(kind==='reward'||kind==='boss-skill'?0:34),stack,drift:kind==='hurt'?(Math.random()<.5?-1:1)*22:(Math.random()-.5)*12});}

function events(){const batch=game.events.splice(0),killed=new Set(batch.filter(e=>e.type==='kill').map(e=>e.id));for(const e of batch){

 lighterVfx=!!e.playerId&&e.playerId!==net.you;combatFeel.event(e,net.you,game.p,performance.now());if(e.playerId===net.you)guide?.event(e);renderer.event(e);
 if(['kingAttack','phase2','summon','stun','kill','victory'].includes(e.type)){encounterLog.push({...e,time:game.time});if(encounterLog.length>128)encounterLog.shift();}
 sound.setListener(game.p);playEventAudio(sound,{...e,fatal:killed.has(e.id),guarded:game.p.statuses?.some(s=>s.id==='guard')},net.you,game.enemies.find(e=>e.boss)||ARENA,id=>game.enemies.find(x=>x.id===id));
 switch(e.type){
 case'miss':number('พลาด',e,'evade',e.defender==='player'?2.4:e.boss?2.5:1.55);break;
 case'hit':if(e.playerId===net.you)qol?.attacked(game.enemies.find(v=>v.id===e.id));number(e.damage,e,e.crit?'crit':'',e.boss?2.5:1.55);break;
 case'kill':break;
 case'hurt':number(`−${e.amount}`,e,'hurt',2.4);break;
 case'evade':number('หลบ',e,'evade',2.4);break;
 case'heal':number(`+${e.amount}`,e,'heal',2.4);break;
 case'item_proc':if(e.playerId===net.you)notice(e.text);break;
 case'autoPotion':if(e.playerId===net.you){skillsUI.flash(e.template);{const b=$(e.kind==='hp'?'[data-action="potion"]':'#mana-potion');b.classList.remove('auto-drank');void b.offsetWidth;b.classList.add('auto-drank');setTimeout(()=>b.classList.remove('auto-drank'),900);}number(e.kind==='hp'?'ยาอัตโนมัติ':'ยาฟ้าอัตโนมัติ',e,'reward',3.1);}break;
 case'cardDrop':if(e.playerId===net.you)cardDrop.show(e.loot);break;
 case'itemPickup':if(e.playerId===net.you)social?.items(inventoryUI.names(e.loot));break;
 case'pickup':if(!e.playerId||e.playerId===net.you)social?.loot(e.xp,e.gold);break;
 case'jobLevel':if(e.playerId===net.you){social?.note('loot',`✦ ระดับอาชีพ ${e.jobLevel} · +${e.granted} แต้มสกิล · K`);levelUp?.jobLevel(e as any);}break;
 case'level':if(e.playerId!==net.you){break;}social?.note('loot',`✦ ระดับ ${e.level} · +${e.granted||3} แต้มสเตตัส · C ดูสเตตัส`);$('#stats-button').classList.add('level-pulse');setTimeout(()=>$('#stats-button').classList.remove('level-pulse'),4500);levelUp?.level(e as any);break;
 case'dash':break;


 case'phase2':tell('✦ บอสคลั่ง — ระวังจังหวะโจมตีที่เร็วขึ้น!','system');break;


 case'boss':tell('✦ ผู้พิทักษ์ตื่นขึ้นแล้ว — ไปที่ซากโบราณทางใต้','system');$('#quest-name').textContent='ผู้พิทักษ์แห่งทุ่งหญ้า';$('#quest-note').textContent='หลบวงสีแดง แล้วโจมตีในช่วงพักของบอส';break;
 case'skillsError':case'statsError':if(!inventoryUI.open)notice(e.text);break;
 case'notice':if(!e.playerId||e.playerId===net.you)tell(e.text,'system');break;
  case'questComplete':if(e.playerId===net.you)quests?.event(e);break;
 case'death':clearInput();deathReveal=1.5;lastXpLost=Number(e.xpLost)||0;break;

 }}}
function toggleAuto(){if(activeMap==='city_plaza'){notice('เขตปลอดภัย ต่อสู้ในเมืองไม่ได้');return;}if(!started||paused||game.p.dead||!net.connected)return;if(!game.p.auto){qol?.cancel();clearInput();}net.send({t:'auto',on:!game.p.auto});}
function stopAuto(){if(game.p.auto)net.send({t:'auto',on:false});}
const nextAction:Partial<Record<Action,number>>={};
let groundSkill:Action|undefined;
function drinkMana(){
 if(!started||paused||game.p.dead||!net.connected||game.p.mp>=game.p.maxMp||game.p.cd.potion>.05||document.querySelector('dialog[open]'))return;
 const item=game.p.inventory&&bestPotion(game.p.inventory,itemData,'sp');
 if(item)doAction(('item:'+item.template) as Action);else notice('ยาฟ้าในกระเป๋าหมดแล้ว');
}
function doAction(name:Action){if(name.startsWith('item:')){if(!started||paused||game.p.dead||!net.connected)return;if(game.p.cd.potion>.05)return;const item=game.p.inventory?.items.find(i=>i.template===name.slice(5)&&i.location==='bag');if(item)net.send({t:'inv',op:'use',req:crypto.randomUUID(),id:item.id});else notice('ไอเทมหมดแล้ว');return;}if(!started||paused||inventoryUI.open||skillsUI.open||statsUI.open||game.p.dead||!net.connected)return;if(activeMap==='city_plaza'&&name!=='potion'){notice('เขตปลอดภัย ใช้สกิลต่อสู้ในเมืองไม่ได้');return;}const id=({attack:'basic',spin:'whirlwind',dash:'dodge'} as Record<string,string>)[name]||name;if(!game.p.skills?.[id]){notice('ยังไม่ได้เรียนสกิลนี้ · เปิด K เพื่อเรียน');return;}if(masteryTarget(id)==='ground'&&groundSkill!==name){clearInput();stopAuto();groundSkill=name;notice('เลือกจุดบนพื้น · กดช่องเดิมซ้ำเพื่อใช้ที่เป้า · Esc ยกเลิก');return;}groundSkill=undefined;const now=performance.now();if(now<(nextAction[name]||0)||game.p.cd[name]>.08)return;nextAction[name]=now+(CD[name]||.12)*1000;
 net.send({t:'act',a:name,...(masteryTarget(id)==='ally'&&social?.allyTarget?{ally:social.allyTarget}:{}),...((['attack','meteor'].includes(name)||['enemy','ground'].includes(masteryTarget(id)))&&game.target?{target:game.target}:{})});worldState.animate(name,now);}
let heldPointer:{id:number;x:number;y:number;startX:number;startY:number;since:number;ground:boolean;dragged:boolean;nearTarget:number|null}|null=null;
const joy={x:0,y:0},stick=$('#joystick');let stickId:number|null=null;function clearInput(){groundSkill=undefined;heldPointer=null;keys.clear();net.send({t:'steer',dx:0,dz:0});joy.x=joy.y=0;$('#joystick i').style.transform='';}
function joyMove(e:PointerEvent){const b=stick.getBoundingClientRect(),x=e.clientX-b.left-b.width/2,y=e.clientY-b.top-b.height/2,l=Math.hypot(x,y),k=Math.min(1,27/(l||1));joy.x=x*k/27;joy.y=y*k/27;$('#joystick i').style.transform=`translate(${x*k}px,${y*k}px)`;}
stick.addEventListener('pointerdown',e=>{qol?.cancel();net.send({t:'auto',on:false});stopAuto();stickId=e.pointerId;stick.setPointerCapture(stickId);joyMove(e);});stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId)joyMove(e);});for(const evt of['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(evt,()=>{stickId=null;joy.x=joy.y=0;$('#joystick i').style.transform='';});
const held=(binding:keyof typeof KEYS)=>KEYS[binding].some(code=>keys.has(code));
function nextTarget(){
 qol?.cancel();
 const living=game.enemies.filter(e=>!e.dead).sort((a,b)=>Math.hypot(a.x-game.p.x,a.z-game.p.z)-Math.hypot(b.x-game.p.x,b.z-game.p.z)||a.id-b.id);
 const index=living.findIndex(e=>e.id===game.target);const target=living.length?living[(index+1)%living.length].id:null;if(target)net.send({t:'target',id:target});game.target=target;game.destination=null;
}
window.addEventListener('keydown',e=>{
 const dialogs=[...document.querySelectorAll<HTMLDialogElement>('dialog[open]')];
 if(e.code==='Escape'){
  if(groundSkill){e.preventDefault();groundSkill=undefined;notice('ยกเลิกการเลือกพื้นที่');return;}
  if(e.repeat){e.preventDefault();return;}
  if(dialogs.length){e.preventDefault();dialogs.at(-1)!.close();clearInput();return;}
  if(e.target instanceof HTMLElement&&(e.target.matches('input,textarea,select')||e.target.isContentEditable))return;
  if(!started||game.p.dead||netOverlay||!$('#overlay').hidden)return;
  e.preventDefault();qol?.cancel();net.send({t:'auto',on:false});clearInput();$('#game-menu').click();return;
 }
 if(e.target instanceof HTMLElement&&(e.target.matches('input,textarea,select')||e.target.isContentEditable))return;
 if(isKey('map',e.code)&&(!dialogs.length||worldMap?.open)&&started&&!netOverlay&&$('#overlay').hidden){e.preventDefault();if(!e.repeat)worldMap?.toggle();return;}
 if(dialogs.length)return;
 if(isKey('inventory',e.code)&&started&&!e.repeat){e.preventDefault();inventoryUI.toggle();return;}
 if(inventoryUI.open)return;
 if(isKey('skills',e.code)&&started&&!e.repeat){e.preventDefault();if(!statsUI.open)skillsUI.toggle();return;}
 if(skillsUI.open)return;
 if(isKey('stats',e.code)&&started&&!e.repeat){e.preventDefault();statsUI.toggle();return;}
 if(statsUI.open)return;
 if(!started||paused||game.p.dead||$<HTMLDialogElement>('#guide').open)return;
 if(isKey('talk',e.code)){
  e.preventDefault();
  if(!e.repeat&&activeMap==='city_plaza'&&!switching){
   const npc=nearbyTownNpc(game.p.x,game.p.z);
   if(npc){mapInteractions();const button=npc.kind==='angel'?$('#angel-talk'):npcTalk;if(!button.hidden)button.click();}
  }
  return;
 }
 if(Object.values(KEYS).some(codes=>(codes as readonly string[]).includes(e.code)))e.preventDefault();
 if(['up','down','left','right'].some(a=>isKey(a as keyof typeof KEYS,e.code))){qol?.cancel();stopAuto();}
 keys.add(e.code);if(e.repeat)return;
 if(qol?.key(e.code))return;
 if(isKey('manaPotion',e.code))drinkMana();else if(isKey('auto',e.code))toggleAuto();else if(isKey('nextTarget',e.code))nextTarget();
 else if(skillsUI.key(e.code))e.preventDefault();else for(const a of ['dash','potion'] as const)if(isKey(a,e.code))doAction(a);
});
window.addEventListener('keyup',e=>keys.delete(e.code));
function loseFocus(){clearInput();}window.addEventListener('blur',loseFocus);document.addEventListener('visibilitychange',()=>{if(document.hidden)loseFocus();});
$('#auto-hunt').addEventListener('click',toggleAuto);
$$('[data-action]').forEach(b=>b.addEventListener('click',()=>doAction(b.dataset.action as Action)));
function pointerRay(x:number,y:number){point=renderer.ground(x,y);}
function pointerGround(){if(game.p.mapId===activeMap&&walkable(point.x,point.z,.4,activeMap)){qol?.walkGround({x:Math.round(point.x*100)/100,z:Math.round(point.z*100)/100});marker.x=point.x;marker.z=point.z;markerTime=.65;}}
renderer.canvas.addEventListener('contextmenu',e=>{e.preventDefault();groundSkill=undefined;});
renderer.canvas.addEventListener('pointerdown',e=>{
 if(!started||paused||switching||npcDialog.open||inventoryUI.open||skillsUI.open||statsUI.open||game.p.dead||e.button!==0)return;
 if(groundSkill){pointerRay(e.clientX,e.clientY);const id=groundSkill;groundSkill=undefined;net.send({t:'act',a:id,point:{x:point.x,z:point.z}});marker.x=point.x;marker.z=point.z;markerTime=.65;return;}
 if(qol?.clickNPC((x,z,y)=>renderer.screen(x,z,y),e.clientX,e.clientY))return;
 qol?.cancel();pointerRay(e.clientX,e.clientY);
 const hit=renderer.pickEnemy(e.clientX,e.clientY);
 const lootHit=game.drops.find(d=>{const p=renderer.screen(d.x,d.z);return Math.hypot(p.x-e.clientX,p.y-e.clientY)<12;});if(lootHit){net.send({t:'inv',op:'pickup',req:crypto.randomUUID(),drop:lootHit.id});return;}
 const current=game.enemies.find(e=>e.id===game.target&&!e.dead&&Math.hypot(e.x-game.p.x,e.z-game.p.z)<(e.boss?2.3:1.8));
 heldPointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,since:performance.now(),ground:hit===null,dragged:false,nearTarget:current?.id??null};
 renderer.canvas.setPointerCapture(e.pointerId);
 if(hit!==null){game.target=hit;game.destination=null;net.send({t:'target',id:game.target});}
 else{pointerGround();events();hud();}
});
let hoveredMonster:number|null=null;
renderer.canvas.addEventListener('pointerleave',()=>{hoveredMonster=null;});
renderer.canvas.addEventListener('pointermove',e=>{
 pointerRay(e.clientX,e.clientY);hoveredMonster=renderer.pickEnemy(e.clientX,e.clientY);
 if(!heldPointer||heldPointer.id!==e.pointerId)return;
 heldPointer.x=e.clientX;heldPointer.y=e.clientY;
 if(Math.hypot(e.clientX-heldPointer.startX,e.clientY-heldPointer.startY)>6)heldPointer.dragged=true;
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])renderer.canvas.addEventListener(name,()=>{heldPointer=null;});
function pointerAttack(now:number){
 const h=heldPointer;if(!h)return false;
 if(!h.ground)return true;
 // A single ground click moves immediately. After the hold threshold, a nearby selected
 // jelly can be attacked; dragging always keeps steering across the ground.
 if(now-h.since<=180&&!h.dragged)return false;
 const target=!h.dragged&&game.enemies.find(e=>e.id===h.nearTarget&&!e.dead&&Math.hypot(e.x-game.p.x,e.z-game.p.z)<(e.boss?2.3:1.8));
 if(target){if(game.target!==target.id||game.destination)net.send({t:'target',id:target.id});game.target=target.id;game.destination=null;return true;}
 pointerRay(h.x,h.y);pointerGround();return false;
}
renderer.canvas.addEventListener('wheel',e=>{e.preventDefault();zoomHeight=Math.max(12,Math.min(27.5,zoomHeight+e.deltaY*.008));resize(false);},{passive:false});
let pinchDistance=0;renderer.canvas.addEventListener('touchstart',e=>{if(e.touches.length===2){clearInput();pinchDistance=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}},{passive:true});renderer.canvas.addEventListener('touchmove',e=>{if(e.touches.length!==2)return;e.preventDefault();const distance=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);if(pinchDistance)zoomHeight=Math.max(12,Math.min(27.5,zoomHeight*pinchDistance/Math.max(1,distance)));pinchDistance=distance;resize(false);},{passive:false});renderer.canvas.addEventListener('touchend',()=>{pinchDistance=0;});
$('#play').addEventListener('click',()=>{started=true;paused=false;if(sceneReady)net.ready();$('#overlay').hidden=true;sound.start();});
$('#audio').addEventListener('click',()=>audioUI.toggleMute());
function applyQuality(automatic=qualityPreference==="auto"){try{localStorage.setItem('tn-quality',qualityPreference);}catch{}renderer.highQuality=quality;$('#quality').textContent=automatic?'ภาพ: อัตโนมัติ':quality?'ภาพ: สูง':'ภาพ: ต่ำ';resize();}
$('#quality').addEventListener('click',()=>{qualityPreference=qualityPreference==="high"?"low":qualityPreference==="low"?"auto":"high";quality=qualityPreference!=="low";autoQuality.automatic=false;autoQuality.reset();applyQuality();});
$('#quest-button').addEventListener('click',()=>$('#journal-toggle').click());
$('#help').addEventListener('click',()=>{clearInput();paused=true;$<HTMLDialogElement>('#guide').showModal();});$('#guide .close').addEventListener('click',()=>$<HTMLDialogElement>('#guide').close());$('#guide .done').addEventListener('click',()=>$<HTMLDialogElement>('#guide').close());$('#guide').addEventListener('close',()=>{if(started&&$('#overlay').hidden)paused=false;});
function overlay(html:string){clearInput();paused=true;$('#overlay').className='overlay center';$('#overlay').innerHTML=`<section class="welcome">${html}</section>`;$('#overlay').hidden=false;}
let lastXpLost=0;
function showDeath(){if(netOverlay)return;overlay('<p class="caption">เริ่มต้นใหม่</p><h1>พักสักหน่อย<br>แล้วเริ่มใหม่</h1><p>'+(lastXpLost>0?`เสียประสบการณ์ ${lastXpLost.toLocaleString('th-TH')} (1% ของระดับนี้) · ทองและไอเทมยังอยู่ครบ`:'ประสบการณ์และเงินที่เก็บได้ยังอยู่')+'</p><p id="revive-countdown"></p><button id="revive" class="primary">กลับเมือง →</button>');$('#revive').textContent=activeMap==='confluence'?'ฟื้นที่จุดพักในเรด →':'กลับเมือง →';$('#revive').onclick=()=>{if(!net.connected){notice('ยังไม่ได้เชื่อมต่อ');return;}if((game.p.reviveRemaining??0)>0)return;net.send({t:'revive'});};}

const map=$<HTMLCanvasElement>('#map'),mx=map.getContext('2d')!;
// Round, player-centred minimap. Terrain and markers are drawn in the 160×132 map space; hud-qol draws its
// markers right after this on the same transform and inverts it (map.view) for clicks.
// Zoom is set in screen pixels per world metre so the circle shows ~60 m around the player on every map size.
const MAP_SIZE=168,MAP_PX_PER_METRE=2.8;
function minimap(){const m=mapScale(activeMap),cx=m.x(game.p.x),cy=m.z(game.p.z),zoom=MAP_PX_PER_METRE/m.k,view={k:zoom,ox:MAP_SIZE/2-zoom*cx,oy:MAP_SIZE/2-zoom*cy};(map as any).view=view;
 mx.setTransform(1,0,0,1,0,0);mx.clearRect(0,0,MAP_SIZE,MAP_SIZE);
 paintMinimapLayer(mx,MAP_SIZE,view,drawMinimap,'#10231f');
 $('#map-coords').textContent=`${Math.round(game.p.x)}, ${Math.round(game.p.z)}`;}
/** Minimap: the terrain is drawn once per map from the shared layout; only markers redraw each frame. */
const minimapBase=new Map<MapId,HTMLCanvasElement>();
const mapScale=(id:MapId)=>{const l=LAYOUTS[id];return{x:(x:number)=>(x+l.halfX)/(l.halfX*2)*160,z:(z:number)=>(z+l.halfZ)/(l.halfZ*2)*132,k:160/(l.halfX*2)};};
function minimapTerrain(id:MapId){
 let c=minimapBase.get(id);if(c)return c;c=document.createElement('canvas');c.width=160;c.height=132;const g=c.getContext('2d')!,m=mapScale(id),l=LAYOUTS[id];
 if(id==='city_plaza'&&!CITY.empty){
  g.fillStyle='#283a36';g.fillRect(0,0,160,132);g.lineCap='round';g.strokeStyle='#b7a17c';g.lineWidth=5*m.k*1.6;g.beginPath();g.moveTo(80,2);g.lineTo(80,130);g.moveTo(2,66);g.lineTo(158,66);g.stroke();
  g.strokeStyle='#887f66';g.lineWidth=2*m.k;g.strokeRect(m.x(-36),m.z(-36),72*m.k,72*132/96);
  for(const b of [...CITY_BUILDINGS,...CITY_HOUSES,...NEW_BUILDINGS]){g.fillStyle='rgba(255,255,255,.14)';g.fillRect(m.x(b.x-b.w/2),m.z(b.z-b.d/2),b.w*m.k,b.d*132/96);}
  g.fillStyle='#e3dcc3';g.beginPath();g.arc(80,66,4,0,6.28);g.fill();g.fillStyle='#8bc3d0';g.beginPath();g.arc(m.x(CITY_FOUNTAIN.x),m.z(CITY_FOUNTAIN.z),3.5,0,6.28);g.fill();
 }else{
  const forest=id==='forest'||id==='grove';g.fillStyle=isBiomeMap(id)?BIOME_SCENES[id].ground.slice(0,7):id==='temple'?'#80765e':id==='grove'?'#70532e':id==='summit'?'#3d526f':id==='forest'?'#263e33':id==='ruins'?'#3e4540':id==='canyon'?'#5b4934':'#405739';g.fillRect(0,0,160,132);g.lineCap='round';g.lineJoin='round';g.strokeStyle=forest?'#a99f7c':'#d2c397';
  for(const [i,h]of FIELD_HABITATS[id].entries()){g.fillStyle=id==='meadow'?(h.variant==='pink'?'#df99ad33':h.variant==='mint'?'#80d7af33':'#9bcae833'):['#b0cf8b33','#c4ad8033','#93bfdb33','#c3a5d333'][i];g.beginPath();g.ellipse(m.x(h.x),m.z(h.z),h.rx*m.k,h.rz*132/(l.halfZ*2),0,0,6.28);g.fill();}
  for(const p of l.paths){g.lineWidth=Math.max(2,p.width*m.k*1.4);g.beginPath();p.points.forEach(([x,z],i)=>i?g.lineTo(m.x(x),m.z(z)):g.moveTo(m.x(x),m.z(z)));g.stroke();}
  for(const w of l.water){g.fillStyle=isBiomeMap(id)?BIOME_SCENES[id].water.slice(0,7):forest?'#7fa3a8':'#7fa9a1';g.beginPath();g.ellipse(m.x(w.x),m.z(w.z),w.rx*m.k,w.rz*132/(l.halfZ*2),0,0,6.28);g.fill();if(w.bridgeZ!==undefined){g.fillStyle='#bba16c';g.fillRect(m.x(w.x-w.rx-.5),m.z(w.bridgeZ)-1.5,(w.rx*2+1)*m.k,3);}}
  for(const o of l.obstacles){g.fillStyle=isBiomeMap(id)?BIOME_SCENES[id].accent:o.kind==='boulder'?'#8c8f7e':forest?'#2f4b3d':'#4f7654';g.beginPath();g.arc(m.x(o.x),m.z(o.z),Math.max(1.6,o.r*m.k*1.3),0,6.28);g.fill();}
  if(id==='meadow'){
   g.fillStyle='#9a9c80';for(const b of MEADOW_LANDMARKS.boxes)g.fillRect(m.x(b.x-b.w/2),m.z(b.z-b.d/2),b.w*m.k,b.d*132/(l.halfZ*2));
   for(const p of MEADOW_LANDMARKS.circles){g.beginPath();g.arc(m.x(p.x),m.z(p.z),Math.max(1.6,p.r*m.k),0,6.28);g.fill();}
  }
  if(l.arena){g.strokeStyle='#e5dcb2';g.lineWidth=2;g.beginPath();g.arc(m.x(l.arena.x),m.z(l.arena.z),l.arena.r*m.k+1,0,6.28);g.stroke();}
  for(const cp of l.camps){g.fillStyle='#e5dcb2';g.fillRect(m.x(cp.x)-2.5,m.z(cp.z)-2.5,5,5);}
 }
 minimapBase.set(id,c);return c;
}
function drawMinimap(){
 const m=mapScale(activeMap);mx.drawImage(minimapTerrain(activeMap),0,0);
 const k=((map as any).view?.k)||1,dot=(x:number,z:number,r:number,color:string,stroke?:string)=>{mx.fillStyle=color;mx.beginPath();mx.arc(m.x(x),m.z(z),r*1.3/k,0,6.28);mx.fill();if(stroke){mx.strokeStyle=stroke;mx.lineWidth=1.5/k;mx.stroke();}};
 for(const e of game.enemies){if(e.dead)continue;dot(e.x,e.z,e.boss?3.5:1.5,e.boss?'#ffdb87':activeMap==='forest'?'#e7c3a0':e.variant==='mint'?'#80d7af':e.variant==='sky'?'#9bcae8':'#f4b3c5');}
 for(const o of worldState.others)dot(o.x,o.z,2,'#9fd3ff');
 dot(game.p.x,game.p.z,3,'#fff7d5','#314d39');
}
const clock=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
/** Field maps: the boss runs on a 30-minute map timer (server sends seconds left in bossIn). */
function fieldQuest(boss:any){
 if(!isField(activeMap))return;
 if(LAYOUTS[activeMap].exploration){$('#quest-name').textContent=MAP_INFO[activeMap].name;$('#quest-line').textContent='สำรวจจุดสำคัญ ค่ายพัก และเส้นทางเชื่อมภูมิภาค';$('#quest-note').textContent=`พื้นที่ตามแผน Lv.${MAP_INFO[activeMap].levels} · มอน การ์ด และ Unique ยังไม่เปิด`;$('#quest-progress').style.width='0';return;}
 const id=boss?.dataId??(activeMap==='forest'&&Math.hypot(game.p.x-THORN_NEST.x,game.p.z-THORN_NEST.z)<12?'thorn_nest_mother':FIELD_BOSS[activeMap]!.dataId),name=itemData.monsters.monsters.find(m=>m.id===id)!.nameTh,left=(game as any).bossTimers?.[id]??(game as any).bossIn??0;
 $('#quest-name').textContent=MAP_INFO[activeMap].name;
 if(left>0){$('#quest-line').innerHTML=`${name}จะกลับมาใน <b>${clock(left)}</b>`;$('#quest-progress').style.width=`${(1-left/1800)*100}%`;}
 else if(boss&&!boss.dead){$('#quest-line').innerHTML=`ปราบ${name} <b>${Math.round(boss.hp/boss.maxHp*100)}%</b>`;$('#quest-progress').style.width=`${(1-boss.hp/boss.maxHp)*100}%`;}
 else{$('#quest-line').innerHTML=`${name}ปรากฏตัวแล้วที่ลานบอสส่วนลึก`;$('#quest-progress').style.width='0';}
 $('#quest-note').textContent=MAP_INFO[activeMap].hint+' · บอสเกิดทุก 30 นาที';
}
function hud(){if(game.p.dead&&deathReveal<=0&&$('#overlay').hidden)showDeath();const revive=$<HTMLButtonElement>('#revive');if(revive){revive.disabled=!net.connected||(game.p.reviveRemaining??0)>0;const count=$('#revive-countdown');if(count)count.textContent=`ฟื้นที่${activeMap==='confluence'?'จุดพักในเรด':'หอนาฬิกา'}ใน ${Math.ceil(game.p.reviveRemaining??0)}…`;if(!game.p.dead&&!netOverlay){paused=false;$('#overlay').hidden=true;}}const count=$('#net-countdown');if(count)count.textContent=`ลองเชื่อมต่อใหม่ใน ${Math.max(0,Math.ceil((net.nextRetryAt-Date.now())/1000))} วินาที`;mapInteractions();const p=game.p;inventoryUI.update(p);skillsUI.update(p);angelUI?.update();autoUI.update();const auto=$('#auto-hunt');auto.classList.toggle('auto-active',p.auto);auto.setAttribute('aria-pressed',String(p.auto));$('#auto-label').textContent=p.auto?'ออโต้ เปิด':'ออโต้';const status=$('#auto-status');status.hidden=!p.auto;status.textContent='ออโต้: '+(p.autoState==='retreat'?'กลับแคมป์':p.autoState==='fight'?'กำลังสู้':p.autoState==='idle'?'รอมอนสเตอร์เกิด':'กำลังหาเป้าหมาย');$('#level').textContent=String(p.level);$('#hp').style.width=`${p.hp/p.maxHp*100}%`;$('#hp-text').textContent=`${Math.ceil(p.hp)} / ${Math.ceil(p.maxHp)}`;$('#mp').style.width=`${p.mp/p.maxMp*100}%`;$('#mp-text').textContent=`${Math.floor(p.mp)} / ${Math.floor(p.maxMp)}`;$('#xp').style.width=`${p.level>=itemData.stats.maxLevel?100:p.xp/p.nextXp*100}%`;$('#gold').textContent=String(p.gold);$('#gold').title=`ทองทั้งหมด ${p.gold} · ทองแจก ${p.boundGold??0} · เทรดได้ ${p.gold-(p.boundGold??0)}`;$('#kills').textContent=`ปราบแล้ว ${game.kills}`;$('#potions').textContent=String(p.potions);
 const boss=game.enemies.find(e=>e.boss&&(!e.dead||e.deathAge<3.8)&&Math.hypot(e.x-game.p.x,e.z-game.p.z)<28);$('#boss-hud').hidden=!boss;document.body.classList.toggle('boss-active',!!boss);if(boss){$('#boss-hp').style.width=`${boss.hp/boss.maxHp*100}%`;$('#boss-hud h3').textContent=enemyLabel(boss);$('#boss-hud small').textContent=boss.dead?'ปราบแล้ว':`ระยะ ${boss.bossPhase}`;}
 sound.updateMusic({mapId:activeMap,dead:game.p.dead,bossAlive:!!boss&&!boss.dead,bossTargeted:!!boss&&game.target===boss.id,bossBarActive:!!boss&&!$('#boss-hud').hidden,bossAggro:!!boss?.engaged});
 if(activeMap==='city_plaza'){$('#quest-name').textContent='นครที่ถูกลืมเลือน';$('#quest-line').textContent='ใต้: ทุ่ง Lv.1–5 · ออก: ป่า Lv.5–10 · เหนือ: ซากนคร Lv.10–15 · ตก: หุบเขา Lv.15–20';$('#quest-progress').style.width='0';$('#quest-note').textContent=CITY.empty?'พื้นที่เมืองว่าง · ไม่มี NPC หรือสิ่งปลูกสร้าง':'รับเควสต์จากหัวหน้าทหาร · เปิดคู่มือได้จากเมนู';}else if(isField(activeMap)){fieldQuest(boss);}
 const target=game.enemies.find(e=>e.id===game.target&&!e.dead);$('#target').hidden=!target||target.boss;if(target){$('#target-name').textContent=enemyLabel(target);$('#target-lv').textContent=`ระดับ ${monsterSpec(target)?.level??1}`;$('#target-hp').style.width=`${target.hp/target.maxHp*100}%`;}
 for(const b of $$('[data-action]')){if(b.matches('[data-potion]'))continue;const a=b.dataset.action as Action,cd=p.cd[a];b.style.setProperty('--cooldown-angle',`${Math.min(1,cd/CD[a])*360}deg`);let n=b.querySelector<HTMLElement>('.cooldown');if(cd>.15){if(!n){n=document.createElement('span');n.className='cooldown';b.appendChild(n);}n.textContent=cd>=1?String(Math.ceil(cd)):cd.toFixed(1);}else n?.remove();const unavailable=(a==='spin'&&p.mp<20)||(a==='meteor'&&p.mp<30)||(a==='potion'&&p.potions===0);b.classList.toggle('empty',unavailable);b.classList.toggle('ready',!unavailable&&cd<=.15);b.setAttribute('aria-disabled',String(unavailable||cd>0));}minimap();qol?.update(game,worldState.authoritativePosition);combatBar.update(p);guide?.update();}
function render(dt:number){sound.setListener(game.p);renderer.overview=overviewOn&&activeMap==='city_plaza';renderer.zoomHeight=zoomHeight;renderer.render(game,worldState.others,dt,time);
 if(deathReveal>0){deathReveal=Math.max(0,deathReveal-dt);if(!deathReveal&&game.p.dead)showDeath();}
 for(const n of npcLabels){const q=renderer.npcHead(n.x,n.z,n.art);n.el.hidden=activeMap!=='city_plaza'||q.x<-150||q.x>innerWidth+150||q.y<0||q.y>innerHeight;n.el.style.left=q.x+'px';n.el.style.top=(q.y-8)+'px';}
 for(let i=numbers.length-1;i>=0;i--){const n=numbers[i];n.life-=dt;if(n.life<=0){n.el.remove();numbers.splice(i,1);continue;}const t=1-n.life/n.max,q=renderer.screen(n.x,n.z,n.height);n.el.style.left=(q.x+n.jx+n.drift*t)+'px';n.el.style.top=(q.y-45*t-n.stack*16)+'px';n.el.style.opacity=String(Math.min(1,n.life/.25));}
}
function resize(_updateRenderer=true){renderer.zoomHeight=zoomHeight;renderer.resize();}window.addEventListener('resize',()=>resize());
let hudTime=0,frameCount=0,fpsTime=0;
function frame(now:number){requestAnimationFrame(frame);const wallDt=Math.max(0,(now-previous)/1000),dt=Math.min(wallDt,.05);previous=now;time+=dt;
 let input={x:0,z:0};if(started&&!paused&&!document.querySelector('dialog[open]')&&!statsUI.open&&!skillsUI.open&&!npcDialog.open&&!switching&&!game.p.dead&&net.connected){let x=Number(held('right'))-Number(held('left'))+joy.x,y=Number(held('up'))-Number(held('down'))-joy.y;const len=Math.hypot(x,y);if(len>1){x/=len;y/=len;}input={x:right.x*x+up.x*y,z:right.z*x+up.z*y};net.send({t:'steer',dx:Math.round(input.x*1000)/1000,dz:Math.round(input.z*1000)/1000});if(held('attack')||pointerAttack(now))doAction('attack');}
 worldState.update(now,Math.min(wallDt,.1),input,net.seq);if(window.tnBoot.progress===100)sound.afterPlayable();events();
 if(qualityPreference==='auto'&&quality&&autoQuality.update(wallDt,started&&sceneReady&&worldState.ready&&!switching&&!document.hidden)){quality=false;applyQuality(true);}
 if(!document.hidden)render(dt);if(sceneReady&&worldState.ready&&!assetFailure)window.tnBoot.stage(4);hudTime+=dt;if(hudTime>.1){hud();hudTime=0;}frameCount++;fpsTime+=wallDt;if(fpsTime>=1){$('#fps').textContent=Math.round(frameCount/fpsTime)+' FPS · '+Math.round(net.ping)+' ms';fpsTime=frameCount=0;}}
const overview=document.createElement('button');overview.id='city-overview';overview.textContent='ผังเมือง';$('#ui').append(overview);
overview.onclick=()=>{overviewOn=!overviewOn;overview.setAttribute('aria-pressed',String(overviewOn));resize();};
applyQuality();hud();requestAnimationFrame(frame);
// Read-only diagnostics; no test-only mutation or gameplay shortcuts are exposed.

trade=mountTrade({send:m=>net.send(m),player:()=>game.p,notice});
social=mountSocial({send:m=>net.send(m),you:()=>net.you,enabled:()=>started,onOpen:()=>clearInput(),announce:notice,trade:name=>trade?.request(name)});
levelUp=mountLevelUp({stats:()=>({maxHp:game.p.maxHp,maxMp:game.p.maxMp}),hero:()=>{if(!started||paused||document.hidden)return null;const feet=renderer.screen(game.p.x,game.p.z),head=renderer.screen(game.p.x,game.p.z,2.1);return feet.x>=-50&&feet.x<=innerWidth+50&&feet.y>=-50&&feet.y<=innerHeight+50?{feet,head}:null;}});
quests=mountQuests({send:m=>net.send(m),player:()=>game.p,map:()=>activeMap,navigate:p=>{if(!started||paused||game.p.dead||!net.connected)return;qol?.goToMap(p);},notice:tell});
qol=mountHUDQOL({send:m=>net.send(m),map:()=>activeMap,player:()=>game.p,notice,stop:()=>{clearInput();stopAuto();},release:()=>clearInput(),arrived:name=>notice(`✦ ถึง${name}แล้ว`),settings:()=>settingsUI?.open(),party:()=>social?.openParty(),talk:kind=>{if(kind==='angel'){$('#angel-talk').click();return;}if(nearNpc&&nearNpc.kind===kind){npcTalk.click();return;}if(['market','forge','storage'].includes(kind))inventoryUI.shop(kind);}});settingsUI=mountSettingsWindow({onOpen:()=>clearInput(),keysChanged:()=>skillsUI.drawKeys()});launcher.adopt($('#qol-controls'));mountMenuAccount(selected.account);
worldMap=mountWorldMap({map:()=>activeMap,level:()=>game.p.level,points:()=>qol!.points(),goTo:p=>qol!.goTo(p),travelTo:m=>qol!.travelTo(m),goal:()=>qol?.goal??null,notice,onOpen:()=>clearInput(),toggleMinimap:()=>qol?.toggleMap()});
mailbox=mountMailbox({send:m=>net.send(m),onOpen:()=>clearInput(),you:()=>net.you});
titles=mountTitles({send:m=>net.send(m),onOpen:()=>clearInput(),notice,you:()=>net.you,profile:()=>({name:selected.character.name,level:game.p.level??1,kills:(game.p as any).kills??0})});

guide=mountTutorialGuide({characterId:selected.character.id,level:selected.character.level,notice,started:()=>started&&!paused,map:()=>activeMap,game:()=>game,autoPotionOn:()=>autoPotionUI.settings.hp.on||autoPotionUI.settings.mp.on,quests:()=>quests?.state,project:(x,z,y)=>renderer.screen(x,z,y),onOpen:()=>{qol?.cancel();clearInput();net.send({t:'auto',on:false});},navigate:p=>{if(started&&!paused&&!game.p.dead&&net.connected)qol?.goTo(p);}});
angelUI=mountAngel({player:()=>game.p,map:()=>activeMap,guide:()=>guide!.current(),quests:()=>quests?.state,onOpen:()=>{qol?.cancel();clearInput();net.send({t:'auto',on:false});sound.play('ui_open');},resumeGuide:()=>guide?.resume(),openGuide:()=>guide?.open(),openMap:()=>worldMap?.toggle(),navigate:p=>{if(started&&!paused&&!game.p.dead&&net.connected)qol?.goToMap(p);}});
if(pendingUI)qol.receive(pendingUI);
(window as any).__FIELDS__={snapshot:()=>({renderer:'Canvas2D',mapId:activeMap,transitioning:switching,network:{connected:net.connected,tick:worldState.lastTick,you:net.you},started,paused,p:{...game.p},enemies:game.enemies.map(e=>({...e})),target:game.target,kills:game.kills,others:worldState.others,environment:renderer.snapshot()}),project:(x:number,z:number,y=0)=>renderer.screen(x,z,y),
 // Dev only: replay a skill event at the local player to preview its VFX without the server.
 ...(import.meta.env.DEV?{vfx:(e:any)=>renderer.event({x:game.p.x,z:game.p.z,dx:game.p.fx,dz:game.p.fz,playerId:net.you,...e})}:{})};
