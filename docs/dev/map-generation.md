# Map generation

Maps are assembled from modular Blender pieces on a grid. The server picks a seed, runs the generator (`Session.layout`), and sends the resulting `MapLayout` (seed plus placements, about 1 KB) to clients in `welcome`. Clients never generate: they only build geometry from the layout they receive, so there is one source of truth even when the map changes during a run. The generator is deterministic, so a seed reproduces a layout for debugging.

Building and exporting pieces is covered in [asset-pipeline.md](asset-pipeline.md).

## Data

| What                                                   | Where                                                                               |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Piece geometry (see asset-pipeline.md, Delivery)       | `static/assets/shared/map/<piece>.<hash>.gltf` + `.bin`, or `afflictions/<id>/map/` |
| Piece sockets, markers, colliders, volumes (generated) | `src/lib/shared/map/pieces.generated.ts`                                            |
| Piece roles and weights (hand-authored)                | `src/lib/content/map/kit.ts`                                                        |
| Types                                                  | `src/lib/shared/map/types.ts`                                                       |
| Grid math                                              | `src/lib/shared/map/grid.ts`                                                        |
| Generator                                              | `src/lib/shared/map/generate.ts`                                                    |
| Seeded RNG                                             | `src/lib/shared/rng.ts`                                                             |
| Client rendering                                       | `src/lib/game/map/MapRenderer.ts`                                                   |

## Coordinates

- World space is Three.js: +X east, +Y up, **+Z south** (north is -Z).
- Grid cell `[i, j]` is centred on `(i * 4, j * 4)`. Levels are 4 m apart.
- A piece's footprint cell `[x, z]` counts from its north-west cell.
- `Placement.position` is the piece origin (floor, footprint centre). `Placement.rotation` is quarter turns around +Y, the same as `Object3D.rotation.y = r * π/2`. A +90° turn maps edges e → n → w → s → e.
- `toWorld(placement, point)` converts a piece-space point (spawn, extract, collider centre) to world space.

## Sockets

A socket is an opening of a given type on a cell edge. Two sockets connect when they have the same type and level, sit in neighbouring cells, and face opposite edges. `worldSocket()` resolves a piece socket under a placement into world grid terms.

There are two types: `hall`, the standard 2 m arch, and `gate`, the 3.2 m opening for the double door between levels. Only the extraction room (`extraction-gate`) and the long stair (`stairs-deep`) have a `gate`, and the generator always joins the two, so no cap seals one.

## Levels

A map is three **levels** stacked one under the other (`GenerateOptions.tiers`). In code a level of the map is a _tier_, because `level` already means a 4 m grid floor. Players see them counted from 1. Each placement records its tier (`Placement.tier`).

