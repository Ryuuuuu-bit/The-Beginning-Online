import {consumableBuffKey,extendConsumableBuff} from '../consumable-buffs.js';
import {passiveValue,passiveHealAmount,passiveAfterHeal} from './mastery-passives.js';
import {endgameTick,endgameAccuracy,endgameDamage,endgameEvade,endgameInterrupt,endgameGuard,endgameKill,endgamePotion,endgameHeal,endgameDot,type EndgameLootState} from './endgame-loot.js';
import type {Skill,Element} from '../schema.js';
import type { Game, Player, Enemy } from './sim.js';
import {restoreMasteryHp} from './mastery-training.js';
import {advancedHealMultiplier,advancedHealLink,masteryOrigin} from './mastery-runtime.js';
import {mixHealAmount} from './mastery-mix.js';

export interface LootEffectState {
 endgame?:EndgameLootState;
 still?:number; lastX?:number; lastZ?:number;
 venom?:{remaining:number;tick:number};
 bleed?:{remaining:number;tick:number;damage:number;map:string};
 frostKill?:{target:number;remaining:number;map:string};frostGuards?:number;frostUniqueGuards?:number;
 nueEvade?:number;nueMap?:string;yokaiInterrupts?:number;decoyMap?:string;
 cooldowns:Record<string,number>; shield:number; shieldFor:number;
 partyShields?:{amount:number;remaining:number;source:string;owner:string;map:string}[];spRegenFor?:number;
 partyPool?:{x:number;z:number;remaining:number;tick:number;map:string;amount:number};
 pool?:{x:number;z:number;remaining:number;tick:number;map:string};
 combo?:{target:number;count:number;remaining:number;map:string};
 eclipse?:{last:'physical'|'magic';count:number;remaining:number;map:string};
 scorpion?:{target:number;count:number;remaining:number;map:string};
}
export interface ItemPoison {sourceUnique?:string;burn?:boolean;refreshed?:boolean;owner:string;remaining:number;tick:number;damage:number; card?:boolean; bleed?:boolean;sourceCard?:string}
const state=(p:Player)=>p.lootEffects??=( {cooldowns:{},shield:0,shieldFor:0} );
const worn=(p:Player,id:string)=>p.inventory?.items.find(i=>i.location==='equip'&&i.template===id&&i.roll?.quality==='unique');
export const hasLootCard=(p:Player,id:string)=>!!p.inventory?.items.some(i=>i.location==='equip'&&i.cards.includes(id));
const ready=(p:Player,id:string)=>!(state(p).cooldowns[id]>0);
const spend=(p:Player,id:string,seconds:number)=>{state(p).cooldowns[id]=seconds;};
const rollValue=(p:Player,id:string,key:string)=>worn(p,id)?.roll?.affixes.find(a=>a.id===key)?.value??0;
function heal(g:Game,p:Player,amount:number,caster?:Player,skill?:Skill,limit=Infinity){const rawAmount=amount,before=p.hp,primary=!masteryOrigin(g)&&!masteryOrigin(g,caster??p);if(primary&&caster&&skill?.id.startsWith('healer_'))amount=passiveHealAmount(g,caster,p,amount,skill);const boosted=Math.min(limit,amount*advancedHealMultiplier(g,p)),adjusted=caster?mixHealAmount(g,caster,p,boosted,skill):boosted,actual=restoreMasteryHp(p,Math.min(limit,adjusted),g,caster,skill?.id);if(actual>0)g.events.push({type:'heal',playerId:p.id,x:p.x,z:p.z,amount:Math.round(actual),...(skill?{skillId:skill.id,hot:skill.id==='healer_03'}:{})});if(primary)passiveAfterHeal(g,caster??p,p,actual,before,skill,rawAmount);return actual;}
function proc(g:Game,p:Player,text:string){g.events.push({type:'item_proc',playerId:p.id,x:p.x,z:p.z,text});}

