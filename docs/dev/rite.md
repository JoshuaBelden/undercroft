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
| `src/lib/ui/RitePanel.svelte`        | The rite panel                                                   |

## Data

`AfflictionDef.rite` is a `RiteSpec`:

- `requirements`: `{ item, count }[]`, what the holder must carry. Order matters: clues reveal them in this order.
- `room`: piece id of the room it is performed in (`gloaming-chapel`).
- `seconds`: how long the holder holds interact.
- `clues`: how many clues it takes to know everything. Each one reveals one requirement; the last reveals any requirements left and the room (`revealed` in `rite.ts`).
- `clueCopies`: copies of each clue placed in the map. Finding any one counts.

Changing what a rite needs is a change to this data. A new requirement needs an `ItemDef` with `kind: 'rite'`.

## In the map

`scatterRite` (called from `Session.populate`, seeded by the map seed) places:

- **Required items:** each in one of the major rooms other than the rite's own, on a standing, dry nav point.
- **Clues:** `clues × clueCopies` of the `clue` item, one in each distance band from 15% to 85% of the way from the start to the farthest reachable point, never in the rite's room.

A clue is a world item that is never carried. Pressing interact on one (`Session.pickUp`) removes it and calls `RiteDirector.find()`. That raises the `clue` game event, with the requirements and room it revealed, to every player. Once everything is known, the remaining clue copies are removed from the map.

Both the Pendant and the clue are drawn as the grey placeholder until they have models.

## What clients know

Each tick's `affliction.rite` is a `RiteSnapshot`: `requirements` with `null` for slots no clue has revealed, `room` (`null` until the last clue), and `seconds`. Hidden information is never sent.

The rite panel (`ritePanel` action) shows it any time underground, including while spectating: each requirement or "Unknown", who in the party carries it (from the player snapshots), and the room.

## The holder and performing it

There is no holder role. Whoever carries every requirement (in quick slots, pack or pockets: `carriesAll`) can perform the rite. Players pool items by dropping them for that person to pick up. If they die, the items drop where they fell like everything else.

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

- **Who a player is:** until accounts exist (Phase 5), the browser makes up an id once (`playerIdentity()` in the settings store, kept in `settings.profile.id`) and sends it as `hello.player`. Phase 5 replaces it with the account id.
- **On descent** (`Parties.descend`): the expedition starts with the most clues any member has found, and that is recorded for all of them.
- **When a clue is found:** recorded for everyone who went down on that expedition (`SessionHooks.onClues`).
- **On resolution:** `resolved` is recorded for each of them (`onResolved`). That record is the progression unlock; nothing reads it until a second Affliction exists.

## Admin

These need `DEV_MODE`:

- **Reveal all clues** (`revealClues`);
- **Reset rite progress** (`resetRite`): forgets the clues in this expedition and in the stored progress of everyone in it. It does not put clue items back in the map.
- **Give** the Pendant, and **teleport** to `gloaming-chapel`, with the existing commands.
