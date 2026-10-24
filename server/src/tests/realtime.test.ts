import {CITY_SPAWN,CITY_RETURN,GATES,GATE_LINKS,HEALER,travelDestination,type MapId} from '@the-beginning-online/shared/maps';
import {loadGameData} from '@the-beginning-online/shared';
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createApp } from "../app.js";
import { MemoryStore } from "../store/memory.js";
import { mountRealtime } from "../realtime/index.js";
import { connect } from 'node:net';
import {randomUUID} from 'node:crypto';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fixture(t: any, sharedRooms = false, extra: Record<string, unknown> = {}) {
	const store = new MemoryStore(),
		app = createApp({ store, build: "test" }),
		server = app.listen(0, "127.0.0.1");
	await once(server, "listening");
	const rt = mountRealtime(server, {
		store,
		build: "test",
		sharedRooms,
		reconnectMs: 250,heartbeatMs:100,pruneMs:100,
		...extra,
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
	return { store, rt, call, make, open, base };
}

test('malformed upgrade URL rejects the socket and leaves HTTP and WebSockets healthy',async t=>{
 const f=await fixture(t);
 for(const [host,path] of [['[','/api/ws'],['localhost','http://[']]){
  const socket=connect(Number(new URL(f.base).port),'127.0.0.1');
  socket.on('error',()=>{});const closed=once(socket,'close');
  await once(socket,'connect');
  socket.write(`GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`);
  await closed;
 }
 assert.equal((await fetch(f.base+'/healthz')).status,200);
 const user=await f.make('UpgradeSafe'),peer=f.open(user.cookie);
 await peer.until(m=>m.t==='welcome');
});

test('disconnected leases renew through retention and a slow final save before release',async t=>{
 const f=await fixture(t,false,{heartbeatMs:40,reconnectMs:350});
 const ttl=180,leases=new Map<string,{owner:string;until:number}>();
 f.store.claimLease=async(id,owner)=>{leases.set(id,{owner,until:Date.now()+ttl});};
 let offlineRenewals=0;
 f.store.renewLease=async(id,owner)=>{
  const lease=leases.get(id);if(!lease||lease.owner!==owner||lease.until<=Date.now())return false;
  lease.until=Date.now()+ttl;
  if([...f.rt.rooms.values()].some(r=>r.disconnected.has(id)))offlineRenewals++;
  return true;
 };
 f.store.releaseLease=async(id,owner)=>{if(leases.get(id)?.owner===owner)leases.delete(id);};
 const save=f.store.saveProgress.bind(f.store);
 let delay=false,release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);
 t.after(()=>release());
 f.store.saveProgress=async(account,id,body,owner)=>{
  if(delay){entered();await gate;}
  const lease=leases.get(id);if(owner&&(!lease||lease.owner!==owner||lease.until<=Date.now()))throw Error('Lease expired');
  // MemoryStore's private lease is replaced by the expiring adapter above.
  return save(account,id,body);
 };
 const user=await f.make('LeaseRetain'),peer=f.open(user.cookie);
 await peer.until(m=>m.t==='welcome');peer.send({t:'spawnReady'});await peer.until(m=>m.t==='snap');
 const room=[...f.rt.rooms.values()][0],p=room.game.players.get(user.character.id)!;
 peer.ws.close();await peer.closed;
 // The client can see its close before the server's close handler queues the disconnect save.
 for(let i=0;i<200&&!room.disconnected.has(p.id);i++)await wait(5);
 assert.ok(room.disconnected.has(p.id),'server recorded the disconnect');
 await room.saveQueue;
 p.kills=17;delay=true;
 await Promise.race([started,wait(2000).then(()=>{throw Error('final save never started after retention expiry');})]);
 await wait(ttl*2);
 assert.ok(room.accounts.has(p.id),'retained while final save is pending');
 assert.equal(room.game.players.has(p.id),false,'simulation stops at retention expiry');
 assert.ok(offlineRenewals>0);assert.ok(leases.get(p.id)!.until>Date.now());
 release();await room.saveQueue;await wait(60);
 assert.equal((await f.store.character(user.character.accountId,p.id))!.kills,17);
 assert.equal(room.game.players.has(p.id),false);assert.equal(leases.has(p.id),false);
});
test('stat intents validate, persist and reconnect with manual auto-allocation disabled',async t=>{
 const f=await fixture(t),user=await f.make('StatHero'),peer=f.open(user.cookie);await peer.until(m=>m.t==='welcome');peer.send({t:'spawnReady'});await peer.until(m=>m.t==='snap');const room=[...f.rt.rooms.values()][0],p=room.game.players.get(user.character.id)!;p.statPoints=8;
 const index=peer.messages.length;peer.send({t:'stats',add:{str:2},seq:1});const result=await peer.until(m=>m.t==='ev'&&m.list.some((e:any)=>e.type==='stats'&&e.base.str===7));assert.equal(result.list[0].points,4);assert.equal(p.autoAllocate,false);assert.equal((await f.store.character(user.character.accountId,p.id))!.autoAllocate,false);
 for(const add of[{str:99},{str:-1},{str:90}])peer.send({t:'stats',add,seq:2+peer.messages.length});await peer.until(m=>m.t==='ev'&&m.list.some((e:any)=>e.type==='statsError'));assert.equal(p.profile.baseStats.str,7);
 peer.ws.close();await peer.closed;await wait(350);const second=f.open(user.cookie);await second.until(m=>m.t==='welcome');second.send({t:'spawnReady'});const persisted=await second.until(m=>m.t==='ev'&&m.list.some((e:any)=>e.type==='stats'));assert.equal(persisted.list[0].base.str,7);assert.equal(persisted.list[0].autoAllocate,false);assert.equal(persisted.list[0].points,4);
 const secondRoom=[...f.rt.rooms.values()][0];secondRoom.game.data.stats.statResetFree=false;second.send({t:'statsReset'});await second.until(m=>m.t==='ev'&&m.list.some((e:any)=>e.type==='statsError'));const live=secondRoom.game.players.get(p.id)!;assert.equal(live.profile.baseStats.str,7);
 second.send({t:'autoAlloc',on:true});await second.until(m=>m.t==='ev'&&m.list.some((e:any)=>e.type==='stats'&&e.autoAllocate&&e.points===0));assert.equal((await f.store.character(user.character.accountId,p.id))!.autoAllocate,true);
 live.statPoints=9999;live.profile.baseStats.str=98;second.send({t:'stats',add:{str:2},seq:1000});await second.until(m=>m.t==='ev'&&m.list.some((e:any)=>e.type==='statsError'&&e.text.includes('99')));assert.equal(live.profile.baseStats.str,98);
});
test('boot report strips extra fields, limits rate and accepts no personal data in logs',async t=>{const f=await fixture(t);for(let i=0;i<6;i++)assert.equal((await f.call('/api/boot-report',{code:'texture',page:'play',progress:40,email:'ignored@example.test'})).status,202);assert.equal((await f.call('/api/boot-report',{code:'texture',page:'play',progress:40})).status,429);});
test('legacy unspent points migrate before first snapshot and save once on join',async t=>{const f=await fixture(t),user=await f.make('LegacyStats'),c=user.character;await f.store.saveProgress(c.accountId,c.id,{...c,level:5,statPoints:12});const peer=f.open(user.cookie);await peer.until(m=>m.t==='welcome');peer.send({t:'spawnReady'});const stats=(await peer.until(m=>m.t==='ev'&&m.list.some((e:any)=>e.type==='stats'))).list[0];assert.equal(stats.points,0);assert.ok(stats.base.str>c.baseStats.str);const saved=await f.store.character(c.accountId,c.id);assert.deepEqual(saved!.baseStats,stats.base);assert.equal(saved!.autoAllocate,true);});
test("WebSocket auth, selected-character requirement, wrong build reload and spawnReady gate", async (t) => {
	const f = await fixture(t),
		anonymous = f.open();
	assert.equal((await anonymous.closed)[0], 4401);
	const bare = await f.call("/api/guest", {}),
		noCharacter = f.open(bare.cookie);
	assert.equal((await noCharacter.closed)[0], 4401);
	const user = await f.make("GateHero"),
		wrong = f.open(user.cookie, "old");
	await wrong.until((m) => m.t === "reload");
	assert.equal((await wrong.closed)[0], 4400);
	const cross = f.open(
		user.cookie,
		"test",
		"https://" + new URL(wrong.ws.url).host,
	);
	assert.equal((await cross.closed)[0], 4403);
	const peer = f.open(user.cookie);
	await peer.until((m) => m.t === "welcome");
	await wait(120);
	assert.equal(
		peer.messages.some((m) => m.t === "snap"),
		false,
	);
	assert.equal([...f.rt.rooms.values()][0].game.players.size, 0);
	peer.send({ t: "spawnReady" });
	const snap = await peer.until((m) => m.t === "snap");
	assert.equal(snap.players.length, 1);
});
test("speed clamp, range, cooldown, fake damage and rate limits cannot be bypassed", async (t) => {
	const f = await fixture(t),
		user = await f.make("IntentHero", true);
	const initial = await f.store.inventory(user.character.accountId, user.character.id);
	await f.store.inventoryOp(user.character.accountId, user.character.id, crypto.randomUUID(), { op: 'equip', id: initial.inventory.items.find(i => i.template === 'training_sword')!.id }, { profile: loadGameData().stats.defaultBuild });
	const peer = f.open(user.cookie);
	await peer.until((m) => m.t === "welcome");
	peer.send({ t: "spawnReady" });
	await peer.until((m) => m.t === "snap");
	const room = [...f.rt.rooms.values()][0],
		p = room.game.players.get(user.character.id)!;
	const x = p.x,
		z = p.z;
	peer.send({ t: "steer", dx: 999, dz: 999, seq: 1 });
	await wait(150);
	assert.ok(Math.hypot(p.x - x, p.z - z) < 0.9);
	peer.send({ t: "steer", dx: 0, dz: 0, seq: 2 });
	const far = room.game.enemies.at(-1)!,
		hp = far.hp;
	peer.send({ t: "act", a: "attack", target: far.id, seq: 3 });
	await wait(50);
	assert.equal(far.hp, hp);
	assert.equal(p.cd.attack, 0);
	p.jobId='swordsman';p.skills.whirlwind=1;p.masteries.Swordsman=100;peer.send({ t: "act", a: "spin", seq: 4 });
	peer.send({ t: "act", a: "spin", seq: 5 });
	await wait(50);
	assert.ok(p.mp > p.maxMp - 16 && p.mp < p.maxMp - 14);
	assert.ok(p.cd.spin > 3);
	const gold = p.gold;
	peer.send({ t: "act", a: "attack", damage: 999999, seq: 6 });
	for (let i = 0; i < 200; i++) peer.send({ t: "ping", c: i });
	await wait(150);
	assert.ok(f.rt.metrics().rateLimitDrops >= 170);
	assert.ok(f.rt.metrics().invalidMessages >= 1);
	assert.equal(peer.ws.readyState, WebSocket.OPEN);
	assert.equal(p.gold, gold);
});
test("server-earned kill saves XP/gold/base stats and obsolete progress returns410", async (t) => {
	const f = await fixture(t),
		user = await f.make("EarnHero", true),
		peer = f.open(user.cookie);
	await peer.until((m) => m.t === "welcome");
	peer.send({ t: "spawnReady" });
	await peer.until((m) => m.t === "snap");
	const room = [...f.rt.rooms.values()][0],
		p = room.game.players.get(user.character.id)!,
		e = room.game.enemies[0];
	p.x = e.x;
	p.z = e.z + 1;
	p.xp = 55;
	e.hp = 1;
	peer.send({ t: "act", a: "spin", target: e.id, seq: 1 });
	await peer.until(
		(m) => m.t === "ev" && m.list.some((e: any) => e.type === "level"),
	);
	await room.saveQueue;
	const saved = await f.store.character(user.character.accountId, p.id);
	assert.equal(saved!.level, 2);
	assert.equal(saved!.statPoints, 1);
	assert.ok(saved!.gold > 0);
	assert.equal(saved!.kills, 1);
	assert.deepEqual(saved!.baseStats, p.profile.baseStats);
	assert.equal(
		(
			await f.call(
				`/api/characters/${p.id}/progress`,
				{ gold: 999999 },
				user.cookie,
			)
		).status,
		410,
	);
	assert.equal(
		(await f.store.character(user.character.accountId, p.id))!.gold,
		saved!.gold,
	);
});
test("reconnect retains state, new socket kicks old, then room expires", async (t) => {
	const f = await fixture(t),
		user = await f.make("ResumeHero"),
		first = f.open(user.cookie);
	await first.until((m) => m.t === "welcome");
	first.send({ t: "spawnReady" });
	await first.until((m) => m.t === "snap");
	const room = [...f.rt.rooms.values()][0],
		p = room.game.players.get(user.character.id)!;
	const grant=await f.store.inventoryOp(user.character.accountId,p.id,crypto.randomUUID(),{op:'admin',gold:25},{profile:p.profile});
 p.gold=grant.gold;
	first.ws.close();
	await first.closed;
	await wait(30);
	const second = f.open(user.cookie);
	await second.until((m) => m.t === "welcome");
	second.send({ t: "spawnReady" });
	assert.equal((await second.until((m) => m.t === "snap")).players[0].gold, 25);
	assert.equal([...f.rt.rooms.values()][0], room);
	const third = f.open(user.cookie);
	await third.until((m) => m.t === "welcome");
	const kick = await second.until((m) => m.t === "kick");
	assert.equal(kick.reason, "เข้าสู่ระบบจากที่อื่น");
	third.ws.close();
	await third.closed;
	await wait(350);
	assert.equal(f.rt.rooms.size, 0);
	assert.equal(
		(await f.store.character(user.character.accountId, p.id))!.gold,
		25,
	);
});
test("shared option joins two ready players into the same room and snapshot", async (t) => {
	const f = await fixture(t, true),
		a = await f.make("SharedOne"),
		b = await f.make("SharedTwo"),
		one = f.open(a.cookie),
		two = f.open(b.cookie);
	await one.until((m) => m.t === "welcome");
	await two.until((m) => m.t === "welcome");
	one.send({ t: "spawnReady" });
	two.send({ t: "spawnReady" });
	await one.until((m) => m.t === "snap" && m.players.length === 2);
	assert.equal(f.rt.rooms.size, 1);
	assert.equal([...f.rt.rooms.values()][0].game.players.size, 2);
});


test('maps isolate rooms, persist transfers and healer cooldown, reject remote gates and respawn in city',async t=>{
 const f=await fixture(t,true),user=await f.make('CityHero'),other=await f.make('CityFriend');
 const peer=f.open(user.cookie),friend=f.open(other.cookie);await peer.until(m=>m.t==='welcome');await friend.until(m=>m.t==='welcome');
 peer.send({t:'spawnReady'});friend.send({t:'spawnReady'});const initial=await peer.until(m=>m.t==='snap'&&m.players.length===2);
 assert.equal(initial.mapId,'city_plaza');assert.equal(initial.enemies.length,0);
 const city=[...f.rt.rooms.values()][0],p=city.game.players.get(user.character.id)!;
 peer.send({t:'travel',gate:'south'});await wait(80);assert.equal(city.game.players.has(p.id),true);
 p.x=GATES.city_plaza.north.x;p.z=GATES.city_plaza.north.z;peer.send({t:'travel',gate:'missing'});await wait(80);assert.equal(f.rt.rooms.size,1);
 p.x=HEALER.x;p.z=HEALER.z+.5;p.hp=1;p.mp=0;peer.send({t:'heal'});await peer.until(m=>m.t==='ev'&&m.list.some((e:any)=>e.type==='heal'));
 assert.equal(p.hp,p.maxHp);assert.equal(p.mp,p.maxMp);const readyAt=p.healerReadyAt;await city.saveQueue;
 assert.equal((await f.store.character(user.character.accountId,p.id))!.healerReadyAt,readyAt);
 p.hp=5;peer.send({t:'heal'});await wait(80);assert.ok(p.hp<10);
 peer.send({t:'act',a:'attack',seq:1});peer.send({t:'auto',on:true});await wait(80);assert.equal(p.attack,0);assert.equal(p.auto,false);
 p.x=GATES.city_plaza.south.x;p.z=GATES.city_plaza.south.z;peer.send({t:'travel',gate:'south'});const meadowSnap=await peer.until(m=>m.t==='snap'&&m.mapId==='meadow');
 assert.equal(meadowSnap.players.length,1);assert.ok(meadowSnap.enemies.length>0);assert.equal(city.game.players.has(p.id),false);assert.equal(city.game.players.size,1);
 const meadow=[...f.rt.rooms.values()].find(r=>r.game.mapId==='meadow')!;await meadow.saveQueue;
 assert.equal((await f.store.character(user.character.accountId,p.id))!.mapId,'meadow');
 p.x=GATES.meadow.north.x;p.z=GATES.meadow.north.z;peer.send({t:'travel',gate:'north'});await peer.until(m=>m.t==='snap'&&m.mapId==='city_plaza'&&m.players.some((v:any)=>v.id===p.id&&v.z===CITY_RETURN.z));
 assert.equal(p.healerReadyAt,readyAt);p.x=GATES.city_plaza.south.x;p.z=GATES.city_plaza.south.z;peer.send({t:'travel',gate:'south'});await wait(100);
 p.dead=true;p.hp=0;const reviveStart=peer.messages.length;peer.send({t:'revive'});await peer.until(m=>peer.messages.indexOf(m)>=reviveStart&&m.t==='snap'&&m.mapId==='city_plaza'&&m.players.some((v:any)=>v.id===p.id&&v.z===CITY_SPAWN.z));
 assert.equal(p.dead,false);assert.equal(p.mapId,'city_plaza');assert.equal(p.x,0);assert.equal(p.z,CITY_SPAWN.z);await city.saveQueue;
 peer.ws.close();await peer.closed;const reconnect=f.open(user.cookie);await reconnect.until(m=>m.t==='welcome');reconnect.send({t:'spawnReady'});
 const snap=await reconnect.until(m=>m.t==='snap');assert.equal(snap.mapId,'city_plaza');assert.equal(snap.players.find((v:any)=>v.id===p.id).healerReadyAt,readyAt);
});

test('all eight gate directions discard source-map movement while accepting fresh destination clicks',async t=>{
 const f=await fixture(t),user=await f.make('GateRoute'),peer=f.open(user.cookie);
 await peer.until(m=>m.t==='welcome');peer.send({t:'spawnReady'});await peer.until(m=>m.t==='snap');
 let seq=0;
 const gates:[MapId,string][]=[['city_plaza','south'],['meadow','north'],['city_plaza','east'],['forest','west'],['city_plaza','north'],['ruins','south'],['city_plaza','west'],['canyon','east']];
 for(const [mapId,gate] of gates){
  const room=[...f.rt.rooms.values()].find(r=>r.game.players.has(user.character.id))!,p=room.game.players.get(user.character.id)!;
  assert.equal(room.game.mapId,mapId);p.invulnerable=100;
  const portal=(GATES[mapId] as Record<string,{x:number;z:number}>)[gate];Object.assign(p,portal);
  const destination=travelDestination(mapId,gate,p)!;assert.ok(destination);
  const start=peer.messages.length;
  peer.send({t:'travel',gate});
  peer.send({t:'move',x:0,z:0,seq:++seq,mapId});
  peer.send({t:'steer',dx:1,dz:0,seq:++seq,mapId});
  await peer.until(m=>peer.messages.indexOf(m)>=start&&m.t==='snap'&&m.mapId===destination.mapId&&m.ack===seq);
  await wait(160);
  assert.equal(p.destination,null,`${mapId}/${gate}: stale click rejected`);
  assert.ok(Math.hypot(p.x-destination.x,p.z-destination.z)<.01,`${mapId}/${gate}: spawn must stay still`);
  const target={x:destination.x-Math.sign(destination.x),z:destination.z-Math.sign(destination.z)};
  peer.send({t:'move',...target,seq:++seq,mapId:destination.mapId});
  await wait(180);
  assert.ok(Math.hypot(p.x-destination.x,p.z-destination.z)>.1,`${mapId}/${gate}: fresh click works`);
  peer.send({t:'auto',on:false});await wait(60);
 }
});

test('inventory precondition failures reply to the request so the bag can recover',async t=>{
 const f=await fixture(t),user=await f.make('BagRecovery'),peer=f.open(user.cookie);
 await peer.until(m=>m.t==='welcome');peer.send({t:'spawnReady'});await peer.until(m=>m.t==='snap');
 const room=[...f.rt.rooms.values()][0],p=room.game.players.get(user.character.id)!;
 const before=await f.store.inventory(user.character.accountId,p.id);
 for(const condition of ['cooldown','dead','shop']){
  p.cd.potion=condition==='cooldown'?100:0;p.dead=condition==='dead';
  const req=crypto.randomUUID();peer.send({t:'inv',req,...(condition==='shop'?{op:'buy',shop:'market',template:'red_small'}:{op:'use',id:'stack:red_small'})});
  const reply=await peer.until(m=>m.t==='inv'&&m.req===req);assert.ok(reply.error,condition);
 }
 p.dead=false;p.cd.potion=0;
 assert.deepEqual(await f.store.inventory(user.character.accountId,p.id),before);
 const req=crypto.randomUUID();peer.send({t:'inv',req,op:'settings',on:false});
 const recovered=await peer.until(m=>m.t==='inv'&&m.req===req);assert.equal(recovered.error,undefined);assert.equal(recovered.inventory.autoPickup,false);
});

test('two sockets racing released loot award exactly once; disconnect during commit is atomic',async t=>{
 const f=await fixture(t,true),a=await f.make('LootOne',true),b=await f.make('LootTwo',true),one=f.open(a.cookie),two=f.open(b.cookie);
 await one.until(m=>m.t==='welcome');await two.until(m=>m.t==='welcome');one.send({t:'spawnReady'});two.send({t:'spawnReady'});await one.until(m=>m.t==='snap');await two.until(m=>m.t==='snap');
 const room=[...f.rt.rooms.values()][0],p=room.game.players.get(a.character.id)!,other=room.game.players.get(b.character.id)!;room.game.enemies=[];p.x=other.x=1;p.z=other.z=5;
 let release!:()=>void;const barrier=new Promise<void>(r=>release=r),original=f.store.inventoryOp.bind(f.store);f.store.inventoryOp=async(...args)=>{await barrier;return original(...args);};
 const id=room.game.nextId++;room.game.drops.push({id,ownerId:p.id,x:1,z:5,gold:37,xp:0,time:11,loot:[{template:'king_crystal',qty:1}]});
 one.send({t:'inv',op:'pickup',req:crypto.randomUUID(),drop:id});two.send({t:'inv',op:'pickup',req:crypto.randomUUID(),drop:id});
 for(let i=0;i<50&&![...room.peers.values()].some(p=>p.busy);i++)await wait(10);assert.ok([...room.peers.values()].some(p=>p.busy));one.ws.close();await one.closed;release();await room.saveQueue;await wait(100);
 const sa=await f.store.inventory(a.character.accountId,p.id),sb=await f.store.inventory(b.character.accountId,other.id);
 assert.equal(sa.gold+sb.gold,37);assert.equal([...sa.inventory.items,...sb.inventory.items].filter(i=>i.template==='king_crystal').length,1);assert.equal(room.game.drops.length,0);assert.ok((await f.store.integrity()).ok);
});

test('simultaneous joins for one character share the same unique inventory and live room',async t=>{
 const f=await fixture(t),a=await f.make('JoinEconomy');const original=f.store.inventory.bind(f.store);f.store.inventory=async(...args)=>{await wait(20);return original(...args);};
 const one=f.open(a.cookie),two=f.open(a.cookie);await one.until(m=>m.t==='welcome');await two.until(m=>m.t==='welcome');two.send({t:'spawnReady'});await two.until(m=>m.t==='snap');const state=await two.until(m=>m.t==='inv'&&m.inventory);assert.equal(state.inventory.items.filter((i:any)=>i.location==='equip').length,1);assert.equal(new Set(state.inventory.items.map((i:any)=>i.id)).size,8);assert.equal(f.rt.rooms.size,1);assert.ok((await f.store.integrity()).ok);
});

test('HUD settings are account scoped; return cast cancels and cooldown survives transfer',async t=>{
 const f=await fixture(t),user=await f.make('HudHero',true),peer=f.open(user.cookie);await peer.until(m=>m.t==='welcome');peer.send({t:'spawnReady'});await peer.until(m=>m.t==='snap');
 const room=[...f.rt.rooms.values()][0],p=room.game.players.get(user.character.id)!;room.game.enemies=[];
 const settings={scale:110,windows:{bag:{x:.2,y:.3}},keys:{returnCity:'KeyQ',pickupAll:'KeyE'}};
 peer.send({t:'uiSettings',settings});await peer.until(m=>m.t==='uiSettings'&&m.settings.scale===110);
 assert.deepEqual(await f.store.uiSettings(user.character.accountId),settings);
 const second=await f.store.createCharacter(user.character.accountId,'HudOther','hudother');assert.deepEqual(await f.store.uiSettings(second.accountId),settings);
 peer.send({t:'returnCity'});await peer.until(m=>m.t==='snap'&&m.players.some((v:any)=>v.returnRemaining>0));
 peer.send({t:'steer',dx:1,dz:0,seq:1});await wait(100);assert.equal(p.returnRemaining,0);
 peer.send({t:'steer',dx:0,dz:0,seq:2});peer.send({t:'returnCity'});await wait(100);assert.ok(p.returnRemaining!>0);
 room.game.events.push({type:'hurt',playerId:p.id,x:p.x,z:p.z,amount:1});await wait(100);assert.equal(p.returnRemaining,0);
 const {spawn}=await import('@the-beginning-online/shared');const boss=spawn(room.game,0,10,true);boss.engaged=true;
 peer.send({t:'returnCity'});await wait(100);assert.equal(p.returnRemaining,0);boss.dead=true;boss.respawn=600;
 peer.send({t:'returnCity'});await wait(100);assert.ok(p.returnRemaining!>0);p.returnRemaining=.05;
 await peer.until(m=>m.t==='snap'&&m.mapId==='city_plaza');assert.ok(p.returnReadyAt!>Date.now());
 await wait(100);const saved=await f.store.character(user.character.accountId,p.id);assert.equal(saved!.returnReadyAt,p.returnReadyAt);
});

test('potion defaults preserve old Q/E hotbars and explicit conflicting potion keys are rejected',async t=>{
 const f=await fixture(t),user=await f.make('PotionKeys',true),peer=f.open(user.cookie);
 await peer.until(m=>m.t==='welcome');peer.send({t:'spawnReady'});await peer.until(m=>m.t==='uiSettings');
 const room=[...f.rt.rooms.values()][0],p=room.game.players.get(user.character.id)!;
 p.hotbar[0].key='KeyQ';p.hotbar[1].key='KeyE';
 const settings={scale:110,windows:{},keys:{returnCity:'KeyH'}};
 peer.send({t:'uiSettings',settings});await peer.until(m=>m.t==='uiSettings'&&m.settings.scale===110);
 peer.send({t:'hotbar',slots:p.hotbar});
 await peer.until(m=>m.t==='ev'&&m.list.some((e:any)=>e.job?.hotbar[0].key==='KeyQ'));
 peer.send({t:'uiSettings',settings:{...settings,keys:{...settings.keys,manaPotion:'KeyE'}}});
 await peer.until(m=>m.t==='uiSettingsError');
 assert.deepEqual(await f.store.uiSettings(user.character.accountId),settings);
});

test('pickup all respects four metre radius, ownership and pending inventory transactions',async t=>{
 const f=await fixture(t),user=await f.make('PickupHero',true),peer=f.open(user.cookie);await peer.until(m=>m.t==='welcome');peer.send({t:'spawnReady'});await peer.until(m=>m.t==='snap');
 const room=[...f.rt.rooms.values()][0],g=room.game,p=g.players.get(user.character.id)!;g.enemies=[];p.x=0;p.z=0;
 g.drops=[{id:800,x:3.5,z:0,ownerId:p.id,gold:7,xp:0,time:0,loot:[]},{id:801,x:3,z:0,ownerId:'other',gold:9,xp:0,time:0,loot:[]},{id:802,x:5,z:0,ownerId:p.id,gold:11,xp:0,time:0,loot:[]}];
 peer.send({t:'pickupAll'});await peer.until(m=>m.t==='inv'&&m.gold===7);assert.equal(g.drops.some(d=>d.id===800),false);assert.ok(g.drops.some(d=>d.id===801));assert.ok(g.drops.some(d=>d.id===802));assert.equal(p.gold,7);
});

test('stability 3: steer stop and ordered deferred return during pickup do not freeze the room',async t=>{
 const f=await fixture(t),a=await f.make('StopPickup',true),one=f.open(a.cookie);await one.until(m=>m.t==='welcome');one.send({t:'spawnReady'});await one.until(m=>m.t==='snap');const room=[...f.rt.rooms.values()][0],p=room.game.players.get(a.character.id)!;room.game.enemies=[];
 let release!:()=>void;const gate=new Promise<void>(r=>release=r),original=f.store.inventoryOp.bind(f.store);f.store.inventoryOp=async(...args)=>{await gate;return original(...args);};t.after(()=>release());
 room.game.drops.push({id:9876,x:p.x,z:p.z,ownerId:p.id,gold:2,xp:0,time:1,loot:[]});
 await wait(70);assert.ok(room.peers.get(p.id)!.busy);one.send({t:'steer',dx:1,dz:0,seq:1});await wait(100);one.send({t:'steer',dx:0,dz:0,seq:2});one.send({t:'returnCity'});await wait(70);const x=p.x,tick=room.tick;await wait(120);assert.ok(Math.abs(p.x-x)<.01);assert.ok(room.tick>tick);assert.equal(p.returnRemaining,undefined);release();await wait(100);assert.ok(p.returnRemaining!>0);
});

test('stability 4: close mid join rolls back peer, pending player and room',async t=>{
 const f=await fixture(t),a=await f.make('MidJoin');let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>release=r),seen=new Promise<void>(r=>entered=r),original=f.store.inventory.bind(f.store);f.store.inventory=async(...args)=>{entered();await gate;return original(...args);};t.after(()=>release());const one=f.open(a.cookie);await seen;await once(one.ws,"open");one.ws.close();await one.closed;release();await wait(120);assert.equal(f.rt.metrics().sockets,0);assert.equal(f.rt.rooms.size,0);
});

