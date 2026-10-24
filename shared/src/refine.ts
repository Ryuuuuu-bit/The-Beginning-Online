import type { GameData, Modifier, Weapon } from './schema.js';
import type { OwnedItem } from './inventory.js';

/** Highest refine level an item can reach. */
export const REFINE_MAX = 15;
export const REFINE_SAFE_LEVEL = 10;
/** Index = target level - 1. +1..+4 never fail; reaching +10 establishes a permanent floor. */
export const REFINE_TABLE: readonly { chance: number; gold: number }[] = [
	{ chance: 1, gold: 200 }, { chance: 1, gold: 400 }, { chance: 1, gold: 700 }, { chance: 1, gold: 1000 },
	{ chance: 0.75, gold: 1500 }, { chance: 0.6, gold: 2200 }, { chance: 0.45, gold: 3000 },
	{ chance: 0.3, gold: 4000 }, { chance: 0.2, gold: 5500 }, { chance: 0.12, gold: 7500 },
	// The protected +10 floor starts a new progression band.
	{ chance: 0.55, gold: 10000 }, { chance: 0.45, gold: 14000 }, { chance: 0.35, gold: 19000 },
	{ chance: 0.25, gold: 25000 }, { chance: 0.15, gold: 32000 },
];
/** Per refine level: weapons gain their primary ATK/MATK, other armour pieces gain hard DEF, as a share of the item's base value. */
export const REFINE_WEAPON_SHARE = 0.05;
export const REFINE_ARMOUR_SHARE = 0.06;
const ARMOUR_TYPES = ['armour', 'shield', 'garment', 'footgear'];

/** One equipped weapon establishes the cap tier; armour and extra card slots cannot stack it. */
export function refineStatCaps(weapon:Weapon|undefined,level:number,data:GameData){
 const caps={...data.stats.caps,maxAspdMultiplier:2.2},tier=level>=15?3:level>=10?2:level>=5?1:0,lift=[0,.03,.05,.08][tier];
 if(['sword1h','bow','dagger'].includes(weapon??''))caps.maxCrit+=lift;
 if(weapon==='staff')caps.maxCastReduction+=lift;
 if(weapon==='dagger'||weapon==='unarmed')caps.maxAspdMultiplier+=tier*.1;
 if(weapon==='bow')caps.maxMoveSpeed+=lift;
 if(['sword2h','axe','spear','mace'].includes(weapon??''))caps.maxBonusPerCategory+=tier*.1;
 return caps;
}
export function refineCapLines(t:GameData['items']['items'][number],level:number,data:GameData){
 if(t.type!=='weapon'||level<5)return [];
 const caps=refineStatCaps(t.weaponType,level,data),base=refineStatCaps(undefined,0,data),lines:string[]=[];
 if(caps.maxCrit>base.maxCrit)lines.push(`เพดานคริติคอล ${Math.round(caps.maxCrit*100)}%`);
 if(caps.maxCastReduction>base.maxCastReduction)lines.push(`เพดานลดเวลาร่าย ${Math.round(caps.maxCastReduction*100)}%`);
 if(caps.maxAspdMultiplier>base.maxAspdMultiplier)lines.push(`เพดานความเร็วโจมตี ×${Number(caps.maxAspdMultiplier.toFixed(1))} จากความเร็วฐาน`);
 if(caps.maxMoveSpeed>base.maxMoveSpeed)lines.push(`เพดานความเร็วเดิน +${Math.round((caps.maxMoveSpeed-1)*100)}%`);
 if(caps.maxBonusPerCategory>base.maxBonusPerCategory)lines.push(`เพดานโบนัสเผ่า/ธาตุ/ขนาด +${Math.round(caps.maxBonusPerCategory*100)}% ต่อหมวด`);
 return lines;
}
type Template = GameData['items']['items'][number];
export interface RefineMilestone {level:number;modifier:Modifier}
/** Fixed bonuses are derived from the current refine level, never rolled into prefix/suffix slots. */
export function refineMilestones(t:Template):RefineMilestone[]{
 if(!refineKind(t))return [];
 if(t.type==='weapon'){
  const weapons:Record<string,Modifier[][]>={
   sword1h:[[{kind:'percent',stat:'atk',value:.05},{kind:'flat',stat:'hardDef',value:5}],[{kind:'percent',stat:'maxHp',value:.1},{kind:'flat',stat:'crit',value:.03}],[{kind:'percent',stat:'atk',value:.15},{kind:'percent',stat:'maxHp',value:.1}]],
   sword2h:[[{kind:'percent',stat:'atk',value:.08},{kind:'flat',stat:'hit',value:5}],[{kind:'sizeBonus',target:'large',value:.15},{kind:'flat',stat:'crit',value:.03}],[{kind:'percent',stat:'atk',value:.2},{kind:'flat',stat:'hardDef',value:10}]],
   bow:[[{kind:'percent',stat:'atk',value:.05},{kind:'flat',stat:'hit',value:10}],[{kind:'flat',stat:'crit',value:.06},{kind:'stat',stat:'dex',value:3}],[{kind:'percent',stat:'atk',value:.15},{kind:'percent',stat:'moveSpeed',value:.05}]],
   dagger:[[{kind:'percent',stat:'atk',value:.05},{kind:'percent',stat:'aspd',value:.06}],[{kind:'flat',stat:'crit',value:.08},{kind:'flat',stat:'flee',value:10}],[{kind:'percent',stat:'atk',value:.12},{kind:'percent',stat:'aspd',value:.08}]],
   staff:[[{kind:'percent',stat:'matk',value:.05},{kind:'percent',stat:'maxSp',value:.1}],[{kind:'percent',stat:'castMul',value:-.1},{kind:'stat',stat:'int',value:5}],[{kind:'percent',stat:'matk',value:.15},{kind:'percent',stat:'maxSp',value:.1}]],
   unarmed:[[{kind:'percent',stat:'atk',value:.05},{kind:'percent',stat:'maxSp',value:.1}],[{kind:'percent',stat:'aspd',value:.08},{kind:'percent',stat:'spRegen',value:.15}],[{kind:'percent',stat:'atk',value:.15},{kind:'percent',stat:'spRegen',value:.2}]],
   mace:[[{kind:'percent',stat:'atk',value:.05},{kind:'flat',stat:'hardDef',value:8}],[{kind:'percent',stat:'maxHp',value:.12},{kind:'flat',stat:'hardMdef',value:10}],[{kind:'percent',stat:'atk',value:.15},{kind:'percent',stat:'maxHp',value:.12}]],
   axe:[[{kind:'percent',stat:'atk',value:.08},{kind:'stat',stat:'str',value:3}],[{kind:'sizeBonus',target:'medium',value:.15},{kind:'flat',stat:'hit',value:10}],[{kind:'percent',stat:'atk',value:.2},{kind:'flat',stat:'crit',value:.04}]],
   spear:[[{kind:'percent',stat:'atk',value:.05},{kind:'flat',stat:'hit',value:15}],[{kind:'sizeBonus',target:'large',value:.2},{kind:'flat',stat:'hardDef',value:8}],[{kind:'percent',stat:'atk',value:.15},{kind:'flat',stat:'crit',value:.05}]],
  };
  return weapons[t.weaponType??(refineBase(t).stat==='matk'?'staff':'sword1h')].flatMap((mods,index)=>mods.map(modifier=>({level:(index+1)*5,modifier})));
 }
 const bonuses:Record<string,Modifier[]>={
  // Flat defence stays useful even when the character starts with zero hard DEF/MDEF.
  armour:[{kind:'percent',stat:'maxHp',value:.08},{kind:'flat',stat:'hardDef',value:15},{kind:'percent',stat:'maxHp',value:.2}],
  shield:[{kind:'flat',stat:'hardDef',value:10},{kind:'percent',stat:'maxHp',value:.1},{kind:'flat',stat:'hardMdef',value:20}],
  garment:[{kind:'flat',stat:'flee',value:10},{kind:'flat',stat:'hardMdef',value:15},{kind:'percent',stat:'moveSpeed',value:.08}],
  footgear:[{kind:'percent',stat:'moveSpeed',value:.05},{kind:'flat',stat:'flee',value:10},{kind:'percent',stat:'maxHp',value:.15}],
 };
 return bonuses[t.type].map((modifier,index)=>({level:(index+1)*5,modifier}));
}

