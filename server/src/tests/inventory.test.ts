import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MemoryStore } from "../store/memory.js";
import { loadGameData } from "@the-beginning-online/shared";
import { PostgresStore } from '../store/postgres.js';
import type { EconomyContext, QuestProgress } from '../store/economy.js';
const data = loadGameData(),
	context = { profile: data.stats.defaultBuild };
async function fixture() {
	const store = new MemoryStore(),
		a = await store.createGuest(randomUUID()),
		c = await store.createCharacter(a.id, "Economy", "economy");
	await store.inventory(a.id, c.id);
	const run = (op: any, req = randomUUID(), ctx = context) =>
		store.inventoryOp(a.id, c.id, req, op, ctx);
	return { store, a, c, run };
}
test('partial shop sale persists current stock and gold once when its request is retried',async()=>{
 const {store,a,c,run}=await fixture();
 await run({op:'pickup',loot:[{template:'red_small',qty:5}]});
 const before=await store.inventory(a.id,c.id),potion=before.inventory.items.find(i=>i.template==='red_small'&&!i.bound)!;
 const req=randomUUID(),op={op:'sell',shop:'market',items:[{id:potion.id,qty:2}]};
 const first=await run(op,req);assert.ok(!first.error);
 const retried=await run(op,req);assert.ok(retried.duplicate);
 const saved=await store.inventory(a.id,c.id);
 assert.equal(saved.inventory.items.find(i=>i.id===potion.id)!.qty,potion.qty-2);
 assert.equal(saved.gold,before.gold+2*Math.floor(data.items.items.find(t=>t.id==='red_small')!.npcPrice*data.economy.sellMultiplier));
 const invalid=await run({...op,items:[{id:potion.id,qty:9999}]});assert.ok(invalid.error);
 assert.deepEqual(await store.inventory(a.id,c.id),saved);
});

