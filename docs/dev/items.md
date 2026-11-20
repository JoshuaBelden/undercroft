# Items, weapons and combat

What players carry (equipment, backpack and quick-use slots, weight), weapons, defense, ammo and healing, items lying in the map, loot crates, and fighting back. What crates hold is in [economy.md](economy.md#loot).

## Files

| File                                 | What                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `src/lib/content/items.ts`           | Item definitions (data), `SLOTS`, `DEFAULT_STACK`                          |
| `src/lib/content/carry.ts`           | Backpacks (slots) and `CARRY` (weight limits, slowdown)                    |
| `src/lib/content/loadout.ts`         | How many bricks lie around                                                 |
| `src/lib/shared/items/inventory.ts`  | Inventory rules: slots, stacking, moving, equipping, weight                |
| `src/lib/shared/items/durability.ts` | Wear: how long a thing lasts, its condition, broken or not                 |
| `src/lib/ui/ItemInspect.svelte`      | The Inspect panel: every figure about one stack                            |
| `src/lib/ui/GameMenu.svelte`         | The in-game menu underground: the Pack and Rite tabs                       |
| `src/lib/ui/PackPanel.svelte`        | The Pack tab (the pack screen)                                             |
| `src/lib/ui/LoadoutPanel.svelte`     | An inventory drawn as slots (Pack tab and Loadout page)                    |
| `src/lib/ui/QuickWheel.svelte`       | The quick-use wheel; `wheel.ts` decides which slot is chosen               |
| `src/lib/shared/items/weapons.ts`    | `stepWeapon` (part of the player simulation), aim ray, pellet spread       |
| `src/lib/shared/items/pickup.ts`     | Which floor item you're looking at (shared by server and client)           |
| `src/lib/shared/items/types.ts`      | `WorldItemSnapshot`, `ProjectileSnapshot`, `GameEvent`                     |
| `server/combat.ts`                   | Resolves shots, swings and throws; damage and noise                        |
| `src/lib/shared/player/tend.ts`      | Using the item in the hand on a teammate: who is looked at, what they need |
| `server/systems/tend.ts`             | Gives the teammate what was used on them (or the item back)                |
| `src/lib/game/play/tend.ts`          | Teammates for prediction, the prompts, the bandage sound                   |
| `server/items.ts`                    | `WorldItems`: bricks scattered, pickups, drops, death drops, throws        |
| `server/crates.ts`                   | `Crates`: what each loot crate holds, revealing it, who has it open        |
| `src/lib/shared/map/crates.ts`       | `placeCrates`: which crate markers of a map have a crate                   |
| `src/lib/game/items/Crates.ts`       | Crate models, their lids, highlight of the one you'd open                  |
| `src/lib/ui/CrateScreen.svelte`      | The loot screen                                                            |
| `scripts/blender/props.py`           | Builds the crate model and adds crate markers in the kit .blend            |
| `src/lib/game/items/ViewModel.ts`    | The held item: procedural motion, own render pass                          |
| `src/lib/game/items/WorldItems.ts`   | Floor and thrown items, highlight of what you'd pick up                    |
| `src/lib/game/items/Effects.ts`      | Muzzle flares, gun fire and smoke, impact dust and sparks, own-shot pulse  |
| `src/lib/game/items/flare.ts`        | The muzzle flare shader (also impact sparks)                               |
| `scripts/blender/items.py`           | Builds the item models in the kit .blend                                   |

## Data

An `ItemDef` has a `kind`, a `category` and the specs that apply to it:

- `category`: `weapon`, `defense`, `quick`, `gear`, `material` or `other`. It decides which slots take the item (see Inventory) and which stash filter lists it. **Gear** is worn, not used: it works while it is in one of the three gear slots (`workingGear` lists what is, broken gear left out). **Materials** are ordinary inventory items that stack and go in the backpack and the stash, never in a quick-use or equipment slot.
- `price`: what one is worth new, in coin. The store sells at it, and selling back (and repairs) are worked out from it, for things the store sells and things it doesn't alike (see [economy.md](economy.md#money-and-the-shop)). Treasure has a `value` instead.
- `durability`: the most wear it takes (`max`) and what that is counted in (`per`: `hit`, `shot`, `point`, `use` or `second`). See [Durability](#durability).
- `maxStack`: how many share a slot. Weapons and defense are 1; most other things use `DEFAULT_STACK` (5); ammo has its own (30 rounds, 20 shells). An item with its own state (rounds loaded, wear) must be 1, so two never merge. 0 means it can't be carried at all (clues).
- `flavor`: a line or two for the tooltip. `image`: optional picture id in `static/assets/ui/images` (built by `pnpm asset:images`); without one, slots and the tooltip show the name.
- `melee`: `damage`, `range` (from the eye), `arc` (half-angle), `windup` (hit lands), `recovery`, `noise` (radius when it hits something), optional `breaksAfter` (bricks).
- `firearm`: `damage` per pellet, `pellets`, `spread` (hip and aimed cone), `range` and `falloff` (fraction of damage lost by the end of the range), `interval`, `magazine`, `reloadTime`, `ammo` (item id of its rounds), `noise`, `sound` (the shot) and `reloadSound` (played as a reload starts; make it last about `reloadTime`, with the sound's `rate` if needed), `zoom` (the fraction of the field of view left when aimed: revolver 0.6, shotgun 0.7) and `recoil` (`RecoilSpec`: `pitch` and `yaw` throw your view, `rise`, `back` and `settle` jolt the gun in your hands).
- `throwable`: `speed`, `damage`, `landNoise`, `sound` (as it leaves the hand) and `land` (where it lands). How long attack is held to draw it back is `THROW_DRAW` (1 s) in `weapons.ts`, the same for every throwable.
- `heal`: `amount` of sanity and `seconds` to apply (bandages; the rare medkit gives back all of it, `SANITY.max`, in 5 s). `kneel: true` (the medkit) is set down on the floor to use: using it on yourself crouches you (`kneeling` in the shared step asks for crouch while `bandaging` counts, and your own wanted stance comes back after), and your body kneels over it with the kit on the floor in front (`kneel`, see [player.md](player.md#holding-and-using-items)). Used on a teammate it is applied standing, like a bandage.
- `charge`: `volts` put back into the headlamp and `seconds` to swap it in (batteries).
- `revive: true`: brings a downed player round (smelling salts).
- `rope`: `length` in metres of a new one (rope packs, 100 m, sold; rope bundles, 40 m, rare in crates). The metres left are on the stack (`ItemStack.metres`). Laid along the floor or tied at an anchor: see [rope.md](rope.md).
- `defense`: `shield`, the points of creatures' blows it takes before the wearer does. The points used are its wear (`ItemStack.worn`; its `durability` is `{ max: shield, per: 'point' }`, which a test checks), so a worn coat stays worn after extraction. When they run out it breaks and stays in the slot, taking nothing.
- `weight` is kg for one of it.

`hold` places the model in the viewmodel: `offset` from the camera and `scale`. Firearms also give `aim`, where it moves when aiming down the sights (low and a little right, so it never covers the crosshair; without one, `AIM_OFFSET` in `ViewModel.ts`), and `muzzle`, the barrel's end in the model's own space (where the flare is drawn). `model` points at `modelUrl('shared/items/<id>.glb')` (built into `static/assets/shared/items/<id>.<hash>.glb`). With `null`, the item is drawn as a box on the floor: `placeholder` gives its size and colour (a grey box without one).

`grip` is how it is held on an explorer's body (other players, and you over the shoulder; see [player.md](player.md#holding-and-using-items)): `pose` picks how the arms hold it (`oneHand`, `twoHand` or `item`, a small thing carried in front) and `offset` (m) and `rotation` (XYZ Euler, radians) place the model in the right hand bone's own frame. Every weapon and quick-use item has one (a test checks); without one an item isn't drawn in the hand. The numbers come from Blender: `GRIPS` in `scripts/blender/explorer.py` sets each item in the hand by eye (`explorer.show_item(id)`), and `explorer.grip_numbers()` prints them in the frame three.js uses. Check them in the game with the admin **Grip check** (Items tab).

The first defense item, the `coat`, is a stand-in so the slot has something to hold.

`chalk` (quick-use, with a model) and `candle` (backpack, unlit, a placeholder box) are rite supplies, sold in the store and found in crates. Chalk draws marks on walls (`chalk: { marks }`, see [marks.md](marks.md)). Candles do nothing in the hand yet: lighting them comes with light sources ([#26](https://github.com/JoshuaBelden/undercroft/issues/26)).

The `notebook` (backpack, a placeholder box) has `survey: true`: carried anywhere, it lets you open, draw in and show your map ([map.md](map.md)).

## Inventory

`PlayerState.inventory` is an `Inventory`. An explorer's loadout on the surface is the same type (see [economy.md](economy.md)). Every place is a slot holding one `ItemStack` (`item`, `count`, `loaded` for guns, `uses` for breakables) or null:

- `equipment`: `primary` and `secondary` (only `weapon` items), `defense` (only `defense` items) and the gear slot, which holds three: `gear1`, `gear2` and `gear3` (`GEAR_SLOTS`; only `gear` items). `slotCategory` says which category an equipment slot takes. A loadout saved before the gear slots existed has no gear keys: everything reads a slot through `getSlot` (or `?? null`), which takes a missing one as empty, so old saves need no migration;
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
- `held`, `spendHeld` (one thrown or used up; a quick-use slot that empties sends the hand back to the primary weapon), `quickWith` and `spendQuick` (salts), `removeItem`, `carriedCount`, `allStacks`, `shieldOf`, `absorbBlow`.

**Weight** is the one limit besides slots. Everything carried counts (`carriedWeight`). Up to `CARRY.comfortable` kg there is no effect. From there to `CARRY.max` the ground speed falls evenly to `CARRY.slowest` (`speedFactor`, applied in `stepPlayer`, so it is predicted). Nothing can be picked up, or taken from the stash, past `CARRY.max` (`heavy`). `canTake` says whether one more would fit, or why not (`heavy`, `full`); the client uses it for the pick-up prompt.

### The in-game menu

Underground, the `inventory` action (Tab or I, View on the controller) opens `GameMenu`: a **Pack** tab (`PackPanel`, below), a **Map** tab with a notebook in the pack (`MapPane`, see [map.md](map.md#the-screen); the `map` action opens the menu there) and a **Rite** tab (`RitePanel` and Abandon expedition, see [rite.md](rite.md#the-rite-tab)). The tabs are pills at the left of the header; a tab's own buttons go in the middle of it (the Map tab's `MapTools`). Click a tab, or press LB/RB with the controller (the menu's `tabs`). The same action, B or Close (a pill at the bottom right) puts it away. It doesn't pause anything: the server can't pause a co-op game.

- **It opens on the Pack tab.** It only opens while you are down there and on your feet: never while downed, or dead and spectating. Going down closes it.
- **Hands busy.** While it is open the client sends `reading: true` in its `InputFrame`s, and `handsBusy` (`src/lib/shared/player/simulate.ts`) takes away sprint, interact, attack, aim, reload and `select`: no fighting, using, picking up, climbing out, reviving, swapping or running. Walking, stance and the headlamp still work. The server applies it in `sanitizeFrame`, the client to the frames it predicts with, so they agree and a client can't keep its hands by not using them. The movement keys walk (`LocalPlayer.update`'s `reading`); the controller's left stick stays the menu's, so with a controller you stand still. The look stays put: the pointer is free for the menu.
- **The tabs share one place:** the panes sit in the same grid cell, the hidden one `inert` and invisible, so the menu is as big as its bigger tab and keeps its size from one to the other. The Map pane is only there while its tab shows (it draws every frame and takes the sketch keys), so the menu grows to the map's size on it. Switching blurs whatever had the focus in the old tab, and the controller starts on the new one where it was last (the menu's `key` is per tab).
- **Adding a tab:** a name in `MENU_TABS` (`GameMenu.svelte`), when it shows in `tabs`, and its pane in the markup.

### The pack screen

The Pack tab (`PackPanel`) is a `LoadoutPanel` (EQUIPMENT, BACKPACK, QUICK USE), with the weight carried beside the title, with the slot in the hand outlined. Slots are `ItemSlot`s on an `ItemBoard` (see [systems.md](systems.md#item-slots)): drag onto another slot, shift-click, or right-click for Inspect, Equip / Unequip, Split and Drop. Each sends an `inventory` message carrying an `InventoryAction`.

The server checks the request (`sanitizeAction`, which refuses stash slots), applies it in `PackSystem.request` (`server/systems/pack.ts`) with `applyAction`, and refuses it while downed. A `drop` lands on the floor in front of you. If what's in the hand changed, the held item's action is cancelled and the new one comes up (`reequip`). These changes are not predicted: the client sees them in the next snapshot.

Handing something to another player is dropping it for them to pick up. A bandage or battery can be used on them directly: see [Using items on a teammate](#using-items-on-a-teammate).

A player goes down with their explorer's loadout, chosen on the surface (see [economy.md](economy.md)); a new explorer has nothing. `emptyInventory()` is carrying nothing.

### The quick-use wheel

Holding `quickUse` opens `QuickWheel` over the game: the six quick-use slots around a circle. While it is open `LocalPlayer` sends mouse movement to the wheel's pointer instead of the view (`openWheel`, `wheelPointer`, `closeWheel`) and holds back attack and aim. `wheelChoice` (`src/lib/ui/wheel.ts`) picks the filled slot nearest the pointer's direction, outside a dead zone at the centre. Letting go calls `LocalPlayer.take(HAND.quick + index)`, which goes out as the next frame's `select`. The wheel doesn't open with nothing in the quick-use slots.

## Using items (`stepWeapon`)

The held item is advanced by `stepWeapon`, called from `stepPlayer`, so it is predicted exactly like movement. `PlayerState.weapon` holds:

- the current `action`: `equip`, `swing`, `shot`, `reload`, `draw` (a throw being drawn back) or `throw` (it has left the hand);
- its `time`;
- `aiming`;
- a `shots` counter;
- the previous frame's buttons, for press edges.

`InputFrame` fields: `attack`, `aim`, `reload` and `select` (what to take in the hand, as `Inventory.selected`, for one frame; otherwise -1). All of them are off while `reading` (see [the in-game menu](#the-in-game-menu)).

The rules:

- **Firearms** fire once per press. An empty press clicks and starts a reload if you have rounds. Reload is a press, and takes rounds from wherever they are carried (the backpack). Aiming (hold) caps speed at `aimSpeed` and tightens the spread.
- **Zoom:** aiming narrows the camera to `firearm.zoom` of the field of view from the settings, eased in and out with the gun coming up (`ViewModel.zoom()` into `Engine.setZoom`; the viewmodel has its own camera, so the gun isn't distorted). Mouse look is slowed by the same factor (`LocalPlayer.lookScale`), so the view moves as it looks. Only in first person.
- **Recoil:** your own shot throws your view up by `recoil.pitch` and aside by up to `recoil.yaw` either way (`LocalPlayer.kick`, worked off over about 50 ms). It moves your real aim, which goes to the server with your next frames: you bring it back on target yourself. The shotgun throws about 9 degrees, the revolver about 2. The gun in your hands turns up `recoil.rise` and comes back `recoil.back`, settling over `recoil.settle` seconds.
- **Melee** swings repeat while attack is held. The hit is decided at `windup`.
- **Throwables** (the knife and the brick, both melee too) are thrown by holding attack: it starts `draw`, and nothing repeats while it is held. Let go once `w.time` reaches `THROW_DRAW` (1 s) and one leaves the hand (`spendHeld`, a `throw` event); `throw` runs `THROW_FOLLOW` (0.3 s) as the arm comes through, then whatever is in the hand now comes up (`equip`). Let go sooner and it swings instead, starting as far into the swing as the draw got (up to `windup`), so a tap hits as soon as it always did. Opening the menu (`reading`), taking something else in hand or becoming unable puts the draw down: no swing, no throw. Aim doesn't throw: it is for guns only.
- **Dropping** is only from the pack screen (an `InventoryAction`). There is no drop key.
- **Healing items** (`heal`): holding attack with one in the hand, standing still and hurt, counts `bandaging` up; at `heal.seconds` one is used for `heal.amount`. This is in `stepPlayer` (`updateBandage`), not `stepWeapon`. The client plays `bandage` when one starts (at most once every 2.5 s: the clip runs most of a bandage and isn't cut short if it's interrupted). Moving, letting go or taking something else in the hand resets it.
- **Batteries** (`charge`): the same, counting `charging` up (`updateCharge`), while the lamp isn't full. At `charge.seconds` one is used and `battery` rises by `charge.volts / lamp.volts` (12 V of the starter lamp's 24 V), never past full. The prompt says "Changing the battery..."; the client plays `battery.charged` when the charge jumps (`lampSounds` in the play page). Batteries are uncommon loot (`CRATE_LOOT`), not sold in the store.
- **On a teammate:** a healing item or a battery can go to someone else: see [Using items on a teammate](#using-items-on-a-teammate).
- **Switching** works any time except while downed, and takes `EQUIP_TIME`. The primary and secondary weapons have their own keys; quick-use items come from the wheel.
- **Not while:** swimming, mantling, crawling, bandaging, changing a battery, reviving or downed. An action in progress is cancelled.

What happened is reported as `SimEvent`s (`shot`, `swing`, `throw`, `reloaded`, `empty`):

- **On the server,** `server/combat.ts` resolves them.
- **On the client,** `LocalPlayer.drainEvents()` gives instant feedback (gunshot, flash, click). Replayed frames during reconciliation don't emit events.

Pellet spread comes from `pelletDirections(direction, spread, pellets, seed)`. The seed is the shot counter, so it's deterministic.

## Durability

Things wear out with use ([#28](https://github.com/JoshuaBelden/undercroft/issues/28)). The rules are in `src/lib/shared/items/durability.ts`, shared by the simulation, the server, the store and the interface.

- **Two kinds.** An item with `durability` (`max` wear, counted `per` hit, shot, point, use or second) **breaks** when its wear (`ItemStack.worn`) reaches `max`, and stays where it is. A brick (`melee.breaksAfter`) is **used up** instead, and gone (its count is `ItemStack.uses`). `lasting(def)` gives either as `{ max, per, usedUp }`, or null for things that never wear.
- **Wear is on the stack,** so it lasts through extraction, the stash and the loadout. Anything with `durability` has `maxStack: 1` (a test checks), so two stacks of wear never merge.
- **What wears what:**
  - A gun wears with every shot it fires (in `stepWeapon`, so it is predicted). The shot that breaks it still goes off, and reports a `broke` SimEvent.
  - A melee weapon wears with every hit it lands (on the server: `wearHeld` in `server/combat.ts`). Swinging at air doesn't wear it.
  - Defense wears by every point of a blow it takes (`absorbBlow`).
  - Gear (by the second) and things worn by the use come with the items that need them.
- **Broken does nothing** (`isBroken`; `works` is the opposite, for something that is there). It keeps its slot, its picture and its model, and can still be equipped or moved.
  - A broken gun dry-clicks (an `empty` event) and doesn't reload.
  - A broken blade or brick doesn't swing or throw.
  - Broken defense takes no blows (`shieldOf` says 0 left).
  - A broken crowbar pries nothing (`heldWorking(inv, 'pry')`).
  - Broken gear isn't in `workingGear`.
- **Breaking** raises a `break` `GameEvent`: it plays `defense.torn` for defense, `brick.break` for a brick, and `item.break` for anything else.
- **Condition:** `condition(stack)` is what is left, 1 new to 0 broken. A worn thing sells for that share of its price, and a broken one for nothing (`sellPrice(item, stack)`).
- **Repair** comes with the Workshop: `mend(stack)` makes a thing as good as new.
- **In a slot,** a broken item is drawn under a red shade, with the broken mark in its top-right corner (`Slot`'s `broken`). The tooltip shows durability as a bar and a percent (`stackCondition`: never 0% for something that still works, nor 100% with any wear), and says when it is broken.

**Tuning:** `durability` on each item in `src/lib/content/items.ts`: the knife 150 hits, the crowbar 200, the revolver 400 shots, the shotgun 250, the coat 40 points. **Testing:** the admin **Wear held item**, **Break held item** and **Repair everything** (see Admin, below).

## Inspect

Right-click an item (or press the keyboard's menu key, or the controller's Y) and choose **Inspect** to open its panel (`ItemInspect`, drawn by `ItemOverlays`). It shows the picture, name, rarity, type, flavor and durability, and every figure that applies to the item (`itemStats` in `src/lib/ui/items.ts`):

- damage, spread, time between shots, rounds and reload;
- range and falloff, and how far it is heard;
- reach and swing times;
- shield, how long it lasts and what wears it;
- weight, stack and what it sells for.

The panel follows the stack while it is open, since wear changes underground. It works on a locked board too (the loadout, while the explorer is underground), where it is the only entry in the menu. The tooltip shows only the name, rarity, type, flavor and durability. The recipe, what the item salvages into and where you've seen it join the panel with crafting.

## Using items on a teammate

A bandage, a medkit or a battery in the hand can be used on a teammate instead of yourself ([#96](https://github.com/JoshuaBelden/undercroft/issues/96)): hold `aim` (right click, LT) looking at them, standing still. Giving items away isn't a thing: drop it for them to pick up.

- **Who.** `lookedAtTeammate` (`src/lib/shared/player/tend.ts`): the nearest teammate whose body (a capsule `TEND.radius` wide) the look ray meets within `TEND.range` (2 m) of the eye, with nothing in the way. Only teammates on their feet count (`teammateSpot`): a downed one needs salts, from the quick-use slot as before.
- **Whether they need it.** A heal item only for a teammate who is hurt, a battery only for a lamp that isn't full (`needs`). The prompt says what aim would do ("[RMB] to tend to Name", "to change Name's battery") only then.
- **In the step.** `stepPlayer` takes the teammates (`TeammateSpot`s) as its last argument. `updateTend` counts `tending` up while aim is held, standing still and grounded, on the same teammate (`patient`); moving, letting go, looking at someone else, or them no longer needing it starts it over. Not while bandaging yourself or changing your own battery (attack does those), and the hands are busy meanwhile (no swinging or aiming a gun). At the item's `heal.seconds` or `charge.seconds` one is spent and the step reports `SimEvent` `tend`. It is predicted like bandaging: the server builds the teammates from their current states (`TendSystem.teammatesBesides`), the client from the latest snapshots (the `Tend` play feature, `LocalPlayer.setTeammates`), and reconciliation settles a difference.
- **The server** (`TendSystem`, `server/systems/tend.ts`) gives it to them: sanity up by `heal.amount` (never past full), or their battery up by `charge.volts` of the lamp's volts. If they went down, left, or stepped more than `TEND.range + TEND.slack` away meanwhile, the item goes back to whoever used it (on the floor if it no longer fits). A `tend` `GameEvent` goes out.
- **Client.** The prompt while tending ("Tending to Name...") with its progress, and the teammate being tended sees "Name is tending to you...". The bandage sound plays as anyone starts tending with a heal item (positional for others). The patient hears the battery go in from their own lamp's charge, as when they change it themselves. Their body plays the bandaging or battery clip.

**Tuning:** `TEND` in `src/lib/content/player/sanity.ts`. **Testing:** two windows in co-op; Set sanity (admin, Player tab) on the other to hurt them.

## Combat (server)

- **Shots:** each pellet is a ray from the eye. It stops at the first wall (`segmentHit`) or creature (`rayVsCapsule` against `CreatureDirector.hitBodies()`). Damage per creature is summed per shot, so a shotgun blast staggers as one hit. Damage loses `falloff` linearly to the end of `range`, and keeps going at that level to 1.5× range. Gunfire calls `creatures.hear(origin, noise, shooter)`.
- **Swings:** the nearest creature whose body is within `range` and inside the `arc` (widened by the body's angular size up close), with line of sight. A hit, or striking a wall, makes `noise`. Swinging at air is silent. Every hit wears what made it (`wearHeld`): a brick is used up at `breaksAfter`, and anything with `durability` breaks (see [Durability](#durability)).
- **Defense:** a creature's blow lands on what is in the defense slot first (`absorbBlow`, in `CreatureSystem.step`): its shield takes what it has left, and only the rest is taken off sanity. The blow that uses the last of it breaks it (`absorbBlow` returns `broke`): it stays in the slot, takes nothing from then on, and a `break` event plays `defense.torn`. The client plays `player.shielded` (and a small shake) when its shield drops, and shows the shield as a bar over your health (`PartyMember.shield`, your own only). Darkness, seeing things and the manifestation go straight to sanity.
- **Throws:** `WorldItems.launch` simulates a projectile with gravity in sim-rate steps. It hits a creature (damage, then it drops there) or lands on the world and becomes a floor item. Landing calls `hear` with no source, so creatures go and search the spot: a lure (a brick's `landNoise` is 8 m, a knife's only 4).
- **No friendly fire:** shots and swings only test creatures.
- **The manifestation** is a target too while it's out (`targets()` adds it, `hurt()` routes id `manifestation` to the Affliction). Every hit damages it. See [affliction.md](affliction.md).

Creatures (see [creatures.md](creatures.md)):

- **Health:** they have `health`.
- **Stagger:** a hit of at least `stagger.threshold` staggers them for `stagger.seconds` and cancels an attack that hasn't landed.
- **Retaliation:** any hit turns them on the attacker.
- **Death:** at zero they die. They play `die`, are removed after `corpseTime`, and count toward `kills` (for the Affliction meter).

## World items (`server/items.ts`)

- **Scatter:** bricks lie only by collapsed walls: `rubble-<n>` markers in the pieces (for now the rock fall in `hall-dead-end`; `rubbleSites` in `src/lib/shared/map/points.ts`). Each gets `BRICKS.perRubble` (1 to 3), on standing, dry nav points within `BRICKS.radius` (1.8 m) of it, seeded from the map seed. None by a rubble marker within 6 m of the start. To make bricks lie somewhere else, add a `rubble-<n>` empty to that piece in Blender, export it and run `pnpm asset:build`.
- **Pick up:** pressing interact picks up the item `lookedAtItem` picks: within `PICKUP.range` of the eye, within `PICKUP.angle` of the look direction (or right at your feet), and not behind a wall. It goes where `addItem` puts it. The client highlights the same item and prompts "[E] to pick up …". `pickUp` returns the item and how many it took, and the `pickup` event carries both: your own pickups raise an alert ("Picked up 3 × Bandage", [alerts.md](alerts.md)).
- **Death:** when a player dies, everything they carried is dropped around where they fell.
- **On walls:** `WorldItems.mount(stack, position, normal)` hangs an item where it is put, without settling it on a floor (rite hints, see [rite.md](rite.md#in-the-map)). Its snapshot carries `normal`; the client stands it upright against the wall, its thin side along the normal (`WorldItems.ts`, `mounted`). Picking it up works the same at any height.

Each `tick` carries `items`, `projectiles` and `events` (`GameEvent`): shots with their end point, swing results, throws, landings, breaks, reloads, dry clicks, pickups, drops, creature hits and deaths. Clients play sounds and effects for other players from these, and impacts and hits for everyone; a throw and its landing play the item's `throwable.sound` and `land`. Your own gunshot, swing, throw and reload sounds come from prediction instead, and so does the quiet `throw.ready` click (and `throwReady` rumble) when your throw is drawn back all the way.

## Quest items

An item with `quest: true` is one of a kind and needed for a rite: the Pendant. It is not a rarity and not in the loot tables. In the interface (`src/lib/ui/items.ts`):

- its slot has a purple left and bottom edge in place of a rarity's (`--quest` in `src/app.css`; `Slot`'s `quest` prop) and a purple star in the bottom-left corner (`slotMark`, `FILTER_ICONS.quest`);
- it is listed under the Quest items filter (`ItemFilters`, `matchesFilter`), not under Other;
- its tooltip says "Unique" in purple where the rarity goes, and "Quest item" for its category.

Where one is found is the rite's to say (`place: 'crate'` on the requirement, see [rite.md](rite.md#in-the-map)). One that anyone in the party already owns, in their stash or loadout, is not put in the map at all (`Session.withhold`). To add one, set `quest: true` on its `ItemDef`.

## Loot crates

Most loot is in crates (`CRATES` in `src/lib/content/loot.ts`). A crate has 8 slots.

**Where they stand.** Pieces carry `crate-<n>` markers: places a crate may stand, with its back to a wall (see [asset-pipeline.md](asset-pipeline.md)). A marker is only a possibility. `placeCrates(layout, PIECES, seed)` fills each with probability `CRATES.fill`, none within `CRATES.minDistance` of the start, seeded by the map seed. The server calls it once the layout is generated and stores the result in `layout.crates` (`id`, `position`, `yaw`, and `tier`, the level of the map), which goes to clients with the layout.

**Not in the start room.** The start room (`angel-well`) has no crate markers, and `placeCrates` would leave any it had empty. To try the loot screen without walking for it, give yourself items with Give in the admin panel underground, or teleport to a room from it.

**Solid.** `buildCollisionWorld` adds a box of `CRATES.size` for each entry of `layout.crates`. Server and client both build the world from the layout, so movement prediction, line of sight and the nav grid all take crates into account. The box is a little higher than the model (0.55 m), above the nav grid's step height, so nothing treats a lid as a floor.

**What is in them.** `Crates` (`server/crates.ts`) rolls each crate with `rollCrate` at its depth in its level, with the rarities its level allows (`LEVEL_LOOT`; see [economy.md](economy.md#tables)). Every slot that holds something starts **hidden**.

**Opening.** Holding interact for `CRATES.openSeconds` (1 s) on the crate `lookedAtCrate` picks opens it: within `PICKUP.range` of the eye, within `CRATE_REACH.angle` of the look direction, nothing but the crate in the way. A floor item being looked at comes first (interact picks that up). `PlayerState.opening` counts the seconds (server-driven, like `performing`), and resets if any of that stops. The client prompts with the same rule: the interact key as a keycap and "to search", filling as it is held, for crates and corpses alike (with interact unbound, "Interact to search").

- **One at a time:** a crate someone has open can't be opened by anyone else ("Someone is going through it").
- **The lid:** the first time a crate is opened its lid goes up and stays up, for everyone (`crateOpen` event; `tick.crates.open`). Creatures within `CRATES.noise` hear it and come to look. Every thing taken out of a crate (or put in) is heard too (`CRATES.lootNoise`, 4 m; `CORPSES.lootNoise`, 3 m), and adds to the party's noise meter ([creatures.md](creatures.md#attraction)).
- **It shuts** when the player closes the screen (`closeCrate`), moves more than `CRATE_REACH.leave` from it, goes down, dies, leaves or loses their connection.

**Revealing.** While someone has a crate open, `Crates.step` reveals its hidden slots one at a time, lowest first, `CRATES.revealSeconds` (1 s) each. Each slot starting raises a `rummage` event (the rummage sound, for everyone near). Closing the crate part-way through a slot loses that slot's progress; slots already revealed stay revealed, for whoever opens it next. The contents were laid out commonest first, so the best comes last. When a slot you are watching turns out to hold something epic, legendary or a quest item, your client plays `loot.found` (the happy cue, on the music bus so it is dry); so does picking one up off the floor (`prize` in the play page).

**What the player is told.** Hidden contents never leave the server. While a crate is open its user gets a `crate` message each tick: `slots` as `CrateSlot`s (a stack, `null`, or `'hidden'`) and `reveal`, how far along (0..1) the first hidden slot is. `{ id: null }` means it has shut.

**Moving things.** The crate's slots stand where the stash does on the surface: `CrateSystem.loot` (`server/systems/crates.ts`) runs the request with `applyAction({ inventory, stash: crate.slots, sealed: crate.hidden }, action)`, so every rule of the pack screen works both ways (drag, swap, shift-click, split, equip, drop, the weight limit on taking). `Belongings.sealed` are stash slots that don't exist as far as the rules go: hidden slots can't be taken from, swapped with or stacked onto. With no crate open, requests naming stash slots are refused as before.

**The loot screen** (`CrateScreen`): most of the window, the crate's 8 slots (4 across) beside a `LoadoutPanel`, on one `ItemBoard`. A hidden slot is a dashed box; the one being revealed shows a progress bar and nothing else. Opening it releases the pointer. The Close button, the pack and menu keys, or any movement key (`moveForward`, `moveBack`, `moveLeft`, `moveRight`, `climb`, `stance`) shut it and take the pointer back.

**Tuning:** `CRATES` (slots, seconds, fill, size, noise, jams and prying). To add crate places, add `crate-<n>` markers to pieces.

### Jammed crates

About `CRATES.jammed` (a quarter) of the crates are jammed ([#25](https://github.com/JoshuaBelden/undercroft/issues/25)). `Crates` picks them in its own seeded stream (`Crate.lock = 'jammed'`); corpses and trunks never are. Nothing tells them apart until someone tries one:

- **Found:** holding interact the usual `openSeconds` doesn't open it. It sets `jamFound`, raises `crateStuck` (`crate.stuck`, a rattle) and spends the press (`Player.crateLatch`: interact has to be let go before the next try). From then on the crate is in every tick's `crates.jammed`, so everyone's prompt knows.
- **Prying:** with an item that has `pry: true` (the crowbar) **in the hand**, holding interact counts `PlayerState.opening` up to `CRATES.prySeconds` (10 s). It raises `pry` as it starts (`crowbar.pry`, the crowbar recording, heard `CRATES.pryNoise` away) and creatures hear it then and every `CRATES.pryEvery` seconds while it goes on, with the pryer as the source. Letting go, looking away or moving off starts it over. When it gives, the lock is gone (`Crates.release`) and the crate opens at once.
- **Prompt** (`crates.svelte.ts`): "Pry [E] (crate stuck)" (the words after the key are `Prompt.after`), filling over the ten seconds; red with no crowbar in the hand (`Prompt.blocked`, drawn red by `HoldPrompt`).
- Hints never go in jammed (or locked) crates, nor do the trunks' keys.

### Locked trunks

On the third level (`TRUNKS.tier`) about `TRUNKS.chance` of the crates are locked trunks ([#95](https://github.com/JoshuaBelden/undercroft/issues/95)): `placeCrates` turns them in its own stream after the corpses (`kind: 'trunk'`), pushed out from the wall since a trunk is deeper than a crate. They are solid (`TRUNKS.size`), drawn with `shared/props/trunk.glb` (from `art/export/props/trunk.glb`, fitted by `PROP_FIT`; no lid), and searched like a crate once open.

- **A prize:** `rollCrate`'s `prize` makes sure each holds something epic or legendary (legendary with probability `TRUNKS.legendary` when it rolled neither), among the usual things.
- **Keys:** the `key` (`unlocks: true`, a backpack item, `TRUNKS.key`) opens one and is used up. `Crates.hideKeys` puts one key per trunk in a crate you can walk to that is neither jammed nor a trunk, so no key is behind a lock; keys are kept through an admin refill. A key carried out is kept like anything else.
- **Unlocking:** a press of interact on a locked trunk (`CrateSystem.unlock`) with a key **anywhere** in the inventory takes one, clears the lock and raises `crateUnlock` (`key.unlock`). Without one it raises `crateStuck`. Either way the press is spent: opening it is a fresh hold after. Locked trunks are in every tick's `crates.locked`.
- **Prompt:** "Unlock [E]", red without a key.

**Admin:** **Unlock crates** (`unlockCrates`, Items tab) unjams every crate and unlocks every trunk; Give gives keys and crowbars.

### Corpses

The dead are searched like crates: the same 8 slots, loot tables, reveal and loot screen (titled "Corpse"). They are `layout.crates` entries with `kind: 'corpse'`, so everything about crates applies, except:

- **Where:** once `placeCrates` has chosen the crates, about `CORPSES.share` (a third) of them become corpses instead, picked in their own seeded stream so which markers have crates doesn't change. The body is pushed out from the wall so its back lies where the crate's was, and turned either way round at random. A crate only becomes a corpse if `corpseFits` finds the whole footprint (`CORPSES.size`, tested `CORPSES.inset` inside its edges) clear of walls and columns, on floor all over and out of the water, and `crowds` finds no other crate in it (or corpse within a body's length); otherwise it stays a crate. About 22 crates and 11 corpses a map; a body fits nearly everywhere a crate does, so it rarely stays a crate.
- **Not solid:** `buildCollisionWorld` skips them, so you step over a body and the nav grid ignores it.
- **Looked at:** their middle is `CORPSES.lookHeight` (0.2 m) up (`crateCentre`).
- **Searching** has the same prompt as a crate, plays `corpse.search` (the `bag_searching` recording) instead of the lid, and is heard only `CORPSES.noise` (3 m) away. There is no lid.
- The model is `static/assets/shared/props/corpse.<hash>.glb` (see [asset-pipeline.md](asset-pipeline.md#props)).

## Client

- **ViewModel:** drawn in the engine's second pass (`viewScene`/`viewCamera`, depth cleared), so it never clips into walls.
  - Its motion is procedural, from the predicted `weapon` state: walk bob, equip raise, swing (draw back, strike, settle), recoil (by the gun's `recoil`: the shotgun slams back much harder than the revolver), reload dip, drawing back to throw (through the swing's wind-up, then on back over the shoulder; hidden while `throw` runs: it has left the hand), and aiming (moves to `hold.aim`, under the crosshair).
  - It's lit by a fill light that follows your headlamp output, so in the dark you can barely see it.
  - `flash()` draws your own muzzle flare at `hold.muzzle` and blazes the fill for a moment. It returns false when the viewmodel isn't drawn (over the shoulder, map view), and the flare goes in the world instead.
- **Shot light costs no light.** The light of a gunshot is the shooter's own headlamp: `Headlamp.flash()` widens its spot to a 66° half-angle, warms it and turns it up to 120 cd for 70 ms, lamp on or off, and it casts real shadows. Every player already has a headlamp in the budget, so shots never add a light, however many people fire. (`RemotePlayers.flash(id)` does it for others.) Your own shot also pulses a faint ambient light in `Effects`, so the room behind you catches a little. Ambient lights are outside the budget.
- **Effects:** a shader muzzle flare (`flare.ts`: unlit and additive, a hot core and flame petals that change shape each shot), tongues of flame blown forward out of the barrel (3, or 6 from the shotgun: unlit and additive, burning down `FIRE_RAMP` from white-yellow through orange to red in 0.12 to 0.26 s), a faint wisp of smoke after them (a lit material, so the flash and headlamps show on it), and impact dust or a dark spatter (creature), with sparks off stone.
- **Gun sounds:** each gun's `sound`, `reloadSound` and `gun.empty`. Another explorer's shot crossfades from the gun's own sound into `gun.distant` between `DISTANT_SHOT.from` and `from + span` metres (`src/lib/content/audio/sounds.ts`).
- **HUD:** what is in the hand (name and count; the "Held item" setting hides it), the ammo counter (loaded | spare in the backpack) and a tighter crosshair while aiming.

## Adding an item

1. Add a builder to `scripts/blender/items.py` (origin at the grip, forward +Y, up +Z) and list it in `ITEMS`. Run `items.build_all()` and `items.export_all()` in Blender, then `pnpm asset:build`.
2. Add an `ItemDef` to `ITEMS` in `src/lib/content/items.ts`, with its `category`, `maxStack`, `flavor`, `weight`, `price` (or `value` for treasure), `durability` if it wears, and specs. Its art may already be named in `src/lib/content/planned.ts`: take that line out once the item names its picture and model. For a picture, put a PNG, JPEG or WebP in `art/images`, run `pnpm asset:images` and set `image`.
3. If it can be in the hand (a weapon or quick-use item), give it a `grip`: add it to `GRIPS` in `scripts/blender/explorer.py`, check it with `explorer.show_item(id)`, copy what `explorer.grip_numbers()` prints, and look at it with the admin Grip check.
4. New behaviour (an item kind that does something new) goes in `stepWeapon` (timing, events) and `server/combat.ts` (what it does). Keep it keyed by def fields, not item ids.

## Admin

These need `DEV_MODE`:

- **Give** any item with a count (firearms come loaded); it goes where `addItem` puts it;
- **Refill ammo** (fills the guns in the weapon slots and adds spare rounds);
- **Wear held item** (`wearHeld`: a quarter of its durability) and **Break held item** (`breakHeld`). Both work on what is in the hand if it wears, else on what is worn for defense;
- **Repair everything** (`repairAll`): every stack carried, as good as new;
- **Reset crates** (`resetCrates`): shuts every loot crate and fills it again, hidden, with a new roll (a quest item, hint or key still in a crate stays in it);
- **Unlock crates** (`unlockCrates`): unjams every crate and unlocks every trunk;
- **Infinite ammo**;
- **Kill all** creatures.
