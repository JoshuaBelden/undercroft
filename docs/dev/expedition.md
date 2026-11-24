# Parties, expeditions, extraction and room banners

A **party** is the group that descends together (one to `PARTY.maxSize` players; solo is a party of one). An **expedition** is one run: a server `Session` with its own seed, map and players, started by a party.

## Files

| What                                             | Where                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Parties (ready, countdown, starting expeditions) | `server/parties.ts`                                                                   |
| Session (map, players, simulation, extraction)   | `server/session.ts`; each feature in `server/systems/` ([session.md](session.md))     |
| Connection routing                               | `server/connection.ts`                                                                |
| Party rules (size, countdown, reconnect times)   | `src/lib/content/party.ts`                                                            |
| Party state sent to clients                      | `src/lib/shared/party/types.ts`                                                       |
| Lobby: the Expedition page                       | `src/routes/(hub)/+page.svelte`, `PartyLineup`, `AfflictionPicker`, `LaunchCountdown` |
| Spectating bar                                   | `src/lib/ui/SpectateBar.svelte`                                                       |
| Rules (extract time and radius)                  | `src/lib/content/expedition.ts`                                                       |
| Extraction in the simulation                     | `src/lib/shared/player/simulate.ts` (`updateExtraction`, `nearExtract`)               |
| Extract points                                   | `CollisionWorld.extracts` (`src/lib/shared/map/collision.ts`)                         |
| Arriving: dark, then a fade into the start room  | `src/lib/ui/descent.svelte.ts`, `DescentVeil`, `EXPEDITION.arriveFadeSeconds`         |
| Leaving fade ("Extracting")                      | `src/lib/ui/ExtractFade.svelte`, `EXPEDITION.leaveFadeSeconds`                        |
| Results screen                                   | `src/lib/ui/ExpeditionResult.svelte`                                                  |
| Room banner                                      | `src/lib/ui/RoomBanner.svelte`, titles in `MAP_KIT` (`src/lib/content/map/kit.ts`)    |

## Parties

Every connection is in exactly one party from its `hello` on. The server owns parties and sends each member the whole `PartyState` (`party` message) whenever anything in it changes; the client only renders it. The lobby is the dashboard's Expedition page: the party standing about in one scene (`PartyLineup`, `src/lib/ui/PartyLineup.svelte`), and the launch panel in the lower right. You stand in front in the middle; the others stand behind, the first on the left, the next two on the right. Each is dressed in their look (`PartyMember.look`, [player.md](player.md#the-look)) and plays `waiting` (Mixamo's Bored) from a random point, so nobody moves in step; under each are only their gamer tag and whether they are ready.

