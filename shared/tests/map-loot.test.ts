import test from "node:test";
import assert from "node:assert/strict";
import { loadGameData, FIELD_BOSS } from "../src/index.node.js";
const data = loadGameData();
const item = (id: string) => data.items.items.find((i) => i.id === id)!;
const monster = (id: string) => data.monsters.monsters.find((m) => m.id === id)!;
const materials = (id: string) => monster(id).drops.map((d) => item(d.item)).filter((i) => i.type === "material");

test("each hunting map's monsters drop materials of their own", () => {
	const owner = new Map<string, string>();
	for (const m of data.monsters.monsters.filter((m) => !m.boss && m.level >= 6))
		for (const mat of materials(m.id)) {
			const tier = m.tags.includes('forest') ? 0 : m.tags.includes('ruins') ? 1 : 2;
			const seen = owner.get(mat.id);
			assert.ok(!seen || seen === String(tier), `${mat.id} dropped on two maps (${m.id})`);
			owner.set(mat.id, String(tier));
		}
	for (const id of ["ruin_shroom", "relic_hound", "relic_wisp", "ruin_guard", "crag_slime", "crag_wolf", "dust_wisp", "crag_guard"])
		assert.ok(materials(id).length >= 1, `${id} has a material`);
});

test("field bosses always drop their own trophy and can drop their card", () => {
	for (const { dataId } of Object.values(FIELD_BOSS)) {
		const drops = monster(dataId).drops;
		assert.ok(drops.some((d) => d.rate === 1 && item(d.item).type === "material" && item(d.item).rarity === "rare"), `${dataId} trophy`);
		assert.ok(drops.some((d) => item(d.item).type === "card" && d.rate > 0 && d.rate <= 0.01), `${dataId} card`);
	}
});

test("deeper maps sell for more", () => {
	const price = (id: string) => Math.max(...materials(id).map((i) => i.npcPrice));
	assert.ok(price("ruin_shroom") > price("mist_shroom"));
	assert.ok(price("crag_wolf") > price("relic_hound"));
});

test("potion drops match early HP budgets: 50/150/400 HP, bosses a handful", () => {
	const potions = (id: string) => monster(id).drops.filter((d) => item(d.item).type === "consumable");
	const strongest = (id: string) => Math.max(...potions(id).map((d) => item(d.item).amount ?? 0));
	const order = ["jelly_pink", "mist_shroom", "ruin_shroom", "crag_wolf"];
	assert.deepEqual(order.map(strongest),[50,150,400,400]);
	for (const m of data.monsters.monsters) {if(m.tags.includes('hazard')){assert.deepEqual(m.drops,[]);assert.equal(m.exp,0);assert.equal(m.jobExp,0);assert.deepEqual(m.gold,[0,0]);continue;}assert.ok(potions(m.id).length >= 1, `${m.id} drops a potion`);}
	for (const { dataId } of Object.values(FIELD_BOSS)) assert.ok(potions(dataId).some((d) => d.max >= 2), `${dataId} drops several potions`);
	// Top-tier potions stay shop-only.
	assert.ok(!data.monsters.monsters.some((m) => m.drops.some((d) => /_supreme$/.test(d.item))));
});
