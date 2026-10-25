import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createApp } from "../app.js";
import { MemoryStore } from "../store/memory.js";
import { ADMIN_SEED_UIDS } from "../store/types.js";
import { mountRealtime } from "../realtime/index.js";
import { adminAccess } from "../admin.js";
import { MEADOW_ENTRY, FIELD_BOSS } from "@the-beginning-online/shared";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fixture(t: any, options: { gmCommandsPer10s?: number; adminIds?: string[] } = {}) {
	const store = new MemoryStore(), adminIds = options.adminIds ?? [],
		app = createApp({ store, build: "test", adminIds, realtimeMetrics: () => ({ rooms: 1 }) }),
		server = app.listen(0, "127.0.0.1");
	await once(server, "listening");
	const rt = mountRealtime(server, { store, build: "test", sharedRooms: true, reconnectMs: 250, heartbeatMs: 100, pruneMs: 100, adminIds, gmCommandsPer10s: options.gmCommandsPer10s ?? 1000 });
	const base = `http://127.0.0.1:${(server.address() as any).port}`;
	const call = async (path: string, body?: unknown, cookie = "") => {
		const r = await fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
		return { status: r.status, data: await r.json().catch(() => ({})), cookie: r.headers.get("set-cookie")?.split(";")[0] || "" };
	};
	const sockets: WebSocket[] = [];
	async function join(name: string, map?: "meadow") {
		const guest = await call("/api/guest", {}), c = await call("/api/characters", { name, jobId: "swordsman" }, guest.cookie);
		const character = c.data.character;
		if (map) await store.saveProgress(character.accountId, character.id, { ...character, mapId: map, posX: MEADOW_ENTRY.x, posZ: MEADOW_ENTRY.z });
		await call(`/api/characters/${character.id}/select`, {}, guest.cookie);
		const ws = new WebSocket(base.replace("http", "ws") + "/api/ws?v=test&area=meadow-01", { headers: { Cookie: guest.cookie } }), messages: any[] = [];
		ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
		ws.on("error", () => {});
		sockets.push(ws);
		const closed = new Promise<number>((resolve) => ws.once("close", (code) => resolve(code)));
		const until = async (predicate: (m: any) => boolean) => {
			for (let i = 0; i < 300; i++) { const m = messages.find(predicate); if (m) return m; await wait(10); }
			throw Error("No expected WebSocket message");
		};
		await until((m) => m.t === "welcome");
		ws.send(JSON.stringify({ t: "spawnReady" }));
		await until((m) => m.t === "quests");
		const account = (await store.account(character.accountId))!;
		const room = () => [...rt.rooms.values()].find((r: any) => r.game.players.has(character.id))!;
		const peer = {
			name, cookie: guest.cookie, character, account, uid: account.uid, messages, closed, until, room,
			get p() { return room().game.players.get(character.id)!; },
			say: (text: string) => ws.send(JSON.stringify({ t: "chat", ch: "map", text })),
			/** Sends a command and waits for the next [GM] reply that matches. */
			async gm(text: string, match: RegExp = /./) {
				await wait(40); // stays under the socket's 30 messages/s cap
				const from = messages.length;
				ws.send(JSON.stringify({ t: "chat", ch: "map", text }));
				for (let i = 0; i < 300; i++) {
					const m = messages.slice(from).find((m) => (m.t === "chat" && m.ch === "system" && m.text.startsWith("[GM]") && match.test(m.text)) || m.t === "chatError");
					if (m) return m.text as string;
					await wait(10);
				}
				throw Error("No GM reply to " + text);
			},
		};
		return peer;
	}
	const promote = (uid: string) => store.setAdmin(uid, true, { accountId: "test", uid: "test" });
	t.after(async () => {
		for (const s of sockets) s.terminate();
		await rt.close();
		server.closeAllConnections();
		await new Promise<void>((r) => server.close(() => r()));
	});
	return { store, rt, call, join, promote, adminIds };
}

