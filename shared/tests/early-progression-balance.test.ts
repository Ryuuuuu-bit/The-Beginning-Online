import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGameData,huntList} from '../src/index.node.js';
import {runBalance} from '../sim/balance.js';

const data=loadGameData();

test('deeper early-map enemies reward more EXP per combat minute with the same build',()=>{
 for(const classId of ['swordsman','archer','mage'])for(const [level,entry,deep] of [
  [10,'forest_young_1',['lantern_wisp','stump_guard']],
  [15,'ruins_young_1',['ruin_shroom','relic_hound','relic_wisp','ruin_guard']],
  [20,'canyon_young_1',['crag_slime','crag_wolf','dust_wisp','crag_guard']],
 ] as const){
  const selected={...data,monsters:{...data.monsters,monsters:data.monsters.monsters.filter(m=>m.id===entry||deep.some(id=>id===m.id))}};
  const {rows}=runBalance({levels:[level],classes:[classId],monster:'all',runs:100,seed:25,pvp:false},selected);
  const rim=rows.find(r=>r.opponent===entry)!;
  for(const row of rows.filter(r=>r.opponent!==entry))assert.ok(row.expPerMinute>rim.expPerMinute,`${classId}/${row.opponent}: ${row.expPerMinute} <= ${rim.expPerMinute}`);
 }
});

test('early live monsters drop healing tiers matching their new levels',()=>{
 for(const map of ['meadow','forest','ruins','canyon'] as const)for(const listed of huntList(map,data)){
  const m=data.monsters.monsters.find(m=>m.id===listed.id)!;
  const expected=m.level<=5?'red_small':m.level<=10?'red_medium':'red_large';
  for(const drop of m.drops.filter(d=>d.item.startsWith('red_')))assert.equal(drop.item,expected,m.id);
  assert.ok(m.drops.some(d=>d.rate>0&&d.item===(m.level<=10?'blue_potion':'blue_large'))||m.drops.some(d=>d.item===expected&&d.rate>0),m.id);
  if(m.level>=11)for(const drop of m.drops.filter(d=>d.item.startsWith('red_')))assert.ok(drop.rate>=.12,m.id);
 }
});

test('early forge upgrades fit the hunting budget and retain non-profitable resale',()=>{
 for(const [prefix,price] of [['iron',600],['sentinel',1500],['relic',3000]] as const){
  assert.equal(data.economy.shops.forge[`${prefix}_sword`],price);
  for(const [id,buy] of Object.entries(data.economy.shops.forge).filter(([id])=>id.startsWith(`${prefix}_`))){
   const item=data.items.items.find(i=>i.id===id)!;
   assert.equal(Math.floor(item.npcPrice*data.economy.sellMultiplier),Math.floor(buy/4),id);
  }
 }
});
