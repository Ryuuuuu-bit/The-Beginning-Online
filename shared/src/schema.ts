import { z } from "zod";
import { MasteryCatalogSchema,MasteryLevelsSchema } from "./mastery.js";
export const StatSchema = z.enum(["str", "agi", "vit", "int", "dex", "luk"]);
export const ElementSchema = z.enum([
	"neutral",
	"fire",
	"water",
	"wind",
	"earth",
	"holy",
	"dark",
	"ghost",
]);
export const SizeSchema = z.enum(["small", "medium", "large"]);
export const WeaponSchema = z.enum([
	"dagger",
	"mace",
	"sword1h",
	"sword2h",
	"axe",
	"spear",
	"bow",
	"staff",
	"unarmed",
]);
export const MonsterRaceSchema = z.enum([
	"formless",
	"undead",
	"brute",
	"plant",
	"insect",
	"fish",
	"demon",
	"demihuman",
	"angel",
	"dragon",
]);
export const RealmSchema = z.enum([
	"deva",
	"manussa",
	"asura",
	"preta",
	"ghost",
	"house_spirit",
	"naga",
	"water_spirit",
	"forest_spirit",
	"mythic_beast",
	"sage",
	"naraka",
]);
export const StatusIdSchema = z.enum([
	"stun",
	"slow",
	"poison",
	"burn",
	"freeze",
	"silence",
	"blind",
	"sleep",
	"curse",
	"fear",
]);
const number = z.number().finite(),
	positive = number.positive(),
	nonnegative = number.nonnegative(),
	fraction = number.min(0).max(1);
const id = z.string().min(1),
	version = { dataVersion: z.literal(1) };
export const BaseStatsSchema = z.record(StatSchema, number);
const statDelta = z.partialRecord(StatSchema, number);
export const DerivedKeySchema = z.enum([
	"maxHp",
	"maxSp",
	"atk",
	"matk",
	"hardDef",
	"hardMdef",
	"softDef",
	"softMdef",
	"hit",
	"flee",
	"crit",
	"critShield",
	"aspd",
	"castMul",
	"moveSpeed",
	"weight",
	"hpRegen",
	"spRegen",
]);
export const ModifierSchema = z.discriminatedUnion("kind", [
	z
		.object({ kind: z.literal("stat"), stat: StatSchema, value: number })
		.strict(),
	z
		.object({
			kind: z.enum(["flat", "percent"]),
			stat: DerivedKeySchema,
			value: number,
		})
		.strict(),
	z
		.object({
			kind: z.enum(["raceBonus", "raceResist"]),
			target: MonsterRaceSchema,
			value: number,
		})
		.strict(),
	z
		.object({
			kind: z.enum(["elementBonus", "elementResist"]),
			target: ElementSchema,
			value: number,
		})
		.strict(),
	z
		.object({ kind: z.literal("sizeBonus"), target: SizeSchema, value: number })
		.strict(),
	z
		.object({
			kind: z.literal("statusResist"),
			target: StatusIdSchema,
			value: number,
		})
		.strict(),
	z
		.object({
			kind: z.enum(["armourElement", "weaponElement"]),
			element: ElementSchema,
		})
		.strict(),
	z.object({ kind: z.literal("ignoreSize"), value: z.boolean() }).strict(),
]);
export const CharacterSchema = z
	.object({
		race: id,
		classId: id,
		level: z.number().int().min(1).max(100),
		baseStats: BaseStatsSchema,
		equipment: z.array(id),
		/** Internal equipment projection; inventoryProfile overwrites it from the worn weapon. */
		weaponRefine: z.number().int().min(0).max(15).optional(),
		cards: z.array(id).default([]),
		modifiers: z.array(ModifierSchema).default([]),
		starterGrant: z.boolean().default(false),
		skills: z.record(z.string(), z.number().int().min(0).max(10)).default({}),
        masteries:MasteryLevelsSchema.optional(),
	})
	.strict();