- **Creating:** `hello` puts you in a party of one. That is "not in a group": the page shows only you.
- **Joining:** by accepting a friend's invite (see [social.md](social.md)), which moves you into their party (`Parties.join`). There are no invite codes. In the desktop app, friends join through Steam instead: a guest who arrives through the tunnel joins the host's party at once (`joinHost`), and leaving it sends them home to their own game. See [hosting.md](hosting.md#guests-on-the-hosts-game-server).
- **Leaving:** `leaveParty` moves you to a new party of one. The host can do the same to someone else with `kick { member }` (see [social.md](social.md#kicking)). A party with no members is deleted.
- **Host:** the first member (`PartyState.leader`). If the host leaves, the longest-standing member takes over. The host chooses the Affliction.
- **Affliction:** `affliction { id }`, host only. `PartyState.affliction` is null until then. `PartyState.progress` is the host's clues and resolution for it: the whole party plays at the host's progress (see [rite.md](rite.md#progress-across-runs)). Changing it makes everyone not ready. It stays chosen after an expedition.
- **Ready:** `ready { ready }`, for every member including the host. Refused until an Affliction is chosen. Becoming ready first marks the explorer `ready` in MongoDB, which locks the stash, loadout and store (see [economy.md](economy.md)); only then does the party see them as ready. `ready { ready: false }` cancels at any time and unlocks. Joining or leaving a party, dropping, and a change of Affliction all clear it.
- **Countdown:** after every change `Parties.changed` checks `allReady` (an Affliction is chosen, nobody is underground, every member is connected and ready). When it becomes true a timer of `PARTY.countdownSeconds` (5) starts and `PartyState.launchIn` carries the milliseconds left; when it stops being true (someone cancels, joins, leaves or drops) the timer is cleared. When it runs out the expedition starts. Nobody presses a descend button.
- **Names and avatars:** a member's name is their account's gamer tag and their `avatar` the URL of their avatar (shown on their pane), both read from the database when they connect and again when they send `profile` (after changing either on the Account screen). See [accounts.md](accounts.md#avatars).

All checks are on the server (`Parties`); `allReady` is shared so both sides use the same rule.

### Launching, on the client

1. The launch panel shows the chosen Affliction: its name over its picture, which moves opposite to the cursor like the backdrop but further (`.art`, reading the hub's `--parallax-x`/`--parallax-y` from `use:parallax`), wreathed in smoke the accent cyan behind the card (`.smoke`, three soft, drifting radial gradients; no blur, which would repaint every frame). Both hold still under `prefers-reduced-motion`; the colours and timings are in the `(hub)/+page.svelte` styles. The host's "Select Affliction" opens `AfflictionPicker` (the Afflictions' panes; click one). Join Expedition on a pane of the Afflictions page does the same and comes back here (see [rite.md](rite.md)). The Launch Expedition button is disabled until one is chosen.
2. Launch Expedition (or holding X on a controller, see [controller.md](controller.md#menus)) sets `launch.confirming` (`src/lib/ui/launch.svelte.ts`) and goes to the Loadout page, which shows a "Confirm loadout" bar while it is set.
3. Confirm (or holding X again) waits for any loadout change still on its way to the server (`Outfit.settled()`), sends `ready { ready: true }` and returns to the Expedition page. The pane shows Ready to everyone.
4. While ready, the Loadout page and the Store are locked and the money in the frame is not a link. Cancel (in the launch panel, or on the countdown) sends `ready { ready: false }`.
5. `LaunchCountdown` (in the root layout, so on every page but `/play`) shows the seconds from `connection.launchAt`.
6. `welcome` arrives and the root layout goes to `/play`.

## Lifecycle

1. Signing in lands on the Expedition page. The site-wide connection (`src/lib/game/net/connection.svelte.ts`, see [systems.md](systems.md#networking)) sends `hello` with its ticket (see [accounts.md](accounts.md)), lands in a party and gets `party`.
2. Everyone readies up and the countdown runs out (above). `Parties.descend` creates a `Session` against the party's Affliction (new seed, generated layout), takes each member's loadout from their explorer (see [economy.md](economy.md)) and adds them with it. Each gets `welcome` with the layout: that message means "you are underground now", and the client opens `/play`. See [The descent](#the-descent) for what the screen does meanwhile.
3. Players explore. The session simulates them and broadcasts `tick` snapshots to the players in it.
4. A player climbs out (see Extraction), dies, abandons (see Abandoning), or runs out of time (see Deadline). Performing the rite and banishing what it summons (see [rite.md](rite.md)) do not end anything: they still have to climb out. The server sends them `extracted`, `died` (with `lost` when time ran out) or `abandoned` with their `ExpeditionSummary` (see Results) and removes them from the session, so other players stop seeing them. The connection stays open and they stay in the party.
5. What they carried out goes back to their explorer; if they died or abandoned it is lost (see [economy.md](economy.md)). Leaving alive, the client fades out first (see Leaving); the dead see the results after spectating (see Spectating). Continue on the results goes to the Loadout page. While others are still underground their panes say so, and nobody can launch.
6. When the session's last player is out (or has disconnected), it stops. The party is back on the surface and can launch again.

`/play` is only the expedition: opened with none to show, it goes back to the dashboard.

## The descent

The moment the countdown runs out, the screen goes black (`darken` in `src/lib/ui/descent.svelte.ts`, drawn by `DescentVeil` in the root layout), so the Expedition page never shows again on the way down. It stays black while `/play` opens and the run loads (the loading bar shows over it), then, once the start room has drawn, fades into it over `EXPEDITION.arriveFadeSeconds` (`reveal`). If no run arrives within `EXPEDITION.descentGiveUpSeconds` of the count running out, the dark lifts on its own.

## Deadline

An expedition lasts `AfflictionDef.expeditionSeconds` (2400 s, 40 minutes, for the Gloaming), counted from when the first player arrives (`DeadlineSystem.startedAt`, `server/systems/deadline.ts`). Each tick's `affliction.deadline` is the seconds left. At zero (`DeadlineSystem.step`) a `deadline` event is raised and everyone still underground, downed or not, dies: the normal death path drops what they carried where they stand and sends `died` with `lost: true`.

The client shows it at the top centre (`ExpeditionClock.svelte`): the time as m:ss, red from five minutes. Nothing else: the Affliction's meter is never shown (see [affliction.md](affliction.md#the-meter)).

Admin (`DEV_MODE`): **Time left (s)** in the Affliction group sets the seconds left (`setDeadline`).

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
- When the session's last player is out, each spectator gets `spectateEnd { escaped }`, the number of players who got out alive (climbed out).
- `stopSpectating` (the Leave button) or disconnecting removes a spectator early.

## Abandoning

The Rite tab of the in-game menu has an Abandon expedition button (`onabandon` on `GameMenu`, see [items.md](items.md#the-in-game-menu)), with a dialog to confirm. The menu doesn't open while downed or spectating, so neither can abandon: downed, you can surrender; spectating, the spectate bar's Leave goes back to the surface. The client sends `abandon`; `Session.abandon` drops everything the player carried where they stand (as on death), sends `abandoned` with its summary and removes them. Nothing comes back to the surface with them, and they do not spectate. The others carry on; if they were the last one down, the expedition ends.

- **Client:** on `died` with `spectating`, the page keeps the map, creatures, items and other players, drops the local player, and puts the camera at the watched player's interpolated head (`RemotePlayers.view`), hiding that player's body (`setHidden`). `SpectateBar` shows who is being watched, with Next (cycle teammates) and Leave. If the watched player dies or leaves, the view moves to the next one.
- The results screen is held back until spectating ends, then shows how many of the others made it out.

Only the dead spectate. Players who left alive see the leaving fade, then the results, then the Loadout page.

## Extraction

**Where:** a way out is a door, an `extract-*` marker (the manifest's `extracts`, into `world.extracts`), or a rope, a `rope-*` marker with an `exit` (the manifest's `ropes`, into `world.ropes` with an `exitY`). `buildCollisionWorld` puts both into world space. Every map has three:

1. and 2. the extraction rooms (`extraction-gate`, role `extraction`) at the end of levels 1 and 2, beside the double door down to the next level (see [map-generation.md](map-generation.md#levels));
2. the final room (`gloaming-chapel`) on level 3, at the foot of a ladder on its dais.

There is none at the start: the rope down from the start room (the Angel's Well, see [map-generation.md](map-generation.md#the-start-room)) ends out of reach of the floor, so getting out means going on to the end of the first level at least.

The extraction rooms' way out is a rope going up into the dark (`rope_anchor` in `scripts/blender/kit.py`), hanging down a round shaft through the ceiling (their ladders were taken out: `remove_extraction_ladders`). It is a `rope-0` marker with an `exit`: climb 5.4 m up it, most of the way up the shaft, and you are out (see [rope.md](rope.md)). The chapel's is an `extract-0` marker, the hold below: the chapel's at the foot of a timber ladder (`extraction_ladder`) up to a hatch high in the west wall of the nave, on the dais.

**How:** it runs in the shared simulation, so the client predicts the progress bar and the server decides.

- **Up a rope:** take hold with `climb` and climb. When the feet reach the rope's `exitY`, `state.extracted` is set (`stepClimb`). The prompt says "[W] to climb out", its pill filling with how far up you are. A downed player can't climb, so the chapel's ladder is the only way out they can crawl to.
- **At the door:** holding `interact` (E) while standing still, grounded and not swimming, within `extractRadius` (horizontal) and `extractHeight` of a point, adds to `state.extracting`.
- Moving, letting go or mantling resets it to 0.
- At `extractSeconds` (3 s), `state.extracted` is set. The server stops simulating that player and finishes the extraction.

**Client feedback:** near a point the HUD shows "[E] to climb out" (the player's current binding as a keycap) in a `HoldPrompt` pill whose background fills while holding. Use `HoldPrompt` (`src/lib/ui/HoldPrompt.svelte`) for every hold-key prompt so they all look the same. Its `key` shows a keycap (`KeyCap`, large) before the text. Every in-game key prompt is made by `keyPrompt(action, text, progress)` in the play page: the action's first binding as the keycap (`promptKey`), then a short phrase ("to climb out", "to search", "to pick up Bandage"), the same while it is held (the fill shows the progress). With the action unbound it falls back to words ("Interact to climb out"). The downed screen's surrender prompt and the rite's "holds [E]" use the keycap too. Never write a key into prompt text.

**Keyboard shortcuts on screen:** draw a key with `KeyCap` (`src/lib/ui/KeyCap.svelte`): a white rounded cap with the label in bold black, `small` (14 px, beside HUD bars) or `large` (in a prompt). Always pass the player's current binding through `bindingLabel` (`src/lib/game/input/actions.ts`), never a hard-coded letter, so it follows remapping; show nothing when the action is unbound. The headlamp key sits to the left of the battery cells (`Hud`'s `lampKey`).

**Adding an extraction point:** put an `extract-<n>` empty in a piece at the foot of a ladder (`kit.extraction_ladder`), or a door you hold interact at. A rope can be a way out too: a `rope-<n>` empty (`kit.rope_anchor`, with `exit`) where a rope goes up out of the piece, as in `extraction-gate` (see [rope.md](rope.md)). Export, then run `pnpm asset:build`. To add another kind of extraction room, build it with a way out and a `gate` socket, and give it `role: 'extraction'` in `MAP_KIT`. One ends every level but the deepest, picked by `weight`.

## Leaving and results

**Stingers:** `expedition.intro` plays when a `welcome` arrives with `resumed: false` (a real descent; a reconnect sends `resumed: true` and stays quiet). `expedition.outro` plays when leaving alive. Both are on the music bus, so no muffling or reverb from the room.

**Leaving:** on `extracted` or `abandoned` the play page does not drop the world at once. `leave()` closes any menu, stops control (`extracting` blocks input), plays the outro and shows `ExtractFade`: "Extracting" over the world as it fades to black over `EXPEDITION.leaveFadeSeconds`. Then `endExpedition()` puts the expedition away and the results fade in out of the black. Dying skips the fade (the downed screen and spectating already cover it).

**Outcome:** the results screen's title comes from the message, except that `extracted` after the Affliction was resolved (the last tick's `rite.resolved`: the rite performed and what it summoned banished) shows "The dark recedes", and `died` with `lost` shows "Lost in the dark".

**Results:** `ExpeditionSummary` (`src/lib/shared/protocol.ts`), built by `Session.summary`: time underground, deepest level of the map reached (`tierAt`, 0 for the first; shown counting from 1), the player's `kills`, `crates` (first to open) and `clues`, and the `experience` earned (with what they had before, for the level line; see [progression.md](progression.md#earning)). The session counts those from the tick's events (`Session.tally`): `creatureDie.by`, `crateOpen.player`, `clue.player`. The client adds the Affliction's name and lists what was brought out with what it would sell for. To add a stat, add it to `ExpeditionSummary` and `Player.stats`, count it in `tally`, and show it in `ExpeditionResult`.

**Continue** always goes to the Loadout page (`surface`), to put the haul away or kit out again.

## Room banners

Start, major and extraction rooms with a `title` in `MAP_KIT` show a banner every time a player walks into them from outside.

- On map load, the client builds a lookup from each titled room's occupied cells (`occupiedCells`) to its title and its placement index (`roomIds`), so the two extraction rooms are told apart.
- A few times a second, it finds the cell and level the player is in. When that is a different room from last time (`inRoom`, null in the passages), the banner shows.
- The start room's banner shows at spawn.

To give another room a banner, add `title` to its kit entry.
