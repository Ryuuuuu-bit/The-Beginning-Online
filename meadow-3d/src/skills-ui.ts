import {consumableBuffText,resolveSkill,loadGameData,isMasteryAction,isMasteryPassive,MASTERY_SCHOOLS,masterySkillLock,masteryAutoRank,masteryTriggerSlots,resolveAutomaticSkill,automaticCause} from '@the-beginning-online/shared';
import constellation from "./mastery-layout.json";
import {masteryAncestors,masteryCurve} from "./mastery-paths";
import {masteryCamera} from "./mastery-camera";
import paintedIcons from "../art/mastery-icons/manifest.json";
import skillsData from "../../shared/data/skills.json";
import jobsData from "../../shared/data/jobs.json";
import type { HotbarSlot, JobProgress } from "@the-beginning-online/shared";
import "./skills.css";
import "./skill-art.css";
import "./mastery-panel.css";
import "./skill-tree.css";
import { itemIconCell } from "./item-icon";
import { BINDABLE_KEY } from "@the-beginning-online/shared";
import { takenByActions } from "./keys";
const gameData=loadGameData();
const schoolNames:Record<string,string>={Swordsman:"ดาบ",Archer:"ธนู",Mage:"เวท",Healer:"เยียวยา",Summoner:"อัญเชิญ",Assassin:"ลอบเร้น",Boxer:"หมัด"};
const schoolColors=["#cdac79","#a4ba7d","#96b8d8","#d2c291","#a5c3b1","#c4a1b6","#cd9f88"];
const schoolGlyphs:Record<string,string>={Swordsman:"⚔",Archer:"➶",Mage:"✦",Healer:"✚",Summoner:"❖",Assassin:"◆",Boxer:"✊"};
const branchNames:Record<string,string>={core:"แกนหลัก",guardian:"ผู้พิทักษ์",berserker:"คลั่งศึก",marksman:"แม่นธนู",ranger:"พราน",wizard:"จอมเวท",sage:"ปราชญ์",physician:"แพทย์",alchemist:"นักปรุงยา",spirit_master:"เจ้าวิญญาณ",exorcist:"ผู้ขับไล่",assassin:"นักฆ่า",shadow:"เงา",champion:"แชมเปี้ยน",monk:"นักพรต"};
const weaponNames:Record<string,string>={any:"ทุกอาวุธ",sword:"ดาบ",bow:"ธนู",dagger:"มีด",unarmed:"มือเปล่า",staff:"คทา"};
const legacySkills = skillsData.skills as any[];
const skills:any[]=gameData.mastery.skills.map(plan=>{
 const live=(isMasteryAction(plan.id)||isMasteryPassive(plan.id))?resolveSkill(gameData,plan.id):legacySkills.find(s=>s.id===plan.id);
 return {...(live??{id:plan.id,nameTh:plan.nameTh,passive:plan.passive,maxLevel:plan.maxRank,requires:plan.requires.map(r=>({id:r.id,level:r.rank})),icon:0,sp:plan.ranks[0].mp,range:plan.range,percent:0}),school:plan.school,plan,legacyRuntime:!!live&&!isMasteryAction(plan.id)&&!isMasteryPassive(plan.id)};
}).concat(legacySkills.filter(s=>!gameData.mastery.skills.some(p=>p.id===s.id)));
const itemTemplates=loadGameData().items.items;
const slotSpec=(id:string|null)=>id?.startsWith('item:')?itemTemplates.find(t=>t.id===id.slice(5)):id&&isMasteryAction(id)?resolveSkill(loadGameData(),id):skills.find(s=>s.id===id);
/** Consumables that can sit on the bar (HP, MP and speed potions). */
const barItems=itemTemplates.filter(t=>t.type==='consumable'&&t.effect);
const POTION_CD=skills.find(s=>s.id==='potion')?.cooldown||1;
const ELEMENT_TH=gameData.elements.names as Record<string,string>;
const BASIC=skills.find(s=>s.id==='basic');
const itemIconHTML=(template:string,extra='')=>{const c=itemIconCell(template);return `<span class="item-icon${c.v2?' item-icon-v2':''} ${extra}" style="background-position:${c.position};${c.image?`background-image:url('${c.image}');background-size:contain`:''}" aria-hidden="true"></span>`;};
/** How many of this template the bag holds (equipped or stored copies do not count). */
export function bagCount(inventory:{items:{template:string;qty:number;location:string}[]}|undefined,template:string){return (inventory?.items||[]).filter(i=>i.template===template&&i.location==='bag').reduce((n,i)=>n+i.qty,0);}
const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
	document.querySelector<T>(s)!;
export const keyLabel = (key: string) =>
	key.replace("Digit", "").replace("Key", "");
