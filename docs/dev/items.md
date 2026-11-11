# Items, weapons and combat

What players carry (quick slots, pack, pockets, weight), weapons, ammo and healing, items lying in the map, and fighting back. Loot and containers come later.

## Files

| File                                | What                                                                 |
| ----------------------------------- | -------------------------------------------------------------------- |
| `src/lib/content/items.ts`          | Item definitions (data): melee, firearm, throwable, ammo, consumable |
| `src/lib/content/carry.ts`          | Backpacks (capacity) and `CARRY` (weight limits, slowdown)           |
| `src/lib/content/loadout.ts`        | Starting kit (until the hub) and how many bricks lie around          |
| `src/lib/shared/items/inventory.ts` | Inventory rules: add, move, take, weight, bulk, what fits            |
| `src/lib/ui/InventoryScreen.svelte` | The pack screen                                                      |
| `src/lib/shared/items/weapons.ts`   | `stepWeapon` (part of the player simulation), aim ray, pellet spread |
| `src/lib/shared/items/pickup.ts`    | Which floor item you're looking at (shared by server and client)     |
| `src/lib/shared/items/types.ts`     | `WorldItemSnapshot`, `ProjectileSnapshot`, `GameEvent`               |
| `server/combat.ts`                  | Resolves shots, swings, throws and drops; damage and noise           |
| `server/items.ts`                   | `WorldItems`: bricks scattered, pickups, drops, death drops, throws  |
| `src/lib/game/items/ViewModel.ts`   | The held item: procedural motion, own render pass                    |
| `src/lib/game/items/WorldItems.ts`  | Floor and thrown items, highlight of what you'd pick up              |
| `src/lib/game/items/Effects.ts`     | Muzzle flash light, impact puffs                                     |
| `scripts/blender/items.py`          | Builds the item models in the kit .blend                             |

## Data

An `ItemDef` has a `kind` and the specs that apply to it:

- `melee`: `damage`, `range` (from the eye), `arc` (half-angle), `windup` (hit lands), `recovery`, `noise` (radius when it hits something), optional `breaksAfter` (bricks).
- `firearm`: `damage` per pellet, `pellets`, `spread` (hip and aimed cone), `range` and `falloff` (fraction of damage lost by the end of the range), `interval`, `magazine`, `reloadTime`, `ammo` (pocket item id), `noise`, `sound`.
- `throwable`: `speed`, `damage`, `landNoise`, `duration`.
- `pocket: true` items (ammo, bandages, salts) are counted, not held. Everything else takes a quick slot or goes in the pack.
- `weight` is kg for one of it. `bulk` is the room one takes in the pack (pocket items use 0).

`hold` places the model in the viewmodel. `model` points at `static/assets/items/<id>.glb`; `null` draws a grey placeholder.

## Inventory

`PlayerState.inventory` holds:

- `hotbar`: the 5 quick slots, each an `ItemStack` (`item`, `count`, `loaded` for guns, `uses` for breakables) or null;
- `selected`: the quick slot in hand;
- `pack`: a list of `ItemStack`, everything else carried;
- `backpack`: key into `BACKPACKS`, which gives the pack's `capacity`;
- `pockets`: a map from item id to count.

Two limits, both in `src/lib/shared/items/inventory.ts`:

- **Bulk:** the `bulk` of everything in the pack can't exceed the backpack's `capacity` (`packBulk`, `packCapacity`). Quick slots and pockets don't use bulk.
- **Weight:** everything carried counts (`carriedWeight`). Up to `CARRY.comfortable` kg there is no effect. From there to `CARRY.max` the ground speed falls evenly to `CARRY.slowest` (`speedFactor`, applied in `stepPlayer`, so it is predicted). Nothing can be picked up past `CARRY.max`.

`addItem` fills an empty quick slot first (the selected one, then the others), then the pack. `canTake` says whether one more would fit, or why not (`heavy`, `full`); the client uses it for the pick-up prompt.

### The pack screen

The `inventory` action opens `InventoryScreen`. It doesn't pause anything, and it closes if you go down. It sends `inventory` messages carrying an `InventoryAction`:

- `move`: quick slot to pack, pack to quick slot (swapping with what was in the slot, if the swap fits), or quick slot to quick slot (swap).
- `drop`: `count` from a quick slot, the pack or a pocket, onto the floor in front of you.

The server checks the request (`sanitizeAction`), applies it in `Session.inventory` with `moveItem` and `takeStack`, and refuses it while downed. If what's in the hand changed, the held item's action is cancelled and the new one comes up (`reequip`). These changes are not predicted: the client sees them in the next snapshot.

Handing something to another player is dropping it for them to pick up.