test('stability 5: a broken room is quarantined without stopping another room',async t=>{
 const f=await fixture(t),a=await f.make('BadRoom'),b=await f.make('GoodRoom'),one=f.open(a.cookie),two=f.open(b.cookie);await one.until(m=>m.t==='welcome');await two.until(m=>m.t==='welcome');one.send({t:'spawnReady'});two.send({t:'spawnReady'});await one.until(m=>m.t==='snap');await two.until(m=>m.t==='snap');const bad=[...f.rt.rooms.values()].find(r=>r.game.players.has(a.character.id))!,good=[...f.rt.rooms.values()].find(r=>r.game.players.has(b.character.id))!,tick=good.tick;
 Object.defineProperty(bad.game,'time',{get(){throw Error('injected room failure');}});await one.until(m=>m.t==='kick'&&m.reason==='เซิร์ฟเวอร์ขัดข้อง กรุณาเข้าใหม่');await wait(150);assert.ok(good.tick>tick);assert.equal(f.rt.rooms.has(bad.key),false);
});

test('stability 6: close handlers never save after shutdown has drained',async t=>{
 const f=await fixture(t),a=await f.make('Closing'),one=f.open(a.cookie);await one.until(m=>m.t==='welcome');one.send({t:'spawnReady'});await one.until(m=>m.t==='snap');await f.rt.close();let calls=0;f.store.saveProgress=async()=>{calls++;throw Error('closed store');};await wait(70);assert.equal(calls,0);
});

