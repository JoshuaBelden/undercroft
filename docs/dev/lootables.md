# Lootables

Everything in the map that is searched for loot: crates, the dead, locked trunks, and wall niches, bone piles, sarcophagi, tool chests, lockers, sunken satchels, offering boxes, vestry cabinets, rat nests, webbed cocoons, smugglers' stashes, the Surveyor's caches and reliquary alcoves. They are all one thing, `layout.crates` entries told apart by `kind`, so going through any of them works the same way (the loot screen, revealing, moving things: [items.md](items.md#loot-crates)). What differs is data. The design is in [the gear, crafting and loot handoff](../handoff-gear-crafting-loot.md#lootables).

## Files

| File                                 | What                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| `src/lib/content/lootables.ts`       | `LOOTABLES` (every kind, as data), `PENDING_ITEMS`, `LOOT_BUDGET`                    |
| `src/lib/content/loot.ts`            | `CRATES` (fill, reveal), `CORPSES` and `TRUNKS` (how many), `LOOSE_LOOT`             |
| `src/lib/content/map/kit.ts`         | Each room's `lootables` mix, until its piece has lootable markers                    |
| `src/lib/shared/items/lootables.ts`  | The rules: how one opens (`waysFor`, `bestWay`, `canUse`, `hasTool`), its middle     |
| `src/lib/shared/items/loot.ts`       | `rollLootable`, `trimToBudget`, `rollLoose`                                          |
| `src/lib/shared/map/crates.ts`       | `placeCrates`: which markers have a lootable, and what                               |
| `server/crates.ts`                   | `Crates`: what each holds, sealed or not, keys, the budget, who has it open          |
| `server/systems/crates.ts`           | `CrateSystem`: opening one (the way, its time and noise), going through it           |
| `src/lib/game/items/Crates.ts`       | Their models (or placeholder boxes), lids, highlight                                 |
| `src/lib/game/play/crates.svelte.ts` | The prompt (the same rule as the server), sounds, the loot screen's title and flavor |

## A lootable (`LootableDef`)

- `name` (the loot screen's title) and `flavor` (lines, one shown under the title, picked by the lootable's id with `flavorOf` so everyone sees the same).
- `model` (a `modelUrl`) or `null`: then it is drawn as a box of its `size` and `color`. Its planned model is listed on the admin Art & Assets page ([admin.md](admin.md#art-and-assets)).
- `size`: across (along the wall), high, deep (out from the wall), in metres. `solid`: in the collision world (crates, chests, lockers) or stepped over (bodies, bone piles, nests). `lookHeight`: where its middle is looked at, if not half its height.
- `slots` on the loot screen.
- `open`: its ways of opening (below). `sealed`: some are sealed, and open only other ways.
- `noise`: how far (m) its first opening is heard; `lootNoise`: each thing taken out of it or put in. `sound`: played as it is first opened (a `lootable.*` sound, synthesized until recorded).
- `loot`, `rarity` and `prize`: what it holds (below). `lid`: a part of its model that swings up when it is opened (the crate's).

## Opening

A way (`OpenWay`) is `seconds` of holding interact, the `verb` the prompt shows, and optionally:

- `tool`: something **in the hand**, not broken: `pry` (an item with `pry`, the crowbar), `cut` (an item whose `cuts` names this lootable: the knife cuts cocoons), `picks` (lockpicks) or `smash` (a sledgehammer). `hasTool` reads the item's fields, never its id.
- `key`: a key carried anywhere (`unlocks`), used up, at once (a press).
- `noise` and `every`: the work is heard that far, as it starts and every `every` seconds (prying, smashing), with the player as the source.

`bestWay(ways, inventory, lootable)` is the fastest way the player can use, a key first; null if none. The server opens it that way (`CrateSystem.work`), and the client's prompt is worked out by the same function, so they agree. With no way at all, a press only rattles it (`crateStuck`), and the prompt is red and says what it needs ("(needs a crowbar)").

**Sealed.** `sealed.chance` of them are sealed (rolled per lootable in the server's own stream). A sealed one opens only `sealed.open`. `hidden` seals (a jammed crate) look like the rest until someone tries one: the usual hold finds it stuck (`Crate.lock = 'jammed'`, `jamFound`). Others (a locked trunk, a sealed niche) are known from the start (`'locked'`). Once one gives (its sealed way done), it opens at once; a key unlocks, and searching it is a fresh hold. A sealed one may hold better things (`sealed.rarity`). The snapshot's `crates.jammed` (found jams) and `crates.locked` tell clients which are sealed.

| Kind                                     | Opens                    | Sealed                                               |
| ---------------------------------------- | ------------------------ | ---------------------------------------------------- |
| Crate                                    | 1 s                      | A quarter, jammed (hidden): crowbar, 10 s, loud      |
| Dead explorer                            | 2 s                      | —                                                    |
| Locked trunk                             | 1 s, once unlocked       | Always: a key, picks (6 s, silent) or a sledgehammer |
| Wall niche                               | 1 s                      | A third, sealed: crowbar, 4 s; better burial goods   |
| Bone pile                                | 3 s, loud (10 m)         | —                                                    |
| Sarcophagus                              | Crowbar, 6 s, loud       | —                                                    |
| Tool chest                               | 3 s                      | —                                                    |
| Locker, vestry cabinet, Surveyor's cache | 0.5 s                    | —                                                    |
| Sunken satchel                           | 2 s                      | —                                                    |
| Offering box                             | Picks (6 s) or smash     | —                                                    |
| Rat nest                                 | 4 s                      | —                                                    |
| Cocoon                                   | 5 s, or 2 s with a blade | —                                                    |
| Smuggler's stash                         | Crowbar, 3 s             | —                                                    |
| Reliquary alcove                         | Crowbar, 8 s             | —                                                    |

Catches the design gives some of them (rats biting, poison, the alcove's meter cost, a sanity drain, two players pushing a lid, the smuggler's chalk sign) come with the world mechanics.

## Where they stand

`placeCrates(layout, pieces, seed, kit = MAP_KIT)`, seeded by the map seed, each step in its own random stream so one doesn't reshuffle the others:

1. **Markers.** Every `crate-<n>` marker, and every `lootable-<type>-<n>` marker (its kind in its name, exported by `pnpm asset:build` into the piece's `lootables`, at the lootable's own centre), is filled with probability `CRATES.fill`, none within `CRATES.minDistance` of the start and none in the start room.
2. **Corpses:** about `CORPSES.share` of the crates become corpses, where a body fits. The dead lie anywhere, whatever the room.
3. **Trunks:** on `TRUNKS.tiers` (the third level), about `TRUNKS.chance` of the crates left become locked trunks.
4. **Rooms.** A crate left in a piece whose kit entry has `lootables` holds one of those instead, by weight (`crate` among them keeps some crates), pushed out from the wall by the difference in depth, where it fits (clear of walls and the others, on dry floor all over; otherwise it stays a crate). Kinds that nothing in the game can open yet (`openable`: the offering box, until there are lockpicks or a sledgehammer) are left out.

### Rooms

What a room holds is how room type restricts loot. Until the existing pieces have `lootable-*` markers in Blender, their kit entries say what their crate markers hold (the `lootables` mix in `src/lib/content/map/kit.ts`, from the handoff's table of existing pieces): bone piles and niches in the Ossuary Hall, tool chests in the Quarry Gallery, lockers in the Shaft, sarcophagi and niches in crypts, and so on. Once a piece has its own markers, take its line out. Pieces with no crate markers (the Cistern, the canals and flooded halls, the crawls) have no lootables yet.

## What they hold

Each kind has its own **table** (`loot`: item, how many come together, weight near the start of its level and at the far end) and its own **rarity counts for each level** (`rarity`, three of them: fewest and most of each rarity, and the chance of each more, sliding from near to far). The doc's placements are the rule: a crate holds only common and uncommon things on the first two levels and anything on the third; a sarcophagus can hold rare things on the first level and epic ones from the second; an offering box can hold a rare funeral coin on any level.

`rollLootable(def, tier, depth, rng, sealed)` fills one: roll how many of each rarity (its sealed counts if it is sealed), never both an epic and a legendary, a `prize` (a trunk, an alcove) if it rolled neither of those, draw each from its table by weight without repeats, leave out the commonest if it is more than its slots, and lay them out commonest first.

**Items still to come.** Tables already name the materials, treasure and tools of the round (rags, bone, gun parts, funeral coins...). Until each is added to `ITEMS`, its lines are skipped (`liveEntries`). `PENDING_ITEMS` lists them; a test checks every table line is in one or the other. Adding the item to `ITEMS` and taking it out of `PENDING_ITEMS` puts it in the loot.

**The budget.** More lootables mustn't mean more treasure: `LOOT_BUDGET` is the most treasure (by `value`) each level holds, all its lootables together. After the roll, `trimToBudget` takes stacks of treasure out of that level's lootables, at random, until it is within it. Things put there on purpose (quest items, hints, keys) are added after and never taken. The caps sit just above what most maps roll, so only the richest are trimmed.

**Loose loot** is drawn from the crate's table (`rollLoose`, `LOOSE_LOOT.rarities`).

## Admin

- **Teleport** to `lootable-<kind>`: in front of the first of each kind in the map (`testPoints`), and `locked-trunk`, `stuck-crate`.
- **Reset crates** refills everything (seals stay as they are); **Unlock crates** unjams and unlocks everything.
- **Give** a crowbar or a key to open what needs one.

## Adding a kind

1. Add its id to `LootableId` and its `LootableDef` to `LOOTABLES`: name, flavor, size, ways, noise, table, counts. A sound for it in `sounds.ts` (a `synth` until it is recorded).
2. Place it: a `lootable-<id>-<n>` marker in the pieces it belongs in (or, for now, a weight in a kit entry's `lootables`).
3. Its model: in `art/export/props/`, built into `static/assets/shared/props/`, and its `model` set. Until then it is a box, and its planned model is in `src/lib/content/planned.ts`.
4. A help line for it, and anything new about opening it (a new tool: a field on the item, and a case in `hasTool`).
