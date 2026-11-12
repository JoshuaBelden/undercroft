# The rite: hints, the holder, resolution

The rite is how an Affliction is resolved (see `docs/HANDOFF.md`). Players learn what it needs and where it is held from written hints, bring the items to that room, and one of them performs it. The Gloaming's rite needs 5 candles, 1 chalk and the Pendant, performed in the Gloaming Chapel, and has four hints.

## Files

| File                                 | What                                                                |
| ------------------------------------ | ------------------------------------------------------------------- |
| `src/lib/content/afflictions.ts`     | `RiteSpec` on each Affliction (data): requirements, hints           |
| `src/lib/content/hints.ts`           | `HINTS`: where hint items may be put (data)                         |
| `src/lib/content/items.ts`           | Rite items (`kind: 'rite'`) and the hint item (`kind: 'clue'`)      |
| `src/lib/shared/affliction/rite.ts`  | Shared rules: what hints reveal, the snapshot, "carries it all"     |
| `src/lib/shared/affliction/types.ts` | `RiteSnapshot` (part of `AfflictionSnapshot`)                       |
| `server/rite.ts`                     | `RiteDirector` (hints found, the room, who can perform), scatter    |
| `server/hints.ts`                    | Hint spots: crates, corpses, walls, furniture; spreading the copies |
| `server/progress.ts`                 | `Progress`: hints found and resolutions, kept across expeditions    |
| `src/lib/ui/RiteOverlay.svelte`      | The rite overlay                                                    |
| `src/lib/ui/AfflictionPane.svelte`   | An Affliction on the Afflictions page                               |

## Data

`AfflictionDef.rite` is a `RiteSpec`:

- `requirements`: `{ item, count, place? }[]`, what the holder must carry. `place` says where the map holds it: `'crate'` in a loot crate (the Pendant), `'room'` on the floor of a major room. Without `place` it isn't put in the map at all: players buy it or find it as loot (candles, chalk).
- `room`: piece id of the room it is performed in (`gloaming-chapel`).
- `seconds`: how long the holder holds interact.
- `clues`: the hints, in the order they are learned: `{ text, reveals }[]`. `reveals` is a requirement's item id, or `'room'`. Any number of hints and requirements works; once every hint is found everything is known, even a requirement no hint names (`revealed` in `rite.ts`).
- `clueCopies`: hint items placed in the map per hint. They are all alike: whichever is read reveals the next hint (`RiteDirector.find`), so 4 hints × 3 copies puts 12 in the map and any 4 of them tell everything.
- `atStart`: testing aid. When true, the hints go in the crate nearest the start and every placed requirement is laid out a few steps from it. Off for the Gloaming.

