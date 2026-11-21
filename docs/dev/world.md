# World mechanics

The things in the catacombs that ask more of you than a hold of interact: what bites back from the lootables you reach into, fragile and cursed treasure, rubble and webs across side passages, the mausoleum's locked gate, fonts, the smugglers' hidden stashes and climbing pitons. All of it is server-authoritative and data-driven: each is a field on an item, a lootable or a kit entry, never an item id in the logic. The design is in [the handoff](../handoff-gear-crafting-loot.md).

## Files

| What                                                      | Where                                                                                                                      |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Catches, `together`, `breaks`, `hidden`, `fill`, `meter`  | `LootableDef` and `OpenWay` in `src/lib/content/lootables.ts`                                                              |
| `protects`, `fragile`, `cursed`, `breaks`, `place.anchor` | `ItemDef` in `src/lib/content/items.ts`                                                                                    |
| A room's searching cost                                   | `KitEntry.searchSanity` in `src/lib/shared/map/types.ts` (the Plague Pit's)                                                |
| Reaching in, smashing, noticing, filling                  | `server/systems/crates.ts` (`reachIn`, `shatter`, `notice`, `fillAt`)                                                      |
| Hidden and filled-from lootables' state                   | `server/crates.ts` (`Crate.unseen`, `Crate.fills`, the snapshot's `noticed`, `dry`)                                        |
| Creatures coming out of a lootable                        | `Creatures.spawnAt` in `server/creatures.ts`                                                                               |
| The meter fed                                             | `AfflictionDirector.raise` in `server/affliction.ts`                                                                       |
| Fragile things in a hard fall                             | `Session.falls` in `server/session.ts`                                                                                     |
| Cursed things' drain                                      | `SanitySystem.drain` in `server/systems/sanity.ts`; whispers in `src/lib/game/play/hazards.ts`                             |
| Rubble walls and webs                                     | `RUBBLE_WALLS`, `WEBS` in `src/lib/content/map/walls.ts`; `server/systems/walls.ts`; `src/lib/game/play/walls.ts`          |
| Gates                                                     | `GATES` in `src/lib/content/doors.ts`; `gateSeconds` in `src/lib/shared/items/lootables.ts`; `server/systems/doors.ts`     |
| Pitons                                                    | `PITONS` in `src/lib/content/rope.ts`; `pitonAnchor`, `applyPitons` in `src/lib/shared/items/rope.ts`; `RopeSystem.hammer` |
| Tests                                                     | `server/systems/world.test.ts`, `server/systems/fonts.test.ts`                                                             |

## Catches

A lootable's `catches` are what can go wrong reaching into it. They run every time someone opens it (`CrateSystem.reachIn`), and some only the first time:

