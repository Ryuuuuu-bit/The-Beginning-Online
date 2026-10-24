import type { GameData } from "./schema.js";
import type { Inventory } from "./inventory.js";
import { CITY_BUILDINGS, HEALER, GATE_CAPTAIN } from "./game/maps.js";

export type Quest = GameData["quests"]["quests"][number];
export type QuestGiver = Quest["giver"];
export interface QuestState {
	/** Accepted quests: per-objective counters (collect objectives are read from the bag instead). */
	active: Record<string, { progress: number[]; at: number }>;
	/** Completion time (ms) of each quest finished at least once. */
	done: Record<string, number>;
}
export type QuestStatus = "locked" | "available" | "active" | "ready" | "done" | "cooldown";
export const emptyQuests = (): QuestState => ({ active: {}, done: {} });

export function normalizeQuests(raw: unknown, data: GameData): QuestState {
	const state = emptyQuests();
	if (!raw || typeof raw !== "object") return state;
	const r = raw as Partial<QuestState>;
	for (const [id, a] of Object.entries(r.active ?? {})) {
		const q = data.quests.quests.find(q => q.id === id);
		if (!q || !a || !Array.isArray(a.progress)) continue;
		state.active[id] = { at: Number(a.at) || 0, progress: q.objectives.map((o, i) => Math.max(0, Math.min(o.count, Math.floor(Number(a.progress[i]) || 0)))) };
	}
	for (const [id, at] of Object.entries(r.done ?? {})) if (data.quests.quests.some(q => q.id === id) && Number.isFinite(Number(at))) state.done[id] = Number(at);
	return state;
}

const bagCount = (inv: Inventory | undefined, template: string) =>
	(inv?.items ?? []).filter(i => i.location === "bag" && i.template === template).reduce((n, i) => n + i.qty, 0);

/** Current count of each objective (collect objectives count matching bag items, capped at the goal). */
export function objectiveProgress(q: Quest, state: QuestState, inv?: Inventory) {
	const active = state.active[q.id];
	return q.objectives.map((o, i) => Math.min(o.count, o.kind === "collect" ? bagCount(inv, o.item) : active?.progress[i] ?? 0));
}

export function questStatus(q: Quest, state: QuestState, level: number, now: number, inv?: Inventory): QuestStatus {
	if (state.active[q.id]) return objectiveProgress(q, state, inv).every((n, i) => n >= q.objectives[i].count) ? "ready" : "active";
	const done = state.done[q.id];
	if (done !== undefined) {
		if (!q.repeatHours && !q.repeatPeriod) return "done";
		if (now < questResetAt(q, done)) return "cooldown";
	}
	if (level < q.level || level > (q.maxLevel ?? Infinity) || q.requires.some(r => state.done[r] === undefined)) return "locked";
	return "available";
}

/** Calendar bounties reset at midnight in Thailand; active quests can still be finished after a reset or level-up. */
export function questResetAt(q: Quest, completedAt: number): number {
 if (!q.repeatPeriod) return q.repeatHours ? completedAt + q.repeatHours * 3600000 : Infinity;
 const day = 86400000, offset = 7 * 3600000, localDay = Math.floor((completedAt + offset) / day);
 if (q.repeatPeriod === 'daily') return (localDay + 1) * day - offset;
 const weekday = ((localDay + 3) % 7 + 7) % 7;
 return (localDay + 7 - weekday) * day - offset;
}

export function acceptQuest(state: QuestState, id: string, level: number, now: number, data: GameData) {
	const q = data.quests.quests.find(q => q.id === id);
	if (!q) throw Error("ไม่พบเควสต์");
	const status = questStatus(q, state, level, now);
	if (status === "locked") throw Error(level < q.level ? `ต้องการระดับ ${q.level}` : "ยังรับเควสต์นี้ไม่ได้");
	if (status === "cooldown") throw Error("รอรอบใหม่ก่อน");
	if (status !== "available") throw Error("รับเควสต์นี้แล้ว");
	if (Object.keys(state.active).length >= data.quests.maxActive) throw Error(`รับเควสต์พร้อมกันได้สูงสุด ${data.quests.maxActive} เควสต์`);
	state.active[id] = { at: now, progress: q.objectives.map(() => 0) };
	return q;
}

/** Counts a kill for every matching active objective; returns the ids that changed. */
export function recordKill(state: QuestState, monsterId: string, data: GameData) {
	const changed: string[] = [];
	for (const [id, a] of Object.entries(state.active)) {
		const q = data.quests.quests.find(q => q.id === id);
		if (!q) continue;
		q.objectives.forEach((o, i) => {
			if (o.kind === "kill" && o.monsters.includes(monsterId) && a.progress[i] < o.count) { a.progress[i]++; if (!changed.includes(id)) changed.push(id); }
		});
	}
	return changed;
}
export function recordStore(state: QuestState, data: GameData) {
	const changed: string[] = [];
	for (const [id, a] of Object.entries(state.active)) {
		const q = data.quests.quests.find(q => q.id === id);
		q?.objectives.forEach((o, i) => { if (o.kind === "store" && a.progress[i] < o.count) { a.progress[i]++; if (!changed.includes(id)) changed.push(id); } });
	}
	return changed;
}

/** Items the turn-in takes from the bag (collect objectives). */
export const questTurnInItems = (q: Quest) =>
	q.objectives.flatMap(o => (o.kind === "collect" ? [{ template: o.item, qty: o.count }] : []));

export function completeQuest(state: QuestState, id: string, now: number) {
	delete state.active[id];
	state.done[id] = now;
}
/** Where each quest giver stands in the city plaza. */
export function giverPosition(giver: QuestGiver) {
	if (giver === "guard") return GATE_CAPTAIN;
	if (giver === "heal") return HEALER;
	return CITY_BUILDINGS.find(b => b.id === giver)!.talk;
}
export const QUEST_TALK_RANGE = 3.5;
export const questsFor = (giver: QuestGiver, data: GameData) => data.quests.quests.filter(q => q.giver === giver);
