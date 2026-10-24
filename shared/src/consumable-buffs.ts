export type ConsumableBuffKey='speed'|'exp'|'drop';
export type ConsumableBuffs=Partial<Record<ConsumableBuffKey,{until:number;value:number}>>;
export function consumableBuffKey(effect:string):ConsumableBuffKey|undefined{
 return effect==='speed'?'speed':effect==='boost_exp'?'exp':effect==='boost_drop'?'drop':undefined;
}
export function extendConsumableBuff(buffs:ConsumableBuffs|undefined,key:ConsumableBuffKey,value:number,duration:number,now:number):ConsumableBuffs{
 return {...buffs,[key]:{until:Math.max(now,buffs?.[key]?.until??0)+Math.max(3600,duration)*1000,value}};
}
export function consumableBuffValue(p:{consumableBuffs?:ConsumableBuffs}|undefined,key:ConsumableBuffKey,now:number){
 const buff=p?.consumableBuffs?.[key];return buff&&buff.until>now?buff.value:undefined;
}
export function consumableBuffText(item:{effect?:string;amount?:number;duration?:number}){
 const key=consumableBuffKey(item.effect??'');if(!key)return;
 const label=key==='speed'?`ความเร็วเคลื่อนที่ +${Math.round((item.amount??0)*100)}%`:key==='exp'?`EXP/Job EXP ×${item.amount}`:`อัตราดรอป ×${item.amount}`;
 return `${label} · ${Math.ceil(Math.max(3600,item.duration??3600)/60)} นาที · ใช้ซ้ำต่อเวลา`;
}
