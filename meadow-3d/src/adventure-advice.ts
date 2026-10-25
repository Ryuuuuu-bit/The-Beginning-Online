import {emptyQuests, objectiveProgress, questStatus, type GameData, type Inventory, type QuestState} from '@the-beginning-online/shared';
import {FIELD_HABITATS, LAYOUTS, MAP_INFO, gateRoute, type MapId} from '@the-beginning-online/shared/maps';
import {questDestination, type QuestDestination} from './quest-navigation.ts';
import {TOWN_NPCS} from './city-2d-locations.ts';

export interface GuideLesson {ready:boolean;step:number;total:number;title:string;text:string;canNavigate:boolean}
export interface AdventureAdvice {kind:'loading'|'heal'|'guide'|'quest'|'hunt';title:string;text:string;action:string;destination?:QuestDestination}
export interface AdventureContext {map:MapId;player:{level:number;x:number;z:number;hp:number;maxHp:number;inventory?:Inventory};guide:GuideLesson;quests?:QuestState}

/** Advice only: real quest eligibility, rewards and movement stay in their existing systems. */
export function adventureAdvice(c:AdventureContext,data:GameData,now:number):AdventureAdvice {
 const p=c.player;
 if(!c.guide.ready)return {kind:'loading',title:'กำลังอ่านบันทึกการเดินทาง',text:'รอสักครู่ ข้ากำลังดู Guide ที่บันทึกไว้กับตัวละครของเจ้า',action:'กำลังโหลด…'};
 if(p.maxHp>0&&p.hp/p.maxHp<.4){
  const healer=TOWN_NPCS.find(n=>n.kind==='heal')!;
  return {kind:'heal',title:'ฟื้นพลังให้พร้อมก่อนออกเดินทาง',text:'พลังชีวิตเหลือน้อย แวะหารินข้างสวนเพื่อฟื้น HP / MP ก่อน แล้วค่อยกลับไปทำเป้าหมายต่อ',action:'นำทางไปหาผู้รักษา',destination:{...healer,map:'city_plaza'}};
 }
 const state=c.quests??emptyQuests(),quests=data.quests.quests.map(q=>({q,status:questStatus(q,state,p.level,now,p.inventory)}));
 const ready=quests.find(q=>q.status==='ready');
 if(ready){const destination=questDestination(data,ready.q,objectiveProgress(ready.q,state,p.inventory),c.map,p);if(destination)return {kind:'quest',title:`ส่งเควสต์ · ${ready.q.nameTh}`,text:'เจ้าทำเงื่อนไขครบแล้ว ไปคุยกับผู้มอบเควสต์เพื่อรับรางวัลได้เลย',action:'นำทางไปส่งเควสต์',destination};}
 // Older, high-level characters with an untouched handbook get current-level goals, not first-movement lessons.
 if(c.guide.step<c.guide.total&&(c.guide.step>0||p.level<=5))return {kind:'guide',title:c.guide.title,text:c.guide.text,action:c.guide.canNavigate?'นำทางและเล่น Guide ต่อ':'เล่น Guide ขั้นนี้ต่อ'};
 const quest=quests.filter(({q,status})=>status==='active'||status==='available'&&q.level>=p.level-5).sort((a,b)=>Number(b.status==='active')-Number(a.status==='active')||Number(!!a.q.repeatPeriod)-Number(!!b.q.repeatPeriod)||b.q.level-a.q.level).find(({q,status})=>status==='active'||q.level<=p.level);
 if(quest){
  const progress=quest.status==='active'?objectiveProgress(quest.q,state,p.inventory):quest.q.objectives.map(o=>o.count);
  const destination=questDestination(data,quest.q,progress,c.map,p);
  if(destination)return {kind:'quest',title:`${quest.status==='active'?'ทำเควสต์ต่อ':'รับเควสต์'} · ${quest.q.nameTh}`,text:quest.status==='active'?quest.q.objectives.map((o,i)=>`${o.label} ${progress[i]}/${o.count}`).join(' · '):quest.q.offer,action:quest.status==='active'?'นำทางไปเป้าหมาย':'นำทางไปรับเควสต์',destination};
 }
 const hunts=Object.entries(FIELD_HABITATS).flatMap(([id,zones])=>{
  const map=id as MapId,route=gateRoute(c.map,map,p.level);
  if(LAYOUTS[map].exploration||map!==c.map&&!route.length)return [];
  return zones.flatMap(zone=>{const monster=data.monsters.monsters.find(m=>m.id===zone.dataId),spawn=LAYOUTS[map].spawns.find(s=>s.dataId===zone.dataId);
   return monster&&!monster.boss&&monster.level<=p.level&&spawn?[{map,monster,spawn,cost:(p.level-monster.level)*10000+route.length*100}]:[];});
 }).sort((a,b)=>a.cost-b.cost);
 const hunt=hunts[0];
 if(hunt)return {kind:'hunt',title:`ออกล่า · ${hunt.monster.nameTh}`,text:`${MAP_INFO[hunt.map].name} · มอนสเตอร์ Lv.${hunt.monster.level} เหมาะกับการเก็บประสบการณ์ช่วงนี้ เตรียมยาและเลือกสกิลให้เข้ากับอาวุธก่อนออกเดินทาง`,action:'นำทางไปพื้นที่ล่า',destination:{...hunt.spawn,map:hunt.map,kind:'hunt',name:hunt.monster.nameTh}};
 return {kind:'guide',title:'ทบทวนเส้นทางของเจ้า',text:'เปิดคู่มือนักผจญภัยเพื่อดูระบบที่อยากเรียนรู้ หรือเปิดแผนที่โลกเลือกจุดหมายต่อไป',action:'เปิดคู่มือนักผจญภัย'};
}
