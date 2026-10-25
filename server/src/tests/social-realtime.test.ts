import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { createApp } from "../app.js";
import { MemoryStore } from "../store/memory.js";
import { mountRealtime } from "../realtime/index.js";
import { GATE_CAPTAIN, CITY_BUILDINGS, expShares } from "@the-beginning-online/shared";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fixture(t: any, sharedRooms = false) {
	const store = new MemoryStore(),
		app = createApp({ store, build: "test" }),
		server = app.listen(0, "127.0.0.1");
	await once(server, "listening");
	const rt = mountRealtime(server, {
		store,
		build: "test",
		sharedRooms,
		reconnectMs: 250,heartbeatMs:100,pruneMs:100,
	});
	const base = `http://127.0.0.1:${(server.address() as any).port}`;
	const call = async (path: string, body?: unknown, cookie = "") => {
		const r = await fetch(base + path, {
			method: body === undefined ? "GET" : "POST",
			headers: { Cookie: cookie, "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		return {
			status: r.status,
			data: await r.json(),
			cookie: r.headers.get("set-cookie")?.split(";")[0] || "",
		};
	};
	const make = async (name: string, meadow = false) => {
		const guest = await call("/api/guest", {}),
			c = await call("/api/characters", { name, jobId: "swordsman" }, guest.cookie);
		if(meadow)await store.saveProgress(c.data.character.accountId,c.data.character.id,{...c.data.character,mapId:"meadow",posX:-1,posZ:6});
		await call(
			`/api/characters/${c.data.character.id}/select`,
			{},
			guest.cookie,
		);
		return { cookie: guest.cookie, character: c.data.character };
	};
	const sockets: WebSocket[] = [];
	function open(cookie = "", build = "test", origin?: string) {
		const ws = new WebSocket(
				base.replace("http", "ws") + `/api/ws?v=${build}&area=meadow-01`,
				{ headers: { Cookie: cookie, ...(origin ? { Origin: origin } : {}) } },
			),
			messages: any[] = [];
		ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
		ws.on("error", () => {});
		sockets.push(ws);
		const closed = new Promise<[number,Buffer]>(resolve=>ws.once("close",(code,reason)=>resolve([code,reason])));
		return {
			ws,
			closed,
			messages,
			send: (m: unknown) => ws.send(JSON.stringify(m)),
			async until(predicate: (m: any) => boolean) {
				for (let i = 0; i < 200; i++) {
					const m = messages.find(predicate);
					if (m) return m;
					await wait(10);
				}
				throw Error("No expected WebSocket message");
			},
		};
	}
	t.after(async () => {
		for (const s of sockets) s.terminate();
		await rt.close();
		server.closeAllConnections();
		await new Promise<void>((r) => server.close(() => r()));
	});
	return { store, rt, call, make, open };
}

async function join(f: any, name: string) {
	const user = await f.make(name), peer = f.open(user.cookie);
	await peer.until((m: any) => m.t === "welcome");
	peer.send({ t: "spawnReady" });
	await peer.until((m: any) => m.t === "snap");
	await peer.until((m: any) => m.t === "quests");
	const room = [...f.rt.rooms.values()].find((r: any) => r.game.players.has(user.character.id))!;
	return { user, peer, room, p: room.game.players.get(user.character.id)! };
}
const latest = (peer: any, t: string) => [...peer.messages].reverse().find((m: any) => m.t === t);

test("quests: accept at the giver, kills count, turn-in pays through the ledger and persists", async (t) => {
	const f = await fixture(t), { user, peer, room, p } = await join(f, "QuestHero");
	peer.send({ t: "quest", op: "accept", id: "guard_first_hunt" });
	assert.match((await peer.until((m: any) => m.t === "questError")).text, /ไปคุย/);
	p.x = GATE_CAPTAIN.x; p.z = GATE_CAPTAIN.z - 1;
	peer.send({ t: "quest", op: "accept", id: "smith_slime" });
	await peer.until((m: any) => m.t === "questError" && /ไปคุย|ยังรับ/.test(m.text));
	peer.send({ t: "quest", op: "accept", id: "guard_first_hunt" });
	await peer.until((m: any) => m.t === "quests" && m.state.active.guard_first_hunt);
	peer.send({ t: "quest", op: "turnIn", id: "guard_first_hunt" });
	assert.match((await peer.until((m: any) => m.t === "questError" && /ครบ/.test(m.text))).text, /ครบ/);
	for (let i = 0; i < 9; i++) room.game.events.push({ type: "kill", dataId: "jelly_pink", ownerId: p.id, playerId: p.id, x: p.x, z: p.z });
	room.game.events.push({ type: "kill", dataId: "jelly_mint", ownerId: p.id, playerId: p.id, x: p.x, z: p.z });
	await peer.until((m: any) => m.t === "quests" && m.state.active.guard_first_hunt?.progress[0] === 8);
	const gold = p.gold, xpBefore = p.xp + p.level * 1e6;
	peer.send({ t: "quest", op: "turnIn", id: "guard_first_hunt" });
	await peer.until((m: any) => m.t === "quests" && m.state.done.guard_first_hunt);
	await peer.until((m: any) => m.t === "ev" && m.list.some((e: any) => e.type === "questComplete"));
	assert.equal(p.gold, gold + 80);
	assert.ok(p.xp + p.level * 1e6 > xpBefore);
	assert.equal(p.inventory!.items.find((i: any) => i.template === "red_small")!.qty, 10);
	peer.send({ t: "quest", op: "turnIn", id: "guard_first_hunt" });
	await peer.until((m: any) => m.t === "questError" && /ครบ/.test(m.text));
	assert.equal(p.gold, gold + 80);
	await f.rt.save(room, p.id, true);
	const saved = (await f.store.character(user.character.accountId, p.id))!;
	assert.ok(saved.quests!.done.guard_first_hunt);
	assert.equal((f.store as any).ledger.filter((l: any) => l.character === p.id && l.entry.kind === "quest").reduce((s: number, l: any) => s + l.entry.goldDelta, 0), 80);
	assert.equal((await f.store.integrity()).ok, true);
});

test("storage keeper: range-checked deposit counts for the storage quest", async (t) => {
	const f = await fixture(t), { peer, p } = await join(f, "StoreHero");
	const keeper = CITY_BUILDINGS.find(b => b.id === "storage")!.talk;
	peer.send({ t: "inv", op: "store", req: randomUUID(), id: "stack:bound:red_small", qty: 1 });
	assert.match((await peer.until((m: any) => m.t === "inv" && m.error)).error, /คนเฝ้าคลัง/);
	p.x = keeper.x; p.z = keeper.z + 1;
	peer.send({ t: "quest", op: "accept", id: "storage_ledger" });
	await peer.until((m: any) => m.t === "quests" && m.state.active.storage_ledger);
	peer.send({ t: "inv", op: "store", req: randomUUID(), id: "stack:bound:red_small", qty: 2 });
	await peer.until((m: any) => m.t === "quests" && m.state.active.storage_ledger?.progress[0] === 1);
	assert.equal(p.inventory!.items.find((i: any) => i.id === "stack:storage:bound:red_small")!.qty, 2);
	peer.send({ t: "quest", op: "turnIn", id: "storage_ledger" });
	await peer.until((m: any) => m.t === "quests" && m.state.done.storage_ledger);
});

test('quest turn-in rejects abandonment while pending and commits EXP with rewards', async t => {
 const f=await fixture(t),{user,peer,room,p}=await join(f,'QuestRace');
 const at=CITY_BUILDINGS.find(b=>b.id==='storage')!.talk;p.x=at.x;p.z=at.z;
 peer.send({t:'quest',op:'accept',id:'storage_ledger'});
 await peer.until((m:any)=>m.t==='quests'&&m.state.active.storage_ledger);
 p.quests!.active.storage_ledger.progress[0]=1;await f.rt.save(room,p.id,true);
 const before=p.gold,original=f.store.inventoryOp.bind(f.store);
 let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);
 t.after(()=>release());
 f.store.inventoryOp=async(...args)=>{entered();await gate;return original(...args);};
 peer.send({t:'quest',op:'turnIn',id:'storage_ledger'});await started;
 peer.send({t:'quest',op:'abandon',id:'storage_ledger'});
 await peer.until((m:any)=>m.t==='questError'&&m.text.includes('กำลังส่ง'));
 assert.equal(p.gold,before);assert.ok(p.quests!.active.storage_ledger);
 // A subsequent progress-save outage cannot split EXP/completion from the reward.
 f.store.saveProgress=async()=>{throw Error('progress save unavailable');};
 release();await peer.until((m:any)=>m.t==='quests'&&m.state.done.storage_ledger);
 const saved=(await f.store.character(user.character.accountId,p.id))!;
 assert.equal(saved.gold,before+30);assert.ok(saved.quests!.done.storage_ledger);
 assert.equal(saved.xp,p.xp);assert.equal(saved.jobExp,p.jobExp);
 peer.send({t:'quest',op:'accept',id:'storage_ledger'});
 await peer.until((m:any)=>m.t==='questError'&&m.text.includes('รับเควสต์นี้แล้ว'));
 assert.equal(p.gold,before+30);
});

test('failed quest transaction leaves live rewards and completion unchanged and can retry',async t=>{
 const f=await fixture(t),{peer,room,p}=await join(f,'QuestRetry');
 const at=CITY_BUILDINGS.find(b=>b.id==='storage')!.talk;p.x=at.x;p.z=at.z;
 peer.send({t:'quest',op:'accept',id:'storage_ledger'});
 await peer.until((m:any)=>m.t==='quests'&&m.state.active.storage_ledger);
 p.quests!.active.storage_ledger.progress[0]=1;await f.rt.save(room,p.id,true);
 const gold=p.gold,xp=p.xp,original=f.store.inventoryOp.bind(f.store);
 f.store.inventoryOp=async()=>{throw Error('injected transaction failure');};
 peer.send({t:'quest',op:'turnIn',id:'storage_ledger'});
 await peer.until((m:any)=>m.t==='inv'&&m.error==='injected transaction failure');
 assert.equal(p.gold,gold);assert.equal(p.xp,xp);assert.equal(p.quests!.done.storage_ledger,undefined);
 f.store.inventoryOp=original;
 peer.send({t:'quest',op:'turnIn',id:'storage_ledger'});
 await peer.until((m:any)=>m.t==='quests'&&m.state.done.storage_ledger);
 assert.equal(p.gold,gold+30);
});

test('party manager protocol supports creation, authoritative status and disband over WebSocket',async t=>{
 const f=await fixture(t),a=await join(f,'PartyMaker'),b=await join(f,'PartyFriend');
 a.peer.send({t:'party',op:'create'});
 const created=await a.peer.until((m:any)=>m.t==='partyState'&&m.party?.members.length===1);
 a.peer.send({t:'party',op:'invite',name:'PartyFriend'});
 const invitation=await b.peer.until((m:any)=>m.t==='partyInvite');assert.ok(invitation.expiresAt>Date.now());
 b.peer.send({t:'party',op:'accept',id:created.party.id});
 const joined=await a.peer.until((m:any)=>m.t==='partyState'&&m.party?.members.length===2);
 assert.ok(joined.party.members.every((m:any)=>Number.isFinite(m.mp)&&m.maxMp>0));
 b.peer.send({t:'party',op:'disband'});await b.peer.until((m:any)=>m.t==='chatError'&&m.scope==='party');
 a.peer.messages.length=0;b.peer.messages.length=0;a.peer.send({t:'party',op:'disband'});
 await a.peer.until((m:any)=>m.t==='partyState'&&m.party===null);await b.peer.until((m:any)=>m.t==='partyState'&&m.party===null);
 a.peer.send({t:'party',op:'status'});assert.equal(latest(a.peer,'partyState').party,null);
});

test("chat and party over WebSocket: map chat, whisper, invite and party chat", async (t) => {
	const f = await fixture(t), a = await join(f, "ChatA"), b = await join(f, "ChatB");
	a.peer.send({ t: "chat", ch: "map", text: "สวัสดี ควย" });
	assert.equal((await b.peer.until((m: any) => m.t === "chat" && m.from === "ChatA")).text, "สวัสดี ✱✱✱");
	b.peer.send({ t: "chat", ch: "whisper", to: "chata", text: "ปาร์ตี้ไหม" });
	await a.peer.until((m: any) => m.t === "chat" && m.ch === "whisper" && m.from === "ChatB");
	a.peer.send({ t: "party", op: "invite", name: "ChatB" });
	const invite = await b.peer.until((m: any) => m.t === "partyInvite");
	b.peer.send({ t: "party", op: "accept", id: invite.partyId });
	await a.peer.until((m: any) => m.t === "partyState" && m.party?.members.length === 2);
	await wait(1100);
	b.peer.send({ t: "chat", ch: "party", text: "ไปกัน" });
	await a.peer.until((m: any) => m.t === "chat" && m.ch === "party" && m.text === "ไปกัน");
	assert.ok(latest(b.peer, "partyState").party.members.some((m: any) => m.name === "ChatA" && m.online));
});


test('party EXP spans the whole map, excludes other maps, loading peers and disconnected avatars',async t=>{
 const f=await fixture(t,true),a=await join(f,'PartyFarA'),b=await join(f,'PartyFarB');
 const other=await f.make('PartyOther',true),c=f.open(other.cookie);
 await c.until((m:any)=>m.t==='welcome');c.send({t:'spawnReady'});await c.until((m:any)=>m.t==='snap');
 for(const member of [b,{user:other,peer:c}]){
  a.peer.send({t:'party',op:'invite',name:member.user.character.name});
  const invite=await member.peer.until((m:any)=>m.t==='partyInvite');
  member.peer.send({t:'party',op:'accept',id:invite.partyId});
  await member.peer.until((m:any)=>m.t==='partyState'&&m.party?.members.some((p:any)=>p.id===member.user.character.id));
 }
 a.p.x=-40;a.p.z=-40;b.p.x=40;b.p.z=40;
 const ids=()=>expShares(a.room.game,a.p,100,50).map(s=>[s.player.id,s.xp,s.jobExp]);
 assert.deepEqual(ids(),[[a.p.id,55,27],[b.p.id,55,27]],'distance and other-map party member do not affect this room bonus');
 const bPeer=b.room.peers.get(b.p.id)!;bPeer.ready=false;
 assert.deepEqual(ids(),[[a.p.id,100,50]],'loading peer earns no bonus');bPeer.ready=true;
 b.peer.ws.close();await b.peer.closed;await wait(20);
 assert.ok(a.room.game.players.has(b.p.id),'avatar remains for reconnect grace');
 assert.deepEqual(ids(),[[a.p.id,100,50]],'offline grace avatar earns no bonus');
});

test('party EXP does not cross isolated rooms even with the same map id',async t=>{
 const f=await fixture(t,false),a=await join(f,'ChannelOne'),b=await join(f,'ChannelTwo');
 assert.equal(a.room.game.mapId,b.room.game.mapId);assert.notEqual(a.room,b.room);
 a.peer.send({t:'party',op:'invite',name:b.user.character.name});
 const invite=await b.peer.until((m:any)=>m.t==='partyInvite');b.peer.send({t:'party',op:'accept',id:invite.partyId});
 await b.peer.until((m:any)=>m.t==='partyState'&&m.party?.members.length===2);
 assert.deepEqual(a.room.game.partyMembers!(a.p.id),[a.p.id]);
 assert.deepEqual(expShares(a.room.game,a.p,100,50).map(s=>[s.player.id,s.xp]),[[a.p.id,100]]);
});


test('online directory and one-click invites work through the validated websocket protocol',async t=>{
 const f=await fixture(t,true),a=await join(f,'OnlineHost'),b=await join(f,'OnlineGuest');
 a.peer.send({t:'party',op:'online'});const directory=await a.peer.until((m:any)=>m.t==='partyOnline');
 assert.equal(directory.list.find((p:any)=>p.id===b.p.id).name,'OnlineGuest');
 a.peer.send({t:'party',op:'inviteNearby',id:b.p.id});
 const invite=await b.peer.until((m:any)=>m.t==='partyInvite');b.peer.send({t:'party',op:'accept',id:invite.partyId});
 await a.peer.until((m:any)=>m.t==='partyState'&&m.party?.members.length===2);
});
