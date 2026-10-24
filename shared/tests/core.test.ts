import test from "node:test";
import assert from "node:assert/strict";
import {
	mkdtempSync,
	readFileSync,
	writeFileSync,
	cpSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
	loadGameData,
	deriveStats,
	monsterStats,
	computeDamage,
	seededRng,
	validateGameData,
	statPointCost,
	pointsForLevel,
	buildForLevel,
	applyStatus,
	statusChance,
	healReduction,
	type Modifier,
} from "../src/index.node.js";
import { loadGameData as browserData } from "../src/load.js";
import {
	parseOptions,
	runBalance,
	trial,
	simulatorPlayer,
} from "../sim/balance.js";
const data = loadGameData(),
	player = () => deriveStats(data.stats.defaultBuild, data),
	pink = () => monsterStats(data.monsters.monsters[0], data);
const skill = (id: string) => data.skills.skills.find((s) => s.id === id)!;
const midpoint = (a = player(), d = pink(), id = "basic", third = false) =>
	computeDamage(
		{ ...a, crit: 0 },
		d,
		skill(id),
		{ rng: () => 0.5, comboThird: third },
		data,
	);
test("all fourteen files validate and browser/Node loaders agree", () => {
	assert.equal(Object.keys(data).length, 14);
	assert.deepEqual(data, browserData());
	for (const file of Object.values(data)) assert.equal(file.dataVersion, 1);
});
test("broken data names the JSON file and exact path", () => {
	const broken = structuredClone(data);
	(broken.skills.skills[1] as unknown as { sp: string }).sp = "twenty";
	assert.throws(() => validateGameData(broken), /skills.json: skills.1.sp/);
});
test("Node loader reads edited files afresh and gives JSON parse errors with filenames", () => {
	const dir = mkdtempSync(join(tmpdir(), "beginning-stats-"));
	try {
		cpSync(new URL("../data/", import.meta.url), dir, { recursive: true });
		const file = join(dir, "items.json");
		writeFileSync(file, '{"dataVersion":1,"items":[]}');
		assert.throws(
			() => loadGameData(pathToFileURL(dir + "/")),
			/items.json: items/,
		);
		writeFileSync(file, "{broken");
		assert.throws(
			() => loadGameData(pathToFileURL(dir + "/")),
			/items.json: <root>/,
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
test("tables have exact element and size domains, names and directional entries", () => {
	assert.equal(Object.keys(data.elements.table).length, 8);
	for (const row of Object.values(data.elements.table)) {
		assert.equal(Object.keys(row).length, 8);
		for (const value of Object.values(row))
			assert.ok(value >= 50 && value <= 150);
	}
	assert.equal(data.elements.table.wind.water, 150);
	assert.equal(data.elements.table.fire.water, 50);
	assert.equal(data.elements.names.holy, "สายฟ้า");
	for (const row of Object.values(data.races.sizeTable)) {
		assert.equal(Object.keys(row).length, 3);
		for (const value of Object.values(row))
			assert.ok(value >= 75 && value <= 100);
	}
	for (const race of data.races.players)
		assert.equal(
			Object.values(race.bonus).reduce((a, b) => a + b, 0),
			6,
		);
});
test("EXP preserves the starter curve and uses bounded hunting requirements through100", () => {
	data.stats.expToNext.forEach((xp, i) =>
		assert.equal(
			xp,
			i < 10
				? Math.round(60 * 1.45 ** i)
				: Math.round((20+1.2*(i+1)**2)*(12+1.8*(i+1))),
		),
	);
});
test("Lv99 budget spends only within a monotonic cost table and leaves no affordable point", () => {
	let prev = 0;
	for (let current = 1; current <= 99; current++) {
		const cost = statPointCost(current, data);
		assert.ok(cost >= prev);
		prev = cost;
	}
	for (const job of data.classes.classes) {
		const build = buildForLevel(job.id, 99, data);
		let spent = 0;
		for (const [stat,value] of Object.entries(build.baseStats)) {
			assert.ok(value >= 1 && value <= 99);
			const start=['swordsman',data.stats.defaultBuild.classId].includes(job.id)?data.stats.defaultBuild.baseStats[stat as keyof typeof build.baseStats]:1;
			for (let n = start; n < value; n++) spent += statPointCost(n, data);
		}
		const left = 98*data.stats.pointsPerLevel - spent;
		assert.ok(left >= 0);
		assert.ok(
			data.stats.baseStats.every(
				(s) => statPointCost(build.baseStats[s], data) > left,
			),
		);
	}
});
test("default build is explicitly a starter grant, not a legal 3-point allocation", () => {
	assert.equal(data.stats.defaultBuild.starterGrant, true);
	const spent = Object.values(data.stats.defaultBuild.baseStats).reduce(
		(n, v) => {
			for (let i = 1; i < v; i++) n += statPointCost(i, data);
			return n;
		},
		0,
	);
	assert.equal(spent, 26);
	assert.ok(spent > pointsForLevel(1, data));
});
test("derived base formulas keep floats and apply armour only to hard DEF", () => {
	const p = player();
	assert.equal(p.maxHp, 126);
	assert.equal(p.maxSp, 68.64);
	assert.equal(p.atk, 12 + 4 / 5 + 2 / 3 + 5);
	assert.equal(p.hardDef, 3);
	assert.equal(p.softDef, 2.75);
	assert.equal(p.softMdef, 3);
	assert.equal(p.hit, 155);
	assert.equal(p.flee, 105);
	assert.equal(p.weight, 10480);
	assert.equal(p.hpRegen, 1.252);
});
test("equipment flat values precede summed percentages and cards respect slots", () => {
	const base = data.stats.defaultBuild;
	const a = deriveStats(
		{
			...base,
			cards: ["card_jelly_pink"],
			modifiers: [{ kind: "percent", stat: "maxHp", value: 0.2 }],
		},
		data,
	);
	assert.equal(a.maxHp, (120 * 1.06 + 50) * 1.2);
	assert.equal(a.stats.vit, 6);
	assert.throws(
		() =>
			deriveStats(
				{ ...base, cards: ["card_jelly_pink", "card_jelly_pink"] },
				data,
			),
		/Too many armour cards/,
	);
	assert.throws(
		() =>
			deriveStats({ ...base, equipment: [], cards: ["card_jelly_pink"] }, data),
		/armour/,
	);
});
test("all defined caps hold at Lv99/99 stats with absurd gear modifiers", () => {
	const modifiers: Modifier[] = [
		...data.stats.baseStats.map((stat) => ({
			kind: "stat" as const,
			stat,
			value: 1e6,
		})),
		...(["crit", "aspd", "moveSpeed"] as const).map((stat) => ({
			kind: "flat" as const,
			stat,
			value: 1e6,
		})),
		{ kind: "percent", stat: "castMul", value: -1e6 },
		{ kind: "raceBonus", target: "formless", value: 1e6 },
		{ kind: "sizeBonus", target: "small", value: 1e6 },
		{ kind: "elementBonus", target: "fire", value: 1e6 },
		{ kind: "elementResist", target: "fire", value: 1e6 },
		{ kind: "raceResist", target: "formless", value: 1e6 },
		{ kind: "flat", stat: "hardDef", value: 1e6 },
	];
	const p = deriveStats(
			{
				...data.stats.defaultBuild,
				level: 99,
				baseStats: Object.fromEntries(
					data.stats.baseStats.map((s) => [s, 99]),
				) as typeof data.stats.defaultBuild.baseStats,
				modifiers,
			},
			data,
		),
		caps = data.stats.caps;
	assert.ok(Object.values(p.stats).every((s) => s === 99));
	assert.equal(p.crit, caps.maxCrit);
	assert.equal(p.aspd, 2.2 / p.weaponInterval);
	assert.equal(p.castMul, 1 - caps.maxCastReduction);
	assert.equal(p.moveSpeed, caps.maxMoveSpeed);
	assert.equal(p.elementResist.fire, caps.maxElementResist);
	assert.equal(p.raceResist.formless, caps.maxResist);
	assert.ok(Object.values(p.statusResist).every((r) => r <= caps.maxResist));
	assert.equal(p.raceBonus.formless, 1);
	assert.equal(p.elementBonus.fire, 1);
	assert.equal(p.sizeBonus.small, 1);
	const damage = midpoint(pink(), p);
	assert.ok(damage.breakdown.defRed <= caps.maxDefReduction);
	assert.ok(
		Object.values(p)
			.filter((v) => typeof v === "number")
			.every((v) => Number.isFinite(v)),
	);
});
test("ranged ATK uses DEX; race passives, equipment elements and magic size rules apply", () => {
	const local = structuredClone(data);
	local.items.items.push({
		...local.items.items[0],
		id: "test_bow",
		weaponType: "bow",
	});
	const p = deriveStats(
		{ ...data.stats.defaultBuild, classId: "archer", equipment: ["test_bow"] },
		local,
	);
	assert.equal(p.atk, 4 * 2 + 6 / 5 + 2 / 3 + 5);
	const naga = deriveStats(
		{
			...data.stats.defaultBuild,
			race: "naga",
			modifiers: [
				{ kind: "armourElement", element: "fire" },
				{ kind: "weaponElement", element: "holy" },
			],
		},
		data,
	);
	assert.equal(naga.element, "fire");
	assert.equal(naga.weaponElement, "holy");
	assert.equal(naga.noShallowSlow, true);
	assert.ok(naga.spRegen > naga.maxSp * 0.01 + naga.stats.int / 6);
	assert.equal(midpoint(player(), pink(), "fire_bolt").breakdown.S, 1);
});
test("same seed produces identical damage sequences, different seeds vary", () => {
	const sequence = (seed: number) => {
		const rng = seededRng(seed);
		return Array.from({ length: 30 }, () =>
			computeDamage(player(), pink(), skill("basic"), { rng }, data),
		);
	};
	assert.deepEqual(sequence(123), sequence(123));
	assert.notDeepEqual(sequence(123), sequence(124));
});
test("hit/crit rolls, PvP hit floor and magic/area guarantees", () => {
	const a = { ...player(), hit: 0, crit: 1 },
		d = { ...pink(), flee: 999 };
	const miss = computeDamage(a, d, skill("basic"), { rng: () => 0.99 }, data);
	assert.equal(miss.hit, false);
	assert.equal(miss.damage, 0);
	assert.equal(miss.breakdown.hitChance, 0.05);
	const pvp = computeDamage(
		a,
		{ ...d, isPlayer: true },
		skill("basic"),
		{ rng: () => 0.99 },
		data,
	);
	assert.equal(pvp.breakdown.hitChance, 0.25);
	const crit = computeDamage(a, d, skill("basic"), { rng: () => 0 }, data);
	assert.equal(crit.crit, true);
	assert.equal(crit.breakdown.critChance, 0.6);
	for (const id of ["whirlwind", "meteor"])
		assert.equal(
			computeDamage(a, d, skill(id), { rng: () => 0.99 }, data).hit,
			true,
		);
	assert.equal(
		computeDamage(a, d, skill("fire_bolt"), { rng: () => 0 }, data).crit,
		false,
	);
});
test("race, element, size bonuses cap; resistance works even with zero bonus", () => {
	const a = player(),
		d = pink();
	const plain = midpoint(a, d),
		resisted = midpoint(a, { ...d, raceResist: { demihuman: 0.5 } });
	assert.equal(resisted.breakdown.R, 0.5);
	assert.ok(resisted.damage < plain.damage);
	const card = deriveStats(
		{ ...data.stats.defaultBuild, cards: ["card_king_jelly"] },
		data,
	);
	assert.equal(midpoint(card, d).breakdown.R, 1.2);
	const buffed = midpoint(
		{
			...a,
			raceBonus: { formless: 5 },
			sizeBonus: { small: 5 },
			elementBonus: { neutral: 5 },
		},
		d,
	);
	assert.equal(buffed.breakdown.R, 2);
	assert.equal(buffed.breakdown.S, 1.8);
	assert.equal(buffed.breakdown.E, 2);
});
test("PvP override still receives mode reduction; PvE players are not mistaken for PvP", () => {
	const a = player(),
		d = player(),
		s = { ...skill("basic"), pvpMul: 0.5 };
	const duel = computeDamage(a, d, s, { rng: () => 0.5, mode: "duel" }, data),
		gvg = computeDamage(a, d, s, { rng: () => 0.5, mode: "gvg" }, data);
	assert.equal(duel.breakdown.P, 0.4);
	assert.equal(gvg.breakdown.P, 0.3);
	assert.equal(midpoint(pink(), player()).breakdown.P, 1);
	assert.equal(
		computeDamage(a, d, s, { rng: () => 0.5, mode: "freepk" }, data).damage,
		0,
	);
});
test("stacked DEF/resists/PvP never reduce below 20% reference; immunity stays zero", () => {
	const d = {
		...player(),
		hardDef: 1e6,
		softDef: 1e6,
		raceResist: { demihuman: 0.8 },
		elementResist: { ...player().elementResist, neutral: 0.5 },
	};
	const r = computeDamage(
		player(),
		d,
		skill("basic"),
		{ rng: () => 0.5, mode: "gvg" },
		data,
	);
	assert.equal(r.breakdown.capApplied, true);
	assert.ok(r.breakdown.beforeRound >= r.breakdown.unreduced * 0.2 - 1e-9);
	const immune = structuredClone(data);
	immune.elements.table.neutral.neutral = 0;
	assert.equal(
		computeDamage(
			player(),
			player(),
			skill("basic"),
			{ rng: () => 0.5 },
			immune,
		).damage,
		0,
	);
});
test("heals skip defence/element/size, utility potion uses documented VIT interpretation", () => {
	const a = player(),
		d = { ...pink(), healReduction: 0.3 },
		heal = { ...skill("fire_bolt"), type: "heal" as const };
	const r = computeDamage(a, d, heal, { rng: () => 0.5 }, data);
	assert.equal(r.damage, Math.round(a.matk * 1.5 * 0.7));
	assert.equal(r.breakdown.E, 1);
	assert.equal(
		computeDamage(a, a, skill("potion"), { rng: () => 0.5 }, data).damage,
		72,
	);
	assert.equal(healReduction(a, 6, 2, data), 0.3);
	assert.equal(healReduction(a, 7, 2, data), 0);
});
test("statuses resist, refresh without stacking, and obey boss immunities/scripted windows", () => {
	const a = player(),
		king = monsterStats(data.monsters.monsters.find((m) => m.id === "king_jelly")!, data);
	assert.equal(statusChance(a, "stun", 1, data), 1 - (0.05 + 0.006));
	assert.equal(statusChance(king, "stun", 1, data), 0);
	assert.equal(
		applyStatus([], king, "stun", 1, 0, () => 0, data).applied,
		false,
	);
	assert.equal(
		applyStatus([], king, "stun", 1, 0, () => 0, data, { scripted: true })
			.applied,
		true,
	);
	const first = applyStatus([], a, "slow", 1, 0, () => 0, data),
		second = applyStatus(first.statuses, a, "slow", 1, 1, () => 0, data);
	assert.equal(second.statuses.length, 1);
	assert.equal(second.statuses[0].expiresAt, 6);
	assert.equal(statusChance(a, "fear", 1, data), 0);
});
test("PvP CC diminishes within 15s and resets at the boundary", () => {
	for (const [times, duration] of [
		[[], 2],
		[[1], 1],
		[[1, 2], 0.5],
		[[1, 2, 3], 0],
	] as [number[], number][]) {
		assert.equal(
			applyStatus([], player(), "stun", 1, 4, () => 0, data, {
				pvpCcTimes: times,
			}).duration,
			duration,
		);
	}
	assert.equal(
		applyStatus([], player(), "stun", 1, 16, () => 0, data, { pvpCcTimes: [1] })
			.duration,
		2,
	);
});
test("goldens anchor current sim constants; starter jelly is neutral so meteor and spin keep their feel", () => {
	const near = (actual: number, target: number) =>
		assert.ok(
			Math.abs(actual - target) / target <= 0.15,
			`${actual} outside 15% of ${target}`,
		);
	near(midpoint().damage, 16);
	near(midpoint(player(), pink(), "basic", true).damage, 28);
	near(midpoint(player(), pink(), "whirlwind").damage*2, 38);
	near(midpoint(player(), pink(), "meteor").damage, 58);
	near(midpoint(pink(), player()).damage, 9);
	near(
		midpoint(monsterStats(data.monsters.monsters.find((m) => m.id === "king_jelly")!, data), player())
			.damage,
		22,
	);
	near(player().maxHp, 120);
	near(player().maxSp, 80);
	assert.equal(midpoint().damage, 15);
	assert.equal(midpoint(player(), pink(), "basic", true).damage, 27);
	assert.equal(midpoint(player(), pink(), "whirlwind").damage*2, 34);
	const meteor = midpoint(player(), pink(), "meteor");
	assert.equal(meteor.damage, 51);
	assert.equal(meteor.breakdown.E, 1);
	assert.ok(midpoint(player(), pink(), "whirlwind").damage < pink().maxHp, "spin must not one-shot the starter jelly");
	assert.equal(Math.ceil(pink().maxHp / midpoint().damage), 3);
});
test("retuned King keeps Lv1 offensive TTK at 70–90s with per-second SP regen", () => {
	const boss = monsterStats(data.monsters.monsters.find((m) => m.id === "king_jelly")!, data),
		values = Array.from(
			{ length: 50 },
			(_, i) => trial(player(), boss, data, seededRng(i + 1)).ttk,
		),
		mean = values.reduce((a, b) => a + b) / values.length;
	assert.ok(mean >= 70 && mean <= 90, `King TTK ${mean}`);
});
test("simulator options validate, reports reproduce, and PvP covers every ordered pair", () => {
	assert.throws(() => parseOptions(["--runs", "0"]), /runs/);
	assert.throws(() => parseOptions(["--level", "100"]), /level/);
	assert.throws(() => parseOptions(["--bogus"]), /Unknown/);
	const opts = parseOptions([
		"--level",
		"10",
		"--class",
		"novice_knight,mage",
		"--monster",
		"jelly_pink",
		"--runs",
		"3",
		"--seed",
		"3",
	]);
	assert.deepEqual(runBalance(opts, data), runBalance(opts, data));
	const pvp = runBalance({ ...opts, pvp: true }, data);
	assert.equal(pvp.rows.length, 8);
	assert.ok(pvp.rows.some((r) => r.mode === "gvg"));
	assert.ok(pvp.rows.every((r) => Number.isFinite(r.ttk.mean)));
	assert.equal(simulatorPlayer("archer", 10, data).weaponType, "bow");
	assert.equal(simulatorPlayer("mage", 10, data).weaponType, "staff");
});
test("simultaneous lethal impacts count as draws rather than first-actor wins", () => {
	const a = { ...player(), maxHp: 1 },
		r = trial(a, a, data, () => 0.5, "duel");
	assert.equal(r.won, false);
	assert.equal(r.draw, true);
	const opts = parseOptions([
		"--level",
		"1",
		"--class",
		"novice_knight",
		"--runs",
		"200",
		"--pvp",
	]);
	const mirror = runBalance(opts, data).rows[0];
	assert.ok(mirror.winRate > 0.35 && mirror.winRate < 0.65);
	assert.ok(mirror.drawRate > 0);
});
