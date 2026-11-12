# Map generation

Maps are assembled from modular Blender pieces on a grid. The server picks a seed, runs the generator (`Session.layout`), and sends the resulting `MapLayout` (seed plus placements, about 1 KB) to clients in `welcome`. Clients never generate: they only build geometry from the layout they receive, so there is one source of truth even when the map changes during a run. The generator is deterministic, so a seed reproduces a layout for debugging.

Building and exporting pieces is covered in [asset-pipeline.md](asset-pipeline.md).

## Data

| What                                                   | Where                                     |
| ------------------------------------------------------ | ----------------------------------------- |
| Piece geometry (shared textures in `textures/`)        | `static/assets/map/<piece>.gltf` + `.bin` |
| Piece sockets, markers, colliders, volumes (generated) | `src/lib/shared/map/pieces.generated.ts`  |
| Piece roles and weights (hand-authored)                | `src/lib/content/map/kit.ts`              |
| Types                                                  | `src/lib/shared/map/types.ts`             |
| Grid math                                              | `src/lib/shared/map/grid.ts`              |
| Generator                                              | `src/lib/shared/map/generate.ts`          |
| Seeded RNG                                             | `src/lib/shared/rng.ts`                   |
| Client rendering                                       | `src/lib/game/map/MapRenderer.ts`         |

## Coordinates

- World space is Three.js: +X east, +Y up, **+Z south** (north is -Z).
- Grid cell `[i, j]` is centred on `(i * 4, j * 4)`. Levels are 4 m apart.
- A piece's footprint cell `[x, z]` counts from its north-west cell.
- `Placement.position` is the piece origin (floor, footprint centre). `Placement.rotation` is quarter turns around +Y, the same as `Object3D.rotation.y = r * π/2`. A +90° turn maps edges e → n → w → s → e.
- `toWorld(placement, point)` converts a piece-space point (spawn, extract, collider centre) to world space.

## Sockets

A socket is an opening of a given type on a cell edge. Two sockets connect when they have the same type and level, sit in neighbouring cells, and face opposite edges. `worldSocket()` resolves a piece socket under a placement into world grid terms.

## Kit roles

`MAP_KIT` (`src/lib/content/map/kit.ts`) gives each piece a role and options:

| Role         | Meaning                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`      | Expedition start room. `exit` names the piece always attached to its opening (`hall-stairs-down`).                                                                            |
| `major`      | Static major room. Every major room is placed on the main route. `final: true` marks the one that goes last and deepest (Gloaming Chapel).                                    |
| `extraction` | A room with a way out (`extraction-shaft`). `GenerateOptions.extractions` of them go on the main route, spaced evenly between the major rooms, picked by `weight`.            |
| `connector`  | Passages and minor rooms. `weight` is the relative pick chance. `descends: true` pieces change level and are only attached by their highest socket, so they always lead down. |
| `end`        | Dead ends that can close an opening instead of a cap.                                                                                                                         |
| `cap`        | Seals an unused opening without occupying a cell. `seals` names the socket type.                                                                                              |

## Algorithm

`generateLayout(seed, PIECES, MAP_KIT)`:

1. **Start:** place the start room with a random rotation, its first cell on world cell `[0, 0]`, then attach its `exit` piece (stairs down).
2. **Main route:** visit every major room in random order, with the `final` room last, and the extraction rooms spaced evenly between them (with three major rooms and two extraction rooms: major, extraction, major, extraction, major, final). Before each room, attach a corridor of `corridor` (4–7) non-descending connectors. Pieces are tried in weighted random order, each matching socket and rotation is tried, and placements that overlap an occupied cell on any level are rejected. Each step grows from any open socket of the piece before (trying the others when nothing fits); a room that does not fit stretches its corridor by up to `stretch` more pieces. Before the final room, one corridor piece is forced to be a descending piece. Because descending pieces only go down, the final room is always strictly deeper than every other room.
3. **Branches:** each still-open socket has a chance (`branchChance`) to grow a 2–5 piece side passage, in `branchPasses` passes, so tees and crosses on a branch can branch again. Branches never descend.
4. **Loops:** for up to `loops` (8) open sockets, find the nearest open socket on the same level that a breadth-first search can reach through free cells (at most `loopMaxCells`). The path becomes straight and corner halls, joining the two sockets.
5. **Seal:** open sockets facing each other are joined. Each remaining one gets a dead end (`deadEndChance`, if it fits) or a cap.
6. If any step fails, retry with a new RNG stream derived from the seed (up to `attempts`).

Tunables are `GenerateOptions` in `generate.ts`. Maps come out at roughly 90–230 pieces (median about 160), about half of them straight and corner halls, with a tee or cross every few pieces. Crawls, squeezes and water passages are rare (low `weight` in `MAP_KIT`). About three in four attempts box themselves in on the main route and are retried; no seed has needed more than the 64 attempts.

After that the server chooses which of the pieces' crate markers have a loot crate (`placeCrates` in `src/lib/shared/map/crates.ts`, seeded by the same seed) and puts them in `layout.crates`. They are part of the layout because they are solid: both sides build them into the collision world. See [items.md](items.md#loot-crates).

## Adding a piece

1. Build it in Blender following the kit conventions and export it to `art/export/`.
2. Run `pnpm asset:build`.
3. Add it to `MAP_KIT` with a role (and a weight for connectors). Caps must have a single socket of the type they seal. Pieces that change level need `descends: true`.

The admin panel shows the current seed. Restart the game server to get a new one.
