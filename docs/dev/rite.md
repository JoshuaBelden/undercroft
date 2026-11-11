# The rite: clues, the holder, resolution

The rite is how an Affliction is resolved (see `docs/HANDOFF.md`). Players learn what it needs and where it is held from clues, bring the items to that room, and one of them performs it. The Gloaming's rite currently needs one clue and the Pendant; the full list (5 candles, 1 chalk, the Pendant) comes back with those items in Phase 6.

## Files

| File                                 | What                                                             |
| ------------------------------------ | ---------------------------------------------------------------- |
| `src/lib/content/afflictions.ts`     | `RiteSpec` on each Affliction (data)                             |
| `src/lib/content/items.ts`           | Rite items (`kind: 'rite'`) and the clue (`kind: 'clue'`)        |
| `src/lib/shared/affliction/rite.ts`  | Shared rules: what clues reveal, the snapshot, "carries it all"  |
| `src/lib/shared/affliction/types.ts` | `RiteSnapshot` (part of `AfflictionSnapshot`)                    |
| `server/rite.ts`                     | `RiteDirector` (clues found, the room, who can perform), scatter |
| `server/progress.ts`                 | `Progress`: clues found and resolutions, kept across expeditions |
| `src/lib/ui/RiteOverlay.svelte`      | The rite overlay                                                 |

## Data

`AfflictionDef.rite` is a `RiteSpec`:

- `requirements`: `{ item, count }[]`, what the holder must carry. Order matters: clues reveal them in this order.
- `room`: piece id of the room it is performed in (`gloaming-chapel`).
- `seconds`: how long the holder holds interact.
- `clues`: how many clues it takes to know everything. Each one reveals one requirement; the last reveals any requirements left and the room (`revealed` in `rite.ts`).
- `clueCopies`: copies of each clue placed in the map. Finding any one counts.
- `atStart`: testing aid. When true, one of each clue and every required item is laid out a few steps from where players start instead (see below). **Currently on for the Gloaming.**

Changing what a rite needs is a change to this data. A new requirement needs an `ItemDef` with `kind: 'rite'`.

## In the map

`scatterRite` (called from `Session.populate`, seeded by the map seed) places:

- **Required items:** each in one of the major rooms other than the rite's own, on a standing, dry nav point.
- **Clues:** `clues × clueCopies` of the `clue` item, one in each distance band from 15% to 85% of the way from the start to the farthest reachable point, never in the rite's room.

With `atStart` set, none of that applies: the clues and the required items are placed on separate nav points 1.5 to 4 m from the start.

A clue is a world item that is never carried. Pressing interact on one (`Session.pickUp`) removes it and calls `RiteDirector.find()`. That raises the `clue` game event, with the requirements and room it revealed, to every player. Once everything is known, the remaining clue copies are removed from the map.

Neither the Pendant nor the clue has a model yet. On the floor they are drawn as boxes from `ItemDef.placeholder` (size and colour): a small brass-coloured block and a pale sheet.

## What clients know

Each tick's `affliction.rite` is a `RiteSnapshot`: `requirements` with `null` for slots no clue has revealed, `room` (`null` until the last clue), and `seconds`. Hidden information is never sent.

On the dashboard, the Afflictions page (`Afflictions.svelte`) shows the same thing from saved progress. It is a full page (no centred column): a strip of panes, 400px wide, one per Affliction, centred vertically in the window and scrolled sideways by dragging with the mouse (`dragScroll.ts`), by touch or with the scrollbar.

Each pane has the Affliction's picture across the top (`AfflictionDef.image`, see [asset-pipeline.md](asset-pipeline.md)) with its name centred in the first 250px, then its flavor text (`AfflictionDef.flavor`) on a fade (the pane is slightly see-through), then the rite: under "Requirements" one [slot](systems.md#slots) per requirement, always all of them, with a grey question mark in each one no clue has revealed (a revealed one shows the item's picture if it has one), and under "Location" the room. On the Afflictions page each known pane ends with a Join Expedition button (`onjoin`): it chooses that Affliction for the party and opens the Expedition page. It is disabled, with the reason as its tooltip (`joinBlocked`), for anyone but the host and while an expedition is under way. It builds the view with `riteSnapshot`, like the server does.

After the real Afflictions come `UNKNOWN_PANES` (4) panes for ones nobody has met: "Unknown", `UNKNOWN_SLOTS` question-mark slots, and the `affliction-unknown-banner` picture. Lower the number as Afflictions are added to `AFFLICTIONS`; a new one needs only `flavor`, `image` and its picture.

The rite overlay (`ritePanel` action shows and hides it) sits in the top right corner any time underground, including while spectating: each requirement or "Unknown", who in the party carries it (from the player snapshots), and the room. It is an overlay, not a menu: it takes no clicks, the pointer stays locked and play goes on under it. It is hidden while a menu or the results are showing.

## The holder and performing it

There is no holder role. Whoever carries every requirement (in any slot: `carriesAll`) can perform the rite. Players pool items by dropping them for that person to pick up. If they die, the items drop where they fell like everything else.

`Session.stepRite` runs each tick. A player performs while they:

- are on their feet,
- hold interact,
- stand in the rite's room (`RiteDirector.inRoom`, by map cell),
- carry everything, and
- the room has been revealed (`RiteDirector.complete`), in this expedition or an earlier one.

`PlayerState.performing` counts the seconds (server-driven, like `reviving`) and resets if any of that stops being true. At `seconds` the items are used up, and at the end of the tick every player still in the expedition gets `resolved { seconds, deepestLevel }` and leaves it, counted as having got out. The client shows the results screen with the `resolved` outcome.

The client shows "Hold E to perform the rite" under the same conditions, with its progress.

## Progress across runs

`Progress` (`server/progress.ts`) keeps, per player and Affliction, the clues found and whether the rite has been performed. It is stored in the MongoDB collection `progress` (`_id` is `<player>:<affliction>`). Without a database it is kept in memory until the server restarts.

- **Who a player is:** their explorer (see [accounts.md](accounts.md)). The `player` field of a progress record is the explorer id.
- **On descent** (`Parties.descend`): the expedition starts with the most clues any member has found, and that is recorded for all of them.
- **When a clue is found:** recorded for everyone who went down on that expedition (`SessionHooks.onClues`).
- **On resolution:** `resolved` is recorded for each of them (`onResolved`). That record is the progression unlock; nothing reads it until a second Affliction exists.

## Admin

These need `DEV_MODE`:

- **Reveal all clues** (`revealClues`);
- **Reset rite progress** (`resetRite`): forgets the clues in this expedition and in the stored progress of everyone in it. It does not put clue items back in the map.
- **Give** the Pendant, and **teleport** to `gloaming-chapel`, with the existing commands.