export const StatsSchema = z
	.object({
		...version,
		baseStats: z.array(StatSchema).length(6),
		start: z.literal(1),
		pointsPerLevel: z.literal(3),
		maxStat: z.literal(99),
		maxLevel: z.literal(100),
		statResetFree: z.boolean(),
		regen: z
			.object({
				spBase: nonnegative,
				spInt: nonnegative,
				spMax: nonnegative,
				hpBase: nonnegative,
				hpVit: nonnegative,
				hpMax: nonnegative,
				outOfCombatSeconds: nonnegative,
				inCombatHpMultiplier: fraction,
				sittingMultiplier: positive,
			})
			.strict(),
		pointCosts: z
			.array(
				z
					.object({
						min: positive.int(),
						max: positive.int(),
						cost: positive.int(),
					})
					.strict(),
			)
			.length(10),
		expToNext: z.array(positive.int()).length(100),
		caps: z
			.object({
				maxDefReduction: fraction,
				maxCrit: fraction,
				hitChance: z.tuple([fraction, fraction]),
				pvpMinHit: fraction,
				maxCastReduction: fraction,
				maxMoveSpeed: positive,
				maxResist: fraction,
				maxElementResist: fraction,
				maxDamageReductionTotal: fraction,
				maxBonusPerCategory: nonnegative,
			})
			.strict(),
		defaultBuild: CharacterSchema,
	})
	.strict();
export const ElementsSchema = z
	.object({
		...version,
		names: z.record(ElementSchema, id),
		table: z.record(
			ElementSchema,
			z.record(ElementSchema, number.min(50).max(150)),
		),
	})
	.strict();
export const RacesSchema = z
	.object({
		...version,
		players: z
			.array(
				z
					.object({
						id,
						nameTh: id,
						bonus: statDelta,
						element: ElementSchema,
						size: SizeSchema,
						monsterRace: z.literal("demihuman"),
						passives: z
							.object({
								exp: fraction.optional(),
								weight: nonnegative.optional(),
								stunResist: fraction.optional(),
								spRegen: fraction.optional(),
								noShallowSlow: z.boolean().optional(),
								moveSpeed: number.optional(),
								drop: fraction.optional(),
								critShield: fraction.optional(),
								darkDamage: fraction.optional(),
								healReceived: number.optional(),
							})
							.strict(),
					})
					.strict(),
			)
			.length(6),
		monsterRaces: z.record(MonsterRaceSchema, id),
		realms: z.record(RealmSchema, id),
		sizeTable: z.record(
			WeaponSchema,
			z.record(SizeSchema, number.min(75).max(100)),
		),
	})
	.strict();
export const ClassesSchema = z
	.object({
		...version,
		classes: z
			.array(
				z
					.object({
						id,
						nameTh: id,
						hpMul: positive,
						spMul: positive,
						weapons: z.array(WeaponSchema).min(1),
						preset: BaseStatsSchema,
					})
					.strict(),
			)
			.min(1),
	})
	.strict();