test("store: admin role by UID, last-admin guard and audit; the UID seed applies once on MemoryStore", async () => {
	const store = new MemoryStore();
	const a = await store.createGuest("ha"), b = await store.createGuest("hb");
	assert.equal((await store.accountByUid(a.uid))!.id, a.id);
	assert.equal(await store.accountByUid("000000000"), undefined);
	await assert.rejects(store.setAdmin("000000000", true, { accountId: a.id, uid: a.uid }), { code: "NOT_FOUND" });
	assert.equal((await store.setAdmin(a.uid, true, { accountId: "boot", uid: "" })).changed, true);
	assert.equal((await store.setAdmin(a.uid, true, { accountId: a.id, uid: a.uid })).changed, false);
	await assert.rejects(store.setAdmin(a.uid, false, { accountId: a.id, uid: a.uid }), { code: "LAST_ADMIN" });
	await store.setAdmin(b.uid, true, { accountId: a.id, uid: a.uid });
	await store.setAdmin(a.uid, false, { accountId: a.id, uid: a.uid });
	assert.deepEqual((await store.adminAccounts()).map((x) => x.uid), [b.uid]);
	const log = await store.auditLog();
	assert.deepEqual(log.map((e) => [e.action, e.actorUid, e.targetUid]), [["admin.remove", a.uid, a.uid], ["admin.add", a.uid, b.uid], ["admin.add", "", a.uid]]);
	assert.ok(log.every((e) => e.at));

	// Seed (mirrors sql/016_admin.sql): waits for the account, applies once, a later revoke survives restarts.
	assert.deepEqual(ADMIN_SEED_UIDS, ["269718289"]);
	const seed = await store.createGuest("hs");
	await store.init();
	assert.equal((await store.account(seed.id))!.isAdmin, undefined);
	(store as any).accounts.get(seed.id).uid = "269718289";
	await store.init();
	assert.equal((await store.accountByUid("269718289"))!.isAdmin, true);
	assert.equal((await store.auditLog(1))[0].action, "admin.seed");
	await store.setAdmin("269718289", false, { accountId: b.id, uid: b.uid });
	await store.init();
	assert.equal((await store.accountByUid("269718289"))!.isAdmin, false);
	assert.equal((await store.auditLog()).filter((e) => e.action === "admin.seed").length, 1);
});

test("one admin helper: stored role, ADMIN_IDS by id or uid, publicAccount hides the flag", async () => {
	const store = new MemoryStore(), a = await store.createGuest("h1"), b = await store.createGuest("h2"), c = await store.createGuest("h3");
	const ids = [b.id, c.uid], access = adminAccess(store, ids);
	assert.equal(await access.isAdmin(a.id), false);
	await store.setAdmin(a.uid, true, { accountId: "t", uid: "t" });
	assert.equal(await access.isAdmin(a.id), true);
	assert.equal(await access.isAdmin(b.id), true);
	assert.equal(await access.isAdmin(c.id), true);
	assert.equal(await access.isAdmin("missing"), false);
	const { publicAccount } = await import("../store/types.js");
	assert.equal("isAdmin" in publicAccount((await store.account(a.id))!), false);
});

test("HTTP admin routes accept a stored admin (no ADMIN_IDS needed)", async (t) => {
	const f = await fixture(t), guest = await f.call("/api/guest", {});
	assert.equal((await f.call("/api/admin/realtime", undefined, guest.cookie)).status, 403);
	await f.promote(guest.data.account.uid);
	const ok = await f.call("/api/admin/realtime", undefined, guest.cookie);
	assert.equal(ok.status, 200);
	assert.equal(ok.data.rooms, 1);
	assert.equal((await f.call("/api/admin/economy/integrity", {}, guest.cookie)).status, 200);
});

