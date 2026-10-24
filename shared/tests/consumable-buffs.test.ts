import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGameData,extendConsumableBuff,consumableBuffValue,consumableBuffText,levelReward,deriveStats,createGame,applyPotionEffect,grantExp,spawn,step} from '../src/index.node.js';
const data=loadGameData();

test('consumable buffs last at least an hour, extend time without stacking strength, and expire offline',()=>{
 const now=1000000;
 const first=extendConsumableBuff(undefined,'speed',.2,60,now);
 assert.equal(first.speed!.until,now+3600000);
 const twice=extendConsumableBuff(first,'speed',.2,3600,now+1000);
 assert.equal(twice.speed!.until,now+7200000);
 assert.equal(consumableBuffValue({consumableBuffs:twice},'speed',now+3600000),.2);
 assert.equal(consumableBuffValue({consumableBuffs:twice},'speed',now+7200000),undefined);
 for(const id of ['speed_potion','exp_boost_scroll','drop_boost_scroll']){
  const item=data.items.items.find(i=>i.id===id)!;assert.equal(item.duration,3600);assert.match(consumableBuffText(item)!,/60 นาที/);
 }
 const game=createGame();game.wallTime=now;applyPotionEffect(game,game.p,'speed',.2,60);
 assert.deepEqual(game.p.consumableBuffs,first);
});

test('EXP scroll doubles both base and job awards without changing racial bonuses',()=>{
 const normal=createGame(),boosted=createGame();normal.wallTime=boosted.wallTime=1000000;
 applyPotionEffect(boosted,boosted.p,'boost_exp',2);
 grantExp(normal,normal.p,10,10);grantExp(boosted,boosted.p,10,10);
 assert.equal(boosted.p.xp,Math.round(10*(1+normal.p.stats.expBonus)*2));
 assert.equal(boosted.p.jobExp,normal.p.jobExp*2);
});

test('drop scroll changes actual kill loot, includes racial bonuses and stops at expiry',()=>{
 const loot=(boosted:boolean,expired=false)=>{
  const copy=structuredClone(data),game=createGame(1,copy.stats.defaultBuild,'hunter',copy);game.wallTime=1000000;game.enemies=[];game.random=()=>.2;game.p.stats.dropBonus=.25;
  const enemy=spawn(game,game.p.x+10,game.p.z,false,'pink');
  copy.monsters.monsters.find(m=>m.id===enemy.dataId)!.drops=[{item:'jelly_slime',rate:.1/copy.economy.dropMultiplier,min:1,max:1}];
  if(boosted)applyPotionEffect(game,game.p,'boost_drop',2);
  if(expired)game.wallTime+=3600000;
  enemy.dead=true;enemy.hp=0;enemy.deathAge=10;enemy.damageBy={[game.p.id]:10};step(game,.1);
  return game.drops.flatMap(d=>d.loot??[]).filter(i=>i.template==='jelly_slime');
 };
 assert.equal(loot(false).length,0);assert.equal(loot(true).length,1);assert.equal(loot(true,true).length,0);
});

test('old claimed mail receives only additions and everyone has a 10000 base carry allowance',()=>{
 const old=levelReward(5,data,true),fresh=levelReward(5,data);
 assert.equal(old.gold,4975);assert.equal(fresh.gold,5000);
 assert.equal(old.items.find(i=>i.template==='red_small')!.qty,97);
 assert.equal(old.items.find(i=>i.template==='blue_potion')!.qty,99);
 assert.ok(!old.items.some(i=>i.template==='iron_amulet'));
 for(let level=1;level<=100;level++){const ids=levelReward(level,data).items.map(i=>i.template);for(const id of ['exp_boost_scroll','drop_boost_scroll'])assert.equal(ids.includes(id),[1,30,60,90].includes(level));}
 const base=data.stats.defaultBuild,stats=deriveStats(base,data);
 assert.ok(stats.weight>=10000);
 assert.equal(deriveStats({...base,baseStats:{...base.baseStats,str:base.baseStats.str+1}},data).weight-stats.weight,30);
});

test('mail potion tiers follow the reward level across early and late progression',()=>{
 for(const [level,hp,sp] of [[2,'red_small','blue_potion'],[5,'red_small','blue_potion'],[6,'red_medium','blue_potion'],[10,'red_medium','blue_potion'],[11,'red_large','blue_large'],[20,'red_large','blue_large'],[21,'red_greater','blue_large'],[30,'red_greater','blue_large'],[31,'red_greater','blue_greater'],[49,'red_greater','blue_greater'],[50,'red_supreme','blue_greater'],[60,'red_supreme','blue_supreme'],[100,'red_supreme','blue_supreme']] as const){
  const reward=levelReward(level,data);
  assert.equal(reward.items.find(i=>data.items.items.find(t=>t.id===i.template)?.effect==='hp')!.template,hp);
  assert.equal(reward.items.find(i=>data.items.items.find(t=>t.id===i.template)?.effect==='sp')!.template,sp);
 }
});
