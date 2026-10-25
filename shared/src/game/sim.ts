import {passiveValue,passiveCost,passiveCastMultiplier,passiveStart,passiveComplete,passiveEvent,passiveWalk,passiveTick,passiveIncoming,passiveAccuracy,passiveArmorIgnore,passiveDamage,passivePeriodicDamage,passivePetDamage,passiveBond,medicalBasic} from './mastery-passives.js';
import {consumableBuffValue} from '../consumable-buffs.js';
import {telegraphContains as inTelegraph} from './telegraph-area.js';
export {inTelegraph};
import {applyInventory,starterInventory,inventoryWeight,bestPotion,equipped,equippedCards,inventoryProfile,rollDrops,type Inventory,type InventoryOp} from "../inventory.js";
import {himmapanStep,himmapanHitMultiplier,type HimmapanCombat} from './himmapan-combat.js';
import {desertStep,desertDestroyed,desertBurrowed,desertHitMultiplier,desertStruck,type DesertCombat} from './desert-combat.js';
import {frostStep,frostHitMultiplier,isFrostEnemy,type FrostCombat} from './frost-combat.js';
import {endgameIncoming,endgameSkillCost,endgameSkillSpent,endgameCast,endgameAttackInterval,endgameStatus} from './endgame-loot.js';
import {endgameStep,endgameHitMultiplier,endgameDestroyed,endgameBossLocked,CONFLUENCE_GUARDS,isEndgameEnemy,type EndgameCombat} from './endgame-combat.js';
import {yokaiStep,yokaiHitMultiplier,isYokaiEnemy,type YokaiCombat} from './yokai-combat.js';
import {monsterExpMultiplier,type MonsterRewardSource} from './progression.js';
import {recordMasteryDamage,recordMasterySupport,awardMasteryTraining,recordMasteryWound,restoreMasteryHp,clearMasteryWounds,clearMasteryEncounter} from './mastery-training.js';
import {createSummon,stepSummon,removeSummon,summonStats,commandableSummon,combatTargets,enemyTarget,isSummonTarget,summonDot,type Summon,type CombatTarget,createWisp,stepWisp,removeWisp,type Wisp} from './summons.js';
export {createSummon,removeSummon,createWisp,removeWisp} from './summons.js';
export {clearMasteryWounds} from './mastery-training.js';
export {advancedMasterySnapshot,clearAdvancedMastery,MASTERY_ALLY_ACTIONS,masteryTarget} from './mastery-runtime.js';
import type {MasterySchool} from '../mastery.js';
import {isMasteryAction,masteryUseLock,masteryAutoRank,type MasteryAction} from '../mastery.js';
import {normalMasteryCast,incomingMasteryHit,automaticBusy,markAutomaticCast,stepAutomaticMastery,resolveAutomaticSkill} from './mastery-automatic.js';
import {mixNormalCast,mixAuthoritativeEvent,mixGuardedHit,mixIncoming,mixBeforeDamage,mixAfterDamage,mixPetSkill,mixPetHit,masteryMixBusy,type MixHooks} from './mastery-mix.js';
import {masteryTarget,advancedCastAllowed,finishAdvancedMastery,startMasteryChannel,advanceAdvancedMastery,advancedOutgoing,advancedAfterDamage,advancedCombatStats,advancedCastMultiplier,advancedBeforeHurt,advancedReflectBolt,advancedPlayerHidden,advancedPetModifiers,advancedPetIncoming,advancedEnemyBlocked,clearAdvancedMastery,masteryOrigin,withMasteryOrigin,type MasteryHooks} from './mastery-runtime.js';
import type { LootItem } from '../item-rolls.js';
import {applyPotionEffect,healPartyMember,lootHitDamage,lootAbsorb,lootAfterHurt,tickPlayerLoot,tickEnemyLoot,type LootEffectState,type ItemPoison} from './loot-effects.js';
import {hasLootCard,lootGuard,lootReflect,lootStillReduction,lootInterrupted,lootOnKill,lootEvadedWarning,lootArmourPen,lootAccuracy,lootEvadedRanged,lootSkillCost,lootSkillSpent,lootMovementMultiplier,lootCrit,lootDecoyAbsorb} from './loot-effects.js';
import {
	migrateJob,
	newJob,
	resolveSkill,
	skillId,
	skillValue,
	belongsToJob,
	gainJobExp,
	skillEffects,
	applyEffects,applySlow,slowMovementMultiplier,
	tickEffects,
	rhythmCooldowns,
	type JobProgress,
	type TimedEffect,
} from "../jobs.js";
import { loadGameData } from "../load.js";
import { deriveStats, monsterStats, type Combatant } from "../derive.js";
import { computeDamage } from "../damage.js";
import {statusChance} from "../status.js";
import { autoAllocateStats } from "../allocation.js";
import type { GameData, CharacterInput, Skill } from "../schema.js";
import { createPlayerPathfinder,pathSegmentWalkable } from "./pathfinding.js";
import { CITY_SPAWN, HEALER, type MapId } from "./maps.js";
const DEFAULT_DATA = loadGameData();
import { MONSTER_MOTIONS } from "./monster-motion-data.js";
export type Action = string;
export type SlimeVariant = "pink" | "mint" | "sky";
export type KingAttack = "slam" | "sweep" | "charge" | "spit" | "summon";
export type MonsterMotion =
	| keyof typeof MONSTER_MOTIONS.slime
	| keyof typeof MONSTER_MOTIONS.king;
