import {MAP_IDS,type MapId} from './game/world-ids.js';
import {MAP_ENTRY} from './game/maps.js';

/** Old characters retain the saved current map; unavailable history is never guessed from level. */
export function normalizeDiscoveredMaps(raw: unknown, current?: MapId): MapId[] {
 const maps = new Set<unknown>(['city_plaza', current]);
 if (Array.isArray(raw)) for (const id of raw) maps.add(id);
 return MAP_IDS.filter(id => maps.has(id));
}

export function cityWarpDestination(from: MapId, to: MapId, discovered: readonly MapId[], dead = false) {
 if (dead || from !== 'city_plaza' || to === from || !discovered.includes(to) || !MAP_IDS.includes(to)) return null;
 return {mapId: to, ...MAP_ENTRY[to]};
}