test("players get a generic unknown command; GM text is never broadcast; denied attempts are audited", async (t) => {
	const f = await fixture(t), player = await f.join("Plain"), other = await f.join("Watcher");
	for (const text of ["/gm help", "/gm admin add 123456789", "/notice hi", "/whatever"])
		assert.equal(await player.gm(text), "ไม่รู้จักคำสั่งนี้ · พิมพ์ /help ดูคำสั่ง");
	await wait(100);
	assert.ok(!other.messages.some((m) => m.t === "chat" && m.ch !== "system"));
	assert.ok(!player.messages.some((m) => m.t === "gmRole"));
	assert.equal((await f.store.adminAccounts()).length, 0);
	const denied = (await f.store.auditLog()).filter((e) => e.action === "gm.denied");
	assert.equal(denied.length, 2);
	assert.equal(denied[0].actorUid, player.uid);
	// An admin's mistyped non-/gm command gets the same reply.
	await f.promote(other.uid);
	assert.equal(await other.gm("/notice hi"), "ไม่รู้จักคำสั่งนี้ · พิมพ์ /help ดูคำสั่ง");
});

test("admin commands: help, validation, teleport, heal, levels, god, speed, who, announce — each audited", async (t) => {
	const f = await fixture(t), admin = await f.join("Steward"), other = await f.join("Hero");
	await f.promote(admin.uid);
	assert.match(await admin.gm("/gm help", /คำสั่ง GM/), /คำสั่ง GM/);
	assert.match(await admin.gm("/gm nope"), /ไม่มีคำสั่ง/);
	for (const bad of ["/gm tp 1", "/gm tp abc 2", "/gm tp nowhere", "/gm level 0", "/gm level 101", "/gm speed 9", "/gm give BAD!", "/gm gold -5", "/gm admin add 12", "/gm mute Hero", "/gm kill 999", "/gm god maybe"])
		assert.match(await admin.gm(bad), /รูปแบบไม่ถูกต้อง/, bad);

	assert.match(await admin.gm("/gm tp 3 18"), /วาร์ปไป \(3, 18\)/);
	assert.deepEqual([admin.p.x, admin.p.z], [3, 18]);
	assert.match(await admin.gm("/gm tp 999 0"), /รูปแบบ/);
	assert.match(await admin.gm("/gm tp meadow"), /ทุ่งวุ้นจิ๋ว/);
	assert.equal(admin.room().game.mapId, "meadow");
	assert.match(await admin.gm("/gm tp city_plaza"), /เมือง/);

	other.p.hp = 1; other.p.mp = 0;
	assert.match(await admin.gm(`/gm heal ${other.uid}`), /ฟื้นฟู Hero/);
	assert.equal(other.p.hp, other.p.maxHp);
	other.p.dead = true; other.p.hp = 0;
	await admin.gm("/gm heal hero");
	assert.equal(other.p.dead, false);

	const points = admin.p.statPoints + Object.values(admin.p.profile.baseStats).reduce((a: number, b: any) => a + b, 0);
	assert.match(await admin.gm("/gm level 20"), /เป็น 20/);
	assert.equal(admin.p.level, 20);
	await admin.until((m) => m.t === "ev" && m.list.some((e: any) => e.type === "stats" && e.profile.level === 20));
	await admin.gm("/gm level 5");
	assert.equal(admin.p.level, 5);
	assert.ok(admin.p.statPoints + Object.values(admin.p.profile.baseStats).reduce((a: number, b: any) => a + b, 0) <= points + 19 * 5);
	assert.match(await admin.gm(`/gm joblevel 10 ${other.uid}`), /อาชีพ Hero/);
	assert.equal(other.p.jobLevel, 10);
	assert.match(await admin.gm("/gm joblevel 70"), /สูงสุด 50/);

	assert.match(await admin.gm("/gm god"), /เปิดอมตะ/);
	assert.equal(admin.p.god, true);
	await admin.gm("/gm god off");
	assert.equal(admin.p.god, undefined);
	await admin.gm("/gm speed 2");
	await wait(150);
	const own = [...admin.messages].reverse().find((m) => m.t === "snap")!.players.find((p: any) => p.id === admin.character.id);
	assert.ok(own.moveSpeed >= admin.p.stats.moveSpeed * 2 - 1e-6);
	assert.ok(!("gmSpeed" in own) && !("god" in own));
	await admin.gm("/gm speed 1");
	assert.equal(admin.p.gmSpeed, undefined);

	const who = await admin.gm("/gm who", /ออนไลน์/);
	assert.match(who, /ออนไลน์ 2 คน/);
	await admin.until((m) => m.t === "chat" && m.text.includes(`Hero · UID ${other.uid}`));
	await admin.gm("/gm announce ปิดปรับปรุง 5 นาที", /ประกาศแล้ว/);
	await other.until((m) => m.t === "chat" && m.ch === "system" && m.text === "📢 ปิดปรับปรุง 5 นาที");

	await wait(50);
	const log = await f.store.auditLog(200);
	const heal = log.find((e) => e.action === "gm.heal" && e.detail?.ok)!;
	assert.equal(heal.actorUid, admin.uid);
	assert.equal(heal.targetUid, other.uid);
	assert.ok(log.some((e) => e.action === "gm.tp" && e.detail?.ok === false));
	assert.ok(log.some((e) => e.action === "gm.announce"));
	// The commands never reached anyone else's chat.
	assert.ok(!other.messages.some((m) => m.t === "chat" && typeof m.text === "string" && m.text.includes("/gm")));
});

