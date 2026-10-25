import {normalizeDiscoveredMaps,cityWarpDestination} from '@the-beginning-online/shared';
import {canEnterConfluence} from '@the-beginning-online/shared';
import {consumableBuffValue,applyPotionEffect,partyAidTarget,sunScrollTarget,castSunScroll} from '@the-beginning-online/shared';
import { createTrades } from './trade.js';
import {TITLES,titleDefinition,normalizeTitleRecords,earnTitles,canWearTitle,titleProgress,type RankingCharacter} from '@the-beginning-online/shared';
import {createRankings} from './rankings.js';
import {monsterKnockbackFor} from './monster-knockback.js';
import {applyInventory,equipped,equippedCards,inventoryWeight,type InventoryOp,normalizeAuto,DEFAULT_UI,resolveKeys,reservedKeys,bindingProblem} from '@the-beginning-online/shared';
import { CITY_BUILDINGS, CITY_SPAWN, MAP_INFO, travelDestination, healerHeal, isField, BOSS_RESPAWN_MS, bossTimer, setBossTimer, type MapId } from "@the-beginning-online/shared";
import { normalizeQuests, acceptQuest, questStatus, questTurnInItems, completeQuest, recordKill, recordStore, giverPosition, QUEST_TALK_RANGE, grantExp } from "@the-beginning-online/shared";
import {needsJob} from '../store/progress.js';
import type { Server } from "node:http";
import { performance } from "node:perf_hooks";
import { randomUUID, randomInt } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { parse } from "cookie";
import {
	normalizeJob,
	learnSkill,
	changeJob,
	validateHotbar,
	skillId,
	resolveSkill,
	isMasteryAction,
	masteryTarget,advancedMasterySnapshot,clearAdvancedMastery,
	createGame,
	addPlayer,
	withPlayer,
	step,
	action,
	setAuto,
	moveTo,
	revive,
	walkable,
	spawn,
	ARENA,
	CAMP,
	loadGameData,
	gameSkill,
	allocateStats,
	autoAllocateStats,
	resetStats,
	refreshStats,
	clearMasteryWounds,
	removeSummon,removeWisp,clearMasteryPoisons,clearMasteryHeals,
	type Game,
	type Player,
	type Vec,
} from "@the-beginning-online/shared";
import { IntentSchema, normalizeAutoPotion, type Intent } from "@the-beginning-online/shared";
import type { Store, Character, Progress } from "../store/types.js";
import { hashToken } from "../session.js";
import { createSocial } from "./social.js";
import { createGm } from "./gm.js";
import { adminAccess } from "../admin.js";
import type { EconomyContext, QuestProgress } from '../store/economy.js';
interface Peer {
 discoveredMaps:MapId[]; discovering?:boolean;
 titleSaving?:boolean;
 leaseOwner?:string; busy?:number; deferred?:Intent[]; uiLoading?:boolean;
 ui?:import('@the-beginning-online/shared').UISettings;
	ws: WebSocket;
	id: string;
	accountId: string;
	/** Public 9-digit account UID (GM commands address players by it). */
	uid?: string;
	sessionHash: string;
	ready: boolean;
	ack: number;
	input: Vec;
	lastSteer: number;
	lastSeen: number;
	window: number;
	count: number;
	room: Room;
}
export interface Room {
	key: string;
	game: Game;
	peers: Map<string, Peer>;
	accounts: Map<string, string>;
	disconnected: Map<string, number>;
	tick: number;
	saveQueue: Promise<void>;
 raidExpiresAt?:number; joining?:number; leases?:Map<string,string>; quarantined?:boolean; expiring?:Set<string>; dropRequests?:Map<string,string>;
}
export interface RealtimeOptions {
	store: Store;
	build: string;
	secret?: string;
	sharedRooms?: boolean;
	heartbeatMs?:number;pruneMs?:number;reconnectMs?: number;
	tickMs?: number;
		adminIds?: string[];
	/** Slash commands allowed per account per 10 s (default 8). */
	gmCommandsPer10s?: number;
	/** Internet cafés share one public IP, so keep these generous. */
	ipMaxSockets?: number; ipUpgradesPerMinute?: number;
	production?: boolean;
	devJobExpMultiplier?: number;
}
const round = (n: number) => Math.round(n * 1000) / 1000;
const playerKeys = ["gender",
	"id", "reviveRemaining", "bossReadyAt", "bossCooldowns", "mapId", "healerReadyAt", "returnRemaining", "returnReadyAt",
	"name", "titleId",
	"x",
	"z",
	"fx",
	"fz",
	"hp",
	"maxHp",
	"mp",
	"maxMp",
	"level",
	"xp",
	"nextXp",
	"gold",
	"boundGold",
	"kills",
	"potions",
	"dead",
	"moving",
	"attack",
	"attackKind",
	"combo",
	"comboWindow",
	"boxerCombo",
	"dash",
	"invulnerable",
	"hurt",
	"auto",
	"autoState",
	"target",
	"destination",
	"statPoints",
	"jobId",
	"jobLevel",
	"jobExp",
	"skillPoints",
	"skills",
	"masteries",
	"masteryExp",
	"masteryVersion",
	"hotbar",
	"statuses",
	"castRemaining",
] as const;
/** Fields other players need to render someone (keeps shared-room snapshots small). */
const publicKeys = ["gender","id","name","titleId","x","z","fx","fz","hp","maxHp","level","jobId","dead","moving","attack","attackKind","combo","dash","invulnerable","hurt","castRemaining","mapId"] as const;
const num = (v: unknown) => (typeof v === "number" ? round(v) : v);
function ownEntry(p: Player, g: Game) {
	return {
		...Object.fromEntries(playerKeys.map((k) => [k, num(p[k])])),consumableBuffs:p.consumableBuffs??{},masteryFx:advancedMasterySnapshot(g,p),decoy:p.decoy??null,summon:p.summon??null,wisp:p.wisp??null,healingOverTime:p.healingOverTime??null,boxerCombo:p.boxerCombo??null,
		titleId:p.displayTitleId??null,
		cd: Object.fromEntries(Object.entries(p.cd).map(([k, v]) => [k, round(v)])),
		moveSpeed: p.stats.moveSpeed * (p.gmSpeed ?? 1) * (1 + Math.max(consumableBuffValue(p,'speed',g.wallTime||Date.now())??0, ...p.statuses.filter((s) => s.id === "speed").map((s) => s.value))) * (1 - Math.max(0, ...p.statuses.filter((s) => s.id === "slow").map((s) => s.value))),
	};
}
function publicEntry(p: Player, g: Game) {
	return { weaponType:p.stats.weaponType, ...Object.fromEntries(publicKeys.map((k) => [k, num(p[k])])),masteryFx:advancedMasterySnapshot(g,p),decoy:p.decoy??null,summon:p.summon??null,wisp:p.wisp??null,healingOverTime:p.healingOverTime??null,boxerCombo:p.boxerCombo?{steps:p.boxerCombo.steps}:null, titleId:p.displayTitleId??null, statuses: p.statuses.map((s) => ({ id: s.id, remaining: round(s.remaining),...(s.id==='archer_mark'?{targetId:s.targetId}:{}) })) };
}
/** Everything in a snapshot that is the same for every viewer, serialised once per room per send. */
export function snapshotParts(room: Room) {
	const g = room.game;
	const others = new Map<string, string>();
	for (const p of g.players.values()) others.set(p.id, JSON.stringify(publicEntry(p,g)));
	// Entities are serialised once per room; each viewer then joins only those within ENTITY_RANGE (bosses always).
	const entity = <T extends { x: number; z: number }>(list: T[], map: (v: T) => unknown, always = (_v: T) => false) => list.map((v) => ({ x: v.x, z: v.z, always: always(v), json: JSON.stringify(map(v)) }));
	const enemies = entity(g.enemies, (e) => ({ id: e.id, statuses: e.statuses, dataId: e.dataId, x: round(e.x), z: round(e.z), hp: e.hp, maxHp: e.maxHp, boss: e.boss, dead: e.dead, motion: e.motion, motionTime: round(e.motionTime), motionDuration: e.motionDuration, bossPhase: e.bossPhase, variant: e.variant, deathAge: round(e.deathAge), hurt: round(e.hurt), fx: round(e.fx), fz: round(e.fz), vx: round(e.vx), vz: round(e.vz), moving: e.moving, windup: round(e.windup), aimX: round(e.aimX), aimZ: round(e.aimZ), summoned: e.summoned, nestEgg:e.nestEgg }), (e) => e.boss);
	const drops = entity(g.drops, (d) => ({ ...d, x: round(d.x), z: round(d.z), time: round(d.time) }));
	const projectiles = entity(g.projectiles, (p) => ({ ...p, x: round(p.x), z: round(p.z) }));
	const world = (me?: { x: number; z: number }) => {
		const pick = (list: typeof enemies) => list.filter((v) => !me || v.always || Math.abs(v.x - me.x) <= ENTITY_RANGE && Math.abs(v.z - me.z) <= ENTITY_RANGE).map((v) => v.json).join(",");
		return '"enemies":[' + pick(enemies) + '],"drops":[' + pick(drops) + '],"projectiles":[' + pick(projectiles) + '],"smokeFields":' + JSON.stringify(g.smokeFields);
	};
	return { others, world };
}
/** One viewer's snapshot as a JSON string: own entry carries private fields, others are public only. */
/** Interest management: other players beyond this range, or past the nearest cap, are left out of a viewer's snapshot. */
export const VIEW_RANGE = 32, VIEW_MAX_PLAYERS = 30, ENTITY_RANGE = 40;
export function snapshotFrame(room: Room, peer: Peer, parts = snapshotParts(room), always: string[] = []) {
	const g = room.game, me = g.players.get(peer.id);
	const head = JSON.stringify({ t: "snap", mapId: g.mapId, bossIn: Math.ceil(bossTimer(g)), bossTimers:Object.fromEntries(g.enemies.filter(e=>e.boss&&!e.summoned).map(e=>[e.dataId,Math.ceil(bossTimer(g,e.dataId))])), weight: me?.inventory ? inventoryWeight(me.inventory, g.data) : 0, weightLimit: me?.stats.weight, tick: room.tick, ack: peer.ack, time: g.time, kills: g.kills, bossSpawned: g.bossSpawned, won: g.won });
		const players: string[] = me ? [JSON.stringify(ownEntry(me,g))] : [];
	let nearby = [...g.players.values()].filter((p) => p.id !== peer.id && (!me || always.includes(p.id) || Math.hypot(p.x - me.x, p.z - me.z) <= VIEW_RANGE));
	if (me && nearby.length > VIEW_MAX_PLAYERS)
		nearby = nearby.map((p) => ({ p, d: always.includes(p.id) ? -1 : Math.hypot(p.x - me.x, p.z - me.z) })).sort((a, b) => a.d - b.d).slice(0, VIEW_MAX_PLAYERS).map((x) => x.p);
	for (const p of nearby) players.push(parts.others.get(p.id) ?? JSON.stringify(publicEntry(p,g)));
	return head.slice(0, -1) + ',"players":[' + players.join(",") + "]," + parts.world(me) + "}";
}
export function snapshot(room: Room, peer: Peer) {
	return JSON.parse(snapshotFrame(room, peer));
}
export function mountRealtime(server: Server, options: RealtimeOptions) {
	const { store } = options,
		data = loadGameData(),
		rooms = new Map<string, Room>(),
		live = new Map<string, Peer>(),
		samples: number[] = [];
	let received = 0,
		sent = 0,
		dropped = 0,
		invalid = 0,
		ticks = 0,
		lastMetric = Date.now(),
		lastIn = 0,
		lastOut = 0,
		inRate = 0,
		outRate = 0,
		closing = false;
	const activeJoins=new Set<Promise<void>>();
 const ipLimits=new Map<string,{active:number;count:number;until:number}>();
 const joins=new Map<string,Promise<void>>(), saves=new Map<string,Promise<void>>();
 const wss = new WebSocketServer({
		noServer: true,
		maxPayload: 4096,
		perMessageDeflate: { threshold: 256 },
	});
	function send(ws: WebSocket, body: unknown) {
		if (ws.readyState !== WebSocket.OPEN) return;
				if (ws.bufferedAmount > 512 * 1024) {
			ws.close(4408, "slow consumer");
			return;
		}
		ws.send(typeof body === "string" ? body : JSON.stringify(body));
		sent++;
	}
 const rankings=createRankings(store,()=>[...live.values()].flatMap(peer=>{const p=peer.room.game.players.get(peer.id);return p?[{...p,jobId:p.jobId}]:[];}));
 function titleState(peer:Peer,p:Player,announce=false){
  const earned=earnTitles(p);
  const current=titleDefinition(p.titleId);
  if(announce&&!earned.length&&current?.metric!=='rank')return;
  const ranks=rankings.ranks(p.id);
  const removed=!!p.titleId&&(!current||((current.metric!=='rank'||rankings.ready)&&!canWearTitle(current,p,ranks)));
  if(removed)p.titleId=null;
  p.displayTitleId=current&&canWearTitle(current,p,ranks)?current.id:null;
  if(earned.length||removed)void save(peer.room,p.id);
  if(announce&&!earned.length&&!removed)return;
  send(peer.ws,{t:'titles',selected:p.titleId??null,list:TITLES.map(t=>({...t,unlocked:!!canWearTitle(t,p,ranks),progress:titleProgress(t,p,ranks),rank:t.board?ranks[t.board]??null:null}))});
  if(announce&&earned.length)send(peer.ws,{t:'ev',list:earned.map(t=>({type:'notice',playerId:p.id,text:'ได้รับฉายา · '+t.name}))});
 }
 const social=createSocial<Peer>({live,send,command:(peer,text)=>gm.command(peer,text)});
 const trades=createTrades<Peer>({live,send,store,data,settled:(peer,p,r)=>{p.inventory=r.inventory;p.gold=r.gold;p.boundGold=r.boundGold??0;refreshStats(peer.room.game,p);sendStats(peer,p);send(peer.ws,{t:'inv',req:randomUUID(),inventory:p.inventory,gold:p.gold,boundGold:p.boundGold??0});}});
 function economy(peer:Peer,p:Player,op:InventoryOp,req:string,done=()=>{},quest?:EconomyContext['quest']) {
  const room=peer.room,g=room.game;
  const usedTemplate=op.op==='use'?data.items.items.find(t=>t.id===p.inventory?.items.find(i=>i.id===op.id)?.template):undefined;
  const sunTarget=usedTemplate?.effect==='arcane'&&p.level>=usedTemplate.level?sunScrollTarget(g,p)?.id:undefined;
  if(op.op==='pickup'){
   if(peer.busy){const d=g.drops.find(d=>String(d.id)===op.id);if(d)d.pending=false;return;}
   try{applyInventory({inventory:p.inventory!,gold:p.gold,boundGold:p.boundGold??0},op,p.profile,data,randomUUID);}catch(error){const d=g.drops.find(d=>String(d.id)===op.id);if(d){d.pending=false;d.blocked=true;}send(peer.ws,{t:'ev',list:[{type:'notice',playerId:p.id,text:(error as Error).message}]});return;}
  }
  peer.busy=(peer.busy||0)+1;
  const operation=room.saveQueue.then(async()=>{
   const result=await store.inventoryOp(peer.accountId,p.id,req,op,{quest,leaseOwner:peer.leaseOwner,bossLoot:op.op==='pickup'?(g.drops.find(d=>String(d.id)===op.id&&d.boss)?.bossId??(g.drops.some(d=>String(d.id)===op.id&&d.boss)?'king_jelly':undefined)):undefined,profile:structuredClone(p.profile),room:room.key,tick:room.tick});
   const latest=result.duplicate?await store.inventory(peer.accountId,p.id):result;
   p.inventory=latest.inventory;p.gold=latest.gold;p.boundGold=latest.boundGold??0;if(latest.claimedLevelRewards)p.claimedLevelRewards=[...latest.claimedLevelRewards];refreshStats(g,p);
   if(result.error){if(op.op==='pickup')room.dropRequests?.delete(op.id!);throw Error(result.error);}
   if(result.effect&&!result.duplicate){if(result.effect.kind==='arcane'&&sunTarget!==undefined)castSunScroll(g,p,result.effect.amount,sunTarget,usedTemplate?.arcaneElement);applyPotionEffect(g,p,result.effect.kind,result.effect.amount,result.effect.duration);}
      if(latest.consumableBuffs)p.consumableBuffs=structuredClone(latest.consumableBuffs);if(latest.legacyLevelRewards)p.legacyLevelRewards=[...latest.legacyLevelRewards];
      done();if(op.op==='store'&&p.quests&&recordStore(p.quests,data).length)sendQuests(peer,p);if(op.op==='pickup')void save(room,p.id);sendStats(peer,p);send(peer.ws,{t:'inv',req,inventory:p.inventory,gold:p.gold,boundGold:p.boundGold??0});
   if(op.op==='pickup'){room.dropRequests?.delete(op.id!);}
   if(op.op==='pickup')send(peer.ws,{t:'ev',list:[{type:'itemPickup',playerId:p.id,loot:op.loot}]});
  });
    const settled=operation;
  room.saveQueue=operation.catch(e=>{
   if(op.op==='levelReward')mailboxState(peer,p,(e as Error).message);
   if(quest)send(peer.ws,{t:'questError',id:quest.id,text:'ส่งเควสต์ไม่สำเร็จ กรุณาลองใหม่'});
   const d=g.drops.find(d=>String(d.id)===op.id);if(op.op==='pickup'&&d){d.pending=false;d.noticeAt=g.time;d.blocked=true;}
   send(peer.ws,{t:'inv',req,error:(e as Error).message});send(peer.ws,{t:'ev',list:[{type:'notice',playerId:p.id,text:(e as Error).message}]});
  }).finally(()=>{if(quest)questBusy.delete(p.id);peer.busy!--;while(!peer.busy&&peer.deferred?.length&&live.get(peer.id)===peer&&!closing)intent(peer,peer.deferred.shift()!,true);});
  return settled;
 }
 function mailboxState(peer:Peer,p:Player,error?:string){send(peer.ws,{t:'mailbox',level:p.level,claimed:p.claimedLevelRewards??[],legacy:p.legacyLevelRewards??[],error});}
 function mailboxIntent(peer:Peer,p:Player,message:{op:'list'|'claim';level?:number;req?:string}){
  if(message.op==='list'){
   const room=peer.room;
   room.saveQueue=room.saveQueue.then(async()=>{const latest=await store.inventory(peer.accountId,p.id);p.claimedLevelRewards=[...(latest.claimedLevelRewards??[])];p.legacyLevelRewards=[...(latest.legacyLevelRewards??[])];mailboxState(peer,p);}).catch(()=>mailboxState(peer,p,'โหลดกล่องจดหมายไม่สำเร็จ กรุณาเปิดใหม่อีกครั้ง'));
   return;
  }
  if(peer.busy){mailboxState(peer,p,'กำลังบันทึก กรุณารอสักครู่');return;}
  const levels=message.level===undefined?Array.from({length:Math.max(0,p.level)},(_,i)=>i+1).filter(level=>!p.claimedLevelRewards?.includes(level)):[message.level];
  if(!levels.length){mailboxState(peer,p,'รับรางวัลที่ปลดล็อกครบแล้ว');return;}
  save(peer.room,p.id);
  void economy(peer,p,{op:'levelReward',levels},message.req??randomUUID(),()=>mailboxState(peer,p))?.catch(()=>{});
 }
 function sendQuests(peer:Peer,p:Player){send(peer.ws,{t:'quests',state:p.quests??{active:{},done:{}}});}
 const questBusy=new Set<string>();
 function questIntent(peer:Peer,p:Player,message:{op:'accept'|'turnIn'|'abandon';id:string}){
  const room=peer.room,g=room.game,q=data.quests.quests.find(q=>q.id===message.id);
  const fail=(text:string)=>send(peer.ws,{t:'questError',id:message.id,text});
  if(!q){fail('ไม่พบเควสต์');return;}
  if(questBusy.has(p.id)){fail('กำลังส่งเควสต์ กรุณารอสักครู่');return;}
  p.quests??={active:{},done:{}};
  if(message.op==='abandon'){if(!p.quests.active[q.id]){fail('ยังไม่ได้รับเควสต์นี้');return;}delete p.quests.active[q.id];void save(room,p.id);sendQuests(peer,p);return;}
  const at=giverPosition(q.giver);
  if(p.dead||g.mapId!=='city_plaza'||Math.hypot(p.x-at.x,p.z-at.z)>QUEST_TALK_RANGE){fail('ไปคุยกับผู้ให้เควสต์ก่อน');return;}
  if(message.op==='accept'){
   try{acceptQuest(p.quests,q.id,p.level,Date.now(),data);}catch(e){fail((e as Error).message);return;}
   void save(room,p.id);sendQuests(peer,p);send(peer.ws,{t:'ev',list:[{type:'notice',playerId:p.id,text:`รับเควสต์ · ${q.nameTh}`}]});return;
  }
  if(questStatus(q,p.quests,p.level,Date.now(),p.inventory)!=='ready'){fail('ยังทำเควสต์ไม่ครบ');return;}
  if(peer.busy){fail('กำลังบันทึก กรุณารอสักครู่');return;}
  const op={op:'quest' as const,loot:questTurnInItems(q),reward:q.rewards.items,gold:q.rewards.gold};
  // Stage EXP and allocation; publish only after rewards and completion commit together.
  const staged=structuredClone(p), stagedGame={...g,p:staged,events:[]} as Game;
  completeQuest(staged.quests!,q.id,Date.now());
  grantExp(stagedGame,staged,q.rewards.exp,q.rewards.jobExp,{quest:q.id});
  const progress:QuestProgress={quests:staged.quests,level:staged.level,xp:staged.xp,
   jobLevel:staged.jobLevel,jobExp:staged.jobExp,skillPoints:staged.skillPoints,
   statPoints:staged.statPoints,baseStats:staged.profile.baseStats,autoAllocCursor:staged.autoAllocCursor};
  const done=()=>{
   const {baseStats,...fields}=progress;
   const leveled=p.level<progress.level;
   Object.assign(p,structuredClone(fields));p.profile.baseStats={...baseStats};refreshStats(g,p);
   if(leveled){clearMasteryWounds(p);p.hp=p.maxHp;p.mp=p.maxMp;}
   g.events.push(...stagedGame.events);
   g.events.push({type:'questComplete',playerId:p.id,x:p.x,z:p.z,id:q.id,text:q.complete,rewards:q.rewards});
   flush(room);sendQuests(peer,p);
  };
  questBusy.add(p.id);
  const pending=economy(peer,p,op,randomUUID(),done,{id:q.id,acceptedAt:p.quests.active[q.id].at,progress});
  void pending?.catch(()=>{});
 }
 const bossDue=new Map<MapId,number>();
 const nestDue=new Map<MapId,number>();
 const gm=createGm<Peer>({store,admins:adminAccess(store,options.adminIds),live,send,social,transfer:(peer,d)=>transfer(peer,d),economy:(peer,p,op,req)=>economy(peer,p,op,req),save:(room,id)=>save(room as Room,id),flush:room=>flush(room as Room),sendStats:(peer,p)=>sendStats(peer,p),bossDue,limit:options.gmCommandsPer10s});
 const RAID_RETENTION_MS=30*60*1000;
 const roomKey=(map:MapId,id:string)=>map==='confluence'?'confluence:'+ (social.partyId(id)??'solo:'+id):map+(options.sharedRooms?'':':'+id);
 function getRoom(mapId: MapId, id: string): Room {
  const key=roomKey(mapId,id);
  let room=rooms.get(key);
  if(!room){
   const game=createGame(randomInt(1,0x7fffffff),data.stats.defaultBuild,'local',data,mapId);
   if(isField(mapId))game.resolveMonsterKnockback=monsterKnockbackFor(mapId);
   game.jobExpMultiplier=options.production?1:Math.max(1,Math.min(1000,options.devJobExpMultiplier||1));
   // A room is the authoritative map/channel boundary; disconnected avatars remain in game.players briefly.
   game.partyMembers=id=>social.partyMembers(id).filter(memberId=>{const peer=live.get(memberId);return !!peer?.ready&&peer.room.game===game;});
   game.players.clear();
   room={key,game,peers:new Map(),accounts:new Map(),disconnected:new Map(),tick:0,saveQueue:Promise.resolve(),...(mapId==='confluence'?{raidExpiresAt:Date.now()+RAID_RETENTION_MS}:{})};
   rooms.set(key,room);
   // Field bosses run on one schedule per map, surviving empty rooms being recycled.
   const due=isField(mapId)&&mapId!=='confluence'?bossDue.get(mapId):undefined;
   if(due&&due>Date.now())setBossTimer(game,(due-Date.now())/1000);
   const nest=nestDue.get(mapId);if(nest&&nest>Date.now())setBossTimer(game,(nest-Date.now())/1000,'thorn_nest_mother');
   const current=room;
   game.inventoryCommit=(p,op,done)=>{
    const peer=current.peers.get(p.id);if(!peer){const d=current.game.drops.find(d=>String(d.id)===op.id);if(d)d.pending=false;return;}
    current.dropRequests??=new Map();let req:string=randomUUID();if(op.op==='pickup'){const key=op.id!;req=current.dropRequests.get(key)||req;current.dropRequests.set(key,req);}
    economy(peer,p,op,req,done);
   };
  }
  return room;
 }
 function sendMapDiscovery(peer:Peer){send(peer.ws,{t:'mapDiscovery',maps:peer.discoveredMaps});}
 async function discoverAndTravel(peer:Peer,gate:string,destination:{mapId:MapId;x:number;z:number}){
  const source=peer.room,p=source.game.players.get(peer.id)!;
  if(peer.discoveredMaps.includes(destination.mapId)){transfer(peer,destination);return;}
  peer.discovering=true;peer.input={x:0,z:0};
  try{
   const maps=await store.discoverMap(peer.accountId,peer.id,destination.mapId,peer.leaseOwner);
   if(live.get(peer.id)!==peer||peer.room!==source||p.dead||peer.ws.readyState!==WebSocket.OPEN)return;
   peer.discoveredMaps=maps;
   if(!travelDestination(source.game.mapId,gate,p)){sendMapDiscovery(peer);return;}
   transfer(peer,destination);
   send(peer.ws,{t:'ev',list:[{type:'notice',playerId:peer.id,text:'เปิดจุดวาร์ป '+MAP_INFO[destination.mapId].name+' แล้ว · วาร์ปได้จากแผนที่โลกในเมือง'}]});
  }catch(error){console.error('Map discovery failed',error instanceof Error?error.message:error);send(peer.ws,{t:'ev',list:[{type:'notice',playerId:peer.id,text:'บันทึกจุดวาร์ปไม่สำเร็จ กรุณาลองใหม่'}]});}
  finally{peer.discovering=false;}
 }
 function transfer(peer: Peer, destination: {mapId:MapId;x:number;z:number}) {
  const source=peer.room,p=source.game.players.get(peer.id)!;
  removeSummon(source.game,p,'transfer');removeWisp(source.game,p,'transfer');clearMasteryPoisons(source.game,p.id);clearMasteryHeals(source.game,p.id);clearAdvancedMastery(p);
  const target=getRoom(destination.mapId,peer.id);
  source.peers.delete(peer.id);source.game.players.delete(peer.id);source.accounts.delete(peer.id);source.disconnected.delete(peer.id);source.leases?.delete(peer.id);
  source.game.meteors=source.game.meteors.filter(m=>m.ownerId!==peer.id);clearMasteryWounds(p);
  Object.assign(p,destination,{target:null,destination:null,auto:false,autoState:'idle',autoPath:[],autoGoal:null,autoUnreachable:undefined,attack:0,dash:0,castRemaining:0,statuses:[],moving:false,whirlwindHits:[],boxerCombo:undefined});
  if(destination.mapId==='city_plaza'&&destination.x===CITY_SPAWN.x&&destination.z===CITY_SPAWN.z){p.fx=0;p.fz=1;}
  refreshStats(target.game,p);
  trades.leave(peer.id,'ย้ายแมพ การแลกถูกยกเลิก');peer.input={x:0,z:0};peer.room=target;
  target.game.players.set(p.id,p);target.peers.set(p.id,peer);target.accounts.set(p.id,peer.accountId);(target.leases??=new Map()).set(p.id,peer.leaseOwner!);
  target.saveQueue=Promise.all([source.saveQueue,target.saveQueue]).then(()=>{});
  void save(target,p.id);
  send(peer.ws,snapshotFrame(target,peer));sendMapDiscovery(peer);
 }
	function save(room: Room, id: string, strict = false, override:Partial<Progress> = {}) {
		const p = room.game.players.get(id),
			accountId = room.accounts.get(id),leaseOwner=room.leases?.get(id);
		if (!p || !accountId) return room.saveQueue;
		const operation = room.saveQueue.then(async () => {
        const body: Progress = {
						titleId:p.titleId??null,unlockedTitles:[...p.unlockedTitles??[]],titleRecords:structuredClone(p.titleRecords??{bosses:{}}),
                        bossReadyAt:p.bossReadyAt,bossCooldowns:{...p.bossCooldowns},autoSeconds:p.autoSeconds,quests:p.quests,
 jobId: p.jobId,
			jobLevel: p.jobLevel,
			jobExp: p.jobExp,
			skillPoints: p.skillPoints,
			skills: { ...p.skills },
				masteries: { ...p.masteries },
				masteryExp: { ...p.masteryExp },
				masteryVersion: p.masteryVersion,
			audioSettings: p.audioSettings,
			autoPotion: p.autoPotion && { hp: { ...p.autoPotion.hp }, mp: { ...p.autoPotion.mp } },
			hotbar: p.hotbar.map((s) => ({ ...s })),
			jobsVersion: 3,
			level: p.level,
			xp: Math.floor(p.xp),
			gold: p.gold,
			kills: p.kills,
			potions: p.potions,
			mapId: p.dead ? "city_plaza" : p.mapId,
 healerReadyAt: p.healerReadyAt, returnReadyAt:p.returnReadyAt,
 posX: p.dead ? CITY_SPAWN.x : p.x,
			posZ: p.dead ? CITY_SPAWN.z : p.z,
			baseStats: { ...p.profile.baseStats },
			race: p.profile.race,
			classId: p.profile.classId,
			statPoints: p.statPoints,
			autoAllocate: p.autoAllocate,
			autoAllocCursor: p.autoAllocCursor,
			dataVersion: 1,
			...override,
		};
			await store.saveProgress(accountId, id, body,leaseOwner);
		});
		room.saveQueue = operation.catch((e) => {
			console.error("Realtime save failed", e instanceof Error ? e.message : e);
		});
		const saved=room.saveQueue;saves.set(id,saved);void saved.finally(()=>{if(saves.get(id)===saved)saves.delete(id);});
		return strict ? operation : room.saveQueue;
	}
		function flush(room: Room) {
		const list = room.game.events.splice(0);
		if (!list.length) return;
        const changed=new Set<string>();
        for(const e of list){
         const id=String(e.type==='kill'?e.ownerId:e.playerId),p=room.game.players.get(id);if(!p)continue;
         if(e.type==='kill'&&e.boss&&['king_jelly','mist_warden'].includes(String(e.dataId))){
          p.titleRecords??={bosses:{}};const key=String(e.dataId);p.titleRecords.bosses[key]=(p.titleRecords.bosses[key]??0)+1;
          void save(room,id);
         }
         if(e.type==='kill'||e.type==='level')changed.add(id);
        }
        for(const id of changed){const p=room.game.players.get(id)!,peer=room.peers.get(id);if(peer)titleState(peer,p,true);else if(earnTitles(p).length)void save(room,id);}
		for (const e of list) if (e.type === "kill" && e.boss && isField(room.game.mapId)&&room.game.mapId!=='confluence') (e.dataId==='thorn_nest_mother'?nestDue:bossDue).set(room.game.mapId, Date.now() + BOSS_RESPAWN_MS(room.game.mapId));
		for (const e of list)
			if (e.type === "kill" && e.dataId && e.ownerId) {
				const ids = social.partyMembers(String(e.ownerId));
				for (const id of ids) {
					const member = room.game.players.get(id);
					if (!member?.quests || member.dead || (id !== e.ownerId && Math.hypot(member.x - e.x, member.z - e.z) > data.quests.shareRange)) continue;
					if (recordKill(member.quests, String(e.dataId), data).length) { const peer = room.peers.get(id); if (peer) sendQuests(peer, member); }
				}
			}
		for (const peer of room.peers.values())
			if (peer.ready) send(peer.ws, { t: "ev", tick: room.tick, list });
		for (const e of list)
			if (["level", "jobLevel"].includes(e.type)) {
				const p = room.game.players.get(String(e.playerId));
				const peer = room.peers.get(String(e.playerId));
				if (p && peer) sendStats(peer, p);
			}
		for (const e of list)
			if (["level", "jobLevel", "death", "victory"].includes(e.type)) {
				if (e.type === "victory"){
					for (const id of room.game.players.keys()) void save(room, id);
					const winner=room.game.players.get(String(e.playerId));if(winner)social.system(`✦ ${winner.name} ปราบ${data.monsters.monsters.find(m=>m.id===e.dataId)?.nameTh??'บอส'}สำเร็จ!`);
				}
				else void save(room, String(e.playerId));
			}
	}
	function sendStats(peer: Peer, p: Player) {
 if(!peer.ui&&!peer.uiLoading){peer.uiLoading=true;void store.uiSettings(peer.accountId).then(settings=>{peer.ui=settings;const {auto,...ui}=settings;p.autoCfg=normalizeAuto(auto);send(peer.ws,{t:'uiSettings',settings:ui});send(peer.ws,{t:'autoSettings',settings:p.autoCfg});}).catch(()=>send(peer.ws,{t:'uiSettingsError',text:'โหลดการตั้งค่าไม่สำเร็จ'})).finally(()=>{peer.uiLoading=false;});}
		send(peer.ws, {
			t: "ev",
			list: [
				{
					type: "stats",
					playerId: p.id,
					base: { ...p.profile.baseStats },
					points: p.statPoints,
					derived: p.stats,
					profile: p.profile,
					autoAllocate: p.autoAllocate,
					statResetFree: peer.room.game.data.stats.statResetFree,
					audioSettings: p.audioSettings,
					autoPotion: p.autoPotion,
					job: normalizeJob(p),
				},
			],
		});
	}
	function intent(peer: Peer, message: Intent, queued=false) {
		const { room } = peer,
			g = room.game;
		if (message.t === "hello") {
			send(peer.ws, {
				t: "welcome",
				you: peer.id,
				build: options.build,
				tick: room.tick,
				dataVersion: 1,
			});
			return;
		}
		if (message.t === "ping") {
			send(peer.ws, { t: "pong", c: message.c, s: Date.now() });
			return;
		}
		if (message.t === "spawnReady") {
            const p=g.players.get(peer.id);if(p)send(peer.ws,{t:"inv",inventory:p.inventory,gold:p.gold,boundGold:p.boundGold??0});
			if (!peer.ready) {
				peer.ready = true;
				room.disconnected.delete(peer.id);
			}
			{const p=g.players.get(peer.id);if(p)titleState(peer,p);}
			send(peer.ws, snapshotFrame(room, peer));
			sendStats(peer, g.players.get(peer.id)!);
						social.ready(peer);void gm.ready(peer);sendMapDiscovery(peer);
			{const qp=g.players.get(peer.id);if(qp){sendQuests(peer,qp);mailboxState(peer,qp);}}
			return;
		}
		if (!peer.ready || peer.discovering) return;
        if(message.t==='titles'){titleState(peer,g.players.get(peer.id)!);return;}
        if(message.t==='rankings'){
         void rankings.refresh().then(()=>{if(live.get(peer.id)===peer)send(peer.ws,rankings.board(message.board,peer.id));}).catch(()=>send(peer.ws,{t:'rankingError',text:'โหลดอันดับไม่สำเร็จ กรุณาลองใหม่'}));return;
        }

		if (message.t === "chat") { social.chat(peer, message); return; }
				if (message.t === "party") { social.party(peer, message); return; }
				if (message.t === "trade") { trades.handle(peer, message); return; }
        if(message.t==='mailbox'){const p=g.players.get(peer.id);if(p)mailboxIntent(peer,p,message);return;}
		if (message.t === "quest") { const qp=g.players.get(peer.id);if(qp)questIntent(peer,qp,message); return; }
		if (!queued && "seq" in message) {
			if (message.seq <= peer.ack) return;
			peer.ack = message.seq;
		}
        if(questBusy.has(peer.id)){(peer.deferred??=[]).push(message);return;}
        const player=g.players.get(peer.id)!;
        // Delayed movement belongs to its source map, even if its coordinates are valid here.
        if((message.t==='move'||message.t==='steer')&&message.mapId!==undefined&&message.mapId!==g.mapId)return;
        if(message.t==='titleEquip'){
         if(peer.titleSaving){send(peer.ws,{t:'titleError',text:'กำลังบันทึกฉายา กรุณารอสักครู่'});return;}
         const t=titleDefinition(message.id);
         if(message.id!==null&&(!t||!canWearTitle(t,player,rankings.ranks(player.id)))){send(peer.ws,{t:'titleError',text:'ยังใช้ฉายานี้ไม่ได้'});return;}
         peer.titleSaving=true;
         void save(room,player.id,true,{titleId:message.id}).then(()=>{player.titleId=message.id;titleState(peer,player);}).catch(()=>send(peer.ws,{t:'titleError',text:'บันทึกฉายาไม่สำเร็จ กรุณาลองใหม่'})).finally(()=>{peer.titleSaving=false;});return;
        }

        if(!player.autoCfg&&peer.ui?.auto)player.autoCfg=normalizeAuto(peer.ui.auto);
        if(peer.busy&&(['travel','cityWarp','revive','returnCity'].includes(message.t)||(message.t==='inv'&&message.op==='use'))){(peer.deferred??=[]).push(message);return;}
        if(message.t==='inv'){
         const reject=(error:string)=>send(peer.ws,{t:'inv',req:message.req,error});
         if(player.dead){reject('รอฟื้นตัวก่อน');return;}
         if(message.op==='pickup'){const d=g.drops.find(d=>d.id===message.drop);if(d)d.blocked=false;if(d&&!d.pending&&(d.ownerId===player.id||d.time>=data.economy.lootOwnershipSeconds)&&Math.hypot(player.x-d.x,player.z-d.z)<4){moveTo(g,d.x,d.z);}return;}
         if(message.op==='buy'||message.op==='sell'){const npc=CITY_BUILDINGS.find(b=>b.id===message.shop);if(g.mapId!=='city_plaza'||!npc||Math.hypot(player.x-npc.talk.x,player.z-npc.talk.z)>=3){reject('ไปพบพ่อค้าก่อน');return;}}
         if(message.op==='socket'||message.op==='refine'||message.op==='craft'||message.op==='salvage'){const smith=CITY_BUILDINGS.find(b=>b.id==='forge')!;if(g.mapId!=='city_plaza'||Math.hypot(player.x-smith.talk.x,player.z-smith.talk.z)>=3){reject('ไปพบช่างตีเหล็กในเมืองก่อน');return;}}
         if(message.op==='store'||message.op==='retrieve'){const keeper=CITY_BUILDINGS.find(b=>b.id==='storage')!;if(g.mapId!=='city_plaza'||Math.hypot(player.x-keeper.talk.x,player.z-keeper.talk.z)>=3){reject('ไปพบคนเฝ้าคลังก่อน');return;}}
         if(message.op==='use'&&(player.cd.potion>0||peer.busy)){reject('รอคูลดาวน์ยาหรือการบันทึกก่อน');return;}
         if(message.op==='use'){const item=player.inventory?.items.find(i=>i.id===message.id),kind=data.items.items.find(t=>t.id===item?.template)?.effect;if(kind==='arcane'&&(!sunScrollTarget(g,player)||player.level<(data.items.items.find(t=>t.id===item?.template)?.level??50))){reject('ม้วนธาตุต้องถึงระดับไอเทม และเลือกศัตรูที่มองเห็นในระยะ 6 เมตร');return;}if((kind==='party_hp'||kind==='party_cleanse')&&!partyAidTarget(g,player,kind)){reject(kind==='party_hp'?'ไม่มีสมาชิกปาร์ตี้ที่บาดเจ็บในระยะ 6 เมตร':'ไม่มีสมาชิกปาร์ตี้ติดสถานะลบในระยะ 6 เมตร');return;}}
         // The refine outcome is drawn here, never by the client (protocol.ts rejects a client-sent roll).
         economy(peer,player,message.op==='refine'?{...message,roll:Math.random()}:message,message.req);return;
        }
        if(message.t==='autoSettings'){
 const auto=normalizeAuto(message.settings);player.autoCfg=auto;const merged={...(peer.ui??DEFAULT_UI),auto};peer.ui=merged;
 void store.saveUISettings(peer.accountId,merged).then(()=>send(peer.ws,{t:'autoSettings',settings:auto})).catch(()=>send(peer.ws,{t:'autoSettingsError',text:'บันทึกตั้งค่า AUTO ไม่สำเร็จ'}));return;
 }
        if(message.t==='uiSettings'){
 // Every action key is rebindable; the shared rules check fixed keys, duplicates and the hotbar's own keys.
 const explicitPotionConflict=['potion','manaPotion'].some(action=>player.hotbar.some(s=>s.key===(message.settings.keys as Record<string,string>)[action]));
 const problem=explicitPotionConflict?'ปุ่มนี้ใช้กับช่องแถบสกิลอยู่':bindingProblem(resolveKeys(message.settings.keys,player.hotbar.map(s=>s.key)),player.hotbar.map(s=>s.key));if(problem){send(peer.ws,{t:'uiSettingsError',text:problem});return;}
 const merged={...message.settings,...(peer.ui?.auto?{auto:peer.ui.auto}:{})};void store.saveUISettings(peer.accountId,merged).then(()=>{peer.ui=merged;send(peer.ws,{t:'uiSettings',settings:message.settings});}).catch(()=>send(peer.ws,{t:'uiSettingsError',text:'บันทึกการตั้งค่าไม่สำเร็จ'}));return;
 }

 if(message.t==='returnCity'){
 if(player.dead||g.mapId==='city_plaza'||Date.now()<(player.returnReadyAt||0)||g.enemies.some(e=>e.boss&&!e.dead&&e.engaged)){
 send(peer.ws,{t:'ev',list:[{type:'notice',playerId:peer.id,text:'ยังกลับเมืองไม่ได้: อยู่ในเมือง รอคูลดาวน์ หรือต่อสู้กับราชาวุ้น'}]});return;}
 if(!player.returnRemaining){player.returnRemaining=5;withPlayer(g,peer.id,()=>{setAuto(g,false);player.target=null;player.destination=null;});peer.input={x:0,z:0};}return;
 }
 if(message.t==='pickupAll'){
 if(!player.dead)for(const d of g.drops){d.blocked=false;}
 if(!player.dead)for(const d of g.drops)if(!d.pending&&(d.ownerId===player.id||d.time>=data.economy.lootOwnershipSeconds)&&Math.hypot(d.x-player.x,d.z-player.z)<=4){d.x=player.x;d.z=player.z;d.time=Math.max(.26,d.time);}return;
 }
 if(player.returnRemaining&&(['move','target','act','travel','auto'].includes(message.t)||(message.t==='steer'&&Math.hypot(message.dx,message.dz)>.05)))player.returnRemaining=0;

        if(message.t==='cityWarp'){
         const destination=cityWarpDestination(g.mapId,message.mapId,peer.discoveredMaps,player.dead);
         if(!destination){send(peer.ws,{t:'ev',list:[{type:'notice',playerId:peer.id,text:player.dead?'วาร์ปไม่ได้ขณะหมดสติ':g.mapId!=='city_plaza'?'วาร์ปได้จากในเมืองเท่านั้น':'ต้องเดินทางไปเปิดแมพนี้ครั้งแรกก่อน'}]});return;}
         if(destination.mapId==='confluence'&&!canEnterConfluence(player)){send(peer.ws,{t:'ev',list:[{type:'notice',playerId:peer.id,text:'รอยต่อพิภพต้อง Lv.100 และผ่านเควสต์คำเชิญก่อน'}]});return;}
         transfer(peer,destination);return;
        }
        if(message.t==='travel'){
         const destination=travelDestination(g.mapId,message.gate,player);
         if(destination?.mapId==='confluence'&&!canEnterConfluence(player)){send(peer.ws,{t:'ev',list:[{type:'notice',playerId:peer.id,text:'รอยต่อพิภพต้อง Lv.100 และผ่านเควสต์คำเชิญจากหัวหน้าทหารก่อน'}]});return;}
         if(destination)void discoverAndTravel(peer,message.gate,destination);
         else send(peer.ws,{t:'ev',list:[{type:'notice',playerId:peer.id,text:'หมอกหนาเกินไป ยังผ่านไม่ได้'}]});
         return;
        }
        if(message.t==='revive' && player.dead){
         if((player.reviveRemaining??0)>0)return;
         withPlayer(g,peer.id,()=>revive(g));flush(room);if(g.mapId==='confluence'){void save(room,peer.id,true);sendStats(peer,player);return;}transfer(peer,{mapId:'city_plaza',...CITY_SPAWN});return;
        }
		withPlayer(g, peer.id, () => {
			const p = g.p;
 if(message.t==="heal"){if(healerHeal(g,Date.now()))void save(room,p.id);return;}
            if (message.t === "autoPotion") {
              p.autoPotion = { hp: { ...message.settings.hp }, mp: { ...message.settings.mp } };
              void save(room, p.id, true).then(() => send(peer.ws, {t:"autoPotion", settings:p.autoPotion})).catch(() => send(peer.ws, {t:"autoPotionError"}));
              return;
            }
            if (message.t === "audioSettings") {
              p.audioSettings = { ...message.settings };
              void save(room, p.id, true).then(() => send(peer.ws, {t:"audioSettings", settings:p.audioSettings})).catch(() => send(peer.ws, {t:"audioSettingsError"}));
              return;
            }
			if (
				message.t === "skillUp" ||
				message.t === "hotbar" ||
				message.t === "jobChange"
			) {
				try {
					if (p.dead) throw Error("รอฟื้นตัวก่อน");
					if(message.t==='hotbar'&&g.time-p.lastCombat<5&&JSON.stringify(message.slots.map(s=>s.signature??null))!==JSON.stringify(p.hotbar.map(s=>s.signature??null)))throw Error('เปลี่ยน Mix ได้เมื่อพ้นการต่อสู้ 5 วินาที');
                    if(message.t==='hotbar'&&message.slots.some(s=>reservedKeys(resolveKeys(peer.ui?.keys,p.hotbar.map(s=>s.key))).includes(s.key)))throw Error('ปุ่มนี้ใช้กับคำสั่งอื่นอยู่');
                    let next = normalizeJob(p);
					if (message.t === "skillUp") next = learnSkill(p, message.id, g.data);
					if (message.t === "hotbar")
						next = {
							...next,
							hotbar: validateHotbar(p, message.slots, g.data, reservedKeys(resolveKeys(peer.ui?.keys,p.hotbar.map(s=>s.key)))),
						};
					if (message.t === "jobChange") {
						if(g.mapId!=="city_plaza")throw Error("ไปพบทูตสวรรค์ในเมืองก่อน");
 next = changeJob(p, message.job, p.x, p.z, g.data);
						p.profile.classId = next.jobId;
					}
					Object.assign(p, next);
					refreshStats(g, p);
					void save(room, p.id, true)
						.then(() => sendStats(peer, p))
						.catch(() =>
							send(peer.ws, {
								t: "ev",
								list: [
									{
										type: "skillsError",
										playerId: p.id,
										text: "เปลี่ยนในรอบนี้แล้ว แต่บันทึกไม่สำเร็จ กรุณาลองใหม่",
									},
								],
							}),
						);
				} catch (e) {
					invalid++;
					send(peer.ws, {
						t: "ev",
						list: [
							{
								type: "skillsError",
								playerId: p.id,
								text: e instanceof Error ? e.message : "เปลี่ยนไม่สำเร็จ",
							},
						],
					});
				}
				return;
			}
			if (
				message.t === "stats" ||
				message.t === "statsReset" ||
				message.t === "autoAlloc"
			) {
				try {
					const next =
						message.t === "stats"
							? allocateStats(p, message.add, g.data)
							: message.t === "statsReset"
								? resetStats(p, g.data)
								: autoAllocateStats({ ...p, autoAllocate: message.on }, g.data);
					Object.assign(p, next);
					refreshStats(g, p);
					void save(room, p.id, true)
						.then(() => sendStats(peer, p))
						.catch(() => {
							sendStats(peer, p);
							send(peer.ws, {
								t: "ev",
								list: [
									{
										type: "statsError",
										playerId: p.id,
										text: "สเตตัสมีผลในรอบนี้ แต่บันทึกไม่สำเร็จ กรุณารอการเชื่อมต่อกลับมา",
									},
								],
							});
						});
				} catch (e) {
					invalid++;
					send(peer.ws, {
						t: "ev",
						list: [
							{
								type: "statsError",
								playerId: p.id,
								text: e instanceof Error ? e.message : "จัดสรรไม่สำเร็จ",
							},
						],
					});
				}
				return;
			}
			if (message.t === "steer") {
				const len = Math.hypot(message.dx, message.dz) || 1;
				peer.input = {
					x: message.dx / Math.max(1, len),
					z: message.dz / Math.max(1, len),
				};
				peer.lastSteer = Date.now();
				if (Math.hypot(message.dx, message.dz) > 0.05) {
					setAuto(g, false);
					g.target = null;
					g.destination = null;
				}
			}
			if (message.t === "move") {
				if (walkable(message.x, message.z,.3,g.mapId)) {
					moveTo(g, message.x, message.z);
					peer.input = { x: 0, z: 0 };
				}
			}
			if (message.t === "target") {
				if (g.enemies.some((e) => e.id === message.id && !e.dead)) {
					g.target = message.id;
					g.destination = null;
					peer.input = { x: 0, z: 0 };
				}
			}
			if (message.t === "auto") {
				setAuto(g, message.on);
				if (!message.on) {
					g.target = null;
					g.destination = null;
				}
			}
			if (message.t === "act") {
 if((message.point!==undefined&&(masteryTarget(message.a)!=='ground'||message.target!==undefined||message.ally!==undefined))||(message.ally!==undefined&&masteryTarget(message.a)!=='ally')||(['self','ally','pet'].includes(masteryTarget(message.a))&&message.target!==undefined))return;
 if(g.mapId==="city_plaza"){action(g,message.a);return;}
				if (message.target !== undefined) {
					const target = g.enemies.find(
						(e) => e.id === message.target && !e.dead,
					);
					const spec = isMasteryAction(message.a)?resolveSkill(g.data,message.a,p.skills[message.a]||1):g.data.skills.skills.find(
						(s) => s.id === skillId(message.a),
					);
					if (!target || !spec) return;
					const reach =
						spec.id === "basic" && target.boss
							? 2.3
							: Math.max(spec.range, spec.radius);
					if (Math.hypot(target.x - p.x, target.z - p.z) > reach) return;
					g.target = target.id;
				}
				action(g, message.a, message.ally,message.point);
			}
		});
		flush(room);
	}
	server.on("upgrade", (req, socket, head) => {
		if(closing){socket.destroy();return;}
        const ip=(options.production?String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',').at(-1)!.trim():req.socket.remoteAddress||'unknown'),now=Date.now();
        for(const[k,v]of ipLimits)if(v.until<=now&&!v.active)ipLimits.delete(k);
        let limit=ipLimits.get(ip);if(!limit){limit={active:0,count:0,until:now+60000};ipLimits.set(ip,limit);}if(limit.until<=now){limit.count=0;limit.until=now+60000;}
        if(++limit.count>(options.ipUpgradesPerMinute??60)||limit.active>=(options.ipMaxSockets??30)){socket.destroy();return;}
        limit.active++;socket.once('close',()=>{limit!.active--;});
        let url:URL;
        try { url=new URL(req.url || "/", `http://${req.headers.host}`); }
        catch { socket.destroy();return; }
		if (url.pathname !== "/api/ws") {
			socket.destroy();
			return;
		}
		wss.handleUpgrade(req, socket, head, (ws) => {
            let connectedPeer:Peer|undefined;
            ws.on('error',()=>{});
            ws.on('close',()=>{
             const peer=connectedPeer;if(!peer||live.get(peer.id)!==peer)return;
             live.delete(peer.id);peer.room.peers.delete(peer.id);peer.input={x:0,z:0};
             const player=peer.room.game.players.get(peer.id);if(player){removeSummon(peer.room.game,player,'disconnect');removeWisp(peer.room.game,player,'disconnect');clearMasteryPoisons(peer.room.game,player.id);clearMasteryHeals(peer.room.game,player.id);clearAdvancedMastery(player);}
             peer.room.disconnected.set(peer.id,Date.now());social.offline(peer.id);trades.leave(peer.id);if(!closing)void save(peer.room,peer.id);
            });
			const task=(async () => {
				const origin = req.headers.origin,
					host = req.headers.host;
				const forwarded = String(req.headers["x-forwarded-proto"] || "")
					.split(",")[0]
					.trim();
				const scheme =
					forwarded === "https" ||
					(req.socket as { encrypted?: boolean }).encrypted
						? "https"
						: "http";
				if (origin && origin !== `${scheme}://${host}`) {
					ws.close(4403, "origin rejected");
					return;
				}
				const token = parse(req.headers.cookie || "").tn_session,
					hash = token ? hashToken(token, options.secret) : "",
					session = hash ? await store.session(hash) : undefined;
				if(session?.selectedCharacterId)await saves.get(session.selectedCharacterId);
				let character = session?.selectedCharacterId
					? await store.character(
							session.accountId,
							session.selectedCharacterId,
						)
					: undefined;
				if (!session || !character) {
					ws.close(4401, "login and selected character required");
					return;
				}
				if (needsJob(character)) {
					ws.close(4412, "job selection required");
					return;
				}
				const accountUid = (await store.account(session.accountId))?.uid;
				if (url.searchParams.get("v") !== options.build) {
					send(ws, { t: "reload" });
					ws.close(4400, "stale build");
					return;
				}
				if (url.searchParams.get("area") !== "meadow-01") {
					ws.close(4404, "unknown area");
					return;
				}
				if (ws.readyState !== WebSocket.OPEN || closing) return;
				const priorJoin=joins.get(character.id)||Promise.resolve();let releaseJoin!:()=>void;
                const gateJoin=new Promise<void>(resolve=>releaseJoin=resolve),join=priorJoin.then(()=>gateJoin);joins.set(character.id,join);await priorJoin;
                let claimed:string|undefined,joined=false,joiningRoom:Room|undefined,created=false;
                try {
                if(ws.readyState!==WebSocket.OPEN||closing)return;
                const old = live.get(character.id);
				if (old) {
					send(old.ws, { t: "kick", reason: "เข้าสู่ระบบจากที่อื่น" });
					old.ws.close(4409, "opened elsewhere");await save(old.room,old.id,true);
				}
                claimed=randomUUID();await store.claimLease(character.id,claimed);
                const refreshed=await store.character(session.accountId,character.id);if(!refreshed)throw Error('Character disappeared');character=refreshed;
                if(ws.readyState!==WebSocket.OPEN||closing)return;
                if(character.mapId==='confluence'&&!canEnterConfluence(character))character={...character,mapId:'city_plaza',posX:CITY_SPAWN.x,posZ:CITY_SPAWN.z};
                const discoveredMaps=normalizeDiscoveredMaps(character.discoveredMaps,character.mapId||'city_plaza');
                if(JSON.stringify(discoveredMaps)!==JSON.stringify(character.discoveredMaps))await store.discoverMap(session.accountId,character.id,character.mapId||'city_plaza',claimed);

                const characterId=character.id,desiredMap=character.mapId||'city_plaza';let room=[...rooms.values()].find(r=>r.key===roomKey(desiredMap,characterId)&&r.accounts.has(characterId)&&(r.game.players.has(characterId)||pending.has(characterId)))||getRoom(character.mapId||'city_plaza',character.id);
                joiningRoom=room;room.joining=(room.joining??0)+1;const mapId=room.game.mapId;

				if (!room.game.players.has(character.id)&&!pending.has(character.id)) {
					const profile = {
						...data.stats.defaultBuild,
						level: character.level,
						baseStats: character.baseStats,
						race: character.race,
						classId: character.classId,
					};
					await room.saveQueue;const economyState=await store.inventory(session.accountId,character.id);
                    if(ws.readyState!==WebSocket.OPEN||closing){return;}
                    profile.equipment=equipped(economyState.inventory);profile.cards=[];
                    created=true;const p = addPlayer(room.game, character.id, profile);p.inventory=economyState.inventory;p.gold=economyState.gold;p.boundGold=economyState.boundGold??0;
                    p.profile.equipment=equipped(p.inventory);p.profile.cards=equippedCards(p.inventory);
					Object.assign(p, normalizeJob(character));
                    p.audioSettings = character.audioSettings;
                    p.autoPotion = normalizeAutoPotion(character.autoPotion);
                 p.titleId=character.titleId??null;p.unlockedTitles=character.unlockedTitles??[];p.titleRecords=normalizeTitleRecords(character.titleRecords);
 p.claimedLevelRewards=[...(economyState.claimedLevelRewards??[])];p.legacyLevelRewards=[...(economyState.legacyLevelRewards??[])];p.consumableBuffs=structuredClone(character.consumableBuffs??{});p.quests=normalizeQuests(character.quests,data);p.bossReadyAt=character.bossReadyAt||0;p.bossCooldowns={...(character.bossCooldowns??{})};p.returnReadyAt=character.returnReadyAt||0;p.healerReadyAt=character.healerReadyAt||0;p.autoSeconds=character.autoSeconds||0;
					p.profile.classId = p.jobId;
					p.name = character.name;p.gender=character.gender??'male';
					p.xp = character.xp;
					
					p.kills = character.kills;
					p.potions = character.potions;
					p.statPoints = character.statPoints;
					p.autoAllocate = character.autoAllocate ?? true;
					p.autoAllocCursor = character.autoAllocCursor ?? 0;
					const before = p.statPoints;
					Object.assign(p, autoAllocateStats(p, data));
					refreshStats(room.game, p);
					if (before !== p.statPoints)
						await store.saveProgress(session.accountId, character.id, {
							...character,
							baseStats: p.profile.baseStats,
							statPoints: p.statPoints,
							autoAllocate: p.autoAllocate,
							autoAllocCursor: p.autoAllocCursor,
						});
					if (
						character.posX !== undefined &&
						character.posZ !== undefined &&
						walkable(character.posX, character.posZ,.3,mapId)
					) {
						p.x = character.posX;
						p.z = character.posZ;
					}
					// A not-ready character is retained for resume but excluded from simulation and snapshots.
					room.game.players.delete(character.id);
					pending.set(character.id, p);
				}
				if(ws.readyState!==WebSocket.OPEN||closing){pending.delete(character.id);room.game.players.delete(character.id);return;}
                rankings.invalidate();await rankings.refresh().catch(error=>console.error('Ranking refresh failed',error));
                const leaseOwner=claimed;
                if(ws.readyState!==WebSocket.OPEN||closing){await store.releaseLease(character.id,leaseOwner);pending.delete(character.id);return;}
                const peer: Peer = {
                    leaseOwner,discoveredMaps,
					ws,
					id: character.id,
					accountId: session.accountId,
					sessionHash: hash,
					uid: accountUid,
					ready: false,
					ack: 0,
					input: { x: 0, z: 0 },
					lastSteer: 0,
					lastSeen: Date.now(),
					window: Date.now(),
					count: 0,
					room,
				};
				(room.leases??=new Map()).set(peer.id,leaseOwner);connectedPeer=peer;joined=true;
				live.set(peer.id, peer);
				room.peers.set(peer.id, peer);
				room.accounts.set(peer.id, peer.accountId);
				room.disconnected.delete(peer.id);
				send(ws, {
					t: "welcome",
					you: peer.id,
					build: options.build,
					tick: room.tick,
					dataVersion: 1,
				});
				ws.on("pong", () => {
					peer.lastSeen = Date.now();
				});
				ws.on("message", (raw, isBinary) => {
					if (live.get(peer.id) !== peer) return;
					received++;
					peer.lastSeen = Date.now();
					if (Date.now() - peer.window >= 1000) {
						peer.window = Date.now();
						peer.count = 0;
					}
					if (++peer.count > 30) {
						dropped++;
						return;
					}
					if (isBinary) {
						invalid++;
						return;
					}
					let body;
					try {
						body = JSON.parse(raw.toString());
					} catch {
						invalid++;
						return;
					}
					const parsed = IntentSchema.safeParse(body);
					if (!parsed.success) {
						invalid++;
						if (["stats", "statsReset", "autoAlloc"].includes(body?.t))
							send(ws, {
								t: "ev",
								list: [
									{
										type: "statsError",
										playerId: peer.id,
										text: "ค่าสเตตัสไม่ถูกต้อง กรุณาลองใหม่",
									},
								],
							});
						return;
					}
					if (parsed.data.t === "spawnReady" && pending.has(peer.id)) {
						peer.room.game.players.set(peer.id, pending.get(peer.id)!);
						pending.delete(peer.id);
					}
					intent(peer, parsed.data);
				});

				ws.on("error", () => {});
                } finally {if(joiningRoom)joiningRoom.joining!--;if(!joined){if(created&&joiningRoom){pending.delete(character.id);joiningRoom.game.players.delete(character.id);}if(joiningRoom&&!joiningRoom.joining&&!joiningRoom.peers.size&&!joiningRoom.game.players.size)rooms.delete(joiningRoom.key);if(claimed)await store.releaseLease(character.id,claimed).catch(e=>console.error('Join lease rollback failed',e));}releaseJoin();if(joins.get(character.id)===join)joins.delete(character.id);}
			})();activeJoins.add(task);void task.catch(error=>{console.error('Join failed',error);ws.close(1011,'connection failed');}).finally(()=>activeJoins.delete(task));
		});
	});
	const pending = new Map<string, Player>();
	let previousTick = performance.now(),
		bank = 0;
	const timer = setInterval(() => {
		const begin = performance.now(),
			now = Date.now();
		bank = Math.min(250, bank + begin - previousTick);
		previousTick = begin;
		const catchup = Math.floor(bank / 50);
		bank -= catchup * 50;
		for (let substep = 0; substep < catchup; substep++) {
			ticks++;
			for (const room of rooms.values()) {
                if(room.quarantined)continue;
                try {
                if(room.game.mapId==='confluence'){
                 if(room.peers.size)room.raidExpiresAt=now+RAID_RETENTION_MS;
                 // Leaving or changing party revokes this private encounter immediately.
                 for(const peer of [...room.peers.values()])if(room.key!==roomKey('confluence',peer.id)){
                  if(peer.busy){const player=room.game.players.get(peer.id);if(player){player.auto=false;player.target=null;}continue;}
                  send(peer.ws,{t:'ev',list:[{type:'notice',playerId:peer.id,text:'ปาร์ตี้เปลี่ยนแล้ว กลับเมืองเพื่อรวมกลุ่มและเข้ารอยต่อพิภพใหม่'}]});
                  transfer(peer,{mapId:'city_plaza',...CITY_SPAWN});
                 }
                }
				for (const [id, at] of room.disconnected)
                    if (now - at >= (options.reconnectMs ?? 60000) && !room.expiring?.has(id) && !joins.has(id)) {
                     (room.expiring??=new Set()).add(id);
                     const retained=room.game.players.get(id);
                     // Keep the player and its lease until the final write has committed.
                     const finalSave=save(room,id,true);
                     // Stop simulation at expiry so a slow write cannot discard later progress.
                     if(retained){pending.set(id,retained);room.game.players.delete(id);}
                     void finalSave.then(async()=>{
                      if(live.has(id)||joins.has(id)||room.disconnected.get(id)!==at)return;
                      room.game.players.delete(id);pending.delete(id);room.accounts.delete(id);room.disconnected.delete(id);
                      const owner=room.leases?.get(id);room.leases?.delete(id);
                      if(!room.joining&&!room.peers.size&&!room.game.players.size&&!room.disconnected.size&&rooms.get(room.key)===room&&!(room.raidExpiresAt&&room.raidExpiresAt>now))rooms.delete(room.key);
                      if(owner)await store.releaseLease(id,owner);
                     }).catch(error=>{
                      if(retained&&!live.has(id)&&!joins.has(id)&&room.disconnected.get(id)===at){pending.delete(id);room.game.players.set(id,retained);}
                      console.error('Disconnected save failed',error);
                     }).finally(()=>room.expiring?.delete(id));
                    }
				if (
					!room.peers.size && !room.joining &&
					!room.game.players.size &&
					!room.disconnected.size &&
                    !live.has(room.key.slice(room.key.indexOf(':')+1))
				) {
					if(room.raidExpiresAt&&room.raidExpiresAt>now)continue;
					rooms.delete(room.key);
					continue;
				}
				room.tick++;room.game.wallTime=now;
				const inputs = new Map<string, Vec>();
				for (const peer of room.peers.values())
					if (peer.ready) inputs.set(peer.id, peer.input);
				if (room.game.players.size)
					step(room.game, 0.05, { x: 0, z: 0 }, inputs);
				for(const peer of [...room.peers.values()]){
 const p=room.game.players.get(peer.id);if(!p?.returnRemaining||peer.busy)continue;
 if(p.dead||p.moving||room.game.events.some(e=>e.type==='hurt'&&e.playerId===p.id)||room.game.enemies.some(e=>e.boss&&!e.dead&&e.engaged)){p.returnRemaining=0;continue;}
 p.returnRemaining=Math.max(0,p.returnRemaining-.05);
 if(p.returnRemaining<1e-8){p.returnRemaining=0;p.returnReadyAt=now+60000;transfer(peer,{mapId:'city_plaza',...CITY_SPAWN});}
 }
 flush(room);
				let parts: ReturnType<typeof snapshotParts> | undefined;
				if (room.tick % 2 === 0)
					for (const peer of room.peers.values())
												if (peer.ready) {
							// A backed-up socket skips this frame (snapshots are superseded) instead of growing the buffer.
							if (peer.ws.bufferedAmount > 64 * 1024) { dropped++; continue; }
							parts ??= snapshotParts(room);
							send(peer.ws, snapshotFrame(room, peer, parts, social.partyMembers(peer.id)));
						}
				if (room.tick % 600 === 0)
					for (const id of room.game.players.keys()) void save(room, id);
                }catch(error){
                 console.error('Room quarantined',room.key,error);room.quarantined=true;
                 for(const peer of room.peers.values()){void save(room,peer.id);send(peer.ws,{t:'kick',reason:'เซิร์ฟเวอร์ขัดข้อง กรุณาเข้าใหม่'});peer.ws.close(1011,'room failed');}void room.saveQueue.finally(()=>rooms.delete(room.key));
                }
			}
		}
		if (catchup && ticks % 20 < catchup) { social.tick(); trades.tick(); }
		samples.push(performance.now() - begin);
		if (samples.length > 1200) samples.shift();
		if (now - lastMetric >= 1000) {
			inRate = ((received - lastIn) * 1000) / (now - lastMetric);
			outRate = ((sent - lastOut) * 1000) / (now - lastMetric);
			lastIn = received;
			lastOut = sent;
			lastMetric = now;
		}
	}, options.tickMs ?? 50);
	timer.unref();
	const heartbeat = setInterval(() => {
        // Retained disconnected players still simulate and save, so they need leases too.
        for(const room of rooms.values())for(const [id,owner] of room.leases??[]){
         if(!room.accounts.has(id))continue;
         void store.renewLease(id,owner).then(ok=>{
          if(ok)return;
          const peer=live.get(id);
          if(peer?.leaseOwner===owner){send(peer.ws,{t:'kick',reason:'เข้าสู่ระบบจากที่อื่น'});peer.ws.close(4409,'opened elsewhere');}
          else if(!peer&&room.leases?.get(id)===owner){room.game.players.delete(id);pending.delete(id);room.accounts.delete(id);room.disconnected.delete(id);room.leases.delete(id);}
         }).catch(e=>console.error('Lease heartbeat failed',e));
        }
		for (const peer of live.values()) {
			if (Date.now() - peer.lastSeen > 30000) {
				peer.ws.terminate();
				continue;
			}
			peer.ws.ping();

			void store.session(peer.sessionHash).then((session) => {
				if (!session || session.selectedCharacterId !== peer.id) {
					send(peer.ws, { t: "kick", reason: "session ended" });
					peer.ws.close(4401, "session ended");
				}
			}).catch(error=>console.error('Heartbeat failed',error));
		}
	}, options.heartbeatMs??15000);
	heartbeat.unref();
 const rankingTimer=setInterval(()=>{
  void rankings.refresh().then(()=>{for(const peer of live.values()){const p=peer.room.game.players.get(peer.id);if(peer.ready&&p)titleState(peer,p);}}).catch(error=>console.error('Ranking refresh failed',error));
 },60000);rankingTimer.unref();
 const prune=setInterval(()=>{void store.pruneRequests().catch(e=>console.error('Request prune failed',e));},options.pruneMs??3600000);prune.unref();
 const economyNightly=setInterval(()=>{void store.integrity().catch(e=>console.error('ECONOMY_ALERT',String(e)));},86400000);economyNightly.unref();
	return {
		rooms,
        healthy:()=>!closing&&performance.now()-previousTick<2000,
		metrics() {
			const sorted = [...samples].sort((a, b) => a - b);
			return {
				rooms: rooms.size,
				sockets: live.size,
				ticks,
				tickMs: {
					p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
					p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
				},
				messagesInPerSecond: inRate,
				messagesOutPerSecond: outRate,
				rateLimitDrops: dropped,
				invalidMessages: invalid,
			};
		},
		async close() {
			if(closing)return;closing = true;
			clearInterval(timer);
			clearInterval(heartbeat);clearInterval(rankingTimer);clearInterval(prune);clearInterval(economyNightly);
			for (const ws of wss.clients) ws.terminate();
            await Promise.allSettled([...activeJoins]);
			await Promise.all(
				[...rooms.values()].flatMap((room) =>
					[...room.game.players.keys()].map((id) => save(room, id)),
				),
			);
			await Promise.all([...saves.values()]);
			await Promise.all([...rooms.values()].flatMap(room=>[...room.leases??[]].map(([id,owner])=>store.releaseLease(id,owner).catch(e=>console.error('Lease release failed',e)))));
			wss.close();
		},
		save,
		social,
	};
}