export const SkillSchema = z
	.object({
		id,
		jobId: id,
		maxLevel: positive.int().max(10),
		requires: z.array(z.object({ id, level: positive.int().max(10) }).strict()),
		passive: z.boolean(),
		values: z.record(z.string(), z.array(nonnegative)).default({}),
		hits: positive.int().max(10).default(1),
		/** seconds between staged hits of a multi-hit skill (rolled at cast, landed one by one) */
		hitInterval: positive.optional(),
		/** leap skills: the strike resolves on landing after `delay` seconds, on enemies within `radius` */
		landing: z.object({ delay: positive, radius: positive }).strict().optional(),
		effect: z.enum(["dash", "knockup", "taunt", "endure", "heal", "stun", "guard", "rage", "slow"]).optional(),
		/** Job 1 skill whose motion, VFX and sound this skill borrows until it has its own art. */
		visual: id.optional(),
		duration: nonnegative.optional(),
		pvpDurationMul: fraction.optional(),
		pvpEffect: z
			.object({ id: z.literal("slow"), duration: positive, value: fraction })
			.strict()
			.optional(),
		nameTh: id,
		percent: nonnegative,
		comboThirdPercent: nonnegative.optional(),
		element: z.union([ElementSchema, z.literal("weapon")]),
		type: z.enum(["physical", "magic", "heal"]),
		kind: z.enum(["basic", "single", "area", "dot", "utility"]),
		sp: nonnegative,
		cooldown: nonnegative,
		cast: nonnegative,
		range: nonnegative,
		radius: nonnegative,
		status: z
			.object({ id: StatusIdSchema, chance: fraction })
			.strict()
			.optional(),
		pvpMul: fraction.optional(),
		ignoreSize: z.boolean().optional(),
		icon: z.number().int().min(0).max(23),
		heal: z
			.object({ flat: nonnegative, vitPercent: nonnegative })
			.strict()
			.optional(),
	})
	.strict();
export const SkillsSchema = z
	.object({ ...version, skills: z.array(SkillSchema).min(1) })
	.strict();
export const MonsterSchema = z
	.object({
		id,
		nameTh: id,
		artId: id.optional(),
		visualScale: positive.max(1).optional(),
		level: positive.int().max(100),
		hp: positive,
		sp: nonnegative,
		atk: nonnegative,
		matk: nonnegative,
		hardDef: nonnegative,
		softDef: nonnegative,
		hardMdef: nonnegative,
		softMdef: nonnegative,
		hit: nonnegative,
		flee: nonnegative,
		element: ElementSchema,
		race: MonsterRaceSchema,
		size: SizeSchema,
		realm: RealmSchema,
		tags: z.array(id),
		weakness: z.array(ElementSchema),
		boss: z.boolean(),
		skills: z.array(id),
		exp: nonnegative,
		jobExp: nonnegative,
		gold: z
			.tuple([nonnegative, nonnegative])
			.refine(([a, b]) => a <= b, "minimum exceeds maximum"),
		drops: z.array(z.object({ item: id, rate: fraction, min: positive.int(), max: positive.int() }).strict().refine(d=>d.max>=d.min,"minimum exceeds maximum")),
		attacks: z
			.record(
				z.enum(["slam", "sweep", "charge", "spit"]),
				z.object({ percent: nonnegative, phase2Percent: nonnegative }).strict(),
			)
			.optional(),
		/** Telegraphed boss skills: a long, readable windup over an area locked when the warning starts. */
		telegraphs: z
			.array(
				z
					.object({
						id: z.string().regex(/^[a-z_]{1,40}$/),
						nameTh: z.string().min(1).max(40),
						shape: z.enum(["circle", "ring", "cone"]),
						/** circle: on the target's spot; ring and cone: around / from the boss. */
						windup: positive.max(4),
						radius: positive.max(12),
						inner: nonnegative.optional(),
						/** Cone opening in degrees. */
						angle: positive.max(360).optional(),
						percent: nonnegative,
						phase2Percent: nonnegative,
					})
					.strict()
					.refine((t) => t.shape !== "ring" || (t.inner ?? 0) < t.radius, "ring inner must be inside radius")
					.refine((t) => t.shape !== "cone" || t.angle !== undefined, "cone needs an angle"),
			)
			.max(4)
			.optional(),
		phase2: z
			.object({ atk: nonnegative, element: ElementSchema })
			.strict()
			.optional(),
		/** AI tuning; jellies keep their built-in defaults when omitted. */
		behavior: z
			.object({
				ai: z.enum(["melee", "ranged"]),
				speed: positive,
				aggroRange: positive,
				attackRange: positive,
				lunge: nonnegative,
				cooldown: positive,
				windup: positive,
				/** Ranged: preferred distance and projectile speed. */
				keepAway: nonnegative.optional(),
				projectileSpeed: positive.optional(),
			})
			.strict()
			.optional(),
	})
	.strict();