test("give and gold go through the ledgered economy path", async (t) => {
	const f = await fixture(t), admin = await f.join("Banker"), other = await f.join("Client");
	await f.promote(admin.uid);
	const gold = other.p.gold;
	assert.match(await admin.gm(`/gm gold 500 ${other.uid}`), /ให้ทอง 500/);
	assert.equal(other.p.gold, gold + 500);
	await other.until((m) => m.t === "inv" && m.gold === gold + 500);
	assert.match(await admin.gm("/gm give red_small 7"), /×7/);
	assert.equal(admin.p.inventory!.items.filter((i) => i.template === "red_small" && i.location === "bag").reduce((n,i)=>n+i.qty,0) >= 12, true);
	assert.match(await admin.gm("/gm give not_an_item"), /ไม่พบไอเทม/);
	assert.match(await admin.gm('/gm give field_sword 2'), /×2/);
	const rolled=admin.p.inventory!.items.filter(i=>i.template==='field_sword');assert.equal(rolled.length,2);assert.ok(rolled.every(i=>i.roll?.affixes.length));assert.notEqual(rolled[0].id,rolled[1].id);
	assert.match(await admin.gm('/gm give unique_mist_weaver'), /×1/);assert.equal(admin.p.inventory!.items.find(i=>i.template==='unique_mist_weaver')?.roll?.quality,'unique');
	const ledger = (f.store as any).ledger.filter((l: any) => l.entry.kind === "admin" && (l.entry.goldDelta === 500 || l.entry.template === "red_small" && l.entry.qty === 7));
	assert.equal(ledger.length, 2);
	assert.equal((await f.store.integrity()).ok, true);
});

test("field commands: spawn, kill, boss", async (t) => {
	const f = await fixture(t), admin = await f.join("Ranger", "meadow");
	await f.promote(admin.uid);
	const g = admin.room().game;
	assert.match(await admin.gm("/gm spawn king_jelly"), /บอสใช้/);
	assert.match(await admin.gm("/gm spawn ghost"), /ไม่พบมอนสเตอร์/);
	const before = g.enemies.length;
	assert.match(await admin.gm("/gm spawn jelly_mint 3"), /×3/);
	const made = g.enemies.slice(before);
	assert.equal(made.length, 3);
	assert.ok(made.every((e) => e.gm && e.dataId === "jelly_mint" && e.variant === "mint"));
	assert.match(await admin.gm("/gm kill 10"), /ล้างมอนสเตอร์ [3-9]/);
	assert.ok(made.every((e) => e.dead && e.rewarded));
	await wait(3500);
	assert.ok(made.every((e) => !g.enemies.includes(e)), "GM spawns are removed, not respawned");
	const boss = g.enemies.find((e) => e.boss && !e.summoned)!;
	boss.hp = 1;
	assert.match(await admin.gm("/gm boss"), /รีเซ็ตบอส/);
	assert.equal(boss.hp, boss.maxHp);
	assert.deepEqual([boss.x, boss.z], [FIELD_BOSS.meadow.x, FIELD_BOSS.meadow.z]);
	Object.assign(boss, { dead: true, respawn: 900, deathAge: 99, rewarded: true });
	assert.match(await admin.gm("/gm boss"), /เกิดใหม่/);
	for (let i = 0; i < 50 && boss.dead; i++) await wait(20);
	assert.equal(boss.dead, false);
	await admin.gm("/gm tp city_plaza");
	assert.match(await admin.gm("/gm spawn jelly_pink"), /เฉพาะในสนาม/);
});