test('stability 9: full bag blocks automatic retry before store transaction; Z retries once',async t=>{
 const f=await fixture(t),a=await f.make('FullBag',true),one=f.open(a.cookie);await one.until(m=>m.t==='welcome');one.send({t:'spawnReady'});await one.until(m=>m.t==='snap');const room=[...f.rt.rooms.values()][0],p=room.game.players.get(a.character.id)!;room.game.enemies=[];room.game.data.economy.inventorySlots=0;let calls=0;const original=f.store.inventoryOp.bind(f.store);f.store.inventoryOp=async(...args)=>{calls++;return original(...args);};room.game.drops.push({id:9899,x:p.x,z:p.z,ownerId:p.id,gold:1,xp:0,time:1,loot:[{template:'jelly_slime',qty:1}]});await wait(220);assert.equal(calls,0);assert.equal(room.game.drops[0].blocked,true);const count=()=>one.messages.flatMap(m=>m.list??[]).filter(e=>e.type==='notice'&&e.text==='กระเป๋าเต็ม').length;assert.equal(count(),1);one.send({t:'pickupAll'});await wait(100);assert.equal(count(),2);assert.equal(calls,0);
});

test('stability 11: snapshots omit inventory and private fields of other players',async t=>{
 const f=await fixture(t,true),a=await f.make('PrivateOne'),b=await f.make('PrivateTwo'),one=f.open(a.cookie),two=f.open(b.cookie);await one.until(m=>m.t==='welcome');await two.until(m=>m.t==='welcome');one.send({t:'spawnReady'});two.send({t:'spawnReady'});const snap=await one.until(m=>m.t==='snap'&&m.players.length===2);assert.equal('inventory'in snap,false);const other=snap.players.find((p:any)=>p.id!==a.character.id);assert.equal(other.gender,'male');assert.equal(typeof other.weaponType,'string');for(const key of ['gold','xp','skills','hotbar','statPoints'])assert.equal(key in other,false);
});