- `bite` (a rat nest): `damage` off the opener's sanity, unless something they wear `protects` against `unless` (`bites`). A `bitten` event.
- `condition` (a cocoon): the condition (`poisoned`) for `seconds`, unless something worn protects against `unless` (`poison`).
- `spawn` (a bone pile's rat swarm, a sarcophagus's spiders, a cocoon's): the first time only, with `chance`, `count` creatures of the kind come out on the nav points nearest it and go for the opener.

What is worn is `workingGear`: gear in the three gear slots, not broken. Gloves have `protects: ['bites', 'poison']`.

Also when it opens:

- `meter` (the reliquary alcove): the first time, the Affliction's meter goes up that much (`raise`; nothing once it is resolved).
- `searchSanity` on the kit entry of the piece it stands in (the Plague Pit, 4): every time, off the opener's sanity. A `CratePlacement` records its `piece` for this.

**Two at once.** An `OpenWay` with `together: 2` (the sarcophagus lid without a crowbar) is only usable with that many players holding interact at it: `canUse(way, inv, lootable, helpers)` counts the others (`CrateSystem.helpers`: holding interact, hands free, looking at the same lootable). The client can't see who is helping, so its prompt is red ("needs someone to help") until the server's `opening` count starts, then it fills.

## Fragile and cursed loot

- `fragile` (a jar): a hard landing (`FALL.hardSpeed` or faster) breaks every fragile stack carried, gone, with a `shatter` event (`item.break`). An `OpenWay` with `breaks` (smashing a trunk or an offering box open) breaks each fragile thing inside with that chance.
- `cursed: { sanity }` (the porcelain doll): while it is carried anywhere, that much sanity a second, on top of darkness and sights. The carrier alone hears whispers close by now and then (`CURSE_WHISPER` in the client's hazards feature: the first after 6 s, then every 14 to 30 s).

## Rubble walls and webs

Kinds of wall (`WallPlacement.kind`), placed by `placeWalls` from the same side passages as [false walls](map-generation.md#false-walls): the false walls first (`FALSE_WALLS.count`), then `RUBBLE_WALLS.count` rubble walls, then `WEBS.count` webs, each in a passage nobody has walled yet. Unlike a false wall, they are what they look like: the client draws a heap of rock or a sheet of web (placeholders until `rubble-wall.glb` and `spider-web.glb`), and they are never pried.

- **Rubble:** something whose `breaks` includes `rubble` (the pickaxe), in the hand and working, at the rubble prompts "Break through". Holding interact counts `prying` to `RUBBLE_WALLS.seconds`, heard `noise` away, again every `every` seconds (`dig` event, `rubble.break`); then it comes down (`wallDown`).
- **Webs:** every swing that reaches one (the `swing` SimEvent, within the weapon's range and arc) tears at it; `WEBS.hits` blows bring it down, or one from a weapon whose `cuts` includes `web` (the hatchet). A fire (`HazardSystem`) burns away every web within its radius and `WEBS.burn` more. `webHit` events carry `down` and `burned` (`web.tear`, `web.burn`).

Down is down for good, in the same `walls` list each tick carries. Nothing behind one is on the nav grid, as for a false wall.

## Gates

A `gate-<n>` marker (the Family Mausoleum's `gate-0`, across the vault between the antechamber and the tombs) is a door with a lock: `placeDoors` places it with the doors, `kind: 'gate'`, with `GATES.size` for its box. It is shut and solid like any door, and opened like one, but it takes:

- a key carried anywhere (`unlocks`): `GATES.keySeconds`, and the key is used up;
- or lockpicks (`picks`) in the hand: `GATES.picksSeconds`, silently, with `GATES.snap` chance of losing a pick.

With neither, holding interact does nothing; the prompt is red ("needs a key or lockpicks"). `gateSeconds` is the shared rule. `Crates` hides one key for every gate, as for every locked trunk (the session passes it the count). The gate swings open toward the antechamber (`yaw` 0: leaves to +Z), heard `GATES.noise` away. The client draws a placeholder iron gate until `mausoleum-gate.glb`.

## Fonts

A lootable with `fill` (the font) is filled from, not opened: no slots, no `open` ways. Holding interact at it with a `fill.needs` (a glass bottle) carried counts `opening` to `fill.seconds`, then turns one into a `fill.makes` (holy water) (a `filled` event, `lootable.font`). Each holds `fill.fills` (2 to 4, rolled per map in its own stream) before it runs dry; dry ones are in the tick's `crates.dry`. `openable` keeps fonts out of maps until both items exist. Fonts stand in the Vestry, the Gloaming Chapel and the Drowned Chapel (`lootable-font-*` markers, `ROOMS` in `scripts/blender/lootables.py`). Discovering holy water by filling one comes with crafting.

## Smugglers' stashes

A lootable with `hidden: { reach, seconds }` (the stash) can't be opened, or looked at for opening, until someone notices it: looks at it from within `reach` m (within 0.3 rad, in sight) for `seconds`. `Crate.unseen` is true until then; `Crates.lookedAt` passes unseen ones over, and so does the client's targeting, using the tick's `crates.noticed`. Noticing is a `noticed` event; the noticer hears `stash.notice`. Its placeholder has a pale chalk cross over it (the planned decal).

## Pitons

An item with `place.anchor` (climbing pitons) is set down like a snare (hold attack, standing still). The `place` SimEvent goes to the rope system: `pitonAnchor(world, feet, facing)` looks for an edge in front, within `EDGE_SEARCH` (1.4 m): the tie point is the last floor before it falls away, so the rope hangs clear of the ledge however far back the piton was hammered from. Past it the floor has to fall away at once (on a solid block, the floor under the block would otherwise read as a drop), at least `PITONS.minDrop`, and no anchor within `PITONS.apart`. Each piton in is drawn where it went in, point down, with its item's model (`Ropes.drawPitons`). If there is one, it is an `Anchor` (`piton-<n>`) like a map's: added to the world, sent in the `ropes` message (`pitons`, applied with `applyPitons` before the tied ropes), heard `PITONS.noise` away (`piton` event, `piton.hammer`). Ropes are tied and untied there exactly as at a map anchor ([rope.md](rope.md)). With no edge, the piton goes back in the pack (`pitonFailed`).

## Admin

- **Bring down false walls** (`openWalls`) brings down rubble walls and webs too; **Open the doors** (`openDoors`) opens gates.
- **Unlock crates** (`unlockCrates`) also finds every stash and fills every font (`Crates.free`).
- Teleport to `lootable-<kind>` (`lootable-stash`, `lootable-font`...) to stand at one.

## Adding one

- **A catch:** a `LootCatch` on the lootable. A new kind of catch is a case in `reachIn`.
- **Protection:** a word in an item's `protects` and the same word in a catch's `unless`.
- **A room's cost:** `searchSanity` on its kit entry.
- **A wall kind:** a `WallPlacement.kind`, its count in `walls.ts`, `placeWalls`'s list, its way down in `WallSystem` and its look in the client's `placeholder`.
- **A gate:** a `gate-<n>` empty in the piece (Blender), facing so the leaves swing into the side players come from.
