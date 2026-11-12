# Parties, expeditions, extraction and room banners

A **party** is the group that descends together (one to `PARTY.maxSize` players; solo is a party of one). An **expedition** is one run: a server `Session` with its own seed, map and players, started by a party.

## Files

| What                                             | Where                                                                                  |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Parties (ready, countdown, starting expeditions) | `server/parties.ts`                                                                    |
| Session (map, players, simulation, extraction)   | `server/session.ts`                                                                    |
| Connection routing                               | `server/index.ts`                                                                      |
| Party rules (size, countdown, reconnect times)   | `src/lib/content/party.ts`                                                             |
| Party state sent to clients                      | `src/lib/shared/party/types.ts`                                                        |
| Lobby: the Expedition page                       | `src/routes/(hub)/+page.svelte`, `ExplorerPane`, `AfflictionPicker`, `LaunchCountdown` |
| Spectating bar                                   | `src/lib/ui/SpectateBar.svelte`                                                        |
| Rules (extract time and radius)                  | `src/lib/content/expedition.ts`                                                        |
| Extraction in the simulation                     | `src/lib/shared/player/simulate.ts` (`updateExtraction`, `nearExtract`)                |
| Extract points                                   | `CollisionWorld.extracts` (`src/lib/shared/map/collision.ts`)                          |
| Leaving fade ("Extracting")                      | `src/lib/ui/ExtractFade.svelte`, `EXPEDITION.leaveFadeSeconds`                         |
| Results screen                                   | `src/lib/ui/ExpeditionResult.svelte`                                                   |
| Room banner                                      | `src/lib/ui/RoomBanner.svelte`, titles in `MAP_KIT` (`src/lib/content/map/kit.ts`)     |

## Parties

Every connection is in exactly one party from its `hello` on. The server owns parties and sends each member the whole `PartyState` (`party` message) whenever anything in it changes; the client only renders it. The lobby is the dashboard's Expedition page: one `ExplorerPane` per member, and the launch panel in the lower right.

