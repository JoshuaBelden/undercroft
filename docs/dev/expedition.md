# Parties, expeditions, extraction and room banners

A **party** is the group that descends together (one to `PARTY.maxSize` players; solo is a party of one). An **expedition** is one run: a server `Session` with its own seed, map and players, started by a party.

## Files

| What                                           | Where                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Parties (codes, ready, starting expeditions)   | `server/parties.ts`                                                                |
| Session (map, players, simulation, extraction) | `server/session.ts`                                                                |
| Connection routing                             | `server/index.ts`                                                                  |
| Party rules (size, code format, name length)   | `src/lib/content/party.ts`                                                         |
| Party state sent to clients                    | `src/lib/shared/party/types.ts`                                                    |
| Lobby screen                                   | `src/lib/ui/PartyLobby.svelte`                                                     |
| Rules (extract time and radius)                | `src/lib/content/expedition.ts`                                                    |
| Extraction in the simulation                   | `src/lib/shared/player/simulate.ts` (`updateExtraction`, `nearExtract`)            |
| Extract points                                 | `CollisionWorld.extracts` (`src/lib/shared/map/collision.ts`)                      |
| Results screen                                 | `src/lib/ui/ExpeditionResult.svelte`                                               |
| Room banner                                    | `src/lib/ui/RoomBanner.svelte`, titles in `MAP_KIT` (`src/lib/content/map/kit.ts`) |

## Parties

Every connection is in exactly one party from its `hello` on. The server owns parties and sends each member the whole `PartyState` (`party` message) whenever anything in it changes; the client only renders it.

- **Creating:** `hello` without a code makes a new party with a fresh invite code. Codes are `PARTY.codeLength` characters from `PARTY.codeAlphabet` (no look-alike characters), unique among live parties.
- **Joining:** `hello { code }` (an invite link, `/play?code=ABCDE`) or `joinParty { code }` from the lobby. Codes are normalised (`normalizeCode`), so case and spaces don't matter. A bad code, a full party or your own party gets `partyError { reason }`; on `hello` you still get a party of your own.
- **Leaving:** `leaveParty` moves you to a new party of one. Disconnecting removes you. A party with no members is deleted and its code freed.
- **Leader:** the first member. If the leader leaves, the longest-standing member takes over.
- **Ready:** `ready { ready }`. Everyone but the leader readies up; flags reset when an expedition starts and when it ends.
- **Names:** `hello.name` and `rename`, trimmed to `PARTY.nameLength`, `PARTY.defaultName` if empty. The name lives in `settings.profile.name` until accounts exist (Phase 5).

All checks are on the server (`Parties`); `canDescend` is shared so the lobby can grey out the button with the same rule.

## Lifecycle

1. A client connects and sends `hello`. It lands in a party and gets `party`. The client shows the lobby (`PartyLobby`).
2. The leader sends `descend`. If no expedition is running and everyone else is ready, `Parties.descend` creates a `Session` (new seed, generated layout) and adds every member. Each gets `welcome` with the layout: that message means "you are underground now".
3. Players explore. The session simulates them and broadcasts `tick` snapshots to the players in it.
4. A player climbs out (see Extraction), dies, or the manifestation is banished. The server sends them `extracted`, `died` or `banished` with `{ seconds, deepestLevel }` and removes them from the session, so other players stop seeing them. The connection stays open and they stay in the party.
5. The client shows the results screen, then the lobby. While others are still underground the lobby shows who, and nobody can descend.
6. When the session's last player is out (or has disconnected), it stops. The party is back on the surface and can descend again into a new expedition.

`Session` tells its party what happens through `SessionHooks` (`onPlayerLeft`, `onEnded`); it knows nothing about parties.

Someone who joins a party mid-expedition waits in the lobby for the next descent. A dropped connection leaves the expedition; the client reconnects and asks for the same party again if others were in it. Rejoining a running expedition and spectating are later Phase 3 items.

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