export function mountSkills(
	send: (message: any) => void,
	clear: () => void,
	act: (id: string) => void,
	play: (id: string) => void = () => {},
) {
	let confirmedJob: string | undefined;
	let lastSchool: string = "Swordsman", mixFilter = "all", mixId: string | null = null;
	let job: JobProgress | null = null,
		pending: Record<string, number> = {},
		selected: string | null = null,
		detailId: string | null = null,
		viewJob: string | null = null,
		last = "",
		more = false,
		inventory: any,
		derived: { atk: number; matk: number; weaponElement?: string } | null = null;
	const panel = $<HTMLDialogElement>("#skills-window"),
		angel = $<HTMLDialogElement>("#angel-window");
	const bar = $("#job-hotbar");
    const camera=masteryCamera(constellation.size);
    let mapTarget:string|null="all";
    let mapWidth=0,mapHeight=0;
    function paintCamera(){
     const viewport=panel.querySelector<HTMLElement>(".mastery-viewport"),world=panel.querySelector<HTMLElement>(".mastery-world");
     if(!viewport||!world)return;
     const c=camera.state;
     world.style.transform=`translate(${c.x}px,${c.y}px) scale(${c.scale})`;
     viewport.classList.toggle("overview",c.scale<.53);
     world.style.setProperty("--node-label-scale",String(Math.max(1,.9/c.scale)));
     world.style.setProperty("--label-scale",String(Math.max(1,.18/c.scale)));
     const zoom=panel.querySelector(".mastery-zoom");if(zoom)zoom.textContent=`${Math.round(c.scale*100)}%`;
    }
    function positionMap(){
     const viewport=panel.querySelector<HTMLElement>(".mastery-viewport");
     if(!viewport||!panel.open)return;
     const w=viewport.clientWidth,h=viewport.clientHeight;
     if(w!==mapWidth||h!==mapHeight){
      if(!mapTarget)mapTarget=viewJob==="all"?"all":detailId;
      mapWidth=w;mapHeight=h;
     }
     if(mapTarget==="all")camera.fit(w,h);
     else if(mapTarget){
      const point=(constellation.nodes as Record<string,{x:number;y:number}>)[mapTarget],hub=constellation.hubs.find(s=>s.name===mapTarget);
      if(point){
       const ancestors=masteryAncestors(gameData.mastery.skills,mapTarget),ids=new Set([mapTarget,...ancestors,...gameData.mastery.skills.filter(s=>s.requires.some(r=>r.id===mapTarget)).map(s=>s.id)]);
       const points=[...ids].map(id=>(constellation.nodes as Record<string,{x:number;y:number}>)[id]),xs=points.map(p=>p.x),ys=points.map(p=>p.y);
       const left=Math.min(...xs)-100,right=Math.max(...xs)+100,top=Math.min(...ys)-100,bottom=Math.max(...ys)+100;
       camera.focus((left+right)/2,(top+bottom)/2,w,h,Math.min(1,w/(right-left),h/(bottom-top))*.94);
      }
      else if(hub){
       const points=gameData.mastery.skills.filter(s=>s.school===hub.name).map(s=>(constellation.nodes as Record<string,{x:number;y:number}>)[s.id]);
       const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs)-100,right=Math.max(...xs)+100,top=Math.min(...ys)-100,bottom=Math.max(...ys)+100;
       camera.focus((left+right)/2,(top+bottom)/2,w,h,Math.min(w/(right-left),h/(bottom-top))*.94);
      }
     }else camera.bound(w,h);
     mapTarget=null;paintCamera();
    }
    new ResizeObserver(positionMap).observe(panel);
	function level(id: string) {
		return (job?.skills[id] || 0) + (pending[id] || 0);
	}
	function owner(jobId: string) {
		let j = jobsData.jobs.find((j) => j.id === job?.jobId);
		while (j) {
			if (j.id === jobId) return true;
			j = jobsData.jobs.find((p) => p.id === j?.parent);
		}
		return jobId === "common";
	}
	function reason(s: any) {
		if (!job) return "กำลังรับข้อมูล";
        if(s.plan){
         if(!s.legacyRuntime&&!isMasteryAction(s.id)&&!isMasteryPassive(s.id))return "ยังไม่เปิดให้เรียน";
         return masterySkillLock({...job,skills:{...job.skills,...Object.fromEntries(Object.keys(pending).map(id=>[id,level(id)]))},skillPoints:job.skillPoints-Object.values(pending).reduce((a,b)=>a+b,0)},s.id,gameData.mastery)??"";
        }
		if (!owner(s.jobId)) return "อาชีพไม่ตรง";
		if (level(s.id) >= s.maxLevel) return "ระดับสูงสุด";
		const req = s.requires.find((r: any) => level(r.id) < r.level);
		if (req)
			return `ต้องมี ${skills.find((s) => s.id === req.id)?.nameTh} ระดับ ${req.level}`;
		if (job.skillPoints - Object.values(pending).reduce((a, b) => a + b, 0) < 1)
			return "แต้มสกิลไม่พอ";
		return "";
	}
	const icon = (s: any,extra="") => {
        const art=(paintedIcons.icons as Record<string,{file:string}>)[s.id];
        const style=art?`background-image:url('/assets/mastery-painted/${art.file}');background-position:center;background-size:100% 100%`:`--ix:${s.icon % 4};--iy:${Math.floor(s.icon / 4)}`;
        return `<span class="job-icon ${extra}" style="${style}" aria-hidden="true"></span>`;
    };
	function values(s: any, lv: number) {
        if(s.plan&&!s.legacyRuntime){const r=s.plan.ranks[Math.max(0,Math.min(s.plan.maxRank-1,lv-1))],effect=r.effect.replace(/\d+(?:\.\d+)?/g,(n:string)=>String(Math.round(Number(n)*100)/100));return s.passive?effect:`${effect} · MP ${r.mp} · CD ${r.cooldown} วิ · ร่าย ${r.cast} วิ · ระยะ ${s.range} ม.`;}
		const at = (key: string, fallback: number) =>
			s.values?.[key]?.[Math.max(0, lv - 1)] ?? fallback;
		const pct = (v: number) => Math.round(v * 100);
		if (s.passive && s.id === "guardian_spirit") return `ป้องกัน +${pct(at("defPercent", 0))}% · พลังชีวิต +${pct(at("hpPercent", 0))}%`;
		if (s.passive && s.id === "retribution") return `สะท้อนความเสียหายระยะประชิด ${pct(at("reflect", 0))}% กลับใส่ผู้โจมตี`;
		if (s.passive && s.id === "berserk_soul") return `พลังโจมตี +${pct(at("atkPercent", 0))}%`;
		if (s.passive && s.id === "bloodlust") return `ดูดเลือด ${pct(at("lifesteal", 0))}% ของความเสียหายที่ทำ`;
		if (s.passive)
			return s.id === "sword_mastery"
				? `พลังโจมตี +${at("atk", 0)} เมื่อใช้ดาบ`
				: s.id === "sword_rhythm"
					? `คอมโบสาม +${at("comboBonus", 0) * 100}% · ลดคูลดาวน์อื่น ${at("cooldownReduction", 0).toFixed(1)} วิ`
						: `พลังชีวิต +${at("hpPercent", 0) * 100}% · ฟื้นพลังชีวิต +${at("hpRegenPercent", 0) * 100}%`;
		return `${s.percent ? `${s.hits || 1}×${at("percent", s.percent).toFixed(0)}% · ` : ""}พลังสกิล ${at("sp", s.sp).toFixed(1).replace(".0", "")} · ${s.cooldown} วิ${effectText(s, lv)}`;
	}
	function effectText(s: any, lv: number) {
		const at = (key: string, fallback: number) => s.values?.[key]?.[Math.max(0, lv - 1)] ?? fallback;
		const pct = (v: number) => Math.round(v * 100);
		return `${s.effect === "taunt" ? ` · ป้องกัน −${Math.round(at("defDown", 0.05) * 100)}% ${s.duration ?? 5} วิ` : s.effect === "endure" ? ` · ป้องกัน +${Math.round(at("defUp", 0.06) * 100)}% 8 วิ` : s.effect === "dash" ? ` · ${s.range} ม. สตั้น ${s.duration} วิ` : s.effect === "knockup" ? ` · ยก ${s.duration} วิ ร่าย ${s.cast} วิ` : s.effect === "stun" ? ` · สตั้น ${s.duration} วิ` : s.effect === "guard" ? ` · ลดความเสียหายที่ได้รับ ${pct(at("guard", 0.1))}% ${s.duration} วิ` : s.effect === "rage" ? ` · พลังโจมตี +${pct(at("atkUp", 0.1))}% เร็วขึ้น 10% ${s.duration} วิ · เสียพลังชีวิต ${pct(at("hpCost", 0.08))}%` : ""}`;
	}
	/** Damage breakdown for attack skills: kind, reach and element up top, then this level against the next,
	 *  estimated from the player's current ATK/MATK before the target's armour and element. */
	function damageHTML(s: any, lv: number, nextLv: number) {
		const magic = s.type === "magic", power = derived ? (magic ? derived.matk : derived.atk) : 0;
		const hits = s.hits || 1;
		const at = (key: string, fallback: number, l: number) => s.values?.[key]?.[Math.max(0, l - 1)] ?? fallback;
		const per = (l: number) => at("percent", s.percent, l), sp = (l: number) => at("sp", s.sp, l);
		const est = (pct: number) => Math.round(power * pct / 100);
		const n = (v: number) => v.toLocaleString("th-TH");
		const element = s.element === "weapon"
			? `ตามอาวุธ${derived?.weaponElement ? ` (${ELEMENT_TH[derived.weaponElement] ?? derived.weaponElement})` : ""}`
			: ELEMENT_TH[s.element] ?? s.element;
		const reach = s.kind === "area" ? `วงกว้าง · รัศมี ${s.radius || s.range} ม.` : `เป้าเดียว · ระยะ ${s.range} ม.`;
		const chips = [magic ? "เวท" : "กายภาพ", `ธาตุ ${element}`, reach, hits > 1 ? `ตี ${hits} ครั้ง` : "", `คูลดาวน์ ${s.cooldown} วิ`, s.cast ? `ร่าย ${s.cast} วิ` : "ใช้ทันที"]
			.filter(Boolean).map((c) => `<span>${c}</span>`).join("");
		const col = (l: number) => {
			if (!l) return { hit: "—", total: "—", dps: "—", sp: "—" };
			const p = per(l), total = p * hits;
			return {
				hit: `${Math.round(p)}%${power ? `<small>≈ ${n(est(p))}</small>` : ""}`,
				total: power ? `≈ ${n(est(total))}` : `${Math.round(total)}%`,
				dps: power ? `≈ ${n(Math.round(est(total) / Math.max(0.1, s.cooldown + (s.cast || 0))))}` : "—",
				sp: sp(l).toFixed(1).replace(".0", ""),
			};
		};
		const now = col(lv), next = lv < s.maxLevel ? col(nextLv) : null;
		const row = (label: string, k: keyof ReturnType<typeof col>) =>
			`<tr><th>${label}</th><td>${now[k]}</td>${next ? `<td class="nx">${next[k]}</td>` : ""}</tr>`;
		const basic = BASIC?.percent || 100;
		const ratio = (per(Math.max(1, lv)) * hits) / basic;
		const effect = effectText(s, Math.max(1, lv)).replace(/^ · /, "");
		return `<section class="sk-dmg"><h4>ความเสียหาย</h4><div class="sk-chips">${chips}</div>
			<table><thead><tr><th></th><th>${lv ? `ตอนนี้ · Lv ${lv}` : "ยังไม่ได้เรียน"}</th>${next ? `<th class="nx">Lv ${nextLv}</th>` : ""}</tr></thead><tbody>
			${row(hits > 1 ? "ต่อครั้ง" : "ความเสียหาย", "hit")}${hits > 1 ? row(`รวม ${hits} ครั้ง`, "total") : ""}${row("เฉลี่ยต่อวินาที", "dps")}${row("ใช้พลังสกิล", "sp")}
			</tbody></table>
			${effect ? `<p class="sk-eff">ผลพิเศษ · ${effect}</p>` : ""}
			<p class="sk-note">แรงกว่าโจมตีปกติ ×${ratio.toFixed(1)}${power ? ` · ≈ คิดจาก${magic ? "พลังเวท" : "พลังโจมตี"} ${n(Math.round(power))} ตอนนี้ ก่อนหักเกราะและธาตุของศัตรู` : ""}</p></section>`;
	}

	/* ---------- School tree (ui-mockup/skilltree.html): one school per page, rows = Mastery unlock level ---------- */
	const masteryOf=(school:string)=>(job?.masteries as Record<string,number>|undefined)?.[school]??0;
	const pointsLeft=()=>(job?.skillPoints??0)-Object.values(pending).reduce((a,b)=>a+b,0);
	function segHTML(){
	 const on=(v:boolean)=>`aria-pressed="${v}"`,tree=viewJob!=="mix"&&viewJob!=="items";
	 return `<nav class="mt-seg" role="toolbar" aria-label="มุมมองสกิล"><button type="button" data-view="${lastSchool}" ${on(tree)}>ผังสกิล</button><button type="button" data-view="mix" ${on(viewJob==="mix")}>ผสานศาสตร์ <i>${gameData.mastery.mixes.length}</i></button><button type="button" data-view="items" ${on(viewJob==="items")}>ยา</button></nav>`;
	}
	function bindViews(root:HTMLElement){
	 root.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(b=>b.onclick=()=>{viewJob=b.dataset.view!;mapTarget="all";selected=null;if(MASTERY_SCHOOLS.some(s=>s===viewJob)&&!skills.some(s=>s.id===detailId&&s.school===viewJob))detailId=null;draw();});
	}
	function railHTML(){
	 const learned=(school:string)=>skills.filter(s=>s.plan&&s.school===school&&level(s.id)).length;
	 const stars=MASTERY_SCHOOLS.map((school,i)=>{const a=-Math.PI/2+i*2*Math.PI/7,list=skills.filter(s=>s.plan&&s.school===school);
	  return list.map((s,j)=>{const r=16+((j%7)+1)*7,aa=a+(Math.floor(j/7)-1)*.28;return `<circle cx="${(70+Math.cos(aa)*r).toFixed(1)}" cy="${(70+Math.sin(aa)*r).toFixed(1)}" r="${level(s.id)?2.4:1.4}" fill="${level(s.id)?schoolColors[i]:'#ffffff40'}"/>`;}).join("");}).join("");
	 const total=skills.filter(s=>s.plan&&level(s.id)).length;
	 return `<div class="mt-cap">ศาสตร์ · MASTERY</div>${MASTERY_SCHOOLS.map((school,i)=>`<button type="button" class="mt-sch" data-view="${school}" aria-pressed="${viewJob===school}" style="--c:${schoolColors[i]};--m:${masteryOf(school)}"><span class="mt-gl" aria-hidden="true">${schoolGlyphs[school]}</span><b>${schoolNames[school]}<small>เรียน ${learned(school)}/${skills.filter(s=>s.plan&&s.school===school).length}</small></b><span class="mt-mb"><i></i><em>${masteryOf(school)}</em></span></button>`).join("")}
	  <button type="button" class="mt-mini" data-view="all" aria-label="เปิดผังดวงดาวรวม 147 สกิล"><svg viewBox="0 0 140 140" aria-hidden="true"><circle cx="70" cy="70" r="11" fill="#e6c98f26" stroke="#e6c98f80"/><text x="70" y="73" font-size="9" fill="#fff1c9" text-anchor="middle" font-weight="800">${total}</text>${stars}</svg><b>ผังดวงดาวรวม</b><small>เรียนแล้ว ${total} / ${skills.filter(s=>s.plan).length} ดาว · กดเพื่อเปิด</small></button>`;
	}
	function drawTree(tree:HTMLElement){
	 const mix=viewJob==="mix";
	 tree.innerHTML=`${segHTML()}<div class="mt-body${mix?" mt-mixmode":""}"><aside class="mt-rail"></aside><section class="mt-tree"></section><aside class="mt-det" aria-live="polite"></aside></div>`;
	 const rail=tree.querySelector<HTMLElement>(".mt-rail")!,main=tree.querySelector<HTMLElement>(".mt-tree")!,det=tree.querySelector<HTMLElement>(".mt-det")!;
	 if(mix)drawMix(rail,main,det);
	 else{rail.innerHTML=railHTML();drawSchool(main,det);}
	 bindViews(tree);
	}
	function drawSchool(main:HTMLElement,det:HTMLElement){
	 const school=viewJob!,color=schoolColors[MASTERY_SCHOOLS.indexOf(school as typeof MASTERY_SCHOOLS[number])],list=skills.filter(s=>s.plan&&s.school===school),m=masteryOf(school);
	 if(!list.some(s=>s.id===detailId))detailId=(list.find(s=>!reason(s))??list[0])?.id??null;
	 const lanes=[...new Set(list.map(s=>s.plan.branch as string))].sort((a,b)=>(a==="core"?0:1)-(b==="core"?0:1));
	 const gates=[...new Set(list.map(s=>s.plan.ranks[0].mastery as number))].sort((a,b)=>a-b);
	 const COLW=92,GUT=54,ROWH=74,TOP=6,cellOf=(b:string,g:number)=>list.filter(s=>s.plan.branch===b&&s.plan.ranks[0].mastery===g);
	 const sub=Object.fromEntries(lanes.map(b=>[b,Math.max(b==="core"?3:2,...gates.map(g=>cellOf(b,g).length))]));
	 const laneX:Record<string,number>={};let x=GUT;for(const b of lanes){laneX[b]=x;x+=sub[b]*COLW+10;}
	 const pos:Record<string,[number,number]>={};
	 for(const b of lanes)for(const g of gates){const cell=cellOf(b,g).sort((p,q)=>Number(p.passive)-Number(q.passive)),w=sub[b]*COLW,start=laneX[b]+(w-cell.length*COLW)/2;cell.forEach((s,i)=>{pos[s.id]=[start+COLW*i+COLW/2,TOP+gates.indexOf(g)*ROWH+ROWH/2-4];});}
	 const laneOf=(id:string)=>list.find(s=>s.id===id)?.plan.branch;
	 const entry=(b:string)=>{const need=new Map<string,number>();for(const s of list.filter(s=>s.plan.branch===b))for(const r of s.requires)if(laneOf(r.id)!==b)need.set(r.id,Math.max(need.get(r.id)??0,r.level));
	  return [...need].map(([id,n])=>{const ok=level(id)>=n;return `<em class="${ok?"":"no"}">${ok?"✓":"🔒"} ต้อง ${skills.find(s=>s.id===id)?.nameTh??id} Lv${n}</em>`;}).join("");};
	 const edges=list.flatMap(s=>s.requires.filter((r:any)=>laneOf(r.id)===s.plan.branch).map((r:any)=>{const a=pos[r.id],b=pos[s.id];if(!a||!b)return"";const met=level(r.id)>=r.level,y1=a[1]+46,y2=b[1]-26,my=(y1+y2)/2;
	  return `<path class="${met?"met":""}" d="M${a[0]} ${y1} C${a[0]} ${my},${b[0]} ${my},${b[0]} ${y2}"/>${met?"":`<text x="${b[0]+26}" y="${y2+4}">Lv${r.level}</text>`}`;})).join("");
	 const nowIndex=gates.findIndex(g=>g>m),nowY=nowIndex<0?TOP:TOP+nowIndex*ROWH;
	 const nodes=list.map(s=>{const lv=level(s.id),lock=reason(s),[nx,ny]=pos[s.id],max=lv>=s.maxLevel;
	  const cls=["mt-node",s.passive?"pas":"",lv?"learned":"",!lock&&!max?"can":"",!lv&&lock?"lock":"",pending[s.id]?"pending":"",s.id===detailId?"sel":""].filter(Boolean).join(" ");
	  return `<button type="button" class="${cls}" data-sk="${s.id}" style="left:${nx}px;top:${ny-25}px" draggable="${!s.passive&&!!job!.skills[s.id]}" aria-pressed="${s.id===detailId}" aria-label="${s.nameTh} ระดับ ${lv}/${s.maxLevel} ${lock||"เรียนได้"}" title="${s.nameTh} · ${lv}/${s.maxLevel}${lock?" · "+lock:""}"><span class="mt-ic">${icon(s)}<span class="mt-rk">${lv}/${s.maxLevel}${max?" MAX":""}</span></span><span class="mt-nm">${s.nameTh}</span></button>`;}).join("");
	 main.style.setProperty("--c",color);
	 main.innerHTML=`<div class="mt-lanes" style="grid-template-columns:${GUT}px ${lanes.map(b=>sub[b]*COLW+10+"px").join(" ")}"><span></span>${lanes.map(b=>`<span class="${b==="core"?"core":""}">${branchNames[b]??b}<small>${list.filter(s=>s.plan.branch===b).length} สกิล · ${b==="core"?"พื้นฐานของศาสตร์":"สายเฉพาะทาง"}</small>${entry(b)}</span>`).join("")}</div>
	  <div class="mt-grid" style="height:${TOP+gates.length*ROWH}px">${gates.map((g,i)=>`<div class="mt-row ${g<=m?"open":"locked"}" style="top:${TOP+i*ROWH}px;height:${ROWH}px"><span class="mt-ml">M ${g}${g>m?'<small>🔒</small>':''}</span></div>`).join("")}${lanes.slice(1).map(b=>`<span class="mt-lanebg" style="left:${laneX[b]-5}px"></span>`).join("")}<svg class="mt-edges" aria-hidden="true">${edges}</svg><div class="mt-now${nowIndex<0?" full":""}" style="top:${nowY}px"><span>Mastery ${schoolNames[school]} ${m}${nowIndex<0?" · ปลดล็อกครบทุกแถว":""}</span></div>${nodes}</div>
	  <div class="mt-legend"><span><i class="l"></i>เรียนแล้ว</span><span><i class="c"></i>เรียนได้ตอนนี้</span><span><i class="k"></i>ยังล็อก</span><span><i></i>แอคทีฟ</span><span><i class="r"></i>พาสซีฟ</span><span class="end">Mastery เพิ่มเมื่อใช้สกิลของศาสตร์นี้ต่อสู้</span></div>`;
	 main.querySelectorAll<HTMLButtonElement>("[data-sk]").forEach(node=>{
	  node.onclick=()=>{const s=list.find(s=>s.id===node.dataset.sk)!;detailId=s.id;
	   if(!s.passive&&job?.skills[s.id]){selected=s.id;$("#skills-status").textContent=`เลือกช่องในแถบลัดเพื่อวาง ${s.nameTh} · หรือลากไอคอนลงไป`;}else selected=null;draw();};
	  node.ondragstart=e=>{document.body.classList.add("dragging-hotbar");e.dataTransfer?.setData("text/plain",node.dataset.sk!);};
	  node.ondragend=()=>document.body.classList.remove("dragging-hotbar");
	 });
	 const d=list.find(s=>s.id===detailId);if(!d){det.innerHTML="";return;}
	 const lv=level(d.id),learned=job!.skills[d.id]||0,nextLv=Math.min(d.maxLevel,lv+1),lock=reason(d),max=lv>=d.maxLevel,ranks=d.plan.ranks;
	 const bars=Array.from({length:d.maxLevel},(_,i)=>`<i class="${i<learned?"on":i<lv?"new":i===lv&&!lock?"nx":ranks[i]?.mastery>m?"gate":""}" title="ระดับ ${i+1} · ต้อง Mastery ${ranks[i]?.mastery??0}"></i>`).join("");
	 const gateNext=ranks.find((r:any,i:number)=>i>=lv&&r.mastery>m)?.mastery;
	 const rank=ranks[Math.max(0,Math.min(ranks.length-1,(lv||1)-1))];
	 const reqs=[...d.requires.map((r:any)=>`<li class="${level(r.id)>=r.level?"":"no"}">${skills.find(s=>s.id===r.id)?.nameTh??r.id} ระดับ ${r.level}<small>มี ${level(r.id)}</small></li>`),
	  max?"":`<li class="${(ranks[lv]?.mastery??0)<=m?"":"no"}">Mastery ${schoolNames[school]} ${ranks[lv]?.mastery??0}<small>มี ${m}</small></li>`,
	  max?"":`<li class="${pointsLeft()>0?"":"no"}">แต้มสกิล 1<small>เหลือ ${pointsLeft()}</small></li>`].join("");
	 const effect=!d.passive&&d.type!=="heal"&&d.percent>0?damageHTML(d,lv,nextLv):`<div class="mt-box"><h4>ผล</h4><p>${lv?`ตอนนี้: <b>${values(d,lv)}</b>`:"ยังไม่ได้เรียน"}</p>${max?"":`<p class="nx">ระดับ ${nextLv}: ${values(d,nextLv)}</p>`}</div>`;
	 det.style.setProperty("--c",color);
	 det.innerHTML=`<div class="mt-dh">${icon(d,"mt-big"+(d.passive?" round":""))}<div><h3></h3><div class="mt-tags"><span>${d.passive?"พาสซีฟ":"แอคทีฟ"}</span><span>${schoolNames[school]} · ${branchNames[d.plan.branch]??d.plan.branch}</span><span>${weaponNames[d.plan.weapon]??d.plan.weapon}</span></div></div></div>
	  <div><div class="mt-rkl"><span>ระดับ <b>${lv} / ${d.maxLevel}</b>${pending[d.id]?` <em>(+${pending[d.id]} รอยืนยัน)</em>`:""}</span><span>${gateNext!==undefined?`ช่องลาย = ต้อง Mastery ${gateNext}`:"เรียนได้ครบทุกระดับ"}</span></div><div class="mt-ranks" style="--n:${d.maxLevel}">${bars}</div></div>
	  ${effect}
	  ${d.passive?"":`<div class="mt-kv"><div><small>MP</small><b>${Math.round(rank.mp)}</b></div><div><small>คูลดาวน์</small><b>${rank.cooldown}s</b></div><div><small>ระยะ</small><b>${d.plan.range}m</b></div></div>`}
	  <div class="mt-box"><h4>เงื่อนไขระดับถัดไป</h4><ul class="mt-req">${max?"<li>เรียนครบแล้ว</li>":reqs}</ul></div>
	  <div class="mt-acts"><button type="button" class="mt-minus" aria-label="ลดระดับที่เตรียมไว้" ${pending[d.id]?"":"disabled"}>−</button><button type="button" class="mt-learn" data-learn="${d.id}" ${lock||max?"disabled":""}>${max?"ระดับสูงสุดแล้ว":lock?lock:`+ เรียนระดับ ${nextLv}`}${lock||max?"":"<small>1 แต้ม</small>"}</button></div>
	  <p class="mt-hint">${d.passive?"พาสซีฟทำงานเองเมื่อเรียนแล้ว":learned?"ลากไอคอนลงแถบลัด หรือกดแล้วแตะช่อง":"เรียนแล้วจึงวางลงแถบลัดได้"} · กดยืนยันเรียนสกิลด้านล่างเพื่อบันทึก</p>`;
	 det.querySelector("h3")!.textContent=d.nameTh;
	 det.querySelector<HTMLButtonElement>(".mt-learn")!.onclick=()=>{pending[d.id]=(pending[d.id]||0)+1;$("#skills-status").textContent=`เตรียมอัป ${d.nameTh} · กดยืนยันเรียนสกิลด้านล่าง`;draw();};
	 det.querySelector<HTMLButtonElement>(".mt-minus")!.onclick=()=>{if(!pending[d.id])return;pending[d.id]--;if(!pending[d.id])delete pending[d.id];draw();};
	}
	/* ---------- Mix tab ---------- */
	function mixState(m:(typeof gameData.mastery.mixes)[number]){
	 const items=[
	  ...Object.entries(m.masteries).map(([school,n])=>({label:`Mastery ${schoolNames[school]} ${n}`,ok:masteryOf(school)>=n!,have:String(masteryOf(school))})),
	  ...Object.entries(m.pathRanks).map(([id,n])=>({label:`${skills.find(s=>s.id===id)?.nameTh??id} Lv${n}`,ok:(job!.skills[id]??0)>=n,have:String(job!.skills[id]??0),skill:true})),
	  ...Object.keys(m.requires).map(id=>({label:`${skills.find(s=>s.id===id)?.nameTh??id} อยู่ในแถบลัด`,ok:job!.hotbar.some(s=>s.skill===id&&!s.mode),have:job!.hotbar.some(s=>s.skill===id&&!s.mode)?"มี":"ไม่มี"})),
	 ];
	 const done=items.filter(i=>i.ok).length;
	 return {items,done,ready:done===items.length,active:job!.hotbar.some(s=>s.signature===m.id)};
	}
	function drawMix(rail:HTMLElement,main:HTMLElement,det:HTMLElement){
	 const mixes=gameData.mastery.mixes,inFilter=(m:typeof mixes[number])=>mixFilter==="all"||(mixFilter==="ready"?mixState(m).ready:mixFilter in m.masteries);
	 const count=(f:string)=>mixes.filter(m=>f==="all"||(f==="ready"?mixState(m).ready:f in m.masteries)).length;
	 rail.innerHTML=`<div class="mt-cap">กรองตามศาสตร์</div><button type="button" class="mt-all" data-mf="all" aria-pressed="${mixFilter==="all"}">ทั้งหมด<small>${count("all")} สูตร</small></button><button type="button" class="mt-all" data-mf="ready" aria-pressed="${mixFilter==="ready"}">ใช้ได้ตอนนี้<small>${count("ready")} สูตร</small></button>${MASTERY_SCHOOLS.map((school,i)=>`<button type="button" class="mt-sch" data-mf="${school}" aria-pressed="${mixFilter===school}" style="--c:${schoolColors[i]};--m:${masteryOf(school)}"><span class="mt-gl" aria-hidden="true">${schoolGlyphs[school]}</span><b>${schoolNames[school]}<small>${count(school)} Mix</small></b><span class="mt-mb"><i></i><em>${masteryOf(school)}</em></span></button>`).join("")}`;
	 rail.querySelectorAll<HTMLButtonElement>("[data-mf]").forEach(b=>b.onclick=()=>{mixFilter=b.dataset.mf!;draw();});
	 const score=(m:typeof mixes[number])=>{const st=mixState(m);return (st.active?1000:0)+(st.ready?100:0)+st.done/st.items.length;};
	 const list=mixes.filter(inFilter).sort((a,b)=>score(b)-score(a));
	 if(!mixId||!mixes.some(m=>m.id===mixId))mixId=list[0]?.id??mixes[0].id;
	 const colorOf=(school:string)=>schoolColors[MASTERY_SCHOOLS.indexOf(school as typeof MASTERY_SCHOOLS[number])];
	 main.classList.add("mt-mixgrid");
	 main.innerHTML=`<p class="mt-mixhead"><b>ผสานศาสตร์ (Mix)</b> · คอมโบข้ามสองศาสตร์ ทำงานเองเมื่อเข้าจังหวะ · ใช้ได้ทีละ 1 สูตร</p>`+list.map(m=>{
	  const st=mixState(m),[a,b]=Object.keys(m.masteries);
	  return `<button type="button" class="mt-mc${m.id===mixId?" sel":""}${st.active?" active":""}" data-mix="${m.id}" style="--a:${colorOf(a)};--b:${colorOf(b)}"><span class="mt-pair">${[a,b].map(s=>`<span class="${masteryOf(s)>=m.masteries[s as keyof typeof m.masteries]!?"":"no"}" style="--c:${colorOf(s)}"><i>${schoolGlyphs[s]}</i>${schoolNames[s]} ${m.masteries[s as keyof typeof m.masteries]}</span>`).join("<em>+</em>")}${st.active?'<span class="mt-st act">ใช้งานอยู่</span>':st.ready?'<span class="mt-st ready">พร้อมใช้</span>':`<span class="mt-st miss">ขาดอีก ${st.items.length-st.done}</span>`}</span>
	   <b class="mt-mname">${m.nameTh}<small>${m.id} · ${weaponNames[m.weapon]??m.weapon}</small></b><span class="mt-meff">${m.effect}</span><span class="mt-bar" style="--p:${Math.round(st.done/st.items.length*100)}"><i></i></span></button>`;}).join("");
	 main.querySelectorAll<HTMLButtonElement>("[data-mix]").forEach(b=>b.onclick=()=>{mixId=b.dataset.mix!;draw();});
	 const m=mixes.find(x=>x.id===mixId)!,st=mixState(m),[a,b]=Object.keys(m.masteries);
	 det.innerHTML=`<div class="mt-emb"><span style="--c:${colorOf(a)}">${schoolGlyphs[a]}</span><b>+</b><span style="--c:${colorOf(b)}">${schoolGlyphs[b]}</span></div><h3 class="mt-mixtitle"></h3><p class="mt-mixsub">${schoolNames[a]} × ${schoolNames[b]} · ${weaponNames[m.weapon]??m.weapon}</p>
	  <div class="mt-flow"><div class="when"><h4>เมื่อไหร่</h4><span></span></div><div class="arr" aria-hidden="true">↓</div><div class="eff"><h4>ผล</h4><span></span></div><div class="cost"><h4>แลกกับ</h4><span></span></div></div>
	  <div class="mt-kv"><div><small>MP</small><b>${m.mp}</b></div><div><small>คูลดาวน์</small><b>${m.icd}s</b></div><div><small>หน้าต่างเวลา</small><b>${m.window?m.window+"s":"—"}</b></div></div>
	  <div class="mt-box"><h4>เงื่อนไข ${st.done}/${st.items.length}</h4><ul class="mt-req">${st.items.map(i=>`<li class="${i.ok?"":"no"}">${i.label}<small>${i.have}</small></li>`).join("")}</ul></div>
	  <button type="button" class="mt-use${st.active?" off":""}" ${st.ready||st.active?"":"disabled"}>${st.active?"เลิกใช้ Mix นี้":st.ready?"ตั้งเป็น Mix ที่ใช้งาน":"ยังใช้ไม่ได้ · เงื่อนไขไม่ครบ"}</button>
	  <p class="mt-hint">ใช้ได้ทีละ 1 สูตร · สกิลตัวเปิดในแถบลัดจะมีป้าย ${m.id} · เปลี่ยนได้เมื่อพ้นการต่อสู้ 5 วินาที</p>`;
	 det.querySelector(".mt-mixtitle")!.textContent=m.nameTh;
	 const [when,eff,cost]=det.querySelectorAll(".mt-flow span");when.textContent=m.event;eff.textContent=m.effect;cost.textContent=m.trade;
	 det.querySelector<HTMLButtonElement>(".mt-use")!.onclick=()=>{
	  const anchor=st.active?-1:job!.hotbar.findIndex(s=>s.skill&&s.skill in m.requires&&!s.mode);
	  send({t:"hotbar",slots:job!.hotbar.map((s,i)=>({...s,signature:i===anchor?m.id:undefined}))});
	  $("#skills-status").textContent=st.active?"กำลังเลิกใช้ Mix…":`กำลังตั้ง ${m.nameTh} เป็น Mix ที่ใช้งาน…`;
	 };
	}
	function slotsHTML(mirror = false) {
		return (job?.hotbar || [])
			.map((slot, i) => {
				const s = slot.mode==='autoSpell'&&slot.skill&&job?resolveAutomaticSkill(gameData,slot.skill,Math.max(1,masteryAutoRank(job,slot.skill,gameData.mastery))):slotSpec(slot.skill),
					learned = !!s && (!!slot.skill?.startsWith('item:') || !!job?.skills[s.id]);
				const isItem = !!slot.skill?.startsWith("item:");
				const extra = mirror && s ? (isItem ? `<b class="slot-count">${bagCount(inventory, slot.skill!.slice(5))}</b>` : `<i class="slot-sp">${Math.round(s.values?.sp?.[Math.max(0, level(s.id) - 1)] ?? s.sp ?? 0) || ""}</i>`) : isItem && s ? '<b class="slot-count"></b>' : "";
				const target = mirror && selected ? " slot-target" : "";
				const label = mirror && selected && !s ? "แตะเพื่อวาง" : `${slot.mode==='autoSpell'?'AS · ':''}${slot.signature?slot.signature+' · ':''}${s?.nameTh || "ว่าง"}`;
				return `<button class="job-slot ${i >= 5 ? "extra-slot" : ""} ${isItem ? "item-slot" : ""} ${learned ? "" : "unlearned"} ${!s ? "vacant" : ""}${target}" title="${label} · ${keyLabel(slot.key)}" data-slot="${i}" ${isItem ? `data-item="${slot.skill!.slice(5)}"` : ""} ${mirror ? 'data-mirror="true"' : ""} aria-label="ช่อง ${i + 1} ${label} ${keyLabel(slot.key)}"><kbd>${keyLabel(slot.key)}</kbd>${s ? isItem ? itemIconHTML(slot.skill!.slice(5), 'hotbar-potion') : icon(s) : '<span class="empty-mark">+</span>'}${extra}${slot.mode?'<b class="slot-mode" aria-hidden="true">AUTO</b>':''}${slot.signature?`<b class="slot-mix" aria-hidden="true">${slot.signature}</b>`:''}<small>${label}</small><em></em>${mirror && s ? '<span class="slot-clear" role="button" aria-label="ล้างช่อง">×</span>' : ""}</button>`;
			})
			.join("");
	}
    /** Auto Spell panel (ui-mockup/autospell.html): slots unlocked by the highest Mastery, one switch per eligible hotbar skill. */
    function drawModes(){
     if(!job)return;
     let root=panel.querySelector<HTMLElement>('#mastery-loadout');if(!root){root=document.createElement('section');root.id='mastery-loadout';$('#skill-slots').after(root);}
     const used=job.hotbar.filter(s=>s.mode==='autoSpell').length,limit=masteryTriggerSlots(job.masteries);
     const masteries=job.masteries as Record<string,number>,best=Object.entries(masteries).sort((a,b)=>b[1]-a[1])[0]??["Swordsman",0],top=best[1];
     const causes:Record<string,[string,string]>={hp:['❤','HP ลดถึง 40%'],incoming:['⚡','เสีย HP 15% ใน 6 วิ'],skills:['✦','ใช้สกิลปกติครบ 3 ครั้ง']};
     const cause=(plan:any)=>{const c=automaticCause(plan);return `<span class="as-cause ${c}">${causes[c][0]} ${causes[c][1]}</span>`;};
     const card=(slot:HotbarSlot,i:number)=>{
      const plan=gameData.mastery.skills.find(s=>s.id===slot.skill);if(!plan?.triggerEligible)return '';
      const s=skills.find(x=>x.id===plan.id),rank=masteryAutoRank(job!,plan.id,gameData.mastery),on=slot.mode==='autoSpell',learned=job!.skills[plan.id]??0;
      const why=!learned?'ยังไม่ได้เรียน':!rank?`ต้อง Mastery ${schoolNames[plan.school]} ${plan.autoRanks[0]?.mastery??0}`:!limit?'ยังไม่มีช่อง Auto':!on&&used>=limit?'ช่อง Auto เต็ม':'';
      const r=rank?plan.autoRanks[rank-1]:null;
      return `<article class="as-card${on?' on':''}${why&&!on?' off':''}"><div class="as-top">${s?icon(s):''}<div><b><kbd>${keyLabel(slot.key)}</kbd>${plan.nameTh}</b><small>${schoolNames[plan.school]} · เรียน Lv ${learned}</small></div><button type="button" class="as-sw${on?' on':''}" data-mode="${i}" role="switch" aria-checked="${on}" aria-label="Auto Spell ${plan.nameTh}" ${why&&!on?'disabled':''}></button></div>
       ${cause(plan)}<div class="as-ranks">${plan.autoRanks.map(x=>`<span class="${x.rank<=rank?'got':''}${x.rank===rank?' cur':''}">R${x.rank}<small>M${x.mastery} · MP ${x.mp}</small></span>`).join('')}</div>
       <div class="as-meta">${r?`Auto R${rank} · MP <b>${resolveAutomaticSkill(gameData,plan.id,rank).sp}</b> · คูลดาวน์ <b>${r.cooldown}s</b>`:'Auto ยังไม่พร้อม'}<span class="${on?'ok':why?'no':'dim'}">${on?'เปิดอยู่':why||'ปิด'}</span></div></article>`;
     };
     const cards=job.hotbar.map(card).join('');
     const onBar=new Set(job.hotbar.map(s=>s.skill));
     const others=gameData.mastery.skills.filter(p=>p.triggerEligible&&!onBar.has(p.id)&&(job!.skills[p.id]||(masteries[p.school]??0)>0)).sort((a,b)=>(job!.skills[b.id]??0)-(job!.skills[a.id]??0)).slice(0,6);
     const freeSlot=job.hotbar.findIndex(s=>!s.skill);
     const mix=gameData.mastery.mixes.find(m=>job!.hotbar.some(s=>s.signature===m.id));
     root.innerHTML=`<aside class="as-side"><h3>Auto Spell<b>${used}<small> / ${limit} ช่อง</small></b></h3><p>สกิลในแถบลัดที่เปิด Auto จะร่ายเองเมื่อเข้าเงื่อนไข ระหว่างที่คุณต่อสู้ตามปกติ · ช่องที่เป็น Auto กดใช้เองไม่ได้</p>
      <div class="as-track-head"><span>ช่องปลดล็อกจาก Mastery สูงสุด</span><b>${schoolNames[best[0]]??best[0]} ${top}</b></div>
      <div class="as-track" style="--v:${Math.min(100,top)}"><i></i><span class="${top>=50?'on':''}" style="left:50%"><em>${top>=50?'✓':'1'}</em>M50 · ช่อง 1</span><span class="${top>=75?'on':''}" style="left:75%"><em>${top>=75?'✓':'2'}</em>M75 · ช่อง 2</span></div>
      ${limit<2?`<p class="as-next">${top<50?`อีก ${50-top} Mastery ปลดช่องแรก`:`อีก ${75-top} Mastery ปลดช่องที่ 2`}</p>`:''}
      <ul class="as-rules"><li>ร่ายเองได้สูงสุด 1 ครั้ง/วินาที</li><li>Auto ไม่เรียก Auto ต่อกันเอง</li><li>ใช้ MP และคูลดาวน์ของระดับ Auto</li></ul>
      <p class="as-mix">Mix ที่ใช้งาน: <b>${mix?`${mix.id} · ${mix.nameTh}`:'ไม่ใช้'}</b> · ตั้งได้ที่แท็บ ผสานศาสตร์</p></aside>
      <div class="as-main"><div class="as-sec">สกิลในแถบลัดที่ตั้ง AUTO ได้</div>${cards?`<div class="as-grid">${cards}</div>`:'<p class="as-empty">ยังไม่มีสกิลที่ตั้ง Auto ได้ในแถบลัด · ดูรายการด้านล่าง</p>'}
      ${others.length?`<div class="as-sec">ใช้ Auto ได้ แต่ยังไม่อยู่ในแถบลัด</div><div class="as-others">${others.map(p=>{const s=skills.find(x=>x.id===p.id),lv=job!.skills[p.id]??0;return `<div class="as-row">${s?icon(s):''}<div><b>${p.nameTh}</b><small>${schoolNames[p.school]} · ${cause(p)}</small></div><button type="button" data-put="${p.id}" ${lv&&freeSlot>=0?'':'disabled'}>${!lv?'ยังไม่เรียน':freeSlot<0?'แถบเต็ม':'+ ใส่แถบ'}</button></div>`;}).join('')}</div>`:''}</div>`;
     root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(el=>el.onclick=()=>{const index=Number(el.dataset.mode),on=job!.hotbar[index].mode==='autoSpell';send({t:'hotbar',slots:job!.hotbar.map((s,i)=>({...s,...(i===index?{mode:on?undefined:'autoSpell' as const}:{})}))});$("#skills-status").textContent=on?'กำลังปิด Auto Spell…':'กำลังเปิด Auto Spell…';});
     root.querySelectorAll<HTMLButtonElement>('[data-put]').forEach(el=>el.onclick=()=>{if(freeSlot>=0)assign(freeSlot,el.dataset.put!);});
    }
	function assign(index: number, id: string | null) {
		if (!job) return;
		const next = job.hotbar.map((s, i) => ({
			...s,
			skill: i === index ? id : s.skill,
            ...(i===index?{mode:undefined,signature:undefined}:{}),
		}));
		send({ t: "hotbar", slots: next });
		$("#skills-status").textContent = "กำลังบันทึกแถบสกิล…";
		selected = null;
	}
	function bindSlots(root: HTMLElement) {
		root.querySelectorAll<HTMLElement>("[data-slot]").forEach((el) => {
			el.onclick = (e) => {
				const i = Number(el.dataset.slot);
				if ((e.target as HTMLElement).closest(".slot-clear")) { assign(i, null); return; }
				if (selected) assign(i, selected);
				else if (!el.dataset.mirror) {
					const id = job?.hotbar[i].skill;
					if (id && !job?.hotbar[i].mode) act(id);
				}
			};
			el.ondragover = (e) => e.preventDefault();
			el.ondrop = (e) => {
				e.preventDefault();
				const id = e.dataTransfer?.getData("text/plain");
				if (id && (skills.some(s=>s.id===id)||id.startsWith('item:'))) assign(Number(el.dataset.slot), id);
			};
			el.oncontextmenu = (e) => {
				e.preventDefault();
				assign(Number(el.dataset.slot), null);
			};
		});
	}
	/** Auto-potion highlight per template, kept across bar redraws (a stats refresh follows every drink). */
	const flashUntil: Record<string, number> = {};
	function drawBar() {
		const html = slotsHTML();
		if (bar.dataset.html !== html) { bar.innerHTML = html; bar.dataset.html = html; }
		for (const [template, until] of Object.entries(flashUntil))
			if (until > performance.now()) bar.querySelectorAll(`[data-item="${template}"]`).forEach((el) => el.classList.add("auto-drank"));
		bar.classList.toggle("show-extra", more);
		bindSlots(bar);
	}
	function draw() {
		if (!job) return;
        const focusedSkill=(document.activeElement as HTMLElement)?.closest<HTMLElement>('[data-sk]')?.dataset.sk;
        const focusedLearn=(document.activeElement as HTMLElement)?.dataset.learn;
		$("#skills-title").textContent="สกิล";
		$("#skills-job").textContent = viewJob==="mix"?"Mix คอมโบข้ามสองศาสตร์ · ใช้ได้ทีละ 1 สูตร":viewJob==="items"?"ยาและแถบลัด":"ฝึก Mastery ของแต่ละศาสตร์ด้วยการใช้สกิลศาสตร์นั้น";
		$("#skill-points").textContent = String(
			job.skillPoints - Object.values(pending).reduce((a, b) => a + b, 0),
		);
		const tree = $("#skills-tree");
		if (!viewJob || (!["all","items","mix"].includes(viewJob)&&!MASTERY_SCHOOLS.some(s=>s===viewJob)))viewJob=lastSchool;
        if(MASTERY_SCHOOLS.some(s=>s===viewJob))lastSchool=viewJob;
        if(viewJob!=="all"&&viewJob!=="items"){drawTree(tree);drawTail();return;}
        const spent=(ids:string[])=>ids.reduce((n,id)=>n+level(id),0);
        const names=schoolNames;
        const tabs=[`<button type="button" data-view="all" aria-pressed="${viewJob==="all"}" tabindex="${viewJob==="all"?0:-1}">ผังดวงดาว<small>147 สกิล · 7 ศาสตร์</small></button>`,...MASTERY_SCHOOLS.map(s=>`<button type="button" data-view="${s}" aria-pressed="${viewJob===s}" tabindex="${viewJob===s?0:-1}">${names[s]}<small>Mastery ${job!.masteries[s]??0} · ${spent(skills.filter(v=>v.school===s).map(v=>v.id))} แต้ม</small></button>`),`<button type="button" data-view="items" aria-pressed="${viewJob==="items"}" tabindex="${viewJob==="items"?0:-1}">ยา<small>ลากใส่แถบได้</small></button>`].join("");
        void tabs;
        tree.innerHTML=`${segHTML()}<div class="sk-main"><div class="sk-tree-wrap"><svg class="sk-lines" aria-hidden="true"></svg><div class="sk-grid"></div></div><aside class="sk-detail" aria-live="polite"></aside></div>`;
        bindViews(tree);
		const grid = tree.querySelector<HTMLElement>(".sk-grid")!;

		if (viewJob === "items") {
			grid.classList.add("sk-items", "pot-list");
			const slotOf = (id: string) => (job?.hotbar || []).findIndex((h) => h.skill === id);
			const potEffect = (t: (typeof barItems)[number]) => t.effect === "hp" ? `+${t.amount!.toLocaleString("en-US")} HP` : t.effect === "sp" ? `+${t.amount!.toLocaleString("en-US")} SP` : consumableBuffText(t)??'ใช้ไอเทม';
			const cdNote = document.createElement("p");
			cdNote.className = "pot-cd";
			cdNote.innerHTML = `<i aria-hidden="true"></i>ยาทุกชนิดใช้ <b>คูลดาวน์ร่วม ${POTION_CD} วิ</b> · กดปุ่มลัดหรือดับเบิลคลิกการ์ดเพื่อดื่มทันที`;
			grid.append(cdNote);
			for (const [effect, label] of [["hp", "ฟื้นพลังชีวิต (HP)"], ["sp", "ฟื้นพลังสกิล (SP)"], ["speed", "เสริมพลัง"], ["boost_exp", "เพิ่ม EXP"], ["boost_drop", "เพิ่มดรอป"]] as const) {
				const group = barItems.filter((t) => t.effect === effect);
				if (!group.length) continue;
				const head = document.createElement("div");
				head.className = `pot-group pot-${effect}`;
				head.textContent = label;
				const cards = document.createElement("div");
				cards.className = "pot-cards";
				for (const t of group) {
					const id = "item:" + t.id, own = bagCount(inventory, t.id), at = slotOf(id);
					const card = document.createElement("article");
					card.className = `pot-card pot-${effect}` + (own ? "" : " zero") + (selected === id ? " sk-selected" : "");
					card.dataset.skill = id;
					card.draggable = true;
					card.tabIndex = 0;
					card.innerHTML = `${at >= 0 ? `<span class="pot-slot">ช่อง ${keyLabel(job!.hotbar[at].key)}</span>` : ""}<span class="pot-own">${own ? "×" + own : "0"}</span>${itemIconHTML(t.id, "job-icon-item")}<b></b><span class="pot-amt">${potEffect(t)}</span>`;
					card.querySelector("b")!.textContent = t.nameTh;
					card.ondragstart = (e) => { document.body.classList.add("dragging-hotbar"); e.dataTransfer?.setData("text/plain", id); };
					card.ondragend = () => document.body.classList.remove("dragging-hotbar");
					card.onclick = () => { selected = selected === id ? null : id; $("#skills-status").textContent = selected ? `เลือกช่องด้านล่างเพื่อวาง ${t.nameTh}` : ""; draw(); };
					card.ondblclick = () => { if (own) act(id); };
					card.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); card.click(); } };
					cards.append(card);
				}
				grid.append(head, cards);
			}
			const chosen = barItems.find((t) => "item:" + t.id === selected);
			const detail = tree.querySelector<HTMLElement>(".sk-detail")!;
			if (!chosen) detail.innerHTML = `<p class="sk-empty">เลือกยาเพื่อดูรายละเอียดและวางลงแถบลัด หรือลากการ์ดลงช่องด้านล่างได้เลย · ยาใช้คูลดาวน์ร่วมกัน ${POTION_CD} วิ</p>`;
			else {
				const id = "item:" + chosen.id, at = slotOf(id), own = bagCount(inventory, chosen.id), bar = job!.hotbar;
				const firstEmpty = bar.findIndex((h) => !h.skill);
				detail.innerHTML = `<div class="pot-head pot-${chosen.effect}"><span class="pot-big">${itemIconHTML(chosen.id, "job-icon-item")}</span><div><h3></h3><small>${consumableBuffText(chosen) ? "บัฟอย่างน้อย 1 ชั่วโมง · ใช้ซ้ำต่อเวลา" : "ฟื้นฟูทันทีเมื่อดื่ม"}</small></div></div>
					<dl class="pot-kv"><dt>ผล</dt><dd class="pot-amt">${potEffect(chosen)}</dd><dt>มีในกระเป๋า</dt><dd>${own.toLocaleString("en-US")} ขวด</dd><dt>คูลดาวน์</dt><dd>${POTION_CD} วิ (ร่วมกับยาอื่น)</dd><dt>อยู่ในแถบ</dt><dd class="${at >= 0 ? "on" : ""}">${at >= 0 ? "ช่อง " + keyLabel(bar[at].key) : "ยังไม่ได้วาง"}</dd></dl>
					<h4>ใส่ลงแถบ</h4><div class="pot-put"></div>
					<p class="pot-auto">ดื่มอัตโนมัติเมื่อ HP/SP ต่ำ ตั้งได้ใน <button type="button" class="pot-auto-link">ตั้งค่า AUTO</button></p>`;
				detail.querySelector("h3")!.textContent = chosen.nameTh;
				const put = detail.querySelector<HTMLElement>(".pot-put")!;
				bar.forEach((h, i) => {
					const b = document.createElement("button");
					b.type = "button";
					const other = slotSpec(h.skill);
					b.textContent = `${keyLabel(h.key)}${i === at ? " ✓" : !h.skill ? " ·ว่าง" : ""}`;
						b.setAttribute("aria-label", `ใส่ช่อง ${keyLabel(h.key)}${h.skill ? " แทน " + (other?.nameTh ?? "") : " (ว่าง)"}`);
					b.title = h.skill ? `แทนที่ ${other?.nameTh ?? ""}` : "ช่องว่าง";
					b.className = i === at ? "on" : i === firstEmpty ? "rec" : "";
					b.onclick = () => assign(i, id);
					put.append(b);
				});
				detail.querySelector<HTMLButtonElement>(".pot-auto-link")!.onclick = () => { panel.close(); document.querySelector<HTMLElement>("#auto-settings-button")?.click(); };
			}
		} else {

            const list=skills.filter(s=>s.plan);
            if(!list.some(s=>s.id===detailId))detailId=list[0]?.id??null;
            const wrap=tree.querySelector<HTMLElement>(".sk-tree-wrap")!;
            wrap.classList.add("mastery-map");
            tree.querySelector(".sk-main")!.classList.toggle("mastery-overview",viewJob==="all");
            const overview=viewJob==="all",ancestors=masteryAncestors(gameData.mastery.skills,detailId!),children=list.filter(s=>s.requires.some((r:any)=>r.id===detailId));
            const related=new Set([detailId,...ancestors,...children.map(s=>s.id)]);
            wrap.classList.toggle("mastery-focused",!overview);
            wrap.innerHTML=`<div class="mastery-tools"><button type="button" data-map="fit">ดูทั้งผัง</button><button type="button" data-map="out" aria-label="ย่อผัง">−</button><output class="mastery-zoom" aria-label="ระดับซูม"></output><button type="button" data-map="in" aria-label="ขยายผัง">+</button><button type="button" data-map="focus">ดาวที่เลือก</button><label class="mastery-search"><span>ค้นหาสกิล</span><input type="search" placeholder="ชื่อสกิล / ID" aria-label="ค้นหาดาวสกิล"></label><div class="mastery-results" hidden></div></div><div class="mastery-viewport" tabindex="0" role="region" aria-label="ผังดวงดาว 147 สกิล ลากเพื่อเลื่อน ใช้ลูกศรเลื่อนและบวกลบซูม"><div class="mastery-world"><svg viewBox="0 0 3600 3600" aria-hidden="true"></svg><div class="mastery-center"><b>147</b><span>สกิล · 7 ศาสตร์</span></div><div class="mastery-stars"></div></div><div class="mastery-route-key">${overview?"ผังเดียวทุกศาสตร์ · เลือกดาวเพื่อดูเส้นทางเรียน":`<b>${names[viewJob!]}</b><span class="path-before">เส้นทึบ · ทางก่อนหน้า</span><span class="path-next">เส้นประ · สกิลถัดไป</span>`}</div><span class="mastery-map-hint">ลากเลื่อน · ล้อเมาส์ซูม · แตะดาวดูรายละเอียด</span></div>`;
            const viewport=wrap.querySelector<HTMLElement>(".mastery-viewport")!;
            const world=wrap.querySelector<HTMLElement>(".mastery-world")!;
            const nodes=constellation.nodes as Record<string,{x:number;y:number}>;
            world.querySelector("svg")!.innerHTML=[560,1100,1450].map(r=>`<circle class="mastery-ring" cx="1800" cy="1800" r="${r}"/>`).join("")+constellation.edges.map(e=>{
             const target=list.find(s=>s.id===e.to)!;

             const a=nodes[e.from],b=nodes[e.to],curve=masteryCurve(a,b),before=!overview&&(e.to===detailId||ancestors.has(e.to)),next=!overview&&e.from===detailId;
             const kind=before?"before":next?"next":"context",color=schoolColors[MASTERY_SCHOOLS.indexOf(target.school)];
             return `<path class="mastery-edge ${kind} ${level(e.from)>=e.rank?'met':''}" style="--school:${color}" data-edge-to="${e.to}" d="${curve.path}"/>${before||next?`<g class="mastery-edge-rank" data-edge-to="${e.to}" transform="translate(${curve.label.x},${curve.label.y})"><rect x="-21" y="-13" width="42" height="26" rx="9"/><text text-anchor="middle" dominant-baseline="central">R${e.rank}</text></g>`:""}`;
            }).join("");
            world.querySelector(".mastery-stars")!.innerHTML=list.map(s=>{
             const p=nodes[s.id],lv=level(s.id),lock=reason(s),state=lv?"learned":lock?"locked":"avail",color=schoolColors[MASTERY_SCHOOLS.indexOf(s.school)];
             return `<button type="button" class="mastery-star ${state}${!overview&&!related.has(s.id)?" unrelated":""}${s.passive?" passive":""}${s.id===detailId?" sel":""}${pending[s.id]?" pending":""}" data-sk="${s.id}" style="left:${p.x}px;top:${p.y}px;--school:${color}" draggable="${!s.passive&&!!job!.skills[s.id]}" aria-pressed="${s.id===detailId}" aria-label="${s.nameTh} ระดับ ${lv}/${s.maxLevel} ${lock||'เรียนได้'}" title="${s.nameTh} · ${lv}/${s.maxLevel}${lock?' · '+lock:''}">${icon(s)}<span class="mastery-star-name">${s.nameTh}</span><small>${lv}/${s.maxLevel}${s.passive?' · ติดตัว':''}</small></button>`;
            }).join("")+constellation.hubs.map((h,i)=>{
             const a=h.angle*Math.PI/180;return `<button type="button" class="mastery-school" data-school="${h.name}" style="left:${1800+Math.cos(a)*1640}px;top:${1800+Math.sin(a)*1640}px;--school:${schoolColors[i]}">${names[h.name]}<small>Mastery ${job!.masteries[h.name]??0}</small></button>`;
            }).join("");
            function choose(id:string){
             const s=list.find(s=>s.id===id);if(!s)return;
             detailId=id;viewJob=s.school;mapTarget=id;
             if(!s.passive&&job?.skills[id]){selected=id;$("#skills-status").textContent=`เลือกช่องด้านล่างเพื่อวาง ${s.nameTh}`;}
             else selected=null;
             draw();
             if(matchMedia('(max-width:650px)').matches)tree.querySelector('.sk-detail')?.scrollIntoView({block:'nearest'});
            }
            wrap.querySelectorAll<HTMLButtonElement>("[data-sk]").forEach(node=>{
             node.onclick=()=>choose(node.dataset.sk!);
             node.ondragstart=e=>{document.body.classList.add('dragging-hotbar');e.dataTransfer?.setData('text/plain',node.dataset.sk!);};
             node.ondragend=()=>document.body.classList.remove('dragging-hotbar');
             node.onfocus=()=>{
              const p=nodes[node.dataset.sk!],c=camera.state,x=p.x*c.scale+c.x,y=p.y*c.scale+c.y;
              if(c.scale<.53||x<40||y<40||x>viewport.clientWidth-40||y>viewport.clientHeight-40){camera.focus(p.x,p.y,viewport.clientWidth,viewport.clientHeight);paintCamera();}
             };
            });
            wrap.querySelectorAll<HTMLButtonElement>("[data-school]").forEach(b=>b.onclick=()=>{viewJob=b.dataset.school!;selected=null;draw();});
            wrap.querySelectorAll<HTMLButtonElement>("[data-map]").forEach(b=>b.onclick=()=>{
             const w=viewport.clientWidth,h=viewport.clientHeight;
             if(b.dataset.map==="fit"){viewJob="all";mapTarget="all";selected=null;draw();}
             else if(b.dataset.map==="focus"){mapTarget=detailId;positionMap();}
             else{camera.zoom(b.dataset.map==="in"?1.25:.8,w/2,h/2,w,h);paintCamera();}
            });
            const results=wrap.querySelector<HTMLElement>(".mastery-results")!;
            wrap.querySelector<HTMLInputElement>("input")!.oninput=e=>{
             const q=(e.target as HTMLInputElement).value.trim().toLocaleLowerCase();
             results.replaceChildren();results.hidden=!q;
             if(!q)return;
             const found=list.filter(s=>(s.nameTh+s.id+names[s.school]).toLocaleLowerCase().includes(q));
             for(const s of found.slice(0,12)){const b=document.createElement("button");b.type="button";b.textContent=`${s.nameTh} · ${names[s.school]}`;b.onclick=()=>choose(s.id);results.append(b);}
             if(!found.length)results.textContent="ไม่พบสกิล";
            };
            viewport.addEventListener("wheel",e=>{e.preventDefault();const r=viewport.getBoundingClientRect();camera.zoom(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top,viewport.clientWidth,viewport.clientHeight);paintCamera();},{passive:false});
            let drag:{id:number;x:number;y:number}|null=null;
            viewport.onpointerdown=e=>{if((e.target as HTMLElement).closest("button"))return;drag={id:e.pointerId,x:e.clientX,y:e.clientY};viewport.setPointerCapture(e.pointerId);};
            viewport.onpointermove=e=>{if(!drag||e.pointerId!==drag.id)return;camera.pan(e.clientX-drag.x,e.clientY-drag.y,viewport.clientWidth,viewport.clientHeight);drag={id:e.pointerId,x:e.clientX,y:e.clientY};paintCamera();};
            viewport.onpointerup=viewport.onpointercancel=()=>{drag=null;};
            viewport.onkeydown=e=>{
             if(e.target!==viewport)return;
             const moves:Record<string,[number,number]>={ArrowLeft:[80,0],ArrowRight:[-80,0],ArrowUp:[0,80],ArrowDown:[0,-80]},w=viewport.clientWidth,h=viewport.clientHeight;
             if(moves[e.key])camera.pan(...moves[e.key],w,h);
             else if(e.key==="Home")camera.fit(w,h);
             else if(["+","=","-"].includes(e.key))camera.zoom(e.key==="-"?.8:1.25,w/2,h/2,w,h);
             else return;
             e.preventDefault();e.stopPropagation();paintCamera();
            };
            requestAnimationFrame(positionMap);
			const d = list.find((s) => s.id === detailId);
			if (d) {
				const lv = level(d.id),
					nextLv = Math.min(d.maxLevel, lv + 1),
					lock = reason(d),
					learned = job.skills[d.id] || 0,
					pips = Array.from({ length: d.maxLevel }, (_, i) => `<i class="${i < learned ? "on" : i < lv ? "new" : ""}"></i>`).join(""),
					reqs = d.requires.map((r: any) => `<button type="button" data-route="${r.id}" class="${level(r.id) >= r.level ? "ok" : "no"}">${level(r.id) >= r.level ? "✓" : "✗"} ${skills.find((s) => s.id === r.id)?.nameTh} R${r.level} ←</button>`).join(""),
					left = job.skillPoints - Object.values(pending).reduce((a, b) => a + b, 0);
				tree.querySelector(".sk-detail")!.innerHTML = `<div class="sk-dhead">${icon(d,"sk-big")}<div><h3>${d.nameTh}</h3><small>${d.passive ? "ติดตัว · ไม่ต้องกดใช้" : `กดใช้ · ${d.kind === "area" ? "วงกว้าง" : d.kind === "single" ? "เป้าเดียว" : "สนับสนุน"}`}</small><div class="sk-pips">${pips}</div></div><span class="sk-dlv">Lv ${lv}/${d.maxLevel}<small>${learned ? "เรียนแล้ว" : lock && lock !== "แต้มสกิลไม่พอ" ? "ยังไม่ปลด" : "เรียนได้"}</small></span></div>
					<button type="button" class="sk-learn primary" data-learn="${d.id}" ${lock ? "disabled" : ""}>${lock ? lock : lv ? "อัปเลเวล · ใช้ 1 แต้ม" : "เรียนสกิล · ใช้ 1 แต้ม"}</button>
                    <section class="mastery-steps"><h4>ต้องเรียนก่อน</h4><div class="sk-reqs">${reqs||"<span>เริ่มเรียนได้โดยไม่มีสกิลก่อนหน้า</span>"}</div>${children.length?`<h4>สกิลถัดไป</h4><div class="mastery-next">${children.map(s=>`<button type="button" data-route="${s.id}">${s.nameTh}<small>${s.requires.filter((r:any)=>r.id===d.id).map((r:any)=>`ต้อง R${r.level}`).join(" · ")} →</small></button>`).join("")}</div>`:""}</section>
                    ${!d.passive && d.type!=="heal" && d.percent > 0 ? damageHTML(d, lv, nextLv) : `<dl><dt>ตอนนี้</dt><dd>${lv ? values(d, lv) : "ยังไม่ได้เรียน"}</dd>${lv < d.maxLevel ? `<dt>ระดับถัดไป · Lv ${nextLv}</dt><dd class="skill-next">${values(d, nextLv)}</dd>` : ""}</dl>`}
					${d.plan?`${!d.legacyRuntime?`<p class="sk-note">${d.plan.note}</p>`:""}<p class="sk-note">Mastery ${d.school} ${d.plan.ranks[Math.max(0,nextLv-1)].mastery} · ${d.plan.weapon==='any'?'ทุกอาวุธ':d.plan.weapon==='sword'?'ดาบ':d.plan.weapon==='bow'?'ธนู':d.plan.weapon==='dagger'?'มีด':'มือเปล่า'}</p>`:""}
                    <div class="sk-reqs"><span class="${left > 0 ? "ok" : "no"}">${left > 0 ? "✓" : "✗"} แต้มสกิลเหลือ ${left}</span></div>

					`;
				tree.querySelectorAll<HTMLButtonElement>("[data-route]").forEach(b=>{
                 b.onclick=()=>choose(b.dataset.route!);
                });
				tree.querySelector<HTMLElement>("[data-learn]")!.onclick = () => { pending[d.id] = (pending[d.id] || 0) + 1; $("#skills-status").textContent=`เตรียมอัป ${d.nameTh} · กดยืนยันเรียนสกิลด้านล่าง`; draw(); };
			}
		}
		drawTail();
		if(focusedLearn)tree.querySelector<HTMLButtonElement>(`[data-learn="${focusedLearn}"]`)?.focus();
        else if(focusedSkill)tree.querySelector<HTMLButtonElement>(`[data-sk="${focusedSkill}"]`)?.focus({preventScroll:true});
	}
	/** Hotbar editor, Auto Spell slots and the confirm button: drawn under every view. */
	function drawTail(){
		$("#skill-slots").innerHTML = slotsHTML(true);
		bindSlots($("#skill-slots"));
        drawModes();
		$("#skills-confirm").toggleAttribute("disabled", !Object.keys(pending).length);
		drawKeys();
	}
	/** Hotbar key fields (shown in the settings window). Runs on every job update, not only with the skill book open. */
	function drawKeys() {
		if (!job) return;
		const keyStatus = (text: string) => ((document.querySelector("#key-status") ?? $("#skills-status")).textContent = text);
		$("#key-settings").innerHTML = (job.hotbar || [])
			.map(
				(s, i) =>
					`<label>ช่อง ${i + 1}<input data-key-slot="${i}" value="${keyLabel(s.key)}" aria-label="ปุ่มช่อง ${i + 1}" readonly></label>`,
			)
			.join("");
		$("#key-settings")
			.querySelectorAll<HTMLInputElement>("input")
			.forEach(
				(el) =>
					(el.onkeydown = (e) => {
						if(e.code==='Tab')return;
                        e.preventDefault();e.stopPropagation();
                        // Action keys are rebindable now: the live table says which codes they hold.
                        if(!BINDABLE_KEY.test(e.code)||takenByActions().includes(e.code)||job!.hotbar.some((s,i)=>i!==Number(el.dataset.keySlot)&&s.key===e.code)){keyStatus('ปุ่มนี้ถูกใช้อยู่แล้วหรือใช้ไม่ได้');return;}
						const next = job!.hotbar.map((s, i) => ({
							...s,
							key: i === Number(el.dataset.keySlot) ? e.code : s.key,
						}));
						send({ t: "hotbar", slots: next });
						keyStatus("กำลังบันทึกปุ่ม…");
					}),
			);
	}
	$("#skills-confirm").onclick = () => {
		for (const [id, count] of Object.entries(pending))
			for (let i = 0; i < count; i++) send({ t: "skillUp", id });
		pending = {};
		$("#skills-status").textContent = "กำลังยืนยันกับเซิร์ฟเวอร์…";
		draw();
	};
	$("#skills-cancel").onclick = () => {
		pending = {};
		selected = null;
		draw();
		$("#skills-status").textContent = "ยกเลิกตัวอย่างแล้ว";
	};
	$("#skills-close").onclick = () => panel.close();
	$("#angel-close").onclick = () => angel.close();
	$("#skills-more").onclick = () => {
		more = !more;
		document.body.classList.toggle("more-skills", more);
		bar.classList.toggle("show-extra", more);
		$("#skills-more").setAttribute("aria-expanded", String(more));
	};
	$("#skills-reset-keys").onclick = () => {
		if (job)
			send({
				t: "hotbar",
				slots: job.hotbar.map((s, i) => ({
					...s,
					key: "Digit" + ((i + 1) % 10),
				})),
			});
	};
	$("#angel-talk").onclick = () => {
		clear();
		choosing = null;
		angel.showModal();
		play("ui_open");
		drawAngel();
	};
	// Second-job branches the angel offers; the server re-checks job, level and distance.
	const BRANCH_NOTES: Record<string, string> = {
		guardian: "แนวหน้าโล่เหล็ก · ทนทาน ดึงศัตรู สะท้อนความเสียหาย",
		berserker: "ดาบคลั่งไม่ถอย · ตีแรง โจมตีหลายครั้ง ดูดเลือดจากศัตรู",
	};
	let choosing: string | null = null;
	function drawAngel() {
		if (!job) return;
		const current = jobsData.jobs.find((j) => j.id === job!.jobId);
		const branches = jobsData.jobs.filter((j) => j.tier === 2 && j.parent === job!.jobId);
		if (current?.tier === 2) {
			$("#angel-note").textContent = `เจ้าก้าวสู่เส้นทาง${current.nameTh}แล้ว ขอพรให้ดาบของเจ้าไม่สั่นคลอน`;
			$("#job-cards").innerHTML = "";
			return;
		}
		const ready = job.jobLevel >= 40;
		$("#angel-note").textContent = !branches.some((j) => j.available)
			? "เส้นทางอาชีพขั้นสองของเจ้ายังไม่เปิด"
			: !ready
				? `ข้าจะนำทางเจ้าสู่อาชีพขั้นสองที่ระดับอาชีพ 40 · ตอนนี้ ${job.jobLevel}`
				: choosing
					? `แน่ใจหรือไม่? เมื่อเป็น${branches.find((j) => j.id === choosing)?.nameTh}แล้วจะเปลี่ยนกลับไม่ได้ · กดอีกครั้งเพื่อยืนยัน`
					: "เลือกเส้นทางของเจ้า สกิลนักดาบทั้งหมดยังติดตัวไป";
		$("#job-cards").innerHTML = branches
			.map((j) => {
				const open = j.available && ready;
				const note = !j.available ? "ยังไม่เปิด" : !ready ? "ต้องการระดับอาชีพ 40" : choosing === j.id ? "กดเพื่อยืนยัน" : BRANCH_NOTES[j.id] || "";
				return `<button data-job="${j.id}" ${open ? "" : "disabled"} class="${choosing === j.id ? "choosing" : ""}"><b>${j.nameTh}</b><small>${note}</small></button>`;
			})
			.join("");
		$("#job-cards").querySelectorAll<HTMLButtonElement>("button[data-job]").forEach((b) => {
			b.onclick = () => {
				const id = b.dataset.job!;
				if (choosing !== id) {
					choosing = id;
					play("ui_open");
					drawAngel();
					return;
				}
				choosing = null;
				$("#angel-note").textContent = "ทูตสวรรค์กำลังประทานพร…";
				send({ t: "jobChange", job: id });
			};
		});
	}
	return {
		get open() {
			return panel.open || angel.open;
		},
		drawKeys,
		toggle() {
			if (panel.open) panel.close();
			else {
				clear();
				pending = {};
                viewJob=lastSchool;mapTarget="all";
				draw();
				panel.showModal();
				play("ui_open");
			}
		},
		key(code: string) {
			const s = job?.hotbar.find((s) => s.key === code);
			if (s?.skill) {
				if(!s.mode)act(s.skill);
				return true;
			}
			return !!s;
		},
		receive(e: any) {
			if (e.type === "skillsError") {
				$("#skills-status").textContent = e.text;
				$("#angel-note").textContent = e.text;
				return;
			}
			if (e.type === "stats" && e.derived) {
				const changed = !derived || derived.atk !== e.derived.atk || derived.matk !== e.derived.matk;
				derived = { atk: e.derived.atk, matk: e.derived.matk, weaponElement: e.derived.weaponElement };
				if (changed && !e.job && panel.open) draw();
			}
			if (e.type !== "stats" || !e.job) return;
			if (confirmedJob && confirmedJob !== e.job.jobId) play("job_change");
			confirmedJob = e.job.jobId;
			job = e.job;
			pending = {};
			$("#skills-button").classList.toggle("has-points", job!.skillPoints > 0);
			$("#skills-status").textContent =
				"ลากสกิล หรือแตะสกิลแล้วเลือกช่อง · คลิกขวาที่ช่องเพื่อล้าง";
			drawBar();
			drawKeys();
			const ks = document.querySelector("#key-status");
			if (ks?.textContent === "กำลังบันทึกปุ่ม…") ks.textContent = "บันทึกแล้ว";
			if (panel.open) draw();
			if (angel.open) drawAngel();
		},
		/** Briefly highlights the bar slots holding this potion (auto-potion fired). */
		flash(template: string) {
			flashUntil[template] = performance.now() + 900;
			bar.querySelectorAll<HTMLElement>(`[data-item="${template}"]`).forEach((el) => {
				el.classList.remove("auto-drank");
				void el.offsetWidth;
				el.classList.add("auto-drank");
			});
			setTimeout(() => {
				if ((flashUntil[template] ?? 0) <= performance.now() + 1) bar.querySelectorAll(`[data-item="${template}"]`).forEach((el) => el.classList.remove("auto-drank"));
			}, 900);
		},
		update(p: any) {
			inventory = p.inventory;

			const key =
				JSON.stringify([p.hotbar,p.skills,p.masteries,p.masteryExp,p.skillPoints]);
			if (p.jobId && key !== last) {
				last = key;
				job = {
					jobId: p.jobId,
					jobLevel: p.jobLevel,
					jobExp: p.jobExp,
					skillPoints: p.skillPoints,
					skills: p.skills,
					hotbar: p.hotbar,
                    masteryVersion:p.masteryVersion,masteries:p.masteries,masteryExp:p.masteryExp,
				};
				drawBar();
                if(panel.open)draw();
			}
			bar.querySelectorAll<HTMLElement>("[data-slot]").forEach((el) => {
				const id = job?.hotbar[Number(el.dataset.slot)].skill,
					cd = id ? p.cd[id.startsWith('item:')?'potion':id] || 0 : 0;
				el.classList.toggle('low-sp',!!id&&!id.startsWith('item:')&&p.mp<(job?.hotbar[Number(el.dataset.slot)].mode==='autoSpell'?resolveAutomaticSkill(gameData,id,Math.max(1,masteryAutoRank(p,id,gameData.mastery))):resolveSkill(gameData,id,p.skills[id]||1)).sp);
				if(id?.startsWith('item:')){
					const n=bagCount(p.inventory,id.slice(5)),count=el.querySelector('.slot-count');
					if(count&&count.textContent!==String(n))count.textContent=String(n);
					el.classList.toggle('out',n===0);
					el.style.setProperty('--cd-sweep',`${Math.min(1,cd/POTION_CD)*360}deg`);
				}
                el.classList.toggle("cooling", cd > 0.05);
				el.querySelector("em")!.textContent = cd > 0.05 ? cd.toFixed(1) : "";
			});
			const near =
				p.mapId === "city_plaza" && !p.dead && Math.hypot(p.x - jobsData.angel.x, p.z - jobsData.angel.z) <=
				jobsData.angel.range;
			$("#angel-talk").hidden = !near;

		},
	};
}
