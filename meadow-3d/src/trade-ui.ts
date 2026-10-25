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
	panel.innerHTML = `<header><span class="trade-emblem" aria-hidden="true">⇄</span><div><small class="trade-eyebrow">PLAYER TRADE</small><h2>แลกเปลี่ยน</h2><p class="trade-partner"></p></div><button type="button" class="trade-x" aria-label="ยกเลิกการแลก">×</button></header>
<ol class="trade-steps" aria-label="ขั้นตอนการแลก"><li>1 <span>เลือกของและทอง</span></li><li>2 <span>ล็อกทั้งสองฝ่าย</span></li><li>3 <span>ตรวจสอบและยืนยัน</span></li></ol>
<div class="trade-sides"><section class="trade-side trade-you" aria-label="สิ่งที่คุณจะส่ง"><div class="trade-side-head"><div><small>คุณจะส่ง</small><h3 class="trade-your-name"></h3></div><span class="trade-flag"></span></div><div class="trade-list-label">ไอเทม <span class="trade-count"></span></div><ul class="trade-items"></ul><div class="trade-money"><label class="trade-gold">ทองที่ส่ง <span><i aria-hidden="true">◈</i><input type="number" min="0" step="1" inputmode="numeric" value="0" aria-label="จำนวนทองที่ส่ง"></span></label><small class="trade-available"></small><small class="trade-bound"></small></div></section>
<section class="trade-side trade-them" aria-label="สิ่งที่คุณจะได้รับ"><div class="trade-side-head"><div><small>คุณจะได้รับ</small><h3 class="trade-them-name"></h3></div><span class="trade-flag"></span></div><div class="trade-list-label">ไอเทม <span class="trade-count"></span></div><ul class="trade-items"></ul><div class="trade-money"><span class="trade-money-label">ทองที่ได้รับ</span><p class="trade-gold-them"></p><small>ตรวจรายการของอีกฝ่ายก่อนยืนยัน</small></div></section></div>
<section class="trade-bag-section" aria-label="กระเป๋าสำหรับแลก"><div class="trade-bag-heading"><h3>เลือกของจากกระเป๋า</h3><small>กดไอเทมเพื่อเพิ่ม · เฉพาะของที่แลกได้</small></div><div class="trade-bag"></div></section>
<footer><p class="trade-hint" role="status" aria-live="polite"></p><div class="trade-actions"><button type="button" class="trade-cancel">ยกเลิก</button><button type="button" class="trade-lock">ล็อกรายการ</button><button type="button" class="trade-confirm primary">ยืนยันแลก</button></div><small class="trade-safety">ของและทองจะย้ายเมื่อทั้งสองฝ่ายยืนยันแล้วเท่านั้น</small></footer>`;
	document.querySelector("#ui")!.append(invites, panel);
	const $ = <T extends HTMLElement>(s: string) => panel.querySelector<T>(s)!;
	const goldInput = $<HTMLInputElement>(".trade-gold input"), hint = $(".trade-hint"), bag = $(".trade-bag");
	let view: TradeView | null = null;
	let offer: TradeOffer = { items: [], gold: 0 };
	let previousFocus: HTMLElement | null = null;
	const tip = document.createElement('div');
	// The top layer keeps details outside the scrolling offer list's clipping area.
	tip.id = 'trade-item-tip'; tip.className = 'trade-item-tip'; tip.popover = 'auto'; tip.setAttribute('role', 'tooltip');
	document.body.append(tip);
	let tipAnchor: HTMLButtonElement | null = null, tipPinned = false, tipTimer = 0;
	function hideTip() { clearTimeout(tipTimer); tip.hidePopover(); tipAnchor?.setAttribute('aria-expanded', 'false'); tipAnchor = null; tipPinned = false; }
	function inspectItem(button: HTMLButtonElement, heading: string, lines: string[], row: HTMLElement) {
		const show = () => {
			clearTimeout(tipTimer);
			if (tipAnchor !== button) { hideTip(); tipAnchor = button; }
			const title = document.createElement('strong'); title.textContent = heading;
			tip.replaceChildren(title, ...lines.map(line => { const p = document.createElement('p'); p.textContent = line; return p; }));
			tip.showPopover(); button.setAttribute('aria-expanded', 'true');
			const r = button.getBoundingClientRect(), box = tip.getBoundingClientRect();
			tip.style.left = `${Math.max(12, Math.min(r.left, innerWidth - box.width - 12))}px`;
			tip.style.top = `${Math.max(12, Math.min(r.bottom + 8, innerHeight - box.height - 12))}px`;
		};
		const leave = () => { if (!tipPinned) tipTimer = window.setTimeout(hideTip, 120); };
		button.setAttribute('aria-describedby', tip.id); button.setAttribute('aria-expanded', 'false');
		row.onpointerenter = e => { if (e.pointerType === 'mouse') show(); };
		row.onpointerleave = leave; button.onfocus = show; button.onblur = leave;
		button.onclick = () => { if (tipAnchor === button && tipPinned) hideTip(); else { show(); tipPinned = true; } };
	}
	tip.onpointerenter = () => clearTimeout(tipTimer);
	tip.onpointerleave = () => { if (!tipPinned) hideTip(); };
	tip.addEventListener('toggle', () => { if (!tip.matches(':popover-open')) { tipAnchor?.setAttribute('aria-expanded', 'false'); tipAnchor = null; tipPinned = false; } });

	const label = (templateId: string, qty: number, refine = 0) => {
		const t = template(templateId);
		return `${refine ? `+${refine} ` : ""}${t?.nameTh ?? "ไอเทม"}${qty > 1 ? ` ×${qty}` : ""}`;
	};
	const icon = (templateId: string) => itemIcon({ id: templateId });
	const send = (op: string, extra: Record<string, unknown> = {}) => options.send({ t: "trade", op, ...extra });
	const sendOffer = () => {
		const problem = offerProblem({ gold: options.player().gold,boundGold:options.player().boundGold, inventory: options.player().inventory! }, offer, data);
		hint.dataset.error = String(!!problem);
		hint.textContent = problem ?? 'กำลังอัปเดตรายการ…';
		$<HTMLButtonElement>('.trade-lock').disabled = !!problem || !!view?.you.locked || !!view?.settling;
		if (problem) return;
		send("offer", { items: offer.items, gold: offer.gold });
	};
	function list(target: HTMLElement, side: SideView, mine: boolean) {
		target.replaceChildren(...side.items.map((i) => {
			const li = document.createElement("li");
			const name = document.createElement("span");
			name.className = "trade-name";
			name.textContent = label(i.template, i.qty, i.refine);
			li.append(icon(i.template), name);
			const lines = [...itemRollLines(i), ...(i.cards.length ? [`การ์ด: ${i.cards.map(c => template(c)?.nameTh ?? c).join(', ')}`] : [])];
			if (lines.length) {
				const quality = document.createElement('small'); quality.className = 'trade-quality'; quality.textContent = i.roll ? lines[0] : i.cards.length ? 'มีการ์ดติดตั้ง' : 'เอฟเฟกต์พิเศษ';
				const inspect = document.createElement('button'); inspect.type = 'button'; inspect.className = 'trade-inspect'; inspect.textContent = 'ดูออฟ';
				inspect.setAttribute('aria-label', `ดูออฟทั้งหมดของ ${label(i.template, i.qty, i.refine)}`);
				inspectItem(inspect, `${mine ? 'คุณจะส่ง' : 'คุณจะได้รับ'} · ${label(i.template, i.qty, i.refine)}`, lines, li);
				name.append(quality, inspect);
			}
			if (mine && !side.locked) {
				const remove = document.createElement("button");
				remove.type = "button";
				remove.textContent = "เอาออก";
				remove.setAttribute('aria-label', `เอา ${label(i.template, i.qty, i.refine)} ออก`);
				remove.onclick = () => { offer = { ...offer, items: offer.items.filter((o) => o.id !== i.id) }; sendOffer(); };
				li.append(remove);
			}
			return li;
		}));
		if (!side.items.length) {
			const empty = document.createElement('li'); empty.className = 'empty';
			empty.textContent = mine ? 'ยังไม่ได้เลือกไอเทม · เพิ่มจากกระเป๋าด้านล่าง' : 'รออีกฝ่ายเลือกไอเทม';
			target.append(empty);
		}
	}
	/** Bag items that can still be offered (not worn, not bound, not already in the offer). */
	function renderBag() {
		const p = options.player(), offered = new Set(offer.items.map((o) => o.id));
		const items = (p.inventory?.items ?? []).filter((i: OwnedItem) => i.location === "bag" && !offered.has(i.id) && !i.bound && template(i.template)?.bind !== "account");
		bag.replaceChildren(...items.map((i) => {
			const card = document.createElement('div'); card.className = 'trade-bag-item';
			const b = document.createElement("button");
			b.type = "button";
			b.title = label(i.template, i.qty, i.refine);
			b.setAttribute('aria-label', `เพิ่ม ${label(i.template, 1, i.refine)} ในรายการแลก`);
			const name = document.createElement('span'); name.textContent = label(i.template, 1, i.refine);
			const have = document.createElement('small'); have.textContent = `มี ${i.qty.toLocaleString()}`;
			name.append(have); b.append(icon(i.template), name);
			b.disabled = !!view?.you.locked || offer.items.length >= TRADE_MAX_ITEMS;
			const qtyInput = document.createElement('input');
			qtyInput.type = 'number'; qtyInput.min = '1'; qtyInput.max = String(i.qty); qtyInput.step = '1'; qtyInput.value = '1';
			qtyInput.setAttribute('aria-label', `จำนวน ${label(i.template, 1, i.refine)} ที่จะแลก`);
			qtyInput.disabled = b.disabled;
			b.onclick = () => {
				if (i.qty > 1 && !qtyInput.reportValidity()) return;
				const qty = i.qty > 1 ? Number(qtyInput.value) : 1;
				offer = { ...offer, items: [...offer.items, { id: i.id, qty }] };
				sendOffer();
			};
			card.append(b); if (i.qty > 1) card.append(qtyInput);
			return card;
		}));
		if (!items.length) bag.textContent = "ไม่มีของที่แลกได้ · ของผูกตัวละครและของที่สวมอยู่ส่งต่อไม่ได้";
	}
	function render() {
		if (!view) return;
		hideTip();
		const { you, them } = view;
		if (panel.hidden) { previousFocus = document.activeElement as HTMLElement; panel.hidden = false; $('.trade-x').focus(); }
		$(".trade-partner").textContent = `กับ ${them.name}`;
		$('.trade-your-name').textContent = you.name;
		$(".trade-them-name").textContent = them.name;
		list($(".trade-you .trade-items"), you, true);
		list($(".trade-them .trade-items"), them, false);
		const flag = (s: SideView) => (s.confirmed ? "✓ ยืนยันแล้ว" : s.locked ? "✓ ล็อกแล้ว" : "กำลังเลือก");
		$(".trade-you .trade-flag").textContent = flag(you);
		$(".trade-them .trade-flag").textContent = flag(them);
		panel.classList.toggle("them-locked", them.locked);
		panel.classList.toggle('you-locked', you.locked);
		$('.trade-you .trade-count').textContent = `${you.items.length} / ${TRADE_MAX_ITEMS}`;
		$('.trade-them .trade-count').textContent = `${them.items.length} / ${TRADE_MAX_ITEMS}`;
		const step = you.locked && them.locked ? 2 : you.locked || them.locked ? 1 : 0;
		panel.querySelectorAll('.trade-steps li').forEach((el, n) => { if (n === step) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current'); });
		$(".trade-gold-them").textContent = `◈ ${them.gold.toLocaleString()}`;
		if (document.activeElement !== goldInput) goldInput.value = String(you.gold);
		goldInput.disabled = you.locked;
  const tradable=Math.max(0,options.player().gold-(options.player().boundGold??0));goldInput.max=String(tradable);
		$('.trade-available').textContent=`เทรดได้ ${tradable.toLocaleString()} ทอง`;
		$('.trade-bound').textContent=`ทองแจก ${(options.player().boundGold??0).toLocaleString()} · ใช้กับ NPC เท่านั้น`;
		$<HTMLButtonElement>(".trade-lock").disabled = you.locked || view.settling;
		$<HTMLButtonElement>(".trade-confirm").disabled = !you.locked || !them.locked || you.confirmed || view.settling;
		hint.dataset.error = 'false';
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
	panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (tip.matches(':popover-open')) hideTip(); else send('cancel'); } });

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
			if (m.t === "tradeClosed") { hideTip(); view = null; panel.hidden = true; offer = { items: [], gold: 0 }; if (previousFocus?.isConnected) previousFocus.focus(); if (!m.done) options.notice(m.reason); return true; }
			if (m.t === "tradeError") { if (view) { hint.textContent = m.text; hint.dataset.error = 'true'; } options.notice(m.text); return true; }
			if (m.t === "inv" && view) renderBag();
			return false;
		},
		get open() { return !panel.hidden; },
	};
}