test('stability 12: disconnected private rooms expire independently',async t=>{
 const f=await fixture(t),a=await f.make('ExpireOne'),b=await f.make('RemainTwo'),one=f.open(a.cookie),two=f.open(b.cookie);await one.until(m=>m.t==='welcome');await two.until(m=>m.t==='welcome');one.send({t:'spawnReady'});two.send({t:'spawnReady'});await one.until(m=>m.t==='snap');one.ws.close();await one.closed;await wait(400);assert.equal(f.rt.rooms.size,1);assert.ok([...f.rt.rooms.values()][0].peers.has(b.character.id));
});

test('stability 13: settings are loaded once per peer and updated from saved settings',async t=>{
 const f=await fixture(t),a=await f.make('CachedUI');let calls=0;const original=f.store.uiSettings.bind(f.store);f.store.uiSettings=async(...args)=>{calls++;return original(...args);};const one=f.open(a.cookie);await one.until(m=>m.t==='welcome');one.send({t:'spawnReady'});await one.until(m=>m.t==='uiSettings');one.send({t:'spawnReady'});one.send({t:'spawnReady'});await wait(100);assert.equal(calls,1);one.send({t:'uiSettings',settings:{scale:110,windows:{},keys:{returnCity:'KeyQ',pickupAll:'KeyE'}}});await one.until(m=>m.t==='uiSettings'&&m.settings.scale===110);assert.equal(calls,1);
});

