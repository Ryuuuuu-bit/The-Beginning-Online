const missingItems=new Set<string>();
export function canEquipWeapon(profile:{classId:string;masteries?:CharacterInput['masteries']},weapon:Weapon|undefined,data:GameData){
 return !weapon||!!profile.masteries||!!data.classes.classes.find(c=>c.id===profile.classId)?.weapons.includes(weapon);
}
import {
	CharacterSchema,
	type CharacterInput,
	type GameData,
	type Stat,
	type Element,
	type Weapon,
	type Size,
	type MonsterRace,
	type StatusId,
	type Monster,
	type Modifier,
} from "./schema.js";
import { autoAllocateStats } from "./allocation.js";
import {masteryPassiveValue} from './mastery.js';
export const clamp = (n: number, min: number, max: number) =>
	Math.min(max, Math.max(min, n));
export interface Combatant {
	level: number;
	jobId?: string;
	skills?: Record<string, number>;
	isPlayer: boolean;
	boss: boolean;
	maxHp: number;
	maxSp: number;
	atk: number;
	matk: number;
	hardDef: number;
	softDef: number;
	hardMdef: number;
	softMdef: number;
	hit: number;
	flee: number;
	crit: number;
	critShield: number;
	aspd: number;
	castMul: number;
	moveSpeed: number;
	weight: number;
	hpRegen: number;
	spRegen: number;
	stats: Record<Stat, number>;
	race: MonsterRace;
	playerRace?: string;
	element: Element;
	weaponElement: Element;
	size: Size;
	weaponType: Weapon;
	weaponInterval: number;
	raceBonus: Partial<Record<MonsterRace, number>>;
	raceResist: Partial<Record<MonsterRace, number>>;
	elementBonus: Partial<Record<Element, number>>;
	elementResist: Record<Element, number>;
	sizeBonus: Partial<Record<Size, number>>;
	statusResist: Record<StatusId, number>;
	ignoreSize: boolean;
	healReduction: number;
	expBonus: number;
	dropBonus: number;
	noShallowSlow: boolean;
}
export function deriveStats(input: CharacterInput, data: GameData): Combatant {
	const char = CharacterSchema.parse(input),
		caps = data.stats.caps;
	const race = data.races.players.find((r) => r.id === char.race),
		job = data.classes.classes.find((c) => c.id === char.classId);
	if (!race || !job)
		throw new Error(`Unknown race/class: ${char.race}/${char.classId}`);
	const equipment = char.equipment.flatMap((id) => {
		const i = data.items.items.find((i) => i.id === id);
		if(!i){if(!missingItems.has(id)){missingItems.add(id);console.error('Missing item template',id);}return [];}
		if (i.level > char.level)
			throw new Error(`Item ${id} requires level ${i.level}`);
		return [i];
	});
	const weapon = equipment.find((i) => i.type === "weapon"),
		armour = equipment.find((i) => i.type === "armour");
 if(weapon?.weaponType==='sword2h'&&equipment.some(i=>i.type==='shield'))throw Error('ดาบสองมือใช้ร่วมกับโล่ไม่ได้');
	if (!canEquipWeapon(char,weapon?.weaponType,data))
		throw new Error(`${job.id} cannot equip ${weapon?.weaponType}`);
	for (const slot of ["weapon", "armour"] as const) {
		const selected = char.cards
			.map((id) => {
				const c = data.cards.cards.find((c) => c.id === id);
				if (!c) throw new Error(`Unknown card: ${id}`);
				return c;
			})
			.filter((c) => c.slot === slot);
		if (selected.length > ((slot === "weapon" ? weapon : armour)?.slots ?? 0))
			throw new Error(`Too many ${slot} cards`);
		if (selected.length && !(slot === "weapon" ? weapon : armour))
			throw new Error(`Missing ${slot} for card`);
	}
	const learned = char.skills;
	const learnedValue = (id: string, key: string) => {
		const level = learned[id] || 0;
		return level
			? data.skills.skills.find((s) => s.id === id)?.values[key]?.[level - 1] ||
					0
			: 0;
	};
	const passive: Modifier[] = [];
 const masteryValue=(id:Parameters<typeof masteryPassiveValue>[3],key:string)=>masteryPassiveValue(data,char,weapon?.weaponType??'unarmed',id,key);
 passive.push(
  {kind:'flat',stat:'hit',value:masteryValue('archer_07','hit')},
  {kind:'flat',stat:'flee',value:masteryValue('rogue_07','flee')},
  {kind:'percent',stat:'maxSp',value:masteryValue('mage_08','maxMp')/100},
  {kind:'percent',stat:'castMul',value:-masteryValue('mage_07','castDown')/100},
 );
	if (["sword1h", "sword2h"].includes(weapon?.weaponType || ""))
		passive.push({
			kind: "flat",
			stat: "atk",
			value: learnedValue("sword_mastery", "atk"),
		});
	passive.push(
		{
			kind: "percent",
			stat: "maxHp",
			value:
				learnedValue("iron_body", "hpPercent"),
		},
		{
			kind: "percent",
			stat: "hpRegen",
			value: learnedValue("iron_body", "hpRegenPercent"),
		},
		// Job 2 passives: Guardian toughness, Berserker attack.
		{ kind: "percent", stat: "hardDef", value: learnedValue("guardian_spirit", "defPercent") },
		{ kind: "percent", stat: "maxHp", value: learnedValue("guardian_spirit", "hpPercent") },
		{ kind: "percent", stat: "atk", value: learnedValue("berserk_soul", "atkPercent") },
	);
	const modifiers: Modifier[] = [
		...passive,
		...equipment.flatMap((i) => i.modifiers),
		...char.cards.flatMap(
			(id) => data.cards.cards.find((c) => c.id === id)!.modifiers,
		),
		...char.modifiers,
	];
	const stats = Object.fromEntries(
		data.stats.baseStats.map((stat) => [
			stat,
			clamp(
				char.baseStats[stat] +
					(race.bonus[stat] || 0) +
					modifiers.reduce(
						(sum, m) =>
							sum + (m.kind === "stat" && m.stat === stat ? m.value : 0),
						0,
					),
				data.stats.start,
				data.stats.maxStat,
			),
		]),
	) as Record<Stat, number>;
	const { str, agi, vit, int, dex, luk } = stats,
		level = char.level,
		weaponType = weapon?.weaponType || "unarmed",
		interval = weapon?.interval || 1;
	const ranged = weaponType === "bow";
	const p: Combatant = {
		level,
		jobId: char.classId === "novice_knight" ? "swordsman" : char.classId,
		skills: char.skills,
		isPlayer: true,
		boss: false,
		stats,
		race: "demihuman",
		playerRace: race.id,
		element: race.element,
		weaponElement: "neutral",
		size: race.size,
		weaponType,
		weaponInterval: interval,
		maxHp: (100 + 20 * level) * (1 + vit / 100) * job.hpMul,
		maxSp: (60 + 6 * level) * (1 + int / 100) * job.spMul,
		atk:
			(ranged
				? dex * 2 + Math.floor(dex / 10) ** 2 + str / 5
				: str * 2 + Math.floor(str / 10) ** 2 + dex / 5) +
			luk / 3 +
			(weapon?.atk || 0),
		matk:
			int * 2 +
			Math.floor(int / 10) ** 2 +
			dex / 5 +
			luk / 3 +
			(weapon?.matk || 0),
		hardDef: 0,
		hardMdef: 0,
		softDef: vit / 2 + level / 4,
		softMdef: int / 2 + vit / 5,
		hit: 150 + level + dex,
		flee: 100 + level + agi,
		crit: 0.01 + luk * 0.003,
		critShield: luk * 0.003 + (race.passives.critShield || 0),
		aspd:
			1 / Math.max(interval / 2.2, interval * (1 - agi * 0.004 - dex * 0.001)),
		castMul: Math.max(1 - caps.maxCastReduction, 1 - dex * 0.005),
		moveSpeed: 1 + (race.passives.moveSpeed || 0),
		weight: 10000 + str * 30 + (race.passives.weight || 0),
		hpRegen: 0,
		spRegen: 0,
		raceBonus: {},
		raceResist: {},
		elementBonus: { dark: race.passives.darkDamage || 0 },
		elementResist: Object.fromEntries(
			Object.keys(data.elements.names).map((e) => [e, 0]),
		) as Record<Element, number>,
		sizeBonus: {},
		statusResist: {} as Record<StatusId, number>,
		ignoreSize: false,
		healReduction: -(race.passives.healReceived || 0),
		expBonus: race.passives.exp || 0,
		dropBonus: race.passives.drop || 0,
		noShallowSlow: race.passives.noShallowSlow || false,
	};
	// Flats precede summed percentage modifiers; no per-item multiplication/order dependence.
	for (const m of modifiers) if (m.kind === "flat") p[m.stat] += m.value;
	for (const stat of [
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
	] as const) {
		p[stat] *=
			1 +
			modifiers.reduce(
				(sum, m) =>
					sum + (m.kind === "percent" && m.stat === stat ? m.value : 0),
				0,
			);
		p[stat] = Math.max(0, p[stat]);
	}
	const regen = data.stats.regen;
	p.hpRegen = regen.hpBase + vit * regen.hpVit + p.maxHp * regen.hpMax;
	p.spRegen =
		(regen.spBase + int * regen.spInt + p.maxSp * regen.spMax) *
		(1 + (race.passives.spRegen || 0));
	for (const stat of ["hpRegen", "spRegen"] as const) {
		p[stat] += modifiers
			.filter((m) => m.kind === "flat" && m.stat === stat)
			.reduce(
				(n, m) =>
					n + ("value" in m && typeof m.value === "number" ? m.value : 0),
				0,
			);
		p[stat] *=
			1 +
			modifiers
				.filter((m) => m.kind === "percent" && m.stat === stat)
				.reduce(
					(n, m) =>
						n + ("value" in m && typeof m.value === "number" ? m.value : 0),
					0,
				);
	}
	for (const m of modifiers) {
		if (
			[
				"raceBonus",
				"raceResist",
				"elementBonus",
				"elementResist",
				"sizeBonus",
			].includes(m.kind) &&
			"target" in m
		) {
			const map = p[m.kind as "raceBonus"] as Record<string, number>;
			map[m.target] = (map[m.target] || 0) + m.value;
		}
		if (m.kind === "armourElement") p.element = m.element;
		if (m.kind === "weaponElement") p.weaponElement = m.element;
		if (m.kind === "ignoreSize") p.ignoreSize = m.value;
	}
	for (const key of Object.keys(p.elementResist) as Element[])
		p.elementResist[key] = clamp(
			p.elementResist[key],
			-1,
			caps.maxElementResist,
		);
	for (const status of data.status.statuses) {
		let resist = 0;
		for (const [key, weight] of Object.entries(status.resist))
			resist +=
				(key in stats
					? stats[key as Stat]
					: p.elementResist[key as Element] || 0) * weight;
		if (status.id === "stun") resist += race.passives.stunResist || 0;
		resist += modifiers.reduce(
			(n, m) =>
				n + (m.kind === "statusResist" && m.target === status.id ? m.value : 0),
			0,
		);
		p.statusResist[status.id] = clamp(resist, 0, caps.maxResist);
	}
	for (const key of Object.keys(p.raceResist) as MonsterRace[])
		p.raceResist[key] = clamp(p.raceResist[key] || 0, 0, caps.maxResist);
	for (const map of [p.raceBonus, p.elementBonus, p.sizeBonus])
		for (const key of Object.keys(map)) {
			const record = map as Record<string, number>;
			record[key] = clamp(record[key], -1, caps.maxBonusPerCategory);
		}
	p.crit = clamp(p.crit, 0, caps.maxCrit);
	p.critShield = clamp(p.critShield, 0, 1);
	p.castMul = clamp(p.castMul, 1 - caps.maxCastReduction, 1);
	p.aspd = clamp(p.aspd, 0, 2.2 / interval);
	p.moveSpeed = clamp(p.moveSpeed, 0, caps.maxMoveSpeed);
	p.healReduction = clamp(p.healReduction, 0, caps.maxResist);
	p.hpRegen = Math.max(0, p.hpRegen);
	p.spRegen = Math.max(0, p.spRegen);
	if (
		Object.values(p).some((v) => typeof v === "number" && !Number.isFinite(v))
	)
		throw new Error("Non-finite derived stat");
	return p;
}
export function monsterStats(
	monster: Monster,
	data: GameData,
	phase2 = false,
): Combatant {
	const p = deriveStats(data.stats.defaultBuild, data),
		phase = phase2 ? monster.phase2 : undefined;
	return {
		...p,
		level: monster.level,
		isPlayer: false,
		boss: monster.boss,
		maxHp: monster.hp,
		maxSp: monster.sp,
		atk: phase?.atk ?? monster.atk,
		matk: monster.matk,
		hardDef: monster.hardDef,
		softDef: monster.softDef,
		hardMdef: monster.hardMdef,
		softMdef: monster.softMdef,
		hit: monster.hit,
		flee: monster.flee,
		crit: 0,
		critShield: 0,
		element: phase?.element ?? monster.element,
		weaponElement: phase?.element ?? monster.element,
		race: monster.race,
		playerRace: undefined,
		size: monster.size,
		weaponType: "unarmed",
		weaponInterval: monster.boss ? 2 : 1.5,
		aspd: 1 / (monster.boss ? 2 : 1.5),
		hpRegen: 0,
		spRegen: 0,
		elementResist: Object.fromEntries(
			Object.keys(data.elements.names).map((e) => [e, 0]),
		) as Record<Element, number>,
		statusResist: Object.fromEntries(
			data.status.statuses.map((s) => [s.id, 0]),
		) as Record<StatusId, number>,
		raceResist: {},
		raceBonus: {},
		elementBonus: {},
		sizeBonus: {},
		expBonus: 0,
		dropBonus: 0,
		healReduction: 0,
		noShallowSlow: false,
		ignoreSize: false,
	};
}
export function statPointCost(current: number, data: GameData) {
	return (
		data.stats.pointCosts.find((b) => current >= b.min && current <= b.max)
			?.cost ?? Infinity
	);
}
export function pointsForLevel(level: number, data: GameData) {
	return (
		(clamp(Math.floor(level), 1, data.stats.maxLevel) - 1) *
		data.stats.pointsPerLevel
	);
}
export function buildForLevel(
	classId: string,
	level: number,
	data: GameData,
): CharacterInput {
	const job = data.classes.classes.find((c) => c.id === classId);
	if (!job) throw new Error(`Unknown class ${classId}`);
	if (
		level === 1 &&
		["swordsman", data.stats.defaultBuild.classId].includes(classId)
	)
		return { ...structuredClone(data.stats.defaultBuild), classId };
	let baseStats = Object.fromEntries(
		data.stats.baseStats.map((s) => [s, 1]),
	) as Record<Stat, number>;
	if (["swordsman", data.stats.defaultBuild.classId].includes(classId))
		baseStats = { ...data.stats.defaultBuild.baseStats };
	baseStats = autoAllocateStats(
		{
			profile: { ...data.stats.defaultBuild, classId, level, baseStats },
			statPoints: pointsForLevel(level, data),
			autoAllocate: true,
			autoAllocCursor: 0,
		},
		data,
	).profile.baseStats;
	const equipment = data.items.items
		.filter(
			(i) =>
				i.level <= level &&
				(i.type === "armour" || job.weapons.includes(i.weaponType!)),
		)
		.sort((a, b) => b.level - a.level);
	return {
		race: "human",
		classId,
		level,
		baseStats,
		equipment: [
			equipment.find((i) => i.type === "weapon")?.id,
			equipment.find((i) => i.type === "armour")?.id,
		].filter((id): id is string => !!id),
	};
}
