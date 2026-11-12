# Items, weapons and combat

What players carry (equipment, backpack and quick-use slots, weight), weapons, defense, ammo and healing, items lying in the map, loot crates, and fighting back. What crates hold is in [economy.md](economy.md#loot).

## Files

| File                                | What                                                                 |
| ----------------------------------- | -------------------------------------------------------------------- |
| `src/lib/content/items.ts`          | Item definitions (data), `SLOTS`, `DEFAULT_STACK`                    |
| `src/lib/content/carry.ts`          | Backpacks (slots) and `CARRY` (weight limits, slowdown)              |
| `src/lib/content/loadout.ts`        | How many bricks lie around                                           |
| `src/lib/shared/items/inventory.ts` | Inventory rules: slots, stacking, moving, equipping, weight          |
| `src/lib/ui/InventoryScreen.svelte` | The pack screen                                                      |
| `src/lib/ui/LoadoutPanel.svelte`    | An inventory drawn as slots (pack screen and Loadout page)           |
| `src/lib/ui/QuickWheel.svelte`      | The quick-use wheel; `wheel.ts` decides which slot is chosen         |
| `src/lib/shared/items/weapons.ts`   | `stepWeapon` (part of the player simulation), aim ray, pellet spread |
| `src/lib/shared/items/pickup.ts`    | Which floor item you're looking at (shared by server and client)     |
| `src/lib/shared/items/types.ts`     | `WorldItemSnapshot`, `ProjectileSnapshot`, `GameEvent`               |
| `server/combat.ts`                  | Resolves shots, swings, throws and drops; damage and noise           |
| `server/items.ts`                   | `WorldItems`: bricks scattered, pickups, drops, death drops, throws  |
| `server/crates.ts`                  | `Crates`: what each loot crate holds, revealing it, who has it open  |
| `src/lib/shared/map/crates.ts`      | `placeCrates`: which crate markers of a map have a crate             |
| `src/lib/game/items/Crates.ts`      | Crate models, their lids, highlight of the one you'd open            |
| `src/lib/ui/CrateScreen.svelte`     | The loot screen                                                      |
| `scripts/blender/props.py`          | Builds the crate model and adds crate markers in the kit .blend      |
| `src/lib/game/items/ViewModel.ts`   | The held item: procedural motion, own render pass                    |
| `src/lib/game/items/WorldItems.ts`  | Floor and thrown items, highlight of what you'd pick up              |
| `src/lib/game/items/Effects.ts`     | Muzzle flash light, impact puffs                                     |
| `scripts/blender/items.py`          | Builds the item models in the kit .blend                             |

## Data

An `ItemDef` has a `kind`, a `category` and the specs that apply to it:

- `category`: `weapon`, `defense`, `quick` or `other`. It decides which slots take the item (see Inventory) and which stash filter lists it.
- `maxStack`: how many share a slot. Weapons and defense are 1; most other things use `DEFAULT_STACK` (5); ammo has its own (30 rounds, 20 shells). An item with its own state (rounds loaded, wear) must be 1, so two never merge. 0 means it can't be carried at all (clues).
- `flavor`: a line or two for the tooltip. `image`: optional picture id in `static/assets/images` (built by `pnpm asset:images`); without one, slots and the tooltip show the name.
- `melee`: `damage`, `range` (from the eye), `arc` (half-angle), `windup` (hit lands), `recovery`, `noise` (radius when it hits something), optional `breaksAfter` (bricks).
- `firearm`: `damage` per pellet, `pellets`, `spread` (hip and aimed cone), `range` and `falloff` (fraction of damage lost by the end of the range), `interval`, `magazine`, `reloadTime`, `ammo` (item id of its rounds), `noise`, `sound`.
- `throwable`: `speed`, `damage`, `landNoise`, `duration`.
- `heal`: `amount` of sanity and `seconds` to apply (bandages).
- `revive: true`: brings a downed player round (smelling salts).
- `defense`: `reduction`, the fraction taken off a creature's attack while it is worn.
- `weight` is kg for one of it.

`hold` places the model in the viewmodel. `model` points at `static/assets/items/<id>.glb`. With `null`, the item is drawn as a box on the floor: `placeholder` gives its size and colour (a grey box without one).

The first defense item, the `coat`, is a stand-in so the slot has something to hold.

## Inventory

`PlayerState.inventory` is an `Inventory`. An explorer's loadout on the surface is the same type (see [economy.md](economy.md)). Every place is a slot holding one `ItemStack` (`item`, `count`, `loaded` for guns, `uses` for breakables) or null:

- `equipment`: `primary` and `secondary` (only `weapon` items) and `defense` (only `defense` items);
- `backpack`: anything; as many slots as the pack has (`BACKPACKS[inventory.pack].slots`, 16);
- `quick`: `SLOTS.quick` (6) slots, only `quick` items: what the wheel offers;
- `selected`: what is in the hand. `HAND.primary` (0), `HAND.secondary` (1), or `HAND.quick + i` for quick-use slot `i`;
- `pack`: key into `BACKPACKS`.

A slot is named by a `SlotRef`: `{ area: 'backpack' | 'quick' | 'stash', index }` or `{ area: 'equipment', slot }`. The stash only exists on the surface.

The rules are all in `src/lib/shared/items/inventory.ts`, and work on `Belongings` (`{ inventory, stash? }`), so the game server and the site run the same code:

- `accepts(ref, item)`: whether a slot takes an item (the category rule).
- `moveStack(b, from, to, count?)`: into an empty slot (`count` moves part of a stack), onto a stack of the same item as far as `maxStack` allows, or swapping with what is there when each end accepts the other.
- `quickMove(b, from)`: shift-click. With a stash: stash to loadout (where it belongs, else the backpack) and loadout to stash. Without one: backpack to its equipment or quick-use slot and back.
- `equip(b, from)`: from the stash or backpack into the slot it belongs in.
- `splitStack(b, from, count)`: part of a stack into the first empty slot beside it.
- `takeStack(b, from, count)`: out of a slot (dropping, selling).
- `addItem(inv, stack)`: pickups and gifts. Onto stacks of the same item, then the slot it belongs in (an empty weapon slot, the defense slot, a quick-use slot), then the backpack. Returns what didn't fit.
- `addToSlots(slots, stack)`: the same for a plain list of slots (the stash).
- `applyAction(b, action)`: runs an `InventoryAction` (`move`, `quick`, `equip`, `split`, `drop`). `sanitizeAction` checks one from the network.
- `held`, `spendHeld` (one thrown or used up; a quick-use slot that empties sends the hand back to the primary weapon), `quickWith` and `spendQuick` (salts), `removeItem`, `carriedCount`, `allStacks`, `defenseReduction`.

**Weight** is the one limit besides slots. Everything carried counts (`carriedWeight`). Up to `CARRY.comfortable` kg there is no effect. From there to `CARRY.max` the ground speed falls evenly to `CARRY.slowest` (`speedFactor`, applied in `stepPlayer`, so it is predicted). Nothing can be picked up, or taken from the stash, past `CARRY.max` (`heavy`). `canTake` says whether one more would fit, or why not (`heavy`, `full`); the client uses it for the pick-up prompt.

### The pack screen

The `inventory` action opens `InventoryScreen`: a `LoadoutPanel` (EQUIPMENT, BACKPACK, QUICK USE), with the weight carried beside the title, with the slot in the hand outlined. It doesn't pause anything, and it closes if you go down. Slots are `ItemSlot`s on an `ItemBoard` (see [systems.md](systems.md#item-slots)): drag onto another slot, shift-click, or right-click for Equip / Unequip, Split and Drop. Each sends an `inventory` message carrying an `InventoryAction`.

The server checks the request (`sanitizeAction`, which refuses stash slots), applies it in `Session.inventory` with `applyAction`, and refuses it while downed. A `drop` lands on the floor in front of you. If what's in the hand changed, the held item's action is cancelled and the new one comes up (`reequip`). These changes are not predicted: the client sees them in the next snapshot.

Handing something to another player is dropping it for them to pick up.

A player goes down with their explorer's loadout, chosen on the surface (see [economy.md](economy.md)); a new explorer has nothing. `emptyInventory()` is carrying nothing.

### The quick-use wheel

Holding `quickUse` opens `QuickWheel` over the game: the six quick-use slots around a circle. While it is open `LocalPlayer` sends mouse movement to the wheel's pointer instead of the view (`openWheel`, `wheelPointer`, `closeWheel`) and holds back attack and aim. `wheelChoice` (`src/lib/ui/wheel.ts`) picks the filled slot nearest the pointer's direction, outside a dead zone at the centre. Letting go calls `LocalPlayer.take(HAND.quick + index)`, which goes out as the next frame's `select`. The wheel doesn't open with nothing in the quick-use slots.

## Using items (`stepWeapon`)

The held item is advanced by `stepWeapon`, called from `stepPlayer`, so it is predicted exactly like movement. `PlayerState.weapon` holds:

- the current `action`: `equip`, `swing`, `shot`, `reload` or `throw`;
- its `time`;
- `aiming`;
- a `shots` counter;
- the previous frame's buttons, for press edges.

`InputFrame` fields: `attack`, `aim`, `reload`, `drop` and `select` (what to take in the hand, as `Inventory.selected`, for one frame; otherwise -1).

The rules:

- **Firearms** fire once per press. An empty press clicks and starts a reload if you have rounds. Reload is a press, and takes rounds from wherever they are carried (the backpack). Aiming (hold) caps speed at `aimSpeed` and tightens the spread.
- **Melee** swings repeat while attack is held. The hit is decided at `windup`.
- **Throwables:** aim is the throw (press). One leaves the hand partway through the motion (`spendHeld`).
- **Healing items** (`heal`): holding attack with one in the hand, standing still and hurt, counts `bandaging` up; at `heal.seconds` one is used for `heal.amount`. This is in `stepPlayer` (`updateBandage`), not `stepWeapon`. Moving, letting go or taking something else in the hand resets it.
- **Drop** puts the held stack down in front of you.
- **Switching** works any time except while downed, and takes `EQUIP_TIME`. The primary and secondary weapons have their own keys; quick-use items come from the wheel.
- **Not while:** swimming, mantling, crawling, bandaging, reviving or downed. An action in progress is cancelled.

What happened is reported as `SimEvent`s (`shot`, `swing`, `throw`, `drop`, `reloaded`, `empty`):

- **On the server,** `server/combat.ts` resolves them.
- **On the client,** `LocalPlayer.drainEvents()` gives instant feedback (gunshot, flash, click). Replayed frames during reconciliation don't emit events.

Pellet spread comes from `pelletDirections(direction, spread, pellets, seed)`. The seed is the shot counter, so it's deterministic.

## Combat (server)

- **Shots:** each pellet is a ray from the eye. It stops at the first wall (`segmentHit`) or creature (`rayVsCapsule` against `CreatureDirector.hitBodies()`). Damage per creature is summed per shot, so a shotgun blast staggers as one hit. Damage loses `falloff` linearly to the end of `range`, and keeps going at that level to 1.5× range. Gunfire calls `creatures.hear(origin, noise, shooter)`.
- **Swings:** the nearest creature whose body is within `range` and inside the `arc` (widened by the body's angular size up close), with line of sight. A hit, or striking a wall, makes `noise`. Swinging at air is silent. Breakable items wear on every hit and break at `breaksAfter`.
- **Defense:** a creature's attack on a player is reduced by `defenseReduction(inventory)`: the `defense.reduction` of what is in the defense slot. Darkness, seeing things and the manifestation are not reduced.
- **Throws:** `WorldItems.launch` simulates a projectile with gravity in sim-rate steps. It hits a creature (damage, then it drops there) or lands on the world and becomes a floor item. Landing calls `hear` with no source, so creatures go and search the spot: a lure.
- **No friendly fire:** shots and swings only test creatures.
- **The manifestation** is a target too while it's out (`targets()` adds it, `hurt()` routes id `manifestation` to the Affliction). Hits only damage it while light exposes it; otherwise they slow it. See [affliction.md](affliction.md).

Creatures (see [creatures.md](creatures.md)):

- **Health:** they have `health`.
- **Stagger:** a hit of at least `stagger.threshold` staggers them for `stagger.seconds` and cancels an attack that hasn't landed.
- **Retaliation:** any hit turns them on the attacker.
- **Death:** at zero they die. They play `die`, are removed after `corpseTime`, and count toward `kills` (for the Affliction meter).

## World items (`server/items.ts`)

- **Scatter:** bricks are seeded from the map seed, about `BRICKS_PER_CELL` per occupied cell. They go on standing nav points by walls (few neighbours), at least 3 m apart, 6 m from the start, never in water.
- **Pick up:** pressing interact picks up the item `lookedAtItem` picks: within `PICKUP.range` of the eye, within `PICKUP.angle` of the look direction (or right at your feet), and not behind a wall. It goes where `addItem` puts it. The client highlights the same item and prompts "Press E to pick up …".
- **Death:** when a player dies, everything they carried is dropped around where they fell.

Each `tick` carries `items`, `projectiles` and `events` (`GameEvent`): shots with their end point, swing results, throws, landings, breaks, reloads, dry clicks, pickups, drops, creature hits and deaths. Clients play sounds and effects for other players from these, and impacts and hits for everyone. Your own gunshot, swing and reload sounds come from prediction instead.

## Quest items

An item with `quest: true` is one of a kind and needed for a rite: the Pendant. It is not a rarity and not in the loot tables. In the interface (`src/lib/ui/items.ts`):

- its slot has a purple left and bottom edge in place of a rarity's (`--quest` in `src/app.css`; `Slot`'s `quest` prop) and a purple star in the bottom-left corner (`slotMark`, `FILTER_ICONS.quest`);
- it is listed under the Quest items filter (`ItemFilters`, `matchesFilter`), not under Other;
- its tooltip says "Unique" in purple where the rarity goes, and "Quest item" for its category.

Where one is found is the rite's to say (`crate` on the requirement, see [rite.md](rite.md#in-the-map)). To add one, set `quest: true` on its `ItemDef`.

## Loot crates

Most loot is in crates (`CRATES` in `src/lib/content/loot.ts`). A crate has 8 slots.

**Where they stand.** Pieces carry `crate-<n>` markers: places a crate may stand, with its back to a wall (see [asset-pipeline.md](asset-pipeline.md)). A marker is only a possibility. `placeCrates(layout, PIECES, seed)` fills each with probability `CRATES.fill`, none within `CRATES.minDistance` of the start, seeded by the map seed. The server calls it once the layout is generated and stores the result in `layout.crates` (`id`, `position`, `yaw`), which goes to clients with the layout.

**The dev crate.** The start room (`stairwell`) has a crate marker too. It is left empty for players; with the server in dev mode (`DEV_MODE=true`) it always has a crate, a few steps ahead of the spawn on the left, filled as if it were the deepest in the map. "Reset crates" in the admin panel fills it again.

**Solid.** `buildCollisionWorld` adds a box of `CRATES.size` for each entry of `layout.crates`. Server and client both build the world from the layout, so movement prediction, line of sight and the nav grid all take crates into account. The box is a little higher than the model (0.55 m), above the nav grid's step height, so nothing treats a lid as a floor.

**What is in them.** `Crates` (`server/crates.ts`) rolls each crate with `rollCrate` at its depth (see [economy.md](economy.md#tables)). Every slot that holds something starts **hidden**.

**Opening.** Holding interact for `CRATES.openSeconds` (1 s) on the crate `lookedAtCrate` picks opens it: within `PICKUP.range` of the eye, within `CRATE_REACH.angle` of the look direction, nothing but the crate in the way. A floor item being looked at comes first (interact picks that up). `PlayerState.opening` counts the seconds (server-driven, like `performing`), and resets if any of that stops. The client shows "Hold E to open the crate" with the same rule.

- **One at a time:** a crate someone has open can't be opened by anyone else ("Someone is going through it").
- **The lid:** the first time a crate is opened its lid goes up and stays up, for everyone (`crateOpen` event; `tick.crates.open`). Creatures within `CRATES.noise` hear it and come to look.
- **It shuts** when the player closes the screen (`closeCrate`), moves more than `CRATE_REACH.leave` from it, goes down, dies, leaves or loses their connection.

**Revealing.** While someone has a crate open, `Crates.step` reveals its hidden slots one at a time, lowest first, `CRATES.revealSeconds` (1 s) each. Each slot starting raises a `rummage` event (the rummage sound, for everyone near). Closing the crate part-way through a slot loses that slot's progress; slots already revealed stay revealed, for whoever opens it next. The contents were laid out commonest first, so the best comes last.

**What the player is told.** Hidden contents never leave the server. While a crate is open its user gets a `crate` message each tick: `slots` as `CrateSlot`s (a stack, `null`, or `'hidden'`) and `reveal`, how far along (0..1) the first hidden slot is. `{ id: null }` means it has shut.

**Moving things.** The crate's slots stand where the stash does on the surface: `Session.inventory` runs the request with `applyAction({ inventory, stash: crate.slots, sealed: crate.hidden }, action)`, so every rule of the pack screen works both ways (drag, swap, shift-click, split, equip, drop, the weight limit on taking). `Belongings.sealed` are stash slots that don't exist as far as the rules go: hidden slots can't be taken from, swapped with or stacked onto. With no crate open, requests naming stash slots are refused as before.

**The loot screen** (`CrateScreen`): most of the window, the crate's 8 slots (4 across) beside a `LoadoutPanel`, on one `ItemBoard`. A hidden slot is a dashed box; the one being revealed shows a progress bar and nothing else. Opening it releases the pointer. The Close button, the pack and menu keys, or any movement key (`moveForward`, `moveBack`, `moveLeft`, `moveRight`, `climb`, `stance`) shut it and take the pointer back.

**Tuning:** `CRATES` (slots, seconds, fill, size, noise). To add crate places, add `crate-<n>` markers to pieces.

## Client

- **ViewModel:** drawn in the engine's second pass (`viewScene`/`viewCamera`, depth cleared), so it never clips into walls.
  - Its motion is procedural, from the predicted `weapon` state: walk bob, equip raise, swing (draw back, strike, settle), recoil, reload dip, throw, and aiming (moves to centre).
  - It's lit by a fill light that follows your headlamp output, so in the dark you can barely see it.
- **Effects:** one reused point light for muzzle flashes (it's never added or removed, so the light count stays constant and it only uses budget while lit), plus impact puffs.
- **HUD:** what is in the hand (name and count; the "Held item" setting hides it), the ammo counter (loaded | spare in the backpack) and a tighter crosshair while aiming.

## Adding an item

1. Add a builder to `scripts/blender/items.py` (origin at the grip, forward +Y, up +Z) and list it in `ITEMS`. Run `items.build_all()` and `items.export_all()` in Blender, then `pnpm asset:build`.
2. Add an `ItemDef` to `ITEMS` in `src/lib/content/items.ts`, with its `category`, `maxStack`, `flavor`, `weight` and specs. For a picture, put a PNG, JPEG or WebP in `art/images`, run `pnpm asset:images` and set `image`.
3. New behaviour (an item kind that does something new) goes in `stepWeapon` (timing, events) and `server/combat.ts` (what it does). Keep it keyed by def fields, not item ids.

## Admin

These need `DEV_MODE`:

- **Give** any item with a count (firearms come loaded); it goes where `addItem` puts it;
- **Refill ammo** (fills the guns in the weapon slots and adds spare rounds);
- **Reset crates** (`resetCrates`): shuts every loot crate and fills it again, hidden, with a new roll (a quest item still in a crate stays in it);
- **Infinite ammo**;
- **Kill all** creatures.