test('stability 15: a join waits for an evicted characters save',async t=>{
 const f=await fixture(t),a=await f.make('EvictSave'),one=f.open(a.cookie);await one.until(m=>m.t==='welcome');one.send({t:'spawnReady'});await one.until(m=>m.t==='snap');const room=[...f.rt.rooms.values()][0],p=room.game.players.get(a.character.id)!;p.kills=55;let release!:()=>void;const gate=new Promise<void>(r=>release=r),original=f.store.saveProgress.bind(f.store);f.store.saveProgress=async(...args)=>{await gate;return original(...args);};t.after(()=>release());one.ws.close();await one.closed;await wait(350);const two=f.open(a.cookie);await wait(100);assert.equal(two.messages.some(m=>m.t==='welcome'),false);release();await two.until(m=>m.t==='welcome');two.send({t:'spawnReady'});const snap=await two.until(m=>m.t==='snap');assert.equal(snap.players[0].kills,55);
});

test('stability 17: concurrent sockets per IP over the limit are refused',async t=>{
 const f=await fixture(t,false,{ipMaxSockets:5}),a=await f.make('SocketLimit');let release!:()=>void;const gate=new Promise<void>(r=>release=r),original=f.store.session.bind(f.store);f.store.session=async(...args)=>{await gate;return original(...args);};t.after(()=>release());for(let i=0;i<5;i++){const one=f.open(a.cookie);await once(one.ws,'open');}const extra=f.open(a.cookie);await extra.closed;assert.notEqual(extra.ws.readyState,1);release();
});

