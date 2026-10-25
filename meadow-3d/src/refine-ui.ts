import { REFINE_MAX, refineMilestones, refineCapLines, REFINE_TABLE, rarityColors, ownedRarity, refineBase, refineBonusValue, refineKind, refineQuote, type GameData, type Inventory, type OwnedItem } from "@the-beginning-online/shared";
import "./refine.css";
import {modifierText} from "./card-text";

type Template = GameData["items"]["items"][number];
type Outcome = { ok: boolean; from: number; to: number } | { error: string };
const fmt = (n: number) => n.toLocaleString("en-US");
const SLOT_NAMES: Record<string, string> = { weapon: "อาวุธ", armour: "เกราะ", shield: "โล่", garment: "ผ้าคลุม", footgear: "รองเท้า" };
const statName = (stat: string) => (stat === "atk" ? "ATK" : stat === "matk" ? "MATK" : "DEF");
const HAMMER = '<svg viewBox="0 0 110 110" aria-hidden="true"><defs><linearGradient id="rf-hh" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f4f6f8"/><stop offset=".5" stop-color="#9aa6ad"/><stop offset="1" stop-color="#58646b"/></linearGradient><linearGradient id="rf-hw" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#8a5a32"/><stop offset="1" stop-color="#5a3a20"/></linearGradient></defs><g transform="rotate(-38 16 96)"><rect x="12" y="34" width="9" height="66" rx="4" fill="url(#rf-hw)"/><rect x="-10" y="10" width="54" height="30" rx="6" fill="url(#rf-hh)" stroke="#2c3438" stroke-width="2"/><rect x="-10" y="10" width="11" height="30" rx="3" fill="#dfe5e9"/><path d="M40 14v22" stroke="#f0c060" stroke-width="2" opacity=".8"/></g></svg>';
const RUNE = '<svg viewBox="-150 -150 300 300" aria-hidden="true"><g fill="none" stroke="#f0c070"><circle r="138" stroke-opacity=".55" stroke-width="2"/><circle r="122" stroke-opacity=".35" stroke-dasharray="3 9"/><circle r="92" stroke-opacity=".5"/>' + Array.from({ length: 12 }, (_, i) => `<path transform="rotate(${i * 30})" d="M0-138v16M-6-112l6-8 6 8" stroke-opacity=".75"/>`).join("") + '<path d="M0-92 80 46H-80Z" stroke-opacity=".4"/><path d="M0 92-80-46H80Z" stroke-opacity=".4"/></g></svg>';
const SAY = {
	idle: "เลือกอาวุธหรือเกราะที่อยากให้แกร่งขึ้น แล้ววางลงบนทั่งของข้า",
	safe: "ช่วงแรกสบายมาก ข้ารับประกันไม่พลาด",
	risky: "พลาดลดหนึ่งขั้น แต่เมื่อตีถึง +10 แล้ว จะไม่ตกต่ำกว่า +10",
	ok: "ฮ่า! ประกายสวย ของชิ้นนี้แกร่งขึ้นแล้ว",
	fail: "โลหะไม่ยอมรับ… ลองใหม่เมื่อพร้อม",
};

