import {inventoryProfile} from './inventory.js';
import { deriveStats } from "./derive.js";
import { equipped, equippedCards, inventorySlots, inventoryWeight, type EconomyState, type LedgerEntry, type OwnedItem } from "./inventory.js";
import type { CharacterInput, GameData } from "./schema.js";

/** Player-to-player trade: each side offers up to TRADE_MAX_ITEMS bag entries plus gold. */
export const TRADE_MAX_ITEMS = 10;
/** Both players must stand this close to start a trade, and stay within TRADE_KEEP_RANGE until it completes. */
export const TRADE_START_RANGE = 6;
export const TRADE_KEEP_RANGE = 10;
export interface TradeOffer {
	items: { id: string; qty: number }[];
	gold: number;
}
export interface TradeSide {
	state: EconomyState;
	offer: TradeOffer;
	profile: CharacterInput;
}
export const emptyOffer = (): TradeOffer => ({ items: [], gold: 0 });

/** Thai error for an offer the player cannot make from this bag, or null. */
export function offerProblem(state: EconomyState, offer: TradeOffer, data: GameData): string | null {
	if (!Number.isSafeInteger(offer.gold) || offer.gold < 0) return "จำนวนทองไม่ถูกต้อง";
	if (offer.gold > state.gold) return "ทองไม่พอ";
	if (offer.items.length > TRADE_MAX_ITEMS) return `วางของได้สูงสุด ${TRADE_MAX_ITEMS} ชิ้น`;
	const seen = new Set<string>();
	for (const o of offer.items) {
		if (seen.has(o.id)) return "วางของซ้ำ";
		seen.add(o.id);
		const item = state.inventory.items.find((i) => i.id === o.id);
		if (!item || item.location !== "bag") return "ไอเทมนี้ไม่อยู่ในกระเป๋า";
		const t = data.items.items.find((t) => t.id === item.template);
		if (!t) return "ไม่พบชนิดไอเทม";
		// bind "equip" only binds once worn (item.bound); bind "account" never leaves the account.
		if (item.bound || t.bind === "account") return `${t.nameTh} แลกเปลี่ยนไม่ได้`;
		if (!Number.isSafeInteger(o.qty) || o.qty < 1 || o.qty > item.qty) return `${t.nameTh} มีไม่พอ`;
	}
	return null;
}

/**
 * Swaps both offers at once. Pure: returns both sides' new states and ledger rows, or throws a Thai error
 * (nothing changes). Unique items keep their id, refine and cards; stacks merge into the receiver's bag stack.
 */
export function applyTrade(a: TradeSide, b: TradeSide, data: GameData) {
	for (const side of [a, b]) {
		const problem = offerProblem(side.state, side.offer, data);
		if (problem) throw Error(problem);
	}
	const next = [structuredClone(a.state), structuredClone(b.state)] as const;
	const ledgers: [LedgerEntry[], LedgerEntry[]] = [[], []];
	const moving: [OwnedItem[], OwnedItem[]] = [[], []];
	[a, b].forEach((side, from) => {
		const inv = next[from].inventory;
		for (const o of side.offer.items) {
			const item = inv.items.find((i) => i.id === o.id)!;
			if (o.qty === item.qty) inv.items.splice(inv.items.indexOf(item), 1);
			else item.qty -= o.qty;
			moving[from].push({ ...item, qty: o.qty });
			ledgers[from].push({ kind: "trade_out", template: item.template, itemId: item.id, qty: -o.qty, goldDelta: 0 });
		}
		next[from].gold -= side.offer.gold;
	});
	[a, b].forEach((side, from) => {
		const to = 1 - from, inv = next[to].inventory;
		for (const item of moving[from]) {
			const t = data.items.items.find((t) => t.id === item.template)!;
			const stack = t.stackable ? inv.items.find((i) => i.template === item.template && i.location === "bag" && !i.bound) : undefined;
			if (stack) stack.qty += item.qty;
			else inv.items.push({ ...item, id: t.stackable ? "stack:" + item.template : item.id, location: "bag", slot: null, source: "trade" });
			ledgers[to].push({ kind: "trade_in", template: item.template, itemId: t.stackable ? undefined : item.id, qty: item.qty, goldDelta: 0 });
		}
		next[to].gold += side.offer.gold;
		if (side.offer.gold) {
			ledgers[from].push({ kind: "trade_out", qty: 0, goldDelta: -side.offer.gold });
			ledgers[to].push({ kind: "trade_in", qty: 0, goldDelta: side.offer.gold });
		}
	});
	// Capacity only blocks a side that ends up holding more than it may (someone already over can still give).
	[a, b].forEach((side, i) => {
		const state = next[i], before = [a, b][i].state, fail = (text: string) => Object.assign(Error(text), { side: i });
		if (state.gold > 2147483647) throw fail("ทองเกินขีดจำกัด");
		const slots = inventorySlots(state.inventory, data);
		if (slots > data.economy.inventorySlots && slots > inventorySlots(before.inventory, data)) throw fail("กระเป๋าเต็ม");
		const max = deriveStats(inventoryProfile(side.profile,state.inventory,data), data).weight, weight = inventoryWeight(state.inventory, data);
		if (weight > max && weight > inventoryWeight(before.inventory, data)) throw fail("น้ำหนักเกิน");
	});
	return { a: { state: next[0], ledger: ledgers[0] }, b: { state: next[1], ledger: ledgers[1] }, moved: moving };
}
