import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { loadGameData, applyTrade, rollEquipment, type LootItem, type Inventory } from "@the-beginning-online/shared";
import { createApp } from "../app.js";
import { MemoryStore } from "../store/memory.js";
import { mountRealtime } from "../realtime/index.js";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const data = loadGameData(), profile = data.stats.defaultBuild;

async function fixture(t: any) {
	const store = new MemoryStore(), app = createApp({ store, build: "test" }), server = app.listen(0, "127.0.0.1");
	await once(server, "listening");
	const rt = mountRealtime(server, { store, build: "test", sharedRooms: true, reconnectMs: 250, heartbeatMs: 100, pruneMs: 100 });
	const base = `http://127.0.0.1:${(server.address() as any).port}`;
	const call = async (path: string, body?: unknown, cookie = "") => {
		const r = await fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
		return { data: await r.json(), cookie: r.headers.get("set-cookie")?.split(";")[0] || "" };
	};
	const sockets: WebSocket[] = [];
	/** A ready player in the shared city room, given `loot` and `gold` first. */
	async function player(name: string, loot: LootItem[] = [], gold = 0) {
		const guest = await call("/api/guest", {}), c = (await call("/api/characters", { name, jobId: "swordsman" }, guest.cookie)).data.character;
		if (loot.length || gold) await store.inventoryOp(c.accountId, c.id, randomUUID(), { op: "admin", loot, gold }, { profile });
		await call(`/api/characters/${c.id}/select`, {}, guest.cookie);
		const ws = new WebSocket(base.replace("http", "ws") + "/api/ws?v=test&area=meadow-01", { headers: { Cookie: guest.cookie } }), messages: any[] = [];
		ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
		ws.on("error", () => {});
		sockets.push(ws);
		const until = async (predicate: (m: any) => boolean) => {
			for (let i = 0; i < 300; i++) { const m = messages.find(predicate); if (m) return m; await wait(10); }
			throw Error("No expected WebSocket message");
		};
		await until((m) => m.t === "welcome");
		ws.send(JSON.stringify({ t: "spawnReady" }));
		await until((m) => m.t === "snap");
		const inventory = async () => (await store.inventory(c.accountId, c.id));
		return { c, ws, messages, until, send: (m: unknown) => ws.send(JSON.stringify(m)), inventory, latest: (t: string) => [...messages].reverse().find((m) => m.t === t) };
	}
	t.after(async () => {
		for (const s of sockets) s.terminate();
		await rt.close();
		server.closeAllConnections();
		await new Promise<void>((r) => server.close(() => r()));
	});
	return { store, rt, player };
}
const bagItem = (inv: Inventory, template: string) => inv.items.find((i) => i.template === template && i.location === "bag");

test('live trade refuses mailbox gold but allows earned gold from the same wallet',async t=>{
 const f=await fixture(t),a=await f.player('GiftWallet',[],100),b=await f.player('EarnedWallet');
 const room=[...f.rt.rooms.values()].find(r=>r.game.players.has(a.c.id))!,p=room.game.players.get(a.c.id)!;
 p.level=5;p.profile.level=5;
 const req=randomUUID();a.send({t:'mailbox',op:'claim',level:5,req});
 await a.until(m=>m.t==='inv'&&m.req===req&&m.boundGold===5000);
 assert.equal(p.boundGold,5000);assert.equal(p.gold,5100);
 a.send({t:'trade',op:'request',name:b.c.name});await b.until(m=>m.t==='tradeInvite');b.send({t:'trade',op:'accept'});await a.until(m=>m.t==='tradeState');
 a.send({t:'trade',op:'offer',items:[],gold:5000});await a.until(m=>m.t==='tradeError'&&/ทองแจก/.test(m.text));
 a.send({t:'trade',op:'offer',items:[],gold:100});await b.until(m=>m.t==='tradeState'&&m.trade.them.gold===100);
 a.send({t:'trade',op:'lock'});b.send({t:'trade',op:'lock'});await a.until(m=>m.t==='tradeState'&&m.trade.you.locked&&m.trade.them.locked);
 a.send({t:'trade',op:'confirm'});b.send({t:'trade',op:'confirm'});await a.until(m=>m.t==='tradeClosed'&&m.done);
 await a.until(m=>m.t==='inv'&&m.gold===5000&&m.boundGold===5000);
 assert.equal((await b.inventory()).gold,100);assert.equal(p.boundGold,5000);
});