/** Called only after the potion inventory transaction commits; duplicate requests never call this. */
export function applyPotionEffect(g:Game,p:Player,kind:string,amount:number,duration=3600){
 if(p.dead)return;
 const buff=consumableBuffKey(kind);
 if(buff){p.consumableBuffs=extendConsumableBuff(p.consumableBuffs,buff,amount,duration,g.wallTime||Date.now());p.cd.potion=g.data.skills.skills.find(s=>s.id==='potion')!.cooldown;g.events.push({type:'notice',playerId:p.id,x:p.x,z:p.z,text:(buff==='exp'?'EXP/Job EXP ×2':buff==='drop'?'อัตราดรอป ×2':'วิ่งเร็วขึ้น')+' · ต่อเวลา '+Math.ceil(duration/60)+' นาที'});return;}
 endgamePotion(g,p,kind);
 if(kind==='party_hp'||kind==='party_cleanse'){applyPartyAid(g,p,kind,amount);p.cd.potion=g.data.skills.skills.find(s=>s.id==='potion')!.cooldown;return;}
 if(kind==='hp'){
  heal(g,p,amount*(1+passiveValue(g,p,'healer_08','potionBonus')/100)*(1+rollValue(p,'unique_tide_crown','medicine')/100)*(worn(p,'unique_volcano_relic')?.92:1));
  if(hasLootCard(p,'card_king_jelly')&&ready(p,'king_card')){const s=state(p);s.shield=20;s.shieldFor=4;spend(p,'king_card',12);proc(g,p,'การ์ดราชาวุ้น · เกราะ 20');}
  if(worn(p,'unique_tide_crown')&&ready(p,'tide_pool')){
   state(p).pool={x:p.x,z:p.z,remaining:3,tick:0,map:g.mapId};spend(p,'tide_pool',12);proc(g,p,'มงกุฎแอ่งน้ำ · ฟื้นฟู 3 วินาที');
   g.events.push({type:'item_pool',playerId:p.id,x:p.x,z:p.z,r:2,duration:3});
  }
 }else if(kind==='sp'){p.mp=Math.min(p.maxMp,p.mp+amount*(hasLootCard(p,'card_bud_shroom')?1.15:1));if(hasLootCard(p,'card_himmapan_golden_macaque')&&ready(p,'macaque_card')){p.statuses=p.statuses.filter(v=>v.sourceId!=='card_himmapan_golden_macaque');p.statuses.push({id:'speed',sourceId:'card_himmapan_golden_macaque',remaining:2,value:.1});spend(p,'macaque_card',10);}}

 p.cd.potion=g.data.skills.skills.find(s=>s.id==='potion')!.cooldown+(worn(p,'unique_tide_crown')?2:0);
}
/** Direct basic hit only: no DOT/reflect/proc can feed the combo or trigger another item. */
export function lootHitDamage(g:Game,p:Player,e:Enemy,skillId:string,damage:number,crit:boolean,sourceSkill?:Skill){
 if(damage<=0)return 0;
 if(worn(p,'unique_himmapan_relic'))damage*=.94;
 const skill=g.data.skills.skills.find(s=>s.id===skillId);
 if(skillId==='basic'){spend(p,'jackal_charge',0);spend(p,'eclipse_charge',0);}
 if((g.data.monsters.monsters.find(m=>m.id===e.dataId)?.hardDef??0)>0){const copies=p.inventory?.items.filter(i=>i.location==='equip').flatMap(i=>i.cards).filter(id=>id==='card_desert_sand_ushabti').length??0;damage*=1+.05*copies;}
 if(hasLootCard(p,'card_desert_08')&&!ready(p,'sphinx_buff'))damage*=1.05;
 if(hasLootCard(p,'card_desert_08')||worn(p,'unique_desert_relic')){
  const type=skill?.type==='magic'?'magic':'physical',s=state(p);
  if(!s.eclipse||s.eclipse.map!==g.mapId||s.eclipse.remaining<=0)s.eclipse={last:type,count:1,remaining:5,map:g.mapId};
  else{s.eclipse.count=s.eclipse.last!==type?s.eclipse.count+1:1;s.eclipse.last=type;s.eclipse.remaining=5;}
  if(s.eclipse.count>=3){s.eclipse.count=0;
   if(hasLootCard(p,'card_desert_08')&&ready(p,'sphinx_card')){spend(p,'sphinx_card',15);spend(p,'sphinx_buff',3);proc(g,p,'การ์ดสฟิงซ์ · สลับพลังสำเร็จ');}
   if(worn(p,'unique_desert_relic')&&ready(p,'eclipse_unique')){spend(p,'eclipse_unique',10);spend(p,'eclipse_charge',5);proc(g,p,'ตราสุริยคราส · ตีปกติถัดไปเจาะเกราะ');}
  }
 }
 if(skill?.type==='magic'&&hasLootCard(p,'card_dewdrop_moth')){if(!ready(p,'moth_buff'))damage*=1.05;spend(p,'moth_buff',3);}
 damage=lootHeavyDamage(p,skill?.sp??0,skill?.percent??0,damage);
 if(skillId!=='basic'||damage<=0)return endgameDamage(g,p,e,skillId,damage,crit,sourceSkill);
 if(worn(p,'unique_yokai_relic')||!ready(p,'yokai_shadow'))damage*=.95;
 if(hasLootCard(p,'card_frost_03')&&state(p).frostKill&&state(p).frostKill!.remaining>0&&state(p).frostKill!.map===g.mapId&&state(p).frostKill!.target!==e.id&&ready(p,'frost_wolf')){p.statuses.push({id:'speed',sourceId:'card_frost_03',remaining:2,value:.1});delete state(p).frostKill;spend(p,'frost_wolf',8);}
 if(hasLootCard(p,'card_frost_fractured_valkyrie')&&!ready(p,'valkyrie_charge')){p.mp=Math.min(p.maxMp,p.mp+3);spend(p,'valkyrie_charge',0);}
 if(hasLootCard(p,'card_desert_03')&&e.statuses.some(v=>v.id==='slow')&&ready(p,'sand_serpent_card')&&g.random()<.1){e.itemPoisons=[...(e.itemPoisons??[]).filter(v=>v.sourceCard!=='card_desert_03'||v.owner!==p.id),{owner:p.id,remaining:3,tick:0,damage:Math.max(1,Math.round(p.stats.atk*.03*(e.boss?.5:1))),bleed:true,sourceCard:'card_desert_03'}];spend(p,'sand_serpent_card',8);}
 if(hasLootCard(p,'card_desert_glass_scorpion')){const s=state(p);if(!s.scorpion||s.scorpion.target!==e.id||s.scorpion.map!==g.mapId||s.scorpion.remaining<=0)s.scorpion={target:e.id,count:0,remaining:5,map:g.mapId};s.scorpion.count++;s.scorpion.remaining=5;if(s.scorpion.count>=4){s.scorpion.count=0;if(ready(p,'scorpion_card')){const stronger=e.statuses.some(v=>v.id==='def_down'&&v.value>.04);if(!stronger){e.statuses=e.statuses.filter(v=>v.id!=='def_down');e.statuses.push({id:'def_down',sourceId:'card_desert_glass_scorpion',remaining:3,value:.04});}spend(p,'scorpion_card',10);}}}
 if(hasLootCard(p,'card_himmapan_06')&&!ready(p,'vine_lion_buff')){damage*=1.08;spend(p,'vine_lion_buff',0);}
 if(hasLootCard(p,'card_iron_pincer_crab')&&!ready(p,'crab_buff')){damage*=1.15;spend(p,'crab_buff',0);}
 if(hasLootCard(p,'card_root_boar')&&ready(p,'boar_card')){
  const bleeding=e.itemPoisons?.some(v=>v.bleed&&v.remaining>0);
  if(bleeding)p.mp=Math.min(p.maxMp,p.mp+2);
  else e.itemPoisons=[...(e.itemPoisons??[]),{owner:p.id,remaining:4,tick:0,damage:2,bleed:true}];
  spend(p,'boar_card',3);
 }
 if(hasLootCard(p,'card_pebble_puff')&&e.hp===e.maxHp&&ready(p,'pebble_card')){damage*=1.1;spend(p,'pebble_card',8);proc(g,p,'การ์ดกรวดผลึก · เปิดการโจมตี');}
 if(hasLootCard(p,'card_shade_wolf')&&crit&&ready(p,'wolf_card')){p.mp=Math.min(p.maxMp,p.mp+3);spend(p,'wolf_card',6);proc(g,p,'การ์ดหมาป่าเงา · SP +3');}
 if(worn(p,'unique_mist_weaver')){
  damage*=.92;const s=state(p);
  if(!s.combo||s.combo.target!==e.id||s.combo.map!==g.mapId||s.combo.remaining<=0)s.combo={target:e.id,count:0,remaining:5,map:g.mapId};
  s.combo.count++;s.combo.remaining=5;
  if(s.combo.count>=3){s.combo.count=0;if(ready(p,'weaver_poison')){
   const poison={owner:p.id,remaining:4,tick:0,damage:Math.max(1,Math.round(p.stats.atk*.12*(1+rollValue(p,'unique_mist_weaver','venom')/100)*(e.boss?.5:1)))};
   e.itemPoisons=[...(e.itemPoisons??[]).filter(v=>v.owner!==p.id||v.card||v.bleed||v.burn||v.sourceUnique),poison];spend(p,'weaver_poison',4);proc(g,p,'ถุงมือทอหมอก · พิษ 4 วินาที');
  }}
 }
 return endgameDamage(g,p,e,skillId,damage,crit,sourceSkill);
}
/** Charges apply to one successful basic attack, so prepared multi-hit skills cannot multiply them. */
export function lootArmourPen(p:Player,skillId:string){return skillId==='basic'?((hasLootCard(p,'card_desert_06')&&!ready(p,'jackal_charge')?.06:0)+(worn(p,'unique_desert_relic')&&!ready(p,'eclipse_charge')?.1:0)):0;}
export function lootAccuracy(p:Player,e?:Enemy){let value=endgameAccuracy(p,e)+(hasLootCard(p,'card_desert_oasis_hawk')&&!ready(p,'hawk_buff')?10:0);if(e){const d=Math.hypot(p.x-e.x,p.z-e.z)||1,side=Math.abs(((p.x-e.x)*e.fx+(p.z-e.z)*e.fz)/d)<.5;if(side&&hasLootCard(p,'card_yokai_03'))value+=12;if(e.motion==='attack'&&e.windup>0&&hasLootCard(p,'card_yokai_bamboo_kodama'))value+=12;}return value;}
export function lootCrit(p:Player){return hasLootCard(p,'card_yokai_rain_nue')&&!ready(p,'nue_buff')?3:0;}
export function lootHeavyDamage(p:Player,sp:number,percent:number,damage:number){if(damage>0&&sp>=15&&percent>=120&&hasLootCard(p,'card_yokai_08')&&!ready(p,'oni_charge')){spend(p,'oni_charge',0);return Math.round(damage*1.08);}return damage;}
/** A generated shadow takes one connected normal melee hit, never a boss pattern, projectile or DOT. */
export function lootDecoyAbsorb(g:Game,p:Player,damage:number,source?:Enemy,attack?:string){if(damage>0&&source&&attack==='attack'&&!ready(p,'yokai_shadow')&&state(p).decoyMap===g.mapId){spend(p,'yokai_shadow',0);g.events.push({type:'yokai_decoy_break',playerId:p.id,x:p.x,z:p.z,duration:.5});proc(g,p,'หน้ากากจันทร์ซ้อน · เงารับการโจมตี');return 0;}return damage;}
export function lootEvadedRanged(p:Player){if(hasLootCard(p,'card_desert_oasis_hawk')&&ready(p,'hawk_card')){spend(p,'hawk_card',8);spend(p,'hawk_buff',3);}}
export function lootAbsorb(p:Player,damage:number){const s=p.lootEffects;if(!s)return damage;if(s.shieldFor>0){const take=Math.min(s.shield,damage);s.shield-=take;damage-=take;}for(const shield of s.partyShields??[])if(shield.remaining>0){const take=Math.min(shield.amount,damage);shield.amount-=take;damage-=take;}return damage;}
export function lootAfterHurt(g:Game,p:Player,damage:number,element?:string){
 if(damage>0&&p.hp>0&&element==='water'&&hasLootCard(p,'card_frost_winter_wavehorse')&&ready(p,'wavehorse_card')){p.statuses.push({id:'speed',sourceId:'card_frost_winter_wavehorse',remaining:2,value:.1});spend(p,'wavehorse_card',10);}
 if(damage>0&&p.hp>0&&element==='water'&&hasLootCard(p,'card_himmapan_03')&&ready(p,'makara_card')){grantPartyShield(g,p,p,'makara_card');spend(p,'makara_card',10);}
 if(damage>0&&p.hp>0&&hasLootCard(p,'card_lotus_rabbit')&&ready(p,'rabbit_card')){
  p.statuses=p.statuses.filter(s=>s.sourceId!=='card_lotus_rabbit');p.statuses.push({id:'speed',sourceId:'card_lotus_rabbit',remaining:2,value:.2});spend(p,'rabbit_card',8);
 }
 if(damage>0&&p.hp>0&&hasLootCard(p,'card_jelly_pink')&&ready(p,'jelly_card')){spend(p,'jelly_card',8);heal(g,p,6);proc(g,p,'การ์ดวุ้นจิ๋ว · HP +6');}
}
export function tickPlayerLoot(g:Game,p:Player,dt:number){
 endgameTick(g,p,dt);
 const tracked=state(p),moved=tracked.lastX!==undefined&&Math.hypot(p.x-tracked.lastX,p.z-tracked.lastZ!)>.01;
 if(!hasLootCard(p,'card_lotus_rabbit'))p.statuses=p.statuses.filter(s=>s.sourceId!=='card_lotus_rabbit');
 tracked.still=moved||p.moving?0:(tracked.still??0)+dt;tracked.lastX=p.x;tracked.lastZ=p.z;
 if(hasLootCard(p,'card_greek_gorgon'))for(const v of p.statuses)if(v.id==='slow')v.remaining-=dt*.25;
 if(hasLootCard(p,'card_desert_seal_mummy'))for(const v of p.statuses)if(v.id==='slow'&&v.value>=.95)v.remaining-=dt*(1/.85-1);
 if(hasLootCard(p,'card_yokai_rain_umbrella'))for(const v of p.statuses)if(v.id==='slow')v.remaining-=dt*(1/.9-1);
 if(hasLootCard(p,'card_oretail_lizard'))for(const v of p.statuses)if(v.id==='slow')v.remaining-=dt/3;
 if(hasLootCard(p,'card_mist_weaver'))for(const v of p.statuses)if(v.sourceId==='thorn_web')v.remaining-=dt*3/7;
 const s=p.lootEffects;
 if(s){
  s.partyShields=(s.partyShields??[]).filter(v=>{v.remaining-=dt;return v.remaining>0&&v.amount>0&&v.map===g.mapId;});
  if(s.spRegenFor){if(!p.dead&&hasLootCard(p,'card_himmapan_01'))p.mp=Math.min(p.maxMp,p.mp+.2*Math.min(dt,s.spRegenFor));s.spRegenFor=Math.max(0,s.spRegenFor-dt);}
  if(s.partyPool){const pool=s.partyPool;if(p.dead||pool.map!==g.mapId||!worn(p,'unique_himmapan_relic'))delete s.partyPool;else{pool.tick+=Math.min(dt,pool.remaining);pool.remaining-=dt;while(pool.tick>=1-1e-8){pool.tick-=1;for(const ally of partyInRange(g,p,Infinity))if(Math.hypot(ally.x-pool.x,ally.z-pool.z)<=2)heal(g,ally,pool.amount);}if(pool.remaining<=0)delete s.partyPool;}}
  for(const id of Object.keys(s.cooldowns)){s.cooldowns[id]=Math.max(0,s.cooldowns[id]-dt);if(id.startsWith('end:')&&!s.cooldowns[id])delete s.cooldowns[id];}
  s.shieldFor=Math.max(0,s.shieldFor-dt);if(!s.shieldFor||!hasLootCard(p,'card_king_jelly'))s.shield=0;
  if(s.combo){s.combo.remaining-=dt;if(p.dead||s.combo.map!==g.mapId||!worn(p,'unique_mist_weaver'))delete s.combo;}
  if(s.eclipse){s.eclipse.remaining-=dt;if(p.dead||s.eclipse.map!==g.mapId||!(hasLootCard(p,'card_desert_08')||worn(p,'unique_desert_relic')))delete s.eclipse;}
  if(s.scorpion){s.scorpion.remaining-=dt;if(p.dead||s.scorpion.map!==g.mapId||!hasLootCard(p,'card_desert_glass_scorpion'))delete s.scorpion;}
  if(s.frostKill){s.frostKill.remaining-=dt;if(p.dead||s.frostKill.remaining<=0||s.frostKill.map!==g.mapId||!hasLootCard(p,'card_frost_03'))delete s.frostKill;}
  if(p.dead){s.frostGuards=0;s.frostUniqueGuards=0;}if(!hasLootCard(p,'card_frost_fractured_valkyrie'))s.frostGuards=0;if(!worn(p,'unique_frost_relic'))s.frostUniqueGuards=0;
  if(p.dead||s.decoyMap&&s.decoyMap!==g.mapId)spend(p,'yokai_shadow',0);if(!hasLootCard(p,'card_yokai_08'))s.yokaiInterrupts=0;
  if(s.pool){const pool=s.pool;if(p.dead||pool.map!==g.mapId||!worn(p,'unique_tide_crown'))delete s.pool;
   else {pool.tick+=Math.min(dt,pool.remaining);pool.remaining-=dt;while(pool.tick>=1-1e-8){pool.tick-=1;if(Math.hypot(p.x-pool.x,p.z-pool.z)<=2)heal(g,p,6);}if(pool.remaining<=0)delete s.pool;}
  }
 }
 if(!p.dead&&hasLootCard(p,'card_clay_puff')&&g.time-p.lastCombat>=5)healQuiet(p,dt*2);
 if(!p.dead&&hasLootCard(p,'card_frost_06')&&!moved&&!p.moving&&g.time-p.lastCombat>=5)healQuiet(p,dt*p.maxHp*.002);
}
function healQuiet(p:Player,amount:number){restoreMasteryHp(p,amount);}
export function tickEnemyLoot(g:Game,e:Enemy,dt:number,onDamage:(owner:Player,damage:number,element:Element|'poison')=>void){
 if(e.dead){e.itemPoisons=[];return;}
 for(const poison of e.itemPoisons??[]){
  const p=g.players.get(poison.owner);if(!p||p.dead||!(poison.sourceUnique?worn(p,poison.sourceUnique):poison.sourceCard?hasLootCard(p,poison.sourceCard):poison.card?hasLootCard(p,'card_thorn_nest_mother'):poison.bleed?hasLootCard(p,'card_root_boar'):worn(p,'unique_mist_weaver'))){poison.remaining=0;continue;}
  poison.tick+=Math.min(dt,poison.remaining);poison.remaining-=dt;
  while(poison.tick>=1-1e-8&&!e.dead){poison.tick-=1;onDamage(p,Math.round(endgameDot(p,e,poison.damage,!!poison.burn)),poison.burn?'fire':poison.sourceUnique==='unique_dragon_relic'?'wind':poison.bleed?'neutral':'poison');}
 }
 e.itemPoisons=(e.itemPoisons??[]).filter(v=>v.remaining>0);
}
export function lootGuard(g:Game,p:Player,source?:Enemy,heavy=false){
 if(p.hp>0)endgameGuard(g,p,source,heavy);
 if(p.hp<=0)return;
 if(hasLootCard(p,'card_dew_beetle')&&ready(p,'beetle_card')){heal(g,p,5);spend(p,'beetle_card',6);}
 if(!source)return;
 if(hasLootCard(p,'card_frost_01')&&ready(p,'draugr_card')){spend(p,'draugr_card',10);spend(p,'draugr_buff',3);}
 if(hasLootCard(p,'card_frost_fractured_valkyrie')&&ready(p,'valkyrie_card')){const s=state(p);s.frostGuards=(s.frostGuards??0)+1;if(s.frostGuards>=3){s.frostGuards=0;spend(p,'valkyrie_card',8);spend(p,'valkyrie_charge',5);proc(g,p,'การ์ดวาลคีรี · ตีปกติถัดไป SP +3');}}
 if(worn(p,'unique_frost_relic')&&ready(p,'frost_unique')){const s=state(p);s.frostUniqueGuards=(s.frostUniqueGuards??0)+1;if(s.frostUniqueGuards>=3){s.frostUniqueGuards=0;grantPartyShield(g,p,p,'frost_unique',.04,4);spend(p,'frost_unique',12);proc(g,p,'หัวใจฟยอร์ด · เกราะเหมันต์');}}
 if(source.boss&&heavy&&hasLootCard(p,'card_frost_08')&&ready(p,'jotun_card')){const allies=partyInRange(g,p,6).filter(a=>a.id!==p.id).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z)).slice(0,3);if(allies.length){for(const ally of allies)grantPartyShield(g,p,ally,'jotun_card');spend(p,'jotun_card',15);proc(g,p,'การ์ดโยตุน · เกราะให้แนวร่วม');}}
}
export function lootStillReduction(p:Player,element?:string,physical=true){const still=!p.moving&&(state(p).still??0)>=2;return (hasLootCard(p,'card_clay_pot_doll')&&still?.92:1)*(element==='water'&&hasLootCard(p,'card_himmapan_jade_turtle')&&still?.92:1)*(physical&&hasLootCard(p,'card_frost_01')&&!ready(p,'draugr_buff')?.97:1)*(element==='wind'&&hasLootCard(p,'card_yokai_rain_umbrella')?.97:1);}
export function lootMovementMultiplier(p:Player){return p.lootEffects?.partyShields?.some(s=>s.source==='frost_unique'&&s.remaining>0&&s.amount>0&&s.map===p.mapId)?.96:1;}
export function lootSkillCost(p:Player,base:number,offensive=true){return base*(base>0&&hasLootCard(p,'card_frost_rune_raven')&&!ready(p,'raven_charge')?.95:1)*(base>0&&offensive&&hasLootCard(p,'card_yokai_06')&&!ready(p,'fox_charge')?.95:1);}
/** Spend only after all cast validations; free basic attacks never consume the next paid skill. */
export function lootSkillSpent(g:Game,p:Player,base:number,effect?:string,offensive=true){if(base>0){spend(p,'raven_charge',0);if(offensive)spend(p,'fox_charge',0);}if(['guard','endure','heal','taunt'].includes(effect??'')&&hasLootCard(p,'card_frost_rune_raven')&&ready(p,'raven_card')){spend(p,'raven_card',8);spend(p,'raven_charge',5);proc(g,p,'การ์ดอีกาอักขระ · สกิลถัดไปใช้ SP −5%');}}
export function lootReflect(p:Player){if(hasLootCard(p,'card_pine_hedgehog')&&ready(p,'pine_card')){spend(p,'pine_card',3);return 4;}return 0;}
export function lootInterrupted(p:Player,g?:Game,enemy?:Enemy){
 endgameInterrupt(g,p,enemy);
 if(hasLootCard(p,'card_yokai_lantern_rokurokubi')&&enemy&&Math.hypot(enemy.x-p.x,enemy.z-p.z)>2&&ready(p,'rokuro_card')){p.mp=Math.min(p.maxMp,p.mp+3);spend(p,'rokuro_card',10);}
 if(hasLootCard(p,'card_yokai_08')&&ready(p,'oni_card')){const s=state(p);s.yokaiInterrupts=Math.min(2,(s.yokaiInterrupts??0)+1);if(s.yokaiInterrupts===2){s.yokaiInterrupts=0;spend(p,'oni_card',15);spend(p,'oni_charge',5);}}
 if(hasLootCard(p,'card_desert_06')&&ready(p,'jackal_card')){spend(p,'jackal_card',10);spend(p,'jackal_charge',5);}if(g&&hasLootCard(p,'card_himmapan_azure_garuda')&&ready(p,'garuda_card')){const ally=partyInRange(g,p,6).filter(a=>a.id!==p.id).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];if(ally){grantPartyShield(g,p,ally,'garuda_card');spend(p,'garuda_card',10);}}if(hasLootCard(p,'card_iron_pincer_crab')&&ready(p,'crab_card')){spend(p,'crab_card',8);spend(p,'crab_buff',5);}}
