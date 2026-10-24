# Starter world authoring

## Current level progression (2026-10-25)

The live progression supersedes the older level examples below:

| Map | Levels |
| --- | --- |
| meadow | 1–5 |
| forest | 5–10 |
| ruins | 10–15 |
| canyon | 15–20 |
| grove | 20–25 |
| summit | 25–30 |
| temple | 30–35 |
| himmapan | 35–40 |
| desert | 40–44 / 45–49 |
| frost | 50–54 / 55–59 |
| yokai | 60–64 / 65–69 |
| dragon, volcano | 70–74 / 75–79 |
| fae, ocean | 80–84 / 85–89 |
| astral, abyss | 90–94 / 95–99 |
| confluence | 100 |

Later bands use the existing physical habitats, named with their five-level range in
Tiled. Map geometry, gate connections and the Lv.100 invitation requirement stay the
same. Monster stats, EXP and gold were rescaled with the changed monster levels;
equipment bases and new Unique rolls follow the new progression. Existing template
IDs and saved roll values remain valid. Owned equipment uses the updated template's
base stats; saved item levels above 10 still enforce their original level requirement.
Character levels and quest completion are unchanged. Shop prices, potion strengths
and Unique affix bounds are retained; playtest pacing and boss difficulty before UAT.

Open `starter-world.world` in Tiled to see the city and all four playable hunting maps.
The source files are `south-meadow.tmj`, `east-forest.tmj`, `north-ruins.tmj` and
`west-quarry.tmj`. The last two filenames retain the earlier theme-plan directions;
the implemented connections now use all four city gates: south → meadow, east → forest,
north → ruins, west → canyon. Each region returns directly through its facing gate.
`city-reference.tmj` is an editor reference.

The live MMORPG city uses `shared/src/game/maps.ts` and `city-details.ts` for
its six quarters, buildings, service anchors and collision. `city-2d-locations.ts`
defines 16 named NPCs and their dialogue; the game, minimap and world-map service
list use those same records. Forty ambient residents follow collision-checked
district routes through `city-2d-life.ts`. Preview the exact game scene at
`http://127.0.0.1:5173/city-2d-review.html`; choose a district or NPC, press E to
talk, M for the overview, or use the evening-light button. Ambient residents and
the added lore NPCs are presentation only; shops, storage, healing and class
changes retain their existing server authority.

Six additional NPC identities are drawn with GPT through sprite-gen and shipped in
`meadow-3d/public/assets/city-spritegen-v1/`. `city-spritegen-clips.ts` preserves
the composed atlas's explicit rectangles and timing. Generation references,
four-pose idle previews and QA reports are in `output/city-spritegen-v1/`.
The player now draws at 2.1 m, close to these NPCs and the ambient residents;
all hero motions share the same pixel scale and foot anchor.

The western route now continues from canyon to `grove.tmj` (Lv.20–25), then
`summit.tmj` (Lv.25–30). Both are playable local maps with reciprocal gates,
two monster habitats, three camps, and one boss arena. Entry-level combat tests
cover map entrances; group encounters and bosses still need tuning.

## Edit and preview