export const MonstersSchema = z
	.object({ ...version, monsters: z.array(MonsterSchema).min(1) })
	.strict();
export const StatusSchema = z
	.object({
		...version,
		statuses: z
			.array(
				z
					.object({
						id: StatusIdSchema,
						seconds: positive,
						resist: z.partialRecord(
							z.union([StatSchema, ElementSchema]),
							nonnegative,
						),
						effects: z
							.object({
								noMove: z.boolean().optional(),
								noSkill: z.boolean().optional(),
								moveSpeed: number.optional(),
								aspd: number.optional(),
								hpPerSecond: number.optional(),
								hardDef: number.optional(),
								fireResist: number.optional(),
								fireTaken: positive.optional(),
								waterTaken: positive.optional(),
								hit: number.optional(),
								wakeOnHit: z.boolean().optional(),
								firstHit: positive.optional(),
								atk: number.optional(),
								matk: number.optional(),
								critShield: nonnegative.optional(),
								randomFlee: z.boolean().optional(),
								ghostOnly: z.boolean().optional(),
							})
							.strict(),
					})
					.strict(),
			)
			.length(10),
		bossImmune: z.array(StatusIdSchema),
		stacking: z.literal("refresh"),
	})
	.strict();
export const PvpSchema = z
	.object({
		...version,
		kind: z.record(
			z.enum(["basic", "single", "area", "dot", "utility"]),
			fraction,
		),
		modes: z.record(
			z.enum(["duel", "freepk", "arena", "gvg"]),
			z
				.object({
					reduction: fraction,
					potions: z.boolean(),
					equalizeLevel: positive.int().nullable(),
					gear: z.enum(["standard", "equipped"]),
					minLevel: positive.int(),
				})
				.strict(),
		),
		cc: z
			.object({ window: positive, multipliers: z.array(fraction).length(4) })
			.strict(),
		heal: z.object({ window: positive, reduction: fraction }).strict(),
		potionCooldownMul: positive,
		honor: z
			.object({
				winMin: nonnegative,
				winMax: nonnegative,
				loss: number,
				repeatVictimWindow: positive,
				repeatVictimReward: z.literal(0),
				winRule: z.literal("levelGap"),
			})
			.strict(),
		karma: z
			.object({
				redNameSecondsPerKill: positive,
				redDeathItemDrops: nonnegative.int(),
				mode: z.literal("freepk"),
				requiresNonRetaliating: z.literal(true),
			})
			.strict(),
	})
	.strict();
export const ItemsSchema = z
	.object({
		...version,
		items: z
			.array(
				z
					.object({
						id,
						nameTh: id,
						type: z.enum(["weapon", "armour", "shield", "garment", "footgear", "accessory", "consumable", "material", "refine", "card"]),
                        slot: z.enum(["weapon","body","shield","garment","footgear","accessory1","accessory2"]).nullable(),
                        weight: nonnegative, npcPrice: nonnegative.int(), rarity: z.enum(["common","fine","rare","epic","legendary"]),
                        stackable: z.boolean(), maxStack: positive.int(), bind: z.enum(["none","equip","account"]), icon: id,
                        effect: z.enum(["hp","sp","speed","party_hp","party_cleanse","arcane","boost_exp","boost_drop"]).optional(), amount: nonnegative.optional(), duration: positive.int().min(3600).optional(), arcaneElement:ElementSchema.optional(),
						weaponType: WeaponSchema.optional(),
						level: positive.int(),
						atk: nonnegative.optional(),
						matk: nonnegative.optional(),
						interval: positive.optional(),
						slots: nonnegative.int(),
						modifiers: z.array(ModifierSchema),
					})
					.strict(),
			)
			.min(1),
	})
	.strict();
