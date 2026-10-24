import type {GameData} from './schema.js';

/** One-time supplies, not a replacement for hunting income or weapon upgrades. */
export function levelReward(level:number,data:GameData){
 if(!Number.isInteger(level)||level<2||level>data.stats.maxLevel)throw Error('ระดับรางวัลไม่ถูกต้อง');
 const special=level%5===0;
 const hp=level<=5?'red_small':level<=10?'red_medium':level<=20?'red_large':level<50?'red_greater':'red_supreme';
 const sp=level<=10?'blue_potion':level<=30?'blue_large':level<60?'blue_greater':'blue_supreme';
 const items=[{template:hp,qty:special?3:1}];
 if(level%2===0||special)items.push({template:sp,qty:1});
 const gear=special?data.items.items.find(i=>i.slot==='accessory2'&&i.level===(level===100?99:level)&&data.economy.shops.forge[i.id]!==undefined):undefined;
 if(gear)items.push({template:gear.id,qty:1});
 return {level,special,gold:level*(special?5:3),items};
}

export function validateRewardLevels(levels:number[]|undefined,level:number,maxLevel=100){
 if(!levels?.length||levels.length>maxLevel-1||new Set(levels).size!==levels.length||levels.some(n=>!Number.isInteger(n)||n<2||n>Math.min(level,maxLevel)))throw Error('ยังไม่ถึงระดับรางวัล หรือรายการรางวัลไม่ถูกต้อง');
 return [...levels].sort((a,b)=>a-b);
}