`startingInventory()` builds it from `STARTING_LOADOUT` (knife and revolver loaded with 6, 2 bandages, 1 salts).

Bandages and smelling salts are pocket items. The bandage rule in `stepPlayer` and the revive rules in `server/session.ts` spend them with `takePocket`.

## Using items (`stepWeapon`)

The held item is advanced by `stepWeapon`, called from `stepPlayer`, so it is predicted exactly like movement. `PlayerState.weapon` holds:

- the current `action`: `equip`, `swing`, `shot`, `reload` or `throw`;
- its `time`;
- `aiming`;
- a `shots` counter;
- the previous frame's buttons, for press edges.

New `InputFrame` fields: `attack`, `aim`, `reload`, `drop` and `select` (a slot index for one frame, otherwise -1).

The rules:

- **Firearms** fire once per press. An empty press clicks and starts a reload if you have rounds. Reload is a press. Aiming (hold) caps speed at `aimSpeed` and tightens the spread.
- **Melee** swings repeat while attack is held. The hit is decided at `windup`.
- **Throwables:** aim is the throw (press). The item leaves the hotbar partway through the motion.
- **Drop** puts the held item down in front of you.
- **Switching** works any time except while downed, and takes `EQUIP_TIME`.
- **Not while:** swimming, mantling, crawling, bandaging, reviving or downed. An action in progress is cancelled.

What happened is reported as `SimEvent`s (`shot`, `swing`, `throw`, `drop`, `reloaded`, `empty`):

- **On the server,** `server/combat.ts` resolves them.
- **On the client,** `LocalPlayer.drainEvents()` gives instant feedback (gunshot, flash, click). Replayed frames during reconciliation don't emit events.

Pellet spread comes from `pelletDirections(direction, spread, pellets, seed)`. The seed is the shot counter, so it's deterministic.

## Combat (server)

- **Shots:** each pellet is a ray from the eye. It stops at the first wall (`segmentHit`) or creature (`rayVsCapsule` against `CreatureDirector.hitBodies()`). Damage per creature is summed per shot, so a shotgun blast staggers as one hit. Damage loses `falloff` linearly to the end of `range`, and keeps going at that level to 1.5× range. Gunfire calls `creatures.hear(origin, noise, shooter)`.
- **Swings:** the nearest creature whose body is within `range` and inside the `arc` (widened by the body's angular size up close), with line of sight. A hit, or striking a wall, makes `noise`. Swinging at air is silent. Breakable items wear on every hit and break at `breaksAfter`.
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
- **Pick up:** pressing interact picks up the item `lookedAtItem` picks: within `PICKUP.range` of the eye, within `PICKUP.angle` of the look direction (or right at your feet), and not behind a wall. Held items take an empty slot (the selected one first); pocket items stack to their limit. The client highlights the same item and prompts "Press E to pick up …".
- **Death:** when a player dies, everything they carried (quick slots, pack and pockets) is dropped around where they fell.

Each `tick` carries `items`, `projectiles` and `events` (`GameEvent`): shots with their end point, swing results, throws, landings, breaks, reloads, dry clicks, pickups, drops, creature hits and deaths. Clients play sounds and effects for other players from these, and impacts and hits for everyone. Your own gunshot, swing and reload sounds come from prediction instead.

## Client

- **ViewModel:** drawn in the engine's second pass (`viewScene`/`viewCamera`, depth cleared), so it never clips into walls.
  - Its motion is procedural, from the predicted `weapon` state: walk bob, equip raise, swing (draw back, strike, settle), recoil, reload dip, throw, and aiming (moves to centre).
  - It's lit by a fill light that follows your headlamp output, so in the dark you can barely see it.
- **Effects:** one reused point light for muzzle flashes (it's never added or removed, so the light count stays constant and it only uses budget while lit), plus impact puffs.
- **HUD:** a 5-slot hotbar (item names, slot keys), the ammo counter (loaded | spare), a tighter crosshair while aiming, and bandage and salt counts.

## Adding an item

1. Add a builder to `scripts/blender/items.py` (origin at the grip, forward +Y, up +Z) and list it in `ITEMS`. Run `items.build_all()` and `items.export_all()` in Blender, then `pnpm asset:build`.
2. Add an `ItemDef` to `ITEMS` in `src/lib/content/items.ts`, with its specs, `weight` and `bulk`.
3. New behaviour (an item kind that does something new) goes in `stepWeapon` (timing, events) and `server/combat.ts` (what it does). Keep it keyed by def fields, not item ids.

## Admin

These need `DEV_MODE`:

- **Give** any item with a count (firearms come loaded);
- **Refill ammo** (fills guns and adds spare rounds);
- **Infinite ammo**;
- **Kill all** creatures.