export interface BossTelegraph {
 targets?:string[];
	id: string;
	nameTh: string;
	shape: "circle" | "ring" | "cone";
	x: number;
	z: number;
	fx: number;
	fz: number;
	radius: number;
	inner: number;
	/** Cone opening in degrees (0 for other shapes). */
	angle: number;
	left: number;
}
export interface Vec {
	x: number;
	z: number;
}
export interface Enemy extends Vec {
 himmapan?:HimmapanCombat;
 desert?:DesertCombat;
 frost?:FrostCombat;yokai?:YokaiCombat;
 rewardSource?:MonsterRewardSource;
 controlImmuneUntil?:number;
 endgame?:EndgameCombat;
 summonedBy?:number;
 nestEgg?:{hatch:number};
 itemPoisons?:ItemPoison[];
 masteryPoisons?:{owner:string;skillId?:string;automatic?:boolean;remaining:number;tick:number;damage:number;ticks:number}[];
	mapId?: MapId;
	statuses: TimedEffect[];
	dataId: string;
	damageBy: Record<string, number>;
	masteryDamage?: Record<string, Partial<Record<MasterySchool, number>>>;
	masterySupport?: Record<string, Partial<Record<MasterySchool, number>>>;
 damageLevels?:Record<string,number>;
 lastEngagedAt?:number;
	id: number;
	hp: number;
	maxHp: number;
	boss: boolean;
	dead: boolean;
	respawn: number;
	homeX: number;
	homeZ: number;
	aggro: number;
	cooldown: number;
	windup: number;
	aimX: number;
	aimZ: number;
	hurt: number;
	phase: number;
	wander: number;
	wx: number;
	wz: number;
	motion: MonsterMotion;
	motionTime: number;
	motionDuration: number;
	bossPhase: 1 | 2;
	variant: SlimeVariant;
	deathAge: number;
	rewarded: boolean;
	attackApplied: boolean;
	patternIndex: number;
	history: KingAttack[];
	/** Telegraphed skill being wound up: its area is fixed when the warning starts. */
	telegraph?: BossTelegraph;
	/** Ordinary boss attacks since the last telegraphed skill, and which one comes next. */
	sinceTelegraph?: number;
	telegraphIndex?: number;
	engaged: boolean;
		summoned: boolean;
	/** Spawned by a GM command: never respawns, removed shortly after death like summons. */
	gm?: boolean;
	/** Data-driven AI tuning (jellies use built-in defaults). */
	behavior?: import('../schema.js').GameData['monsters']['monsters'][number]['behavior'];
	startX: number;
	startZ: number;
	fx: number;
	fz: number;
	vx: number;
	vz: number;
	moving: boolean;
}
export type AutoState = "seek" | "fight" | "retreat" | "idle";
export interface Player extends Vec, JobProgress {
 legacyLevelRewards?:number[];consumableBuffs?:import('../consumable-buffs.js').ConsumableBuffs;
 claimedLevelRewards?:number[];
 gender?:'male'|'female';
 summon?:Summon;wisp?:Wisp;decoy?:Summon;
 healingOverTime?:{casterId:string;mapId:Game['mapId'];level:number;next:number;until:number;ticksLeft:number;amount:number;automatic?:boolean;budget?:number};
 lootEffects?:LootEffectState;
 titleId?:string|null; displayTitleId?:string|null; unlockedTitles?:string[]; titleRecords?:import('../titles.js').TitleRecords;
 /** ตั้งค่า AUTO for this account (server-side; never sent in snapshots). */
 autoCfg?: AutoSettings; autoNext?: string | null;
   bossReadyAt?:number; reviveRemaining?:number;
 /** Field-boss cooldowns other than the King (which keeps bossReadyAt). */
 bossCooldowns?: Record<string, number>;
 quests?: import('../quests.js').QuestState;
 whirlwindHits?:{id:number;due:number;damage:number;crit:boolean;breakdown:any;impact?:number;hit?:boolean;skillId?:string;level?:number;cast?:number}[];
 boxerCombo?:{steps:number;until:number};
 /** leap_strike landings: the hit lands at the end of the airborne arc. */
 landings?:{due:number;x:number;z:number;skillId:string;level:number;cast:number}[];
 inventory?:Inventory; autoSeconds:number;
 mapId: MapId;
 healerReadyAt: number;
 returnReadyAt?:number; returnRemaining?:number;
 audioSettings?: import('../audio-settings.js').AudioSettings;
 /** Per-character auto-drink thresholds; the server drinks from the bag when a bar falls below them. */
 autoPotion?: import('../auto-potion.js').AutoPotion;
	statuses: TimedEffect[];
	castRemaining: number;
	jobsVersion: number;
	id: string;
	name: string;
	stats: Combatant;
	profile: CharacterInput;
	kills: number;
	statPoints: number;
	autoAllocate: boolean;
	autoAllocCursor: number;
	lastCombat: number;
	target: number | null;
	destination: Vec | null;
	autoTimer: number;
	autoPath: Vec[];
	autoGoal: Vec | null;
	autoCharge: number;
	/** AUTO: enemy id → game time until which it is skipped because no route reached it. */
	autoUnreachable?: Record<number, number>;
	autoProgress?: { x: number; z: number; at: number; retried: boolean };
	auto: boolean;
	autoState: AutoState;
	hp: number;
	maxHp: number;
	mp: number;
	maxMp: number;
	level: number;
	xp: number;
	nextXp: number;
	gold: number;
	boundGold?: number;
	potions: number;
	dead: boolean;
	fx: number;
	fz: number;
	moving: boolean;
	attack: number;
	attackKind: string;
	combo: number;
	comboWindow: number;
	dash: number;
	invulnerable: number;
	hurt: number;
	cd: Record<Action, number>;
	/** GM tools (server-only, never in snapshots): takes no damage; movement multiplier. */
	god?: boolean;
	gmSpeed?: number;
}
export interface Event extends Vec {
	type: string;
	[key: string]: any;
}
export interface Drop extends Vec {
 source?:MonsterRewardSource;
 loot?:LootItem[]; pending?:boolean; noticeAt?:number; blocked?:boolean; boss?:boolean; bossId?:string;
	ownerId: string;
	id: number;
	gold: number;
	xp: number;
	jobExp?: number;
	time: number;
}
export interface Projectile extends Vec {
	attack?: string;
	id: number;
	owner: number;
	vx: number;
	vz: number;
	life: number;
	damage: number;
	phase: 1 | 2;
}
export { CAMP, ARENA, OBSTACLES, water, walkable } from "./collision.js";
import { CAMP, ARENA, walkable, moveSliding as move } from "./collision.js";
import { FIELD_BOSS, THORN_NEST, isField, nearestCamp, MAP_ENTRY, LAYOUTS } from "./maps.js";
/** The map of the game currently being stepped (the sim is synchronous, so one at a time). */
let activeMap: MapId = "meadow";
const walk = (x: number, z: number, r = 0.3) => walkable(x, z, r, activeMap);
const campFor = (m: MapId, p: Vec) => nearestCamp(m, p.x, p.z) ?? CAMP;
/** Cooldown until this player can fight / loot a field boss again. */
export function bossReadyAt(p: Pick<Player, "bossReadyAt" | "bossCooldowns">, dataId: string) {
	return dataId === "king_jelly" ? p.bossReadyAt ?? 0 : p.bossCooldowns?.[dataId] ?? 0;
}
export function setBossCooldown(p: Pick<Player, "bossReadyAt" | "bossCooldowns">, dataId: string, until: number) {
	if (dataId === "king_jelly") p.bossReadyAt = until;
	else (p.bossCooldowns ??= {})[dataId] = until;
}
export { CD } from "./constants.js";
import { CD, ACTION_SKILLS } from "./constants.js";
import { AUTO_RANGES, DEFAULT_AUTO, skillTierRank, autoCastOrder, autoSkillSequence, isSurvivalSkill, wantedMonsters, type AutoSettings } from "../auto-settings.js";
export const KING_PATTERN: KingAttack[] = [
	"slam",
	"sweep",
	"charge",
	"spit",
	"summon",
];
export function createGame(
	seed = 123,
	profile: CharacterInput = DEFAULT_DATA.stats.defaultBuild,
	id = "local",
	data: GameData = DEFAULT_DATA,
 mapId: MapId = "meadow",
) {
	let n = seed;
	const random = () => {
		n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
		return n / 4294967296;
	};
	let lootSeed=seed^0x51a7e;
	const equipmentRandom=()=>{lootSeed=(Math.imul(lootSeed,1664525)+1013904223)>>>0;return lootSeed/4294967296;};
	const stats = deriveStats(profile, data);
	const job =
		profile.classId === "swordsman" ? newJob() : migrateJob(profile.level);
	let p: Player = {
		...job,
 mapId, healerReadyAt: 0, autoSeconds:0,
		statuses: [],
		castRemaining: 0,
		jobsVersion: 3,
		id,
		name: "อาเธอร์",
		stats,
		profile: structuredClone(profile),
		kills: 0,
		statPoints: 0,
		autoAllocate: true,
		autoAllocCursor: 0,
		lastCombat: -Infinity,
		target: null,
		destination: null,
		autoTimer: 0,
		autoPath: [],
		autoGoal: null,
		autoCharge: -1,
		auto: false,
		autoState: "idle",
		x: -1,
		z: 6,
		hp: 120,
		maxHp: 120,
		mp: 80,
		maxMp: 80,
		level: 1,
		xp: 0,
		nextXp: 60,
		gold: 0,
		potions: 5,
		dead: false,
		fx: 0,
		fz: -1,
		moving: false,
		attack: 0,
		attackKind: "",
		combo: 0,
		comboWindow: 0,
		dash: 0,
		invulnerable: 0,
		hurt: 0,
		cd: { attack: 0, spin: 0, meteor: 0, dash: 0, potion: 0 },
	};
	p.profile.skills = { ...p.skills };
	p.stats = deriveStats(p.profile, data);
	p.hp = p.maxHp = p.stats.maxHp;
	p.mp = p.maxMp = p.stats.maxSp;
	p.level = profile.level;
	p.nextXp = data.stats.expToNext[p.level - 1];
	const g = {
		data, mapId, equipmentRandom,
  /** Authoritative server hook; browser prediction does not load the physics engine. */
  resolveMonsterKnockback: undefined as undefined | ((from:Vec,delta:Vec)=>Vec),
  inventoryCommit: undefined as undefined | ((p:Player,op:InventoryOp,done:()=>void)=>void),
 /** Party lookup for EXP sharing; returns the player's party member ids (including the player). */
 partyMembers: undefined as undefined | ((id:string)=>string[]),
		jobExpMultiplier: 1,
		players: new Map([[id, p]]),
		get p() {
			return p;
		},
		set p(v: Player) {
			p = v;
		},
		get target() {
			return p.target;
		},
		set target(v: number | null) {
			p.target = v;
		},
		get destination() {
			return p.destination;
		},
		set destination(v: Vec | null) {
			p.destination = v;
		},
		get autoTimer() {
			return p.autoTimer;
		},
		set autoTimer(v: number) {
			p.autoTimer = v;
		},
		get autoPath() {
			return p.autoPath;
		},
		set autoPath(v: Vec[]) {
			p.autoPath = v;
		},
		get autoGoal() {
			return p.autoGoal;
		},
		set autoGoal(v: Vec | null) {
			p.autoGoal = v;
		},
		get autoCharge() {
			return p.autoCharge;
		},
		set autoCharge(v: number) {
			p.autoCharge = v;
		},
		time: 0,
		random,
		enemies: [] as Enemy[],
		events: [] as Event[],
		drops: [] as Drop[],
		projectiles: [] as Projectile[],
  smokeFields: [] as {id:number;ownerId:string;x:number;z:number;until:number;level:number}[],
		nextId: 1,
		kills: 0,
		wallTime:0,bossSpawned: false,
		won: false,
		meteors: [] as {
			ownerId: string;
			targetId?: number;
			x: number;
			z: number;
			time: number;
			skillId?: string;
			level?: number;
			enemyId?: number;
			allyId?: string;
			fx?: number;
			fz?: number;
			boxerBonus?: number;
			paid?: number;
			automatic?:boolean;
		}[],
	};
	if(isField(mapId)){
  for(const spawnPoint of LAYOUTS[mapId].spawns)spawn(g,spawnPoint.x,spawnPoint.z,false,spawnPoint.variant,false,spawnPoint.dataId);
  if(mapId!=='meadow')Object.assign(p,MAP_ENTRY[mapId],{fx:1,fz:0});
 }else Object.assign(p,CITY_SPAWN,{fx:0,fz:1});
	// Field boss: present from the start, then back `respawnMinutes` after each death (see bossTimer).
		if (isField(mapId))
		[FIELD_BOSS[mapId],...(mapId==='forest'?[THORN_NEST]:[])].forEach((rule) => {
			if(!rule)return;
			spawn(g, rule.x, rule.z, true, "pink", false, rule.dataId);
			g.bossSpawned = true;
		});

	return g;
}
export type Game = ReturnType<typeof createGame>;
export function withPlayer<T>(g: Game, id: string, run: () => T): T {
	const previous = g.p;
	const p = g.players.get(id);
	if (!p) throw new Error("Unknown player");
	g.p = p;
	try {
		return run();
	} finally {
		g.p = previous;
	}
}
export function addPlayer(
	g: Game,
	id: string,
	profile: CharacterInput = g.data.stats.defaultBuild,
) {
	const p = createGame(1, profile, id, g.data, g.mapId).p;
	g.players.set(id, p);
	return p;
}
export function refreshStats(g: Game, p: Player) {
	if(p.inventory){p.profile.equipment=equipped(p.inventory);p.profile.cards=equippedCards(p.inventory);p.potions=p.inventory.items.filter(i=>i.location==='bag'&&g.data.items.items.find(t=>t.id===i.template)?.effect==='hp').reduce((n,i)=>n+i.qty,0);}
 p.profile.level = p.level;
	p.profile.skills = { ...p.skills };
	p.profile.masteries={...p.masteries};
	p.stats = deriveStats(p.inventory?inventoryProfile(p.profile,p.inventory,g.data):p.profile, g.data);
	const endure = p.statuses.find((s) => s.id === "endure");
	if (endure) {
		p.stats.hardDef *= 1 + endure.value;
		p.stats.softDef *= 1 + endure.value;
	}
	const rage = p.statuses.find((s) => s.id === "rage");
	if (rage) p.stats.atk *= 1 + rage.value;
	if(p.maxHp!==p.stats.maxHp)clearMasteryWounds(p);
	p.maxHp = p.stats.maxHp;
	p.maxMp = p.stats.maxSp;
	p.hp = Math.min(p.hp, p.maxHp);
	p.mp = Math.min(p.mp, p.maxMp);
	p.nextXp = g.data.stats.expToNext[p.level - 1];
}
function topDamage(g: Game, e: Enemy) {
	return (
		Object.entries(e.damageBy).sort(
			(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
		)[0]?.[0] || g.p.id
	);
}

export function gameSkill(g: Game, a: Action) {
	return resolveSkill(g.data, skillId(a), g.p.skills[skillId(a)] || 1);
}
function duration(e: Enemy, motion: MonsterMotion) {
	if(motion==='attack'&&e.behavior)return Math.max(.85,e.behavior.windup+((e.dataId.startsWith('himmapan_')||e.dataId.startsWith('desert_')||(isFrostEnemy(e.dataId)||isYokaiEnemy(e.dataId)))?.7:.35));
	return (
		(MONSTER_MOTIONS[e.boss ? "king" : "slime"] as any)[motion]?.duration || 1
	);
}
function setMotion(e: Enemy, motion: MonsterMotion) {
	if (e.motion !== motion) {
		e.motion = motion;
		e.motionTime = 0;
		e.motionDuration = duration(e, motion);
		e.attackApplied = false;
	}
}
export function spawn(
	g: Game,
	x: number,
	z: number,
	boss = false,
		variant: SlimeVariant = "pink",
	summoned = false,
	explicitId?: string,
) {
	const dataId = explicitId ?? (boss
			? "king_jelly"
			: summoned
				? "jelly_summon"
				: `jelly_${variant}`),
		spec = g.data.monsters.monsters.find((m) => m.id === dataId)!;
	boss = spec.boss;
	const hp = spec.hp;
	const e: Enemy = {
		dataId,
		statuses: [],
		damageBy: {},
		id: g.nextId++,
		x,
		z,
		hp,
		maxHp: hp,
		boss,
		dead: false,
		respawn: 0,
		homeX: x,
		homeZ: z,
		aggro: 0,
		cooldown: 0.8,
		windup: 0,
		aimX: x,
		aimZ: z,
		hurt: 0,
		phase: g.random() * 6.28,
		wander: 0,
		wx: x,
		wz: z,
		motion: "idle",
		motionTime: 0,
		motionDuration: boss ? 1.8 : 1.65,
		bossPhase: 1,
		variant,
		deathAge: 0,
		rewarded: false,
		attackApplied: false,
		patternIndex: 0,
		history: [],
		engaged: false,
				summoned,
		behavior: spec.behavior,
		mapId: g.mapId,
		startX: x,
		startZ: z,
		fx: 0,
		fz: 1,
		vx: 0,
		vz: 0,
		moving: false,
	};
	g.enemies.push(e);
	return e;
}
function emit(g: Game, type: string, data: any = {}) {
	const event={ type, x: g.p.x, z: g.p.z, playerId: g.p.id, ...data };g.events.push(event);mixAuthoritativeEvent(g,event);if(!masteryOrigin(g)&&!event.autoSpell){passiveEvent(g,event);if(event.skillId&&['skillImpact','masteryZone','healOverTime'].includes(type))passiveComplete(g,resolveSkill(g.data,event.skillId,g.p.skills[event.skillId]||1));}
}
function warn(
	g: Game,
	e: Enemy,
	x: number,
	z: number,
	r: number,
	time: number,
) {
	emit(g, "warning", { x, z, r, duration: time, id: e.id, attack: e.motion });
}
function reward(g: Game, e: Enemy) {
	if (e.rewarded) return;
	e.rewarded = true;
	const spec = g.data.monsters.monsters.find((m) => m.id === e.dataId)!,
		ownerId = topDamage(g, e);
	const owner=g.players.get(ownerId),dropFactor=consumableBuffValue(owner,'drop',g.wallTime||Date.now())??1;
 const loot=rollDrops(spec,g.random,g.data,owner?.autoSeconds||0,(1+(owner?.stats.dropBonus||0))*dropFactor-1,g.equipmentRandom);
	g.drops.push({
		ownerId,
  source:e.rewardSource,
  boss:e.boss, bossId:e.boss?e.dataId:undefined,
 loot,
		id: g.nextId++,
		x: e.x,
		z: e.z,
		gold:
			spec.gold[0] + Math.floor(g.random() * (spec.gold[1] - spec.gold[0] + 1)),
		xp: spec.exp,
		jobExp: spec.jobExp,
		time: 0,
	});
	const cards=loot.filter(d=>g.data.items.items.find(t=>t.id===d.template)?.type==='card');
	if(cards.length)emit(g,'cardDrop',{playerId:ownerId,x:e.x,z:e.z,loot:cards});
	if (e.boss) {
		g.won = true;
		emit(g, "victory",{dataId:e.dataId,playerId:ownerId,x:e.x,z:e.z});
	}
}
function defeat(g: Game, e: Enemy) {
 if(e.dead)return;
 const noKillCredit=!!e.yokai?.clone||!!e.desert?.hazard||!!e.endgame?.focus;
 endgameDestroyed(g,e);
 const ownerId=topDamage(g,e),spec=g.data.monsters.monsters.find(m=>m.id===e.dataId)!;
 if(!noKillCredit)e.rewardSource={level:spec.level,ownerLevel:Math.max(e.damageLevels?.[ownerId]??spec.level,g.players.get(ownerId)?.level??1),recipients:(g.partyMembers?.(ownerId)??[ownerId]).map(id=>g.players.get(id)).filter((p):p is Player=>!!p&&!p.dead&&Math.hypot(p.x-e.x,p.z-e.z)<=24).map(p=>({id:p.id,level:p.level}))};
 if(!noKillCredit)for(const level of awardMasteryTraining(g,e,spec,e.rewardSource!.ownerLevel))emit(g,'masteryLevel',level);
 desertDestroyed(g,e);
	e.dead = true;
	e.deathAge = 0;
		e.respawn = CONFLUENCE_GUARDS.includes(e.dataId)?1800:e.boss ? (isField(g.mapId) ? (FIELD_BOSS[g.mapId]?.respawnMinutes??30) * 60 : 1800) : 12;
	e.windup = 0;
	cancelTelegraph(g, e);
	e.hurt = 0;
	setMotion(e, "death");
	if(!noKillCredit)g.kills++;
	const winner = g.players.get(topDamage(g, e));
	if(winner)lootOnKill(g,e,winner);
	if (winner&&!noKillCredit) winner.kills++;
	for (const p of g.players.values()) if (p.target === e.id) p.target = null;
		emit(g, e.yokai?.clone?"illusionDestroyed":e.endgame?.focus?"hazardDestroyed":e.desert?.hazard?"hazardDestroyed":"kill", {
		x: e.x,
		z: e.z,
		id: e.id,
		dataId: e.dataId,
		ownerId: winner?.id,
		boss: e.boss,
		variant: e.variant,
	});
	if (e.boss) {
		g.projectiles = g.projectiles.filter((p) => p.owner !== e.id);
		for (const minion of g.enemies)
			if (minion.summoned && !minion.dead && (minion.summonedBy===e.id||(!minion.summonedBy&&e.dataId!=='thorn_nest_mother'))) {
				minion.dead = true;
				minion.deathAge = 0;
				minion.rewarded = true;
				setMotion(minion, "death");
			}
	}
		}
/** Seconds until the field boss is back (0 while it is alive or on maps without one). */
export function bossTimer(g: Game, dataId?:string) {
	const boss = g.enemies.find((e) => e.boss && !e.summoned&&(!dataId||e.dataId===dataId));
	return boss && boss.dead ? Math.max(0, boss.respawn) : 0;
}
/** Restores a map-wide schedule (e.g. a room created while the boss is still on its timer). */
export function setBossTimer(g: Game, seconds: number, dataId?:string) {
	const boss = g.enemies.find((e) => e.boss && !e.summoned&&(!dataId||e.dataId===dataId));
	if (!boss || seconds <= 0) return;
	boss.dead = true;
	boss.rewarded = true;
	boss.deathAge = 99;
	boss.respawn = seconds;
	boss.hp = boss.maxHp;
	setMotion(boss, "death");
}
/** A leap lands: one impact event, then every enemy in the landing radius is struck (and stunned by the dash effect). */
function land(g: Game, l: { x: number; z: number; skillId: string; level: number; cast: number }) {
	const skill = resolveSkill(g.data, l.skillId, l.level);
	emit(g, "skillImpact", { x: l.x, z: l.z, skillId: skill.id, visual: skill.visual, cast: l.cast });
	const r = skill.landing?.radius ?? 1.6;
	for (const e of [...g.enemies]) if (!e.dead && Math.hypot(e.x - l.x, e.z - l.z) <= r + (e.boss ? 0.6 : 0)) hit(g, e, skill, false);
}
/** Value of a learned passive at the player's level (0 when not learned). */
function learnedValue(g: Game, p: Player, id: string, key: string) {
	const level = p.skills[id] || 0;
 if(g.data.mastery.skills.some(s=>s.id===id)&&masteryUseLock(p,id,p.stats.weaponType,g.data.mastery,true))return 0;
	return level ? skillValue(resolveSkill(g.data, id, level), key, level) : 0;
}
function attackingStats(p: Player, e: Enemy) {
 const mark=p.statuses.find(s=>s.id==='archer_mark'&&s.targetId===e.id&&s.remaining>0);
 const hit=(mark?.value??0)+lootAccuracy(p,e)+(hasLootCard(p,'card_tile_sparrow')&&e.hp===e.maxHp?15:0),crit=lootCrit(p);return hit||crit?{...p.stats,hit:p.stats.hit+hit,crit:p.stats.crit+crit/100}:p.stats;
}
/** Consumable spell: available to the current swordsman without unlocking an unfinished job. */
export function sunScrollTarget(g:Game,p:Player,id:number|null=p.target){
 if(p.dead||p.level<40||p.mapId!==g.mapId||!isField(g.mapId)||p.statuses.some(v=>v.id==='stun'||v.id==='knockup'))return null;
 const e=g.enemies.find(e=>e.id===id&&!e.dead);return e&&Math.hypot(p.x-e.x,p.z-e.z)<=6&&pathSegmentWalkable(p,e,(x,z)=>walkable(x,z,.15,g.mapId))?e:null;
}
function defendingStats(g:Game,e:Enemy){
 const stats=monsterStats(g.data.monsters.monsters.find(m=>m.id===e.dataId)!,g.data,e.bossPhase===2);
 const physical=e.statuses.find(s=>s.id==='def_down'),magic=e.statuses.find(s=>s.id==='mdef_down');
 if(physical){stats.hardDef*=1-physical.value;if(!physical.hardOnly)stats.softDef*=1-physical.value;}
 if(magic){stats.hardMdef*=1-magic.value;if(!magic.hardOnly)stats.softMdef*=1-magic.value;}
 return stats;
}
/** Bosses allow a short interrupt, then resist hard control long enough to execute a mechanic. */
function applyMonsterEffects(g:Game,e:Enemy,effects:TimedEffect[]){
 if(masteryOrigin(g)==='autoSpell')effects=effects.map(v=>({...v,automatic:true}));
 for(const slow of effects.filter(s=>s.id==='slow')){e.statuses=e.statuses.filter(s=>s.id!=='slow'||s.sourceId!==slow.sourceId);applySlow(e,slow.sourceId,slow.remaining,slow.value);const applied=e.statuses.find(s=>s.id==='slow'&&s.sourceId===slow.sourceId);if(applied)Object.assign(applied,{skillId:slow.skillId,automatic:slow.automatic});}
 effects=effects.filter(s=>s.id!=='slow');
 const controls=effects.filter(s=>s.id==='stun'||s.id==='knockup');
 if(!e.boss||!controls.length){applyEffects(e,effects);return controls.length>0;}
 if((e.controlImmuneUntil??0)>g.time){
  applyEffects(e,effects.filter(s=>s.id!=='stun'&&s.id!=='knockup'));
  if(!g.p.cd.controlNotice){emit(g,'notice',{text:`บอสต้านการตัดท่าอีก ${Math.ceil(e.controlImmuneUntil!-g.time)} วินาที`});g.p.cd.controlNotice=3;}
  return false;
 }
 e.controlImmuneUntil=g.time+15;
 applyEffects(e,effects.map(s=>s.id==='stun'||s.id==='knockup'?{...s,remaining:Math.min(.7,s.remaining)}:s));
 return true;
}
/** Called by the server only after the item transaction commits; never by a public skill intent. */
export function castSunScroll(g:Game,p:Player,amount:number,targetId:number|null=p.target,element:import('../schema.js').Element='holy'){
 const e=sunScrollTarget(g,p,targetId);if(!e)return false;
 return withPlayer(g,p.id,()=>{const source=g.data.skills.skills.find(s=>s.id==='fire_bolt')!;
  const skill={...source,element,percent:100,cast:0,sp:0},defender=defendingStats(g,e);
  const result=computeDamage({...attackingStats(p,e),matk:p.stats.matk+amount},defender,skill,{rng:g.random},g.data);
  emit(g,'sun_scroll',{x:e.x,z:e.z,r:1,duration:.65});return hit(g,e,skill,false,{...result});
 });
}
function hit(g: Game, e: Enemy, skill: Skill, third = false, prepared?:{damage:number;crit:boolean;breakdown:any;impact?:number;hit?:boolean;cast?:number;damageCap?:number},companion?:Summon|Wisp,allowCoating=true) {
	if (e.dead) return false;
 if(!companion&&!masteryOrigin(g)&&skill.id==='basic'&&medicalBasic(g))skill={...skill,type:'magic',percent:medicalBasic(g),comboThirdPercent:undefined,element:'neutral',visual:'medical_needle'};
 if(!companion){const original=skill.percent;skill=mixBeforeDamage(g,e,skill,third);if(prepared&&original>0&&skill.percent!==original)prepared={...prepared,damage:Math.round(prepared.damage*skill.percent/original)};}
 if(!companion&&!prepared)skill=advancedOutgoing(g,e,skill);
 if(endgameBossLocked(g,e)){if(!g.p.cd.raidNotice){emit(g,'notice',{text:'ปิดหลักชีวิต ศิลา และดาราทั้งสามก่อนเปิดแกนโลก'});g.p.cd.raidNotice=3;}return false;}
 if(desertBurrowed(e)){emit(g,'miss',{id:e.id,boss:e.boss,skillId:skill.id,reason:'burrow'});return false;}
	const defender=defendingStats(g,e);if(!companion&&!masteryOrigin(g))defender.hardDef*=1-passiveArmorIgnore(g,skill.id);
 const secondary=!!masteryOrigin(g),penetration=companion||secondary?0:lootArmourPen(g.p,skill.id);if(penetration){defender.hardDef*=1-penetration;defender.softDef*=1-penetration;}
	const rhythm = ['sword1h','sword2h'].includes(g.p.stats.weaponType)?g.p.skills.sword_rhythm || 0:0;
	if (third && rhythm)
		skill = {
			...skill,
			comboThirdPercent:
				(skill.comboThirdPercent || 170) *
				(1 +
					skillValue(
						resolveSkill(g.data, "sword_rhythm", rhythm),
						"comboBonus",
						rhythm,
					)),
		};
	const result = prepared ? {...prepared,hit:prepared.hit ?? true} : computeDamage(
		{...attackingStats(g.p,e),hit:attackingStats(g.p,e).hit+(!companion&&!secondary?passiveAccuracy(g,e):0),crit:skill.visual==='medical_needle'?0:advancedCombatStats(g,g.p).crit,flee:advancedCombatStats(g,g.p).flee},
		defender,
		skill,
		{ rng: g.random, comboThird: third },
		g.data,
	);
	if (!result.hit) {
		emit(g, "miss", {
			x: e.x,
			z: e.z,
			id: e.id,
			boss: e.boss,
			breakdown: result.breakdown,
			skillId: skill.id,
			visual: skill.visual,
			hitIndex: prepared?.impact,petId:companion&&'hp'in companion?companion.id:undefined,wispId:companion&&!('hp'in companion)?companion.id:undefined,
			cast: prepared?.cast,
		});
		return false;
	}
	let damage = prepared ? prepared.damage : Math.round(
		result.damage * (e.boss && e.motion === "stun" ? 1.25 : 1),
	);
	const crit = result.crit;
 if(damage>0&&!companion){if(!secondary)damage=passiveDamage(g,e,skill,damage);else if(masteryOrigin(g)==='periodic')damage=passivePeriodicDamage(g,e,skill,damage);}
	if(!companion&&!secondary)damage=lootHitDamage(g,g.p,e,skill.id,damage,crit,skill);
 const position=companion??g.p;
 damage=Math.round(damage*himmapanHitMultiplier(g,e,position));
 damage=Math.round(damage*desertHitMultiplier(g,e));if(damage>0)desertStruck(e);
 damage=Math.round(damage*frostHitMultiplier(g,e,position)*yokaiHitMultiplier(g,e,position)*endgameHitMultiplier(g,e,position));
 if(prepared?.damageCap!==undefined)damage=Math.min(damage,prepared.damageCap);
	const frontal=((position.x-e.x)*e.fx+(position.z-e.z)*e.fz)>0;
	if(e.dataId==='dew_beetle'&&frontal&&e.motion!=='attack')damage=Math.round(damage*.5);
	if(e.dataId==='clay_pot_doll'&&frontal&&e.motion==='attack'&&e.motionTime<(e.behavior?.windup??.8))damage=Math.round(damage*.6);
	if(e.dataId==='pine_hedgehog'&&e.cooldown>1&&skill.id==='basic')hurt(g,4);
	if (damage > 0) g.p.lastCombat = g.time;
	e.lastEngagedAt=g.time;
	e.damageBy[g.p.id] = (e.damageBy[g.p.id] || 0) + Math.min(damage, e.hp);
 (e.damageLevels??={})[g.p.id]=g.p.level;
	const dealt = Math.min(damage, e.hp);
	recordMasteryDamage(g,e,skill,dealt);
	e.hp = Math.max(0, e.hp - damage);
 if(dealt>0)advancedAfterDamage(g,e);
 const coating=allowCoating&&!companion&&!secondary&&skill.type==='physical'&&dealt>0?g.p.statuses.find(s=>s.id==='poison_coat'&&s.remaining>0):undefined;
 if(coating&&!masteryUseLock(g.p,'rogue_02',g.p.stats.weaponType,g.data.mastery)){
  g.p.statuses=g.p.statuses.filter(s=>s!==coating);
  const seconds=skillValue(resolveSkill(g.data,'rogue_02',g.p.skills.rogue_02),'duration',g.p.skills.rogue_02);
  const total=Math.max(0,Math.round(g.p.stats.atk*coating.value/100*(coating.automatic?1:1+passiveValue(g,g.p,'rogue_20','poisonBonus')/100)));
  if(e.hp>0&&total>0){
   e.masteryPoisons=[...(e.masteryPoisons??[]).filter(s=>s.owner!==g.p.id),{owner:g.p.id,automatic:coating.automatic,remaining:seconds,tick:0,damage:total,ticks:Math.ceil(seconds)}];
   emit(g,'poisonApplied',{skillId:'rogue_02',id:e.id,x:e.x,z:e.z,duration:seconds});
  }
 }
	const lifesteal = companion||secondary?0:learnedValue(g, g.p, "bloodlust", "lifesteal");
	if (lifesteal && dealt > 0 && !g.p.dead) restoreMasteryHp(g.p,Math.round(dealt * lifesteal));
	const controlled=companion?false:applyMonsterEffects(g,e,skillEffects(skill,masteryOrigin(g)==='autoSpell'?masteryAutoRank(g.p,skill.id,g.data.mastery):g.p.skills[skill.id]||1,g.p.id));if(!companion&&!secondary)endgameStatus(g,g.p,e);
	if(controlled&&(e.motion==='attack'||e.telegraph)){lootInterrupted(g.p,g,e);cancelTelegraph(g,e);setMotion(e,'idle');}
	e.hurt = 0.18;
	e.aggro = e.boss ? 30 : 10;
	if (!e.boss) {
		const dx = e.x - position.x,
			dz = e.z - position.z,
			d = Math.hypot(dx, dz) || 1;
		const delta={x:(dx/d)*.23,z:(dz/d)*.23};
		if(g.resolveMonsterKnockback){const next=g.resolveMonsterKnockback(e,delta);e.x=next.x;e.z=next.z;}
		else move(e,delta.x,delta.z);
	}
	emit(g, "hit", {
        skillId:skill.id,visual:skill.visual,origin:masteryOrigin(g),hitIndex:prepared?.impact,cast:prepared?.cast,petId:companion&&'hp'in companion?companion.id:undefined,wispId:companion&&!('hp'in companion)?companion.id:undefined,
		x: e.x,
		z: e.z,
		id: e.id,
		damage,
		crit,
		breakdown: {
			...result.breakdown,
			scriptedStunMul: e.boss && e.motion === "stun" ? 1.25 : 1,
			beforeStun: result.damage,
		},
		element: skill.element,
		boss: e.boss,
		variant: e.variant,
	});
 if(!companion&&!masteryOrigin(g))mixAfterDamage(g,e,skill,dealt,third,mixHooks(g));
	if (e.hp === 0) {
		defeat(g, e);
		return true;
	}
	if (!enterSecondPhase(g,e) && e.boss && (e.motion === "idle" || e.motion === "move"))setMotion(e, "hit");
	return true;
}
/** Trusted server status application; public intents cannot author Burn or its damage. */
// shortcut: No encounter currently produces player Burn; connect this helper when an accepted encounter gains it.
export function applyPlayerBurn(g:Game,p:Player,chance=1):boolean{
 if(g.players.get(p.id)!==p||p.dead||p.god||p.mapId!==g.mapId||!isField(g.mapId)||!Number.isFinite(chance)||chance<0||chance>1||g.random()>=statusChance(p.stats,'burn',chance,g.data))return false;
 const definition=g.data.status.statuses.find(s=>s.id==='burn')!,previous=p.statuses.find(s=>s.id==='burn'&&s.remaining>0);
 applyEffects(p,[{id:'burn',sourceId:'burn',remaining:definition.seconds,value:Math.max(0,-(definition.effects.hpPerSecond??0)),tick:previous?.tick??0}]);
 g.events.push({type:'statusApplied',playerId:p.id,id:'burn',x:p.x,z:p.z,duration:definition.seconds});return true;
}
function hasMasteryCleansable(p:Player){return p.statuses.some(s=>s.id==='burn'&&s.remaining>0)||(p.lootEffects?.venom?.remaining??0)>0;}
function cleanseMasteryDot(p:Player):'burn'|'poison'|undefined{
 const burn=p.statuses.find(s=>s.id==='burn'&&s.remaining>0);
 if(burn){p.statuses=p.statuses.filter(s=>s!==burn);return 'burn';}
 if((p.lootEffects?.venom?.remaining??0)>0){delete p.lootEffects!.venom;return 'poison';}
}
/** Empty rooms can stop ticking, so owner departure must remove poison immediately. */
export function clearMasteryPoisons(g:Game,ownerId:string){
 for(const e of g.enemies)if(e.masteryPoisons)e.masteryPoisons=e.masteryPoisons.filter(s=>s.owner!==ownerId);
}
function endMasteryHeal(g:Game,p:Player,reason:string){
 const hot=p.healingOverTime;if(!hot)return;p.healingOverTime=undefined;
 g.events.push({type:'healOverTimeEnd',playerId:p.id,sourceId:hot.casterId,skillId:'healer_03',x:p.x,z:p.z,reason});
}
/** Rooms may stop ticking when empty: neither caster nor recipient can leave a stale heal behind. */
export function clearMasteryHeals(g:Game,playerId:string){
 for(const p of g.players.values())if(p.id===playerId||p.healingOverTime?.casterId===playerId)endMasteryHeal(g,p,'departure');
}
function stepMasteryHeal(g:Game,p:Player){
 const hot=p.healingOverTime;if(!hot)return;
 const caster=g.players.get(hot.casterId),skill=hot.automatic?resolveAutomaticSkill(g.data,'healer_03',hot.level):resolveSkill(g.data,'healer_03',hot.level);
 if(p.dead||!caster||caster.dead||p.mapId!==g.mapId||caster.mapId!==g.mapId||hot.mapId!==g.mapId||!isField(g.mapId)||hot.level>(caster.skills.healer_03??0)||hot.automatic&&hot.level>masteryAutoRank(caster,'healer_03',g.data.mastery)||masteryUseLock(caster,'healer_03',caster.stats.weaponType,g.data.mastery)||
  !(caster===p||g.partyMembers?.(caster.id).includes(p.id))||Math.hypot(p.x-caster.x,p.z-caster.z)>skill.range||g.time>hot.until+1e-8){endMasteryHeal(g,p,'invalid');return;}
 while(hot.ticksLeft>0&&hot.next<=g.time+1e-8&&hot.next<=hot.until+1e-8){
  // Spend the nominal tick even when full HP; unused healing is never banked for later.
  const due=hot.next,portion=Math.min(1,hot.ticksLeft),amount=Math.floor(hot.amount/hot.ticksLeft*portion);hot.amount-=amount;hot.ticksLeft=Math.max(0,hot.ticksLeft-portion);hot.next=Math.min(hot.until,hot.next+1);
  if(amount>0){const actual=hot.automatic?withMasteryOrigin(g,'autoSpell',()=>healPartyMember(g,caster,p,amount,skill,hot.budget)):healPartyMember(g,caster,p,amount,skill);if(hot.budget!==undefined)hot.budget=Math.max(0,hot.budget-actual);}
  // A last-tick extension schedules its extra heal after this tick, never in the same instant.
  if(hot.ticksLeft>0&&hot.next<=due+1e-8)hot.next=Math.min(hot.until,due+1);
 }
 if(hot.ticksLeft===0)endMasteryHeal(g,p,'spent');
}
/** All DoT HP/reward mutations stay authoritative; only canonical poison contributes Mastery. */
function damageOverTime(g:Game,e:Enemy,owner:Player,damage:number,element:string,skillId:string){
 if(e.dead||damage<=0)return;
 withPlayer(g,owner.id,()=>{
  const actual=Math.min(e.hp,damage);
  e.damageBy[owner.id]=(e.damageBy[owner.id]??0)+actual;(e.damageLevels??={})[owner.id]=owner.level;
  if(isMasteryAction(skillId))recordMasteryDamage(g,e,resolveSkill(g.data,skillId,owner.skills[skillId]),actual);
  e.hp=Math.max(0,e.hp-damage);e.lastEngagedAt=g.time;owner.lastCombat=g.time;
  emit(g,'hit',{id:e.id,x:e.x,z:e.z,damage,crit:false,skillId,element,boss:e.boss,variant:e.variant,dot:true});
  if(e.hp===0)defeat(g,e);else enterSecondPhase(g,e);
 });
}
function enterSecondPhase(g:Game,e:Enemy){
	if (!e.dead && e.boss && e.bossPhase === 1 && e.hp <= e.maxHp * 0.5) {
		e.bossPhase = 2;
		e.windup = 0;
		cancelTelegraph(g, e);
		setMotion(e, "transform");
		g.projectiles = g.projectiles.filter((p) => p.owner !== e.id);
		emit(g, "phase2", { x: e.x, z: e.z, id: e.id });
		return true;
	}
	return false;
}
function monsterAttack(g:Game,enemy:Enemy,defender:Combatant,attack=enemy.motion){
		const spec = g.data.monsters.monsters.find((m) => m.id === enemy.dataId)!,
			attacker = monsterStats(spec, g.data, enemy.bossPhase === 2);
  attacker.hit-=Math.max(0,...activeSmokeFields(g).filter(s=>Math.hypot(enemy.x-s.x,enemy.z-s.z)<=g.data.mastery.skills.find(s=>s.id==='rogue_04')!.range).map(s=>g.data.mastery.skills.find(s=>s.id==='rogue_04')!.ranks[s.level-1].params.blind));
		const basic = gameSkill(g, "attack"),
			pattern = spec.attacks?.[attack as "slam"] ?? spec.telegraphs?.find((t) => t.id === attack);
  const rage=enemy.statuses.find(s=>s.id==='rage');if(rage){attacker.atk*=1+rage.value;attacker.matk*=1+rage.value;}
  const weakness=enemy.statuses.find(s=>s.id==='atk_down'&&s.remaining>0);if(weakness)attacker.atk*=1-weakness.value;
		const skill = enemy.boss
			? {
					...basic,
					kind: "area" as const,
					percent: pattern
						? enemy.bossPhase === 2
							? pattern.phase2Percent
							: pattern.percent
						: basic.percent,
				}
			: basic;
		const result = computeDamage(
			attacker,
			defender,
			skill,
			{ rng: g.random },
			g.data,
		);
 return result;
}
function hurtCombatTarget(g:Game,target:CombatTarget,amount:number,source?:Enemy,attack=source?.motion,incomingElement?:string,ranged=false,periodic=false,woundSource=source,incomingMagic=false):boolean|undefined{
 if(!isSummonTarget(target))return withPlayer(g,target.id,()=>hurt(g,amount,source,attack,incomingElement,ranged,periodic,woundSource,incomingMagic));
 const owner=g.players.get(target.ownerId);
 if(!owner||owner.dead||(owner.summon!==target&&owner.decoy!==target)||target.dead||target.hp<=0||target.mapId!==g.mapId||target.invulnerable>0&&!periodic)return false;
 let breakdown;
 if(source){const result=monsterAttack(g,source,summonStats(g,owner,target),attack);if(!result.hit){g.events.push({type:'miss',playerId:owner.id,petId:target.id,defender:'summon',x:target.x,z:target.z});return false;}amount=result.damage;breakdown=result.breakdown;}
 const guard=periodic?undefined:target.statuses.find(s=>s.id==='guard');if(guard)amount=Math.round(amount*(1-guard.value));
 if(!Number.isFinite(amount)||amount<=0)return false;
 if(!target.decoy)amount=advancedPetIncoming(g,owner,amount);
 const actual=Math.min(target.hp,amount);target.hp=Math.max(0,target.hp-amount);owner.lastCombat=g.time;
 if(!periodic)target.invulnerable=.2;
 g.events.push({type:'summonHurt',playerId:owner.id,petId:target.id,x:target.x,z:target.z,amount:actual,breakdown});
 if(target.hp<=0){target.dead=true;if(target.decoy){owner.decoy=undefined;g.events.push({type:'decoyEnd',skillId:'rogue_19',playerId:owner.id,x:target.x,z:target.z});}else removeSummon(g,owner,'defeated');}
 return true;
}
function hurt(
	g: Game,
	amount: number,
	source?: Enemy,
	attack = source?.motion,
 incomingElement?:string,
 incomingRanged=false,
 periodic=false,
 woundSource=source,
 incomingMagic=false,
) {
	const p = g.p;
	if (p.dead || p.god) return;
	if (p.invulnerable > 0 && !periodic) {
		if(incomingRanged||source?.behavior?.ai==='ranged')lootEvadedRanged(p);
		emit(g, "evade");
		return;
	}
	let breakdown;
 const combatStats=advancedCombatStats(g,p),burned=p.statuses.some(s=>s.id==='burn'&&s.remaining>0),defender=burned?{...combatStats,elementResist:{...combatStats.elementResist,fire:combatStats.elementResist.fire+(g.data.status.statuses.find(s=>s.id==='burn')!.effects.fireResist??0)}}:combatStats;
	if(source){const result=monsterAttack(g,source,defender,attack);if(!result.hit){if(source.behavior?.ai==='ranged')lootEvadedRanged(p);emit(g,'miss',{defender:'player',breakdown:result.breakdown});return;}amount=result.damage;breakdown=result.breakdown;}
 // Precomputed magic bolts bypass computeDamage, so their elemental resistance belongs here.
 if(!source&&incomingMagic&&incomingElement){const resistance=defender.elementResist[incomingElement as keyof typeof defender.elementResist]??0;amount=Math.round(amount*(1-Math.max(-1,Math.min(g.data.stats.caps.maxElementResist,resistance))));}
 if(!periodic)amount=lootDecoyAbsorb(g,p,amount,source,attack);
	const guard = periodic?undefined:p.statuses.find((s) => s.id === "guard");
	if (guard) amount = Math.round(amount * (1 - guard.value));
	const damageElement=incomingElement??(source?g.data.monsters.monsters.find(m=>m.id===source.dataId)?.element:undefined);
 amount=Math.round(amount*lootStillReduction(p,damageElement,!incomingRanged));
	amount=endgameIncoming(p,amount,damageElement,incomingRanged||source?.behavior?.ai==='ranged',!!source&&g.data.monsters.monsters.find(m=>m.id===source.dataId)!.matk>g.data.monsters.monsters.find(m=>m.id===source.dataId)!.atk);
	advancedReflectBolt(g,woundSource,amount,incomingMagic,incomingRanged,periodic,masteryHooks(g));
	const beforeBarrier=amount;
	amount=lootAbsorb(p,amount);
 // Legacy source-based monster attacks use the physical basic formula; only explicit magic can spend this ward.
 const shield=incomingMagic?p.statuses.find(s=>s.id==='magic_shield'&&s.remaining>0&&s.value>0):undefined;
 if(shield&&amount>0){
  const absorbed=Math.min(amount,shield.value);shield.value-=absorbed;amount-=absorbed;
  recordMasterySupport(g,p,woundSource,'mage_02',Math.min(p.hp,absorbed));
  emit(g,'shieldAbsorb',{skillId:'mage_02',amount:absorbed,remaining:shield.value,x:p.x,z:p.z});
  if(shield.value<=0)p.statuses=p.statuses.filter(s=>s!==shield);
 }
 // Spend one spirit on a real residual enemy hit, after existing barriers; never on HP costs/DoTs.
 const spirit=!periodic&&woundSource&&g.enemies.includes(woundSource)?p.statuses.find(s=>s.id==='spirit_intercept'&&s.remaining>0):undefined;
 if(spirit&&amount>0&&!masteryUseLock(p,'shaman_04',p.stats.weaponType,g.data.mastery)){
  const before=amount;amount=Math.round(amount*(1-Math.max(0,Math.min(1,spirit.value))));const prevented=before-amount;
  p.statuses=p.statuses.filter(s=>s!==spirit);
  recordMasterySupport(g,p,woundSource,'shaman_04',Math.min(p.hp,prevented));
  emit(g,'spiritIntercept',{skillId:'shaman_04',id:woundSource!.id,x:p.x,z:p.z,amount:prevented});
 }
 if(passiveBond(g,p))amount=Math.round(amount*(1-passiveValue(g,p,'shaman_08','bondGuard')/100));
 amount=advancedBeforeHurt(g,amount,woundSource,incomingMagic,periodic,masteryHooks(g));
 if(!periodic)amount=mixIncoming(g,woundSource,amount,mixHooks(g));
	const lostHp=Math.min(p.hp,amount);
	p.hp = Math.max(0, p.hp - amount);
 if(p.hp>0)passiveIncoming(g,p.hp+lostHp,lostHp);
 if(!periodic)incomingMasteryHit(g,p.hp+lostHp,lostHp,woundSource);
	recordMasteryWound(g,p,woundSource,lostHp);
	if(!periodic)lootAfterHurt(g,p,amount,damageElement);
	if(guard&&beforeBarrier>0&&p.hp>0)lootGuard(g,p,source,!!source?.boss&&attack!=="attack"&&attack!=="idle"&&attack!=="hop");
	if (beforeBarrier > 0) p.lastCombat = g.time;
	const reflect = learnedValue(g, p, "retribution", "reflect");
	const fixedReflect=source&&Math.hypot(source.x-p.x,source.z-p.z)<=2.5&&amount>0?lootReflect(p):0;
	if ((reflect||fixedReflect) && source && !source.dead && amount > 0) {
		const back = fixedReflect+Math.round(amount * reflect);
		source.damageBy[p.id] = (source.damageBy[p.id] || 0) + Math.min(back, source.hp);
		(source.damageLevels??={})[p.id]=p.level;
		source.hp = Math.max(0, source.hp - back);
		emit(g, "hit", { skillId: "retribution", x: source.x, z: source.z, id: source.id, damage: back, crit: false, element: "weapon", boss: source.boss, variant: source.variant, reflect: true });
		if (source.hp === 0) defeat(g, source);
	}
	if (!periodic&&!p.statuses.some((s) => s.id === "endure")) p.hurt = 0.3;
	if(!periodic)p.invulnerable = 0.55;
	emit(g, "hurt", { amount, breakdown });
	if (p.hp === 0) {
		p.dead = true;p.reviveRemaining=5;clearAdvancedMastery(p);
		p.boxerCombo=undefined;p.statuses=p.statuses.filter(s=>s.sourceId!=='archer_04'&&!['magic_shield','archer_mark','poison_coat','push_resist','finisher_ready','spirit_intercept','burn'].includes(s.id));removeSummon(g,p,'owner-death');removeWisp(g,p,'owner-death');clearMasteryPoisons(g,p.id);clearMasteryHeals(g,p.id);
		clearMasteryWounds(p);
		setAuto(g, false);
		g.target = null;
		g.destination = null;
		emit(g, "death", { xpLost: deathPenalty(p, g.data) });
	}
 return true;
}
/** Adds base and job EXP (EXP bonus applies to base EXP), runs level-ups and emits a pickup event. */
export function grantExp(g: Game, r: Player, baseXp: number, jobExp: number, extra: Record<string, unknown> = {}) {
	const before = g.p;
	g.p = r;
	const boost=consumableBuffValue(r,'exp',g.wallTime||Date.now())??1;
	const jobLevels = gainJobExp(r, Math.round(jobExp * (g.jobExpMultiplier || 1)*boost), g.data);
	if (jobLevels) emit(g, "jobLevel", { jobLevel: r.jobLevel, skillPoints: r.skillPoints, granted: jobLevels });
	const xp = Math.round(baseXp * (1 + r.stats.expBonus)*boost);
	r.xp += xp;
	emit(g, "pickup", { gold: 0, ...extra, xp });
	while (r.level < g.data.stats.maxLevel && r.xp >= r.nextXp) {
		r.xp -= r.nextXp;
		r.level++;
		r.statPoints += g.data.stats.pointsPerLevel;
		Object.assign(r, autoAllocateStats(r, g.data));
		refreshStats(g, r);
		clearMasteryWounds(r);r.hp = r.maxHp;
		r.mp = r.maxMp;
		emit(g, "level", { level: r.level, skillPoints: r.skillPoints, points: r.statPoints, granted: g.data.stats.pointsPerLevel });
	}
	if(r.level>=g.data.stats.maxLevel)r.xp=0;
	g.p = before;
}
/** Party EXP: living members in this map/channel simulation split EXP, +10% per extra member. Server lookup excludes offline/loading peers. */
export function expShares(g: Game, p: Player, xp: number, jobExp: number, source?:MonsterRewardSource) {
 if(source){
  // Membership and level are captured at defeat, before async inventory commit.
  // Late joins, corpse theft and out-of-range party peers cannot inherit EXP.
  const eligible=source.recipients.filter(r=>monsterExpMultiplier(r.level,source.level)>0);
  const bonus=1+.1*Math.max(0,eligible.length-1);
  return eligible.flatMap(r=>{const player=g.players.get(r.id);if(!player||player.dead)return [];
   const factor=Math.min(monsterExpMultiplier(r.level,source.level),monsterExpMultiplier(source.ownerLevel,source.level));
   return [{player,xp:Math.floor(xp*factor*bonus/eligible.length),jobExp:Math.floor(jobExp*factor*bonus/eligible.length),shared:eligible.length>1}];
  });
 }
	const ids = g.partyMembers?.(p.id) ?? [p.id];
	const members = ids
		.map(id => g.players.get(id))
		.filter((m): m is Player => !!m && (m === p || !m.dead));
	if (members.length <= 1) return [{ player: p, xp, jobExp, shared: false }];
	const bonus = 1 + 0.1 * (members.length - 1);
	return members.map(m => ({ player: m, xp: Math.floor((xp * bonus) / members.length), jobExp: Math.floor((jobExp * bonus) / members.length), shared: true }));
}
/** Base EXP lost on death: a share of this level's requirement, never below 0 and never a de-level. */
export function deathPenalty(p: Pick<Player, "level" | "xp" | "nextXp">, data: GameData) {
	const rule = data.economy.deathPenalty;
	if (p.level < rule.minLevel || p.level >= data.stats.maxLevel) return 0;
	const lost = Math.min(Math.floor(p.xp), Math.floor(p.nextXp * rule.percent));
	p.xp -= lost;
	return lost;
}
function masteryAlly(g: Game, id: string, range: number): Player | undefined {
 const p=g.p,target=g.players.get(id);
 return target&&!target.dead&&target.mapId===g.mapId&&Math.hypot(target.x-p.x,target.z-p.z)<=range&&(target.id===p.id||g.partyMembers?.(p.id).includes(target.id))?target:undefined;
}
/** Existing staged-hit queue: reserve rolls together, keep misses in their slots and one cast identity. */
function stagedHits(g:Game,e:Enemy,skill:Skill,level:number){
 const defender=defendingStats(g,e),cast=g.nextId++;
 for(let i=0;i<skill.hits;i++){
  const r=computeDamage(attackingStats(g.p,e),defender,skill,{rng:g.random,comboThird:false},g.data);
  const staged={impact:i+1,hit:r.hit,damage:Math.round(r.damage*(e.boss&&e.motion==='stun'?1.25:1)),crit:r.crit,breakdown:r.breakdown,cast};
  if(i===0)hit(g,e,skill,false,staged);
  else(g.p.whirlwindHits??=[]).push({id:e.id,due:g.time+skill.hitInterval!*i,...staged,skillId:skill.id,level});
 }
}
function summonStrike(g:Game,pet:Summon,target:Enemy,command?:Skill){
 const stats=summonStats(g,g.p,pet);stats.atk*=advancedPetModifiers(g,g.p).damage;
 let skill:Skill=command??{...resolveSkill(g.data,'basic'),id:'shaman_01',percent:100+(pet.command?.nextBonus??0),element:'neutral'};
 if(!command)skill=mixPetSkill(g,target,skill);
 // A next-normal bonus belongs to one attack attempt, including a miss.
 if(!command&&pet.command)pet.command.nextBonus=0;
 const result=computeDamage(stats,defendingStats(g,target),skill,{rng:g.random},g.data);
 const before=target.hp;hit(g,target,skill,false,{...result,damage:Math.round((!command&&result.hit&&result.damage>0?passivePetDamage(g,g.p,target,result.damage):result.damage)*(target.boss&&target.motion==='stun'?1.25:1))},pet);
 if(!command)mixPetHit(g,target,before-target.hp,mixHooks(g));
}
function wispStrike(g:Game,w:Wisp,e:Enemy){
 const skill=w.automatic?resolveAutomaticSkill(g.data,'shaman_02',w.level):resolveSkill(g.data,'shaman_02',w.level);
 const result=computeDamage(g.p.stats,defendingStats(g,e),skill,{rng:g.random},g.data);
 const strike=()=>hit(g,e,skill,false,{...result,damage:Math.round(result.damage*(e.boss&&e.motion==='stun'?1.25:1))},w);
 if(w.automatic)withMasteryOrigin(g,'autoSpell',strike);else strike();
}
function moveEnemy(e:Enemy,x:number,z:number){const factor=slowMovementMultiplier(e);move(e,x*factor,z*factor);}
/** Forced movement shares the same collision path, without changing walking/dashing speed. */
function displace(g:Game,p:CombatTarget,x:number,z:number){
 const resist=Math.max(0,...p.statuses.filter(s=>s.id==='push_resist'&&s.remaining>0).map(s=>s.value));
 const passive=typeof p.id==='string'?passiveValue(g,p as Player,'boxer_08','pushResist')/100:0;const factor=1-Math.min(1,Math.max(resist,passive));move(p,x*factor,z*factor);
}
function activeSmokeFields(g:Game){return g.smokeFields.filter(s=>{const p=g.players.get(s.ownerId);return s.until>g.time&&p&&!p.dead&&p.mapId===g.mapId&&!masteryUseLock(p,'rogue_04',p.stats.weaponType,g.data.mastery);});}
function mixHooks(g:Game):MixHooks{return {damage:(enemy,base,magic,id)=>{
 if(base<=0||enemy.dead||enemy.hp<=0)return;
 const skill:Skill={...resolveSkill(g.data,'basic'),id,type:magic?'magic':'physical',kind:'area',percent:100,effect:undefined,element:magic?(['M01','M05'].includes(id)?'water':['M09','M10'].includes(id)?'fire':'neutral'):'weapon'};
 const stats={...g.p.stats,atk:base,matk:base,crit:0},result=computeDamage(stats,defendingStats(g,enemy),skill,{rng:g.random},g.data);
 hit(g,enemy,skill,false,{...result,damageCap:magic?undefined:Math.floor(base)});
 },petHit:(enemy,percent)=>{if(g.p.summon)summonStrike(g,g.p.summon,enemy,{...resolveSkill(g.data,'basic'),id:'M07',percent});},refresh:()=>refreshStats(g,g.p)};}
function masteryHooks(g:Game):MasteryHooks{return {hit:(enemy,skill)=>hit(g,enemy,skill),staged:(enemy,skill,level)=>stagedHits(g,enemy,skill,level),summonHit:(enemy,skill)=>{if(g.p.summon)summonStrike(g,g.p.summon,enemy,skill);},removePet:reason=>removeSummon(g,g.p,reason),guarded:amount=>mixGuardedHit(g,amount),reflect:(enemy,amount)=>mixHooks(g).damage(enemy,amount,true,'mage_19'),heal:(target,amount,skill)=>healPartyMember(g,g.p,target,amount,skill),effects:(enemy,effects)=>applyMonsterEffects(g,enemy,effects),emit:(type,data)=>emit(g,type,data)};}
function castMasteryAction(g: Game, id: string, allyId?: string,automatic=false,point?:Vec) {
 const p=g.p,level=automatic?masteryAutoRank(p,id,g.data.mastery):p.skills[id]||0;
 if(automatic&&(!isField(g.mapId)||p.inventory&&inventoryWeight(p.inventory,g.data)>=p.stats.weight*g.data.economy.attackWeightRatio))return false;
 if(!level||automatic&&(!g.data.mastery.skills.find(s=>s.id===id)?.triggerEligible||(automaticBusy(g)||masteryMixBusy(g))))return false;
 const skill=automatic?resolveAutomaticSkill(g.data,id,level):resolveSkill(g.data,id,level);
 if(p.dead||p.castRemaining>0||p.statuses.some(s=>s.id==='stun'||s.id==='knockup')||(p.cd[id]||0)>0||masteryUseLock(p,id,p.stats.weaponType,g.data.mastery))return false;
 const kind=masteryTarget(id),offensive=skill.kind!=='utility',targeted=kind==='enemy',allied=kind==='ally';
 if(allyId!==undefined&&!allied||point&&(kind!=='ground'||!Number.isFinite(point.x)||!Number.isFinite(point.z)||Math.hypot(point.x-p.x,point.z-p.z)>skill.range||!walkable(point.x,point.z,.3,g.mapId)))return false;
 const target=targeted||kind==='ground'&&!point?(g.target!==null?g.enemies.find(e=>e.id===g.target&&!e.dead):g.enemies.filter(e=>!e.dead).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0]):undefined;
 const ally=allied?masteryAlly(g,allyId??p.id,skill.range):undefined;
 if(targeted&&(allyId!==undefined||!target||Math.hypot(target.x-p.x,target.z-p.z)>Math.max(skill.range,skill.radius)+(target.boss?.5:0)))return false;
 if(id==='shaman_03'&&(!target||!commandableSummon(g,p,target)))return false;
 if(allied&&!ally)return false;
 if(!advancedCastAllowed(g,id,target,ally))return false;
 if(kind==='ground'&&target&&Math.hypot(target.x-p.x,target.z-p.z)>skill.range+(target.boss?.5:0))return false;
 if(id==='healer_01'&&ally!.hp>=ally!.maxHp)return false;
 if(id==='healer_04'&&ally!.hp>=ally!.maxHp&&!hasMasteryCleansable(ally!))return false;
 const combo=(p.boxerCombo?.until??0)>g.time?p.boxerCombo!.steps:0;
 if(id==='boxer_03'&&combo<1)return false;
 const cost=automatic?skill.sp:passiveCost(g,skill,endgameSkillCost(p,lootSkillCost(p,skill.sp,offensive),id));
 if(p.mp<cost)return false;
 const castTime=skill.cast>0?Math.max(skill.cast*(1-(p.stats.statCaps?.maxCastReduction??g.data.stats.caps.maxCastReduction)),endgameCast(p,skill.cast,(p.stats.statCaps?.maxCastReduction??g.data.stats.caps.maxCastReduction))*advancedCastMultiplier(g)*(automatic?1:passiveCastMultiplier(g,id))):0;
 p.mp-=cost;p.cd[id]=skill.cooldown;if(!automatic)p.castRemaining=castTime;
 if(!automatic){passiveStart(g,skill,cost,combo);lootSkillSpent(g,p,skill.sp,skill.effect,offensive);endgameSkillSpent(g,p,skill);normalMasteryCast(g,id,target?.id);mixNormalCast(g,id);}else markAutomaticCast(g,castTime);
 let boxerBonus:number|undefined;
 if(id==='boxer_11'){
  const preparation=masteryUseLock(p,'boxer_03',p.stats.weaponType,g.data.mastery)?undefined:p.statuses.find(s=>s.id==='finisher_ready'&&s.remaining>0);
  boxerBonus=(combo===3?skillValue(skill,'finisherBonus',level):0)+(preparation?.value??0);
  p.statuses=p.statuses.filter(s=>s.id!=='finisher_ready');
 }
 if(id==='boxer_03'||id==='boxer_11'){p.boxerCombo=undefined;emit(g,'boxerCombo',{steps:0,duration:0});}
 if(target&&!automatic){const d=Math.hypot(target.x-p.x,target.z-p.z);if(d>0){p.fx=(target.x-p.x)/d;p.fz=(target.z-p.z)/d;}}
 if(id==='archer_10')p.destination=null;
 if(!automatic){p.attack=p.castRemaining||.4;p.attackKind=p.castRemaining?'meteor':id;}p.lastCombat=g.time;
 const center=point??target??ally??(kind==='ground'?{x:p.x+p.fx*Math.min(3,skill.range),z:p.z+p.fz*Math.min(3,skill.range)}:p);
 const cast={ownerId:p.id,x:center.x,z:center.z,time:castTime,skillId:id,level,enemyId:target?.id,allyId:ally?.id,fx:p.fx,fz:p.fz,boxerBonus,paid:cost,automatic};
 emit(g,'skill',{skillId:id,autoSpell:automatic,visual:skill.visual,targetX:center.x,targetZ:center.z,r:skill.radius||2.5,duration:castTime||.4,dx:p.fx,dz:p.fz,petId:['shaman_03','shaman_11'].includes(id)?p.summon?.id:undefined});
 if(startMasteryChannel(g,id,level,ally,castTime)){p.destination=null;return true;}
 if(castTime>0)g.meteors.push(cast);else if(automatic)withMasteryOrigin(g,'autoSpell',()=>finishMasteryAction(g,cast));else finishMasteryAction(g,cast);
 return true;
}
function finishMasteryAction(g: Game, m: Game['meteors'][number]) {
 const id=m.skillId;if(!id||(!isMasteryAction(id)&&!m.automatic))return;
 const p=g.p,level=m.level||1;let skill=m.automatic?resolveAutomaticSkill(g.data,id,level):resolveSkill(g.data,id,level);
 if(level>(p.skills[id]??0)||m.automatic&&level>masteryAutoRank(p,id,g.data.mastery)||p.statuses.some(s=>s.id==='stun'||s.id==='knockup')||masteryUseLock(p,id,p.stats.weaponType,g.data.mastery))return;
 if(m.automatic&&['provoke','endure','shield_bash'].includes(id)){
  if(id==='endure'){applyEffects(p,[{id:'endure',sourceId:p.id,remaining:skillValue(skill,'duration',level),automatic:true,value:skillValue(skill,'defUp',level)/100}]);refreshStats(g,p);}
  else{const e=g.enemies.find(e=>e.id===m.enemyId&&!e.dead);if(!e||Math.hypot(e.x-p.x,e.z-p.z)>Math.max(skill.range,skill.radius)+(e.boss?.5:0))return;if(id==='provoke')applyMonsterEffects(g,e,[{id:'taunt',sourceId:p.id,remaining:skillValue(skill,'duration',level),value:1}]);else hit(g,e,{...skill,effect:e.boss?undefined:'stun'});}
  emit(g,'skillImpact',{skillId:id,autoSpell:true,x:m.x,z:m.z});return;
 }
 if(finishAdvancedMastery(g,id,level,m,m.enemyId,m.allyId,m.paid??0,masteryHooks(g),m.automatic))return;
 if(id==='rogue_04'){
  g.smokeFields=g.smokeFields.filter(s=>s.ownerId!==p.id);
  const field={id:g.nextId++,ownerId:p.id,x:p.x,z:p.z,until:g.time+skillValue(skill,'duration',level),level};g.smokeFields.push(field);
  emit(g,'skillImpact',{skillId:id,fieldId:field.id,x:p.x,z:p.z,r:skill.range,duration:skillValue(skill,'duration',level)});return;
 }
 if(id==='boxer_04'){
  const targets=g.enemies.filter(e=>!e.dead&&Math.hypot(e.x-p.x,e.z-p.z)<=skill.range);
  emit(g,'skillImpact',{skillId:id,x:p.x,z:p.z,r:skill.range});
  for(const e of targets){
   const from={x:e.x,z:e.z},dx=e.x-p.x,dz=e.z-p.z,d=Math.hypot(dx,dz),push=skillValue(skill,'push',level),delta={x:(d?dx/d:p.fx)*push,z:(d?dz/d:p.fz)*push};
   if(!e.boss&&!e.statuses.some(s=>s.id==='root'&&s.remaining>0)){
    if(g.resolveMonsterKnockback){const next=g.resolveMonsterKnockback(e,delta);e.x=next.x;e.z=next.z;}
    else{const n=Math.ceil(push/.1);for(let i=0;i<n;i++)move(e,delta.x/n,delta.z/n);}
   }
   if(g.random()<statusChance(monsterStats(g.data.monsters.monsters.find(s=>s.id===e.dataId)!,g.data,e.bossPhase===2),'slow',1,g.data))applyMonsterEffects(g,e,[{id:'slow',sourceId:p.id,remaining:skillValue(skill,'duration',level),value:skillValue(skill,'slow',level)/100}]);
   emit(g,'skillDisplace',{skillId:id,id:e.id,x:e.x,z:e.z,fromX:from.x,fromZ:from.z,resisted:e.boss});
  }return;
 }
 if(id==='archer_03'||id==='rogue_03'){
  const fx=m.fx??p.fx,fz=m.fz??p.fz;
  // The accepted fan has no angle; use 90 degrees, preserving physical HIT rolls per target.
  let targets=g.enemies.filter(e=>{const dx=e.x-p.x,dz=e.z-p.z,d=Math.hypot(dx,dz);return !e.dead&&d<=skill.range+(e.boss?.5:0)&&dx*fx+dz*fz>=d*Math.SQRT1_2-1e-9;});
  if(id==='rogue_03')targets=targets.sort((a,b)=>Number(b.id===m.enemyId)-Number(a.id===m.enemyId)||Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z)||a.id-b.id).slice(0,3);
  emit(g,'skillImpact',{skillId:id,x:p.x,z:p.z,dx:fx,dz:fz,r:skill.range,angle:90});
  for(const target of [...targets])hit(g,target,skill,false,undefined,undefined,id!=='rogue_03'||target.id===m.enemyId);
  return;
 }
 if(id==='mage_03'){
  const original=g.enemies.find(e=>e.id===m.enemyId);
  if(Math.hypot(m.x-p.x,m.z-p.z)>skill.range+(original?.boss?.5:0))return;
  emit(g,'skillImpact',{skillId:id,x:m.x,z:m.z,r:skill.radius});
  for(const target of [...g.enemies].filter(e=>!e.dead&&Math.hypot(e.x-m.x,e.z-m.z)<=skill.radius))hit(g,target,skill);return;
 }
 if(id==='healer_04'){
  const target=masteryAlly(g,m.allyId??p.id,skill.range);if(!target)return;
  const cleansed=cleanseMasteryDot(target),amount=healPartyMember(g,p,target,computeDamage(p.stats,target.stats,skill,{rng:g.random},g.data).damage,skill);
  emit(g,'skillImpact',{skillId:id,playerId:target.id,sourceId:p.id,x:target.x,z:target.z,cleansed,amount});return;
 }
 if(id==='healer_03'){
  const target=masteryAlly(g,m.allyId??p.id,skill.range);if(!target)return;
  const seconds=skillValue(skill,'duration',level);endMasteryHeal(g,target,'refreshed');
  target.healingOverTime={casterId:p.id,mapId:g.mapId,level,next:g.time+1,until:g.time+seconds,ticksLeft:seconds,amount:computeDamage(p.stats,target.stats,skill,{rng:g.random},g.data).damage,automatic:m.automatic,budget:m.automatic?target.maxHp*skillValue(skill,'selfHealCap',level)/100:undefined};
  emit(g,'healOverTime',{skillId:id,playerId:target.id,sourceId:p.id,x:target.x,z:target.z,duration:seconds});return;
 }
 if(id==='shaman_04'){
  applyEffects(p,[{id:'spirit_intercept',sourceId:p.id,remaining:skillValue(skill,'duration',level),value:skillValue(skill,'intercept',level)/100}]);
  emit(g,'skillImpact',{skillId:id,x:p.x,z:p.z});return;
 }
 if(id==='archer_04'){
  applyEffects(p,[{id:'speed',sourceId:id,remaining:skillValue(skill,'duration',level),value:skillValue(skill,'move',level)/100}]);
  emit(g,'skillImpact',{skillId:id,x:p.x,z:p.z});return;
 }
 if(id==='boxer_03'){
  applyEffects(p,[{id:'finisher_ready',sourceId:p.id,remaining:skillValue(skill,'duration',level),value:skillValue(skill,'nextCombo',level)}]);
  emit(g,'skillImpact',{skillId:id,x:p.x,z:p.z});return;
 }
 if(id==='boxer_02'){
  const slow=p.statuses.filter(s=>s.id==='slow'&&s.remaining>0).sort((a,b)=>b.value-a.value||b.remaining-a.remaining)[0];
  if(slow)p.statuses=p.statuses.filter(s=>s!==slow);
  applyEffects(p,[{id:'push_resist',sourceId:p.id,remaining:skillValue(skill,'duration',level),value:skillValue(skill,'pushResist',level)/100}]);
  emit(g,'skillImpact',{skillId:id,x:p.x,z:p.z,cleansed:slow?'slow':undefined});return;
 }
 if(id==='shaman_03'){
  const target=g.enemies.find(e=>e.id===m.enemyId);if(!target)return;
  const pet=commandableSummon(g,p,target);if(!pet)return;
  pet.atk=Math.max(1,p.stats.matk*g.data.mastery.skills.find(s=>s.id==='shaman_01')!.ranks[pet.level-1].params.petAtk/100);
  pet.command={target:target.id,level,nextBonus:skillValue(skill,'petNextBonus',level)};
  pet.target=target.id;pet.attack=0;pet.state='attack';const d=Math.hypot(target.x-pet.x,target.z-pet.z);if(d>0){pet.fx=(target.x-pet.x)/d;pet.fz=(target.z-pet.z)/d;}
  emit(g,'skillImpact',{skillId:id,petId:pet.id,id:target.id,x:pet.x,z:pet.z,dx:pet.fx,dz:pet.fz});
  summonStrike(g,pet,target,skill);return;
 }
 if(id==='shaman_02'){if(m.enemyId!==undefined&&createWisp(g,p,level,m.enemyId,m.automatic)&&!m.automatic)passiveComplete(g,skill);return;}
 if(id==='rogue_02'){
  applyEffects(p,[{id:'poison_coat',sourceId:p.id,remaining:skillValue(skill,'window',level),automatic:m.automatic,value:skillValue(skill,'poison',level)}]);
  emit(g,'skillImpact',{skillId:id,x:p.x,z:p.z});return;
 }
 if(id==='archer_02'){
  const target=g.enemies.find(e=>e.id===m.enemyId&&!e.dead);if(!target||Math.hypot(target.x-p.x,target.z-p.z)>skill.range+(target.boss?.5:0))return;
  applyEffects(p,[{id:'archer_mark',sourceId:p.id,targetId:target.id,remaining:skillValue(skill,'duration',level),value:skillValue(skill,'hit',level)}]);
  emit(g,'skillImpact',{skillId:id,id:target.id,x:target.x,z:target.z});return;
 }
 if(id==='healer_02'){
  const target=masteryAlly(g,m.allyId??p.id,skill.range);if(!target)return;
  applyEffects(target,[{id:'slow_resist',sourceId:p.id,remaining:skillValue(skill,'duration',level),value:skillValue(skill,'slowResist',level)/100}]);
  emit(g,'skillImpact',{skillId:id,playerId:target.id,sourceId:p.id,x:target.x,z:target.z});return;
 }
 if(id==='mage_02'){
  const capacity=Math.max(0,Math.round(p.stats.matk*skillValue(skill,'shield',level)/100));
  applyEffects(p,[{id:'magic_shield',sourceId:p.id,value:capacity,automatic:m.automatic,remaining:skillValue(skill,'duration',level)}]);
  emit(g,'skillImpact',{skillId:id,x:p.x,z:p.z,amount:capacity});return;
 }
 if(id==='shaman_01'){if(createSummon(g,p,level))emit(g,'skillImpact',{skillId:id,petId:p.summon!.id,x:p.summon!.x,z:p.summon!.z});return;}
 if(id!=='healer_01'){
  const target=g.enemies.find(e=>e.id===m.enemyId&&!e.dead);
  if(!target||Math.hypot(target.x-p.x,target.z-p.z)>skill.range+(target.boss?.5:0))return;
  if(id==='boxer_11')skill={...skill,percent:skill.percent*(1+(m.boxerBonus??0)/100)};
  if(id==='rogue_01'&&(p.x-target.x)*target.fx+(p.z-target.z)*target.fz<0)skill={...skill,percent:skill.percent*(1+skillValue(skill,'rearBonus',level)/100)};
  emit(g,'skillImpact',{skillId:id,visual:skill.visual,x:target.x,z:target.z,id:target.id});
  const before=target.hp;
  if(skill.hitInterval&&skill.hits>1)stagedHits(g,target,skill,level);else hit(g,target,skill);
  if(id==='boxer_01'&&target.hp<before){
   p.boxerCombo={steps:Math.min(3,((p.boxerCombo?.until??0)>g.time?p.boxerCombo!.steps:0)+skillValue(skill,'comboStep',level)),until:g.time+4};
   emit(g,'boxerCombo',{steps:p.boxerCombo.steps,duration:4});
  }
 }else{
  const target=masteryAlly(g,m.allyId??p.id,skill.range);if(!target)return;
  const amount=healPartyMember(g,p,target,computeDamage(p.stats,target.stats,skill,{rng:g.random},g.data).damage,skill,m.automatic?target.maxHp*skillValue(skill,'selfHealCap',level)/100:undefined);
  if(amount>0)emit(g,'skillImpact',{skillId:id,playerId:target.id,sourceId:p.id,x:target.x,z:target.z,amount});
 }
}
export function action(g: Game, a: Action, allyId?: string,point?:Vec) {
 activeMap = g.mapId;
 if((automaticBusy(g)&&a!=='attack'&&a!=='basic')||masteryMixBusy(g))return false;
 const canonical=skillId(a);if(point&&masteryTarget(canonical)!=='ground')return false;if(g.data.mastery.skills.some(s=>s.id===canonical)&&masteryUseLock(g.p,canonical,g.p.stats.weaponType,g.data.mastery,true))return false;
 if(g.p.inventory&&a!=='potion'&&inventoryWeight(g.p.inventory,g.data)>=g.p.stats.weight*g.data.economy.attackWeightRatio){emit(g,'notice',{text:'น้ำหนักเกิน 90% โจมตีไม่ได้'});return false;}
 if(g.mapId==='city_plaza' && a!=='potion'){emit(g,"notice",{text:"เขตปลอดภัย ใช้สกิลต่อสู้ในเมืองไม่ได้"});return false;}
	if(isMasteryAction(a))return castMasteryAction(g,a,allyId,false,point);
	const p = g.p,
		skill = g.data.skills.skills.some((s) => s.id === skillId(a))
			? gameSkill(g, a)
			: null;
	if (
		!skill ||
		skill.passive ||
		!p.skills[skill.id] ||
		!belongsToJob(p.jobId, skill.jobId, g.data) ||
		p.dead ||
		p.castRemaining > 0 ||
		p.statuses.some((s) => s.id === "stun" || s.id === "knockup") ||
		(p.cd[
			skill.id === "basic" ? "attack" : skill.id === "dodge" ? "dash" : skill.id
		] || 0) > 0
	)
		return false;
	if (a === "attack" || a === "basic") {
		if (p.dash > 0) return false;
		passiveStart(g,skill,0);
		p.combo = p.comboWindow > 0 ? (p.combo + 1) % 3 : 0;
		p.comboWindow = 1.1;
		p.attack = 0.34;
		p.attackKind = "slash";
		p.cd.attack = endgameAttackInterval(p,(p.combo === 2 ? 1.45 : 1)/Math.max(.1,p.stats.aspd));
		if(p.stats.weaponType==='bow'){
			const range=basicReach(g),target=g.enemies.find(e=>e.id===g.target&&!e.dead&&Math.hypot(e.x-p.x,e.z-p.z)<range+(e.boss?.5:0))??g.enemies.filter(e=>!e.dead&&Math.hypot(e.x-p.x,e.z-p.z)<range+(e.boss?.5:0)).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
			if(target){const d=Math.hypot(target.x-p.x,target.z-p.z)||1;p.fx=(target.x-p.x)/d;p.fz=(target.z-p.z)/d;}
			emit(g,'bowShot',{dx:p.fx,dz:p.fz,targetX:target?.x??p.x+p.fx*range,targetZ:target?.z??p.z+p.fz*range,id:target?.id});
			if(target)hit(g,target,skill,false);
			return true;
		}
		const preferred = p.auto
			? g.enemies.find(
					(e) =>
						e.id === g.target &&
						!e.dead &&
						Math.hypot(e.x - p.x, e.z - p.z) < (e.boss ? 2.3 : 1.8),
				)
			: undefined;
		const nearby =
			preferred ||
			g.enemies
				.filter((e) => !e.dead && Math.hypot(e.x - p.x, e.z - p.z) < 2.3)
				.sort(
					(a, b) =>
						Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
				)[0];
		if (nearby) {
			const d = Math.hypot(nearby.x - p.x, nearby.z - p.z) || 1;
			p.fx = (nearby.x - p.x) / d;
			p.fz = (nearby.z - p.z) / d;
		}
		emit(g, "slash", { dx: p.fx, dz: p.fz, combo: p.combo });
		let connected = false;
		for (const e of [...g.enemies]) {
			const dx = e.x - p.x,
				dz = e.z - p.z,
				d = Math.hypot(dx, dz);
			if (
				!e.dead &&
				d < (e.boss ? 2.3 : 1.8) &&
				(dx * p.fx + dz * p.fz) / (d || 1) > -0.2
			)
				connected = hit(g, e, skill, p.combo === 2) || connected;
		}
		if (p.combo === 2 && connected)
			rhythmCooldowns(p.cd, p.skills.sword_rhythm || 0, g.data);
		return true;
	}
	if (!["dodge", "potion"].includes(skill.id)) {
		const level = p.skills[skill.id] || 1;
		const target =
			g.enemies.find((e) => e.id === g.target && !e.dead) ||
			g.enemies
				.filter((e) => !e.dead)
				.sort(
					(a, b) =>
						Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
				)[0];
		if (
			skill.kind === "single" &&
			skill.effect !== "dash" &&
			(!target ||
				Math.hypot(target.x - p.x, target.z - p.z) >
					skill.range + (target.boss ? 0.5 : 0))
		)
			return false;
		const spCost=endgameSkillCost(p,lootSkillCost(p,skill.sp,skill.percent>0),skill.id);
		if (p.mp < spCost) {
			emit(g, "notice", { text: "SP ไม่พอ รอพลังฟื้นสักครู่" });
			return false;
		}
		if (skill.kind === "single" && target) {
			const d = Math.hypot(target.x - p.x, target.z - p.z) || 1;
			p.fx = (target.x - p.x) / d;
			p.fz = (target.z - p.z) / d;
		}
		p.mp -= spCost;
  normalMasteryCast(g,skill.id,target?.id);mixNormalCast(g,skill.id);
		lootSkillSpent(g,p,skill.sp,skill.effect,skill.percent>0);endgameSkillSpent(g,p,skill);
		p.cd[skill.id] = skill.cooldown;
		if (skill.id === "whirlwind") p.cd.spin = skill.cooldown;
		const castTime = skill.cast > 0 ? Math.max(skill.cast * (1 - (p.stats.statCaps?.maxCastReduction??g.data.stats.caps.maxCastReduction)), endgameCast(p, skill.cast,(p.stats.statCaps?.maxCastReduction??g.data.stats.caps.maxCastReduction))) : 0;
		const look = skill.visual ?? skill.id;
		p.attack =
			look === "whirlwind"
				? 0.6
				: skill.effect === "dash"
					? 0.5
					: castTime || 0.5;
		p.attackKind =
			look === "whirlwind"
				? "spin"
				: look === "slash"
					? "slash"
					: skill.effect === "dash"
						? "dash_strike"
						: "meteor";
		emit(g, "skill", {
			skillId: skill.id,
			visual: skill.visual,
			duration: castTime || 0.7,
			dx: p.fx,
			dz: p.fz,
		});
		if (skill.effect === "heal") {
			const amount = Math.min(
				p.maxHp - p.hp,
				skillValue(skill, "heal", level) + p.stats.stats.vit * 2,
			);
			restoreMasteryHp(p,amount);
			emit(g, "heal", { amount });
			return true;
		}
		if (skill.effect === "guard" || skill.effect === "rage") {
			if (skill.effect === "rage") p.hp = Math.max(1, p.hp - Math.round(p.maxHp * skillValue(skill, "hpCost", level)));
			applyEffects(p, skillEffects(skill, level, p.id));
			refreshStats(g, p);
			return true;
		}
		if (skill.effect === "endure") {
			p.hurt = 0;
			applyEffects(p, skillEffects(skill, level, p.id));
			refreshStats(g, p);
			return true;
		}
		if (skill.effect === "taunt") {
			for (const e of g.enemies)
				if (!e.dead && Math.hypot(e.x - p.x, e.z - p.z) <= skill.radius) {
					applyMonsterEffects(g,e,skillEffects(skill,level,p.id));endgameStatus(g,p,e);
					e.aggro = 5;
				}
			return true;
		}
		if (skill.effect === "dash") {
			if (target && Math.hypot(target.x - p.x, target.z - p.z) <= skill.range) {
				const d = Math.hypot(target.x - p.x, target.z - p.z) || 1;
				p.fx = (target.x - p.x) / d;
				p.fz = (target.z - p.z) / d;
			}
			const seen = new Set<number>();
			const start = { x: p.x, z: p.z };
			g.destination = null;
			if (!p.auto) g.target = null;
			if (skill.landing) {
				// Leap: fly over the path (no hits on the way) and land just short of the target; the strike
				// resolves on landing after landing.delay, while the leaper is airborne and untouchable.
				const reach = target ? Math.min(skill.range, Math.max(0, Math.hypot(target.x - p.x, target.z - p.z) - 0.8)) : skill.range;
				for (let n = 0; n < Math.round(reach / 0.1); n++) {
					const x = p.x + p.fx * 0.1, z = p.z + p.fz * 0.1;
					if (!walk(x, z, 0.35)) break;
					p.x = x;
					p.z = z;
				}
				const cast = g.nextId++;
				p.invulnerable = Math.max(p.invulnerable, skill.landing.delay);
				p.castRemaining = Math.max(p.castRemaining, skill.landing.delay);
				(p.landings ??= []).push({ due: g.time + skill.landing.delay, x: p.x, z: p.z, skillId: skill.id, level, cast });
				emit(g, "dashTrail", { fromX: start.x, fromZ: start.z, toX: p.x, toZ: p.z, skillId: skill.id, visual: skill.visual, duration: skill.landing.delay, cast });
				return true;
			}
			for (let n = 0; n < Math.round(skill.range / 0.1); n++) {
				const x = p.x + p.fx * 0.1,
					z = p.z + p.fz * 0.1;
				if (!walk(x, z, 0.35)) break;
				p.x = x;
				p.z = z;
				for (const e of [...g.enemies])
					if (
						!e.dead &&
						!seen.has(e.id) &&
						Math.hypot(e.x - x, e.z - z) < (e.boss ? 1.3 : 0.9)
					) {
						seen.add(e.id);
						hit(g, e, skill);
					}
			}
			emit(g, "dashTrail", {
				fromX: start.x,
				fromZ: start.z,
				toX: p.x,
				toZ: p.z,
			});
			return true;
		}
		if (skill.cast > 0) {
			p.castRemaining = castTime;
			g.meteors.push({
				ownerId: p.id,
				targetId: skill.kind === "single" ? target?.id : undefined,
				x: skill.range && target ? target.x : p.x,
				z: skill.range && target ? target.z : p.z,
				time: p.castRemaining,
				skillId: skill.id,
				level,
			});
			return true;
		}
		const targets =
			skill.kind === "single"
				? target
					? [target]
					: []
				: g.enemies.filter(
						(e) => !e.dead && Math.hypot(e.x - p.x, e.z - p.z) <= skill.radius,
					);
        for (const e of [...targets]) {
            if(skill.id==='whirlwind') {
                // Reserve both original rolls now, then divide their exact integer total.
                const defender=defendingStats(g,e);
                const rolls=Array.from({length:skill.hits},()=>computeDamage(attackingStats(p,e),defender,skill,{rng:g.random,comboThird:false},g.data));
                const total=rolls.reduce((n,r)=>n+Math.round(r.damage*(e.boss&&e.motion==='stun'?1.25:1)),0);
                const prepared={impact:1,damage:Math.ceil(total/2),crit:rolls.some(r=>r.crit),breakdown:rolls[0].breakdown};
                hit(g,e,skill,false,prepared);
                (p.whirlwindHits??=[]).push({id:e.id,due:g.time+.25,...prepared,impact:2,damage:Math.floor(total/2)});
            } else if(skill.hitInterval && skill.hits>1) {
                // Staged multi-hit (frenzy_slash, blade_cyclone): every roll is made now, hit 1 lands now and the
                // rest land hitInterval apart; a miss keeps its slot, and hits queued after the target dies are dropped.
                stagedHits(g,e,skill,level);
            } else for(let i=0;i<skill.hits;i++)hit(g,e,skill);
        }
		return true;
	}
	if (skill.id === "dodge") {
		p.cd.dash = CD.dash;
		p.dash = 0.22;
		p.invulnerable = 0.35;
		if (!p.auto) g.target = null;
		g.destination = null;
		emit(g, "dash", { dx: p.fx, dz: p.fz });
		return true;
	}
	if (skill.id === "potion" && p.inventory) return drinkPotion(g, "hp", skill.cooldown);
 if (skill.id === "potion") {
		if (p.potions <= 0) {
			emit(g, "notice", { text: "ยาหมดแล้ว กลับไปฟื้นพลังที่แคมป์" });
			return false;
		}
		if (p.hp >= p.maxHp) return false;
		const amount = Math.min(
			computeDamage(p.stats, p.stats, skill, { rng: g.random }, g.data).damage,
			p.maxHp - p.hp,
		);
		restoreMasteryHp(p,amount);
		p.potions--;
		p.cd.potion = skill.cooldown;
		emit(g, "heal", { amount });
		return true;
	}
	return false;
}
/** Drinks the strongest bag potion of this kind, sharing the one potion cooldown. */
function drinkPotion(g: Game, kind: "hp" | "sp", cooldown: number) {
	const p = g.p;
	if (!p.inventory || p.dead || p.cd.potion > 0) return false;
	if (kind === "hp" ? p.hp >= p.maxHp : p.mp >= p.maxMp) return false;
	const best = bestPotion(p.inventory, g.data, kind);
	if (!best) return false;
	if (g.inventoryCommit) {
		// The server applies the effect once the bag write commits; hold the cooldown now so nothing queues twice.
		p.cd.potion = cooldown;
		g.inventoryCommit(p, { op: "use", id: best.id }, () => {});
		return true;
	}
	const out = applyInventory({ gold: p.gold, boundGold:p.boundGold, inventory: p.inventory }, { op: "use", id: best.id }, p.profile, g.data, () => String(g.nextId++));
	p.inventory = out.state.inventory;
	applyPotionEffect(g,p,kind,out.effect!.amount);
	refreshStats(g, p);
	return true;
}
/** Auto-potion: drink when HP or MP is below the player's threshold. HP goes first; both share the cooldown. */
export function autoDrink(g: Game): "hp" | "mp" | null {
	const p = g.p,
		rule = p.autoPotion;
	if (!rule || !p.inventory || p.dead || p.cd.potion > 0 || p.castRemaining > 0) return null;
	if (p.statuses.some((s) => s.id === "stun" || s.id === "knockup")) return null;
	const cooldown = gameSkill(g, "potion").cooldown;
	for (const [kind, on, at, now, max] of [
		["hp", rule.hp.on, rule.hp.at, p.hp, p.maxHp],
		["mp", rule.mp.on, rule.mp.at, p.mp, p.maxMp],
	] as const) {
		if (!on || now >= (max * at) / 100) continue;
		const best = bestPotion(p.inventory, g.data, kind === "hp" ? "hp" : "sp");
		if (best && drinkPotion(g, kind === "hp" ? "hp" : "sp", cooldown)) {
			emit(g, "autoPotion", { kind, template: best.template });
			return kind;
		}
	}
	return null;
}
export function revive(g: Game) {
	const p = g.p;
 if((p.reviveRemaining??0)>0)return;
	setAuto(g, false);
	const checkpoint=g.mapId==='confluence'?campFor(g.mapId,p):CITY_SPAWN;
 p.mapId=g.mapId==='confluence'?'confluence':'city_plaza';
 p.x=checkpoint.x;
 p.z=checkpoint.z;
 p.fx=0;p.fz=1;
 p.statuses=[]; p.castRemaining=0; p.destination=null; p.target=null;
	clearMasteryWounds(p);p.hp = p.maxHp;
	p.mp = p.maxMp;
	if(!p.inventory)p.potions = 5;
	p.dead = false;clearAdvancedMastery(p);p.boxerCombo=undefined;removeSummon(g,p,'revive');removeWisp(g,p,'revive');clearMasteryPoisons(g,p.id);clearMasteryHeals(g,p.id);
	p.invulnerable = 3;
	p.dash = 0;
	p.attack = 0;
	p.hurt = 0;
	const otherLiving = [...g.players.values()].some(
		(other) => other.id !== p.id && !other.dead,
	);
	if (!otherLiving) {
		g.projectiles = [];
		for (const e of g.enemies) {
			e.aggro = 0;
			e.windup = 0;
			cancelTelegraph(g, e);
			if (!e.dead) {
				setMotion(e, "idle");
				e.cooldown = 1;
				e.engaged = false;
			}
		}
	}
	emit(g, "notice", { text: "พักฟื้นแล้ว พร้อมออกผจญภัยอีกครั้ง" });
}
export function setAuto(g: Game, enabled: boolean) {
	enabled = enabled && !g.p.dead && g.mapId!=="city_plaza";
	if (g.p.auto === enabled) return;
	g.p.auto = enabled;
	g.p.autoState = enabled ? "seek" : "idle";
	g.autoTimer = 0;
	g.autoPath = [];
	g.autoGoal = null;
	g.autoCharge = -1;
	g.p.autoUnreachable = undefined;
	g.p.autoProgress = undefined;
	g.destination = null;
	g.target = null;
	emit(g, "notice", {
		text: enabled ? "ออโต้ เปิด · แตะจอยหรือกด WASD เพื่อหยุด" : "ออโต้ ปิด",
	});
}
/** The manual ground command keeps its original direct steering. AUTO supplies routed waypoints. */
export function moveTo(g: Game, x: number, z: number, manual = true) {
	activeMap = g.mapId;
	if (manual) {
		setAuto(g, false);
		g.target = null;
	}
	g.destination = { x, z };
}
function clearSegment(a: Vec, b: Vec) {
	const count = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.2);
	for (let i = 1; i <= count; i++)
		if (
			!walk(
				a.x + ((b.x - a.x) * i) / count,
				a.z + ((b.z - a.z) * i) / count,
				0.4,
			)
		)
			return false;
	return true;
}
/** Static collision grids are reused per map, with explicit map IDs for multiplayer rooms. */
const autoNavigators = new Map<MapId, ReturnType<typeof createPlayerPathfinder>>();
function route(mapId: MapId, from: Vec, to: Vec): Vec[] {
 let navigator = autoNavigators.get(mapId);
 if (!navigator) {
  navigator = createPlayerPathfinder(mapId);
  autoNavigators.set(mapId,navigator);
 }
 return navigator.findPath(from,to);
}
function navigate(g: Game, goal: Vec, reach = 0): Vec {
	const p = g.p;
	// Enemies use .3 clearance and may stand closer to a rock than our .4 route margin.
	// Route to a melee approach point instead of requiring their exact centre to be traversable.
	if (reach && !walk(goal.x, goal.z, 0.4)) {
		const angle = Math.atan2(p.z - goal.z, p.x - goal.x);
		const approach = Array.from({ length: 12 }, (_, i) => ({
			x: goal.x + Math.cos(angle + (i * Math.PI) / 6) * (reach - 0.3),
			z: goal.z + Math.sin(angle + (i * Math.PI) / 6) * (reach - 0.3),
		})).find((v) => walk(v.x, v.z, 0.4));
		if (approach) goal = approach;
	}
	if (
		!g.autoGoal ||
		Math.hypot(goal.x - g.autoGoal.x, goal.z - g.autoGoal.z) > 0.65 ||
		!g.autoPath.length
	) {
		g.autoGoal = { ...goal };
		g.autoPath = route(g.mapId, p, goal);
		p.autoProgress = {x:p.x,z:p.z,at:g.time,retried:false};
	}
	const progress=p.autoProgress;
	if(progress){
		if(Math.hypot(p.x-progress.x,p.z-progress.z)>.25){progress.x=p.x;progress.z=p.z;progress.at=g.time;progress.retried=false;}
		else if(g.time-progress.at>3&&p.castRemaining<=0&&!p.statuses.some(s=>s.id==='stun'||s.id==='knockup')){
			g.autoPath=progress.retried?[]:route(g.mapId,p,goal);progress.retried=true;progress.at=g.time;
		}
	}
	while (
		g.autoPath.length &&
		Math.hypot(g.autoPath[0].x - p.x, g.autoPath[0].z - p.z) < 0.2
	)
		g.autoPath.shift();
	const next = g.autoPath[0];
	if (!next) {
		g.destination = null;
		return { x: 0, z: 0 };
	}
	moveTo(g, next.x, next.z, false);
	const d = Math.hypot(next.x - p.x, next.z - p.z) || 1;
	return { x: (next.x - p.x) / d, z: (next.z - p.z) / d };
}
function autoDodge(g: Game) {
	const p = g.p;
	if (p.cd.dash > 0 || p.dash > 0) return;
	// Telegraphed skills: roll out just before the blast, towards the nearest safe spot (into a ring's hole too).
	for (const e of g.enemies) {
		const t = e.telegraph;
		if (e.dead || !t || t.left > 0.3 || !inTelegraph(t, p.x, p.z)) continue;
		const away = Math.atan2(p.z - t.z, p.x - t.x),
			inward = t.shape === "ring" && Math.hypot(p.x - t.x, p.z - t.z) - t.inner < t.radius - Math.hypot(p.x - t.x, p.z - t.z);
		const angles = [0, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, Math.PI].map((o) => away + (inward ? Math.PI : 0) + o);
		for (const a of angles) {
			const dx = Math.cos(a),
				dz = Math.sin(a),
				end = { x: p.x + dx * 3.08, z: p.z + dz * 3.08 };
			if (inTelegraph(t, end.x, end.z) || !clearSegment(p, end)) continue;
			p.fx = dx;
			p.fz = dz;
			if (action(g, "dash")) {
				g.autoPath = [];
				g.autoGoal = null;
			}
			return;
		}
	}
	for (const e of g.enemies) {
		if (
			e.dead ||
			!e.boss ||
			e.attackApplied ||
			!["slam", "sweep", "charge", "spit"].includes(e.motion)
		)
			continue;
		const speed = e.bossPhase === 2 ? 1.3 : 1,
			impact = e.motion === "slam" ? 0.85 : e.motion === "sweep" ? 0.7 : 0.8,
			remaining = (impact - e.motionTime) / speed;
		let cx = e.motion === "slam" ? e.aimX : e.x,
			cz = e.motion === "slam" ? e.aimZ : e.z;
		let radius = e.motion === "slam" ? 2.6 : e.motion === "sweep" ? 3.5 : 1.2;
		if (e.motion === "charge") {
			const dx = e.aimX - e.startX,
				dz = e.aimZ - e.startZ,
				l = dx * dx + dz * dz || 1,
				t = Math.max(
					0,
					Math.min(1, ((p.x - e.startX) * dx + (p.z - e.startZ) * dz) / l),
				);
			cx = e.startX + dx * t;
			cz = e.startZ + dz * t;
			radius = 1.55;
		}
		const earlyCharge =
			e.motion === "charge" && remaining > 0 && g.autoCharge !== e.patternIndex;
		if (
			Math.hypot(p.x - cx, p.z - cz) >= radius ||
			(!earlyCharge && (remaining < 0 || remaining > 0.15))
		)
			continue;
		let angle = Math.atan2(p.z - cz, p.x - cx);
		if (Math.hypot(p.x - cx, p.z - cz) < 0.05)
			angle =
				e.motion === "charge"
					? Math.atan2(e.fz, e.fx) + Math.PI / 2
					: Math.atan2(p.z - e.z, p.x - e.x);
		// Prefer outward movement; rotate away from terrain if the ideal escape is blocked.
		for (const offset of [0, 0.5, -0.5, 1, -1, Math.PI]) {
			const dx = Math.cos(angle + offset),
				dz = Math.sin(angle + offset),
				end = { x: p.x + dx * 3.08, z: p.z + dz * 3.08 };
			if (!clearSegment(p, end)) continue;
			p.fx = dx;
			p.fz = dz;
			if (action(g, "dash")) {
				g.autoCharge = e.patternIndex;
				g.autoPath = [];
				g.autoGoal = null;
			}
			return;
		}
	}
}
function autoStep(g: Game, dt: number): Vec {
	const p = g.p,
		still = { x: 0, z: 0 };
	autoDodge(g);
	if (p.dash > 0) return still;
	g.autoTimer -= dt;
	if (g.autoTimer <= 0) {
		g.autoTimer += 0.2;
		const cfg = p.autoCfg ?? DEFAULT_AUTO;
		if (!p.autoPotion?.hp.on && p.hp < p.maxHp * 0.45 && p.potions > 0) action(g, "potion");
		if (p.hp < p.maxHp * 0.25 && p.potions === 0) p.autoState = "retreat";
		const retreat = p.autoState === "retreat" && p.hp < p.maxHp * 0.9;
		const target = autoPickTarget(g, cfg);
		g.target = target?.id ?? null;
		const reach = target ? autoReach(g,cfg,target) : 0,
			d = target ? Math.hypot(target.x - p.x, target.z - p.z) : Infinity;
		p.autoState = retreat
			? "retreat"
			: target
				? d < reach
					? "fight"
					: "seek"
				: "idle";
				const camp = campFor(g.mapId, p), atCamp = Math.hypot(p.x - camp.x, p.z - camp.z) < 1;
		if (target && d < reach && (!retreat || atCamp)) {
			p.fx = (target.x - p.x) / (d || 1);
			p.fz = (target.z - p.z) / (d || 1);
			autoCast(g, cfg);
		}
		else if(p.hp<p.maxHp*cfg.survive/100) autoCast(g,cfg,true);
	}
	if(p.castRemaining>0)return still;
	const target = g.enemies.find((e) => e.id === g.target && !e.dead);
	const retreat = p.autoState === "retreat",
				atCamp = Math.hypot(p.x - campFor(g.mapId, p).x, p.z - campFor(g.mapId, p).z) < 1;
	if (target) {
		const d = Math.hypot(target.x - p.x, target.z - p.z),
			reach = autoReach(g,p.autoCfg??DEFAULT_AUTO,target);
		if (d < reach && (!retreat || atCamp)) {
			p.fx = (target.x - p.x) / (d || 1);
			p.fz = (target.z - p.z) / (d || 1);
			if ((p.autoCfg ?? DEFAULT_AUTO).basic && d < basicReach(g)+(target.boss?.5:0)) action(g, "attack");
			g.destination = null;
			if (!retreat) p.autoState = "fight";
			return still;
		}
		if (!retreat) {
			p.autoState = "seek";
			const direction = navigate(g, target, reach);
			if (g.autoPath.length) return direction;
			// No route: standing still on this target would freeze AUTO, so hunt something else.
			skipAutoTarget(g,target);
			return still;
		}
	}
		if (retreat) return atCamp ? still : navigate(g, campFor(g.mapId, p));
	p.autoState = target ? "seek" : "idle";
	const scout = autoScoutGoal(g, p.autoCfg ?? DEFAULT_AUTO);
	if (scout) { p.autoState = "seek"; const direction=navigate(g,scout,1);if(!g.autoPath.length)skipAutoTarget(g,scout);return direction; }
	g.destination=null;
	return still;
}
function skipAutoTarget(g:Game,target:Enemy){
	g.p.autoUnreachable=Object.fromEntries(Object.entries(g.p.autoUnreachable??{}).filter(([,until])=>until>g.time));
	g.p.autoUnreachable[target.id]=g.time+8;g.target=null;g.autoPath=[];g.autoGoal=null;g.p.autoProgress=undefined;g.autoTimer=0;
}
/** AUTO and enemy decisions must agree on which player is being attacked. */
function enemyTargetPlayer(g:Game,e:Enemy){
		const forced = e.statuses.find((s) => s.id === "taunt");
		const taunter = forced ? g.players.get(forced.sourceId) : undefined;
		return taunter && !taunter.dead
				? taunter
				: [...g.players.values()]
						.filter((p) => !p.dead)
						.sort(
							(a, b) =>
								Math.hypot(a.x - e.x, a.z - e.z) -
								Math.hypot(b.x - e.x, b.z - e.z),
						)[0];
}
/**
 * Pick the nearest eligible monster, then finish it before selecting another.
 * Attackers may bypass the hunt filter, but neither attackers nor bosses override distance or a live target.
 */