test("goto, summon, mute, kick", async (t) => {
	const f = await fixture(t), admin = await f.join("Warden"), other = await f.join("Roamer", "meadow");
	await f.promote(admin.uid);
	assert.match(await admin.gm(`/gm goto ${other.uid}`), /วาร์ปไปหา Roamer/);
	assert.equal(admin.room().game.mapId, "meadow");
	assert.ok(Math.hypot(admin.p.x - other.p.x, admin.p.z - other.p.z) < 1.5);
	await admin.gm("/gm tp city_plaza");
	assert.match(await admin.gm("/gm summon roamer"), /ดึง Roamer/);
	assert.equal(other.room().game.mapId, "city_plaza");
	await other.until((m) => m.t === "chat" && /เรียกคุณ/.test(m.text));
	assert.match(await admin.gm("/gm goto 999999999"), /ไม่พบผู้เล่น/);

	assert.match(await admin.gm(`/gm mute ${other.uid} 5`), /ปิดแชท 5 นาที/);
	await wait(1100);
	other.say("hello?");
	await other.until((m) => m.t === "chatError" && /ปิดแชท/.test(m.text));
	await admin.gm(`/gm unmute ${other.uid}`, /เปิดแชท/);
	other.say("free");
	await admin.until((m) => m.t === "chat" && m.ch === "map" && m.text === "free");

	assert.match(await admin.gm("/gm kick Warden"), /ตัวเอง/);
	assert.match(await admin.gm(`/gm kick ${other.uid} spam bot`), /เตะ Roamer/);
	assert.equal((await other.until((m) => m.t === "kick")).reason, "ถูกทีมงานเตะออกจากเกม · spam bot");
	assert.equal(await other.closed, 4410);
	await wait(50);
	const kick = (await f.store.auditLog()).find((e) => e.action === "gm.kick")!;
	assert.deepEqual([kick.actorUid, kick.targetUid, kick.detail?.args], [admin.uid, other.uid, [other.uid, "spam bot"]]);
});

