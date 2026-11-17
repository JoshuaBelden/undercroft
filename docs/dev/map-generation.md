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
- The other openings of an extraction room lead back into its own level.
- Loot depends on the level: see [items.md](items.md#loot-crates).

## Kit roles

`MAP_KIT` (`src/lib/content/map/kit.ts`) gives each piece a role and options:

| Role         | Meaning                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`      | Expedition start room. `exit` names the piece always attached to its opening (`hall-stairs-down`).                                                                            |
| `major`      | Static major room. Every major room is placed on the main route. `final: true` marks the one that goes last and deepest (Gloaming Chapel).                                    |
| `extraction` | A room with a way out and a `gate` (`extraction-gate`). The last room on every level but the deepest, picked by `weight`.                                                     |
| `descent`    | The long stair down to the next level (`stairs-deep`). Attached by its top `gate` to the extraction room's `gate`; its tier is the level it leads down to.                    |
| `connector`  | Passages and minor rooms. `weight` is the relative pick chance. `descends: true` pieces change level and are only attached by their highest socket, so they always lead down. |
| `end`        | Dead ends that can close an opening instead of a cap.                                                                                                                         |
| `cap`        | Seals an unused opening without occupying a cell. `seals` names the socket type.                                                                                              |

Any entry can also set `affliction` (a key into `AFFLICTIONS`): the piece is then only generated in maps for that Affliction, and its built files live in `static/assets/afflictions/<id>/`, so other runs never download it. The Gloaming Chapel belongs to the Gloaming. The server passes the chosen Affliction as `GenerateOptions.affliction`, and the layout records it (`MapLayout.affliction`) so the client preloads the right Affliction's models.

## Doors

A double door stands at the top of every long stair, just behind the extraction room's gate. It starts shut and barred: holding interact on it for `DOORS.openSeconds` opens it for everyone, for good. Shut, it keeps players out and creatures in; the sound of it opening carries `DOORS.noise` metres.

| What                                                  | Where                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| Tuning (size, hold time, reach, noise, swing)         | `DOORS` in `src/lib/content/doors.ts`                                     |
| Where they stand (`door-*` markers -> `layout.doors`) | `placeDoors` in `src/lib/shared/map/doors.ts`, called by `generateLayout` |
| Which door you're looking at (client and server)      | `lookedAtDoor` in `doors.ts`                                              |
| Which level of the map a place is on                  | `tierCells` / `tierAt` in `doors.ts`                                      |
| Server state and the hold to open                     | `server/doors.ts`, `Session.stepDoors`                                    |
| Model and swing                                       | `src/lib/game/map/Doors.ts` (`prop-door-double`, see asset-pipeline.md)   |

- **Collision:** `buildCollisionWorld` adds a box per door, tagged with its id. `openDoor(world, id)` adds the id to `world.openDoors`, and `boxesNear` (which every collision query goes through) leaves those boxes out. The server opens it in its world; the client opens it in the player's world as soon as a tick lists it, so prediction agrees.
- **Nav:** `buildNav` builds the grid with every door open, so the levels below are in it, then tags the points in each doorway (`NavPoint.door`). `NavGrid.closed` holds the doors still shut: `findPath` and `gridDistances` don't step onto their doorways, so creatures can't path through. `Doors.open` takes the id out. Laying out the map (creatures, loot, the rite's items) measures through the doors (`gridDistances(..., true)`).
- **Protocol:** each `tick` lists the open doors (`doors`), which also covers a reconnect. Opening one is a `doorOpen` event (the bar dropping and the hinges groaning: `door.unbar`, `door.open`).
- **Prompt:** looking at a shut door in reach shows "[E] to open the door", filling as `PlayerState.unbarring` grows. A floor item or a crate in the way comes first.
- **Admin:** the F10 Map group has **Open the doors** (`openDoors`), and the teleport list has `level-2-door` and `level-3-door`, on the room side of each door.

## Algorithm

`generateLayout(seed, PIECES, MAP_KIT, { affliction })` (pieces owned by any other Affliction are dropped from the kit first):

1. **Start:** place the start room with a random rotation, its first cell on world cell `[0, 0]`, then attach its `exit` piece (stairs down) to reach the first level.
2. **Main route, level by level:** the non-final major rooms are shuffled and shared out evenly between the levels. Each level's route is its major rooms, then an extraction room (or, on the deepest level, the `final` room). Before each room, attach a corridor of `corridor` (4–7) flat connectors. Pieces are tried in weighted random order, each matching socket and rotation is tried, and placements that overlap an occupied cell on any level are rejected. Each step grows from any open socket of the piece before (trying the others when nothing fits); a room that does not fit stretches its corridor by up to `stretch` more pieces. Rooms are entered through a `hall`, never a `gate`. After an extraction room, the `descent` piece goes on its `gate`, and the next level grows from the foot of the stair.
3. **Branches:** each still-open socket has a chance (`branchChance`) to grow a 2–5 piece side passage, in `branchPasses` passes, so tees and crosses on a branch can branch again. Branches never descend.
4. **Loops:** for up to `loops` (8) open sockets, find the nearest _joinable_ open socket that a breadth-first search can reach through free cells (at most `loopMaxCells`). The path becomes straight and corner halls, joining the two sockets.
5. **Seal:** joinable open sockets facing each other are joined. Each remaining one gets a dead end (`deadEndChance`, 0.55, if it fits) or a cap. Dead ends are the collapsed walls where bricks lie; a map has about 19.

**Joinable** (`LayoutState.joinable`) means the same tier, floor and type, and a different _anchor_. A socket's anchor is the room or junction its passage leads back to. From the socket's piece, walk back through plain passages (connectors with two openings that aren't rooms) to the first piece that isn't one (`LayoutState.anchor`, using the links that `attach` and loops record). Joining two sockets with the same anchor would make a passage that leaves a room (or tee) and comes straight back into it, a pointless roundabout, so they are capped instead. A passage between two different rooms, or one going round through a tee, is fine.

`pieceLinks` in `debug.ts` rebuilds the links from a finished layout. The tests use it to check that there are no roundabouts, that levels meet only on the stair, and that every piece can be walked to. 6. If any step fails, retry with a new RNG stream derived from the seed (up to `attempts`).

Tunables are `GenerateOptions` in `generate.ts`. Maps come out at roughly 145–330 pieces (median about 215, caps not counted) over the three levels. About half of them are straight and corner halls, with a tee or cross every few pieces and about ten minor rooms; the vault and the gallery, the big ones, are about five each. Crawls, the long squeeze and water passages are rare (low `weight` in `MAP_KIT`). A map takes about 2 ms. Attempts that box themselves in are retried with a new stream, up to 64.

After that the server chooses which of the pieces' crate markers have a loot crate (`placeCrates` in `src/lib/shared/map/crates.ts`, seeded by the same seed) and puts them in `layout.crates`. They are part of the layout because they are solid: both sides build them into the collision world. See [items.md](items.md#loot-crates).

## Rendering

`MapRenderer.build` places each piece from the asset cache, then merges the whole map, which doesn't move, into chunks: one mesh per material per 12 m chunk (`CHUNK`, three cells) and level, in world space. A typical map is about 190 pieces and 95,000 triangles. Drawn piece by piece that's several hundred draw calls, and again in every lamp's shadow pass. Merged, it's a few dozen, and the camera and each lamp still skip the chunks outside their view. Merging decodes the quantized (meshopt) vertex data into floats, so the merged map takes more memory than the cached pieces. Raycasts against `MapRenderer.root` (chalk marks, footstep surfaces) see the merged meshes. Their materials are the pieces' own, so the material names still tell the surface. A mesh with several materials isn't merged.

## Adding a piece

1. Build it in Blender following the kit conventions and export it to `art/export/`.
2. Run `pnpm asset:build`.
3. Add it to `MAP_KIT` with a role (and a weight for connectors). Caps must have a single socket of the type they seal. Pieces that change level need `descends: true`. `pnpm asset:build` only ships pieces listed in `MAP_KIT`, so a retired piece (`extraction-shaft`, `hall-squeeze`) can stay in the .blend and `art/export/`.

## Debug grid

In dev mode, the admin panel (F10) Map group shows the current seed, regenerates the map from a seed you type (or a random one), and turns on the map debug view. F9 (`toggleFreecam`, remappable, no controller button) flies the same view freely from where you stand: move keys to fly, Space and X for up and down, sprint for four times the speed. F9 again puts you back in your body, which never moved. While flying, interact (E) moves your body to the camera and puts you in it, looking the same way: the eyes go where the camera was and you fall to the floor below (with noclip on, you stay there). It's the `teleportTo` admin command; the server does nothing over no floor at all (`dropSpot` in `src/lib/shared/map/points.ts`). Reload (R) brings the camera back to your body and keeps flying. The admin panel's Map group has both as buttons while the free camera is on, and the side panel shows the keys as they are bound.

The map debug view is fully lit and draws a grid over the map (Map group, **Grid**, on by default), through walls:

| Drawn             | Means                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| Yellow fill       | A room cell: start, major, extraction, and connectors with `room: true` in `MAP_KIT` (minor rooms). |
| Grey cell outline | A cell some piece occupies, on its level's floor. Edges with no entrance only get this.             |
| Green panel       | An entrance (socket) with a piece on both sides: a way through.                                     |
| Red panel         | A blocked entrance: sealed by a cap, closed by a dead end, or open with nothing across it.          |

Down the left, a panel counts what the map is made of: rooms (start, major, extraction, minor), tunnels (every other connector), dead ends, caps, connected and blocked entrances, cells and grid floors, then the pieces and rooms on each level of the map, then how many of each room and tunnel piece. A new connector that is a room, not a passage, sets `room: true` in `MAP_KIT` to be counted and highlighted as one.

`mapDebugGrid(layout, PIECES, MAP_KIT)` (`src/lib/shared/map/debug.ts`, tested) works this out from the layout; `MapDebugGrid` (`src/lib/game/map/MapDebugGrid.ts`) draws it. A red panel with no cap or dead end behind it is a generator bug: the generator seals every opening.