function autoPickTarget(g: Game, cfg: AutoSettings) {
	const p = g.p,
		R = AUTO_RANGES[cfg.range],
		wanted = wantedMonsters(cfg, g.mapId),
		dist = (e: Enemy) => Math.hypot(e.x - p.x, e.z - p.z),
		fighting = (e: Enemy) => cfg.attackers && e.aggro > 0 && (e.engaged || (e.damageBy[p.id] ?? 0) > 0) && dist(e) < 6 && enemyTargetPlayer(g,e)?.id===p.id,
		allowed = (e: Enemy) => !wanted || wanted.has(e.dataId) || fighting(e),
		skip = p.autoUnreachable || {},
		living = g.enemies.filter((e) => !e.dead && !endgameBossLocked(g,e) && !desertBurrowed(e) && !((skip[e.id] ?? 0) > g.time) && (!e.summoned || fighting(e)));
	const current = living.find((e) => e.id === g.target && allowed(e));
	return current ?? living.filter((e) => allowed(e) && dist(e) <= R).sort((a, b) => dist(a) - dist(b))[0];
}
/** With nothing in range, scout towards the nearest wanted monster, including bosses at their actual distance. */
function autoScoutGoal(g: Game, cfg: AutoSettings): Enemy | undefined {
	const p = g.p, wanted = wantedMonsters(cfg, g.mapId), skip = p.autoUnreachable || {};
	const away = (e: Enemy) => Math.hypot(e.x - p.x, e.z - p.z);
	return g.enemies.filter((e) => !e.dead && !endgameBossLocked(g,e) && !desertBurrowed(e) && !e.summoned && !((skip[e.id] ?? 0) > g.time) && (!wanted || wanted.has(e.dataId))).sort((a, b) => away(a) - away(b))[0];
}
/** Learned and enabled skills, in the player's AUTO order. */
function autoSkills(g: Game, cfg: AutoSettings) {
	const p = g.p,
		hotbar = (p.hotbar ?? []).filter(h=>!h.mode).map((h) => h.skill),
		spec = (id: string) => g.data.mastery.skills.some(s=>s.id===id)?gameSkill(g,id):g.data.skills.skills.find((s) => s.id === id),
		// Job skills only: basic attack, dodge and potion are common skills with their own handling (dodge would drop the target).
		seq = autoSkillSequence(cfg, hotbar, (id) => !!p.skills[id] && !(p.hotbar.some(s=>s.skill===id&&s.mode)&&!hotbar.includes(id)) && !!spec(id) && !spec(id)!.passive && (spec(id)!.jobId !== "common"||g.data.mastery.skills.some(s=>s.id===id)) && belongsToJob(p.jobId, spec(id)!.jobId, g.data), Object.keys(p.skills), (id) => skillTierRank(g.data, id));
	return seq;
}
/** Affordable ranged attacks keep their distance while cooling down; no SP falls back to melee. */
export function basicReach(g:Game){return g.p.stats.weaponType==='bow'?g.data.mastery.skills.find(s=>s.id==='archer_01')!.range:1.8;}
function autoReach(g:Game,cfg:AutoSettings,target:Enemy){
	let reach=basicReach(g)+(target.boss?.5:0);
	for(const id of autoSkills(g,cfg)){
		const skill=gameSkill(g,id);
		if(isMasteryAction(id)&&masteryUseLock(g.p,id,g.p.stats.weaponType,g.data.mastery))continue;
		if(skill.percent>0&&skill.kind==='single'&&skill.effect!=='dash'&&g.p.mp>=skill.sp&&worthCasting(g,skill,target))reach=Math.max(reach,skill.range+(target.boss?.5:0)-.2);
	}
	return reach;
}
/** Cast one ready skill; retreating players may still heal and guard. */
function autoCast(g: Game, cfg: AutoSettings, survivalOnly=false) {
	const p=g.p,seq=autoSkills(g,cfg),order=autoCastOrder(seq,cfg,p.hp/p.maxHp,p.autoNext??null,id=>isSurvivalSkill(gameSkill(g,id)));
	const target = g.enemies.find((e) => e.id === g.target && !e.dead);
	for (const id of order) {
		if(survivalOnly&&!isSurvivalSkill(gameSkill(g,id)))continue;
		if ((p.cd[id] || 0) > 0 || p.mp < gameSkill(g, id).sp) continue;
		if (!worthCasting(g, gameSkill(g, id), target)) continue;
		if (action(g, id)) {
			p.autoNext = seq[(seq.indexOf(id) + 1) % seq.length] ?? null;
			return true;
		}
	}
	return false;
}
/**
 * Area damage waits for a group so AUTO does not spend SP on one monster: 2 in reach, or 3 for a slow
 * cast like earth_break; a boss is always worth it. Everything else (single target, buffs, taunts) is fine.
 */
