import { schemas, type GameData } from "./schema.js";
export const dataFiles = Object.keys(schemas) as (keyof GameData)[];
export function validateGameData(raw: Record<string, unknown>): GameData {
	const data = {} as GameData;
	for (const name of dataFiles) {
		const parsed = schemas[name].safeParse(raw[name]);
		if (!parsed.success)
			throw new Error(
				`${name}.json: ${parsed.error.issues.map((e) => `${e.path.join(".") || "<root>"}: ${e.message}`).join("; ")}`,
			);
		Object.assign(data, { [name]: parsed.data });
	}
	for (const name of [
		"classes",
		"items",
		"cards",
		"skills",
		"monsters",
		"jobs",
	] as const) {
		const entries = (data[name] as unknown as Record<string, { id: string }[]>)[
			name
		];
		if (new Set(entries.map((e) => e.id)).size !== entries.length)
			throw new Error(`${name}.json: ${name}: duplicate id`);
	}
	const jobIds = new Set(data.jobs.jobs.map((j) => j.id));
	for (const job of data.jobs.jobs) {
		if (job.parent && !jobIds.has(job.parent))
			throw Error("jobs.json: unknown parent");
		let next = job;
		const seen = new Set<string>();
		while (next.parent) {
			if (seen.has(next.id)) throw Error("jobs.json: parent cycle");
			seen.add(next.id);
			next = data.jobs.jobs.find((j) => j.id === next.parent)!;
		}
	}
	for (const skill of data.skills.skills) {
		if (skill.jobId !== "common" && !jobIds.has(skill.jobId))
			throw Error("skills.json: unknown job");
		for (const [key, values] of Object.entries(skill.values))
			if (values.length !== skill.maxLevel)
				throw Error(
					"skills.json: " + skill.id + ".values." + key + " level count",
				);
		for (const req of skill.requires) {
			const target = data.skills.skills.find((s) => s.id === req.id);
			if (!target || req.level > target.maxLevel)
				throw Error("skills.json: prerequisite reference");
		}
	}
	for (const q of data.quests.quests) {
		if ((q.maxLevel??100)<q.level || (q.repeatHours&&q.repeatPeriod)) throw Error('quests.json: invalid level range or reset rule '+q.id);
		for (const r of q.requires) if (!data.quests.quests.some(o => o.id === r)) throw Error("quests.json: unknown prerequisite " + r);
		for (const o of q.objectives) {
			if (o.kind === "kill") for (const m of o.monsters) if (!data.monsters.monsters.some(x => x.id === m)) throw Error("quests.json: unknown monster " + m);
			if (o.kind === "collect" && !data.items.items.some(i => i.id === o.item)) throw Error("quests.json: unknown item " + o.item);
		}
		for (const i of q.rewards.items) if (!data.items.items.some(t => t.id === i.template)) throw Error("quests.json: unknown reward " + i.template);
	}
	if (new Set(data.quests.quests.map(q => q.id)).size !== data.quests.quests.length) throw Error("quests.json: duplicate id");
	for(const stock of Object.values(data.economy.shops))for(const id of Object.keys(stock))if(!data.items.items.some(i=>i.id===id))throw Error('economy.json: unknown shop item '+id);
 const build = data.stats.defaultBuild;
	for (const name of ["races", "status"] as const) {
		const entries =
			name === "races" ? data.races.players : data.status.statuses;
		if (new Set(entries.map((e) => e.id)).size !== entries.length)
			throw new Error(
				`${name}.json: ${name === "races" ? "players" : "statuses"}: duplicate id`,
			);
	}
	for (const [index, band] of data.stats.pointCosts.entries())
		if (
			band.min !== index * 10 + 1 ||
			band.max !== Math.min(99, (index + 1) * 10) ||
			band.cost !== index + 2
		)
			throw new Error(
				`stats.json: pointCosts.${index}: expected contiguous monotonic 1–99 bands`,
			);
	for (const race of data.races.players)
		if (Object.values(race.bonus).reduce((a, b) => a + b, 0) !== 6)
			throw new Error(
				`races.json: players.${data.races.players.indexOf(race)}.bonus: total must be +6`,
			);
	for (const [index, item] of data.items.items.entries())
		if (item.type === "weapon" && (!item.weaponType || !item.interval))
			throw new Error(
				`items.json: items.${index}: weapon requires weaponType and interval`,
			);
	for (const [index, monster] of data.monsters.monsters.entries())
		for (const drop of monster.drops)
			if (!data.items.items.some((i) => i.id === drop.item))
				throw new Error(
					`monsters.json: monsters.${index}.drops: unknown item ${drop.item}`,
				);
	for (const card of data.cards.cards)
		if (!data.items.items.some((i) => i.id === card.id && i.type === "card"))
			throw Error(`cards.json: ${card.id}: missing card item`);
	for (const item of data.items.items)
		if (item.type === "card" && !data.cards.cards.some((c) => c.id === item.id))
			throw Error(`items.json: ${item.id}: missing card effects`);
	for (const [file, ok, path] of [
		[
			"stats",
			data.races.players.some((r) => r.id === build.race),
			"defaultBuild.race",
		],
		[
			"stats",
			data.classes.classes.some((c) => c.id === build.classId),
			"defaultBuild.classId",
		],
		[
			"stats",
			build.equipment.every((id) => data.items.items.some((i) => i.id === id)),
			"defaultBuild.equipment",
		],
	] as const)
		if (!ok) throw new Error(`${file}.json: ${path}: unknown reference`);
	return data;
}