test("admins promote by UID live (no reconnect), revoke, and cannot drop the last admin", async (t) => {
	const f = await fixture(t), admin = await f.join("Root"), other = await f.join("Helper");
	await f.promote(admin.uid);
	assert.equal(await other.gm("/gm help"), "ไม่รู้จักคำสั่งนี้ · พิมพ์ /help ดูคำสั่ง");
	assert.match(await admin.gm("/gm admin list"), /แอดมิน 1 บัญชี/);
	assert.match(await admin.gm("/gm admin add 000000001"), /ไม่พบบัญชี/);
	assert.match(await admin.gm(`/gm admin remove ${admin.uid}`), /คนสุดท้าย/);
	assert.match(await admin.gm(`/gm admin add ${other.uid}`), new RegExp(`เพิ่มสิทธิ์แอดมิน UID ${other.uid}`));
	assert.equal((await other.until((m) => m.t === "gmRole")).admin, true);
	assert.match(await other.gm("/gm help", /คำสั่ง GM/), /คำสั่ง GM/);
	assert.match(await admin.gm(`/gm admin add ${other.uid}`), /อยู่แล้ว/);
	// The new admin removes the first; then can't remove themselves.
	assert.match(await other.gm(`/gm admin remove ${admin.uid}`), /ถอนสิทธิ์/);
	await admin.until((m) => m.t === "gmRole" && m.admin === false);
	assert.equal(await admin.gm("/gm who"), "ไม่รู้จักคำสั่งนี้ · พิมพ์ /help ดูคำสั่ง");
	assert.match(await other.gm(`/gm admin remove ${other.uid}`), /คนสุดท้าย/);
	const log = (await f.store.auditLog()).filter((e) => e.action === "admin.add" || e.action === "admin.remove");
	assert.deepEqual(log.slice(0, 2).map((e) => [e.action, e.actorUid, e.targetUid]), [["admin.remove", other.uid, admin.uid], ["admin.add", admin.uid, other.uid]]);
	// Badge on spawn only for admins.
	assert.ok(other.messages.some((m) => m.t === "gmRole" && m.admin));
});

test("ADMIN_IDS still works as an override (by internal id or UID) and survives /gm admin remove", async (t) => {
	const adminIds: string[] = [];
	const f = await fixture(t, { adminIds }), boot = await f.join("Boot"), stored = await f.join("Stored");
	adminIds.push(boot.uid);
	assert.match(await boot.gm(`/gm admin add ${stored.uid}`), /เพิ่มสิทธิ์/);
	assert.match(await stored.gm(`/gm admin remove ${stored.uid}`), /คนสุดท้าย/);
	await f.promote(boot.uid);
	assert.match(await stored.gm(`/gm admin remove ${boot.uid}`), /ยังเป็นแอดมินผ่าน ADMIN_IDS/);
	assert.match(await boot.gm("/gm who", /ออนไลน์/), /ออนไลน์/);
});

test("slash commands are rate-limited per account", async (t) => {
	const f = await fixture(t, { gmCommandsPer10s: 3 }), admin = await f.join("Spammy");
	await f.promote(admin.uid);
	for (let i = 0; i < 3; i++) assert.match(await admin.gm("/gm god"), /อมตะ/);
	assert.equal(await admin.gm("/gm god"), "ส่งคำสั่งถี่เกินไป รอสักครู่");
});

test("PostgresStore.setAdmin: serialised, last-admin guard, role change and audit in one transaction", async () => {
	const { PostgresStore } = await import("../store/postgres.js");
	const store = new PostgresStore("postgresql://localhost:1/test"), queries: { sql: string; args: any[] }[] = [];
	let admins = 1;
	const target = { id: "a", uid: "111111111", kind: "guest", display_name: "A", is_admin: true };
	const c: any = { query: async (sql: string, args: any[] = []) => {
		queries.push({ sql, args });
		if (sql.includes("WHERE uid=$1 FOR UPDATE")) return { rows: args[0] === target.uid ? [target] : [] };
		if (sql.includes("count(*)")) return { rows: [{ n: admins }] };
		if (sql.startsWith("UPDATE tn2_accounts SET is_admin")) return { rows: [{ ...target, is_admin: args[1] }] };
		return { rows: [] };
	} };
	(store as any).transaction = async (fn: any) => fn(c);
	await assert.rejects(store.setAdmin("999999999", true, { accountId: "x", uid: "x" }), { code: "NOT_FOUND" });
	await assert.rejects(store.setAdmin(target.uid, false, { accountId: "a", uid: target.uid }), { code: "LAST_ADMIN" });
	assert.ok(queries[0].sql.includes("pg_advisory_xact_lock"));
	assert.equal((await store.setAdmin(target.uid, true, { accountId: "a", uid: target.uid })).changed, false);
	admins = 2; queries.length = 0;
	const out = await store.setAdmin(target.uid, false, { accountId: "b", uid: "222222222" });
	assert.deepEqual([out.changed, out.account.isAdmin], [true, false]);
	assert.deepEqual(queries.find((q) => q.sql.includes("tn2_gm_audit"))!.args, ["b", "222222222", "admin.remove", target.uid]);
	await store.close();
});

