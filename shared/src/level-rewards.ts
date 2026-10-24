import type {GameData} from './schema.js';

function rewardBundle(level:number,data:GameData,large:boolean){
 if(!Number.isInteger(level)||level<1||level>data.stats.maxLevel)throw Error('ระดับรางวัลไม่ถูกต้อง');
 if(level===1)return {level,special:false,gold:0,items:large?['exp_boost_scroll','drop_boost_scroll'].map(template=>({template,qty:1})):[]};
 const special=level%5===0;
 const hp=level<=5?'red_small':level<=10?'red_medium':level<=20?'red_large':level<50?'red_greater':'red_supreme';
 const sp=level<=10?'blue_potion':level<=30?'blue_large':level<60?'blue_greater':'blue_supreme';
 const items=[{template:hp,qty:large?(special?100:50):(special?3:1)}];
 if(large||level%2===0||special)items.push({template:sp,qty:large?(special?100:50):1});
 const gear=special?data.items.items.find(i=>i.slot==='accessory2'&&i.level===(level===100?99:level)&&data.economy.shops.forge[i.id]!==undefined):undefined;
 if(gear)items.push({template:gear.id,qty:1});
 if(large&&special)items.push({template:'speed_potion',qty:1});
 if(large&&[30,60,90].includes(level))for(const template of ['exp_boost_scroll','drop_boost_scroll'])items.push({template,qty:1});
 return {level,special,gold:large?(special?(level<50?5000:10000):0):level*(special?5:3),items};
}

/** Old receipts get only the added contents; previous gold and equipment are kept. */
export function levelReward(level:number,data:GameData,previouslyClaimed=false){
 const reward=rewardBundle(level,data,true);
 if(!previouslyClaimed)return reward;
 const previous=rewardBundle(level,data,false);
 return {...reward,gold:Math.max(0,reward.gold-previous.gold),items:reward.items.map(item=>({...item,qty:item.qty-(previous.items.find(i=>i.template===item.template)?.qty??0)})).filter(i=>i.qty>0)};
}

export function validateRewardLevels(levels:number[]|undefined,level:number,maxLevel=100){
 if(!levels?.length||levels.length>maxLevel||new Set(levels).size!==levels.length||levels.some(n=>!Number.isInteger(n)||n<1||n>Math.min(level,maxLevel)))throw Error('ยังไม่ถึงระดับรางวัล หรือรายการรางวัลไม่ถูกต้อง');
 return [...levels].sort((a,b)=>a-b);
}
