import { deriveStats } from "./derive.js";
import {levelReward,validateRewardLevels} from './level-rewards.js';
import {craftQuote,salvageQuote,FORGE_FRAGMENT} from './crafting.js';
import type { CharacterInput, GameData, Monster } from "./schema.js";
import { refineModifiers, refineQuote } from './refine.js';
import { requiredEquipmentLevel, rolledModifiers, rollEquipment, validateItemRoll, starterUnique, isRolledTemplate, STARTER_CARD_TEXT, type ItemRoll, type LootItem } from './item-rolls.js';

export type ItemLocation =
	| "bag"
	| "equip"
	| "storage"
	| "mail"
	| "escrow"
	| "market"
	| "auction";
export interface OwnedItem {
	id: string;
	template: string;
	qty: number;
	location: ItemLocation;
	slot: string | null;
	refine: number;
	cards: string[];
	bound: boolean;
	source: string;
	/** Card slots the forge added on top of the template's own (0 when absent). */
	sockets?: number;
	roll?: ItemRoll;
}
export interface Inventory {
	version: 1;
	items: OwnedItem[];
	autoPickup: boolean;
}
export interface EconomyState {
	gold: number;
	inventory: Inventory;
}
export interface InventoryOp {
	op:
		| "buy"
		| "sell"
		| "equip"
		| "unequip"
		| "use"
		| "discard"
		| "pickup"
		| "settings"
		| "store"
		| "retrieve"
		| "quest"
		| "admin"
		| "card"
		| "socket"
		| "refine"
		| "craft"
		| "salvage"
		| "levelReward";
	/** Server-only level-mail delivery; clients cannot submit inventory operations of this kind. */
	levels?: number[];
	/** Filled from persisted receipts by the server, never accepted from a client. */
	legacyLevels?: number[];
	template?: string;
	id?: string;
	/** Physical destination; item templates keep accessory1 for either ring slot. */
	slot?: string;
	qty?: number;
	ids?: string[];
	/** An atomic sale with a separate quantity for each owned item. */
	items?: {id:string;qty:number}[];
	shop?: string;
	gold?: number;
		loot?: LootItem[];
	/** Quest turn-in: items granted after `loot` (items required) are taken. */
	reward?: { template: string; qty: number }[];
	on?: boolean;
	/** Card insertion: the card item placed into equipment `id`. */
	card?: string;
	/** Refine: the server's random draw in [0, 1); never taken from the client. */
	roll?: number;
}
export interface LedgerEntry {
	kind: string;
	template?: string;
	itemId?: string;
	qty: number;
	goldDelta: number;
}
export const rarityColors = {
	common: "#ffffff",
	fine: "#79b6ec",
	rare: "#edc369",
	epic: "#c697ed",
	legendary: "#ef5350",
};
const missingTemplates=new Set<string>();
function knownTemplate(data:GameData,id:string){const t=data.items.items.find(t=>t.id===id);if(!t&&!missingTemplates.has(id)){missingTemplates.add(id);console.error('Missing item template',id);}return t;}
export function inventoryWeight(inv: Inventory, data: GameData) {
	return inv.items
		.filter((i) => i.location === "bag" || i.location === "equip")
		.reduce(
			(n, i) =>
				n + (knownTemplate(data,i.template)?.weight??0) * i.qty,
			0,
		);
}
export function inventorySlots(inv: Inventory, data: GameData) {
	return inv.items
		.filter((i) => i.location === "bag")
		.reduce(
			(n, i) =>
				n +
				Math.ceil(
					i.qty / (knownTemplate(data,i.template)?.maxStack??Infinity),
				),
			0,
		);
}
/** Slots used in storage: one per stack (split by max stack) or per unique item. */
export function storageSlots(inv: Inventory, data: GameData) {
	return inv.items
		.filter((i) => i.location === "storage")
		.reduce((n, i) => n + Math.ceil(i.qty / (knownTemplate(data, i.template)?.maxStack ?? Infinity)), 0);
}
export const storageStackId = (template: string) => "stack:storage:" + template;
export function equipped(inv: Inventory) {
	return inv.items.filter((i) => i.location === "equip").map((i) => i.template);
}
/** Cards inserted in worn equipment; their modifiers count towards the stats. */
export function equippedCards(inv: Inventory) {
	return inv.items.filter((i) => i.location === "equip").flatMap((i) => i.cards);
}
/** Physical sockets are checked here, including forge-added slots. Keep base profile modifiers separate. */
export function inventoryProfile(profile:CharacterInput,inv:Inventory,data:GameData):CharacterInput {
 const seen=new Set<string>();
 const modifiers=inv.items.filter(i=>i.location==='equip').flatMap(i=>{
  const t=knownTemplate(data,i.template);if(!t)return [];
  if(i.cards.length>cardSlots(i,data))throw Error('ช่องการ์ดเกินขีดจำกัด');
  return [...rolledModifiers(i),...refineModifiers(i,t),...i.cards.flatMap(id=>{
   const card=data.cards.cards.find(c=>c.id===id);if(!card||card.slot!==t.type)throw Error('การ์ดไม่ตรงชนิดอุปกรณ์');
   if(STARTER_CARD_TEXT[id]&&seen.has(id))return [];seen.add(id);return card.modifiers;
  })];
 });
 const weapon=inv.items.find(i=>i.location==='equip'&&knownTemplate(data,i.template)?.type==='weapon');
 return {...profile,weaponRefine:weapon?.refine??0,equipment:equipped(inv),cards:[],modifiers:[...(profile.modifiers??[]),...modifiers]};
}
/** Why `card` cannot go into `target`, or null. Cards stay in the item for good (no removal yet). */
export function cardProblem(card: OwnedItem, target: OwnedItem, data: GameData): string | null {
	const spec = data.cards.cards.find((c) => c.id === card.template), t = knownTemplate(data, target.template);
	if (!spec || card.location !== "bag") return "เลือกการ์ดจากกระเป๋า";
	if (!t?.slot || !["bag", "equip"].includes(target.location)) return "เลือกอุปกรณ์ของคุณ";
	if (t.type !== spec.slot) return `การ์ดนี้ใส่ได้เฉพาะ${CARD_SLOT_NAMES[spec.slot]}`;
	const slots = cardSlots(target, data);
	if (target.cards.length >= slots) return slots ? "ช่องการ์ดเต็มแล้ว" : "อุปกรณ์นี้ไม่มีช่องการ์ด · ให้ช่างตีเหล็กเจาะช่องก่อน";
	return null;
}
/** Card slots of one owned item: the template's plus any the forge added. */
export function cardSlots(item: OwnedItem, data: GameData) {
	return (knownTemplate(data, item.template)?.slots ?? 0) + (item.sockets ?? 0);
}
/** The forge's price for one card slot in this item, or a Thai reason it cannot be socketed. */
export function socketPrice(item: OwnedItem, data: GameData): { gold: number; material: string; qty: number } | string {
	const t = knownTemplate(data, item.template);
	if (!t?.slot) return "เจาะช่องได้เฉพาะอุปกรณ์";
	if (starterUnique(t.id)) return "Unique ชุดนี้ไม่มีช่องการ์ด";
	if (cardSlots(item, data) > 0) return "อุปกรณ์นี้มีช่องการ์ดแล้ว";
	const tier = data.economy.socketing.find((s) => requiredEquipmentLevel(t.level,item) <= s.maxLevel) ?? data.economy.socketing.at(-1)!;
	return { gold: tier.gold, material: tier.material, qty: tier.qty };
}
export const CARD_SLOT_NAMES: Record<string, string> = { weapon: "อาวุธ", armour: "ชุดเกราะ", shield: "โล่", garment: "ผ้าคลุม", footgear: "รองเท้า", accessory: "เครื่องประดับ" };
export function equipmentSlots(templateSlot: string | null): string[] {
	return templateSlot === 'accessory1' ? ['accessory1', 'ring2'] : templateSlot ? [templateSlot] : [];
}
export function equipmentTarget(inv: Inventory, templateSlot: string | null, requested?: string): string {
	const slots = equipmentSlots(templateSlot);
	if (!slots.length || (requested !== undefined && !slots.includes(requested))) throw Error('ช่องอุปกรณ์ไม่ตรงชนิดไอเทม');
	return requested ?? slots.find(slot => !inv.items.some(i => i.location === 'equip' && i.slot === slot)) ?? slots[0];
}
/** The strongest bag potion with this effect ("hp" heals, "sp" restores MP). */
export function bestPotion(inv: Inventory, data: GameData, effect: "hp" | "sp") {
	return inv.items
		.filter(
			(i) =>
				i.location === "bag" &&
				data.items.items.find((t) => t.id === i.template)?.effect === effect,
		)
		.sort(
			(a, b) =>
				data.items.items.find((t) => t.id === b.template)!.amount! -
				data.items.items.find((t) => t.id === a.template)!.amount!,
		)[0];
}
export function redPotion(inv: Inventory, data: GameData) {
	return bestPotion(inv, data, "hp");
}
export function starterInventory(
	potions: number,
	uuid: () => string,
): Inventory {
	return {
		version: 1,
		autoPickup: true,
		items: [
			{
				id: uuid(),
				template: "traveler_clothes",
				qty: 1,
				location: "equip",
				slot: "body",
				refine: 0,
				cards: [],
				bound: false,
				source: "migration",
			},
			...['training_sword', 'training_greatsword', 'reed_dagger', 'wood_staff', 'bamboo_bow', 'training_knuckles'].map((template): OwnedItem => ({
				id: uuid(), template, qty: 1, location: 'bag', slot: null,
				refine: 0, cards: [], bound: false, source: 'migration',
			})),
			...(potions > 0
				? [
						{
							id: "stack:red_small",
							template: "red_small",
							qty: potions,
							location: "bag" as const,
							slot: null,
							refine: 0,
							cards: [],
							bound: false,
							source: "migration",
						},
					]
				: []),
		],
	};
}
export function rollDrops(
	monster: Monster,
	random: () => number,
	data: GameData,
	autoSeconds = 0,
	bonus = 0,
	equipmentRandom = random,
) {
	return monster.drops.flatMap((d):LootItem[] => {
		const rng=isRolledTemplate(d.item)||['card_bud_shroom','card_clay_puff','card_pebble_puff','card_shade_wolf'].includes(d.item)?equipmentRandom:random;
		const t = knownTemplate(data,d.item);if(!t)return [];
		const rare = ["rare", "epic", "legendary"].includes(t.rarity);
		const multiplier =
			data.economy.dropMultiplier *
			// TEST UAT boosts cards only; restore cardDropMultiplier to 1 for normal rates.
			(t.type === 'card' ? data.economy.cardDropMultiplier : 1) *
			(1 + bonus) *
			(rare && autoSeconds > data.economy.autoRareAfterSeconds
				? data.economy.autoRareMultiplier
				: 1);
		if(rng() >= Math.min(1,d.rate*multiplier))return [];
		const qty=d.min+Math.floor(rng()*(d.max-d.min+1));
		const roll=rollEquipment(d.item,monster.level,data,equipmentRandom);
		return roll?Array.from({length:qty},(_,n)=>({template:d.item,qty:1,roll:n?rollEquipment(d.item,monster.level,data,equipmentRandom)!:roll})):[{template:d.item,qty}];
	});
}
/** Pure copy-on-write reducer. Stores publish this result and ledger together, or neither. */
export function applyInventory(
	state: EconomyState,
	op: InventoryOp,
	profile: CharacterInput,
	data: GameData,
	uuid: () => string,
) {
	const next = structuredClone(state),
		inv = next.inventory,
		ledger: LedgerEntry[] = [];
	const template = (id: string) => {
		const t = data.items.items.find((t) => t.id === id);
		if (!t) throw Error("ไม่พบชนิดไอเทม");
		return t;
	};
	const count = op.qty ?? 1;
	if (!Number.isSafeInteger(count) || count < 1 || count > 9999)
		throw Error("จำนวนไม่ถูกต้อง");
	const owned = (id?: string) => {
		const i = inv.items.find((i) => i.id === id);
		if (!i || !["bag", "equip"].includes(i.location))
			throw Error("ไอเทมนี้ไม่ใช่ของคุณ");
		return i;
	};
	const add = (id: string, qty: number, source: string, roll?:ItemRoll, bound=false) => {
		const t = template(id);
		if(isRolledTemplate(id)&&!roll)throw Error('อุปกรณ์ชุดนี้ต้องมีค่าสุ่มจากแหล่งดรอป');
		if(roll){validateItemRoll(id,roll,data);if(qty!==1||t.stackable)throw Error('อุปกรณ์สุ่มออฟต้องเป็นรายชิ้น');}
		if (!Number.isSafeInteger(qty) || qty < 1 || qty > 9999)
			throw Error("จำนวนไม่ถูกต้อง");
		let i = t.stackable
			? inv.items.find((i) => i.template === id && i.location === "bag")
			: undefined;
		if (i) i.qty += qty;
		else
			for (let n = 0; n < (t.stackable ? 1 : qty); n++)
				inv.items.push({
					id: t.stackable ? "stack:" + id : uuid(),
					template: id,
					qty: t.stackable ? qty : 1,
					location: "bag",
					slot: null,
					refine: 0,
					cards: [],
					bound: bound || t.bind === "account",
					source,
					...(roll?{roll:structuredClone(roll)}:{}),
				});
	};
	const remove = (i: OwnedItem, qty: number) => {
		if (i.location !== "bag" || qty > i.qty)
			throw Error("ไอเทมไม่พอ หรือยังสวมอยู่");
		i.qty -= qty;
		if (!i.qty) inv.items.splice(inv.items.indexOf(i), 1);
	};
	const log = (
		kind: string,
		i: OwnedItem | undefined,
		qty: number,
		goldDelta = 0,
	) =>
		ledger.push({
			kind,
			itemId: i?.id,
			template: i?.template ?? op.template,
			qty,
			goldDelta,
		});
	if (op.op === "buy") {
		const t = template(op.template!);
		const price = data.economy.shops[op.shop || ""]?.[t.id];
		if (price === undefined) throw Error("ร้านนี้ไม่มีสินค้านี้");
		const cost = price * count;
		if (cost > next.gold) throw Error("ทองไม่พอ");
		next.gold -= cost;
		add(t.id, count, "npc");
		log("npc_buy", undefined, count, -cost);
	}
	if (op.op === "sell" || op.op === "discard") {
		if (op.items && (op.op !== "sell" || op.ids || op.id)) throw Error("รายการขายไม่ถูกต้อง");
		const ids = op.items?.map(i=>i.id) ?? op.ids ?? [op.id!];
		if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length)
			throw Error("รายการซ้ำหรือไม่ถูกต้อง");
		for (const id of ids) {
			const i = owned(id),
				t = template(i.template);
			if ((i.bound || t.bind === 'account') && op.op === "sell") throw Error("ขายของผูกมัดไม่ได้");
			const qty = op.items ? op.items.find(row=>row.id===id)!.qty : op.ids ? i.qty : count;
			if (!Number.isSafeInteger(qty) || qty < 1 || (!op.ids && qty > 9999)) throw Error("จำนวนไม่ถูกต้อง");
			const value =
				op.op === "sell"
					? Math.floor(t.npcPrice * data.economy.sellMultiplier) * qty
					: 0;
			remove(i, qty);
			next.gold += value;
			log(op.op === "sell" ? "npc_sell" : "discard", i, qty, value);
		}
	}
	if (op.op === "equip") {
		const i = owned(op.id),
			t = template(i.template);
		if (i.location !== "bag" || !t.slot || requiredEquipmentLevel(t.level,i) > profile.level)
			throw Error("ระดับไม่พอ หรือใส่ไม่ได้");
		const targetSlot = equipmentTarget(inv, t.slot, op.slot);
		const old = inv.items.find(
			(i) => i.location === "equip" && i.slot === targetSlot,
		);
		if (old) {
			old.location = "bag";
			old.slot = null;
			log("unequip", old, 1);
		}
		i.location = "equip";
		i.slot = targetSlot;
		i.bound ||= t.bind === "equip";
		deriveStats(inventoryProfile(profile,inv,data), data);
		log("equip", i, 1);
	}
	if (op.op === "unequip") {
		const i = owned(op.id);
		if (i.location !== "equip") throw Error("ยังไม่ได้สวม");
		i.location = "bag";
		i.slot = null;
		log("unequip", i, 1);
	}
	let effect: { kind: string; amount: number; duration?:number } | undefined;
	if (op.op === "socket") {
		const target = owned(op.id), price = socketPrice(target, data);
		if (typeof price === "string") throw Error(price);
		if (next.gold < price.gold) throw Error("ทองไม่พอ");
		const stack = inv.items.find((i) => i.template === price.material && i.location === "bag");
		if (!stack || stack.qty < price.qty) throw Error(`ต้องใช้ ${template(price.material).nameTh} ×${price.qty}`);
		remove(stack, price.qty);
		log("use", stack, price.qty);
		next.gold -= price.gold;
		log("npc_buy", target, 0, -price.gold);
		target.sockets = (target.sockets ?? 0) + 1;
	}
	if (op.op === "refine") {
		const target = owned(op.id), quote = refineQuote(target, data);
		if (typeof quote === "string") throw Error(quote);
		if (typeof op.roll !== "number" || !(op.roll >= 0 && op.roll < 1)) throw Error("การตีบวกต้องสุ่มจากเซิร์ฟเวอร์");
		if (next.gold < quote.gold) throw Error("ทองไม่พอ");
		const stack = inv.items.find((i) => i.template === quote.stone && i.location === "bag");
		if (!stack) throw Error(`ต้องใช้ ${template(quote.stone).nameTh} ×1`);
		remove(stack, 1);
		log("use", stack, 1);
		next.gold -= quote.gold;
		log("npc_buy", target, 0, -quote.gold);
		target.refine = op.roll < quote.chance ? quote.next : quote.failTo;
		if (target.location === "equip") deriveStats(inventoryProfile(profile,inv,data), data);
	}
	if (op.op === "card") {
		const card = owned(op.card), target = owned(op.id);
		const problem = cardProblem(card, target, data);
		if (problem) throw Error(problem);
		remove(card, 1);
		target.cards = [...target.cards, card.template];
		log("use", card, 1);
		// Worn equipment changes stats right away; make sure they still derive.
		if (target.location === "equip") deriveStats(inventoryProfile(profile,inv,data), data);
	}
	if (op.op === "use") {
		const i = owned(op.id),
			t = template(i.template);
		if (t.type !== "consumable" || !t.effect) throw Error("ใช้ไม่ได้");
  if(t.effect==='arcane'&&profile.level<t.level)throw Error('ระดับไม่ถึงระดับไอเทม');
		remove(i, 1);
		log("use", i, 1);
		effect = { kind: t.effect, amount: t.amount!, ...(t.duration?{duration:t.duration}:{}) };
	}
	if (op.op === "pickup" || op.op === "admin") {
		for (const drop of op.loot ?? []) {
			add(drop.template, drop.qty, op.op === "pickup" ? "drop" : "admin",drop.roll);
			ledger.push({
				kind: op.op,
				template: drop.template,
				qty: drop.qty,
				goldDelta: 0,
			});
		}
		const gold = op.gold ?? 0;
		if (!Number.isSafeInteger(gold) || gold < 0) throw Error("ทองไม่ถูกต้อง");
		next.gold += gold;
		ledger.push({ kind: op.op, qty: 0, goldDelta: gold });
	}
		if (op.op === "store" || op.op === "retrieve") {
		const from = op.op === "store" ? "bag" : "storage",
			to = op.op === "store" ? "storage" : "bag";
		const i = inv.items.find((i) => i.id === op.id && i.location === from);
		if (!i) throw Error(op.op === "store" ? "ฝากได้เฉพาะของในกระเป๋า (ถอดอุปกรณ์ก่อน)" : "ไม่พบของในคลัง");
		const t = template(i.template);
		if (count > i.qty) throw Error("ไอเทมไม่พอ");
		if (t.stackable) {
			i.qty -= count;
			if (!i.qty) inv.items.splice(inv.items.indexOf(i), 1);
			const target = inv.items.find((s) => s.template === t.id && s.location === to);
			if (target) target.qty += count;
			else
				inv.items.push({ ...i, id: to === "storage" ? storageStackId(t.id) : "stack:" + t.id, qty: count, location: to, slot: null });
		} else {
			if (count !== 1) throw Error("จำนวนไม่ถูกต้อง");
			i.location = to;
			i.slot = null;
		}
		log(op.op === "store" ? "storage_in" : "storage_out", i, count);
		if (storageSlots(inv, data) > data.economy.storageSlots) throw Error("คลังเต็ม");
	}
	if (op.op === "quest") {
		for (const need of op.loot ?? []) {
			let left = need.qty;
			for (const i of inv.items.filter((i) => i.template === need.template && i.location === "bag")) {
				const take = Math.min(left, i.qty);
				remove(i, take);
				log("quest", i, -take);
				left -= take;
				if (!left) break;
			}
			if (left > 0) throw Error(`ต้องมี ${template(need.template).nameTh} ×${need.qty}`);
		}
		for (const reward of op.reward ?? []) {
			add(reward.template, reward.qty, "quest");
			ledger.push({ kind: "quest", template: reward.template, qty: reward.qty, goldDelta: 0 });
		}
		const gold = op.gold ?? 0;
		if (!Number.isSafeInteger(gold) || gold < 0) throw Error("ทองไม่ถูกต้อง");
		next.gold += gold;
		ledger.push({ kind: "quest", qty: 0, goldDelta: gold });
	}
	if (op.op === "settings") inv.autoPickup = !!op.on;
	if(op.op==='salvage'){
	 const item=owned(op.id),fragments=salvageQuote(item,data);
	 if(typeof fragments==='string')throw Error(fragments);
	 if(count!==1)throw Error('ย่อยอุปกรณ์ครั้งละ 1 ชิ้น');
	 remove(item,1);log('salvage',item,-1);add(FORGE_FRAGMENT,fragments,'salvage');
	 ledger.push({kind:'salvage',template:FORGE_FRAGMENT,qty:fragments,goldDelta:0});
	}
	if(op.op==='craft'){
	 const recipe=craftQuote(op.template!);
	 if(count!==1)throw Error('คราฟต์ครั้งละ 1 ชิ้น');
	 if(next.gold<recipe.gold)throw Error('ทองไม่พอ');
	 const fragments=inv.items.find(i=>i.location==='bag'&&i.template===FORGE_FRAGMENT);
	 if(!fragments||fragments.qty<recipe.fragments)throw Error(`ต้องใช้เศษผลึกช่าง ×${recipe.fragments}`);
	 remove(fragments,recipe.fragments);log('craft',fragments,-recipe.fragments);
	 next.gold-=recipe.gold;add(recipe.template,1,'craft');
	 ledger.push({kind:'craft',template:recipe.template,qty:1,goldDelta:-recipe.gold});
	}
	if(op.op==='levelReward')for(const level of validateRewardLevels(op.levels,profile.level,data.stats.maxLevel)){
 const reward=levelReward(level,data,op.legacyLevels?.includes(level),profile.level);
	 for(const item of reward.items){add(item.template,item.qty,'level_reward',undefined,!!template(item.template).slot);ledger.push({kind:'level_reward',template:item.template,qty:item.qty,goldDelta:0});}
	 next.gold+=reward.gold;ledger.push({kind:'level_reward',qty:0,goldDelta:reward.gold});
	}
	if (
		!Number.isSafeInteger(next.gold) ||
		next.gold < 0 ||
		next.gold > 2147483647
	)
		throw Error("ทองเกินขีดจำกัด");
	if (["buy", "pickup", "equip", "unequip", "retrieve", "quest", "levelReward", "craft", "salvage"].includes(op.op)) {
		if (inventorySlots(inv, data) > data.economy.inventorySlots)
			throw Error("กระเป๋าเต็ม");
		const max = deriveStats(
			inventoryProfile(profile,inv,data),
			data,
		).weight;
		if (inventoryWeight(inv, data) > max) throw Error("น้ำหนักเกิน");
	}
	return { state: next, ledger, effect };
}
