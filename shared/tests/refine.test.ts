import test from "node:test";
import assert from "node:assert/strict";
import { applyInventory, deriveStats, inventoryProfile, loadGameData, refineBonusValue, refineQuote, refineMilestones, refineModifiers, REFINE_MAX, REFINE_TABLE, type Inventory, type OwnedItem } from "../src/index.node.js";
const data = loadGameData(), profile = { ...data.stats.defaultBuild, level: 99 };
let n = 0;
const item = (template: string, extra: Partial<OwnedItem> = {}): OwnedItem => ({ id: `r${++n}`, template, qty: 1, location: "bag", slot: null, refine: 0, cards: [], bound: false, source: "test", ...extra });
const bag = (...items: OwnedItem[]): Inventory => ({ version: 1, autoPickup: true, items });
const refine = (inv: Inventory, target: OwnedItem, gold: number, roll?: number) => applyInventory({ gold, inventory: inv }, { op: "refine", id: target.id, roll }, profile, data, () => "uuid");
const tpl = (id: string) => data.items.items.find((t) => t.id === id)!;

test("refine rates: safe up to +4, strictly decreasing afterwards including +10 to +11, capped at +15", () => {
	assert.equal(REFINE_TABLE.length, REFINE_MAX);
	assert.ok(REFINE_TABLE.slice(0, 4).every((r) => r.chance === 1));
	for (let i = 4; i < REFINE_MAX; i++) assert.ok(REFINE_TABLE[i].chance > 0 && REFINE_TABLE[i].chance < REFINE_TABLE[i - 1].chance && REFINE_TABLE[i].gold > REFINE_TABLE[i - 1].gold);
	assert.match(String(refineQuote(item("training_sword", { refine: 15 }), data)), /\+15/);
	assert.match(String(refineQuote(item("jade_ring"), data)), /ตีบวกได้เฉพาะ/);
	assert.match(String(refineQuote(item("red_small"), data)), /ตีบวกได้เฉพาะ/);
	const q = refineQuote(item("traveler_clothes", { refine: 6 }), data);
	assert.ok(typeof q !== "string" && q.stone === "armour_stone" && q.next === 7 && q.failTo === 5);
});

test("a successful refine spends one stone and gold and raises the level", () => {
	const sword = item("training_sword", { refine: 6 }), stones = item("weapon_stone", { id: "stack:weapon_stone", qty: 3 });
	const out = refine(bag(sword, stones), sword, 5000, 0.1);
	const after = out.state.inventory.items;
	assert.equal(after.find((i) => i.id === sword.id)!.refine, 7);
	assert.equal(after.find((i) => i.id === stones.id)!.qty, 2);
	assert.equal(out.state.gold, 5000 - REFINE_TABLE[6].gold);
	assert.equal(out.ledger.reduce((s, l) => s + l.goldDelta, 0), -REFINE_TABLE[6].gold, "gold change is on the ledger");
});

test("refine budget includes repairs after failures and keeps the protected final band affordable",()=>{
 const gold:number[]=[],stones:number[]=[];
 for(let level=0;level<REFINE_MAX;level++){
  const q=refineQuote(item('training_sword',{refine:level}),data);assert.notEqual(typeof q,'string');if(typeof q==='string')throw Error(q);
  // First-passage cost: failed attempts must recover every lost level before retrying.
  gold[level]=(q.gold+(1-q.chance)*gold.slice(q.failTo,level).reduce((a,b)=>a+b,0))/q.chance;
  stones[level]=(1+(1-q.chance)*stones.slice(q.failTo,level).reduce((a,b)=>a+b,0))/q.chance;
 }
 assert.ok(gold.slice(0,10).reduce((a,b)=>a+b,0)<=80000,'+0 to +10 mean forge fee');
 assert.ok(stones.slice(0,10).reduce((a,b)=>a+b,0)<=25,'+0 to +10 mean stones');
 assert.ok(gold.slice(10).reduce((a,b)=>a+b,0)<=1000000,'+10 to +15 mean forge fee');
 assert.ok(stones.slice(10).reduce((a,b)=>a+b,0)<=100,'+10 to +15 mean stones');
});

test("every weapon/armour refine step uses the quoted probability boundary and spends resources on either result",()=>{
 for(const [template,stone] of [['training_sword','weapon_stone'],['traveler_clothes','armour_stone']])for(let level=0;level<REFINE_MAX;level++){
  const gear=item(template,{refine:level}),q=refineQuote(gear,data);if(typeof q==='string')throw Error(q);
  for(const roll of [q.chance-1e-9,...(q.chance<1?[q.chance]:[])]){
   const material=item(stone,{qty:2}),before=bag(gear,material),out=refine(before,gear,100000,roll);
   assert.equal(out.state.inventory.items.find(i=>i.id===gear.id)!.refine,roll<q.chance?q.next:q.failTo);
   assert.equal(out.state.inventory.items.find(i=>i.id===material.id)!.qty,1);
   assert.equal(out.state.gold,100000-q.gold);
   assert.equal(gear.refine,level,'input inventory is not mutated');
  }
 }
});

test("a failed refine above +4 drops one level; +1..+4 cannot fail", () => {
	const sword = item("training_sword", { refine: 6 }), stones = item("weapon_stone", { id: "stack:weapon_stone", qty: 3 });
	assert.equal(refine(bag(sword, stones), sword, 5000, 0.99).state.inventory.items.find((i) => i.id === sword.id)!.refine, 5);
	const low = item("training_sword", { refine: 2 });
	assert.equal(refine(bag(low, stones), low, 5000, 0.999).state.inventory.items.find((i) => i.id === low.id)!.refine, 3);
});