/** The forge's refine tab: pick gear, see the odds and cost, and watch the anvil. The server rolls the result. */
export function mountRefine(o: {
	data: GameData;
	itemIcon: (t: Template) => HTMLElement;
	/** Sends the refine request; resolves with the server's reply (new inventory or an error). */
	request: (id: string) => void;
	say: (text: string) => void;
	sound: (id: 'refine_hammer' | 'refine_success' | 'refine_fail') => void;
}) {
	const { data } = o;
	const root = document.createElement("div");
	root.className = "rf";
	root.id = "refine-panel";
	let selected: string | null = null, filter: "all" | "weapon" | "armour" = "all", busy = false;
	let inv: Inventory | undefined, gold = 0, settle: ((r: Outcome) => void) | null = null, revealShown = false;
	const log: { ok: boolean; text: string; at: number }[] = [];
	const template = (i: OwnedItem) => data.items.items.find((t) => t.id === i.template)!;
	const stones = (id: string) => inv?.items.filter((i) => i.template === id && i.location === "bag").reduce((n, i) => n + i.qty, 0) ?? 0;
	const refinable = () => (inv?.items ?? []).filter((i) => ["bag", "equip"].includes(i.location) && refineKind(template(i)));
	const el = (tag: string, cls = "", text = "") => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

	function picker() {
		const box = el("aside", "rf-pick");
		const chips = el("div", "rf-chips");
		for (const [key, label] of [["all", "ทั้งหมด"], ["weapon", "อาวุธ"], ["armour", "เกราะ"]] as const) {
			const b = el("button", "rf-chip" + (filter === key ? " on" : ""), label) as HTMLButtonElement;
			b.type = "button"; b.disabled = busy; b.onclick = () => { filter = key; render(); };
			chips.append(b);
		}
		box.append(chips);
		const items = refinable().filter((i) => filter === "all" || refineKind(template(i)) === filter);
		for (const [loc, label] of [["equip", "สวมอยู่"], ["bag", "ในกระเป๋า"]] as const) {
			const group = items.filter((i) => i.location === loc);
			if (!group.length) continue;
			box.append(el("div", "rf-grp", label));
			for (const i of group) {
				const t = template(i), b = el("button", "rf-it" + (i.id === selected ? " on" : "") + (i.refine >= REFINE_MAX ? " max" : "")) as HTMLButtonElement;
				b.type = "button"; b.disabled = busy && i.id !== selected;
				b.style.setProperty("--r", rarityColors[ownedRarity(i, t.rarity)]);
				const icon = el("span", "rf-box"); icon.append(o.itemIcon(t));
				const text = el("div"); text.append(el("b", "", t.nameTh), el("small", "", `${SLOT_NAMES[t.type] ?? ""}${i.refine >= REFINE_MAX ? " · สูงสุดแล้ว" : ""}`));
				b.append(icon, text, el("span", "rf-lv" + (i.refine ? "" : " zero"), `+${i.refine}`));
				b.onclick = () => { if (busy) return; selected = i.id; revealShown = false; render(); };
				box.append(b);
			}
		}
		if (!items.length) box.append(el("p", "rf-empty", "ไม่มีอุปกรณ์ที่ตีบวกได้ · ถอดออกจากคลังหรือซื้อจากร้านก่อน"));
		return box;
	}

	function anvil(item: OwnedItem | undefined) {
		const box = el("section", "rf-anvil");
		if (!item) { box.append(el("p", "rf-empty rf-hint", "เลือกอาวุธหรือเกราะจากรายการด้านซ้าย")); return box; }
		const t = template(item), quote = refineQuote(item, data), { stat, base } = refineBase(t), color = rarityColors[ownedRarity(item, t.rarity)];
		const value = (lv: number) => base + refineBonusValue(t, lv);
		const nm = el("div", "rf-nm"); const name = el("b", "", t.nameTh); name.style.color = color;
		nm.append(name, el("small", "", `${SLOT_NAMES[t.type] ?? ""} · ${item.location === "equip" ? "สวมอยู่" : "ในกระเป๋า"} · ${statName(stat)} +${t.type === "weapon" ? 4 : 3}% ของค่าฐานต่อระดับ (อย่างน้อย +1)`));
		const target = el("div", "rf-target"), slot = el("div", "rf-slot"); slot.style.setProperty("--r", color);
		slot.append(o.itemIcon(t), el("span", "rf-plus", `+${item.refine}`));
		target.append(slot);
		box.append(nm, target);
  const milestones=el("div","rf-milestones");milestones.append(el("h3","","ออฟพิเศษตีบวก"));
  for(const m of refineMilestones(t)){
   const active=item.refine>=m.level,loses=typeof quote!=="string"&&quote.failTo<m.level&&active;
   milestones.append(el("p",active?"active":"locked",`+${m.level} · ${modifierText(m.modifier)} · ${active?'ปลดล็อกแล้ว':'ยังไม่ปลดล็อก'}${loses?' · พลาดแล้วโบนัสขั้นนี้จะหาย':''}`));
  }
  for(const level of [5,10,15]){const lines=refineCapLines(t,level,data);if(lines.length)milestones.append(el('p',item.refine>=level?'active':'locked',`+${level} · ${lines.join(' · ')}`));}
  box.append(milestones);
		if (typeof quote === "string") { box.append(el("p", "rf-empty", quote)); return box; }
		const lvl = el("div", "rf-lvl"); lvl.append(el("span", "from", `+${item.refine}`), el("span", "arr", "→"), el("span", "to", `+${quote.next}`)); target.append(lvl);
		const stats = el("div", "rf-stats");
		stats.append(el("span", "", stat === "atk" ? "พลังโจมตี (ATK)" : stat === "matk" ? "พลังเวท (MATK)" : "พลังป้องกัน (DEF)"), el("b", "", String(value(item.refine))), el("i", "", "→"), el("em", "", `${value(quote.next)} (+${value(quote.next) - value(item.refine)})`));
		stats.append(el("span", "", "ค่าฐาน"), el("b", "", String(base)), el("i"), el("em", "dim", String(base)));
		const pct = Math.round(quote.chance * 100), tone = pct === 100 ? "ok" : pct >= 50 ? "warn" : "bad";
		const odds = el("div", "rf-odds"), ring = el("div", "rf-ring " + tone); ring.style.setProperty("--p", String(pct));
		const inner = el("div"); inner.append(el("b", "", `${pct}%`), el("small", "", "โอกาสสำเร็จ")); ring.append(inner);
		const out = el("div", "rf-out");
		const yes = el("p", "yes"); yes.append("สำเร็จ ", el("i", "", `→ +${quote.next}`), " ", el("b", "", `${statName(stat)} ${value(quote.next)}`)); out.append(yes);
		if (quote.chance < 1) { const no = el("p", "lose"); no.append("ล้มเหลว ", el("i", "", `→ +${quote.failTo}`), quote.failTo===item.refine?" คงระดับ · Safe Zone +10 · เสียหินและทอง":" ระดับลด 1 · เสียหินและทอง"); out.append(no); }
		else out.append(el("p", "safe", "ช่วงปลอดภัย · ไม่มีทางล้มเหลว"));
		odds.append(ring, out);
		const have = stones(quote.stone), stoneT = data.items.items.find((x) => x.id === quote.stone)!;
		const cost = el("div", "rf-cost");
		const c1 = el("div"); const s1 = el("span"); s1.append(el("b", "", `${stoneT.nameTh} ×1`), el("small", have ? "" : "short", have ? `มี ${have} ก้อน` : "ไม่มีหิน · ซื้อได้ที่แท็บ ซื้อ")); c1.append(o.itemIcon(stoneT), s1);
		const c2 = el("div"); const s2 = el("span"); s2.append(el("b", "", `${fmt(quote.gold)} ทอง`), el("small", gold < quote.gold ? "short" : "", gold < quote.gold ? "ทองไม่พอ" : `คงเหลือ ${fmt(gold - quote.gold)}`)); c2.append(el("span", "rf-coin", "◈"), s2);
		cost.append(c1, c2);
		const go = el("button", "rf-go", busy ? "กำลังตีบวก…" : `ตีบวก +${quote.next}`) as HTMLButtonElement;
		go.type = "button"; go.disabled = busy || !have || gold < quote.gold;
		go.onclick = () => strike(item);
		box.append(stats, odds, cost, go);
		if (item.location === "equip") box.append(el("p", "rf-sub", "อุปกรณ์ที่สวมอยู่ ค่าพลังเปลี่ยนทันทีหลังตีบวก · ต้องยืนคุยกับช่างตีเหล็ก"));
		o.say(quote.chance < 1 ? SAY.risky : SAY.safe);
		return box;
	}

	function side(item: OwnedItem | undefined) {
		const box = el("aside", "rf-side");
		box.append(el("h3", "", "โอกาสสำเร็จ"), el("p", "rf-hint", `ตีบวกได้สูงสุด +${REFINE_MAX}`));
		const tbl = el("div", "rf-tbl");
		tbl.append(el("span", "h", "ระดับ"), el("span", "h", "โอกาส"), el("span", "h pct", "%"));
		REFINE_TABLE.forEach(({ chance }, i) => {
			const lv = i + 1, pct = Math.round(chance * 100), cls = item && lv === item.refine + 1 ? " cur" : item && lv <= item.refine ? " done" : "";
			const bar = el("span", "bar" + cls); bar.style.setProperty("--p", String(pct)); bar.dataset.tone = pct === 100 ? "ok" : pct >= 50 ? "warn" : "bad"; bar.append(el("i"));
			tbl.append(el("b", cls.trim(), `+${lv}`), bar, el("span", "pct" + cls, `${pct}%`));
		});
		const legend = el("div", "rf-legend");
		legend.append(el("span", "ok", "+1–4 ปลอดภัย ไม่มีทางล้มเหลว"), el("span", "warn", "+5–7 ล้มเหลว ระดับลด 1"), el("span", "bad", "+8–10 เสี่ยงสูง ระดับลด 1"), el("span", "warn", "+11–15 พลาดลด 1 แต่ไม่ต่ำกว่า +10"));
		box.append(tbl, legend, el("h3", "", "ประวัติในรอบนี้"));
		const list = el("ul", "rf-log");
		for (const l of log.slice(0, 6)) { const li = el("li", l.ok ? "s" : "f"); li.append(el("b", "", l.ok ? "✓" : "✕"), l.text); list.append(li); }
		if (!log.length) list.append(el("li", "none", "ยังไม่ได้ตีบวก"));
		box.append(list);
		return box;
	}

	function render() {
		const items = refinable();
		if (!selected || !items.some((i) => i.id === selected)) selected = (items.find((i) => i.location === "equip" && refineKind(template(i)) === "weapon") ?? items[0])?.id ?? null;
		const item = items.find((i) => i.id === selected);
		if (!item) o.say(SAY.idle);
		root.replaceChildren(picker(), anvil(item), side(item));
	}

	/* ---------- Animation: dim + rune charge → stone → three strikes → freeze → reveal ---------- */
	const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
	async function strike(item: OwnedItem) {
		const quote = refineQuote(item, data);
		if (busy || typeof quote === "string") return;
		busy = true; revealShown = false;
		const from = item.refine, t = template(item);
		const answer = new Promise<Outcome>((resolve) => { settle = resolve; });
		o.request(item.id);
		render();
		const anv = root.querySelector<HTMLElement>(".rf-anvil")!, slot = anv.querySelector<HTMLElement>(".rf-slot")!, win = root.closest<HTMLElement>("dialog") ?? root;
		// Always plays (the player can click to skip), like the level-up fireflies: it is the reward moment.
		const fx = el("div", "rf-fx"); anv.append(fx);
		root.classList.add("forging");
		let skipped = false;
		const skip = el("button", "rf-skip", "คลิกเพื่อข้าม") as HTMLButtonElement; skip.type = "button"; anv.append(skip);
		anv.addEventListener("click", () => { skipped = true; }, { once: true });
		const box = anv.getBoundingClientRect(), scale = box.width / anv.offsetWidth || 1;
		const at = (e: Element) => { const r = e.getBoundingClientRect(); return [(r.left + r.width / 2 - box.left) / scale, (r.top + r.height / 2 - box.top) / scale]; };
		const [sx, sy] = at(slot), [cx, cy] = at(anv.querySelector(".rf-cost .item-icon") ?? slot);
		const put = (cls: string, x: number, y: number, html = "") => { const e = el("div", cls); e.style.left = x + "px"; e.style.top = y + "px"; e.innerHTML = html; fx.append(e); return e; };
		const anim = (e: Element, k: Keyframe[], opt: KeyframeAnimationOptions) => e.animate(k, { fill: "forwards", ...opt });
		const shake = (px: number, ms: number) => win.animate(Array.from({ length: 7 }, (_, i) => ({ transform: i === 6 ? "none" : `translate(${(Math.random() - 0.5) * px * 2}px,${(Math.random() - 0.5) * px * 2}px)` })), { duration: ms, easing: "ease-out" });
		const play = async () => {
			if (skipped) return;
			const veil = put("rf-veil", 0, 0); veil.style.setProperty("--vx", sx + "px"); veil.style.setProperty("--vy", sy + "px"); anim(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
			const rune = put("rf-rune", sx, sy, RUNE);
			anim(rune, [{ opacity: 0, transform: "scale(.6) rotate(-40deg)" }, { opacity: 1, transform: "scale(1) rotate(0deg)" }], { duration: 500, easing: "cubic-bezier(.2,1.3,.4,1)" });
			rune.animate([{ rotate: "0deg" }, { rotate: "360deg" }], { duration: 6000, iterations: Infinity });
			const stone = put("rf-stone", cx, cy); stone.append(o.itemIcon(data.items.items.find((x) => x.id === quote.stone)!));
			const mid = [(cx + sx) / 2, Math.min(cy, sy) - 110];
			anim(stone, [{ left: cx + "px", top: cy + "px", transform: "scale(1)" }, { left: mid[0] + "px", top: mid[1] + "px", transform: "scale(1.5) rotate(180deg)" }, { left: sx + "px", top: sy + "px", transform: "scale(.2) rotate(400deg)", opacity: 0.2 }], { duration: 650, easing: "cubic-bezier(.4,0,.6,1)" });
			for (let i = 0; i < 8; i++) { const k = (i + 1) / 9, x = (1 - k) ** 2 * cx + 2 * (1 - k) * k * mid[0] + k * k * sx, y = (1 - k) ** 2 * cy + 2 * (1 - k) * k * mid[1] + k * k * sy; anim(put("rf-trail", x, y), [{ opacity: 0 }, { opacity: 0.95, offset: 0.3 }, { opacity: 0, transform: "scale(.3)" }], { duration: 520, delay: i * 65 }); }
			for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, d = 170 + Math.random() * 90; anim(put("rf-mote", sx + Math.cos(a) * d, sy + Math.sin(a) * d), [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { left: sx + "px", top: sy + "px", opacity: 0, transform: "scale(.4)" }], { duration: 700 + Math.random() * 300, delay: 200 + Math.random() * 400, easing: "cubic-bezier(.6,0,.9,.6)" }); }
			await wait(650); if (skipped) return;
			stone.remove(); slot.classList.add("charging");
			anim(put("rf-wave", sx, sy), [{ opacity: 0.8, transform: "scale(.3)" }, { opacity: 0, transform: "scale(1.2)" }], { duration: 450 });
			await wait(350); if (skipped) return;
			const hammer = put("rf-hammer", sx + 46, sy - 14, HAMMER);
			for (let k = 0; k < 3; k++) {
				const last = k === 2, power = [1, 1.4, 2.2][k];
				await anim(hammer, [{ transform: "scale(1.35) rotate(0deg)" }, { transform: `scale(1.35) rotate(${last ? -85 : -50}deg)`, offset: 0.6 }, { transform: "scale(1.35) rotate(20deg)" }], { duration: last ? 520 : 300, easing: "cubic-bezier(.5,0,.9,.4)" }).finished;
				if (skipped) return;
				anim(put("rf-flash", sx, sy), [{ opacity: 1, transform: "scale(.4)" }, { opacity: 0, transform: `scale(${1 + power * 0.4})` }], { duration: 300 + power * 80, easing: "ease-out" });
				o.sound('refine_hammer');
				for (let w = 0; w < (last ? 3 : 1); w++) anim(put("rf-wave", sx, sy), [{ opacity: 0.95, transform: "scale(.3)" }, { opacity: 0, transform: `scale(${1.2 + power * 0.7 + w * 0.5})` }], { duration: 520 + w * 140, delay: w * 70, easing: "cubic-bezier(.1,.7,.3,1)" });
				for (let i = 0; i < Math.round(12 * power); i++) {
					const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6, d = 70 + Math.random() * 110 * power, sp = put("rf-spark", sx - 12, sy + 8);
					sp.style.transform = `rotate(${a + Math.PI / 2}rad)`;
					anim(sp, [{ opacity: 1, left: sx - 12 + "px", top: sy + 8 + "px" }, { opacity: 1, left: sx - 12 + Math.cos(a) * d * 0.7 + "px", top: sy + 8 + Math.sin(a) * d * 0.7 + "px", offset: 0.6 }, { opacity: 0, left: sx - 12 + Math.cos(a) * d + "px", top: sy + 8 + Math.sin(a) * d + 90 + "px" }], { duration: 600 + Math.random() * 350, easing: "cubic-bezier(.1,.6,.4,1)" });
				}
				shake(3 * power, last ? 420 : 220);
				anim(slot, [{ transform: "scale(1)" }, { transform: `scale(${1 - 0.04 * power})` }, { transform: "scale(1)" }], { duration: 180 });
				slot.classList.toggle("hot", k === 1); slot.classList.toggle("molten", k === 2);
				if (last) { hammer.getAnimations().forEach((a) => a.pause()); anim(put("rf-white", 0, 0), [{ opacity: 0 }, { opacity: 0.95, offset: 0.25 }, { opacity: 0 }], { duration: 650, easing: "ease-out" }); await wait(520); return; }
				await anim(hammer, [{ transform: "scale(1.35) rotate(20deg)" }, { transform: "scale(1.35) rotate(0deg)" }], { duration: 150 }).finished;
				if (skipped) return;
				await wait(70);
			}
		};
		const [result] = await Promise.all([answer, play()]);
		settle = null; busy = false;
		root.classList.remove("forging");
		if ("error" in result) { revealShown = false; render(); return; }
		log.unshift({ ok: result.ok, text: `${t.nameTh} +${from} → +${result.to}`, at: Date.now() });
		revealShown = true; render();
		reveal(item.id, result, t);
	}

	function reveal(id: string, r: { ok: boolean; from: number; to: number }, t: Template) {
		const anv = root.querySelector<HTMLElement>(".rf-anvil"); if (!anv) return;
		const item = inv?.items.find((i) => i.id === id);
		const { stat, base } = refineBase(t), value = (lv: number) => base + refineBonusValue(t, lv);
		const box = el("div", "rf-result anim" + (r.ok ? "" : " fail"));
		const slot = el("div", "rf-slot"); slot.style.setProperty("--r", rarityColors[ownedRarity(item, t.rarity)]);
		slot.append(o.itemIcon(t), el("span", "rf-plus", `+${r.to}`)); if (!r.ok) slot.append(el("span", "rf-crack"));
		const p = el("p"); p.append(el("b", "", t.nameTh), ` ${statName(stat)} ${value(r.from)} → `, el("b", r.ok ? "up" : "down", String(value(r.to))));
		const row = el("div", "rf-row");
		const q = item ? refineQuote(item, data) : "";
		const again = el("button", "rf-go" + (r.ok ? "" : " again"), typeof q === "string" ? "ปิด" : `${r.ok ? "ตีต่อ" : "ลองอีกครั้ง"} +${q.next} · ${Math.round(q.chance * 100)}%`) as HTMLButtonElement;
		again.type = "button"; again.onclick = () => { box.remove(); if (item && typeof q !== "string") strike(item); };
		const close = el("button", "rf-go again", "ปิด") as HTMLButtonElement; close.type = "button"; close.onclick = () => { revealShown = false; box.remove(); };
		row.append(again, close);
		box.append(slot, el("h3", "", r.ok ? `สำเร็จ! +${r.to}` : "ล้มเหลว…"), p, row);
		anv.append(box);
		o.sound(r.ok ? 'refine_success' : 'refine_fail');
		o.say(r.ok ? SAY.ok : SAY.fail);
		const rb = box.getBoundingClientRect(), sb = slot.getBoundingClientRect(), scale = rb.width / box.offsetWidth || 1;
		const x = (sb.left + sb.width / 2 - rb.left) / scale, y = (sb.top + sb.height / 2 - rb.top) / scale, win = root.closest<HTMLElement>("dialog") ?? root;
		const add = (cls: string, text = "") => { const e = el("div", cls, text); e.style.left = x + "px"; e.style.top = y + "px"; box.prepend(e); return e; };
		const stamp = el("div", "rf-stamp" + (r.ok ? "" : " bad"), `+${r.to}`); stamp.style.top = y + "px"; box.append(stamp);
		stamp.animate([{ opacity: 0, transform: "translate(-50%,-50%) scale(3.2)", filter: "blur(8px)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(.92)", filter: "blur(0)", offset: 0.35 }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.5 }, { opacity: 0, transform: "translate(-50%,-90%) scale(1.15)" }], { duration: 1300, fill: "forwards", easing: "ease-out" });
		if (r.ok) {
			add("rf-rays").animate([{ opacity: 0, transform: "scale(.4) rotate(0deg)" }, { opacity: 1, transform: "scale(1.1) rotate(30deg)", offset: 0.25 }, { opacity: 0.6, transform: "scale(1.15) rotate(120deg)" }], { duration: 3200, fill: "forwards", easing: "ease-out" });
			const pillar = add("rf-pillar"); pillar.style.top = "-40px";
			pillar.animate([{ opacity: 0, transform: "scaleX(.1)" }, { opacity: 1, transform: "scaleX(1.2)", offset: 0.15 }, { opacity: 0, transform: "scaleX(.4)" }], { duration: 1400, fill: "forwards", easing: "ease-out" });
			for (let i = 0; i < 40; i++) add("rf-ember").animate([{ opacity: 0, transform: "translate(0,0)" }, { opacity: 1, offset: 0.15 }, { opacity: 0, transform: `translate(${(Math.random() - 0.5) * 360}px,${-180 - Math.random() * 220}px)` }], { duration: 1400 + Math.random() * 1400, delay: Math.random() * 600, fill: "both", easing: "cubic-bezier(.2,.6,.4,1)" });
			win.animate([{ boxShadow: "0 0 0 2px rgba(255,220,150,.9),0 0 90px rgba(255,200,110,.55)" }, { boxShadow: "0 0 0 0 rgba(255,220,150,0)" }], { duration: 1400, easing: "ease-out" });
		} else {
			const red = el("div", "rf-red"); box.prepend(red); red.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0 }], { duration: 900, fill: "forwards" });
			win.animate(Array.from({ length: 9 }, (_, i) => ({ transform: i === 8 ? "none" : `translate(${(Math.random() - 0.5) * 16}px,${(Math.random() - 0.5) * 12}px)` })), { duration: 500, easing: "ease-out" });
			for (let i = 0; i < 16; i++) { const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 120; add("rf-shard").animate([{ opacity: 1, transform: "translate(0,0) rotate(0deg)" }, { opacity: 0, transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d + 80}px) rotate(${Math.random() * 540}deg)` }], { duration: 700 + Math.random() * 400, fill: "forwards", easing: "cubic-bezier(.2,.6,.5,1)" }); }
			for (let i = 0; i < 6; i++) add("rf-smoke").animate([{ opacity: 0, transform: "translate(0,0) scale(.5)" }, { opacity: 0.8, offset: 0.2 }, { opacity: 0, transform: `translate(${(Math.random() - 0.5) * 80}px,-140px) scale(2.2)` }], { duration: 1800, delay: i * 120, fill: "both" });
		}
	}

	return {
		root,
		/** Redraws unless an attempt or its result is on screen (that would wipe the animation). */
		update(next: Inventory, nextGold: number, answered = false) {
			const before = selected ? inv?.items.find((i) => i.id === selected)?.refine : undefined;
			inv = next; gold = nextGold;
			if (settle && selected) {
				const after = next.items.find((i) => i.id === selected)?.refine;
				if (before !== undefined && after !== undefined && (answered || after !== before)) { settle({ ok: after > before, from: before, to: after }); return; }
			}
			if (!busy && !revealShown) render();
		},
		/** The server answered without a level change: an error, or a no-op. */
		failed(error: string) { settle?.({ error }); },
		reset() { revealShown = false; log.length = 0; },
	};
}
