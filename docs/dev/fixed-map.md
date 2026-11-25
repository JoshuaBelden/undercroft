# The fixed map

Every expedition goes into one hand-built map, the Under-Parish, instead of a generated one ([#142](https://github.com/JoshuaBelden/undercroft/issues/142), part of the pivot: [handoff-pivot.md](../handoff-pivot.md#maps-a-place-not-a-maze-decided)). Players learn it run by run. Its rooms are built one at a time in Blender ([room-viewer.md](room-viewer.md#building-a-room)), shipped through the asset build, and laid out from data. The procedural generator is retired; it survives only for the tests that need content no room has yet (see [Tests](#tests)).

For now the map is a single room, the way in (#150): the Sewer, the crack, the Storeroom and the First Stair.

## Files

| File                                    | What                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/lib/content/map/under-parish.ts`   | `UNDER_PARISH` (`MapDef`): its rooms, where each stands and its depth; the doors that stay shut        |
| `scripts/build-rooms.ts`                | `pnpm asset:rooms` (and `asset:build`): `art/export/rooms` -> `static/assets/shared/rooms` + `ROOMS`   |
| `src/lib/shared/map/rooms.generated.ts` | `ROOMS`: each room's markers, colliders, volumes, sounds, model and lightmap URLs. The server reads it |
| `src/lib/shared/map/room.ts`            | `readRoom` / `roomPiece`: a room's nodes into markers and a `PieceDef` (shared with the room viewer)   |
| `src/lib/shared/map/fixed.ts`           | `MAP_PIECES`, `fixedLayout` (the map laid out), `sealedDoors`                                          |
| `src/lib/shared/map/crates.ts`          | `roomCrates`: a lootable at every marker                                                               |
| `src/lib/shared/map/nav.ts`             | The nav grid: over a room's bounds (`sampleBounds`)                                                    |
| `server/session.ts`                     | Lays the map out and fills it (`populateFixed`)                                                        |
| `src/lib/game/map/MapRenderer.ts`       | Draws each room with its lightmap (`src/lib/game/rooms/roomModel.ts`)                                  |

## Shipping a room

`pnpm asset:rooms` builds every `art/export/rooms/<room>.glb`:

1. Its nodes are read with the room viewer's `readRoom`. Any warning fails the build: an unknown marker, a key nothing holds, a sound not in `sounds.ts`.
2. Its markers, colliders and volumes go into `ROOMS` (as a `RoomDef`: a `PieceDef` with its lightmap and its sounds), and out of the model.
3. The model is deduplicated, welded, its textures turned to WebP at 1024 px, and meshopt-compressed with both UV maps, to `static/assets/shared/rooms/<room>.<hash>.gltf` (its textures in `textures/` beside it).
4. Its lightmap (`<room>.lightmap.png`) becomes a near-lossless WebP.

The output is cleared first and the names are content-hashed, so an unchanged room keeps its files. `pnpm asset:build` runs it too. Commit `rooms.generated.ts` and the built files.

## The map as data

`UNDER_PARISH` lists each room by name (a key of `ROOMS`), its `position`, its quarter-turn `rotation` and its `depth` (0 above, the Sewer; then the Parish, the Ossuary, the Quarries). Until the assembly file places them (the handoff's [Blender](../handoff-pivot.md#blender)), rooms are placed here by hand. `sealed` lists doors that stay shut, as `<room>/<door marker>`: the seams to rooms not built yet (`sewer/door-1`, at the foot of the First Stair).

`fixedLayout` turns it into a `MapLayout`, the same shape the generator made, so collision, doors, ropes and crates read it as they did: one placement per room (its `tier` is its depth), a crate at every lootable marker (`roomCrates`: nothing is rolled away or turned into another kind, as the generator's `placeCrates` did), and a door at every door marker (`placeDoors`).

## What a room's markers do

The marker names are the kit's ([asset-pipeline.md](asset-pipeline.md#conventions-1)), with a few things a fixed room adds ([room-viewer.md](room-viewer.md#ladders-locks-keys-and-sounds)):

- **Spawns** face the way their marker faces (`PieceDef.spawnYaws`).
- **Lootables** with `holds` always hold that item (`CratePlacement.holds`): the crate is never jammed or locked, and the item is put back whenever the crates are filled again, unless it is still in there.
- **Doors** carry their marker's name and their kind, `type` (see [Doors](#doors)). With no type, a door is the double door, fitted to its doorway by `width` and `height` (`DoorPlacement.size`).
- **Locked doors** (`key`): `doorSeconds` (`src/lib/shared/items/lootables.ts`) opens them only for someone carrying that item, in `GATES.keySeconds`; opening one uses the item up. The client's prompt says what it needs.
- **Sealed doors** (the map's `sealed`) are barred (`Doors.bar`): they rattle and won't open, "(it won't open)".
- **Ladders** are ropes (`rope-<n>` with `ladder = 1`, and `exit` for a way out): climbed as a rope is, drawn by the room's model, so `HangingRopes` leaves them out.
- **Sounds** are listed in `RoomDef.sounds`, for sound along the tunnels (Phase 3) to play.

## Doors

Each kind of door is data, `DOOR_TYPES` in `src/lib/content/doors.ts`: its model, its size (the collision box while shut, and the doorway it fits) and whether it has a bar to lift before it opens. A door marker names its kind with `type = "<id>"`; one with none is the double door.

| Type               | What                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| `double`           | Two painted, iron-strapped leaves and a bar across them (the generator's stairs, the chapel)         |
| `simple-wood-door` | A plank door in a timber frame (1.2 × 2.2 m), hung on its left, an iron thumb latch: the Storeroom's |

The models are built by `scripts/blender/map/doors.py` into `art/blender/props/doors.blend` and exported as props (`art/export/props/<door>.glb`, then `pnpm asset:build`). The conventions are the double door's: the origin on the floor in the middle of the doorway, the room side +Y (the door marker's +Y points into the room), each leaf its own object (`door-leaf-l` hinged at -X, `door-leaf-r` at +X) swinging away from the room side, a bar as `door-bar`. The frame is part of the model, so the room's doorway is cut to the frame's outside.

**A new kind of door:** build it in `doors.py` (a function in `DOORS`), export, `pnpm asset:build`, add it to `DOOR_TYPES`, and name it on a door marker. The room build warns about a type there is no such door of.

## The server

`Session` lays out `fixedLayout(seed)` (a test can ask for the generator, below). `populateFixed` fills it: its crates (`Crates`, with what each holds), its seams barred. Nothing is scattered: what is in the map is what its rooms put there. There are no creatures yet (Phase 4: `creatures.quiet`), and no Affliction is laid on the map (Phase 7: the Affliction is calmed, so nothing is summoned). `regenerate` (admin) lays the same map out again with a new seed: new loot.

## The nav grid

A fixed room has no cells on the generator's grid, so `buildNav` samples its bounds (`PieceDef.bounds`, from its colliders) on the same 0.5 m lattice, every floor in each column from the top down: the walkway, the channel, the Storeroom, the foot of the stair 4 m below. Points not connected to the spawn are dropped. A passage the grid has to thread must leave a body's radius (0.28 m) either side of a lattice line: the Sewer's squeeze is 0.8 m wide with its middle no more than 0.1 m off a line (`fixed.test.ts` checks the grid reaches the stair's foot).

## The client

`MapRenderer` loads each room's model as it is and lights it with its lightmap (`roomModel.ts`: on the second UV, at pi, as in the room viewer), static. The preloader (`preloadRun`) fetches each room's model and lightmap behind the descent bar, and the hub's prefetch warms them. Everything that reads a server layout looks its pieces up in `MAP_PIECES`.

The diagnostics benchmark still walks a generated map, drawn with the generator's pieces (`MapRenderer` falls back to `PIECES`), until it walks the fixed map.

## Tests

Tests run on the fixed map (the real built `ROOMS`): `src/lib/shared/map/fixed.test.ts` (the layout, the key, the doors, the ladder, the nav grid) and `server/fixed.test.ts`, which plays the way in end to end: the key from its crate, the door opened with it and the key used up, the seam shut, out by the ladder. `Diver.climbOut()` (`server/testing/harness.ts`) climbs the map's way out.

Tests of what no room has yet (creatures, the Gloaming and his rite, kinds of lootable, webs, rubble walls, the gate, the stash, survey, room tasks, training) run on a map from the retired generator: `useSessions({ generated: true })` for a file, or `{ generated: true }` as `newSession`'s options for one test. They move to the fixed map as rooms with that content are built, or go with their feature.

## Adding a room

1. Build it ([room-viewer.md](room-viewer.md#building-a-room)) and export it to `art/export/rooms/<room>.glb`, with its lightmap.
2. `pnpm asset:rooms`.
3. Add it to `UNDER_PARISH.rooms` where it stands, and unseal the door it joins (`sealed`).
