# Chalk marks

Explorers draw marks on walls, floors and ceilings with chalk, to find their way and to tell each other things. A mark lasts the whole expedition, everyone in it sees it, and only whoever drew it can rub it out. Marks are lit only by lamps, so they cost nothing against the light budget and can't be seen in the dark.

## Files

| File                                | What                                                                |
| ----------------------------------- | ------------------------------------------------------------------- |
| `src/lib/content/marks.ts`          | `MARK_SYMBOLS`, `DEFAULT_MARK_WHEEL`, `markWheel()`, `MARKS` tuning |
| `src/lib/content/items.ts`          | `ChalkSpec` (`chalk: { marks }` on an item)                         |
| `src/lib/shared/items/inventory.ts` | `wearChalk`: a mark drawn wears the stick in the hand               |
| `src/lib/shared/items/pickup.ts`    | `lookedAtMark` (which mark interact erases), `markInSight`          |
| `src/lib/shared/items/types.ts`     | `MarkSnapshot`, the `mark` and `rub` events                         |
| `server/marks.ts`                   | `Marks`: the expedition's marks; `check` validates a new one        |
| `server/session.ts`                 | `mark()` (drawing), `stepMarks()` (erasing)                         |
| `src/lib/game/items/Marks.ts`       | Decals on the stone, the chalk textures, the nearest mark           |
| `src/lib/ui/MarkWheel.svelte`       | The chalk wheel                                                     |
| `src/lib/ui/MarkLabel.svelte`       | Who drew the mark you are close to                                  |

## Symbols

A symbol is like an emote: an entry in `MARK_SYMBOLS` with an `id`, a `name` (shown on the wheel) and `strokes`, polylines in a unit square (x right, y down). The same strokes draw the wheel (SVG) and the mark (a canvas texture), so a symbol needs no art.

The wheel holds eight, top first and clockwise. Today everyone has `DEFAULT_MARK_WHEEL`: the four arrows where they point, Danger (!), Unknown (?), Been here (circle) and Dead end (cross).

**Equipping symbols (later).** The wheel and the server only ever ask `markWheel()` which symbols a player has. When explorers can choose theirs, it takes the explorer and returns their choice (kept with the explorer on the surface, sent down with the loadout); nothing else changes. The server refuses a symbol that isn't on the player's wheel.

To add a symbol: add it to `MARK_SYMBOLS`. To put it on everyone's wheel, swap it into `DEFAULT_MARK_WHEEL` (keep eight).

## Chalk

An item with `chalk: { marks }` draws. The basic chalk has `marks: 1`: each mark uses up a stick (`wearChalk` calls `spendHeld`, and an emptied quick-use slot sends the hand back to the primary weapon). A chalk with more marks keeps count in `ItemStack.uses` (set to 0 by `newStack`) and spends the stick when it reaches `marks`; when two stacks merge, the target's count is kept.

## Drawing

1. With chalk in the hand, the client raycasts from the eye (`aimRay`) into the visible map (`MapRenderer.root`, `MARKS.reach`). While it hits, the prompt says "Hold … to draw a mark".
2. Holding attack opens the chalk wheel. It uses `LocalPlayer.openWheel`, so the mouse moves its pointer and attack and aim are held back from the simulation. Chalk has no melee or firearm spec, so the attack frames before it opens do nothing. The quick-use wheel and the chalk wheel never open together.
3. Letting go over a symbol raycasts again and sends `{ type: 'mark', symbol, position, normal }` (world space, the normal turned toward the player). Drawing isn't predicted: the mark appears when the server's list comes back.
4. The server (`Session.mark`, `Marks.check`) refuses unless the player holds chalk and can use their hands (not downed, swimming, climbing, bandaging, reviving, or in a crate). The symbol must be on their wheel, the point within reach and facing them, and no mark within `MARKS.minSpacing`. The visible stone can sit off the collision boxes, so a collider has to be there: the segment from the eye on past the point must hit one, no nearer than `MARKS.tolerance` short of it. That also means nothing stands in the way.
5. It works out `up`. On a wall that is world up laid onto the surface; on a floor or ceiling it is the way the player faced, so a floor arrow points where they looked. Then it stores the mark with the drawer's id and gamer tag, wears the chalk, raises a `mark` event (the scratch, heard by everyone near) and calls `creatures.hear` with `MARKS.noise`. Finally it broadcasts the whole list.

Past `MARKS.max` marks in one expedition, the oldest goes.

## The list on the client

The server sends `{ type: 'marks', marks }`, the whole list, whenever it changes. A player also gets it straight after `welcome`, including on a reconnect, and an empty list after an admin regenerate. Marks change rarely, so they cost nothing per tick. `connection.marks` keeps the latest list, because the expedition can start while the dashboard is still showing; `/play` applies it with the welcome.

## Rendering

`Marks` (`src/lib/game/items/Marks.ts`) diffs the list by id. For each new mark it casts a ray from just off the surface back along the normal into the map, and builds a `DecalGeometry` on the mesh it hits, oriented by `normal` and `up` and sized `MARKS.size`. The decal is 0.6 m deep, so it wraps over bumpy stone. The map loads asynchronously, so marks wait until it is there. A mark with no stone found after a few seconds is drawn as a flat square instead. At most a few are placed per frame.

Each symbol has one material: a `MeshStandardMaterial` in chalk white whose texture is drawn on a canvas. The strokes go down in three slightly shaky passes, then grain breaks up the alpha the way chalk skips over pits. The drawing is seeded by the symbol, so it looks the same for everyone. The material is transparent, doesn't write depth, and has a polygon offset so it never fights the wall. It is lit like the stone, so it only shows in lamplight.

## Who drew it, and erasing

- **Label:** `Marks.nearest` is the closest mark within `MARKS.labelRange` that is in front of you, faces you and is in sight (`markInSight`). The play page projects it to the screen and shows `MarkLabel` under it, with the drawer's name or "You". Only one shows at a time.
- **Erasing:** only your own marks. `lookedAtMark` (shared, `MARKS.eraseAngle`, only marks `by` you) picks the one interact would erase; floor items and crates come first. Holding interact on it counts `PlayerState.erasing` up on the server (`stepMarks`, like `opening` for crates). At `MARKS.eraseSeconds` the mark is removed, with a `rub` event and a new list. The client shows "Hold … to erase your mark" with the same rule and the progress.

## Tuning

`MARKS` in `src/lib/content/marks.ts`: `reach`, `size`, `tolerance`, `minSpacing`, `max`, `labelRange`, `eraseSeconds`, `eraseAngle`, `noise`. Sounds: `chalk.draw` and `chalk.rub` in `src/lib/content/audio/sounds.ts` (synth placeholders for now).

## Admin

"Clear chalk marks" in the admin panel's Items group (`clearMarks`, dev mode only) rubs out every mark.