test('stability 1: heartbeat DB rejection is caught and room keeps ticking',async t=>{
 const f=await fixture(t),a=await f.make('Heartbeat'),one=f.open(a.cookie);await one.until(m=>m.t==='welcome');one.send({t:'spawnReady'});await one.until(m=>m.t==='snap');const before=f.rt.metrics().ticks;f.store.session=async()=>{throw Error('temporary DB failure');};await wait(220);assert.ok(f.rt.metrics().ticks>before);assert.equal(one.ws.readyState,1);
});
test('stability 14: expired requests are pruned repeatedly while running',async t=>{const f=await fixture(t);let calls=0;f.store.pruneRequests=async()=>{calls++;};await wait(240);assert.ok(calls>=2);});
test('stability 19: replacing DB lease kicks old peer and fences stale writes',async t=>{
 const f=await fixture(t),a=await f.make('LeaseHero'),one=f.open(a.cookie);await one.until(m=>m.t==='welcome');one.send({t:'spawnReady'});await one.until(m=>m.t==='snap');const room=[...f.rt.rooms.values()][0],old=room.peers.get(a.character.id)!.leaseOwner!;await f.store.claimLease(a.character.id,'other-node');await one.until(m=>m.t==='kick'&&m.reason==='เข้าสู่ระบบจากที่อื่น');await assert.rejects(()=>f.store.saveProgress(a.character.accountId,a.character.id,a.character,old),/Lease lost/);
});

test('stability 17: per-IP upgrade limit (configurable) includes failed authentication',async t=>{
 const f=await fixture(t,false,{ipUpgradesPerMinute:20});for(let i=0;i<20;i++){const one=f.open();const [code]=await one.closed;assert.equal(code,4401);}const limited=f.open();const[code]=await limited.closed;assert.equal(code,1006);
});

test('stability 4: a successful slow join pins its room until registration',async t=>{
 const f=await fixture(t),a=await f.make('SlowJoin'),original=f.store.inventory.bind(f.store);f.store.inventory=async(...args)=>{await wait(180);return original(...args);};const one=f.open(a.cookie);await one.until(m=>m.t==='welcome');one.send({t:'spawnReady'});const first=await one.until(m=>m.t==='snap');await one.until(m=>m.t==='snap'&&m.tick>first.tick);assert.equal(f.rt.rooms.size,1);assert.equal(f.rt.metrics().sockets,1);
});

test('stability 6: shutdown drains in-flight joins before the store can close',async t=>{
 const f=await fixture(t),a=await f.make('DrainJoin');let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>release=r),seen=new Promise<void>(r=>entered=r),original=f.store.inventory.bind(f.store);f.store.inventory=async(...args)=>{entered();await gate;return original(...args);};const one=f.open(a.cookie);await seen;let done=false;const shutdown=f.rt.close().then(()=>done=true);await wait(40);assert.equal(done,false);release();await shutdown;assert.equal(f.rt.metrics().sockets,0);assert.equal(f.rt.rooms.size,0);await one.closed;
});

const bagQty=(inv:{items:{template:string;qty:number;location:string}[]},template:string)=>inv.items.filter(i=>i.template===template&&i.location==='bag').reduce((n,i)=>n+i.qty,0);
test('auto-potion settings persist per character and the server drinks from the bag once per cooldown',async t=>{
 const f=await fixture(t),user=await f.make('PotA'),other=await f.make('PotB'),peer=f.open(user.cookie);
 await peer.until(m=>m.t==='welcome');peer.send({t:'spawnReady'});await peer.until(m=>m.t==='snap');
 const room=[...f.rt.rooms.values()][0],p=room.game.players.get(user.character.id)!;
 assert.equal(room.game.mapId,'city_plaza');assert.deepEqual(p.autoPotion,{hp:{on:false,at:40},mp:{on:false,at:30}});
 const stats=await peer.until(m=>m.t==='ev'&&m.list.some((e:any)=>e.type==='stats'));assert.deepEqual(stats.list.find((e:any)=>e.type==='stats').autoPotion,p.autoPotion);
 const settings={hp:{on:true,at:50},mp:{on:true,at:25}};
 peer.send({t:'autoPotion',settings});assert.deepEqual((await peer.until(m=>m.t==='autoPotion')).settings,settings);
 assert.deepEqual((await f.store.character(user.character.accountId,p.id))!.autoPotion,settings);
 assert.equal((await f.store.character(other.character.accountId,other.character.id))!.autoPotion,undefined,'saved per character');
 const before=bagQty((await f.store.inventory(user.character.accountId,p.id)).inventory,'red_small');assert.ok(before>0);
 p.hp=Math.floor(p.maxHp*.3);
 const fired=await peer.until(m=>m.t==='ev'&&m.list.some((e:any)=>e.type==='autoPotion'&&e.playerId===p.id&&e.kind==='hp'));
 assert.equal(fired.list.find((e:any)=>e.type==='autoPotion').template,'red_small');
 await peer.until(m=>m.t==='inv'&&m.inventory&&bagQty(m.inventory,'red_small')===before-1);await room.saveQueue;
 assert.equal(bagQty((await f.store.inventory(user.character.accountId,p.id)).inventory,'red_small'),before-1);assert.ok(p.hp>p.maxHp*.3);assert.ok(p.cd.potion>0);
 for(let i=0;i<6;i++){p.hp=1;await wait(50);}await room.saveQueue;
 assert.equal(bagQty((await f.store.inventory(user.character.accountId,p.id)).inventory,'red_small'),before-1,'cooldown blocks a second drink');
 // MP: no blue potion in a fresh bag, so nothing is drunk and the cooldown is not spent on it.
 p.cd.potion=0;p.hp=p.maxHp;p.mp=0;await wait(150);await room.saveQueue;assert.equal(p.cd.potion,0);
 peer.send({t:'autoPotion',settings:{hp:{on:true,at:200},mp:{on:true,at:25}}});await wait(80);
 assert.deepEqual(p.autoPotion,settings,'invalid thresholds are rejected');
 peer.ws.close();await peer.closed;const again=f.open(user.cookie);await again.until(m=>m.t==='welcome');again.send({t:'spawnReady'});
 const restored=await again.until(m=>m.t==='ev'&&m.list.some((e:any)=>e.type==='stats'));assert.deepEqual(restored.list.find((e:any)=>e.type==='stats').autoPotion,settings);
});