function worthCasting(g: Game, skill: Skill, target: Enemy | undefined) {
 if(skill.id==='rogue_04')return g.enemies.some(e=>!e.dead&&Math.hypot(e.x-g.p.x,e.z-g.p.z)<=skill.range)&&!activeSmokeFields(g).some(s=>s.ownerId===g.p.id);
 if(skill.id==='boxer_04')return g.enemies.some(e=>!e.dead&&Math.hypot(e.x-g.p.x,e.z-g.p.z)<=skill.range);
 const combo=(g.p.boxerCombo?.until??0)>g.time?g.p.boxerCombo!.steps:0;
 if(skill.id==='boxer_03')return combo>0&&combo<3&&!!g.p.skills.boxer_11&&!g.p.statuses.some(s=>s.id==='finisher_ready'&&s.remaining>0);
 if(skill.id==='boxer_11')return combo===3||g.p.statuses.some(s=>s.id==='finisher_ready'&&s.remaining>0);
 if(skill.id==='shaman_04')return !g.p.statuses.some(s=>s.id==='spirit_intercept'&&s.remaining>0);
 if(skill.id==='archer_04')return !g.p.statuses.some(s=>s.id==='speed'&&s.sourceId==='archer_04'&&s.remaining>0);
	if(skill.id==='mage_03')return !!target&&(target.boss||g.enemies.filter(e=>!e.dead&&Math.hypot(e.x-target.x,e.z-target.z)<=skill.radius).length>=2);
 if(skill.id==='healer_04')return hasMasteryCleansable(g.p)||g.p.hp<g.p.maxHp;
	if(skill.id==='healer_03')return g.p.hp<g.p.maxHp&&!g.p.healingOverTime;
	if(skill.id==='boxer_02')return g.p.statuses.some(s=>s.id==='slow'&&s.remaining>0)||!g.p.statuses.some(s=>s.id==='push_resist'&&s.remaining>0);
	if(skill.id==='shaman_03')return !!target&&!!commandableSummon(g,g.p,target);
	if(skill.id==='shaman_02')return !g.p.wisp;
	if(skill.id==='rogue_02')return !g.p.statuses.some(s=>s.id==='poison_coat'&&s.remaining>0);
	if(skill.id==='archer_02')return !!target&&!g.p.statuses.some(s=>s.id==='archer_mark'&&s.targetId===target.id&&s.remaining>0);
	if(skill.id==='healer_02')return !g.p.statuses.some(s=>s.id==='slow_resist'&&s.remaining>0);
	if(skill.id==='mage_02')return !g.p.statuses.some(s=>s.id==='magic_shield'&&s.remaining>0&&s.value>0);
	if(skill.id==='shaman_01')return !g.p.summon||g.p.summon.dead||g.p.summon.hp<=0;
	if (skill.kind !== "area" || !skill.percent || !skill.radius) return true;
	if (target?.boss) return true;
	const p = g.p,
		around = g.enemies.filter((e) => !e.dead && Math.hypot(e.x - p.x, e.z - p.z) <= skill.radius + 0.4).length;
	return around >= (skill.cast > 0 ? 3 : 2);
}
function face(e: Enemy, x: number, z: number) {
	const d = Math.hypot(x - e.x, z - e.z) || 1;
	e.fx = (x - e.x) / d;
	e.fz = (z - e.z) / d;
}
function startKingAttack(g: Game, e: Enemy) {
	const attack = KING_PATTERN[e.patternIndex++ % KING_PATTERN.length];
	setMotion(e, attack);
	e.history.push(attack);
	e.startX = e.x;
	e.startZ = e.z;
	e.aimX = g.p.x;
	e.aimZ = g.p.z;
	face(e, e.aimX, e.aimZ);
	const speed = e.bossPhase === 2 ? 1.3 : 1;
	e.windup =
		(attack === "slam"
			? 0.85
			: attack === "sweep"
				? 0.7
				: attack === "summon"
					? 0.9
					: 0.8) / speed;
	if (attack === "charge") {
		e.aimX = e.x + e.fx * 6;
		e.aimZ = e.z + e.fz * 6;
		for (const t of [0.25, 0.5, 0.75, 1])
			warn(g, e, e.x + e.fx * 6 * t, e.z + e.fz * 6 * t, 1.1, e.windup);
	} else
		warn(
			g,
			e,
			attack === "slam" ? e.aimX : e.x,
			attack === "slam" ? e.aimZ : e.z,
			attack === "slam"
				? 2.6
				: attack === "sweep"
					? 3.5
					: attack === "summon"
						? 2.3
						: 1.2,
			e.windup,
		);
	emit(g, "kingAttack", {
		x: e.x,
		z: e.z,
		id: e.id,
		attack,
		phase: e.bossPhase,
	});
}
function summon(g: Game, e: Enemy) {
 if(!e.boss&&advancedEnemyBlocked(g,e,'summon'))return;
	// Cap lingering summons, while each summon cast still creates exactly three.
	const living = g.enemies.filter((m) => m.summoned && !m.dead&&m.summonedBy===e.id);
	for (const old of living.slice(0, Math.max(0, living.length - 6))) {
		old.dead = true;
		old.rewarded = true;
		old.deathAge = 0;
		setMotion(old, "death");
	}
	const ids: number[] = [];
	for (let i = 0; i < 3; i++) {
		let x = e.x,
			z = e.z;
		for (let j = 0; j < 12; j++) {
			const a = (i / 3) * Math.PI * 2 + j * 0.27,
				tx = e.x + Math.cos(a) * 2.2,
				tz = e.z + Math.sin(a) * 2.2;
			if (walk(tx, tz)) {
				x = tx;
				z = tz;
				break;
			}
		}
		const minion = e.dataId === "king_jelly" ? undefined : (Object.values(FIELD_BOSS).find((r) => r.dataId === e.dataId)?.minion ?? undefined);
		const m = spawn(
			g,
			x,
			z,
			false,
			e.bossPhase === 2 ? (i % 2 ? "sky" : "mint") : "pink",
			true,
			minion,
		);
		if (minion) m.summoned = true;
		m.summonedBy=e.id;
		m.aggro = 30;
		ids.push(m.id);
	}
	emit(g, "summon", { x: e.x, z: e.z, id: e.id, minions: ids });
}
function kingStep(g: Game, e: Enemy, dt: number) {
	const p = enemyTarget(g,e),
		dx = p.x - e.x,
		dz = p.z - e.z,
		d = Math.hypot(dx, dz) || 1;
	if (d < 9) e.aggro = 10;
	if (!e.engaged && e.aggro > 0) {
		e.engaged = true;
		setMotion(e, "roar");
		face(e, p.x, p.z);
		return;
	}
	if (e.telegraph) {
		telegraphStep(g, e, dt);
		return;
	}
	const speed = e.bossPhase === 2 ? 1.3 : 1;
	if (["slam", "sweep", "charge", "spit", "summon"].includes(e.motion)) {
		const t = e.motionTime;
		e.windup = Math.max(0, e.windup - dt);
		if (e.motion === "slam") {
			if (t >= 0.55 && t < 0.85) {
				const k = Math.min(1, (t - 0.55) / 0.3);
				const x = e.startX + (e.aimX - e.startX) * k,
					z = e.startZ + (e.aimZ - e.startZ) * k;
				move(e, x - e.x, z - e.z);
			}
			if (t >= 0.85 && !e.attackApplied) {
				e.attackApplied = true;
				for (const victim of combatTargets(g))
					if (Math.hypot(victim.x - e.aimX, victim.z - e.aimZ) < 2.6)
						hurtCombatTarget(g,victim,0,e);
				emit(g, "slam", { x: e.aimX, z: e.aimZ, id: e.id });
			}
		}
		if (e.motion === "sweep" && t >= 0.7 && !e.attackApplied) {
			e.attackApplied = true;
			for (const victim of combatTargets(g))
				if (Math.hypot(victim.x - e.x, victim.z - e.z) < 3.5)
					hurtCombatTarget(g,victim,0,e);
			emit(g, "sweep", { x: e.x, z: e.z, id: e.id });
		}
		if (e.motion === "charge" && t >= 0.8 && t < 1.4) {
			moveEnemy(e, e.fx * 10 * dt * speed, e.fz * 10 * dt * speed);
			if (!e.attackApplied && Math.hypot(p.x - e.x, p.z - e.z) < 1.55) {
				e.attackApplied = true;
				hurtCombatTarget(g,p,0,e);
			}
		}
		if (e.motion === "spit" && t >= 0.8 && !e.attackApplied) {
			e.attackApplied = true;
			const a = Math.atan2(e.fz, e.fx);
			for (const delta of [-0.25, 0, 0.25])
				g.projectiles.push({
					id: g.nextId++,
					owner: e.id,
					attack: "spit",
					x: e.x + e.fx * 1.1,
					z: e.z + e.fz * 1.1,
					vx: Math.cos(a + delta) * 4.5 * speed,
					vz: Math.sin(a + delta) * 4.5 * speed,
					life: 2.5,
					damage: e.bossPhase === 2 ? 16 : 12,
					phase: e.bossPhase,
				});
			emit(g, "spit", { x: e.x, z: e.z, id: e.id });
		}
		if (e.motion === "summon" && t >= 0.9 && !e.attackApplied) {
			e.attackApplied = true;
			summon(g, e);
		}
		if (t >= e.motionDuration) {
			if (e.motion === "slam") {
				setMotion(e, "stun");
				emit(g, "stun", { x: e.x, z: e.z, id: e.id });
			} else {
				setMotion(e, "idle");
				e.cooldown = e.bossPhase === 2 ? 0.6 : 1.1;
			}
		}
		return;
	}
	if (["hit", "stun", "roar", "transform"].includes(e.motion)) {
		if (e.motionTime >= e.motionDuration) {
			const prior = e.motion;
			setMotion(e, "idle");
			e.cooldown =
				prior === "transform" ? 0.25 : prior === "stun" ? 0.45 : 0.25;
		}
		return;
	}
	if (e.aggro <= 0) {
		setMotion(e, "idle");
		return;
	}
	if (d > 6) {
		setMotion(e, "move");
		moveEnemy(e, (dx / d) * 1.5 * dt * speed, (dz / d) * 1.5 * dt * speed);
	} else {
		setMotion(e, "idle");
		if (e.cooldown <= 0 && !startTelegraph(g, e)) startKingAttack(g, e);
	}
}
/** The nest alternates locked web warnings and destructible egg sacs; summons never award loot. */
function thornMotherStep(g:Game,e:Enemy,dt:number){
 const p=enemyTarget(g,e),d=Math.hypot(p.x-e.x,p.z-e.z);
 if(d<7)e.aggro=10;
 if(e.telegraph){
  const t=e.telegraph;t.left-=dt;e.windup=Math.max(0,t.left);if(t.left>0)return;
  if(t.id==='thorn_web'){
   for(const victim of combatTargets(g))if(!victim.dead&&inTelegraph(t,victim.x,victim.z)){
    victim.statuses=victim.statuses.filter(s=>s.sourceId!=='thorn_web');
    applySlow(victim,'thorn_web',3,1);
    hurtCombatTarget(g,victim,0,e,t.id as MonsterMotion);
   }
  }else{
   const alive=g.enemies.filter(v=>v.summonedBy===e.id&&!v.dead).length;
   for(let i=0;i<Math.min(3,6-alive);i++){
    const a=i*Math.PI*2/3,x=e.x+Math.cos(a)*3,z=e.z+Math.sin(a)*3;if(!walk(x,z,.5))continue;
    const egg=spawn(g,x,z,false,'pink',true,'mist_weaver');egg.summonedBy=e.id;egg.nestEgg={hatch:5};egg.hp=egg.maxHp=45;egg.rewarded=true;egg.cooldown=5;
    emit(g,'warning',{id:egg.id,x,z,r:1,duration:5,name:'ทำลายถุงไข่ก่อนฟัก'});
   }
  }
  emit(g,'bossBlast',{id:e.id,x:t.x,z:t.z,r:t.radius,shape:t.shape,inner:t.inner,attack:t.id});
  e.telegraph=undefined;e.cooldown=3;return;
 }
 if(e.aggro<=0){setMotion(e,'idle');return;}
 if(e.motion==='attack'&&e.motionTime>=e.motionDuration)setMotion(e,'idle');
 if(e.cooldown<=0){e.sinceTelegraph=3;startTelegraph(g,e);const warning=e.telegraph as BossTelegraph|undefined;if(warning){setMotion(e,'attack');e.motionDuration=warning.left+.35;}}
}
/** Every few ordinary attacks (more often once enraged) the boss winds up one of its telegraphed skills. */
/** Temple guardian uses locked axe areas; impact and recovery share the authored attack clip. */
function greekMinotaurStep(g:Game,e:Enemy,dt:number){
 const p=enemyTarget(g,e),d=Math.hypot(p.x-e.x,p.z-e.z);
 if(e.hp<=e.maxHp*.5&&e.bossPhase===1){e.bossPhase=2;emit(g,'phase2',{id:e.id,x:e.x,z:e.z});}
 if(e.telegraph){const t=e.telegraph;t.left-=dt;e.windup=Math.max(0,t.left);if(t.left<=0){
  e.telegraph=undefined;for(const victim of combatTargets(g))if(!victim.dead&&inTelegraph(t,victim.x,victim.z))hurtCombatTarget(g,victim,0,e,t.id as MonsterMotion);
  emit(g,'bossBlast',{x:t.x,z:t.z,id:e.id,attack:t.id,shape:t.shape,r:t.radius,inner:t.inner,angle:t.angle,fx:t.fx,fz:t.fz});e.cooldown=e.bossPhase===2?1.8:2.6;
 }return;}
 if(e.motion==='attack'){if(e.motionTime>=e.motionDuration)setMotion(e,'idle');return;}
 if(d<10)e.aggro=Math.max(e.aggro,6);
 if(e.aggro<=0){setMotion(e,'idle');return;}
 if(d>4){setMotion(e,'hop');face(e,p.x,p.z);moveEnemy(e,e.fx*1.8*dt,e.fz*1.8*dt);return;}
 if(e.cooldown<=0){e.sinceTelegraph=3;startTelegraph(g,e);const t=e.telegraph as BossTelegraph|undefined;if(t){setMotion(e,'attack');e.motionDuration=t.left+.35;}}
}
function startTelegraph(g: Game, e: Enemy) {
	const list = g.data.monsters.monsters.find((m) => m.id === e.dataId)?.telegraphs;
	if (!list?.length) return false;
	if ((e.sinceTelegraph ?? 0) < (e.bossPhase === 2 ? 2 : 3)) {
		e.sinceTelegraph = (e.sinceTelegraph ?? 0) + 1;
		return false;
	}
	const spec = list[(e.telegraphIndex ?? 0) % list.length],
		p = g.p;
	e.telegraphIndex = (e.telegraphIndex ?? 0) + 1;
	e.sinceTelegraph = 0;
	face(e, p.x, p.z);
	const onTarget = spec.shape === "circle";
	e.telegraph = {
		id: spec.id,
		nameTh: spec.nameTh,
		shape: spec.shape,
		x: onTarget ? p.x : e.x,
		z: onTarget ? p.z : e.z,
		fx: e.fx,
		fz: e.fz,
		radius: spec.radius,
		inner: spec.inner ?? 0,
		angle: spec.angle ?? 0,
		left: spec.windup,
	};
	e.windup = spec.windup;
	setMotion(e, "roar");
	const t = e.telegraph;
 t.targets=[...g.players.values()].filter(p=>!p.dead&&inTelegraph(t,p.x,p.z)).map(p=>p.id);
	emit(g, "warning", { x: t.x, z: t.z, r: t.radius, duration: spec.windup, id: e.id, attack: t.id, shape: t.shape, inner: t.inner, angle: t.angle, fx: t.fx, fz: t.fz, name: t.nameTh });
	return true;
}
function telegraphStep(g: Game, e: Enemy, dt: number) {
	const t = e.telegraph!;
	t.left -= dt;
	e.windup = Math.max(0, t.left);
	if (t.left > 0) return;
	e.telegraph = undefined;
	for (const victim of combatTargets(g))if(!victim.dead){
  const inside=inTelegraph(t,victim.x,victim.z);
  if(!isSummonTarget(victim)&&t.targets?.includes(victim.id)&&(!inside||(victim.invulnerable>0&&victim.cd.dash>0)))lootEvadedWarning(victim,g);
  if(inside)hurtCombatTarget(g,victim,0,e,t.id as MonsterMotion);
 }
	emit(g, "bossBlast", { x: t.x, z: t.z, id: e.id, attack: t.id, shape: t.shape, r: t.radius, inner: t.inner, angle: t.angle, fx: t.fx, fz: t.fz });
	setMotion(e, "idle");
	e.cooldown = e.bossPhase === 2 ? 0.9 : 1.4;
}
function cancelTelegraph(g: Game, e: Enemy) {
	if (!e.telegraph) return;
	e.telegraph = undefined;
	emit(g, "warningCancel", { id: e.id });
}
const JELLY_BEHAVIOR = { ai: "melee" as const, speed: 2.2, aggroRange: 2.6, attackRange: 1.35, lunge: 5, cooldown: 1.5, windup: 0.5 };
/** Regular monsters: jelly defaults, or the monster's data-driven behavior (melee lunge or ranged caster). */
function slimeStep(g: Game, e: Enemy, dt: number) {
	const b = e.behavior ?? { ...JELLY_BEHAVIOR, speed: e.variant === "pink" ? 2 : 2.2 };
	const p = enemyTarget(g,e),
		dx = p.x - e.x,
		dz = p.z - e.z,
		d = Math.hypot(dx, dz) || 1;
	if (d < b.aggroRange&&!['jelly_pink','forest_young_1','ruins_young_1','canyon_young_1'].includes(e.dataId)) e.aggro = Math.max(e.aggro, 6);
	if(e.aggro>0&&!e.engaged&&['tile_sparrow','shade_wolf'].includes(e.dataId)){
	 e.engaged=true;const partner=g.enemies.find(v=>v.id!==e.id&&v.dataId===e.dataId&&!v.dead&&Math.hypot(v.x-e.x,v.z-e.z)<4);if(partner){partner.aggro=6;partner.engaged=true;}
	}
	if (e.motion === "attack") {
		e.windup = Math.max(0, b.windup - e.motionTime);
		if(e.dataId==='greek_gorgon'&&e.telegraph){
		 const t=e.telegraph;t.left=Math.max(0,b.windup-e.motionTime);
		 if(e.motionTime>=b.windup&&!e.attackApplied){e.attackApplied=true;for(const victim of combatTargets(g))if(!victim.dead&&!victim.god&&victim.invulnerable<=0&&inTelegraph(t,victim.x,victim.z)){hurtCombatTarget(g,victim,0,e,t.id as MonsterMotion);if(!victim.dead){victim.statuses=victim.statuses.filter(s=>s.sourceId!=='greek_gaze');applySlow(victim,'greek_gaze',3,.5);}}cancelTelegraph(g,e);}
		}
		if(e.dataId==='lotus_rabbit'&&e.motionTime<b.windup*.5)moveEnemy(e,-e.fx*dt*2,-e.fz*dt*2);
		if(e.dataId==='iron_pincer_crab'&&e.motionTime<b.windup&&d<2.6)displace(g,p,-dx/d*dt,-dz/d*dt);
		if(['oretail_lizard','forest_young_1'].includes(e.dataId)&&e.motionTime>=b.windup&&!e.attackApplied){
		 e.attackApplied=true;for(const victim of combatTargets(g))if(!victim.dead&&inTelegraph({shape:e.dataId==='oretail_lizard'?'cone':'circle',x:e.x,z:e.z,fx:e.fx,fz:e.fz,radius:1.9,inner:0,angle:180},victim.x,victim.z))hurtCombatTarget(g,victim,0,e);
		}
		if (b.ai === "ranged") {
			if (e.motionTime >= b.windup && !e.attackApplied) {
				e.attackApplied = true;
    if(advancedEnemyBlocked(g,e,'silence'))return;
				const spec = g.data.monsters.monsters.find((m) => m.id === e.dataId)!;
				const a = Math.atan2(p.z - e.z, p.x - e.x), v = b.projectileSpeed ?? 6;
				g.projectiles.push({ id: g.nextId++, owner: e.id, attack: "bolt", x: e.x + Math.cos(a) * 0.6, z: e.z + Math.sin(a) * 0.6, vx: Math.cos(a) * v, vz: Math.sin(a) * v, life: (b.attackRange + 1.5) / v, damage: Math.round(spec.matk * (0.85 + g.random() * 0.3)), phase: 1 });
				emit(g, "bolt", { x: e.x, z: e.z, id: e.id });
			}
		} else if (e.motionTime >= b.windup && e.motionTime < b.windup + 0.18) {
			moveEnemy(e, e.fx * b.lunge * dt, e.fz * b.lunge * dt);
			if (!e.attackApplied && Math.hypot(p.x - e.x, p.z - e.z) < b.attackRange + 0.35) {
				e.attackApplied = true;
				hurtCombatTarget(g,p,0,e);
				if(e.dataId==='mist_shroom'&&!p.dead){if(isSummonTarget(p))summonDot(p,'poison',3,4);else{p.lootEffects??={cooldowns:{},shield:0,shieldFor:0};p.lootEffects.venom={remaining:4,tick:0};}}
			}
		}
		if (e.motionTime >= e.motionDuration) {
			setMotion(e, "idle");
			e.cooldown = b.cooldown;
		}
		return;
	}
	if (e.aggro > 0) {
		if(e.cooldown>0&&d<5&&['tile_sparrow','dewdrop_moth','shade_wolf','greek_harpy'].includes(e.dataId)){
		 setMotion(e,'hop');const side=e.id%2?1:-1;
		 if(e.dataId==='tile_sparrow')moveEnemy(e,-dx/d*b.speed*dt,-dz/d*b.speed*dt);
		 else moveEnemy(e,-dz/d*b.speed*dt*side,dx/d*b.speed*dt*side);
		 return;
		}
		const ranged = b.ai === "ranged";
		if (e.cooldown <= 0 && d < b.attackRange && (!ranged || d >= (b.keepAway ?? 0) * 0.6)) {
			face(e, p.x, p.z);
			setMotion(e, "attack");
			e.windup = b.windup;
			if(e.dataId==='greek_gorgon'){e.telegraph={id:'greek_gaze',nameTh:'สายตาหินหยก',shape:'cone',x:e.x,z:e.z,fx:e.fx,fz:e.fz,radius:3.5,inner:0,angle:80,left:b.windup};emit(g,'warning',{x:e.x,z:e.z,r:3.5,duration:b.windup,id:e.id,attack:'greek_gaze',shape:'cone',angle:80,fx:e.fx,fz:e.fz,name:'สายตาหินหยก'});}
			else if (!ranged) warn(g, e, p.x, p.z, 0.9, b.windup);
		} else if (ranged && d < (b.keepAway ?? 0)) {
			setMotion(e, "hop");
			moveEnemy(e, (-dx / d) * b.speed * dt, (-dz / d) * b.speed * dt);
		} else if (d > (ranged ? b.attackRange * 0.9 : 1.0)) {
			setMotion(e, "hop");
			moveEnemy(e, (dx / d) * b.speed * dt, (dz / d) * b.speed * dt);
		} else setMotion(e, "idle");
	} else {
		e.wander -= dt;
		if (e.wander <= 0) {
			e.wander = 2 + g.random() * 3;
			e.wx = e.homeX + (g.random() - 0.5) * 3;
			e.wz = e.homeZ + (g.random() - 0.5) * 3;
		}
		const x = e.wx - e.x,
			z = e.wz - e.z,
			length = Math.hypot(x, z);
		if (length > 0.2) {
			setMotion(e, "hop");
			moveEnemy(e, (x / length) * 0.45 * dt, (z / length) * 0.45 * dt);
		} else setMotion(e, "idle");
	}
}
function playerStep(g: Game, dt: number, input: Vec) {
	const p = g.p;passiveTick(g);
	if(p.boxerCombo&&(p.dead||p.stats.weaponType!=='unarmed'||p.boxerCombo.until<=g.time))p.boxerCombo=undefined;
 if(p.statuses.some(s=>s.id==='spirit_intercept')&&(p.dead||masteryUseLock(p,'shaman_04',p.stats.weaponType,g.data.mastery)))p.statuses=p.statuses.filter(s=>s.id!=='spirit_intercept');
 if(p.statuses.some(s=>s.sourceId==='archer_04')&&(p.dead||masteryUseLock(p,'archer_04',p.stats.weaponType,g.data.mastery)))p.statuses=p.statuses.filter(s=>s.sourceId!=='archer_04');
 if(p.statuses.some(s=>s.id==='finisher_ready')&&(p.dead||p.stats.weaponType!=='unarmed'||masteryUseLock(p,'boxer_03',p.stats.weaponType,g.data.mastery)))p.statuses=p.statuses.filter(s=>s.id!=='finisher_ready');
	if(p.whirlwindHits?.length)p.whirlwindHits=p.whirlwindHits.filter(h=>!isMasteryAction(h.skillId??'')||(!p.dead&&!p.statuses.some(s=>s.id==='stun'||s.id==='knockup')&&!masteryUseLock(p,h.skillId!,p.stats.weaponType,g.data.mastery)));
 const burn=p.statuses.find(s=>s.id==='burn'&&s.remaining>0);
 if(burn){
  if(p.dead)p.statuses=p.statuses.filter(s=>s!==burn);
  else{burn.tick=(burn.tick??0)+Math.min(dt,burn.remaining);while(burn.tick>=1-1e-8&&!p.dead){burn.tick-=1;hurt(g,Math.max(1,Math.round(p.maxHp*burn.value)),undefined,undefined,'fire',false,true);}}
 }
	const venom=p.lootEffects?.venom;
	if(venom){if(p.dead)delete p.lootEffects!.venom;else{venom.remaining-=dt*(hasLootCard(p,'card_mist_shroom')?4/3:1);venom.tick+=dt;if(venom.tick>=1){venom.tick-=1;hurt(g,3);}if(venom.remaining<=0)delete p.lootEffects!.venom;}}
	tickPlayerLoot(g,p,dt);
 const bleed=p.lootEffects?.bleed;
 if(bleed){if(p.dead||bleed.map!==g.mapId)delete p.lootEffects!.bleed;else{bleed.tick+=Math.min(dt,bleed.remaining);bleed.remaining-=dt;while(bleed.tick>=1-1e-8&&!p.dead){bleed.tick-=1;hurt(g,Math.round(bleed.damage*(hasLootCard(p,'card_frost_ice_lindworm')?.9:1)),undefined,undefined,undefined,false,true);}if(bleed.remaining<=0||p.dead)delete p.lootEffects!.bleed;}}
 if(p.auto)p.autoSeconds+=dt;
	const statBuffs = () => p.statuses.filter((s) => s.id === "endure" || s.id === "rage").length;
	const hadBuffs = statBuffs();
	if(p.dead||p.statuses.some(s=>s.id==='stun'||s.id==='knockup')){
	 const before=g.meteors.length;g.meteors=g.meteors.filter(m=>m.ownerId!==p.id||!m.automatic&&!isMasteryAction(m.skillId??''));
	 if(g.meteors.length<before){p.castRemaining=0;emit(g,'skillCancel',{cause:'enemy'});}
	}
	tickEffects(p, dt);
	if (hadBuffs !== statBuffs()) refreshStats(g, p);
	p.castRemaining = p.castRemaining - dt < 1e-8 ? 0 : p.castRemaining - dt;
	for (const a of Object.keys(p.cd) as Action[])
		p.cd[a] = p.cd[a] - dt < 1e-8 ? 0 : p.cd[a] - dt;
	for (const a of ["attack", "comboWindow", "invulnerable", "hurt"] as const)
		p[a] = Math.max(0, p[a] - dt);
	if (!p.dead) {
 const canRegen=!p.inventory||inventoryWeight(p.inventory,g.data)<p.stats.weight*g.data.economy.regenWeightRatio;
 if(canRegen){
		p.mp = Math.min(p.maxMp, p.mp + dt * p.stats.spRegen);
				if (isField(g.mapId) && Math.hypot(p.x - campFor(g.mapId, p).x, p.z - campFor(g.mapId, p).z) < 2)
			restoreMasteryHp(p,dt * 20);
		else
			restoreMasteryHp(p,
					dt *
						p.stats.hpRegen *
						(g.time - p.lastCombat >= g.data.stats.regen.outOfCombatSeconds
							? 1
							: g.data.stats.regen.inCombatHpMultiplier),
			);
 }
		autoDrink(g);
		if (
			p.castRemaining > 0 ||
			p.statuses.some((s) => s.id === "stun" || s.id === "knockup")
		) {
			p.moving = false;
			return;
		}
		let ix = input.x,
			iz = input.z;
		if (Math.hypot(ix, iz) > 0.05) {
			setAuto(g, false);
			g.target = null;
			g.destination = null;
		}
		if (p.auto) {
			const direction = autoStep(g, dt);
			ix = direction.x;
			iz = direction.z;
		}
		const target = g.enemies.find((e) => e.id === g.target && !e.dead);
		if (!p.auto && target) {
			const dx = target.x - p.x,
				dz = target.z - p.z,
				d = Math.hypot(dx, dz);
			if (d > (target.boss ? 2 : 1.4)) {
				ix = dx / d;
				iz = dz / d;
			} else {
				ix = iz = 0;
				action(g, "attack");
			}
		} else if (!p.auto && g.destination) {
			const dx = g.destination.x - p.x,
				dz = g.destination.z - p.z,
				d = Math.hypot(dx, dz);
			if (d > 0.15) {
				ix = dx / d;
				iz = dz / d;
			} else g.destination = null;
		}
		if (p.dash > 0) {
			const t = Math.min(dt, p.dash);
			move(p, p.fx * 14 * t, p.fz * 14 * t);
			p.dash = Math.max(0, p.dash - dt);
			p.moving = true;
		} else {
			const d = Math.hypot(ix, iz);
			p.moving = d > 0.05;
			if (p.moving) {
				ix /= Math.max(1, d);
				iz /= Math.max(1, d);
				p.fx = ix;
				p.fz = iz;
				const speed =
					(p.auto && p.autoState === "idle" ? 1.8 : p.attack > 0 ? 1.6 : 4.5) *
					p.stats.moveSpeed * lootMovementMultiplier(p) * (p.gmSpeed ?? 1) * (1+Math.max(consumableBuffValue(p,'speed',g.wallTime||Date.now())??0,...p.statuses.filter(s=>s.id==='speed').map(s=>s.value))) *
					slowMovementMultiplier(p);
				const from={x:p.x,z:p.z};move(p, ix * speed * dt, iz * speed * dt);passiveWalk(g,from);
			}
		}
	}
}
export function step(
	g: Game,
	dt: number,
	input: Vec = { x: 0, z: 0 },
	inputs?: Map<string, Vec>,
) {
		g.time += dt;
 g.smokeFields=activeSmokeFields(g);
	activeMap = g.mapId;
	const previous = g.p;
	for (const p of g.players.values()) {
		g.p = p;
  advanceAdvancedMastery(g,dt,inputs?.get(p.id)??(p===previous?input:{x:0,z:0}),masteryHooks(g));
                if(p.dead||!isField(g.mapId))p.whirlwindHits=[];
        const due=(p.whirlwindHits??[]).filter(h=>h.due<=g.time+1e-9);p.whirlwindHits=(p.whirlwindHits??[]).filter(h=>h.due>g.time+1e-9);
        for(const h of due){
         const enemy=g.enemies.find(e=>e.id===h.id&&!e.dead),id=h.skillId??'whirlwind';
         if(!enemy)continue;
         const skill=resolveSkill(g.data,id,h.level??(p.skills[id]||1));
         if(isMasteryAction(id)&&(masteryUseLock(p,id,p.stats.weaponType,g.data.mastery)||p.statuses.some(s=>s.id==='stun'||s.id==='knockup')||Math.hypot(enemy.x-p.x,enemy.z-p.z)>skill.range+(enemy.boss?.5:0)))continue;
         hit(g,enemy,skill,false,h);
        }
        if(p.dead||!isField(g.mapId))p.landings=[];
        const landed=(p.landings??[]).filter(l=>l.due<=g.time+1e-9);p.landings=(p.landings??[]).filter(l=>l.due>g.time+1e-9);
        for(const l of landed)land(g,l);
		playerStep(
			g,
			dt,
			inputs?.get(p.id) || (p === previous ? input : { x: 0, z: 0 }),
		);
		stepSummon(g,p,dt,{path:route,move,hit:(pet,e)=>summonStrike(g,pet,e),hurt:(pet,n)=>hurtCombatTarget(g,pet,n,undefined,undefined,undefined,false,true)});
  stepWisp(g,p,(w,e)=>wispStrike(g,w,e));stepMasteryHeal(g,p);
  if(isField(g.mapId))stepAutomaticMastery(g,(id,target)=>{const old=p.target;if(target!==undefined)p.target=target;try{return castMasteryAction(g,id,undefined,true);}finally{p.target=old;}});
	}
	if(g.mapId === "city_plaza"){g.p=previous;return;}
	for (const e of [...g.enemies]) {
		tickEnemyLoot(g,e,dt,(owner,damage,element)=>damageOverTime(g,e,owner,damage,element,element==='fire'?'item_burn':element==='wind'?'item_chain':'item_poison'));
  if(e.masteryPoisons){
  for(const poison of e.masteryPoisons){
   const owner=g.players.get(poison.owner);
   if(e.dead||!owner||owner.dead||owner.mapId!==g.mapId||masteryUseLock(owner,poison.skillId??'rogue_02',owner.stats.weaponType,g.data.mastery)){poison.remaining=0;continue;}
   poison.tick+=Math.min(dt,poison.remaining);poison.remaining-=dt;
   while(poison.tick>=1-1e-8&&poison.ticks>0&&!e.dead){
    // The last tick receives the integer rounding remainder of the accepted total.
    poison.tick-=1;const damage=Math.floor(poison.damage/poison.ticks);poison.damage-=damage;poison.ticks--;
    damageOverTime(g,e,owner,damage,'poison',poison.skillId??'rogue_02');
   }
  }
  e.masteryPoisons=(e.masteryPoisons??[]).filter(s=>!e.dead&&s.remaining>1e-8&&s.ticks>0);
  }
		tickEffects(e, dt);
		const nearest = enemyTargetPlayer(g,e);
		if (nearest) g.p = nearest;
		const p = g.p;
		e.hurt = Math.max(0, e.hurt - dt);
		e.cooldown = Math.max(0, e.cooldown - dt);
		e.aggro = Math.max(0, e.aggro - dt);
		e.vx = e.vz = 0;
		e.moving = false;
		if (e.dead) {
			e.deathAge += dt;
			e.motionTime = e.deathAge;
			e.respawn -= dt;
			if (e.deathAge >= duration(e, "death")) reward(g, e);
			if (e.respawn <= 0 && !e.summoned && !e.gm) {
				e.dead = false;
				clearMasteryEncounter(g,e);e.hp = e.maxHp;
				e.x = e.homeX;
				e.z = e.homeZ;
				e.aggro = 0;
				e.windup = 0;
				e.rewarded = false;
				e.deathAge = 0;
								e.damageBy = {};e.damageLevels={};e.masteryDamage=undefined;e.bossPhase=1;e.engaged=false;e.himmapan=undefined;e.desert=undefined;e.frost=undefined;e.yokai=undefined;e.endgame=undefined;e.rewardSource=undefined;e.controlImmuneUntil=undefined;
				setMotion(e, "idle");
				if (e.boss) emit(g, "boss");
			}
			continue;
		}
        if(e.boss&&Object.keys(e.damageBy).length&&(g.time-(e.lastEngagedAt??g.time)>=30||!Object.keys(e.damageBy).some(id=>{const p=g.players.get(id);return p&&!p.dead;}))){for(const child of g.enemies)if(child.summonedBy===e.id&&!child.dead){child.dead=true;child.rewarded=true;child.deathAge=0;setMotion(child,'death');}clearMasteryEncounter(g,e);e.hp=e.maxHp;e.damageBy={};e.damageLevels={};e.masteryDamage=undefined;e.engaged=false;e.bossPhase=1;e.himmapan=undefined;e.desert=undefined;e.frost=undefined;e.yokai=undefined;e.endgame=undefined;e.rewardSource=undefined;e.controlImmuneUntil=undefined;e.patternIndex=0;e.statuses=[];cancelTelegraph(g,e);e.x=e.homeX;e.z=e.homeZ;setMotion(e,'idle');}
		if (!nearest) {
			e.windup = 0;
			cancelTelegraph(g, e);
			setMotion(e, "idle");
			continue;
		}
		const x = e.x,
			z = e.z;
		e.motionTime +=
			dt * (e.boss && !isEndgameEnemy(e.dataId) && !['thorn_nest_mother','greek_minotaur','himmapan_08','desert_08','frost_08','yokai_08'].includes(e.dataId) && e.bossPhase === 2 && e.motion !== "transform" ? 1.3 : 1);
		if (e.statuses.some((s) => s.id === "stun" || s.id === "knockup" || s.id === "freeze")) continue;
  const currentVictim=enemyTarget(g,e);if(!e.boss&&!isSummonTarget(currentVictim)&&advancedPlayerHidden(g,currentVictim)&&e.motion!=='attack'){setMotion(e,'idle');continue;}
		const hooks={motion:setMotion,move,hurt:(p:CombatTarget,enemy:Enemy,attack?:string)=>hurtCombatTarget(g,p,0,enemy,attack as MonsterMotion)};
        const handledRegion=himmapanStep(g,e,dt,hooks)||desertStep(g,e,dt,{...hooks,spawn:(x,z,id,parent)=>{const child=spawn(g,x,z,false,'pink',true,id);child.summonedBy=parent;return child;}})||frostStep(g,e,dt,hooks)||yokaiStep(g,e,dt,{...hooks,movePlayer:(p,x,z)=>displace(g,p,x,z),spawn:(x,z,id,parent)=>{const child=spawn(g,x,z,false,'pink',true,id);child.summonedBy=parent;return child;}})||endgameStep(g,e,dt,{...hooks,movePlayer:(p,x,z)=>displace(g,p,x,z),spawn:(x,z,id,parent)=>{const child=spawn(g,x,z,false,'pink',true,id);child.summonedBy=parent;return child;}});
        if(!handledRegion){
        if(e.dataId==='thorn_nest_mother')thornMotherStep(g,e,dt);
		else if(e.dataId==='greek_minotaur')greekMinotaurStep(g,e,dt);
		else if(e.nestEgg){e.nestEgg.hatch-=dt;if(e.nestEgg.hatch<=0){delete e.nestEgg;e.aggro=10;}}
		else if (e.boss) kingStep(g, e, dt);
		else slimeStep(g, e, dt);
        }
		e.vx = (e.x - x) / dt;
		e.vz = (e.z - z) / dt;
		e.moving = Math.hypot(e.vx, e.vz) > 0.01;
		if (e.moving) {
			const v = Math.hypot(e.vx, e.vz);
			e.fx = e.vx / v;
			e.fz = e.vz / v;
		}
	}
	for (let i = g.projectiles.length - 1; i >= 0; i--) {
		const projectile = g.projectiles[i];
		projectile.life -= dt;
		projectile.x += projectile.vx * dt;
		projectile.z += projectile.vz * dt;
		for (const p of combatTargets(g))
			if (
				!p.dead &&
				Math.hypot(p.x - projectile.x, p.z - projectile.z) < 0.55
			) {
				if(!isSummonTarget(p))g.p=p;
				if (projectile.attack === "bolt") {
				 const owner=g.enemies.find(e=>e.id===projectile.owner);
                 hurtCombatTarget(g,p, Math.max(1, Math.round(projectile.damage * (1 - Math.min(0.5, (isSummonTarget(p)?0:(p.stats.softMdef ?? 0)) / 200)))),undefined,undefined,owner?g.data.monsters.monsters.find(m=>m.id===owner.dataId)?.element:undefined,true,false,owner,true);
                 if(owner?.dataId==='mist_weaver'&&!p.dead){p.statuses=p.statuses.filter(s=>s.sourceId!=='thorn_web');applySlow(p,'thorn_web',1.5,1);}
				}
				else hurtCombatTarget(
					g,p,
					projectile.damage,
					g.enemies.find((e) => e.id === projectile.owner),
					projectile.attack as MonsterMotion,
				);
				projectile.life = 0;
				break;
			}
		if (projectile.life <= 0 || !walk(projectile.x, projectile.z, 0.05))
			g.projectiles.splice(i, 1);
	}
	for (let i = g.meteors.length - 1; i >= 0; i--) {
		const m = g.meteors[i];
		m.time -= dt;
		if (m.time <= 1e-8) {
			const owner = g.players.get(m.ownerId);
			if (owner) {
				g.p = owner;
				if (owner.dead) {
					g.meteors.splice(i, 1);
					continue;
				}
    if(isMasteryAction(m.skillId??'')||m.automatic){if(m.automatic)withMasteryOrigin(g,'autoSpell',()=>finishMasteryAction(g,m));else finishMasteryAction(g,m);g.meteors.splice(i,1);continue;}
                const skill = resolveSkill(g.data, m.skillId || "meteor", m.level || 1);
                const targets = g.enemies.filter(e => !e.dead && (skill.kind === "single"
                    ? e.id === m.targetId && Math.hypot(e.x - owner.x, e.z - owner.z) <= skill.range + (e.boss ? .5 : 0)
                    : Math.hypot(e.x - m.x, e.z - m.z) < skill.radius));
                const impact = skill.kind === "single" && targets[0] ? targets[0] : m;
                emit(g, "skillImpact", {x: impact.x, z: impact.z, skillId: skill.id, visual: skill.visual});
                for (const e of targets) hit(g, e, skill);
			}
			g.meteors.splice(i, 1);
		}
	}
 for (const d of [...g.drops]) {
  d.time+=dt;if(d.time>=60&&!d.pending){g.drops=g.drops.filter(v=>v!==d);continue;}if(d.pending||d.blocked)continue;
  const candidates=[...g.players.values()].filter(p=>!p.dead&&(!d.boss||g.wallTime>=bossReadyAt(p,d.bossId??'king_jelly'))&&(p.id===d.ownerId||d.time>=g.data.economy.lootOwnershipSeconds)&&(!p.auto||p.id===d.ownerId)&&(!p.auto||p.inventory?.autoPickup!==false)).sort((a,b)=>Math.hypot(a.x-d.x,a.z-d.z)-Math.hypot(b.x-d.x,b.z-d.z));
  const p=candidates[0];if(!p)continue;g.p=p;
  const dx=p.x-d.x,dz=p.z-d.z,dist=Math.hypot(dx,dz);
  if(dist<4&&d.time>.25){const speed=Math.min(dist,dt*9);d.x+=dx/(dist||1)*speed;d.z+=dz/(dist||1)*speed;}
  if(dist<.45){
   const done=()=>{const before=g.p;
								for (const share of expShares(g, p, d.xp, d.jobExp || 0, d.source))
					grantExp(g, share.player, share.xp, share.jobExp, { gold: share.player === p ? d.gold : 0, shared: share.shared });
				g.p = p;
        if(d.boss)setBossCooldown(p,d.bossId??'king_jelly',g.wallTime+600000);g.drops=g.drops.filter(drop=>drop!==d);g.p=before;
   };
   if(g.inventoryCommit){
    if(d.blocked)continue;
    d.pending=true;g.inventoryCommit(p,{op:'pickup',id:String(d.id),gold:d.gold,loot:d.loot??[]},done);
   }else if(p.inventory){try{const out=applyInventory({gold:p.gold,boundGold:p.boundGold,inventory:p.inventory},{op:'pickup',gold:d.gold,loot:d.loot??[]},p.profile,g.data,()=>String(g.nextId++));p.gold=out.state.gold;p.inventory=out.state.inventory;refreshStats(g,p);done();}catch{d.noticeAt=g.time;d.blocked=true;}}
   else{p.gold+=d.gold;done();}
  }
 }

	for(const p of g.players.values())if(p.dead)p.reviveRemaining=Math.max(0,(p.reviveRemaining??0)-dt);
	g.p = previous;
	g.enemies = g.enemies.filter((e) => !(e.summoned || e.gm) || !e.dead || e.deathAge < 3);
}

/** Wall-clock cooldown survives room changes, reconnects and server restarts. */
export function healerHeal(g: Game, now: number) {
 const p=g.p;
 if(g.mapId!=='city_plaza'||p.dead||Math.hypot(p.x-HEALER.x,p.z-HEALER.z)>3) return false;
 if(now<p.healerReadyAt){emit(g,'notice',{text:`พักก่อน อีก ${Math.ceil((p.healerReadyAt-now)/1000)} วินาที`});return false;}
 const amount=p.maxHp-p.hp;clearMasteryWounds(p);p.hp=p.maxHp;p.mp=p.maxMp;p.healerReadyAt=now+60000;
 emit(g,'heal',{amount});emit(g,'notice',{text:'ฟื้น HP / SP เต็มแล้ว'});return true;
}
