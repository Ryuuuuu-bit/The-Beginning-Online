import type {GameData} from './schema.js';
import type {OwnedItem} from './inventory.js';
import {ownedRarity,requiredEquipmentLevel} from './item-rolls.js';

export const FORGE_FRAGMENT='forge_fragment';
export const CRAFT_RECIPES=[{template:'weapon_stone',fragments:8,gold:100},{template:'armour_stone',fragments:6,gold:80}] as const;
export function craftQuote(template:string){
 const recipe=CRAFT_RECIPES.find(r=>r.template===template);
 if(!recipe)throw Error('ไม่มีสูตรคราฟต์นี้');
 return recipe;
}
/** Free starter/mail equipment cannot become saleable stones through an alt character. */
export function salvageQuote(item:OwnedItem,data:GameData):number|string{
 const t=data.items.items.find(t=>t.id===item.template);
 if(!t?.slot||item.location!=='bag')return 'ย่อยได้เฉพาะอุปกรณ์ในกระเป๋า · ถอดอุปกรณ์ก่อน';
 if(!['drop','npc'].includes(item.source))return 'ย่อยได้เฉพาะอุปกรณ์ดรอปหรือซื้อจากร้าน · ของเริ่มต้นและของแจกย่อยไม่ได้';
 if(item.cards.length)return 'อุปกรณ์ที่ติดการ์ดย่อยไม่ได้ เพื่อป้องกันการ์ดหาย';
 const rarity=ownedRarity(item,t.rarity),multiplier={common:1,fine:1,rare:2,epic:3,legendary:4}[rarity];
 return (1+Math.floor(requiredEquipmentLevel(t.level,item)/10))*multiplier;
}