export const CardsSchema = z
	.object({
		...version,
		cards: z
			.array(
				z
					.object({
						id,
						/** Equipment type the card fits (item `type`). */
						slot: z.enum(["weapon", "armour", "shield", "garment", "footgear", "accessory"]),
						modifiers: z.array(ModifierSchema),
					})
					.strict(),
			)
			.min(1),
	})
	.strict();
export const JobsSchema = z
	.object({
		...version,
		jobs: z.array(
			z
				.object({
					id,
					nameTh: id,
					tier: z.number().int().min(0).max(2),
					maxLevel: positive.int().max(70),
					parent: id.nullable(),
					available: z.boolean(),
				})
				.strict(),
		),
		angel: z.object({ x: number, z: number, range: positive }).strict(),
		expToNext: z
			.object({
				tier1: z.array(positive).length(49),
				tier2: z.array(positive).length(69),
			})
			.strict(),
	})
	.strict();
export const EconomySchema = z.object({ dataVersion:z.literal(1), sellMultiplier:fraction, inventorySlots:positive.int(), regenWeightRatio:fraction, attackWeightRatio:fraction, lootOwnershipSeconds:nonnegative, dropMultiplier:nonnegative, cardDropMultiplier:nonnegative.default(1), autoRareAfterSeconds:nonnegative, autoRareMultiplier:fraction, storageSlots:positive.int(), /** Forge socketing: price of one card slot by equipment level (highest maxLevel last). */ socketing:z.array(z.object({maxLevel:positive.int(),gold:positive.int(),material:z.string(),qty:positive.int()}).strict()).min(1), deathPenalty:z.object({minLevel:positive.int(),percent:fraction}).strict(), shops:z.record(z.string(),z.record(z.string(),nonnegative.int())) }).strict();
const QuestObjectiveSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("kill"), monsters: z.array(z.string()).min(1), count: positive.int(), label: z.string() }).strict(),
	z.object({ kind: z.literal("collect"), item: z.string(), count: positive.int(), label: z.string() }).strict(),
	z.object({ kind: z.literal("store"), count: positive.int(), label: z.string() }).strict(),
]);
export const QuestsSchema = z.object({
	dataVersion: z.literal(1),
	maxActive: positive.int(),
	shareRange: positive,
	quests: z.array(z.object({
		id: z.string().regex(/^[a-z_]+$/),
		nameTh: z.string(),
		giver: z.enum(["guard", "forge", "market", "heal", "storage"]),
		level: positive.int(),
		requires: z.array(z.string()),
		repeatHours: positive.optional(),
		offer: z.string(),
		complete: z.string(),
		objectives: z.array(QuestObjectiveSchema).min(1),
		rewards: z.object({ exp: nonnegative.int(), jobExp: nonnegative.int(), gold: nonnegative.int(), items: z.array(z.object({ template: z.string(), qty: positive.int() }).strict()) }).strict(),
	}).strict()),
}).strict();
export const schemas = { economy: EconomySchema, quests: QuestsSchema,
	jobs: JobsSchema,
	stats: StatsSchema,
	elements: ElementsSchema,
	races: RacesSchema,
	classes: ClassesSchema,
	skills: SkillsSchema,
	mastery: MasteryCatalogSchema,
	monsters: MonstersSchema,
	status: StatusSchema,
	pvp: PvpSchema,
	items: ItemsSchema,
	cards: CardsSchema,
};
export type GameData = {
	[K in keyof typeof schemas]: z.infer<(typeof schemas)[K]>;
};
export type Stat = z.infer<typeof StatSchema>;
export type Element = z.infer<typeof ElementSchema>;
export type Size = z.infer<typeof SizeSchema>;
export type Weapon = z.infer<typeof WeaponSchema>;
export type MonsterRace = z.infer<typeof MonsterRaceSchema>;
export type StatusId = z.infer<typeof StatusIdSchema>;
export type CharacterInput = z.input<typeof CharacterSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type Modifier = z.infer<typeof ModifierSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type Monster = z.infer<typeof MonsterSchema>;