export function refineKind(t: Template | undefined): 'weapon' | 'armour' | null {
	if (!t?.slot) return null;
	return t.type === 'weapon' ? 'weapon' : ARMOUR_TYPES.includes(t.type) ? 'armour' : null;
}
/** The stat a refine level raises and the item's base value for it. */
export function refineBase(t: Template): { stat: 'atk' | 'matk' | 'hardDef'; base: number } {
	if (t.type === 'weapon') return (t.matk ?? 0) > (t.atk ?? 0) ? { stat: 'matk', base: t.matk ?? 0 } : { stat: 'atk', base: t.atk ?? 0 };
	return { stat: 'hardDef', base: t.modifiers.reduce((n, m) => n + (m.kind === 'flat' && m.stat === 'hardDef' ? m.value : 0), 0) };
}
/** Higher bands award 2/3/5 growth units per step; low-stat gear uses the same minimum. */
export function refineBonusValue(t: Template, level: number) {
	if (!level || !refineKind(t)) return 0;
	const { base } = refineBase(t), share = t.type === 'weapon' ? REFINE_WEAPON_SHARE : REFINE_ARMOUR_SHARE;
	const units=Math.min(level,4)+Math.max(0,Math.min(level,9)-4)*2+Math.max(0,Math.min(level,14)-9)*3+Math.max(0,level-14)*5;
	return Math.max(units, Math.round(base * share * units));
}
export function refineModifiers(item: Pick<OwnedItem, 'refine'>, t: Template): Modifier[] {
	const value = refineBonusValue(t, item.refine);
	return value ? [{ kind: 'flat', stat: refineBase(t).stat, value },...refineMilestones(t).filter(m=>item.refine>=m.level).map(m=>m.modifier)] : [];
}
/** What the next attempt costs and risks, or a Thai reason the item cannot be refined. */
export function refineQuote(item: OwnedItem, data: GameData): { next: number; chance: number; gold: number; stone: string; failTo: number } | string {
	const t = data.items.items.find((t) => t.id === item.template), kind = refineKind(t);
	if (!kind) return 'ตีบวกได้เฉพาะอาวุธ เกราะ โล่ ผ้าคลุม และรองเท้า';
	if (item.refine >= REFINE_MAX) return `ตีบวกถึง +${REFINE_MAX} แล้ว`;
	const next = item.refine + 1, { chance, gold } = REFINE_TABLE[next - 1];
	return { next, chance, gold, stone: kind === 'weapon' ? 'weapon_stone' : 'armour_stone', failTo: chance < 1 ? Math.max(item.refine>=REFINE_SAFE_LEVEL?REFINE_SAFE_LEVEL:0, item.refine - 1) : item.refine };
}