test('trade offer shows exact affixes to the receiver before locking',async(t)=>{
 const f=await fixture(t),roll=rollEquipment('field_sword',5,data,()=>.5,'rare')!;
 const a=await f.player('RollSeller',[{template:'field_sword',qty:1,roll}]),b=await f.player('RollBuyer');
 const item=bagItem((await a.inventory()).inventory,'field_sword')!;
 a.send({t:'trade',op:'request',name:b.c.name});const invite=await b.until(m=>m.t==='tradeInvite');b.send({t:'trade',op:'accept',id:invite.id});
 await a.until(m=>m.t==='tradeState');a.send({t:'trade',op:'offer',items:[{id:item.id,qty:1}],gold:0});
 const offer=await b.until(m=>m.t==='tradeState'&&m.trade.them.items.some((i:any)=>i.id===item.id));
 assert.deepEqual(offer.trade.them.items[0].roll,roll);assert.equal(offer.trade.them.locked,false);
});

test("two players swap a unique item, part of a stack and gold in one step", async (t) => {
	const f = await fixture(t);
	const a = await f.player("Seller", [{ template: "leaf_sword", qty: 1 }, { template: "jelly_slime", qty: 5 }]);
	const b = await f.player("Buyer", [], 500);
	const sword = bagItem((await a.inventory()).inventory, "leaf_sword")!;
	const goldBefore = { a: (await a.inventory()).gold, b: (await b.inventory()).gold };

	a.send({ t: "trade", op: "request", name: "Buyer" });
	await b.until((m) => m.t === "tradeInvite" && m.from === "Seller");
	b.send({ t: "trade", op: "accept" });
	await a.until((m) => m.t === "tradeState");
	a.send({ t: "trade", op: "offer", items: [{ id: sword.id, qty: 1 }, { id: "stack:jelly_slime", qty: 3 }], gold: 0 });
	b.send({ t: "trade", op: "offer", items: [], gold: 300 });
	await a.until((m) => m.t === "tradeState" && m.trade.them.gold === 300 && m.trade.you.items.length === 2);
	const seen = await b.until((m) => m.t === "tradeState" && m.trade.them.items.length === 2);
	assert.deepEqual(seen.trade.them.items.map((i: any) => i.template).sort(), ["jelly_slime", "leaf_sword"]);

	// Confirming before both lock is refused.
	a.send({ t: "trade", op: "confirm" });
	await a.until((m) => m.t === "tradeError" && /ล็อก/.test(m.text));
	a.send({ t: "trade", op: "lock" });
	b.send({ t: "trade", op: "lock" });
	await a.until((m) => m.t === "tradeState" && m.trade.you.locked && m.trade.them.locked);
	a.send({ t: "trade", op: "confirm" });
	b.send({ t: "trade", op: "confirm" });
	await a.until((m) => m.t === "tradeClosed" && m.done);
	await b.until((m) => m.t === "tradeClosed" && m.done);

	const after = { a: await a.inventory(), b: await b.inventory() };
	assert.equal(bagItem(after.a.inventory, "leaf_sword"), undefined);
	assert.equal(bagItem(after.b.inventory, "leaf_sword")?.id, sword.id, "the sword keeps its id");
	assert.equal(bagItem(after.a.inventory, "jelly_slime")?.qty, 2);
	assert.equal(bagItem(after.b.inventory, "jelly_slime")?.qty, 3);
	assert.equal(after.a.gold, goldBefore.a + 300);
	assert.equal(after.b.gold, goldBefore.b - 300);
	assert.deepEqual((await f.store.integrity()).issues, []);
	// The live bag updates too.
	await b.until((m) => m.t === "inv" && m.inventory.items.some((i: any) => i.id === sword.id));
});

test("changing an offer unlocks both sides; bad offers and walking apart are refused", async (t) => {
	const f = await fixture(t);
	const a = await f.player("Alpha", [{ template: "jelly_slime", qty: 2 }]);
	const b = await f.player("Bravo");
	a.send({ t: "trade", op: "request", name: "Bravo" });
	await b.until((m) => m.t === "tradeInvite");
	b.send({ t: "trade", op: "accept" });
	await a.until((m) => m.t === "tradeState");
	// A locks; B changing its offer unlocks A, so nobody confirms an offer they have not seen.
	a.send({ t: "trade", op: "lock" });
	await b.until((m) => m.t === "tradeState" && m.trade.them.locked);
	b.send({ t: "trade", op: "offer", items: [], gold: 0 });
	await a.until((m) => m.t === "tradeState" && !m.trade.you.locked && a.messages.some((x) => x.t === "tradeState" && x.trade.you.locked));
	// A locked side cannot change its own offer.
	b.send({ t: "trade", op: "lock" });
	await b.until((m) => m.t === "tradeState" && m.trade.you.locked);
	b.send({ t: "trade", op: "offer", items: [], gold: 0 });
	await b.until((m) => m.t === "tradeError" && /ล็อก/.test(m.text));

	a.send({ t: "trade", op: "offer", items: [{ id: "stack:jelly_slime", qty: 9 }], gold: 0 });
	await a.until((m) => m.t === "tradeError" && /ไม่พอ/.test(m.text));
	const equippedItem = (await a.inventory()).inventory.items.find((i) => i.location === "equip")!;
	a.send({ t: "trade", op: "offer", items: [{ id: equippedItem.id, qty: 1 }], gold: 0 });
	await a.until((m) => m.t === "tradeError" && /กระเป๋า/.test(m.text));

	// Walking away cancels the trade.
	const room = [...f.rt.rooms.values()][0], pb = room.game.players.get(b.c.id)!;
	pb.x += 30;
	await a.until((m) => m.t === "tradeClosed" && !m.done && /ห่าง/.test(m.reason));
});

