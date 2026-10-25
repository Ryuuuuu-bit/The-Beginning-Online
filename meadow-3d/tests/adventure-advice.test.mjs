import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGameData,emptyQuests} from '@the-beginning-online/shared';
import {LAYOUTS,MAP_ENTRY,gateRoute} from '@the-beginning-online/shared/maps';
import {createPlayerPathfinder} from '@the-beginning-online/shared/pathfinding';
import {adventureAdvice} from '../src/adventure-advice.ts';
const data=loadGameData(),guide={ready:true,step:2,total:14,title:'ออกสู่ทุ่งวุ้นจิ๋ว',text:'ไปประตูใต้',canNavigate:true};
const context=(changes={})=>({map:'city_plaza',player:{...MAP_ENTRY.city_plaza,level:1,hp:100,maxHp:100},guide,quests:emptyQuests(),...changes});

test('angel waits for character Guide and resumes its real lesson without changing progress',()=>{
 assert.equal(adventureAdvice(context({guide:{...guide,ready:false}}),data,0).kind,'loading');
 const c=context(),before=structuredClone(c),a=adventureAdvice(c,data,0);
 assert.equal(a.kind,'guide');assert.equal(a.title,guide.title);assert.match(a.action,/นำทาง/);assert.deepEqual(c,before);
});
test('low HP and completed quest objectives take priority over lessons',()=>{
 const c=context();c.player.hp=20;assert.equal(adventureAdvice(c,data,0).destination.kind,'heal');
 const quest=data.quests.quests.find(q=>q.id==='guard_first_hunt');c.player.hp=100;c.quests.active[quest.id]={at:0,progress:quest.objectives.map(o=>o.count)};
 const a=adventureAdvice(c,data,0);assert.equal(a.kind,'quest');assert.equal(a.destination.kind,'guard');assert.match(a.title,/ส่งเควสต์/);
});
test('active collection goals use live inventory and return to the giver once fulfilled',()=>{
 const c=context({guide:{...guide,step:14}}),q=data.quests.quests.find(q=>q.id==='smith_slime');
 c.quests.active[q.id]={at:0,progress:q.objectives.map(()=>0)};
 const a=adventureAdvice(c,data,0);assert.equal(a.kind,'quest');assert.equal(a.destination.map,'meadow');
 c.player.inventory={version:1,autoPickup:true,items:q.objectives.map((o,i)=>({id:'drop'+i,template:o.item,qty:o.count,location:'bag',slot:null,refine:0,cards:[],bound:false,source:'drop'}))};
 const done=adventureAdvice(c,data,0);assert.equal(done.destination.kind,'forge');assert.match(done.title,/ส่งเควสต์/);
});
test('returning high-level characters with untouched Guide get live hunting goals through Lv100',()=>{
 const huntData={...data,quests:{...data.quests,quests:[]}};
 for(let level=1;level<=100;level++){
  const c=context({guide:{...guide,step:14}});c.player.level=level;
  const a=adventureAdvice(c,huntData,0);assert.equal(a.kind,'hunt','level '+level);
  const dest=a.destination,spawns=LAYOUTS[dest.map].spawns.filter(s=>s.x===dest.x&&s.z===dest.z);
  assert.ok(spawns.some(s=>data.monsters.monsters.some(m=>m.id===s.dataId&&!m.boss&&m.level<=level)));
  assert.ok(gateRoute('city_plaza',dest.map,level).length);
  assert.ok(createPlayerPathfinder(dest.map).findPath(MAP_ENTRY[dest.map],dest).length);
 }
 const old=context({guide:{...guide,step:0}});old.player.level=60;
 assert.equal(adventureAdvice(old,huntData,0).kind,'hunt');
});