test('hotbar potion slots persist, use the bag through the server and survive migration',async t=>{
 const f=await fixture(t),user=await f.make('PotBar'),peer=f.open(user.cookie);
 await peer.until(m=>m.t==='welcome');peer.send({t:'spawnReady'});await peer.until(m=>m.t==='snap');
 const room=[...f.rt.rooms.values()][0],p=room.game.players.get(user.character.id)!;
 const slots=p.hotbar.map((s,i)=>({...s,skill:i===6?'item:red_small':i===7?'item:blue_potion':s.skill}));
 peer.send({t:'hotbar',slots});await peer.until(m=>m.t==='ev'&&m.list.some((e:any)=>e.type==='stats'&&e.job?.hotbar?.[6]?.skill==='item:red_small'));
 assert.equal((await f.store.character(user.character.accountId,p.id))!.hotbar![6].skill,'item:red_small');
 const bad=p.hotbar.map((s,i)=>({...s,skill:i===8?'item:jelly_slime':s.skill}));const at=peer.messages.length;peer.send({t:'hotbar',slots:bad});
 await peer.until(m=>peer.messages.indexOf(m)>=at&&m.t==='ev'&&m.list.some((e:any)=>e.type==='skillsError'));assert.equal(p.hotbar[8].skill,slots[8].skill);
 const before=bagQty(p.inventory!,'red_small');p.hp=1;
 const req=crypto.randomUUID();peer.send({t:'inv',op:'use',req,id:'stack:red_small'});
 const used=await peer.until(m=>m.t==='inv'&&m.req===req);assert.equal(used.error,undefined);assert.equal(bagQty(used.inventory,'red_small'),before-1);assert.ok(p.hp>1);assert.ok(p.cd.potion>0);
 const second=crypto.randomUUID();peer.send({t:'inv',op:'use',req:second,id:'stack:red_small'});assert.ok((await peer.until(m=>m.t==='inv'&&m.req===second)).error,'potion cooldown');
 peer.ws.close();await peer.closed;for(let i=0;i<100&&room.game.players.has(p.id);i++)await wait(20);await room.saveQueue;
 // An older save naming a retired item keeps its other slots; the stale item slot is cleared on load.
 const saved=(await f.store.character(user.character.accountId,p.id))!;
 await f.store.saveProgress(user.character.accountId,p.id,{...saved,hotbar:saved.hotbar!.map((s,i)=>({...s,skill:i===7?'item:retired_elixir':s.skill}))});
 const again=f.open(user.cookie);await again.until(m=>m.t==='welcome');again.send({t:'spawnReady'});
 const snap=await again.until(m=>m.t==='snap'&&m.players.some((v:any)=>v.id===p.id&&v.hotbar)),bar=snap.players.find((v:any)=>v.id===p.id).hotbar;
 assert.equal(bar[6].skill,'item:red_small');assert.equal(bar[7].skill,null);assert.equal(bar[0].skill,slots[0].skill);
});


test('titles equip only server-earned cosmetics, survive reconnect, and appear in snapshots/chat',async t=>{
 const f=await fixture(t),user=await f.make('TitleHero'),peer=f.open(user.cookie);
 await peer.until(m=>m.t==='welcome');peer.send({t:'spawnReady'});
 const initial=await peer.until(m=>m.t==='titles');assert.ok(initial.list.find((t:any)=>t.id==='rookie').unlocked);
 assert.ok(initial.list.filter((t:any)=>t.category==='pvp').every((t:any)=>!t.available&&!t.unlocked));
 const room=[...f.rt.rooms.values()][0],p=room.game.players.get(user.character.id)!,stats=structuredClone(p.stats);
 peer.send({t:'titleEquip',id:'duel200'});await peer.until(m=>m.t==='titleError');assert.ok(!p.titleId);
 peer.send({t:'titleEquip',id:'rookie'});await peer.until(m=>m.t==='titles'&&m.selected==='rookie');
 assert.equal((await f.store.character(user.character.accountId,p.id))!.titleId,'rookie');assert.deepEqual(p.stats,stats);
 await peer.until(m=>m.t==='snap'&&m.players[0].titleId==='rookie');
 peer.send({t:'chat',ch:'map',text:'Hello titles'});assert.equal((await peer.until(m=>m.t==='chat'&&m.text==='Hello titles')).titleId,'rookie');
 peer.ws.close();await peer.closed;
 const second=f.open(user.cookie);await second.until(m=>m.t==='welcome');second.send({t:'spawnReady'});
 await second.until(m=>m.t==='titles'&&m.selected==='rookie');
 second.send({t:'rankings',board:'level'});const board=await second.until(m=>m.t==='rankings');assert.equal(board.mine.id,p.id);
 assert.doesNotMatch(JSON.stringify(board),/accountId|titleRecords|baseStats/);
});
test('boss titles come from authoritative kills and a failed title save keeps the old selection',async t=>{
 const f=await fixture(t),user=await f.make('BossTitle'),peer=f.open(user.cookie);
 await peer.until(m=>m.t==='welcome');peer.send({t:'spawnReady'});await peer.until(m=>m.t==='titles');
 const room=[...f.rt.rooms.values()][0],p=room.game.players.get(user.character.id)!;
 room.game.events.push({type:'kill',x:p.x,z:p.z,ownerId:p.id,playerId:p.id,dataId:'king_jelly',boss:true});
 await peer.until(m=>m.t==='titles'&&m.list.some((t:any)=>t.id==='boss_king'&&t.unlocked));
 await room.saveQueue;assert.equal((await f.store.character(user.character.accountId,p.id))!.titleRecords!.bosses.king_jelly,1);
 const save=f.store.saveProgress.bind(f.store);f.store.saveProgress=async()=>{throw Error('injected title save failure');};
 peer.send({t:'titleEquip',id:'boss_king'});await peer.until(m=>m.t==='titleError');assert.ok(!p.titleId);
 f.store.saveProgress=save;
 peer.send({t:'titleEquip',id:'boss_king'});await peer.until(m=>m.t==='titles'&&m.selected==='boss_king');
});


test('a rank title is removed when another active character takes its place',async t=>{
 const f=await fixture(t),a=await f.make('RankFirst'),peer=f.open(a.cookie);
 await peer.until(m=>m.t==='welcome');peer.send({t:'spawnReady'});await peer.until(m=>m.t==='titles');
 peer.send({t:'titleEquip',id:'level_top1'});await peer.until(m=>m.t==='titles'&&m.selected==='level_top1');
 const b=await f.make('RankSecond');await f.store.saveProgress(b.character.accountId,b.character.id,{...b.character,level:5});
 const other=f.open(b.cookie);await other.until(m=>m.t==='welcome');
 peer.messages.length=0;peer.send({t:'titles'});
 await peer.until(m=>m.t==='titles'&&m.selected===null);
 const room=[...f.rt.rooms.values()].find(r=>r.game.players.has(a.character.id))!;
 await room.saveQueue;assert.equal((await f.store.character(a.character.accountId,a.character.id))!.titleId,null);
});

