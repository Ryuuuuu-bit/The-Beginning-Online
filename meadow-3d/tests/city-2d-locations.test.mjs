import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {city2dWalkable,route,FORTIFICATION_SOLIDS} from '../src/city-2d-layout.ts';
import {TOWN_NPCS,WAYPOINTS,CITY_EXITS,nearbyTownNpc,nearbyWaypoint,nearbyExit,waypointArrival} from '../src/city-2d-locations.ts';
import {CITY_NPC_CLIPS} from '../src/city-npc-clips.ts';
import {CITY_BUILDINGS,HEALER,GATE_CAPTAIN} from '@the-beginning-online/shared/maps';
import jobs from '../../shared/data/jobs.json' with {type:'json'};

test('six essential stationary service NPCs are reachable',()=>{
 assert.equal(TOWN_NPCS.length,6);
 assert.equal(WAYPOINTS.length,4);
 assert.deepEqual(new Set(TOWN_NPCS.map(n=>n.id)),new Set(['market','forge','storage','healer','angel','captain']));
 assert.equal(new Set(TOWN_NPCS.map(n=>n.id)).size,TOWN_NPCS.length);
 for(const npc of TOWN_NPCS){assert.ok(city2dWalkable(npc.x,npc.z,.4),npc.id);assert.ok(route({x:0,z:14},npc).length,npc.id);assert.ok(CITY_NPC_CLIPS[npc.art],npc.art);assert.equal(nearbyTownNpc(npc.x,npc.z)?.id,npc.id);}
 assert.deepEqual(new Set(Object.keys(CITY_NPC_CLIPS)),new Set(['clerk','blacksmith','merchant','healer','guard','herbalist','angel','north-guard','east-guard','west-guard']));
 for(const clip of Object.values(CITY_NPC_CLIPS))assert.ok(readFileSync(new URL('../public'+clip.file,import.meta.url)).length>0);
});

test('service NPCs use the authoritative shop, healer and class anchors',()=>{
 for(const b of CITY_BUILDINGS){const n=TOWN_NPCS.find(n=>n.id===b.id);assert.equal(n.x,b.talk.x);assert.equal(n.z,b.talk.z);assert.equal(n.kind,b.id);}
 for(const [id,p]of [['healer',HEALER],['captain',GATE_CAPTAIN],['angel',jobs.angel]]){const n=TOWN_NPCS.find(n=>n.id===id);assert.equal(n.x,p.x);assert.equal(n.z,p.z);}
 assert.equal(nearbyTownNpc(45,45),undefined);
});

test('every waypoint and its landing are connected and walkable',()=>{
 for(const p of WAYPOINTS){
   const dest=waypointArrival(p.id);assert.ok(dest);
   assert.ok(city2dWalkable(p.x,p.z,.5),p.id);
   assert.ok(city2dWalkable(dest.x,dest.z,.5),p.id);
   assert.ok(route({x:0,z:14},dest).length,p.id);
   assert.equal(nearbyWaypoint(p.x,p.z)?.id,p.id);
 }
 assert.equal(waypointArrival('missing'),undefined);
 assert.equal(nearbyWaypoint(0,14),undefined);
});
test('removed gate towers leave no invisible blockers and all four warps remain reachable',()=>{
 assert.equal(CITY_EXITS.length,4);
 for(const p of FORTIFICATION_SOLIDS)assert.equal(city2dWalkable(p.x,p.z,.38),false);
 for(const gate of CITY_EXITS){assert.equal(nearbyExit(gate.x,gate.z)?.id,gate.id);assert.ok(route({x:0,z:14},gate).length);}
 for(let v=40;v<=46;v+=.25)for(const sign of [-1,1]){assert.ok(city2dWalkable(0,v*sign,.38),'north/south corridor');assert.ok(city2dWalkable(v*sign,0,.38),'east/west corridor');}
 assert.equal(city2dWalkable(-5,46,.38),true,'removed south tower leaves no blocker');
 assert.equal(city2dWalkable(46,5,.38),true,'removed east tower leaves no blocker');
});
