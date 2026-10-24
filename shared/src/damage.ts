import { clamp, type Combatant } from "./derive.js";
import type { GameData, Skill } from "./schema.js";
export interface DamageContext {
	rng: () => number;
	mode?: "duel" | "freepk" | "arena" | "gvg";
	comboThird?: boolean;
	healReduction?: number;
}
export interface DamageResult {
	damage: number;
	hit: boolean;
	crit: boolean;
	breakdown: {
		base: number;
		defRed: number;
		pre: number;
		E: number;
		R: number;
		S: number;
		C: number;
		P: number;
		V: number;
		hitChance: number;
		critChance: number;
		unreduced: number;
		reductionFloor: number;
		beforeRound: number;
		capApplied: boolean;
	};
}
/** Local RNG: deterministic and independent of render/global random state. */
export function seededRng(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 4294967296;
	};
}
export function computeDamage(
	a: Combatant,
	d: Combatant,
	skill: Skill,
	ctx: DamageContext,
	data: GameData,
): DamageResult {
	const caps = a.statCaps??data.stats.caps,
		pvp = a.isPlayer && d.isPlayer;
	const percent =
		ctx.comboThird && skill.comboThirdPercent !== undefined
			? skill.comboThirdPercent
			: skill.percent;
	const base =
		((skill.type === "magic" || skill.type === "heal" ? a.matk : a.atk) *
			percent) /
		100;
	const b: DamageResult["breakdown"] = {
		base,
		defRed: 0,
		pre: base,
		E: 1,
		R: 1,
		S: 1,
		C: 1,
		P: 1,
		V: 1,
		hitChance: 1,
		critChance: 0,
		unreduced: base,
		reductionFloor: 0,
		beforeRound: 0,
		capApplied: false,
	};
	const result = (damage: number, hit = true, crit = false): DamageResult => ({
		damage,
		hit,
		crit,
		breakdown: b,
	});
	if (skill.type === "heal") {
		// Utility potion has its own explicit flat/VIT heal; formula heals otherwise use MATK.
		b.base = skill.heal
			? skill.heal.flat * (1 + (a.stats.vit * skill.heal.vitPercent) / 100)
			: base;
		b.pre = b.base;
		b.P = 1 - clamp(ctx.healReduction ?? d.healReduction, 0, 1);
		b.beforeRound = b.pre * b.P;
		return result(Math.max(0, Math.round(b.beforeRound)));
	}
	if (skill.kind === "utility") return result(0);
	if (
		pvp &&
		ctx.mode === "freepk" &&
		(a.level < data.pvp.modes.freepk.minLevel ||
			d.level < data.pvp.modes.freepk.minLevel)
	)
		return result(0, false);
	const magic = skill.type === "magic";
	b.hitChance =
		magic || skill.kind === "area"
			? 1
			: clamp(
					0.8 + (a.hit - d.flee) / 100,
					pvp ? Math.max(caps.pvpMinHit, caps.hitChance[0]) : caps.hitChance[0],
					caps.hitChance[1],
				);
	if (b.hitChance < 1 && ctx.rng() >= b.hitChance) return result(0, false);
	b.critChance = magic ? 0 : clamp(a.crit - d.critShield, 0, caps.maxCrit);
	const crit = b.critChance > 0 && ctx.rng() < b.critChance;
	b.defRed = clamp(
		(magic ? d.hardMdef : d.hardDef) /
			((magic ? d.hardMdef : d.hardDef) + 100 + 5 * a.level),
		0,
		caps.maxDefReduction,
	);
	b.pre = Math.max(1, base * (1 - b.defRed) - (magic ? d.softMdef : d.softDef));
	const element = skill.element === "weapon" ? a.weaponElement : skill.element;
	const elementRatio = data.elements.table[element][d.element] / 100;
	const bonus =
		1 + clamp(a.elementBonus[element] || 0, 0, caps.maxBonusPerCategory);
	b.E =
		elementRatio *
		bonus *
		(1 - clamp(d.elementResist[element] || 0, -1, caps.maxElementResist));
	const raceBonus =
		1 + clamp(a.raceBonus[d.race] || 0, 0, caps.maxBonusPerCategory);
	b.R = raceBonus * (1 - clamp(d.raceResist[a.race] || 0, 0, caps.maxResist));
	b.S =
		magic || skill.ignoreSize || a.ignoreSize
			? 1
			: (data.races.sizeTable[a.weaponType][d.size] / 100) *
				(1 + clamp(a.sizeBonus[d.size] || 0, 0, caps.maxBonusPerCategory));
	b.C = crit ? 1.5 : 1;
	b.P = pvp
		? (skill.pvpMul ?? data.pvp.kind[skill.kind]) *
			(1 - data.pvp.modes[ctx.mode ?? "duel"].reduction)
		: 1;
	b.V = 0.95 + ctx.rng() * 0.1;
	// Keep elemental/size weaknesses and offensive multipliers in the reference value.
	// The cap limits defensive stacking, including soft DEF, never erases an elemental immunity.
	b.unreduced =
		base *
		elementRatio *
		bonus *
		raceBonus *
		b.S *
		b.C *
		b.V *
		(pvp ? (skill.pvpMul ?? data.pvp.kind[skill.kind]) : 1);
	b.reductionFloor = b.unreduced * (1 - caps.maxDamageReductionTotal);
	const raw = b.pre * b.E * b.R * b.S * b.C * b.P * b.V;
	b.beforeRound = b.E === 0 ? 0 : Math.max(raw, b.reductionFloor);
	b.capApplied = b.beforeRound > raw;
	return result(
		b.E === 0
			? 0
			: Math.max(1, Math.round(b.beforeRound), Math.ceil(b.reductionFloor)),
		true,
		crit,
	);
}
