import test from "node:test";
import assert from "node:assert/strict";
import {
	loadGameData,
	rollDrops,
	deriveStats,
	starterInventory,
	applyInventory,
	inventoryWeight,
	inventorySlots,
	createGame,
	step,
	action,
	refreshStats,
} from "../src/index.js";
const data = loadGameData();
test("100k seeded rolls per monster respect rates and quantity bounds", () => {
	let seed = 717;
	const rng = () =>
		(seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
	for (const m of data.monsters.monsters) {
		const counts: Record<string, number> = {};
		for (let i = 0; i < 100000; i++)
			for (const drop of rollDrops(m, rng, data)) {
				const rule = m.drops.find((d) => d.item === drop.template)!;
				assert.ok(drop.qty >= rule.min && drop.qty <= rule.max);
				counts[drop.template] = (counts[drop.template] || 0) + 1;
			}
		for (const d of m.drops) {
			const rate = Math.min(1, d.rate * data.economy.dropMultiplier * (data.items.items.find(t => t.id === d.item)!.type === 'card' ? data.economy.cardDropMultiplier : 1));
			const expected = rate * 100000,
				sigma = Math.sqrt(expected * (1 - rate));
			assert.ok(
				Math.abs((counts[d.item] || 0) - expected) <= 6 * sigma + 2,
				`${m.id}/${d.item}`,
			);
		}
	}
	const king = data.monsters.monsters.find((m) => m.boss)!;
	let full = 0,
		penalty = 0;
	for (let i = 0; i < 100000; i++) {
		full += rollDrops(king, rng, data).filter(
			(d) => d.template === "card_king_jelly",
		).length;
		penalty += rollDrops(king, rng, data, 7201).filter(
			(d) => d.template === "card_king_jelly",
		).length;
	}
	assert.ok(penalty < full * 0.85);
});
test("equipment adds exact modifiers, binds on equip, and reducer failures are atomic", () => {
	let id = 0;
	const uuid = () => String(++id),
		inv = starterInventory(5, uuid),
		profile = data.stats.defaultBuild;
	const granted = applyInventory(
		{ inventory: inv, gold: 500 },
		{ op: "buy", template: "leaf_sword", shop: "forge" },
		profile,
		data,
		uuid,
	);
	const sword = granted.state.inventory.items.find(
		(i) => i.template === "leaf_sword",
	)!;
	const equipped = applyInventory(
		granted.state,
		{ op: "equip", id: sword.id },
		profile,
		data,
		uuid,
	);
	const stats = deriveStats(
		{
			...profile,
			equipment: equipped.state.inventory.items
				.filter((i) => i.location === "equip")
				.map((i) => i.template),
		},
		data,
	);
	assert.equal(stats.atk - deriveStats(profile, data).atk, 9);
	assert.equal(stats.hardDef, 3);
	assert.ok(
		equipped.state.inventory.items.find((i) => i.id === sword.id)!.bound,
	);
	const before = structuredClone(granted.state);
	assert.throws(() =>
		applyInventory(
			granted.state,
			{ op: "buy", template: "leaf_sword", qty: 50, shop: "forge" },
			profile,
			data,
			uuid,
		),
	);
	assert.deepEqual(granted.state, before);
});
test("materials and consumables are nearly weightless: 1,000 of any one stays under 10% of the starting limit", () => {
	const p = createGame().p;
	for (const t of data.items.items.filter((t) => t.type === "material" || t.type === "consumable"))
		assert.ok(t.weight * 1000 < p.stats.weight * 0.1, `${t.id} weighs ${t.weight}`);
});
test("weight rules disable all regen at 50%, attack at 90%, enforce 100 slots and capacity", () => {
	const g = createGame(),
		p = g.p;
	p.inventory = starterInventory(0, () => String(g.nextId++));
	p.inventory.items.push({
		// Heavy refine stones (10 each); materials and potions are nearly weightless now.
		id: "stack:weapon_stone",
		template: "weapon_stone",
		qty: Math.ceil(p.stats.weight*.5/10),
		location: "bag",
		slot: null,
		refine: 0,
		cards: [],
		bound: false,
		source: "admin",
	});
	refreshStats(g, p);
	assert.ok(inventoryWeight(p.inventory, data) >= p.stats.weight * 0.5);
	p.hp = 20;
	p.mp = 10;
	g.enemies = [];
	step(g, 0.1);
	assert.equal(p.hp, 20);
	assert.equal(p.mp, 10);
	p.inventory.items.at(-1)!.qty = Math.ceil(p.stats.weight*.9/10);
	assert.equal(action(g, "attack"), false);
	p.inventory.items.at(-1)!.qty = 1;
	refreshStats(g, p);
	step(g, 0.1);
	assert.ok(p.hp > 20 && p.mp > 10);
	const inv = starterInventory(0, () => String(g.nextId++));
	for (let i = inventorySlots(inv, data); i < 100; i++)
		inv.items.push({
			id: "ring" + i,
			template: "jade_ring",
			qty: 1,
			location: "bag",
			slot: null,
			refine: 0,
			cards: [],
			bound: false,
			source: "admin",
		});
	assert.equal(inventorySlots(inv, data), 100);
	assert.throws(
		() =>
			applyInventory(
				{ inventory: inv, gold: 200 },
				{ op: "buy", shop: "forge", template: "reed_dagger" },
				p.profile,
				data,
				() => String(g.nextId++),
			),
		/กระเป๋าเต็ม/,
	);
});

test("storage: deposit/withdraw stacks and gear, equipped gear stays out, capacity and bag limits apply", async () => {
	const { applyInventory, starterInventory, storageSlots, loadGameData } = await import("../src/index.node.js");
	const data = loadGameData();
	let n = 0;
	const uuid = () => "id-" + ++n;
	const profile = { ...data.stats.defaultBuild, level: 5 };
	let state = { gold: 100, inventory: starterInventory(10, uuid) };
	const sword = state.inventory.items.find(i => i.template === "training_sword")!;
	state = applyInventory(state, { op: "equip", id: sword.id }, profile, data, uuid).state;
	assert.throws(() => applyInventory(state, { op: "store", id: sword.id }, profile, data, uuid), /ถอดอุปกรณ์/);
	let out = applyInventory(state, { op: "store", id: "stack:bound:red_small", qty: 4 }, profile, data, uuid);
	state = out.state;
	assert.equal(state.inventory.items.find(i => i.id === "stack:bound:red_small")!.qty, 6);
	assert.equal(state.inventory.items.find(i => i.id === "stack:storage:bound:red_small")!.qty, 4);
	assert.deepEqual(out.ledger.map(l => [l.kind, l.qty, l.goldDelta]), [["storage_in", 4, 0]]);
	state = applyInventory(state, { op: "store", id: "stack:bound:red_small", qty: 6 }, profile, data, uuid).state;
	assert.ok(!state.inventory.items.some(i => i.id === "stack:bound:red_small"));
	state = applyInventory(state, { op: "retrieve", id: "stack:storage:bound:red_small", qty: 3 }, profile, data, uuid).state;
	assert.equal(state.inventory.items.find(i => i.id === "stack:bound:red_small")!.qty, 3);
	assert.equal(state.inventory.items.find(i => i.id === "stack:storage:bound:red_small")!.qty, 7);
	state = applyInventory(state, { op: "unequip", id: sword.id }, profile, data, uuid).state;
	state = applyInventory(state, { op: "store", id: sword.id }, profile, data, uuid).state;
	assert.equal(state.inventory.items.find(i => i.id === sword.id)!.location, "storage");
	assert.equal(storageSlots(state.inventory, data), 2);
	assert.throws(() => applyInventory(state, { op: "retrieve", id: "stack:storage:bound:red_small", qty: 99 }, profile, data, uuid), /ไม่พอ/);
	const full = structuredClone(state);
	for (let i = 0; i < data.economy.storageSlots; i++) full.inventory.items.push({ ...sword, id: "x" + i, location: "storage" });
	full.inventory.items.push({ ...sword, id: "bagged", location: "bag" });
	assert.throws(() => applyInventory(full, { op: "store", id: "bagged" }, profile, data, uuid), /คลังเต็ม/);
	assert.equal(state.gold, 100);
});

test("quest turn-in takes required items and grants rewards in one ledgered step", async () => {
	const { applyInventory, starterInventory, loadGameData } = await import("../src/index.node.js");
	const data = loadGameData();
	let n = 0;
	const uuid = () => "q-" + ++n;
	const profile = { ...data.stats.defaultBuild, level: 5 };
	const state = { gold: 10, inventory: starterInventory(2, uuid) };
	state.inventory.items.push({ id: "stack:jelly_slime", template: "jelly_slime", qty: 12, location: "bag", slot: null, refine: 0, cards: [], bound: false, source: "drop" });
	assert.throws(() => applyInventory(state, { op: "quest", loot: [{ template: "jelly_slime", qty: 20 }], gold: 50 }, profile, data, uuid), /ต้องมี/);
	const out = applyInventory(state, { op: "quest", loot: [{ template: "jelly_slime", qty: 10 }], reward: [{ template: "red_medium", qty: 3 }], gold: 50 }, profile, data, uuid);
	assert.equal(out.state.gold, 60);
	assert.equal(out.state.inventory.items.find(i => i.template === "jelly_slime")!.qty, 2);
	assert.equal(out.state.inventory.items.find(i => i.template === "red_medium")!.qty, 3);
	assert.equal(out.ledger.reduce((s, l) => s + l.goldDelta, 0), 50);
	assert.ok(out.ledger.every(l => l.kind === "quest"));
});