- **Creating:** `hello` puts you in a party of one. That is "not in a group": the page shows only you.
- **Joining:** by accepting a friend's invite (see [social.md](social.md)), which moves you into their party (`Parties.join`). There are no invite codes.
- **Leaving:** `leaveParty` moves you to a new party of one. The host can do the same to someone else with `kick { member }` (see [social.md](social.md#kicking)). A party with no members is deleted.
- **Host:** the first member (`PartyState.leader`). If the host leaves, the longest-standing member takes over. The host chooses the Affliction.
- **Affliction:** `affliction { id }`, host only. `PartyState.affliction` is null until then. Changing it makes everyone not ready. It stays chosen after an expedition.
- **Ready:** `ready { ready }`, for every member including the host. Refused until an Affliction is chosen. Becoming ready first marks the explorer `ready` in MongoDB, which locks the stash, loadout and store (see [economy.md](economy.md)); only then does the party see them as ready. `ready { ready: false }` cancels at any time and unlocks. Joining or leaving a party, dropping, and a change of Affliction all clear it.
- **Countdown:** after every change `Parties.changed` checks `allReady` (an Affliction is chosen, nobody is underground, every member is connected and ready). When it becomes true a timer of `PARTY.countdownSeconds` (5) starts and `PartyState.launchIn` carries the milliseconds left; when it stops being true (someone cancels, joins, leaves or drops) the timer is cleared. When it runs out the expedition starts. Nobody presses a descend button.
- **Names:** a member's name is their account's gamer tag, read from the database when they connect and again when they send `rename` (after changing it in Settings). See [accounts.md](accounts.md).

All checks are on the server (`Parties`); `allReady` is shared so both sides use the same rule.

### Launching, on the client

1. The launch panel shows the chosen Affliction. The host's "Select Affliction" opens `AfflictionPicker` (the Afflictions' panes; click one). Join Expedition on a pane of the Afflictions page does the same and comes back here (see [rite.md](rite.md)). The Launch Expedition button is disabled until one is chosen.
2. Launch Expedition sets `launch.confirming` (`src/lib/ui/launch.svelte.ts`) and goes to the Loadout page, which shows a "Confirm loadout" bar while it is set.
3. Confirm waits for any loadout change still on its way to the server (`Outfit.settled()`), sends `ready { ready: true }` and returns to the Expedition page. The pane shows Ready to everyone.
4. While ready, the Loadout page and the Store are locked and the money in the frame is not a link. Cancel (in the launch panel, or on the countdown) sends `ready { ready: false }`.
5. `LaunchCountdown` (in the root layout, so on every page but `/play`) shows the seconds from `connection.launchAt`.
6. `welcome` arrives and the root layout goes to `/play`.

## Lifecycle

1. Signing in lands on the Expedition page. The site-wide connection (`src/lib/game/net/connection.svelte.ts`, see [systems.md](systems.md#networking)) sends `hello` with its ticket (see [accounts.md](accounts.md)), lands in a party and gets `party`.
2. Everyone readies up and the countdown runs out (above). `Parties.descend` creates a `Session` against the party's Affliction (new seed, generated layout), takes each member's loadout from their explorer (see [economy.md](economy.md)) and adds them with it. Each gets `welcome` with the layout: that message means "you are underground now", and the client opens `/play`.
3. Players explore. The session simulates them and broadcasts `tick` snapshots to the players in it.
4. A player climbs out (see Extraction), dies, abandons (see Abandoning), the manifestation is banished, or the rite is performed (see [rite.md](rite.md)). The server sends them `extracted`, `died`, `abandoned`, `banished` or `resolved` with their `ExpeditionSummary` (see Results) and removes them from the session, so other players stop seeing them. The connection stays open and they stay in the party.
5. What they carried out goes back to their explorer; if they died or abandoned it is lost (see [economy.md](economy.md)). Leaving alive, the client fades out first (see Leaving); the dead see the results after spectating (see Spectating). Continue on the results goes to the Loadout page. While others are still underground their panes say so, and nobody can launch.
6. When the session's last player is out (or has disconnected), it stops. The party is back on the surface and can launch again.

`/play` is only the expedition: opened with none to show, it goes back to the dashboard.

`Session` tells its party what happens through `SessionHooks` (`onPlayerLeft`, `onEnded`); it knows nothing about parties.

Nobody can join a party while it is underground.

## Reconnection

A player whose connection drops keeps their place: for `PARTY.reconnectSeconds` (60 s) underground, and for `PARTY.lobbyGraceSeconds` (15 s) on the surface, which is long enough to reload the page. So a refresh keeps you in your party, and in your expedition.

- **Server:** `Parties.disconnect` marks the member `connected: false` (their pane shows "Reconnecting"), makes them not ready (which unlocks their loadout and stops a countdown) and starts a timer. Underground their player stays in the `Session`, standing where they were: nothing is simulated for them without input, but creatures can still reach them. When the timer runs out they are removed.
- **Resuming:** an account is one member (see [accounts.md](accounts.md)). A `hello` from the account of a dropped member becomes that member again: same member id, same party, same player. Underground, `Session.reattach` swaps in the new socket, restarts input acknowledgement (a reloaded page numbers its frames from 0 again) and sends `welcome` with the layout. The client (on whatever page it loaded) goes to `/play`, rebuilds the map, and the next `tick` puts it back where it stood.
- The same happens if the account connects while its old connection is still open (another tab): the new one takes over and the old one is closed.
- A dropped member whose player dies, or whose expedition ends, has nothing left to hold and leaves the party (`Parties.sweep`).

**Client:** `GameClient` retries every 2 s, and the connection module gets a ticket first each time it starts. Only the site answering "not signed in" (401) sends the browser to the sign-in page; any other failure (the site restarting, the network) is retried. While the connection is down `/play` shows "Connection lost. Reconnecting..." and drops the expedition view; `welcome` brings it back.

## Spectating

A player who dies while others are still alive underground watches through a teammate's eyes until the expedition is over.

- **Server:** `died` carries `spectating`: whether anyone alive is left in the session after that tick. If so the session keeps the dead player's socket in `spectators`: they are out of the simulation (and show as on the surface in the party), but still receive every `tick`.
- When the session's last player is out, each spectator gets `spectateEnd { escaped }`, the number of players who got out alive (climbed out or carried out by a banishing).
- `stopSpectating` (the Leave button) or disconnecting removes a spectator early.

## Abandoning

The settings screen underground has an Abandon expedition button (`onabandon` on `Settings`), with a dialog to confirm. The client sends `abandon`; `Session.abandon` drops everything the player carried where they stand (as on death), sends `abandoned` with its summary and removes them. Nothing comes back to the surface with them, and they do not spectate. The others carry on; if they were the last one down, the expedition ends.

- **Client:** on `died` with `spectating`, the page keeps the map, creatures, items and other players, drops the local player, and puts the camera at the watched player's interpolated head (`RemotePlayers.view`), hiding that player's body (`setHidden`). `SpectateBar` shows who is being watched, with Next (cycle teammates) and Leave. If the watched player dies or leaves, the view moves to the next one.
- The results screen is held back until spectating ends, then shows how many of the others made it out.

Only the dead spectate. Players who left alive see the leaving fade, then the results, then the Loadout page.

## Extraction

**Where:** extraction points are `extract-*` markers in a piece (Blender) and come through the manifest's `extracts`. `buildCollisionWorld` puts them all into `world.extracts` in world space. The start room has one at its sealed surface door.

**How:** it runs in the shared simulation, so the client predicts the progress bar and the server decides.

- Holding `interact` (E) while standing still, grounded and not swimming, within `extractRadius` (horizontal) and `extractHeight` of a point, adds to `state.extracting`.
- Moving, letting go or mantling resets it to 0.
- At `extractSeconds` (3 s), `state.extracted` is set. The server stops simulating that player and finishes the extraction.

**Client feedback:** near a point the HUD shows "Hold E to climb out" (using the player's current binding) in a `HoldPrompt` pill whose background fills while holding. Use `HoldPrompt` (`src/lib/ui/HoldPrompt.svelte`) for every hold-key prompt so they all look the same.

**Adding an extraction point:** put an `extract-<n>` empty in a piece, export, then run `pnpm asset:build`.

## Leaving and results

**Stingers:** `expedition.intro` plays when a `welcome` arrives with `resumed: false` (a real descent; a reconnect sends `resumed: true` and stays quiet). `expedition.outro` plays when leaving alive. Both are on the music bus, so no muffling or reverb from the room.

**Leaving:** on `extracted`, `abandoned`, `banished` or `resolved` the play page does not drop the world at once. `leave()` closes any menu, stops control (`extracting` blocks input), plays the outro and shows `ExtractFade`: "Extracting" over the world as it fades to black over `EXPEDITION.leaveFadeSeconds`. Then `endExpedition()` puts the expedition away and the results fade in out of the black. Dying skips the fade (the downed screen and spectating already cover it).

**Results:** `ExpeditionSummary` (`src/lib/shared/protocol.ts`), built by `Session.summary`: time underground, deepest level reached (shown counting the start as level 1), and the player's `kills`, `crates` (first to open) and `clues`. The session counts those from the tick's events (`Session.tally`): `creatureDie.by`, `crateOpen.player`, `clue.player`. The client adds the Affliction's name and lists what was brought out with what it would sell for. To add a stat, add it to `ExpeditionSummary` and `Player.stats`, count it in `tally`, and show it in `ExpeditionResult`.

**Continue** always goes to the Loadout page (`surface`), to put the haul away or kit out again.

## Room banners

Start and major rooms with a `title` in `MAP_KIT` show a banner the first time a player enters them in an expedition.

- On map load, the client builds a lookup from each titled room's occupied cells (`occupiedCells`).
- A few times a second, it finds the cell and level the player is in.
- The start room's banner shows at spawn.

To give another room a banner, add `title` to its kit entry.