- Every level but the deepest ends in an extraction room. Its `gate` opens onto the long stair (role `descent`): a double door (see [Doors](#doors)), then two flights dropping three grid floors to the next level's first corridor. It is the only way between levels.
- Each level is on its own grid floor, three below the one above, so nothing else can join them: loops and joins only ever connect sockets on the same tier and floor.
- The major rooms are shared out evenly between the levels. The final room (the Gloaming Chapel, where the rite is done) is always last on the deepest level.
- **`levels`:** a kit entry can say which levels a piece may appear on, counted from 1 as players see them (`levels: [2, 3]`). Left out, any level. Every placement checks it (`onLevel`: `attach` and the loops' `placeHall`), and the route gives each major room one of its allowed levels, the emptiest of them, the most restricted rooms first (`planRoute`). A map with fewer levels than a room's leaves it out. The crypt is on levels 2 and 3; most of the new rooms say theirs.
- **The level on the banner:** a room's banner shows its name, the level it is on ("Level 2") and its own `banner` line, if the kit entry has one ("Where the priests made ready"). The first time a player reaches a level of the map, a banner names the level itself (`checkRoom` in the play page, from each cell's tier).
- The other openings of an extraction room lead back into its own level.
- Loot depends on the level: see [items.md](items.md#loot-crates).

## Kit roles

`MAP_KIT` (`src/lib/content/map/kit.ts`) gives each piece a role and options:

| Role         | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`      | Expedition start room (`angel-well`, see [The start room](#the-start-room)). An optional `exit` names a piece always attached to its opening.                                                                                                                                                                                                                                                                                      |
| `major`      | Static major room. Every major room is placed on the main route. `final: true` marks the one that goes last and deepest (Gloaming Chapel).                                                                                                                                                                                                                                                                                         |
| `extraction` | A room with a way out and a `gate` (`extraction-gate`). The last room on every level but the deepest, picked by `weight`.                                                                                                                                                                                                                                                                                                          |
| `descent`    | The long stair down to the next level (`stairs-deep`). Attached by its top `gate` to the extraction room's `gate`; its tier is the level it leads down to.                                                                                                                                                                                                                                                                         |
| `connector`  | Passages and minor rooms. `weight` is the relative pick chance. `descends: true` pieces change level and are only attached by their highest socket, so they always lead down. `needsRope: true` (with `descends`) is a rope drop: never on the main route, see step 4. `offRoute: true` keeps a piece off the main route too, for side branches only: `hall-ledge`, whose 1.1 m ledge players mantle and the nav grid can't climb. |
| `end`        | Dead ends that can close an opening instead of a cap.                                                                                                                                                                                                                                                                                                                                                                              |
| `cap`        | Seals an unused opening without occupying a cell. `seals` names the socket type.                                                                                                                                                                                                                                                                                                                                                   |

Any entry can also set `affliction` (a key into `AFFLICTIONS`): the piece is then only generated in maps for that Affliction, and its built files live in `static/assets/afflictions/<id>/`, so other runs never download it. The Gloaming Chapel belongs to the Gloaming. The server passes the chosen Affliction as `GenerateOptions.affliction`, and the layout records it (`MapLayout.affliction`) so the client preloads the right Affliction's models.

## The start room

The Angel's Well (`angel-well`, built by `kit.build_angel_well`) is 2x2 cells and 3 levels. Up top (grid floor 2) is an octagonal chapel under a dome: an arched niche in every wall with candles on its sill, stone benches, and an angel on a plinth in the north niche. The dome rises 2.6 m over the walls, above the piece's three levels (its root's `headroom`; nothing is ever built above the start room). In its middle an open pit, with nothing round its mouth, falls 8 m to a chamber at its foot (floor 0), whose one `hall` opening is the way on. Its kit entry has no `exit`.

- **Spawns:** four, one per party member, in front of the benches (`WELL_SPAWNS`), facing the pit (`spawnPoint`).
- **The way down:** a rope tied for good on the pit's south lip (`anchor-0` with `rope`). It ends 1.7 m over the floor, so players climb down, drop off its end unhurt, and can't climb back up. See [rope.md](rope.md#the-start-rope).
- **The catacombs begin at its foot:** `entryPoint` (`points.ts`) is the floor under that rope. The nav grid grows from there (`buildNav`), so the chapel is off it and creatures never go up, and everything laid out by distance from the start (creatures, loot, the rite's items) measures from there too. Without such a rope `entryPoint` is the first spawn.
- **Admin:** the teleport list has `angel-well` (the first spawn) and `angel-well-foot` (the floor under the pit, to skip the climb).

The old cellar start, `stairwell`, is retired: still in the .blend, out of `MAP_KIT`.

## The final room

The Gloaming Chapel (`gloaming-chapel`, built by `kit.build_gloaming_chapel`; tuning in the `CH_*` constants) is 9x7 cells and 3 levels, always last on the deepest level. It has **one way in**: a `hall` socket in the middle of its south side, a short passage that widens to a gate, and a double door (`door-0`, see [Doors](#doors)) where it meets the nave.

- **The nave:** 11 m wide and about 24 m long to the back of the apse, under a barrel vault (11.8 m at its crown). Nine rows of pews either side of the aisle face north (`CH_PEW_X`: their ends leave a clear 1.4 m walk along each wall), to a dais in two steps (0.25 m each) across the apse: the altar (`rite-0` in front of it), a lectern, and the angel (`import_angel`, 2.8 m) on its plinth at the back, before a great timber cross on the apse wall (`CROSS`), with candles on the altar and the plinth.
- **The way out:** a dark hatch high on the west wall over the dais. Its ladder is its own object (`gloaming-chapel-ladder`), and `extract-0` is at its foot, but neither is there until the Affliction is resolved: `buildCollisionWorld` puts a `final` room's extraction points in `world.sealedExtracts`, not `world.extracts`, and `MapRenderer` keeps a final room's `*-ladder` object out of the merge, hidden. Banishing what the rite summoned calls `unsealExtracts` (server and client), and `MapRenderer.lowerLadders` lets the ladder down out of the hatch (`ladder.lower`; at once for anyone arriving later). See [rite.md](rite.md#the-holder-and-performing-it).
- **The side halls:** a great arch (5 m wide, 4.5 m high) in each nave wall opens into a hall to the east and to the west (about 11 x 14 m, 8 m high). Each has a wall of stacked bones topped with skulls along its north wall (`_bone_stack`), four sarcophagi (`CH_SARCOPHAGI`, `CH_SARC_Y`: two before the bones, two under the landing), a pillar to the ceiling (`CH_SIDE_PILLAR`) and a crate spot (`crate-<n>`) against its outer wall. Bone stacks are dear in triangles: the room is near the 40k budget.
- **The balcony:** in each side hall a wide stair (3.25 m, 20 risers) climbs south along the outer wall to a landing over the south end, solid underneath and behind, back to the south wall. Through an opening in each nave wall the landings join the balcony over the door (4 m up, on two columns), so the balcony runs the whole width, and either stair takes you up. Parapets along the front; the nav grid, creatures and the manifestation go up there too.
- Tested in `server/chapel.test.ts`: one socket and one door, everywhere in it reachable on foot, the door cutting it off until opened, and an explorer walking up each stair.

## Candles

A piece can have candles: `candle-<n>` markers at their wicks (the wax is part of its mesh). The play page's `Candles` feature (`src/lib/game/play/candles.ts`, drawing with `src/lib/game/map/Candles.ts`) draws a flame at every wick, all in one `Points` (one draw call), and gives each piece with candles one warm point light hung over the middle of them. It casts no shadows, flickers, and fades out with distance from the camera, and off it doesn't count against the light budget (see [systems.md](systems.md#rendering)). Tuning is `CANDLES` in `src/lib/content/candles.ts`: the light's colour, strength, range and height, the fade distances, the flicker and the flame's size. The start room and the Gloaming Chapel have candles.

## Doors

A double door stands at the top of every long stair, just behind the extraction room's gate, and one is the only way into the final room (the Gloaming Chapel). It starts shut and barred: holding interact on it for `DOORS.openSeconds` opens it for everyone, for good. Shut, it keeps players out and creatures in; the sound of it opening carries `DOORS.noise` metres.

The final room's door is the exception: the manifestation appearing (the rite, or the admin **Manifest**) slams it shut and seals it (`Doors.seal(room)`, from `AfflictionSystem.summon`), so whoever is inside fights it out with what the rite summoned and whoever is outside stays out. A sealed door can't be opened (`lookedAt` and `open` pass it over). Banishing it unseals and opens it (`Doors.release`, from `AfflictionSystem.resolve`).

| What                                                  | Where                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| Tuning (size, hold time, reach, noise, swing)         | `DOORS` in `src/lib/content/doors.ts`                                     |
| Where they stand (`door-*` markers -> `layout.doors`) | `placeDoors` in `src/lib/shared/map/doors.ts`, called by `generateLayout` |
| Which door you're looking at (client and server)      | `lookedAtDoor` in `doors.ts`                                              |
| Which level of the map a place is on                  | `tierCells` / `tierAt` in `doors.ts`                                      |
| Server state and the hold to open                     | `server/doors.ts`, `server/systems/doors.ts`                              |
| Model and swing                                       | `src/lib/game/map/Doors.ts` (`prop-door-double`, see asset-pipeline.md)   |

- **Collision:** `buildCollisionWorld` adds a box per door, tagged with its id. `openDoor(world, id)` adds the id to `world.openDoors`, and `boxesNear` (which every collision query goes through) leaves those boxes out; `closeDoor` takes it back out. The server opens and shuts it in its world; the client does the same in the player's world as soon as a tick lists it open (or stops listing it), so prediction agrees. A door shut again slams (`SLAM` times faster than it opens).
- **Nav:** `buildNav` builds the grid with every door open, so the levels below are in it, then tags the points in each doorway (`NavPoint.door`). `NavGrid.closed` holds the doors still shut: `findPath` and `gridDistances` don't step onto their doorways, so creatures can't path through. `Doors.open` takes the id out. Laying out the map (creatures, loot, the rite's items) measures through the doors (`gridDistances(..., true)`).
- **Protocol:** each `tick` lists the open doors (`doors`) and the sealed ones (`sealed`), which also covers a reconnect. Opening one is a `doorOpen` event (the bar dropping and the hinges groaning: `door.unbar`, `door.open`); the rite sealing one is `doorSeal` (`door.slam` if it stood open, then `door.seal`), and banishing letting it go is `doorRelease` (heard like opening).
- **Prompt:** looking at a shut door in reach shows "[E] to open the door", filling as `PlayerState.unbarring` grows. A floor item or a crate in the way comes first.
- **Gates:** a `gate-<n>` marker is a door with a lock (`kind: 'gate'`, the Family Mausoleum's): a key or lockpicks open it. See [world.md](world.md#gates).
- **Admin:** the F10 Map group has **Open the doors** (`openDoors`: sealed ones and gates too), and the teleport list has `level-2-door` and `level-3-door` (the long stairs', named for the level they lead to) and `gloaming-chapel-door`, each on the room side of its door. A door records the piece it stands in (`DoorPlacement.piece`).

## False walls

A few dead ends are false: a wall standing in an opening that leads on, to a side passage nothing else reaches ([#21](https://github.com/JoshuaBelden/undercroft/issues/21)). It is the same cap that seals every unused opening, so it looks like any other dead end. A crowbar brings it down.

| What                                           | Where                                                   |
| ---------------------------------------------- | ------------------------------------------------------- |
| Tuning (how many, passage size, prying, noise) | `FALSE_WALLS` in `src/lib/content/map/walls.ts`         |
| Where they stand (`layout.walls`)              | `placeWalls` in `src/lib/shared/map/walls.ts`           |
| Walls to try (every dead end) and looking      | `prySpots`, `lookedAtPrySpot` in `walls.ts`             |
| Prying, bringing one down, the tick's `walls`  | `server/systems/walls.ts` (`WallSystem`)                |
| Drawing them, the prompt, the sounds           | `src/lib/game/play/walls.ts` (the `walls` play feature) |

- **Where:** `placeWalls` (called by `generateLayout` after the doors, seeded by the map seed) looks at every link between two placements (`pieceLinks`) that is the only way from the start to what is beyond it. What is beyond must be `FALSE_WALLS.pieces` (2 to 14) plain connectors or dead ends (no rooms on the route, stairs or rope drops) with at least one crate marker. Up to `FALSE_WALLS.count` (3) are walled, never one inside or around another. The wall is a `WallPlacement`: the cap piece placed in the near side's socket exactly as the generator places caps, with an id (`w1`...).
- **Solid:** `buildCollisionWorld` adds the cap's colliders tagged with the wall's id, as a door's are, so `openDoor(world, id)` takes them away. The nav grid is built with them standing, so what is behind one is left off it: creatures, loose loot, hints, the rite's items and the trunks' keys are placed by distance along the grid, so they stay out (a crate within 2 m of the grid's edge could still count as reachable), and creatures don't follow players in once it is down (the grid isn't rebuilt). The crates behind are rolled as usual: that is the prize.
- **Prying** ([items.md](items.md)): with a `pry` item (the crowbar) in the hand, every wall at the end of a dead end prompts "Pry [E]": every cap, every dead end's fall of rock (its `rubble-<n>` marker) and every false wall (`prySpots`). Holding interact counts `PlayerState.prying` to `FALSE_WALLS.prySeconds` (5 s), heard `pryNoise` away and again every `pryEvery` seconds (`pry` event, `crowbar.pry`). At the end a false wall comes down (`wallDown`, `crowbar.rocks`, heard `fallNoise` away, creatures come to look); solid rock does nothing. Either way `prying` stays at -1 until interact is let go. A floor item or a crate being looked at comes first.
- **On the wire:** the layout carries `walls`; each tick lists the ones brought down (`walls`), so a reconnect or a late arrival sees them gone. The client hides the model and opens the wall in the player's collision world.
- **The map:** `surveyMap` draws a false wall's side as a wall (no stub giving it away), but a sketch reaches through it once it's down: what a sketch draws is decided by sight.
- **Admin:** **Bring down false walls** (`openWalls`, Map group). The debug grid shows a false wall as a green (connected) entrance.
- **Rubble walls and webs** are kinds of wall (`WallPlacement.kind`), placed after the false walls from the passages left: seen, not hidden, and brought down by a pickaxe or by blades and fire. See [world.md](world.md#rubble-walls-and-webs).

## Algorithm

`generateLayout(seed, PIECES, MAP_KIT, { affliction })` (pieces owned by any other Affliction are dropped from the kit first):

1. **Start:** place the start room with a random rotation, its first cell on world cell `[0, 0]`, then attach its `exit` piece, if it has one. The Angel's Well has none: its opening is at the foot of its pit, on grid floor 0, and the first level grows from there.
2. **Main route, level by level:** the non-final major rooms are shuffled and shared out evenly between the levels. Each level's route is its major rooms, then an extraction room (or, on the deepest level, the `final` room). Before each room, attach a corridor of `corridor` (4–7) flat connectors (never an `offRoute` one). Pieces are tried in weighted random order, each matching socket and rotation is tried, and placements that overlap an occupied cell on any level are rejected. Each step grows from any open socket of the piece before (trying the others when nothing fits); a room that does not fit stretches its corridor by up to `stretch` more pieces. Rooms are entered through a `hall`, never a `gate`. After an extraction room, the `descent` piece goes on its `gate`, and the next level grows from the foot of the stair.
3. **Branches:** each still-open socket has a chance (`branchChance`) to grow a 2–5 piece side passage, in `branchPasses` passes, so tees and crosses on a branch can branch again. Branches never descend.
4. **Rope drops:** `ropeDrops` (1) `needsRope` connectors (`drop-hall` and `pit`, 12 m down; `sinkhole`, 8 m; `broken-stair`, a stair that stops 4 m above the floor; `sunken-ossuary`, a hall over a grate with a sealed chamber 8 m below) are hung off an opening still free, each with `dropBranch` (1–3) connectors on from its foot. They are never on the main route, so a party without rope is never stuck, and the nav grid (which can't step down 12 m) leaves everything below them out. A drop is as tall as the long stair, so its foot is as deep as the next level down, but it stays on the tier it hangs from: joins and loops need the same tier, so it never opens into the level below, and the long stair stays the only way between levels. This pass uses its own RNG stream (`dropRng`, swapped into `LayoutState.rng` for it), so the rest of the map came out as it did before drops existed. See [rope.md](rope.md#rope-drops).
5. **Loops:** for up to `loops` (8) open sockets, find the nearest _joinable_ open socket that a breadth-first search can reach through free cells (at most `loopMaxCells`). The path becomes straight and corner halls, joining the two sockets: only plain 1x1 halls whose openings are on their ground floor and that need no rope (never the Sunken Ossuary, whose hall is two floors up).
6. **Seal:** joinable open sockets facing each other are joined. Each remaining one gets a dead end (`deadEndChance`, 0.55, if it fits) or a cap. Dead ends are the collapsed walls where bricks lie; a map has about 19.
7. If any step fails, retry with a new RNG stream derived from the seed (up to `attempts`).

**Joinable** (`LayoutState.joinable`) means the same tier, floor and type, and a different _anchor_. A socket's anchor is the room or junction its passage leads back to. From the socket's piece, walk back through plain passages (connectors with two openings that aren't rooms) to the first piece that isn't one (`LayoutState.anchor`, using the links that `attach` and loops record). Joining two sockets with the same anchor would make a passage that leaves a room (or tee) and comes straight back into it, a pointless roundabout, so they are capped instead. A passage between two different rooms, or one going round through a tee, is fine.

`pieceLinks` in `debug.ts` rebuilds the links from a finished layout. The tests use it to check that there are no roundabouts, that levels meet only on the stair, and that every piece can be walked to.

Tunables are `GenerateOptions` in `generate.ts`. Maps come out at roughly 145–330 pieces (median about 215, caps not counted) over the three levels. About half of them are straight and corner halls, with a tee or cross every few pieces and about ten minor rooms; the vault and the gallery, the big ones, are about five each. Crawls, the long squeeze and water passages are rare (low `weight` in `MAP_KIT`). A map takes about 2 ms. Attempts that box themselves in are retried with a new stream, up to 64.

After that the server chooses which of the pieces' crate markers have a loot crate (`placeCrates` in `src/lib/shared/map/crates.ts`, seeded by the same seed) and puts them in `layout.crates`. They are part of the layout because they are solid: both sides build them into the collision world. See [items.md](items.md#loot-crates).

## Rendering

`MapRenderer.build` places each piece from the asset cache, then merges the whole map, which doesn't move, into chunks: one mesh per material per 12 m chunk (`CHUNK`, three cells) and level, in world space. A typical map is about 190 pieces and 95,000 triangles. Drawn piece by piece that's several hundred draw calls, and again in every lamp's shadow pass. Merged, it's a few dozen, and the camera and each lamp still skip the chunks outside their view. Merging decodes the quantized (meshopt) vertex data into floats, so the merged map takes more memory than the cached pieces. Raycasts against `MapRenderer.root` (chalk marks, footstep surfaces) see the merged meshes. Their materials are the pieces' own, so the material names still tell the surface. A mesh with several materials isn't merged.

## Adding a piece

1. Build it in Blender following the kit conventions and export it to `art/export/`. The rooms of the gear, crafting and loot round are built by `scripts/blender/rooms.py` (a `Room` helper: a flat-ceilinged room of w x d cells with hall openings where it says, its sockets and colliders), headless with `blender --background art/blender/catacomb-kit.blend --python scripts/blender/build_rooms.py`, which builds the ones not in the .blend yet, places their lootable markers and saves it (`-- --force <name>...` builds those again). Keep the way between a room's doors clear of anything solid: the nav grid (and creatures) need it, and the lootable search keeps solid kinds off it.
2. Run `pnpm asset:build`.
3. Add it to `MAP_KIT` with a role (and a weight for connectors), its `levels` if it belongs only on some, and a `title` and `banner` line if it is a room with a name. Caps must have a single socket of the type they seal. Pieces that change level need `descends: true`; a drop that takes a rope also `needsRope: true` and an `anchor-<n>` at its top. `pnpm asset:build` only ships pieces listed in `MAP_KIT`, so a retired piece (`extraction-shaft`, `hall-squeeze`) can stay in the .blend and `art/export/`.

## Debug grid

In dev mode, the admin panel (F10) Map group shows the current seed, regenerates the map from a seed you type (or a random one), and turns on the map debug view. F9 (`toggleFreecam`, remappable, no controller button) flies the same view freely from where you stand: move keys to fly, Space and X for up and down, sprint for four times the speed. F9 again puts you back in your body, which never moved. While flying, interact (E) moves your body to the camera and puts you in it, looking the same way: the eyes go where the camera was and you fall to the floor below (with noclip on, you stay there). It's the `teleportTo` admin command; the server does nothing over no floor at all (`dropSpot` in `src/lib/shared/map/points.ts`). Reload (R) brings the camera back to your body and keeps flying. The admin panel's Map group has both as buttons while the free camera is on, and the side panel shows the keys as they are bound.

The map debug view is fully lit and draws a grid over the map (Map group, **Grid**, off by default), through walls:

| Drawn             | Means                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| Yellow fill       | A room cell: start, major, extraction, and connectors with `room: true` in `MAP_KIT` (minor rooms). |
| Grey cell outline | A cell some piece occupies, on its level's floor. Edges with no entrance only get this.             |
| Green panel       | An entrance (socket) with a piece on both sides: a way through.                                     |
| Red panel         | A blocked entrance: sealed by a cap, closed by a dead end, or open with nothing across it.          |

Down the left, a panel counts what the map is made of: rooms (start, major, extraction, minor), tunnels (every other connector), dead ends, caps, connected and blocked entrances, cells and grid floors, then the pieces and rooms on each level of the map, then how many of each room and tunnel piece. A new connector that is a room, not a passage, sets `room: true` in `MAP_KIT` to be counted and highlighted as one.

`mapDebugGrid(layout, PIECES, MAP_KIT)` (`src/lib/shared/map/debug.ts`, tested) works this out from the layout; `MapDebugGrid` (`src/lib/game/map/MapDebugGrid.ts`) draws it. A red panel with no cap or dead end behind it is a generator bug: the generator seals every opening.