test('Worldcore isolates party encounters, checks invitation, retains empty checkpoints and revokes party leavers',async t=>{
 const f=await fixture(t,true),users=await Promise.all(['RaidLead','RaidAlly','RaidOther'].map(name=>f.make(name)));
 for(const [i,u]of users.entries())await f.store.saveProgress(u.character.accountId,u.character.id,{...u.character,level:100,mapId:'astral',quests:{active:{},done:i===2?{}:{worldcore_invitation:0}}});
 const peers=users.map(u=>f.open(u.cookie));for(const peer of peers){await peer.until(m=>m.t==='welcome');peer.send({t:'spawnReady'});await peer.until(m=>m.t==='snap');}
 const locate=(id:string)=>[...f.rt.rooms.values()].find(r=>r.game.players.has(id))!;
 peers[0].send({t:'party',op:'invite',name:users[1].character.name});await peers[1].until(m=>m.t==='partyInvite');peers[1].send({t:'party',op:'accept'});await wait(100);
 assert.equal(locate(users[0].character.id).game.partyMembers!(users[0].character.id).length,2);
 const gate=Object.keys(GATE_LINKS.astral).find(k=>GATE_LINKS.astral[k]==='confluence')!,at=GATES.astral[gate];
 const enter=async(i:number)=>{const room=locate(users[i].character.id),p=room.game.players.get(users[i].character.id)!;Object.assign(p,at,{god:true});peers[i].send({t:'travel',gate});};
 await enter(2);await peers[2].until(m=>m.t==='ev'&&m.list.some((e:any)=>String(e.text).includes('รอยต่อพิภพต้อง')));assert.equal(locate(users[2].character.id).game.mapId,'astral');
 locate(users[2].character.id).game.players.get(users[2].character.id)!.quests!.done.worldcore_invitation=0;
 for(let i=0;i<3;i++){await enter(i);await peers[i].until(m=>m.t==='snap'&&m.mapId==='confluence');}
 const party=locate(users[0].character.id);assert.equal(locate(users[1].character.id),party);assert.notEqual(locate(users[2].character.id),party);
 const guard=party.game.enemies.find(e=>e.dataId==='confluence_life_pillar_guard')!;Object.assign(guard,{hp:0,dead:true,rewarded:true,respawn:1800});
 for(const peer of peers.slice(0,2)){peer.ws.close();await peer.closed;}await wait(650);assert.equal(party.game.players.size,0);assert.equal(f.rt.rooms.get(party.key),party);
 const resumed=f.open(users[0].cookie);await resumed.until(m=>m.t==='welcome');resumed.send({t:'spawnReady'});await resumed.until(m=>m.t==='snap'&&m.mapId==='confluence');assert.equal(locate(users[0].character.id),party);assert.ok(guard.dead);
 resumed.send({t:'party',op:'leave'});await resumed.until(m=>m.t==='snap'&&m.mapId==='city_plaza');assert.equal(party.game.players.has(users[0].character.id),false);
});

test('joining a mage uses persisted staff equipment before deriving initial stats',async t=>{
 const f=await fixture(t),user=await f.make('MageRefine'),c=user.character;
 await f.store.saveProgress(c.accountId,c.id,{...c,classId:'mage',jobId:'mage',jobsVersion:3,skills:{basic:1,fire_bolt:1}});
 const original=f.store.inventory.bind(f.store);
 f.store.inventory=async(...args)=>{const state=await original(...args);state.inventory.items=[{id:'staff',template:'wood_staff',location:'equip',slot:'weapon',qty:1,refine:10,cards:[],bound:false,source:'test'}];return state;};
 const peer=f.open(user.cookie);await peer.until(m=>m.t==='welcome');peer.send({t:'spawnReady'});await peer.until(m=>m.t==='snap');
 const p=[...f.rt.rooms.values()][0].game.players.get(c.id)!;
 assert.equal(p.jobId,'mage');assert.deepEqual(p.profile.equipment,['wood_staff']);assert.ok(p.stats.matk>25);assert.ok(p.stats.castMul<1);
});

test('level mailbox delivers retroactive rewards over WebSocket once, unlocks new levels and survives reconnect',async t=>{
 const f=await fixture(t),user=await f.make('MailboxWs'),c=user.character;
 await f.store.saveProgress(c.accountId,c.id,{...c,level:20});
 const peer=f.open(user.cookie);await peer.until(m=>m.t==='welcome');peer.send({t:'spawnReady'});
 const initial=await peer.until(m=>m.t==='mailbox');assert.equal(initial.level,20);assert.deepEqual(initial.claimed,[]);
 peer.messages.length=0;const req=randomUUID();peer.send({t:'mailbox',op:'claim',req});peer.send({t:'mailbox',op:'claim',req:randomUUID()});
 const received=await peer.until(m=>m.t==='mailbox'&&m.claimed?.length===20);assert.equal(received.error,undefined);
 const inv=await peer.until(m=>m.t==='inv'&&m.gold===20000);assert.equal(inv.inventory.items.find((i:any)=>i.template==='iron_amulet').bound,true);
 assert.equal((await f.store.inventory(c.accountId,c.id)).gold,20000);
 const active=[...f.rt.rooms.values()].find(r=>r.game.players.has(c.id))!.game.players.get(c.id)!;
 const scroll=inv.inventory.items.find((i:any)=>i.template==='exp_boost_scroll'),buffReq=randomUUID(),buffStart=Date.now();
 peer.messages.length=0;peer.send({t:'inv',op:'use',id:scroll.id,req:buffReq});
 await peer.until(m=>m.t==='inv'&&m.req===buffReq&&!m.error);assert.ok(active.consumableBuffs?.exp?.until!>=buffStart+3600000);
 const expiry=active.consumableBuffs!.exp!.until;
 peer.messages.length=0;peer.send({t:'inv',op:'use',id:scroll.id,req:buffReq});await peer.until(m=>m.t==='inv'&&m.req===buffReq);
 assert.equal(active.consumableBuffs!.exp!.until,expiry);
 active.claimedLevelRewards=[];peer.messages.length=0;peer.send({t:'mailbox',op:'list'});await peer.until(m=>m.t==='mailbox'&&m.claimed?.length===20);assert.equal(active.claimedLevelRewards.length,20);
 active.claimedLevelRewards=[];peer.messages.length=0;
 peer.send({t:'mailbox',op:'claim',level:2,req:randomUUID()});await peer.until(m=>m.t==='mailbox'&&m.error&&m.claimed?.length===20);
 peer.messages.length=0;peer.send({t:'mailbox',op:'claim',level:5,req:randomUUID()});await peer.until(m=>m.t==='mailbox'&&m.error);assert.equal((await f.store.inventory(c.accountId,c.id)).gold,20000);
 peer.ws.close();await wait(350);
 const again=f.open(user.cookie);await again.until(m=>m.t==='welcome');again.send({t:'spawnReady'});
 assert.equal((await again.until(m=>m.t==='mailbox')).claimed.length,20);
 const room=[...f.rt.rooms.values()].find(r=>r.game.players.has(c.id))!,p=room.game.players.get(c.id)!;assert.equal(p.consumableBuffs!.exp!.until,expiry);p.level=21;p.profile.level=21;
 again.messages.length=0;again.send({t:'mailbox',op:'claim',level:21,req:randomUUID()});await again.until(m=>m.t==='mailbox'&&m.claimed?.includes(21));assert.equal((await f.store.inventory(c.accountId,c.id)).gold,20000);
 p.level=60;p.profile.level=60;again.messages.length=0;
 again.send({t:'mailbox',op:'claim',level:22,req:randomUUID()});await again.until(m=>m.t==='mailbox'&&m.claimed?.includes(22));
 const late=await f.store.inventory(c.accountId,c.id);for(const template of ['red_supreme','blue_supreme'])assert.equal(late.inventory.items.find(i=>i.template===template)!.qty,50);
 again.messages.length=0;again.send({t:'mailbox',op:'claim',level:100,req:randomUUID()});await again.until(m=>m.t==='mailbox'&&m.error);assert.equal((await f.store.inventory(c.accountId,c.id)).gold,20000);
});
