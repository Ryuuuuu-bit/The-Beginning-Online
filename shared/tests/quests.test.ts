import test from "node:test";
import assert from "node:assert/strict";
import { loadGameData, emptyQuests, acceptQuest, questStatus, questResetAt, recordKill, completeQuest, normalizeQuests, objectiveProgress } from "../src/index.node.js";
const data = loadGameData();
const q = (id: string) => data.quests.quests.find(q => q.id === id)!;

test('daily and weekly bounties use Thai calendar boundaries, not a client timer',()=>{
 const daily={...q('guard_first_hunt'),repeatPeriod:'daily' as const,maxLevel:4};
 const weekly={...daily,repeatPeriod:'weekly' as const};
 const sunday=Date.parse('2026-10-25T23:59:59+07:00'),monday=Date.parse('2026-10-26T00:00:00+07:00');
 assert.equal(questResetAt(daily,sunday),monday);assert.equal(questResetAt(weekly,sunday),monday);
 assert.equal(questResetAt(weekly,monday),Date.parse('2026-11-02T00:00:00+07:00'));
 const state=emptyQuests();state.done[daily.id]=sunday;
 assert.equal(questStatus(daily,state,4,monday-1),'cooldown');
 assert.equal(questStatus(daily,state,4,monday),'available');
 assert.equal(questStatus(daily,state,5,monday),'locked');
 state.active[daily.id]={at:sunday,progress:[daily.objectives[0].count]};
 assert.equal(questStatus(daily,state,5,monday),'ready');
 assert.equal(normalizeQuests(state,data).active[daily.id].at,sunday);
});

test('every level has one daily and weekly bounty with real loot and modest gold',()=>{
 for(let level=1;level<=100;level++)for(const period of ['daily','weekly']){
  const available=data.quests.quests.filter(q=>q.repeatPeriod===period&&questStatus(q,emptyQuests(),level,Date.now())==='available');
  assert.equal(available.length,1,`${period} Lv.${level}`);
  const quest=available[0];assert.ok(quest.rewards.gold<=1300);assert.ok(quest.rewards.items.every(i=>i.template==='forge_fragment'));
  for(const objective of quest.objectives)if(objective.kind==='kill')assert.ok(objective.monsters.every(id=>data.monsters.monsters.some(m=>m.id===id&&m.level>=quest.level-1&&m.level<=quest.level+5)));
 }
 assert.equal(data.items.items.find(i=>i.id==='forge_fragment')!.bind,'account');
});
test("quest chain: prerequisites and level gate, kill tracking caps at the goal", () => {
	const s = emptyQuests(), now = 1e12;
	assert.equal(questStatus(q("smith_slime"), s, 5, now), "locked");
	acceptQuest(s, "guard_first_hunt", 1, now, data);
	assert.throws(() => acceptQuest(s, "guard_first_hunt", 1, now, data), /รับเควสต์นี้แล้ว/);
	for (let i = 0; i < 12; i++) recordKill(s, "jelly_pink", data);
	assert.deepEqual(s.active.guard_first_hunt.progress, [8]);
	assert.equal(questStatus(q("guard_first_hunt"), s, 1, now), "ready");
	completeQuest(s, "guard_first_hunt", now);
	assert.equal(questStatus(q("guard_first_hunt"), s, 1, now), "done");
	assert.equal(questStatus(q("smith_slime"), s, 1, now), "locked");
	assert.equal(questStatus(q("smith_slime"), s, 2, now), "available");
	assert.throws(() => acceptQuest(s, "healer_colors", 2, now, data), /ระดับ 3/);
});
test("collect objectives read the bag; repeatable bounty cools down for 20 h", () => {
	const s = emptyQuests(), now = 1e12;
	s.done.guard_first_hunt = now;
	acceptQuest(s, "merchant_seeds", 2, now, data);
	const inv = { version: 1 as const, autoPickup: true, items: [{ id: "stack:leaf_seed", template: "leaf_seed", qty: 7, location: "bag" as const, slot: null, refine: 0, cards: [], bound: false, source: "drop" }] };
	assert.deepEqual(objectiveProgress(q("merchant_seeds"), s, inv), [5]);
	assert.equal(questStatus(q("merchant_seeds"), s, 2, now, inv), "ready");
	acceptQuest(s, "guard_bounty", 2, now, data);
	for (const m of ["jelly_pink", "jelly_mint", "jelly_sky"]) for (let i = 0; i < 7; i++) recordKill(s, m, data);
	completeQuest(s, "guard_bounty", now);
	assert.equal(questStatus(q("guard_bounty"), s, 2, now + 19 * 3600000), "cooldown");
	assert.equal(questStatus(q("guard_bounty"), s, 2, now + 20 * 3600000), "available");
});
test("saved quest state is sanitised against the current data", () => {
	const s = normalizeQuests({ active: { guard_first_hunt: { progress: [999], at: 5 }, gone: { progress: [1] } }, done: { smith_slime: 7, nope: 1 } }, data);
	assert.deepEqual(s, { active: { guard_first_hunt: { progress: [8], at: 5 } }, done: { smith_slime: 7 } });
	assert.deepEqual(normalizeQuests(null, data), emptyQuests());
});
