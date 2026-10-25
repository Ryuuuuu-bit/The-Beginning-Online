import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDiscoveredMaps,cityWarpDestination} from '../src/map-discovery.js';
import {IntentSchema} from '../src/game/protocol.js';
import {MAP_ENTRY} from '../src/game/maps.js';

test('discovery sanitizes saves and backfills only the city and saved current map',()=>{
 assert.deepEqual(normalizeDiscoveredMaps(null),['city_plaza']);
 assert.deepEqual(normalizeDiscoveredMaps(['forest','forest','not_a_map',null],'meadow'),['city_plaza','meadow','forest']);
 assert.deepEqual(normalizeDiscoveredMaps({forest:true},'forest'),['city_plaza','forest']);
});

test('city warps require a discovered destination, a living player and the city as origin',()=>{
 const maps=normalizeDiscoveredMaps(['forest']);
 assert.equal(cityWarpDestination('city_plaza','meadow',maps),null);
 assert.equal(cityWarpDestination('forest','forest',maps),null);
 assert.equal(cityWarpDestination('city_plaza','forest',maps,true),null);
 assert.equal(cityWarpDestination('city_plaza','city_plaza',maps),null);
 assert.deepEqual(cityWarpDestination('city_plaza','forest',maps),{mapId:'forest',...MAP_ENTRY.forest});
 assert.ok(IntentSchema.safeParse({t:'cityWarp',mapId:'forest'}).success);
 for(const input of [{t:'cityWarp',mapId:'not_a_map'},{t:'cityWarp',mapId:'forest',x:999},{t:'cityWarp',mapId:'forest',discoveredMaps:['forest']}])assert.equal(IntentSchema.safeParse(input).success,false);
});