test("applyTrade blocks a receiver whose bag would overflow and changes nothing", () => {
	const item = (id: string, template: string, qty = 1) => ({ id, template, qty, location: "bag" as const, slot: null, refine: 0, cards: [], bound: false, source: "test" });
	const full = { version: 1 as const, autoPickup: true, items: Array.from({ length: data.economy.inventorySlots }, (_, i) => item(randomUUID(), "leaf_sword")) };
	const giver = { version: 1 as const, autoPickup: true, items: [item("g1", "leaf_sword")] };
	const a = { state: { gold: 0, inventory: giver }, offer: { items: [{ id: "g1", qty: 1 }], gold: 0 }, profile };
	const b = { state: { gold: 0, inventory: full }, offer: { items: [], gold: 0 }, profile };
	assert.throws(() => applyTrade(a, b, data), (e: any) => /กระเป๋าเต็ม/.test(e.message) && e.side === 1);
	assert.equal(giver.items.length, 1);
});

test("Postgres trade moves rows between characters atomically and keeps the ledger balanced",
	{ skip: !process.env.PG_TEST_URL && "PG_TEST_URL not set" }, async (t) => {
	const { PostgresStore } = await import("../store/postgres.js");
	const store = new PostgresStore(process.env.PG_TEST_URL!);
	t.after(() => store.close());
	await store.init();
	const suffix = Date.now().toString(36);
	const make = async (name: string, loot: { template: string; qty: number }[], gold: number) => {
		const account = await store.createGuest("trade-" + name + suffix), c = await store.createCharacter(account.id, name + suffix, (name + suffix).toLowerCase());
		await store.inventoryOp(account.id, c.id, randomUUID(), { op: "admin", loot, gold }, { profile });
		return { accountId: account.id, id: c.id };
	};
	const a = await make("pa", [{ template: "leaf_sword", qty: 1 }, { template: "jelly_slime", qty: 4 }], 0);
	const b = await make("pb", [{ template: "crystal_sword", qty: 1 }], 900);
	const sword = bagItem((await store.inventory(a.accountId, a.id)).inventory, "leaf_sword")!;
	const crystal = bagItem((await store.inventory(b.accountId, b.id)).inventory, "crystal_sword")!;
	// Both sides hand over a unique item, so each receiver's insert depends on the giver's row being moved first.
	const result = await store.trade(
		{ ...a, offer: { items: [{ id: sword.id, qty: 1 }, { id: "stack:jelly_slime", qty: 4 }], gold: 0 }, profile },
		{ ...b, offer: { items: [{ id: crystal.id, qty: 1 }], gold: 400 }, profile },
		{ tradeId: randomUUID() },
	);
	assert.equal(result.error, undefined);
	const after = { a: await store.inventory(a.accountId, a.id), b: await store.inventory(b.accountId, b.id) };
	assert.equal(bagItem(after.a.inventory, "crystal_sword")?.id, crystal.id);
	assert.equal(bagItem(after.b.inventory, "leaf_sword")?.id, sword.id);
	assert.equal(bagItem(after.a.inventory, "jelly_slime"), undefined);
	assert.equal(bagItem(after.b.inventory, "jelly_slime")?.qty, 4);
	assert.equal(after.a.gold, 400);
	assert.equal(after.b.gold, 500);
	// A failed rule leaves both sides untouched.
	const refused = await store.trade({ ...a, offer: { items: [{ id: sword.id, qty: 1 }], gold: 0 }, profile }, { ...b, offer: { items: [], gold: 0 }, profile }, { tradeId: randomUUID() });
	assert.match(refused.error ?? "", /กระเป๋า/);
	assert.deepEqual((await store.integrity()).issues, []);
});