Use Node.js 22.18 or newer (the importer uses Node's native TypeScript support).

1. Edit the relevant `.tmj` in Tiled and save it as a JSON map.
2. Run `npm run maps:import` from the repository root.
3. Run `npm run dev:server` and `npm run dev:meadow`.
4. Open `http://127.0.0.1:5173/world-design.html` for the world plan and top-down layout.
5. Enter the game and test every habitat, camp, boss and gate in the edited map.

`npm run build:shared` imports the source automatically. `npm run maps:check` detects
stale generated data. Do not edit `shared/data/maps/*.generated.json` directly.
Commit the Tiled sources and generated JSON together.

## Coordinates and supported objects

The editor uses an **orthogonal top-down map**, even though the game renders at an oblique
angle. The map property `pixelsPerMetre` is 32. Tiled's top-left pixel origin is converted
to the centre of the map in world metres. `width` and `height` are Tiled tile counts.

| Object type | Tiled shape | Custom properties |
| --- | --- | --- |
| `path` | Polyline | `pathWidth` in world metres, using the game's existing path-width convention |
| `water` | Ellipse | Optional `bridgeZ` (absolute world Z), `bridgeHalf` (half-width in metres) |
| `obstacle` | Circular ellipse | `kind`: use `tree` or `boulder` with the current art |
| `landmark` | Circular ellipse or rectangle | `kind`: existing landmark art, such as `giant-tree` |
| `structure` | Circular ellipse (ruins only) | `kind`: `ruins-wall-x`, `ruins-wall-z`, `ruins-arch`, `ruins-house`, `ruins-foundation`, `ruins-temple`, `ruins-column`, `ruins-pier`, `ruins-statue`, `ruins-fallen` |
| `entry` | Point | Exactly one arrival point |
| `gate` | Point named `north`, `east`, `south` or `west` | `destination`: must match that map's implemented connection |
| `camp` | Point | The game adds the two-metre HP regeneration marker |
| `arena` | Circular ellipse | Exactly one boss arena |
| `spawn` | Ellipse | `dataId`, `variant` (`pink`, `mint`, `sky`), integer `count` |
| `poi` | Point | Human-readable object name and `kind`, such as `garden`, `bridge`, `orchard` |

The current importer deliberately rejects rotated objects, offset layers, polygons, tile
objects and external object templates. Use unrotated object layers without offsets.
Layer visibility is only an editor aid: hiding a layer does not remove its collision.
When moving water, update its bridge properties and the crossing path together.

The same imported geometry drives server collision, client movement, scenery placement,
minimap terrain and navigation destinations. Spawn zones are expanded deterministically
into individual spawns, avoiding blocked ground, camps and the arrival area.

## Verification

- `npm run test:shared` checks conversion, malformed input and reachability of every camp,
  POI, bridge bank and boss from the entrance.
- `npm run check:meadow` checks the renderer and design preview.
- `npm test` runs the complete existing suite.
- `npm run build` checks the production web/server build.

The design board previews all four live layouts and the four city-gate connections.
High-level monsters and bosses keep their original stats. New small approach monsters use
existing painted art at a smaller scale, with combat stats copied from existing level peers.
Their initial drops are small potions; regional resources and quest redesign are separate work.

## Meadow art and habitats

The spawn ellipses now define named hunting destinations: pink jellies near town and the
flower garden, mint jellies in the western orchard, and sky jellies on the eastern river
bank beyond the bridge. The existing levels remain 1 / 3 / 3, with the level-5 King in its
own arena. Total regular population remains 42 (22 pink, 10 mint, 10 sky).

Object kind `orchard-tree` uses flowering-tree art with the authored circular collision.
Rectangle landmarks of kind `fence-span` use the existing wooden fence art. Point POIs of
kind `sign` place physical signposts and their nearby direction labels. Move these in
Tiled so the rendered landmarks, navigation destinations and collision stay aligned.
Soft flowers and ground patches in `meadow-art.ts` decorate the authored garden, orchard,
bridge and arena; they do not add hidden collision.

## Regional art and habitats

Each other field keeps its original 54 deep-area monsters and adds approach habitats:

| Map | Habitats (existing monster levels) | Visual landmarks |
| --- | --- | --- |
| Forest | Shrooms 6, wolves 9, wisps 11, stumps 13; boss 15 | Mushroom beds, shaded den, lantern pond, old hollow trees, stone ring |
| Ruins | Shrooms 16, hounds 18, wisps 20, guards 21; boss 22 | Broken houses, paved plaza, rune court, fern court, temple arena |
| Canyon | Slimes 23, wolves 25, wisps 27, guards 29; boss 30 | Mineral seams, ridge trail, amber ground, stone circles |

The forest approach adds levels 1 and 3 (70 regular monsters total); ruins add 1, 3, 6
and 10 (86 total); canyon adds 1, 3, 6, 10, 16 and 20 (102 total). Every added habitat
contains eight regular monsters. Levels rise with distance from the city arrival.

The forest expands westward; ruins rotate into a northward region with a southern
arrival; canyon faces west with an eastern arrival. The city paths are open with a nearby
rest camp, and level-1 monsters can be reached without passing a high-level spawn zone.
These are quiet arrival buffers, not invulnerable safe zones: monsters still fight normally.
The older field-to-field gate chain is replaced by routes through the city.

`artId` and `visualScale` on new monster records reuse shipped art without duplicating
atlases. The renderer and bestiary both resolve these fields; combat, rewards and HP
remain authoritative on the server. No new dependencies or database migrations are needed.

`regional-art.ts` decorates authored POIs with existing painted sprites and baked ground
details. These are visual landmarks, not new harvestable resources. Signs, named habitats,
HUD area labels, the minimap and world-map walking destinations use the same imported data.
The forest has connected northern and southern loops; its trees leave those paths clear.

Ruins structures generate their collision feet during import: moving a wall or arch in
Tiled moves both the rendered masonry and its collision. Do not author duplicate
`ruins-foot` objects. Other solid scenery uses the circular `obstacle` layer. Meadow-only
rectangle/circle landmarks remain unsupported on other fields, so no invisible solids can
be added through an art type the regional renderer does not draw.

Tiled format reference: <https://doc.mapeditor.org/en/stable/reference/json-map-format/>

## Biomes and mythology

The current seven field maps have biome identities in `biome-plan.json`. `/world-design.html` displays the playable regions and eleven proposed regions through Lv.100 with explicit status. See `docs/world-lv1-100-plan.md` for the full roster, scope, level-cap work and production order. Proposed regions are not runtime maps. The playable western chain now continues through summit to `temple.tmj` (Lv.40–49).