test("migration 016 is re-runnable and seeds UID 269718289 only once", async () => {
	const { readFile } = await import("node:fs/promises");
	const sql = await readFile(new URL("../../sql/016_admin.sql", import.meta.url), "utf8");
	assert.match(sql, /ADD COLUMN IF NOT EXISTS is_admin/);
	assert.match(sql, /CREATE TABLE IF NOT EXISTS tn2_gm_audit/);
	assert.match(sql, /INSERT INTO tn2_admin_seeds\(uid\) SELECT uid FROM tn2_accounts WHERE uid IN \('269718289'\) ON CONFLICT \(uid\) DO NOTHING/);
	assert.doesNotMatch(sql, /^\s*(CREATE TABLE|CREATE INDEX|ALTER TABLE \S+ ADD COLUMN)(?! IF NOT EXISTS)/m);
	const init = (await readFile(new URL("../store/postgres.ts", import.meta.url), "utf8"));
	assert.ok(init.indexOf("016_admin.sql") > init.indexOf("015_accounts_password_uid.sql"));
});

test("PostgresStore: admin seed, grant/revoke and audit on a real database", { skip: !process.env.PG_TEST_URL && "PG_TEST_URL not set" }, async (t) => {
	const { PostgresStore } = await import("../store/postgres.js");
	const store = new PostgresStore(process.env.PG_TEST_URL!); t.after(() => store.close());
	await store.init();
	const pool = store.pool;
	let seed = await store.accountByUid("269718289");
	if (!seed) {
		await pool.query("DELETE FROM tn2_admin_seeds WHERE uid='269718289'");
		const a = await store.createGuest("seed-" + Date.now());
		await pool.query("ALTER TABLE tn2_accounts DISABLE TRIGGER tn2_accounts_uid_immutable");
		await pool.query("UPDATE tn2_accounts SET uid='269718289' WHERE id=$1", [a.id]);
		await pool.query("ALTER TABLE tn2_accounts ENABLE TRIGGER tn2_accounts_uid_immutable");
		await store.init(); await store.init();
		seed = await store.accountByUid("269718289");
		assert.equal(seed!.isAdmin, true);
		assert.equal((await pool.query("SELECT count(*)::int n FROM tn2_gm_audit WHERE action='admin.seed' AND target_uid='269718289'")).rows[0].n, 1);
	}
	const b = await store.createGuest("adm-" + Date.now());
	assert.equal((await store.setAdmin(b.uid, true, { accountId: seed!.id, uid: seed!.uid })).changed, true);
	assert.equal((await store.account(b.id))!.isAdmin, true);
	await store.setAdmin(b.uid, false, { accountId: seed!.id, uid: seed!.uid });
	await store.init();
	assert.equal((await store.account(b.id))!.isAdmin, false);
	const log = await store.auditLog(2);
	assert.deepEqual(log.map((e) => [e.action, e.targetUid]), [["admin.remove", b.uid], ["admin.add", b.uid]]);
});

test('new hunting rooms load their populations through the real websocket transfer',async(t)=>{
 const f=await fixture(t),admin=await f.join('Pathfinder');await f.promote(admin.uid);
 for(const [map,name] of [['ruins','ซากนครโบราณ'],['canyon','หุบเขาหิน']] as const){
  assert.match(await admin.gm(`/gm tp ${map}`),new RegExp(name));
  const room=admin.room();assert.equal(room.game.mapId,map);assert.equal(admin.p.mapId,map);
  assert.equal(room.game.enemies.filter(e=>!e.boss).length,map==='ruins'?74:90);
  assert.equal(room.game.enemies.find(e=>e.boss)?.dataId,FIELD_BOSS[map].dataId);
 }
 assert.match(await admin.gm('/gm tp forest'),/ป่าหมอก/);
});
