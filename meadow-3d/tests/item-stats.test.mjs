import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGameData,refineBonusValue} from '@the-beginning-online/shared';
import {itemStats,compareItemStats,itemStatValue} from '../src/item-stats.ts';
import {modifierText} from '../src/card-text.ts';
const data=loadGameData(),t=data.items.items.find(t=>t.id==='training_sword');
const owned={id:'test',template:t.id,qty:1,location:'bag',slot:null,refine:15,cards:[],bound:false,source:'test',roll:{version:1,quality:'rare',itemLevel:10,affixes:[{id:'force',value:8},{id:'quick',value:2},{id:'keen',value:2}]}};
test('item totals include refine and rolled percentages without mixing units',()=>{
 const rows=itemStats(t,owned,data),get=key=>rows.find(r=>r.key===key);
 assert.equal(get('flat:atk').value,t.atk+8+refineBonusValue(t,15));
 assert.equal(get('percent:atk').value,.2);
 assert.equal(get('percent:aspd').value,.02);
 assert.equal(itemStatValue(get('flat:crit')),'5%');
 assert.equal(itemStatValue(get('percent:aspd')),'2%');
});
test('comparison includes lost stats, percentages and lower-is-better cast time',()=>{
 const mine=itemStats(t,{...owned,refine:0,roll:undefined},data),old=itemStats(t,owned,data);
 const rows=compareItemStats(mine,old);
 assert.equal(rows.find(r=>r.key==='percent:aspd').delta,-.02);
 assert.ok(rows.find(r=>r.key==='flat:atk').improvement<0);
 const magic={...t,modifiers:[{kind:'percent',stat:'castMul',value:-.03}]};
 assert.ok(compareItemStats(itemStats(magic,undefined,data),[]).find(r=>r.key==='percent:castMul').improvement>0);
 assert.match(modifierText(magic.modifiers[0]),/-3%/);
 assert.doesNotMatch(modifierText(magic.modifiers[0]),/\+-/);
});
test('card modifiers contribute to item totals and special cards do not stack twice',()=>{
 const card=data.cards.cards.find(c=>c.modifiers.some(m=>m.kind==='stat'));
 const base=itemStats(t,undefined,data),withCard=itemStats(t,{...owned,refine:0,roll:undefined,cards:[card.id]},data);
 for(const m of card.modifiers.filter(m=>m.kind==='stat'))assert.equal(withCard.find(r=>r.key==='stat:'+m.stat).value,(base.find(r=>r.key==='stat:'+m.stat)?.value??0)+m.value);
});
