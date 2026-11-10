# Expeditions, extraction and room banners

An expedition is one run: a server `Session` with its own seed, map and players.

## Files

| What                                           | Where                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Expedition manager                             | `server/expeditions.ts`                                                            |
| Session (map, players, simulation, extraction) | `server/session.ts`                                                                |
| Connection routing                             | `server/index.ts`                                                                  |
| Rules (extract time and radius)                | `src/lib/content/expedition.ts`                                                    |
| Extraction in the simulation                   | `src/lib/shared/player/simulate.ts` (`updateExtraction`, `nearExtract`)            |
| Extract points                                 | `CollisionWorld.extracts` (`src/lib/shared/map/collision.ts`)                      |
| Results screen                                 | `src/lib/ui/ExpeditionResult.svelte`                                               |
| Room banner                                    | `src/lib/ui/RoomBanner.svelte`, titles in `MAP_KIT` (`src/lib/content/map/kit.ts`) |

## Lifecycle

1. A client connects and sends `hello`. `Expeditions.join` adds it to the current expedition, or creates a new `Session` (new seed, generated layout) if there's none or the last one ended. The server sends `welcome` with the layout.
2. Players explore. The session simulates them and broadcasts `tick` snapshots.
3. A player climbs out (see Extraction). The server sends them `extracted { seconds, deepestLevel }` and removes them from the session, so other players stop seeing them.
4. The connection stays open. The client shows the results screen. **Descend again** sends `descend`, which joins the current expedition again (or a new one).
5. When the session's last player has extracted or disconnected, the session stops and reports `ended`. The next join starts a fresh expedition.

Everyone shares one current expedition until parties and invites arrive in Phase 3.

## Extraction

**Where:** extraction points are `extract-*` markers in a piece (Blender) and come through the manifest's `extracts`. `buildCollisionWorld` puts them all into `world.extracts` in world space. The start room has one at its sealed surface door.

**How:** it runs in the shared simulation, so the client predicts the progress bar and the server decides.

- Holding `interact` (E) while standing still, grounded and not swimming, within `extractRadius` (horizontal) and `extractHeight` of a point, adds to `state.extracting`.
- Moving, letting go or mantling resets it to 0.
- At `extractSeconds` (3 s), `state.extracted` is set. The server stops simulating that player and finishes the extraction.

**Client feedback:** near a point the HUD shows "Hold E to climb out" (using the player's current binding) in a `HoldPrompt` pill whose background fills while holding. Use `HoldPrompt` (`src/lib/ui/HoldPrompt.svelte`) for every hold-key prompt so they all look the same.

**Results:** time underground, and the deepest level reached (levels below the start, tracked by the server). Loot and money come with items and the hub.

**Adding an extraction point:** put an `extract-<n>` empty in a piece, export, then run `pnpm asset:build`.

## Room banners

Start and major rooms with a `title` in `MAP_KIT` show a banner the first time a player enters them in an expedition.

- On map load, the client builds a lookup from each titled room's occupied cells (`occupiedCells`).
- A few times a second, it finds the cell and level the player is in.
- The start room's banner shows at spawn.

To give another room a banner, add `title` to its kit entry.
