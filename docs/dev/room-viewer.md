# The room viewer

A dev tool for building the fixed map's rooms one at a time ([#141](https://github.com/JoshuaBelden/undercroft/issues/141), part of the pivot, [handoff-pivot.md](../handoff-pivot.md#the-room-viewer-debug)). Export a room from Blender and see it in the game in seconds: fly round it or walk it with the game's own movement and collision, with its markers, collision boxes and volumes drawn over it. Re-export and it reloads, the camera staying where it was.

It runs only under `pnpm dev`. The pages are behind dev mode (`src/routes/dev/+layout.ts` answers 404 without it), and the files come from a Vite plugin that only exists in the dev server, so nothing of it ships to players.

- **`/dev/room`**: every room there is, newest export first.
- **`/dev/room/<room>`**: one room, e.g. `/dev/room/storeroom`. Bookmark the one you're working on.

## Where rooms come from

Rooms are read straight from Blender's exports, unbuilt (no `pnpm asset:build`):

| File                                                    | What                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| `art/export/rooms/<room>.glb`                           | The room, from its own `art/blender/rooms/<room>.blend`      |
| `art/export/rooms/<room>.lightmap.png` (`.webp`/`.jpg`) | Its baked light (optional), on the meshes' second UV (`uv1`) |

A room follows the kit's conventions ([asset-pipeline.md](asset-pipeline.md#conventions-1)): metres, +Y up in glTF (Blender's +Y north is -Z), a root empty named after the file, and the same marker names (`spawn-<n>`, `rope-<n>` with `length`, `lootable-<type>-<n>`, `col-*` unit cubes, `vol-<kind>-<n>`...). Export with custom properties on (glTF extras), so `length` and the rest come through. Rooms aren't on the generator's 4 m grid, so footprint and sockets aren't needed.

## Building a room

Each room has a build script in `scripts/blender/map/` (the first is `sewer.py`, the way in, [#150](https://github.com/JoshuaBelden/undercroft/issues/150)). It builds the grey box into a new `art/blender/rooms/<room>.blend`, saves it and exports it, and refuses to replace a .blend that exists: from then on the .blend is the source, edited by hand, and the script only exports it. Headless, without opening Blender:

```
blender -b --factory-startup -P scripts/blender/map/sewer.py                # build, bake, save, export
blender -b --factory-startup -P scripts/blender/map/sewer.py -- --force     # rebuild over hand edits
blender -b art/blender/rooms/sewer.blend -P scripts/blender/map/sewer.py -- --bake    # bake again, save, export
blender -b art/blender/rooms/sewer.blend -P scripts/blender/map/sewer.py -- --export  # export only
```

`common.py` has what every room shares: the root and markers (turned to face a way), collision boxes, a cross-section swept along a path with holes left for doorways, walls with holes, the lightmap's UV and bake, saving and exporting. Materials are named by use (`mat-sewer-wall`) and map to a texture set in `art/textures` (the room script's `add_materials`), so a better texture is a change there, not to the geometry. The export carries textures at 1024 px, the size the game ships map textures at, so the viewer shows what players will see.

### Lightmaps

Rooms are lit by baking: the light falling on every surface is worked out once in Blender and painted into a texture, so the game draws it for the cost of a texture lookup (the handoff's [Light: baked](../handoff-pivot.md#light-baked-decided)).

- **The second UV map**, `Lightmap` (`common.lightmap_uv`, Smart UV Project): every face its own place on the page, with a margin so light doesn't bleed between faces. The first UV map stays the textures'. Both are exported (`TEXCOORD_0`, `TEXCOORD_1`).
- **What lights it**: the room's own lights (the Sewer's `bake-daylight-*`: an area lamp just under the manhole and under each light tube, shining down; their watts and spread are `DAYLIGHT` in `sewer.py`), emissive surfaces (`mat-daylight`), and nothing else: the world is black underground. The lights are in the .blend to tune by hand, and never exported.
- **The bake** (`common.bake_lightmap`): Cycles, Diffuse with direct and indirect light and no colour, 1024 px and 1024 samples, saved as `art/export/rooms/<room>.lightmap.png`. It takes about 20 seconds for the way in. Light over 1 clips in the PNG: the bake prints its brightest value; keep the lamps under it except where a surface should burn white.
- **Checking for holes**: the game draws only the front of a face, and Blender's Cycles renders both, so a face turned the wrong way looks fine in a Cycles render and is a hole in the game. Render with Workbench, backface culling on and a bright world colour to see them as the game would. `common.sweep` turns every face from its cross-section's winding, so swept walls never come out backwards.
- **Metalness**: a texture set's metalness map shines hard under the headlamp. Rusted iron sets `"metallic": 0.15` in its material spec instead (the kit's `get_material` then leaves the map out).
- **Faces laid over each other** (a ragged edge over a wall, a trim over another) need a gap between them, a few millimetres: two faces in one plane shade, and bake, black.
- **In the game**, the material's colour is multiplied by it: Three.js's `lightMap` on the second UV, at an intensity of pi (`LIGHTMAP_INTENSITY`), because Three.js treats a lightmap as irradiance and divides it by pi in its shading. The headlamp still lights everything as a real light, on top.

### Ladders, locks, keys and sounds

Custom properties on markers say what a name can't:

- `door-<n>` with `type = "<door>"`: the kind of door (`DOOR_TYPES`, [fixed-map.md](fixed-map.md#doors); none: the double door, fitted by `width` and `height`). With `key = "<item>"`: locked until opened with that item (the Storeroom's door, `key`).
- `lootable-<type>-<n>` with `holds = "<item>"`: that lootable always holds it (the Storeroom's crate with the key).
- A ladder is a `rope-<n>` at its top (its `length` down to the floor, `exit` for a way out, `ladder = 1`): it climbs as a rope does ([rope.md](rope.md#climbing)), so the way out of the Sewer is climbed, not walked onto. The room viewer's walk climbs it too.
- `sound-<id>-<n>`: the sound `<id>` from `sounds.ts` plays there (`sound-sewer.drip-1` plays `sewer.drip`).

A room's sounds are registered in `sounds.ts` like any other, with the `file` id they will have, and stay silent until they are recorded; the admin Art & Assets page lists them as missing, which makes it the recording list. The markers say where they play; playing them there comes with sound along the tunnels (Phase 3, [#144](https://github.com/JoshuaBelden/undercroft/issues/144)). Locks working in a run needs the server to know rooms (Phase 1, [#142](https://github.com/JoshuaBelden/undercroft/issues/142)).

## What it shows

**Camera.** Fly (the default) or walk, `roomWalk` (V). Click the room to capture the mouse; Esc lets go. Flying: the movement keys, up on `climb` (Space), down on `swimDown` (X), faster with `sprint`. Walking starts from where the camera is and falls to the floor below: it is `stepPlayer`, the game's movement, against the room's collision boxes, so steps, mantles, ropes, crawls and water behave as in a run. `stance` (C) goes round stand, crouch, crawl. A controller's sticks fly and walk too.

**Markers.** Each kind in its own colour (`MARKER_COLOURS`), with its name beside it, a line the way it faces (spawns, crates, lootables, doors, anchors, spots) and a rope hanging its length. The panel lists them by kind; click one to stand there, facing its way. Anything the game wouldn't understand is listed under Warnings: an empty with no known prefix, a rope with no `length`, a lootable of no known type, a `key` or `holds` naming no item, a door locked with a key nothing in the room holds, a `sound-` marker naming no sound. Under them, **Sounds** lists every sound the room names, recorded or still to record.

**Toggles** (the panel, and keys, remappable in Settings > Controls like any other: the "Room viewer" ones):

| Toggle          | Key | What                                                        |
| --------------- | --- | ----------------------------------------------------------- |
| Collision boxes | K   | Every `col-*` box, outlined (drawn through walls)           |
| Volumes         | –   | Every `vol-*` box, tinted                                   |
| Markers         | N   | The markers and their names                                 |
| Marker names    | –   | Just the names                                              |
| Lightmap        | L   | The baked lightmap, when the room has one                   |
| Even light      | B   | An ambient and sky light, for a room with nothing baked yet |
| Headlamp        | –   | A light on the camera, about the game's headlamp at full    |

A room with a lightmap opens with it and the headlamp on and the even light off, as a player would see it; one without, with the even light only.

**Cost**, against `ROOM_BUDGET` (`src/lib/content/map/roomViewer.ts`), red when over: triangles, draw calls, the textures' count and GPU memory (with mipmaps), the lightmap's size and texels per metre (its pixels over the surface area that carries a second UV; the handoff's aim is 10 to 16), and the frame rate. The numbers are a starting point, to be tuned as the first rooms are built.

**Where you were** is kept per room in the browser (`localStorage`, `undercroft.roomViewer.views`), so a room opens where you left it. A room never opened before starts at its first spawn, or over its middle.

## Files

| File                                | What                                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `scripts/vite-rooms.ts`             | The dev server's part: `GET /__rooms` (the list), `/__rooms/<file>`, the `room:changed` event                         |
| `src/lib/shared/map/room.ts`        | `readRoom`: markers, colliders, volumes and warnings from a node list; `roomPiece`: the room as a `PieceDef`, to walk |
| `src/lib/game/rooms/files.ts`       | The list, finding a room, `onRoomChanged`                                                                             |
| `src/lib/game/rooms/RoomViewer.ts`  | Loading, lighting, flying, walking, stats                                                                             |
| `src/lib/game/rooms/overlays.ts`    | The marker, collider and volume overlays                                                                              |
| `src/lib/content/map/roomViewer.ts` | `ROOM_VIEWER` (flying, lights), `ROOM_BUDGET`, the colours                                                            |
| `src/lib/ui/RoomViewerPanel.svelte` | The side panel                                                                                                        |
| `src/routes/dev/room/`              | The picker and the viewer page                                                                                        |
| `scripts/blender/map/`              | Each room's build script, and `common.py`                                                                             |

`readRoom` is pure (no Three.js, no glTF library), so the fixed map's build (Phase 1, [#142](https://github.com/JoshuaBelden/undercroft/issues/142)) can read rooms the same way. Tested in `room.test.ts`.

## Not yet

From the issue, waiting on Phase 1's fixed-map pipeline ([#142](https://github.com/JoshuaBelden/undercroft/issues/142)):

- **Play mode**: a dev session on the real server with only this room, so doors, lootables, ropes and creatures work. The server only knows built pieces and the generator's layouts today.
- **Nav grid**: built from the generator's cells, which a room off the grid doesn't have.
- **Light probes** and the room's **acoustics** toggles: neither exists yet.

## Extending it

- **A new marker kind:** add its prefix to `ROOM_MARKER_KINDS` (`room.ts`) and a colour to `MARKER_COLOURS`; if it faces a way, add it to `FACING` in `overlays.ts`.
- **A new toggle:** a field on `RoomToggles`, applied in `RoomViewer.applyToggles`, a row in the panel's `TOGGLES`, and a `room…` action in `actions.ts` (and `PAD_DEFAULTS`) for a key.