test('starter weapons cover every weapon type in the bag and are granted only once', async () => {
	const { store, a, c, run } = await fixture();
	const first = await store.inventory(a.id, c.id);
	const weapons = first.inventory.items.filter(i => i.location === 'bag' && data.items.items.find(t => t.id === i.template)?.type === 'weapon');
	assert.deepEqual(weapons.map(i => i.template), ['training_sword', 'training_greatsword', 'reed_dagger', 'wood_staff', 'bamboo_bow', 'training_knuckles']);
	assert.ok(!first.inventory.items.some(i => i.location === 'equip' && i.slot === 'weapon'));
	assert.equal(new Set(weapons.map(i => data.items.items.find(t => t.id === i.template)!.weaponType)).size, 6);
	for (const item of weapons) {
		assert.equal(item.qty, 1);
		assert.equal(item.slot, null);
		assert.equal(data.items.items.find(t => t.id === item.template)!.level, 1);
		assert.equal(data.items.items.find(t => t.id === item.template)!.rarity, 'common');
	}
	assert.equal(new Set(first.inventory.items.map(i => i.id)).size, first.inventory.items.length);
	assert.deepEqual(await store.inventory(a.id, c.id), first);
	await run({ op: 'equip', id: weapons[0].id });
	assert.equal((await store.inventory(a.id, c.id)).inventory.items.find(i => i.id === weapons[0].id)!.slot, 'weapon');
	await run({ op: 'unequip', id: weapons[0].id });
	await run({ op: 'discard', id: weapons[0].id, qty: 1 });
	assert.ok(!(await store.inventory(a.id, c.id)).inventory.items.some(i => i.id === weapons[0].id));
	assert.ok((await store.integrity()).ok);
});
test('ring destination persists and replayed equip requests cannot move or duplicate a ring',async()=>{
 const {store,a,c,run}=await fixture();await run({op:'admin',loot:[{template:'jade_ring',qty:3},{template:'sky_amulet',qty:1}]});
 const initial=await store.inventory(a.id,c.id),rings=initial.inventory.items.filter(i=>i.template==='jade_ring'),amulet=initial.inventory.items.find(i=>i.template==='sky_amulet')!;
 await run({op:'equip',id:rings[0].id});const req=randomUUID();await run({op:'equip',id:rings[1].id,slot:'ring2'},req);
 const replay=await run({op:'equip',id:rings[1].id,slot:'ring2'},req);assert.equal(replay.duplicate,true);
 await run({op:'equip',id:amulet.id});await run({op:'equip',id:rings[2].id,slot:'ring2'});
 const saved=await store.inventory(a.id,c.id);
 assert.equal(saved.inventory.items.find(i=>i.id===rings[0].id)!.slot,'accessory1');
 assert.equal(saved.inventory.items.find(i=>i.id===rings[1].id)!.location,'bag');
 assert.equal(saved.inventory.items.find(i=>i.id===rings[2].id)!.slot,'ring2');
 assert.equal(saved.inventory.items.find(i=>i.id===amulet.id)!.slot,'accessory2');
 assert.equal(saved.inventory.items.filter(i=>i.template==='jade_ring').length,3);assert.ok((await store.integrity()).ok);
});
test("100 identical concurrent sells commit once; stale progress cannot overwrite gold", async () => {
	const { store, a, c, run } = await fixture();
	await run({ op: "admin", loot: [{ template: "jelly_slime", qty: 20 }] });
	const req = randomUUID();
	const results = await Promise.all(
		Array.from({ length: 100 }, () =>
			run({ op: "sell", id: "stack:jelly_slime", qty: 20 }, req),
		),
	);
	assert.equal(results.filter((r) => !r.duplicate).length, 1);
	assert.equal((await store.inventory(a.id, c.id)).gold, 80);
	await store.saveProgress(a.id, c.id, { ...c, gold: 0, potions: 5 });
	assert.equal((await store.inventory(a.id, c.id)).gold, 80);
	assert.ok((await store.integrity()).ok);
});
test("100 different concurrent buys with gold for exactly 3 produce exactly 3", async () => {
	const { store, a, c, run } = await fixture();
	await run({ op: "admin", gold: 240 });
	const results = await Promise.all(
		Array.from({ length: 100 }, () =>
			run({ op: "buy", shop: "forge", template: "training_sword" }),
		),
	);
	assert.equal(results.filter((r) => !r.error).length, 3);
	const state = await store.inventory(a.id, c.id);
	assert.equal(state.gold, 0);
	assert.equal(
		state.inventory.items.filter((i) => i.template === "training_sword").length,
		4,
	);
	assert.ok((await store.integrity()).ok);
});

test('quest completion fences a second reward request and failed inventory leaves the quest active',async()=>{
 const {store,a,c}=await fixture();
 const active={active:{storage_ledger:{at:123,progress:[1]}},done:{}};
 await store.saveProgress(a.id,c.id,{...c,quests:active});
 const progress:QuestProgress={...c,quests:{active:{},done:{storage_ledger:456}},xp:40};
 const ctx:EconomyContext={...context,quest:{id:'storage_ledger',acceptedAt:123,progress}};
 const failed=await store.inventoryOp(a.id,c.id,randomUUID(),{op:'quest',loot:[{template:'jelly_slime',qty:1}],gold:30},ctx);
 assert.ok(failed.error);assert.deepEqual((await store.character(a.id,c.id))!.quests,active);
 const first=await store.inventoryOp(a.id,c.id,randomUUID(),{op:'quest',loot:[],gold:30},ctx);
 assert.equal(first.error,undefined);assert.equal(first.gold,30);
 const repeated=await store.inventoryOp(a.id,c.id,randomUUID(),{op:'quest',loot:[],gold:30},ctx);
 assert.match(repeated.error!,/no longer active/);assert.equal(repeated.gold,30);
 assert.equal((await store.character(a.id,c.id))!.xp,40);assert.ok((await store.integrity()).ok);
});