export function lootOnKill(g:Game,e:Enemy,p:Player){
 endgameKill(g,p,e);
 if(!e.summoned&&hasLootCard(p,'card_frost_03')&&ready(p,'frost_wolf'))state(p).frostKill={target:e.id,remaining:5,map:g.mapId};
 if(e.summoned&&hasLootCard(p,'card_desert_01')&&ready(p,'scarab_card')){heal(g,p,Math.max(1,Math.round(p.maxHp*.01)));spend(p,'scarab_card',10);}
 if(!hasLootCard(p,'card_thorn_nest_mother')||!ready(p,'mother_card')||!e.itemPoisons?.some(v=>!v.card&&!v.bleed&&!v.burn&&v.remaining>0))return;
 spend(p,'mother_card',8);
 for(const other of g.enemies.filter(v=>!v.dead&&Math.hypot(v.x-e.x,v.z-e.z)<=3).slice(0,5)){
  other.itemPoisons=[...(other.itemPoisons??[]).filter(v=>!(v.card&&v.owner===p.id)),{owner:p.id,remaining:3,tick:0,damage:other.boss?1:3,card:true}];
 }
 proc(g,p,'การ์ดแม่รังหนาม · พิษแพร่รัศมี 3');
}

const harmful=new Set(['slow','stun','knockup','poison','burn','freeze','silence','blind','sleep','curse','fear','def_down']);
function partyInRange(g:Game,p:Player,radius:number){return (g.partyMembers?.(p.id)??[p.id]).map(id=>g.players.get(id)).filter((a):a is Player=>!!a&&!a.dead&&a.mapId===g.mapId&&Math.hypot(a.x-p.x,a.z-p.z)<=radius);}
function grantPartyShield(g:Game,owner:Player,target:Player,source:string,fraction=.02,duration=3){if(owner.id!==target.id&&hasLootCard(owner,'card_ocean_mist_isle_siren'))duration*=1.05;const s=state(target);s.partyShields=[...(s.partyShields??[]).filter(v=>v.source!==source||v.owner!==owner.id),{amount:Math.max(1,Math.round(target.maxHp*fraction)),remaining:duration,source,owner:owner.id,map:g.mapId}];if(source==='frost_unique'||source==='jotun_card')g.events.push({type:'frost_signal',playerId:target.id,x:target.x,z:target.z,r:1.1,duration:.7});}
export function lootEvadedWarning(p:Player,g?:Game){
 endgameEvade(g,p);
 if(hasLootCard(p,'card_yokai_01')&&ready(p,'kappa_card')){p.mp=Math.min(p.maxMp,p.mp+2);spend(p,'kappa_card',8);}
 if(hasLootCard(p,'card_yokai_rain_nue')&&ready(p,'nue_card')){const s=state(p);if(s.nueEvade!==undefined&&s.nueMap===p.mapId&&(g?.time??0)>=s.nueEvade&&(g?.time??0)-s.nueEvade<=6){spend(p,'nue_card',12);spend(p,'nue_buff',3);s.nueEvade=undefined;}else{s.nueEvade=g?.time??0;s.nueMap=p.mapId;}}
 if(hasLootCard(p,'card_yokai_06')&&ready(p,'fox_card')){spend(p,'fox_card',10);spend(p,'fox_charge',5);}
 if(worn(p,'unique_yokai_relic')&&ready(p,'yokai_unique')){spend(p,'yokai_unique',15);spend(p,'yokai_shadow',5);state(p).decoyMap=p.mapId;if(g){proc(g,p,'หน้ากากจันทร์ซ้อน · เงากระดาษ');g.events.push({type:'yokai_decoy',playerId:p.id,x:p.x+1.4,z:p.z+1.4,duration:5});}}
 if(hasLootCard(p,'card_himmapan_06')&&ready(p,'vine_lion_card')){spend(p,'vine_lion_card',8);spend(p,'vine_lion_buff',5);}}
