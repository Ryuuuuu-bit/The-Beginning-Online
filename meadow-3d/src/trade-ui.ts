import { loadGameData, offerProblem, TRADE_MAX_ITEMS, itemRollLines, type OwnedItem, type Player, type TradeOffer } from "@the-beginning-online/shared";
import { itemIcon } from "./item-icon";
import "./trade.css";

const data = loadGameData(), templates = data.items.items;
interface SideView { name: string; gold: number; locked: boolean; confirmed: boolean; items: Pick<OwnedItem,'id'|'template'|'qty'|'refine'|'cards'|'roll'>[] }
interface TradeView { id: string; settling: boolean; you: SideView; them: SideView }
const template = (id: string) => templates.find((t) => t.id === id);

/** Trade window: invite card, both offers side by side, lock → confirm. The server checks everything again. */
export function mountTrade(options: { send: (m: unknown) => void; player: () => Player; notice: (text: string) => void }) {
	const invites = document.createElement("div");
	invites.id = "trade-invites";
	const panel = document.createElement("section");
	panel.id = "trade-window";
	panel.setAttribute("role", "dialog");
	panel.setAttribute("aria-label", "แลกเปลี่ยนไอเทม");
	panel.hidden = true;
	panel.innerHTML = `<header><h2>แลกเปลี่ยน</h2><small class="trade-partner"></small><button type="button" class="trade-x" aria-label="ยกเลิกการแลก">×</button></header>
<div class="trade-sides"><div class="trade-side trade-you"><h3>ของคุณ <span class="trade-flag"></span></h3><ul class="trade-items"></ul><label class="trade-gold">ทอง <input type="number" min="0" step="1" inputmode="numeric" value="0"></label><small class="trade-available"></small></div>
<div class="trade-side trade-them"><h3><span class="trade-them-name"></span> <span class="trade-flag"></span></h3><ul class="trade-items"></ul><p class="trade-gold-them"></p></div></div>
<p class="trade-hint"></p><div class="trade-bag" aria-label="เลือกของจากกระเป๋า"></div>
<footer><button type="button" class="trade-lock">ล็อก</button><button type="button" class="trade-confirm primary">ยืนยันแลก</button><button type="button" class="trade-cancel">ยกเลิก</button></footer>`;
	document.querySelector("#ui")!.append(invites, panel);
	const $ = <T extends HTMLElement>(s: string) => panel.querySelector<T>(s)!;
	const goldInput = $<HTMLInputElement>(".trade-gold input"), hint = $(".trade-hint"), bag = $(".trade-bag");
	let view: TradeView | null = null;
	let offer: TradeOffer = { items: [], gold: 0 };

	const label = (templateId: string, qty: number, refine = 0) => {
		const t = template(templateId);
		return `${refine ? `+${refine} ` : ""}${t?.nameTh ?? "ไอเทม"}${qty > 1 ? ` ×${qty}` : ""}`;
	};
	const icon = (templateId: string) => itemIcon({ id: templateId });
	const send = (op: string, extra: Record<string, unknown> = {}) => options.send({ t: "trade", op, ...extra });
	const sendOffer = () => {
		const problem = offerProblem({ gold: options.player().gold,boundGold:options.player().boundGold, inventory: options.player().inventory! }, offer, data);
		if (problem) { hint.textContent = problem; return; }
		send("offer", { items: offer.items, gold: offer.gold });
	};
	function list(target: HTMLElement, side: SideView, mine: boolean) {
		target.replaceChildren(...side.items.map((i) => {
			const li = document.createElement("li");
			const name = document.createElement("span");
			name.className = "trade-name";
			name.textContent = label(i.template, i.qty, i.refine);
			li.append(icon(i.template), name);
			li.title=[...itemRollLines(i),...(i.cards.length?[`การ์ด: ${i.cards.map((c) => template(c)?.nameTh ?? c).join(', ')}`]:[])].join('\n');
			if(i.roll){const rolls=document.createElement('small');rolls.className='trade-rolls';rolls.textContent=itemRollLines(i).join(' · ');name.append(rolls);}
			if (mine && !side.locked) {
				const remove = document.createElement("button");
				remove.type = "button";
				remove.textContent = "เอาออก";
				remove.onclick = () => { offer = { ...offer, items: offer.items.filter((o) => o.id !== i.id) }; sendOffer(); };
				li.append(remove);
			}
			return li;
		}));
		for (let n = side.items.length; n < TRADE_MAX_ITEMS; n++) { const li = document.createElement("li"); li.className = "empty"; target.append(li); }
	}
	/** Bag items that can still be offered (not worn, not bound, not already in the offer). */
	function renderBag() {
		const p = options.player(), offered = new Set(offer.items.map((o) => o.id));
		const items = (p.inventory?.items ?? []).filter((i: OwnedItem) => i.location === "bag" && !offered.has(i.id) && !i.bound && template(i.template)?.bind !== "account");
		bag.replaceChildren(...items.map((i) => {
			const b = document.createElement("button");
			b.type = "button";
			b.title = label(i.template, i.qty, i.refine);
			b.append(icon(i.template));
			if (i.qty > 1) { const q = document.createElement("small"); q.textContent = String(i.qty); b.append(q); }
			b.disabled = !!view?.you.locked || offer.items.length >= TRADE_MAX_ITEMS;
			b.onclick = () => {
				let qty = 1;
				if (i.qty > 1) {
					const answer = prompt(`จำนวน ${template(i.template)?.nameTh} (มี ${i.qty})`, String(i.qty));
					if (answer === null) return;
					qty = Math.floor(Number(answer));
					if (!(qty >= 1 && qty <= i.qty)) { hint.textContent = "จำนวนไม่ถูกต้อง"; return; }
				}
				offer = { ...offer, items: [...offer.items, { id: i.id, qty }] };
				sendOffer();
			};
			return b;
		}));
		if (!items.length) bag.textContent = "ไม่มีของที่แลกได้ในกระเป๋า";
	}
	function render() {
		if (!view) return;
		const { you, them } = view;
		panel.hidden = false;
		$(".trade-partner").textContent = `กับ ${them.name}`;
		$(".trade-them-name").textContent = `ของ ${them.name}`;
		list($(".trade-you .trade-items"), you, true);
		list($(".trade-them .trade-items"), them, false);
		const flag = (s: SideView) => (s.confirmed ? "ยืนยันแล้ว" : s.locked ? "ล็อกแล้ว" : "");
		$(".trade-you .trade-flag").textContent = flag(you);
		$(".trade-them .trade-flag").textContent = flag(them);
		panel.classList.toggle("them-locked", them.locked);
		$(".trade-gold-them").textContent = `ทอง ${them.gold.toLocaleString()}`;
		if (document.activeElement !== goldInput) goldInput.value = String(you.gold);
		goldInput.disabled = you.locked;
  const tradable=Math.max(0,options.player().gold-(options.player().boundGold??0));goldInput.max=String(tradable);
  $('.trade-available').textContent=`เทรดได้ ${tradable.toLocaleString()} ทอง · ทองแจกใช้กับ NPC เท่านั้น`;
		$<HTMLButtonElement>(".trade-lock").disabled = you.locked || view.settling;
		$<HTMLButtonElement>(".trade-confirm").disabled = !you.locked || !them.locked || you.confirmed || view.settling;
		hint.textContent = view.settling ? "กำลังบันทึกการแลก…"
			: !you.locked ? "เลือกของจากกระเป๋าด้านล่าง แล้วกดล็อก"
			: !them.locked ? `รอ ${them.name} ล็อก`
			: you.confirmed ? `รอ ${them.name} ยืนยัน`
			: "ตรวจของอีกฝ่ายให้ดี แล้วกดยืนยันแลก";
		renderBag();
	}
	goldInput.onchange = () => {
		const gold = Math.max(0, Math.floor(Number(goldInput.value) || 0));
		offer = { ...offer, gold };
		sendOffer();
	};
	$(".trade-lock").onclick = () => send("lock");
	$(".trade-confirm").onclick = () => send("confirm");
	$(".trade-cancel").onclick = $(".trade-x").onclick = () => send("cancel");

	function invite(from: string) {
		const card = document.createElement("div");
		card.className = "party-invite trade-invite";
		card.setAttribute("role", "alertdialog");
		const text = document.createElement("p");
		text.textContent = `${from} ขอแลกของกับคุณ`;
		const yes = document.createElement("button"), no = document.createElement("button");
		yes.type = no.type = "button";
		yes.textContent = "แลก";
		no.textContent = "ไม่ล่ะ";
		const done = () => card.remove();
		yes.onclick = () => { send("accept"); done(); };
		no.onclick = () => { send("decline"); done(); };
		card.append(text, yes, no);
		invites.replaceChildren(card);
		setTimeout(done, 30000);
	}

	return {
		/** Ask `name` to trade (chat /trade or the player menu). */
		request(name: string) { send("request", { name }); },
		receive(m: any) {
			if (m.t === "tradeInvite") { invite(m.from); return true; }
			if (m.t === "tradeState") {
				view = m.trade;
				// The server's copy of my offer wins (it may have dropped an item I no longer hold).
				offer = { items: view!.you.items.map((i) => ({ id: i.id, qty: i.qty })), gold: view!.you.gold };
				render();
				return true;
			}
			if (m.t === "tradeClosed") { view = null; panel.hidden = true; offer = { items: [], gold: 0 }; if (!m.done) options.notice(m.reason); return true; }
			if (m.t === "tradeError") { if (view) hint.textContent = m.text; options.notice(m.text); return true; }
			if (m.t === "inv" && view) renderBag();
			return false;
		},
		get open() { return !panel.hidden; },
	};
}