Changing what a rite needs is a change to this data. A new requirement needs an `ItemDef`. One there is only one of is also a quest item (`quest: true`, see [items.md](items.md#quest-items)): the Pendant.

## In the map

`scatterRite` (called from `Session.populate`, seeded by the map seed) places:

- **Required items** with a `place`. `'crate'`: `Crates.stow` puts it in one of the map's crates, after whatever the crate rolled, so it is the last thing revealed (in a map with no crates it lies in a major room). `'room'`: on a standing, dry nav point in a major room other than the rite's own.
- **Withheld items:** a requirement in `Session.withhold` is left out. `Parties.begin` withholds every quest requirement that anyone in the party owns: in their stash or loadout on the surface (`owned` in `belongings.ts`, `itemsOwned` in the explorer store) or in the kit they are taking down. That is checked before anyone arrives, and whatever was already placed is taken out again.
- **Hints:** `clues.length × clueCopies` hint items. **Never on a floor.** `server/hints.ts` gathers every spot outside the rite's room, of four kinds:
  - `crate` and `corpse`: every loot crate and corpse (`crateSpots`). The hint goes in last (`Crates.stowIn`). A full crate loses its commonest thing to make room, never a hint or quest item, and a refill keeps both.
  - `wall`: hung at eye level (`HINTS.wall.height`, 1.5 m) on a flat wall of a major room (`wallSpots`). From each standing nav point in a major room, a ray along each axis must hit a collider between 0.4 and 2 m away, and four more rays 15 cm to the sides and above and below must hit within 4 cm of it. The hint is mounted 3 cm out from the collider, facing back along the ray (`WorldItems.mount`).
  - `furniture`: lying on a top at table or coffin height (`furnitureSpots`): a collider no bigger than `HINTS.furniture.maxHalf`, standing on the floor, with its top 0.5 to 1.3 m above a nav point within reach, and clear above. Sarcophagi and the altar qualify. The spot is on the top, inset from the edges, nearest where someone stands.

  `placeHints` puts one copy in each distance band from 15% to 85% of the way from the start to the farthest reachable point. Copies take the kinds in `HINTS.order` in turn; if a band has none of that kind it takes any kind in the band, then any spot left. No two hints are within `HINTS.spacing` (3 m), and a crate holds at most one. If the map runs out of spots, fewer are placed and the server logs a warning.

A hint is read, never carried (`maxStack: 0`):

- on a wall or furniture: pressing interact on it (`Session.pickUp`);
- in a crate or corpse: once revealed, any request on its slot (right-click Read, shift-click, drag) reads it instead of moving it (`Session.lootAction`).

Either way `Session.readClue` calls `RiteDirector.find()` and raises the `clue` game event, with the hint's `text` and the requirements and room it revealed, to every player. The hint item is then removed. Once everything is known, the remaining copies are removed from the floor, the walls and the crates (`clearHints`). A copy read when there is nothing left to learn is left alone.

Neither the Pendant nor the hint has a model yet. They are drawn as boxes from `ItemDef.placeholder`: a small brass-coloured block and a pale sheet (standing upright against a wall when mounted).

## What clients know

Each tick's `affliction.rite` is a `RiteSnapshot`: `requirements` with `null` for slots no hint has revealed, `room` (`null` until revealed), `seconds`, `hints` (the texts found so far, in order) and `resolved`. Hidden information is never sent.

The client shows a banner when a hint is found: "A hint: Candle" over the hint's words (`RoomBanner`'s `subtitle`).

On the dashboard, the Afflictions page (`Afflictions.svelte`) shows the same thing from saved progress. It is a full page (no centred column): a strip of panes, 400px wide, one per Affliction, centred vertically in the window and scrolled sideways by dragging with the mouse (`dragScroll.ts`), by touch or with the scrollbar.

Each pane has the Affliction's picture across the top (`AfflictionDef.image`, see [asset-pipeline.md](asset-pipeline.md)) with its name centred in the first 250px, then its flavor text (`AfflictionDef.flavor`) on a fade (the pane is slightly see-through), then the rite:

- under "Banishment", the hints found, in order, and under them the small [slots](systems.md#slots) (36px, like the overlay) of everything the rite needs, never stacked: five candles are five slots of one candle. A requirement no hint has revealed is a single grey question mark (how many it needs is hidden too). A revealed one is greyed out slot by slot until the explorer owns that many (stash and loadout counted together, `owned`): owning three candles lights three of the five;
- under "Location", the room.

Each known pane with any progress has a **Reset** button (`onreset`): after a `Dialog` asks, it sends `resetAffliction { id }` to the game server. `Parties.resetAffliction` refuses while the party is underground (the button is disabled then, with the reason as its tooltip), otherwise forgets that explorer's progress (`Progress.reset`, which also clears its in-memory copy), looks the host's progress up again if they are the host, and answers `afflictionReset`. The page then reloads the account. The reset goes through the game server rather than an HTTP route so that `Progress`'s memory and the party's cached progress agree with the database.

On the Afflictions page each known pane ends with a Join Expedition button (`onjoin`): it chooses that Affliction for the party and opens the Expedition page. It is disabled, with the reason as its tooltip (`joinBlocked`), for anyone but the host and while an expedition is under way. It builds the view with `riteSnapshot`, like the server does.

After the real Afflictions come `UNKNOWN_PANES` (4) panes for ones nobody has met: "Unknown", `UNKNOWN_SLOTS` question-mark slots, and the `affliction-unknown-banner` picture. Lower the number as Afflictions are added to `AFFLICTIONS`; a new one needs only `flavor`, `image` and its picture.

The rite overlay is always shown at the middle of the left edge underground, including while spectating (there is no key for it). It has no background or border: the Affliction's name in a pill ("Resolved" beside it once it is done), the hints found in italics, then a grey line down the left with a tick to each requirement and, last, the room. A requirement a hint has revealed shows a small [slot](systems.md#slots) with its picture, greyed out unless this player carries some of it (`carriers` marks this player `self`); an unrevealed one shows only the question-mark slot, and an unknown room reads "Location: Unknown". Under each name is who in the party carries it (from the player snapshots). It is an overlay, not a menu: it takes no clicks, the pointer stays locked and play goes on under it. It is hidden while a menu or the results are showing.

## The holder and performing it

There is no holder role. Whoever carries every requirement (in any slot: `carriesAll`) can perform the rite. Players pool items by dropping them for that person to pick up. If they die, the items drop where they fell like everything else.

`Session.stepRite` runs each tick. A player performs while they:

- are on their feet,
- hold interact,
- stand in the rite's room (`RiteDirector.inRoom`, by map cell),
- carry everything,
- the room has been revealed (`RiteDirector.roomKnown`), in this expedition or an earlier one, and
- it hasn't been performed yet in this expedition.

`PlayerState.performing` counts the seconds (server-driven, like `reviving`) and resets if any of that stops being true. At `seconds`:

- the items are used up;
- `RiteDirector.resolved` is set and `resolved` is saved for everyone who went down (`SessionHooks.onResolved`), straight away: dying afterwards doesn't undo it;
- the Affliction is calmed (`AfflictionDirector.calm`, see [affliction.md](affliction.md#calmed-by-the-rite)): no more meter, omens or manifestation;
- a `rite` game event plays `rite.resolve` and a banner for everyone.

Nobody is carried out: they still have to extract before the deadline (see [expedition.md](expedition.md#deadline)). Extracting afterwards shows the results screen with the `resolved` outcome.

The client shows "[E] to perform the rite" under the same conditions, with its progress.

## Progress across runs

`Progress` (`server/progress.ts`) keeps, per player and Affliction, the number of hints found and whether the rite has been performed. Hints are always learned in order, so a count is enough. It is stored in the MongoDB collection `progress` (`_id` is `<player>:<affliction>`). Without a database it is kept in memory until the server restarts.

- **Who a player is:** their explorer (see [accounts.md](accounts.md)). The `player` field of a progress record is the explorer id.
- **The party plays at the host's progress.** On descent (`Parties.begin`) the expedition starts with the hints the **host** has found, not the most any member has, and that is recorded for all of them. So a friend who has already resolved an Affliction can join a run without giving it away: the host still has to find the hints.
- **In the lobby** `Parties.hostProgress` looks up the host's `Progress.of` for the chosen Affliction whenever the host or the Affliction changes, after each expedition, and after the host resets it, and sends it to everyone as `PartyState.progress`. The Expedition page's Resolved / Unresolved label reads that, not the viewer's own progress.
- **When a hint is found:** recorded for everyone who went down on that expedition (`SessionHooks.onClues`).
- **On resolution:** `resolved` is recorded for each of them (`onResolved`). That record is the progression unlock; nothing reads it until a second Affliction exists.
- **Reset:** a player can forget their own progress from the Afflictions page (above).

## Admin

These need `DEV_MODE`:

- **Reveal all clues** (`revealClues`);
- **Reset rite progress** (`resetRite`): forgets the hints in this expedition and in the stored progress of everyone in it. It does not put hint items back in the map.
- **Give** 5 Candles, Chalk and the Pendant, and **teleport** to `gloaming-chapel`, with the existing commands.