test("refine needs the server's roll, the right stone and enough gold", () => {
	const sword = item("training_sword"), armour = item("traveler_clothes"), wstone = item("weapon_stone", { id: "stack:weapon_stone" });
	assert.throws(() => refine(bag(sword, wstone), sword, 5000), /เซิร์ฟเวอร์/);
	assert.throws(() => refine(bag(sword, wstone), sword, 5000, 1), /เซิร์ฟเวอร์/);
	assert.throws(() => refine(bag(armour, wstone), armour, 5000, 0), /หินตีบวกเกราะ/);
	assert.throws(() => refine(bag(sword, wstone), sword, 100, 0), /ทองไม่พอ/);
	const stored = item("training_sword", { location: "storage" });
	assert.throws(() => refine(bag(stored, wstone), stored, 5000, 0), /ไม่ใช่ของคุณ/);
});

test("refine levels on worn gear raise ATK and hard DEF", () => {
	const wear = (refine: number) => bag(item("training_sword", { location: "equip", slot: "weapon", refine }), item("traveler_clothes", { location: "equip", slot: "body", refine }));
	const base = deriveStats(inventoryProfile(profile, wear(0), data), data), plus = deriveStats(inventoryProfile(profile, wear(7), data), data);
	assert.ok(plus.atk >= base.atk + refineBonusValue(tpl("training_sword"), 7), "weapon refine adds ATK");
	assert.equal(plus.hardDef - base.hardDef, refineBonusValue(tpl("traveler_clothes"), 7)+5, "armour refine and the sword guard milestone add hard DEF");
	assert.ok(refineBonusValue(tpl("traveler_clothes"), 3) >= 3, "every level is worth at least +1");
});

test("clients ask for a refine but cannot choose its roll", async () => {
	const { IntentSchema } = await import("../src/game/protocol.js");
	const req = "123e4567-e89b-42d3-a456-426614174000";
	assert.ok(IntentSchema.safeParse({ t: "inv", op: "refine", req, id: "x" }).success);
	assert.equal(IntentSchema.safeParse({ t: "inv", op: "refine", req, id: "x", roll: 0 }).success, false);
});

 test("+10 is a floor: failures spend resources, +9 still drops, and +14 can reach +15",()=>{
  for(const level of [9,10,11,12,13,14]){
   const sword=item('training_sword',{refine:level}),stones=item('weapon_stone',{qty:2});
   const out=refine(bag(sword,stones),sword,100000,.999);
   assert.equal(out.state.inventory.items.find(i=>i.id===sword.id)!.refine,level>=10?Math.max(10,level-1):level-1);
   assert.equal(out.state.inventory.items.find(i=>i.id===stones.id)!.qty,1);
   assert.equal(out.state.gold,100000-REFINE_TABLE[level].gold);
  }
  const sword=item('training_sword',{refine:14}),stones=item('weapon_stone',{qty:2});
  const out=refine(bag(sword,stones),sword,100000,0);
  const max=out.state.inventory.items.find(i=>i.id===sword.id)!;
  assert.equal(max.refine,15);
  assert.throws(()=>refine(out.state.inventory,max,out.state.gold,0),/\+15/);
 });
 test("fixed milestones activate at 5/10/15 for each gear type and disappear below their threshold",()=>{
  const types=['weapon','armour','shield','garment','footgear'];
  for(const type of types){
   const t=data.items.items.find(t=>t.type===type&&t.slot)!;
   assert.deepEqual([...new Set(refineMilestones(t).map(m=>m.level))],[5,10,15]);
   for(const level of [0,4,5,9,10,14,15]){
    const mods=refineModifiers({refine:level},t);
    assert.deepEqual(mods.slice(level?1:0),refineMilestones(t).filter(m=>level>=m.level).map(m=>m.modifier));
   }
  }
  assert.deepEqual(refineMilestones(tpl('jade_ring')),[]);
  const magic=data.items.items.find(t=>t.type==='weapon'&&(t.matk??0)>(t.atk??0))!;
  assert.equal(refineMilestones(magic)[0].modifier.kind,'percent');
  assert.deepEqual(refineMilestones(magic).find(m=>m.modifier.kind==='percent'&&m.modifier.stat==='castMul')!.modifier,{kind:'percent',stat:'castMul',value:-.1});
 });
 test("milestones affect actual worn stats once, with downgrade and unequip removing the bonus",()=>{
  const sword=item('training_sword',{refine:10,location:'equip',slot:'weapon'});
  const at=(i:OwnedItem)=>deriveStats(inventoryProfile(profile,bag(i),data),data);
  const ten=at(sword),nine=at({...sword,refine:9});
  assert.ok(Math.abs(ten.crit-nine.crit-.03)<1e-9);
  assert.deepEqual(at(sword),ten,'recalculation never stacks milestones');
  assert.deepEqual(at({...sword,location:'bag',slot:null}),deriveStats(inventoryProfile(profile,bag(),data),data));
  const armour=item('traveler_clothes',{refine:15,location:'equip',slot:'body'});
  assert.ok(at(armour).maxHp>at({...armour,refine:14}).maxHp);
 });
