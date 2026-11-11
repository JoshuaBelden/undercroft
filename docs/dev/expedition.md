# Parties, expeditions, extraction and room banners

A **party** is the group that descends together (one to `PARTY.maxSize` players; solo is a party of one). An **expedition** is one run: a server `Session` with its own seed, map and players, started by a party.

## Files

| What                                            | Where                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| Parties (codes, ready, starting expeditions)    | `server/parties.ts`                                                                |
| Session (map, players, simulation, extraction)  | `server/session.ts`                                                                |
| Connection routing                              | `server/index.ts`                                                                  |
| Party rules (size, code format, reconnect time) | `src/lib/content/party.ts`                                                         |
| Party state sent to clients                     | `src/lib/shared/party/types.ts`                                                    |
| Lobby screen                                    | `src/lib/ui/PartyLobby.svelte`                                                     |
| Spectating bar                                  | `src/lib/ui/SpectateBar.svelte`                                                    |
| Rules (extract time and radius)                 | `src/lib/content/expedition.ts`                                                    |
| Extraction in the simulation                    | `src/lib/shared/player/simulate.ts` (`updateExtraction`, `nearExtract`)            |
| Extract points                                  | `CollisionWorld.extracts` (`src/lib/shared/map/collision.ts`)                      |
| Results screen                                  | `src/lib/ui/ExpeditionResult.svelte`                                               |
| Room banner                                     | `src/lib/ui/RoomBanner.svelte`, titles in `MAP_KIT` (`src/lib/content/map/kit.ts`) |

## Parties

Every connection is in exactly one party from its `hello` on. The server owns parties and sends each member the whole `PartyState` (`party` message) whenever anything in it changes; the client only renders it.

- **Creating:** `hello` without a code makes a new party with a fresh invite code. Codes are `PARTY.codeLength` characters from `PARTY.codeAlphabet` (no look-alike characters), unique among live parties.
- **Joining:** `hello { code }` (an invite link, `/play?code=ABCDE`) or `joinParty { code }` from the lobby. Codes are normalised (`normalizeCode`), so case and spaces don't matter. A bad code, a full party or your own party gets `partyError { reason }`; on `hello` you still get a party of your own.
- **Leaving:** `leaveParty` moves you to a new party of one. Disconnecting on the surface removes you (underground, see Reconnection). A party with no members is deleted and its code freed.
- **Leader:** the first member. If the leader leaves, the longest-standing member takes over.
- **Ready:** `ready { ready }`. Everyone but the leader readies up; flags reset when an expedition starts and when it ends.
- **Names:** a member's name is their account's gamer tag, read from the database when they connect and again when they send `rename` (after changing it in Settings). See [accounts.md](accounts.md).

All checks are on the server (`Parties`); `canDescend` is shared so the lobby can grey out the button with the same rule.

## Lifecycle

1. The player chooses "Start an expedition" (or joins by code) on the dashboard's Expedition page, which opens `/play`. The client connects and sends `hello` with its ticket (see [accounts.md](accounts.md)). It lands in a party and gets `party`. The client shows the lobby (`PartyLobby`).
2. The leader sends `descend`. If no expedition is running and everyone else is ready, `Parties.descend` creates a `Session` (new seed, generated layout), takes each member's loadout from their explorer (see [economy.md](economy.md)) and adds them with it. Each gets `welcome` with the layout: that message means "you are underground now".
3. Players explore. The session simulates them and broadcasts `tick` snapshots to the players in it.
4. A player climbs out (see Extraction), dies, the manifestation is banished, or the rite is performed (see [rite.md](rite.md)). The server sends them `extracted`, `died`, `banished` or `resolved` with `{ seconds, deepestLevel }` and removes them from the session, so other players stop seeing them. The connection stays open and they stay in the party.
5. What they carried out goes back to their explorer; if they died it is lost (see [economy.md](economy.md)). The client shows the results screen (after spectating, for the dead; see Spectating), with what was brought out, then the lobby. While others are still underground the lobby shows who, and nobody can descend.
6. When the session's last player is out (or has disconnected), it stops. The party is back on the surface and can descend again into a new expedition.

`Session` tells its party what happens through `SessionHooks` (`onPlayerLeft`, `onEnded`); it knows nothing about parties.

Someone who joins a party mid-expedition waits in the lobby for the next descent.

## Reconnection

A player whose connection drops while underground keeps their place for `PARTY.reconnectSeconds` (60 s).

- **Server:** `Parties.disconnect` marks the member `connected: false` (the lobby shows "Disconnected") and starts a timer. Their player stays in the `Session`, standing where they were: nothing is simulated for them without input, but creatures can still reach them. When the timer runs out they are removed, as a disconnect used to do at once.
- **Resuming:** an account is one member (see [accounts.md](accounts.md)). A `hello` from the account of a dropped member becomes that member again: same member id, same player. `Session.reattach` swaps in the new socket, restarts input acknowledgement (a reloaded page numbers its frames from 0 again) and sends `welcome` with the layout. The client rebuilds the map and the next `tick` puts it back where it stood.
- The same happens if the account connects while its old connection is still open (another tab): the new one takes over and the old one is closed.
- A dropped member whose player dies, or whose expedition ends, has nothing left to hold and leaves the party (`Parties.sweep`).
- On the surface there is nothing to hold: a drop removes the member, and the client asks for the same party by code when it reconnects, if others were in it.

**Client:** `GameClient` retries every 2 s. While the connection is down the page shows "Connection lost. Reconnecting..." and drops the expedition view; `welcome` brings it back. Reloading the tab, or signing in on another browser, also resumes.

## Spectating

A player who dies while others are still alive underground watches through a teammate's eyes until the expedition is over.

- **Server:** `died` carries `spectating`: whether anyone alive is left in the session after that tick. If so the session keeps the dead player's socket in `spectators`: they are out of the simulation (and show as on the surface in the party), but still receive every `tick`.
- When the session's last player is out, each spectator gets `spectateEnd { escaped }`, the number of players who got out alive (climbed out or carried out by a banishing).
- `stopSpectating` (the Leave button) or disconnecting removes a spectator early.
- **Client:** on `died` with `spectating`, the page keeps the map, creatures, items and other players, drops the local player, and puts the camera at the watched player's interpolated head (`RemotePlayers.view`), hiding that player's body (`setHidden`). `SpectateBar` shows who is being watched, with Next (cycle teammates) and Leave. If the watched player dies or leaves, the view moves to the next one.
- The results screen is held back until spectating ends, then shows how many of the others made it out.

Only the dead spectate. Players who climbed out go straight to the results and the lobby.

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