/** Shared with inventory prevalidation: never heal a stranger or someone in another room. */
export function partyAidTarget(g:Game,p:Player,kind:string){const candidates=partyInRange(g,p,6).filter(a=>kind==='party_hp'?a.hp<a.maxHp:a.statuses.some(v=>harmful.has(v.id))||!!a.lootEffects?.venom||(a.lootEffects?.bleed?.remaining??0)>0);return candidates.sort((a,b)=>(a.id===p.id?1:0)-(b.id===p.id?1:0)||Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];}
export function healPartyMember(g:Game,caster:Player,target:Player,amount:number,skill?:Skill,limit=Infinity){
 if(!partyInRange(g,caster,skill?.range??6).includes(target))return 0;
 const ally=target.id!==caster.id,low=target.hp<target.maxHp*.4;
 if(ally&&low&&hasLootCard(caster,'card_himmapan_blossom_deer')&&ready(caster,'deer_card')){amount*=1.08;spend(caster,'deer_card',8);}
 const beforeHeal=target.hp,actual=heal(g,target,amount,skill&&skill.id.startsWith('healer_')?caster:undefined,skill,limit);if(!masteryOrigin(g,caster))endgameHeal(g,caster,target,actual,beforeHeal);
 advancedHealLink(g,caster,target,actual,skill,(a,n)=>heal(g,a,n));
 if(actual>0&&ally&&!masteryOrigin(g,caster)){if(hasLootCard(caster,'card_himmapan_01')&&ready(caster,'kinnari_card')){state(caster).spRegenFor=3;spend(caster,'kinnari_card',8);}
  if(worn(caster,'unique_himmapan_relic')&&ready(caster,'naga_pool')){state(caster).partyPool={x:target.x,z:target.z,remaining:3,tick:0,map:g.mapId,amount:Math.max(1,Math.round(caster.maxHp*.01))};spend(caster,'naga_pool',12);g.events.push({type:'item_pool',playerId:caster.id,x:target.x,z:target.z,r:2,duration:3});}
 }return actual;
}
function applyPartyAid(g:Game,p:Player,kind:string,amount:number){const target=partyAidTarget(g,p,kind);if(!target)return;if(kind==='party_hp'){healPartyMember(g,p,target,amount);return;}
 target.statuses=target.statuses.filter(v=>!harmful.has(v.id));if(target.lootEffects){delete target.lootEffects.venom;delete target.lootEffects.bleed;}
 if(target.id!==p.id&&hasLootCard(p,'card_himmapan_08')&&ready(p,'naga_card')){const allies=partyInRange(g,p,6).filter(a=>a.id!==p.id).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z)).slice(0,3);for(const ally of allies)grantPartyShield(g,p,ally,'naga_card');spend(p,'naga_card',15);}
 proc(g,p,'ธูปชำระธารา · ล้างสถานะให้'+target.name);
}