test('Postgres quest rewards, completion and EXP roll back together after an inventory write failure',
 {skip:!process.env.PG_TEST_URL&&'PG_TEST_URL not set'},async t=>{
 const store=new PostgresStore(process.env.PG_TEST_URL!);t.after(()=>store.close());await store.init();
 const a=await store.createGuest(randomUUID()),name='Q'+randomUUID().replaceAll('-','').slice(0,10);
 const c=await store.createCharacter(a.id,name,name.toLowerCase());await store.inventory(a.id,c.id);
 const quests={active:{storage_ledger:{at:123,progress:[1]}},done:{}};
 await store.saveProgress(a.id,c.id,{...c,quests});
 const progress:QuestProgress={...c,quests:{active:{},done:{storage_ledger:456}},xp:40};
 const ctx:EconomyContext={...context,quest:{id:'storage_ledger',acceptedAt:123,progress}};
 const write=(store as any).writeInventory.bind(store);
 (store as any).writeInventory=async(...args:any[])=>{await write(...args);throw Error('injected write failure');};
 const req=randomUUID(),op={op:'quest' as const,loot:[],gold:30};
 await assert.rejects(store.inventoryOp(a.id,c.id,req,op,ctx),/injected write failure/);
 const unchanged=(await store.character(a.id,c.id))!;
 assert.equal(unchanged.gold,c.gold);assert.equal(unchanged.xp,c.xp);assert.deepEqual(unchanged.quests,quests);
 (store as any).writeInventory=write;
 await store.inventoryOp(a.id,c.id,req,op,ctx);
 const saved=(await store.character(a.id,c.id))!;assert.equal(saved.gold,c.gold+30);assert.equal(saved.xp,40);assert.ok(saved.quests!.done.storage_ledger);
 const again=await store.inventoryOp(a.id,c.id,randomUUID(),op,ctx);assert.ok(again.error);assert.equal(again.gold,c.gold+30);
 assert.ok((await store.integrity()).ok);
});
test("reject foreign item, wrong class, high level, duplicate ids; persist failed request results", async () => {
	const { run } = await fixture();
	await run({
		op: "admin",
		gold: 10000,
		loot: [
			{ template: "wood_staff", qty: 1 },
			{ template: "crystal_sword", qty: 1 },
		],
	});
	const state = await run({ op: "settings", on: false });
	const staff = state.inventory.items.find((i) => i.template === "wood_staff")!,
		sword = state.inventory.items.find((i) => i.template === "crystal_sword")!;
	assert.match((await run({ op: "equip", id: randomUUID() })).error!, /ไม่ใช่/);
	assert.match(
		(await run({ op: "equip", id: staff.id })).error!,
		/cannot equip/,
	);
	assert.match((await run({ op: "equip", id: sword.id })).error!, /ระดับ/);
	assert.ok((await run({ op: "sell", ids: [staff.id, staff.id] })).error);
	const req = randomUUID();
	const bad = await run({ op: "buy", template: "unknown", shop: "forge" }, req);
	const repeat = await run(
		{ op: "buy", template: "training_sword", shop: "forge" },
		req,
	);
	assert.equal(repeat.error, bad.error);
	assert.ok(repeat.duplicate);
});
test("10k deterministic random operations preserve ledger = gold and all inventory invariants", async () => {
	const { store, a, c, run } = await fixture();
	await run({ op: "admin", gold: 50000 });
	let seed = 38;
	const rng = () =>
		(seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
	const ops = [
		"buy",
		"sell",
		"equip",
		"unequip",
		"discard",
		"use",
		"pickup",
	] as const;
	for (let n = 0; n < 10000; n++) {
		const state = await store.inventory(a.id, c.id),
			i =
				state.inventory.items[Math.floor(rng() * state.inventory.items.length)],
			op = ops[Math.floor(rng() * ops.length)];
		await run(
			op === "buy"
				? {
						op,
						shop: "forge",
						template: rng() < 0.5 ? "training_sword" : "leaf_sword",
					}
				: op === "pickup"
					? {
							op,
							gold: Math.floor(rng() * 14),
							loot: [
								{ template: rng() < 0.5 ? "jelly_slime" : "red_small", qty: 1 },
							],
						}
					: { op, id: i?.id, qty: 1 },
		);
	}
	assert.ok((await store.integrity()).ok);
	const state = await store.inventory(a.id, c.id);
	assert.ok(state.gold >= 0);
	assert.ok(state.inventory.items.every((i) => i.qty > 0));
});
