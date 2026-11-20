# Handoff: gear, crafting and loot

Design for the next round of work: new weapons, gear and supplies; durability, repair and salvage; discovery, the Library and crafting; the store's tiers; a training ground; lootables, how loot spawns, and the rooms it lives in. This is a living document: update it as decisions change. When a phase is built, move what it settled into the matching `docs/dev/` page and mark it done here.

Status markers: **Decided** is agreed; **Proposed** is a suggestion not yet confirmed; **Open** needs a decision.

## Scope (Decided)

- **This doc is the design.** Where an older issue says otherwise, this doc wins: it overrules #92 (underground crafting) and #27 (surface crafting), and covers #28 (durability and repair), which closes against it.
- **The item list is this doc's.** Every item here is added; an existing item not listed here is removed. (Today every item in `ITEMS` is listed, so nothing goes.) The headlamps (`src/lib/content/items/headlamps.ts`) are explorer equipment outside the item catalogue and aren't affected.
- **The store is this doc's.** The store tiers below are the whole of `SHOP`.
- **Out of this round:** traps the catacombs set (#22), and every water mechanic: wet or soaked items, waterproofing, breath (#23, #82). Swimming stays as it is today.

## Dev note: keep it in the lib (Decided)

This work adds a lot of mechanics. They belong in focused modules, driven by data, not scattered through the session, the play page and the UI.

- **Data in `src/lib/content/`:** items (extended), `recipes.ts`, `lootables.ts`, store tiers in `economy.ts`, rooms in `map/kit.ts`. Numbers and rules live here, not in logic.
- **Rules both sides need in `src/lib/shared/`:** for example `shared/items/durability.ts` (wear, broken), `shared/crafting/` (discovery, what a recipe needs, can this be crafted), `shared/items/salvage.ts`, `shared/economy/tiers.ts`. Pure functions, used by the server, the client and the hub alike.
- **Server work in `server/systems/`**, one system per mechanic (crafting, lootables, discovery), like the existing systems.
- **Behaviour comes from item fields, never item ids.** A sweep is `melee.sweep`, a piercing shot `firearm.pierce`, a silent weapon `silent: true`, a delayed lure `throwable.fuse`, cutting webs `cuts: ['web']`. Code checks the field; any item with it gets the behaviour. (The same rule the creatures follow: "keyed by def fields, not by kind name".)
- **UI pieces are shared components:** one item slot (with the broken state), one tooltip, one right-click menu, one Inspect panel, used by the stash, loadout, store, Workshop, Library and in-game pack.

## Each phase covers (Decided)

Every phase below addresses the six aspects in CLAUDE.md for what it adds:

- **Dev docs:** `docs/dev/items.md` (types, durability), a new `docs/dev/crafting.md` (discovery, recipes, Workshop, field crafting), a new `docs/dev/lootables.md` (types, markers, tables, budget), `economy.md` (tiers, trust, base price), `map-generation.md` (`levels`), `creatures.md` and `status.md` (dummies, bleeding, snares).
- **Help:** a topic for each new item type, the Workshop, the Library, discovery, field crafting, each lootable and each Affliction.
- **Admin tools:** grant or reset discoveries; set an account's trust and store tier; unlock or lock an Affliction; spawn any lootable at the crosshair; set an item's wear or break it; give any material; reset Rumors progress.
- **Audio:** see the art list.
- **Settings:** the throw landing preview (on/off), the discovery alert (on/off).
- **Bindings:** the right-click menu on a controller, field crafting, cancelling a throw, each with a key and a `PAD_DEFAULTS` button, all remappable.

## Summary

- **Item types:** Offensive, Defensive, Quick use, **Gear** (new, a slot that holds 3), **Material** (new, backpack only), Backpack and Treasure.
- **Durability:** items wear, and broken items keep their art with a broken icon and a red shade. They can still be equipped but don't work.
- **The Workshop** (a hub page) does all repair, crafting and salvage.
- **Discovery:** you discover an item by seeing it in a lootable. The **Library** (a hub page) shows what you've discovered and the recipes that use it. A recipe can be crafted once you've discovered everything in it. No recipes are known at the start.
- **Field crafting** below needs the field crafting kit.
- **Firearms and ammo are never crafted.** Any weapon that can be crafted isn't sold.
- **The store unlocks in tiers.**
- **Rumors:** the first Affliction, a tutorial and training room with no creatures. Every account must do it before the Gloaming unlocks.
- **Lootables** of many kinds, placed by room type; a rework of how loot spawns; flavor text for each.
- **New rooms**, each with the levels it appears on, including rooms that need rappelling.

## Item types (Decided)

| Type               | Slot                                       | Examples                                    |
| ------------------ | ------------------------------------------ | ------------------------------------------- |
| **Offensive**      | Weapon slots (a few go in quick-use slots) | Knife, revolver, crossbow; brick, derringer |
| **Defensive**      | The defense slot                           | Padded coat, leather jerkin                 |
| **Quick use**      | Quick-use slots                            | Bandage, battery, chalk, snare              |
| **Gear** (new)     | The gear slot, which holds **3**           | Kneepads, gloves, field crafting kit        |
| **Material** (new) | Backpack only; never quick use             | Rags, metal scraps, rubber                  |
| **Backpack**       | Backpack                                   | Ammo, notebook, candles, key                |
| **Treasure**       | Backpack                                   | Coins up to the reliquary                   |

- **Materials are ordinary inventory items.** They stack, go in the backpack and the loadout, and can be taken down, but they can't be put in quick-use slots.
- **Gear is worn, not used:** it works while it's in the gear slot.

## Durability, broken items and the right-click menu (Decided)

- **Wear** is counted per stack (like the coat's `worn` today). See each table's Wear column. Wear is measured in **uses** (hits, shots, crafts, searches, resets) or in **seconds** (kneepads crawling, overshoes walking, glow sticks fading): an item's durability says which, and both show as the same bar.
- **Broken items keep their image and model.** In any slot, a broken item shows a **broken icon** and a **red shade**. It can still be equipped, but it doesn't work: a broken gun dry-clicks, a broken blade doesn't swing, broken armour takes nothing, broken gear does nothing.
- **Armour changes:** today a coat that runs out of shield points is torn apart and gone. Instead it **breaks**: it stays in the slot, protects nothing, and can be repaired.
- **Tooltip:** name, rarity, type, flavor line, and **durability** as a bar and percent. No weapon stats.
- **Right-click menu** on any item:
  - **Inspect:** a panel with every stat (damage, spread, time between shots, reload, range, noise, wear per use), the recipe, what it salvages into, and where you've seen it.
  - **Repair** (only below 100%): takes the player to the Workshop with the item selected.
  - Existing actions (sell, drop, move) stay.

## The Workshop (Decided)

A new hub page. Everything to do with making and mending happens here.

- **Repair:** materials plus coin (20% of the item's base price, scaled by wear). Broken items can be repaired.
- **Craft:** any recipe that's available (see Discovery), instantly, from the stash.
- **Salvage:** break an item down into the materials in its Salvage column. **Salvage gives materials, never discoveries.**

## Discovery and the Library (Decided)

- **You discover an item by seeing it in a lootable**: it's revealed in a crate, corpse, trunk or any other lootable you open or look into. Buying it, salvaging something into it, a teammate handing it to you, or picking it up off the floor don't count. That closes the loophole: buy a gun, salvage it, and the gun parts are useful materials but still not discovered.
- **Every player who looks into the lootable** discovers what's in it. Discoveries are per account and kept for good.
- **A font counts as a lootable:** filling a bottle at one discovers holy water.
- **Items only found loose** (bricks, pebbles) can't be discovered, so no recipe uses them.
- **The Library** (a new hub page, in place of a recipe book) lists:
  - **Discovered items**, each with its picture, flavor, and which lootables you've seen it in.
  - **Recipes**, as soon as you've discovered **any one** ingredient of it. It shows the product's name and silhouette, the ingredients you've discovered, and **?** for the rest.
  - When **every ingredient** is discovered, the recipe is **available**: it can be crafted in the Workshop, and in the field if it's a field recipe.
- **No recipe is known at the start.** Even the bandage waits until you've seen rags.
- **Recipe fragments** (torn manual pages, a gunsmith's notes, a dead explorer's journal) are found in lootables. Reading one **discovers an ingredient you haven't seen yet** for a recipe you've started, as if you'd seen the item. With no recipe started, it discovers an ingredient of a random recipe, which starts that recipe. With nothing left to discover, it's a flavor note only.
- **Discovery alert:** discovering an item plays the same sound as finding an epic item and shows an alert ("Discovered: rubber. Used in 2 recipes."). Newly discovered items get an effect (a soft shimmer on the slot) in the stash and loadout until the player hovers over them.

### Later

- **Tinkering:** experimenting in the Workshop to find hidden recipes. Pushed to another day.
- **The Surveyor's trade:** dropped for now. He still leaves caches.

## Crafting (Decided)

- **Workshop crafting:** every available recipe, instantly, from the stash.
- **Field crafting (below):** needs the **field crafting kit** in the gear slot, and only field recipes. Pick an available recipe while carrying its materials, then kneel for a few seconds: you can't move, it needs light, and it makes a little noise (4 m every 2 s). The item goes to your pack. No kit, no crafting below.
- **Firearms and ammo are never crafted.** Guns are precision work, ammo is the economy's steady coin sink, and scarce rounds are part of the tension. Guns are repaired and salvaged instead. The crossbow is the one real ranged weapon you can build.
- **A weapon that can be crafted is never sold.**
- **Crafted items sell for their materials.** A crafted stack is marked `crafted`, and selling it pays what its recipe's materials would sell for (for a recipe that makes several, that share of it). That keeps "buy rags, craft a coat, sell the coat" from making coin. Items found or bought sell as usual.
- **No crafting skill** for now. Skills come later.

## Store tiers (Decided)

The store shows what's for sale at your current tier, weapons included. Higher tiers open with the merchant's trust (total coin sold, per account) and with resolved Afflictions.

| Tier                  | Unlocked by            | Adds                                                                                                                                                                                       |
| --------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Start**             | —                      | Crowbar, revolver and rounds, padded coat, bandage, smelling salts, battery, chalk, candle, rope pack, notebook, whistle, glow sticks, bait, field crafting kit                            |
| **Trusted**           | 1,000 coin sold in all | Shotgun and shells, trench spade, medkit, lockpicks, firecrackers, pocket compass, gun oil                                                                                                 |
| **Gloaming resolved** | Resolving the Gloaming | Derringer, kneepads, felt overshoes, gloves, climbing pitons, laudanum                                                                                                                     |
| **Valued**            | 5,000 coin sold in all | Bolt-action rifle and rounds, pickaxe, sledgehammer, leather jerkin, incense censer                                                                                                        |
| **Never sold**        | Find or craft only     | Knife, hatchet, short spear, nail-studded club, throwing knives, slingshot, crossbow and bolts, oil bottle, brick, snare, tripwire bell, blessed salt, grave dirt, materials (but gun oil) |

- **Changes from today's `SHOP`:**
  - The shotgun and its shells move from the start store to Trusted.
  - The knife leaves the store: it's craft-only now, so the crowbar and revolver are the starting weapons.
  - The medkit moves to Trusted at 60 (was 50).
  - New to the start store: battery (loot only today), field crafting kit, whistle, glow sticks, bait.
- **Every item has a base price** (`ItemDef.price`), whether or not the store sells it. The store price is the base price. Repair cost is 20% of it. An item the store doesn't sell has 40% of its base price as its sell value. `sellPrice` reads the item, not `SHOP`, so never-sold items (the knife at 2, the crossbow at 20) sell for what the tables say.
- **Unlocking Gloaming-tier stock** needs the Gloaming resolved, and the Gloaming itself unlocks after Rumors (see below).
- These tiers stand for now and will be reworked when player levels arrive.
- **Dropped:** the first-find rule.

## Rumors: the tutorial and training ground (Decided)

**Rumors** is the first Affliction, and the only one known to a new player. A player must go on a Rumors expedition (and extract) before the **Gloaming** unlocks in the Expedition picker. This applies to **every account**, including those that have already played the Gloaming. After that, Rumors stays available as a place to train.

- **One small map:** the start room, a short way in, and a wide vault. No levels, no connectors to get lost in.
- **The tutorial walk:** on the way in, each step teaches one thing, with a help prompt:
  1. The rope down from the start room, and turning the headlamp low and bright.
  2. A crate holding rags: opening it is the player's first **discovery**, and since a bandage needs only rags, their first recipe becomes available.
  3. A field crafting kit to pick up, and crafting a bandage below.
  4. A second crate with wax scraps but no twine: the candle recipe appears in the Library with one ingredient still **?**, which shows how recipes fill in.
  5. Chalk and a wall to mark.
  6. The vault with the dummies, then the way out at a ladder.
- **The vault:** **training dummies** at 5, 10, 20 and 40 m, a dummy on a track moving side to side, a pile of bricks, a web across one arch, and a rubble wall to break.
- **Dummies** are a creature kind that doesn't move or attack, never dies (it resets), and shows each hit's damage, staggers and bleeding.
- **No threat:** no meter, no creatures, no deaths.
- **Normal rules otherwise:** everything you use in Rumors follows the same mechanics as in any other Affliction. Ammo is spent, items wear and break, and consumables and materials are used up.
- **Loot:** only the tutorial crates hold loot, and only the first time. What you take from them, the field crafting kit included, comes out with you like any other loot.
- **No weapon rack:** players train with whatever they load out with.

## Rooms show their level (Decided)

Today a room banner shows only the room's name; the level shows in the map tab's header and on its stair symbols. The banner adds the current level under the room's name ("Level 2"), and reaching a new level shows a banner for the level itself.

## Throwing: where it lands (Decided)

While a throw is drawn back, show where it will land: a faint arc and a mark on the floor, from the same projectile simulation the server runs. It applies to every throwable (brick, knife, hatchet, throwing knives, oil bottle, firecrackers, bait, glow sticks). A setting can turn it off.

## Materials

Materials are found below and are rarely sold. They're all new. Abbreviations in the tables: **metal** is metal scraps. **Nails** come 10 to a lot when found, and a recipe's count is single nails ("nails ×4" uses four).

| Item             | Type     | Store      | Sell | Found                                         |
| ---------------- | -------- | ---------- | ---- | --------------------------------------------- |
| Rags             | Material | —          | 1    | Crates, corpses, lockers                      |
| Twine            | Material | —          | 1    | Crates, lockers, tool chests                  |
| Wax scraps       | Material | —          | 1    | Niches, vestry cabinets                       |
| Nails ×10        | Material | —          | 1    | Tool chests, rubble                           |
| Wood             | Material | —          | 1    | Sarcophagi, tool chests                       |
| Metal scraps     | Material | —          | 2    | Tool chests, rubble, lockers                  |
| Leather scraps   | Material | —          | 2    | Corpses, cocoons                              |
| Rubber           | Material | —          | 2    | Workman's lockers, Pump Room, Explorers' Camp |
| Rope length, 5 m | Material | —          | 2    | Lockers, tool chests, corpses                 |
| Glass bottle     | Material | —          | 1    | Crates, smuggler's stashes                    |
| Lamp oil         | Material | —          | 3    | Tool chests, lockers                          |
| Rock salt        | Material | —          | 2    | Tool chests, bone piles in the Plague Pit     |
| Holy water       | Material | —          | 4    | Fonts (fill a glass bottle), vestry cabinets  |
| Bone             | Material | —          | 0    | Bone piles, niches                            |
| Gun oil          | Material | Trusted 12 | 4    | Level 3 corpses and stashes                   |
| Gun parts        | Material | —          | 10   | Level 3 corpses and cocoons                   |

## Melee weapons

**Columns:** Store is tier and price. Sell is 40% of the store price, less for wear. Craft: **Field** needs the kit and works below and in the Workshop; **Workshop** is surface only. Wear is uses until broken. Repair is the materials (plus coin). Noise is how far (m) a hit is heard; "throw" is where it lands.

| Item               | Type                 | Store      | Sell | Craft                     | Wear                         | Repair         | Salvage        | Damage                   | Noise                   | Special                                                                |
| ------------------ | -------------------- | ---------- | ---- | ------------------------- | ---------------------------- | -------------- | -------------- | ------------------------ | ----------------------- | ---------------------------------------------------------------------- |
| Knife              | Offensive            | —          | 2    | Workshop: metal, leather  | 150 hits                     | Metal          | Metal          | 18 (thrown 30)           | 2; throw 4              | Fast, quiet, throwable                                                 |
| Crowbar            | Offensive            | Start 60   | 24   | —                         | 200 hits                     | Metal          | Metal ×2       | 40                       | 6; pry 10 every 2 s     | Pries open jammed crates, niches, coffins, secret doors                |
| Brick              | Offensive, quick use | —          | 0    | Found by rubble           | 3 hits                       | —              | —              | 25 (thrown 30)           | 5; throw 8              | The classic lure                                                       |
| Hatchet            | Offensive            | —          | 4    | Workshop: metal ×2, wood  | 120 hits                     | Metal          | Metal, wood    | 28 (thrown 35)           | 4; throw 5              | Cuts a web in one swing; throwable, pick it back up                    |
| Trench spade       | Offensive            | Trusted 55 | 22   | —                         | 160 hits                     | Wood, metal    | Metal, wood    | 22 to each target        | 6                       | Hits everything in its arc (`melee.sweep`)                             |
| Short spear        | Offensive            | —          | 2    | Workshop: wood ×2, metal  | 100 hits                     | Wood           | Wood, metal    | 26                       | 3                       | The only melee weapon that works while crawling or in a squeeze        |
| Nail-studded club  | Offensive            | —          | 2    | Field: wood, nails ×4     | 60 hits                      | Nails ×2       | Wood, nails ×2 | 20, bleeding 4/s for 5 s | 6                       | Bleeding is a new creature status                                      |
| Pickaxe            | Offensive            | Valued 90  | 36   | —                         | 140 hits                     | Wood, metal ×2 | Metal ×2, wood | 45                       | 10; rubble 12 every 2 s | Breaks through rubble to open shortcuts                                |
| Sledgehammer       | Offensive            | Valued 110 | 44   | —                         | 180 hits                     | Wood, metal ×2 | Metal ×2, wood | 60, big stagger          | 14; smash 16            | Smashes trunks and boxes open; 25% chance a fragile item inside breaks |
| Throwing knives ×3 | Offensive, quick use | —          | 2    | Field: metal ×2 (makes 3) | Lost or broken one at a time | —              | Metal          | 20 each, thrown          | Throw 3                 | Pick them back up                                                      |

### Melee drawbacks

Stamina per swing is new (swings are free today).

| Weapon            | Wind-up / recovery | Reach / arc  | Stamina | Drawback                                                         |
| ----------------- | ------------------ | ------------ | ------- | ---------------------------------------------------------------- |
| Knife             | 0.15 / 0.30 s      | 1.4 m / 0.55 | 4       | Short reach, low damage                                          |
| Brick             | 0.30 / 0.50 s      | 1.5 m / 0.50 | 8       | Breaks after 3 hits; 2.5 kg                                      |
| Hatchet           | 0.25 / 0.40 s      | 1.5 m / 0.50 | 6       | Short reach                                                      |
| Short spear       | 0.30 / 0.50 s      | 2.4 m / 0.15 | 7       | A narrow thrust: misses anything not straight ahead              |
| Nail-studded club | 0.35 / 0.55 s      | 1.6 m / 0.60 | 8       | 20% chance it snags: no swinging for 0.6 s                       |
| Crowbar           | 0.45 / 0.65 s      | 1.8 m / 0.60 | 10      | Slow                                                             |
| Trench spade      | 0.55 / 0.80 s      | 2.0 m / 1.10 | 12      | Slow; lower damage per target                                    |
| Pickaxe           | 0.60 / 0.90 s      | 1.8 m / 0.40 | 14      | Slow and loud                                                    |
| Sledgehammer      | 0.90 / 1.20 s      | 1.9 m / 0.70 | 20      | No sprinting while in hand; 6 kg; empties stamina in five swings |

## Ranged weapons and ammo

| Item               | Type                 | Store       | Sell | Craft                                 | Wear                         | Repair             | Salvage                | Damage              | Noise                    | Special                                                             |
| ------------------ | -------------------- | ----------- | ---- | ------------------------------------- | ---------------------------- | ------------------ | ---------------------- | ------------------- | ------------------------ | ------------------------------------------------------------------- |
| Revolver           | Offensive            | Start 150   | 60   | —                                     | 400 shots                    | Gun oil            | Gun parts, metal       | 32                  | 35                       | Accurate to 40 m                                                    |
| Shotgun            | Offensive            | Trusted 250 | 100  | —                                     | 250 shots                    | Gun oil, gun parts | Gun parts, wood, metal | 9 × 8               | 40                       | Strongest up close                                                  |
| Bolt-action rifle  | Offensive            | Valued 320  | 128  | —                                     | 300 shots                    | Gun oil, gun parts | Gun parts ×2, wood     | 70                  | 45                       | Passes through every creature in a line (`firearm.pierce`)          |
| Derringer          | Offensive, quick use | Gloaming 90 | 36   | —                                     | 150 shots                    | Gun oil            | Gun parts              | 28                  | 30                       | Fires while crawling, in a squeeze or downed; takes revolver rounds |
| Crossbow           | Offensive            | —           | 20   | Workshop: wood ×3, metal ×2, twine ×3 | 120 shots, then the string   | Twine ×2, wood     | Wood ×2, metal, twine  | 55                  | 0                        | Silent: no `hear()`, nothing on the noise meter (`silent`)          |
| Slingshot          | Offensive            | —           | 2    | Workshop: wood, rubber, leather       | 80 shots                     | Rubber             | Wood, rubber           | 6                   | 0; lands 8               | A lure at range (to 25 m); fires pebbles or old coins               |
| Oil bottle         | Offensive, quick use | —           | 2    | Field: glass bottle, lamp oil, rags   | One use                      | —                  | —                      | 15/s for 5 s (fire) | Shatter 6; fire 4 each s | Burns an area: webs, rats, moths; lights it while it burns          |
| Revolver rounds ×6 | Backpack             | Start 12    | 4    | —                                     | —                            | —                  | —                      | —                   | —                        | Also fit the derringer                                              |
| Shotgun shells ×4  | Backpack             | Trusted 16  | 6    | —                                     | —                            | —                  | —                      | —                   | —                        |                                                                     |
| Rifle rounds ×5    | Backpack             | Valued 25   | 10   | —                                     | —                            | —                  | —                      | —                   | —                        |                                                                     |
| Crossbow bolts ×3  | Backpack             | —           | 1    | Field: wood, nails ×2 (makes 3)       | 30% chance to break on a hit | —                  | —                      | —                   | Lands 2                  | Pick them back up                                                   |
| Pebbles            | Backpack             | —           | 0    | Found by rubble                       | —                            | —                  | —                      | —                   | —                        | Slingshot ammo                                                      |

### Ranged drawbacks

The revolver and shotgun keep their current numbers.

| Weapon            | Spread hip / aimed (rad) | Between shots            | Load | Reload                         | Range / falloff | Drawback                                                                  |
| ----------------- | ------------------------ | ------------------------ | ---- | ------------------------------ | --------------- | ------------------------------------------------------------------------- |
| Revolver          | 0.035 / 0.006            | 0.5 s                    | 6    | 2.5 s                          | 40 m / 25%      | Moderate recoil                                                           |
| Shotgun           | 0.10 / 0.065             | 1.0 s                    | 2    | 3.0 s                          | 18 m / 60%      | Heavy recoil; useless past 18 m; 3.2 kg                                   |
| Bolt-action rifle | 0.08 / 0.002             | 1.6 s (working the bolt) | 5    | 0.7 s per round, one at a time | 60 m / 10%      | Barely hits from the hip; slow to aim; walk speed while aiming; hard kick |
| Derringer         | 0.05 / 0.03              | 0.4 s                    | 2    | 3.0 s                          | 10 m / 70%      | Poor sights; weak past arm's length                                       |
| Crossbow          | 0.04 / 0.004             | —                        | 1    | 2.5 s, slowed to a crawl       | 35 m / 0%       | The bolt drops and takes time to arrive                                   |
| Slingshot         | 0.06 / 0.03              | 0.6 s draw               | 1    | 1.0 s                          | 25 m, arcs      | Too weak to kill                                                          |
| Oil bottle        | Thrown, arcs             | —                        | —    | 1.5 s to light the rag         | ~12 m           | The lit rag gives you away; splashes you if it lands within 2 m           |
| Throwing knives   | Thrown                   | 0.5 s draw               | 3    | —                              | ~15 m           | Low damage; pick them back up                                             |

## Defensive and gear

| Item               | Type      | Store       | Sell | Craft                           | Wear                            | Repair            | Salvage             | Protection | Noise                 | Special                                                                                            |
| ------------------ | --------- | ----------- | ---- | ------------------------------- | ------------------------------- | ----------------- | ------------------- | ---------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| Padded coat        | Defensive | Start 90    | 36   | Workshop: rags ×6, twine ×2     | 40 shield points                | Rags ×2, twine    | Rags ×3, twine      | 40         | —                     | Breaks instead of tearing apart                                                                    |
| Leather jerkin     | Defensive | Valued 160  | 64   | Workshop: leather ×6, twine ×3  | 70 shield points                | Leather ×2, twine | Leather ×3, twine   | 70         | —                     | About 5% slower sprinting                                                                          |
| Field crafting kit | Gear      | Start 35    | 14   | Workshop: leather, twine, metal | 20 crafts                       | Leather           | Leather, metal      | —          | Crafting 4 every 2 s  | Lets you craft below; field repair restores 30% of one item (one craft's wear)                     |
| Kneepads           | Gear      | Gloaming 40 | 16   | Workshop: leather ×2, twine     | 10 min of crawling              | Leather           | Leather             | —          | Crawling quieter      | Crawl 25% faster and quieter                                                                       |
| Felt overshoes     | Gear      | Gloaming 35 | 14   | Workshop: rags ×3, twine        | 30 min of walking               | Rags ×2           | Rags ×2             | —          | Footsteps 40% quieter | —                                                                                                  |
| Gloves (new)       | Gear      | Gloaming 30 | 12   | Workshop: leather ×2, twine     | 40 searches of nests or cocoons | Leather           | Leather             | —          | —                     | No bites or poison from rat nests and cocoons; climb ropes 15% faster                              |
| Pocket compass     | Gear      | Trusted 55  | 22   | —                               | —                               | —                 | Metal, glass bottle | —          | —                     | A bearing on the HUD to the nearest extraction point, or the rite room once the last clue is found |

## Quick use and backpack

| Item                | Type      | Store               | Sell | Craft                        | Wear                    | Repair            | Salvage                       | Noise                        | Effect                                                                           |
| ------------------- | --------- | ------------------- | ---- | ---------------------------- | ----------------------- | ----------------- | ----------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| Bandage             | Quick use | Start 15            | 6    | Field: rags ×2               | One use                 | —                 | —                             | —                            | +25 sanity over 3 s                                                              |
| Medkit              | Quick use | Trusted 60 (was 50) | 24   | —                            | One use                 | —                 | —                             | —                            | Full sanity over 5 s; kneel to use                                               |
| Smelling salts      | Quick use | Start 40            | 16   | —                            | One use                 | —                 | —                             | —                            | Revive; automatic when solo                                                      |
| Laudanum            | Quick use | Gloaming 45         | 18   | —                            | One use                 | —                 | —                             | —                            | No sanity loss from darkness or seeing creatures for 60 s; aim sways, 10% slower |
| Battery             | Quick use | Start 20            | 8    | —                            | One use                 | —                 | —                             | —                            | +12 V                                                                            |
| Glow sticks ×3      | Quick use | Start 15            | 6    | —                            | Fade after 3 min        | —                 | —                             | Lands 2                      | Throwable light; counts toward the light budget; moths gather on it              |
| Chalk               | Quick use | Start 5             | 2    | —                            | One mark                | —                 | —                             | —                            |                                                                                  |
| Rope pack (100 m)   | Quick use | Start 50            | 20   | —                            | By the metre            | —                 | Rope lengths (1 per 5 m left) | Tying 3                      |                                                                                  |
| Rope bundle (40 m)  | Quick use | —                   | 15   | Workshop: rope lengths ×8    | By the metre            | —                 | Rope lengths (1 per 5 m left) | Tying 3                      |                                                                                  |
| Climbing pitons ×3  | Quick use | Gloaming 20         | 8    | Field: metal ×2 (makes 3)    | One use each            | —                 | —                             | Hammering in 8               | A rope anchor anywhere (see the rappel rooms)                                    |
| Lockpicks           | Quick use | Trusted 30          | 12   | Workshop: metal, nails ×2    | 25% to snap per lock    | —                 | Metal                         | 0                            | Opens trunks, offering boxes and the mausoleum gate silently in 6 s              |
| Snare               | Quick use | —                   | 2    | Field: rope length, metal    | One use                 | —                 | Rope length                   | Springs 6                    | Holds the first creature through it for 4 s                                      |
| Tripwire bell       | Quick use | —                   | 1    | Field: twine ×2, nails ×2    | Reset 3 times           | Twine             | Twine, nails                  | Rings 12                     | The party hears when something crosses (so do creatures)                         |
| Blessed salt        | Quick use | —                   | 4    | Field: rock salt, holy water | One line                | —                 | —                             | —                            | Creatures won't cross the line for 30 s                                          |
| Firecrackers        | Quick use | Trusted 20          | 8    | —                            | One use                 | —                 | —                             | 20, after a 4 s fuse         | A lure on a fuse (`throwable.fuse`)                                              |
| Bait                | Quick use | Start 8             | 0    | —                            | Rots after one run      | —                 | —                             | Lands 2                      | Rats swarm it instead of you                                                     |
| Grave dirt          | Quick use | —                   | 10   | Found in crypts              | One use                 | —                 | —                             | —                            | Creatures chasing you lose track of you for 8 s                                  |
| Incense censer      | Quick use | Valued 70           | 28   | —                            | 3 min of smoke per fill | Lamp oil per fill | Metal ×2                      | Fills the noise meter slowly | Keeps moths, rats and spiders away while held                                    |
| Whistle             | Quick use | Start 10            | 4    | —                            | —                       | —                 | Metal                         | 25                           | Pings your position to the party, and to creatures in range                      |
| Surveyor's notebook | Backpack  | Start 35            | 14   | —                            | —                       | —                 | —                             | —                            | The map                                                                          |
| Candle              | Backpack  | Start 4             | 1    | Field: wax ×2, twine         | Burns down              | —                 | Wax                           | —                            | Rite supply; a lit candle is a placed light                                      |

**Glow sticks and the light budget:** a lit glow stick is a dynamic light and counts toward `LIGHT_BUDGET` (`src/lib/game/Engine.ts`, 8 today), like candles and headlamps. To make room for them, the budget goes up when glow sticks land: to 12 (Proposed, tuned in play), with the same nearest-first culling.

## Rite and quest items

| Item                  | Type     | Store | Sell | Special                                                                  |
| --------------------- | -------- | ----- | ---- | ------------------------------------------------------------------------ |
| The Pendant           | Backpack | —     | —    | Rite item; can't be sold                                                 |
| Iron key              | Backpack | —     | 15   | Opens one locked trunk                                                   |
| Scrap of writing      | —        | —     | —    | Rite clue; can't be carried                                              |
| Recipe fragment (new) | —        | —     | —    | Read where found: discovers one ingredient you haven't seen; not carried |

## Treasure

Treasure sells for its value and doesn't salvage. Today's treasure keeps its ids: old coins `coins`, bone rosary `rosary`, gold tooth `tooth`, signet ring `signet`, silver candlestick `candlestick`, chalice `chalice`, reliquary `relic`. The rest is new.

| Item                    | Rarity    | Sell          | Special                                                            |
| ----------------------- | --------- | ------------- | ------------------------------------------------------------------ |
| Old coins               | Common    | 3             | Slingshot ammo                                                     |
| Bone rosary             | Common    | 12            |                                                                    |
| Gold tooth              | Uncommon  | 30            |                                                                    |
| Signet ring             | Uncommon  | 45            |                                                                    |
| Silver snuffbox         | Uncommon  | 55            |                                                                    |
| Jet rosary              | Uncommon  | 60            |                                                                    |
| Silver candlestick      | Rare      | 110           |                                                                    |
| Cameo brooch            | Rare      | 120           |                                                                    |
| Funeral coin (obol)     | Rare      | 120           | Or leave it at a shrine to protect a second item                   |
| Apothecary jar          | Rare      | 130           | Fragile: breaks on a hard fall                                     |
| Military medal          | Rare      | 140           |                                                                    |
| Tarot deck              | Rare      | 150           | Or draw a card for a small blessing or curse at the start of a run |
| Uncut garnet            | Rare      | 160           |                                                                    |
| Black candle            | Epic      | 280           | Or let it count as all five rite candles                           |
| Chalice                 | Epic      | 300 (was 260) |                                                                    |
| Custodian's key ring    | Epic      | 300           | Or use it once to open any trunk                                   |
| Painted saint's icon    | Epic      | 320           |                                                                    |
| Ossuary keeper's ledger | Epic      | 360           |                                                                    |
| Brass astrolabe         | Epic      | 420           |                                                                    |
| Porcelain doll          | Epic      | 450           | Cursed: phantom sounds and 0.5 sanity/s lost while carried         |
| Reliquary               | Legendary | 800 (was 600) |                                                                    |
| Bishop's crozier head   | Legendary | 900           | Heavy (4 kg)                                                       |
| Sealed reliquary jar    | Legendary | 1,000         | Fragile: breaks on a hard fall                                     |

## Rarity, weight and stack (Proposed)

Every item needs a rarity (which of a lootable's picks it competes for), a weight (toward `CARRY`: 12 kg comfortable, 30 kg most) and a stack size. Existing items keep what they have in `ITEMS` today. Treasure rarities are in its table. Weapons, defense and gear never stack.

| Item                             | Rarity   | Weight (kg) | Stack |
| -------------------------------- | -------- | ----------- | ----- |
| Rags, twine, wax scraps          | Common   | 0.05        | 10    |
| Nails                            | Common   | 0.005       | 40    |
| Wood                             | Common   | 0.4         | 5     |
| Metal scraps                     | Common   | 0.3         | 10    |
| Leather scraps                   | Common   | 0.1         | 10    |
| Rubber                           | Uncommon | 0.1         | 10    |
| Rope length                      | Common   | 0.2         | 8     |
| Glass bottle                     | Common   | 0.3         | 3     |
| Lamp oil                         | Uncommon | 0.4         | 3     |
| Rock salt                        | Uncommon | 0.2         | 5     |
| Holy water                       | Uncommon | 0.4         | 3     |
| Bone                             | Common   | 0.2         | 10    |
| Gun oil                          | Uncommon | 0.1         | 5     |
| Gun parts                        | Rare     | 0.3         | 5     |
| Hatchet                          | Uncommon | 0.9         | 1     |
| Trench spade                     | Uncommon | 1.8         | 1     |
| Short spear                      | Uncommon | 1.5         | 1     |
| Nail-studded club                | Common   | 1.2         | 1     |
| Pickaxe                          | Rare     | 3.5         | 1     |
| Sledgehammer                     | Rare     | 6           | 1     |
| Throwing knives                  | Uncommon | 0.15        | 6     |
| Bolt-action rifle                | Epic     | 4           | 1     |
| Derringer                        | Rare     | 0.4         | 1     |
| Crossbow                         | Rare     | 3           | 1     |
| Slingshot                        | Common   | 0.2         | 1     |
| Oil bottle                       | Uncommon | 0.6         | 3     |
| Rifle rounds                     | Rare     | 0.025       | 20    |
| Crossbow bolts                   | Uncommon | 0.05        | 12    |
| Pebbles                          | Common   | 0.02        | 20    |
| Leather jerkin                   | Rare     | 3.5         | 1     |
| Field crafting kit               | Uncommon | 1.2         | 1     |
| Kneepads, felt overshoes, gloves | Uncommon | 0.4         | 1     |
| Pocket compass                   | Rare     | 0.15        | 1     |
| Laudanum                         | Rare     | 0.15        | 3     |
| Glow sticks                      | Common   | 0.05        | 6     |
| Climbing pitons                  | Uncommon | 0.2         | 6     |
| Lockpicks                        | Uncommon | 0.05        | 5     |
| Snare                            | Common   | 0.3         | 3     |
| Tripwire bell                    | Common   | 0.2         | 2     |
| Blessed salt                     | Uncommon | 0.3         | 3     |
| Firecrackers                     | Common   | 0.1         | 5     |
| Bait                             | Common   | 0.2         | 3     |
| Grave dirt                       | Rare     | 0.3         | 3     |
| Incense censer                   | Rare     | 1.5         | 1     |
| Whistle                          | Common   | 0.05        | 1     |
| Treasure (new), each             | Its own  | 0.02 to 1   | 1–10  |
| Bishop's crozier head            | —        | 4           | 1     |

## Lootables

Today there are three: **crates** (some jammed and needing a crowbar), **corpses** (a third of the crate spots) and **locked trunks** (level 3). The corpse is the Dead explorer below. Each new lootable has a home, a theme for what's inside, a way to open it, a noise and a catch. The **prompt** and **flavor** lines are what the game shows (pick at random when there are several).

| Lootable                        | Where                                                   | Holds                                                                         | To open                                   | Noise                       | Catch                                            |
| ------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------- | --------------------------- | ------------------------------------------------ |
| Crate (existing)                | Anywhere; the fallback                                  | A mix of everything                                                           | Hold 1 s; jammed ones need a crowbar      | 6; each item 4; pry 10      | —                                                |
| Dead explorer (existing corpse) | Anywhere; more often deep, by drops and water           | Ammo, batteries, bandages, rope lengths, gun parts, leather, recipe fragments | Search 2 s                                | 3; each item 3              | The main source of ammo, gun parts and fragments |
| Locked trunk (existing)         | Level 3 deep rooms, mausoleums, the chapel's side halls | Rare to legendary                                                             | Key, lockpicks or sledgehammer            | Unlock 3; picks 0; smash 16 | —                                                |
| Wall niche                      | Halls, Ossuary Hall, Burial Gallery                     | Bone, wax, old coins, bone rosaries                                           | Search 1 s; sealed ones need a crowbar    | 2; sealed pry 8             | Sealed ones hold better burial goods             |
| Bone pile                       | Ossuary Hall, Charnel Vault, dead ends                  | Bone, teeth, coins, grave dirt                                                | Rummage 3 s                               | 10                          | Can set off a rat swarm                          |
| Sarcophagus                     | Crypts, mausoleums, the chapel's side halls             | Rings, candlesticks, rare to epic burial goods, wood                          | Crowbar, or two players on the lid, 6 s   | 12                          | Sometimes a spider egg sac                       |
| Quarrymen's tool chest          | Quarry Gallery, Quarrymen's Lodge, rubble halls         | Metal, wood, nails, lamp oil, rock salt, twine; rarely a pickaxe              | Pry open 3 s                              | 8                           | The material motherlode; heavy                   |
| Workman's locker                | The Angel's Well, the Shaft, Pump Room                  | Rags, twine, rubber, rope lengths, batteries, glow sticks, chalk              | Quick                                     | 4 (metal door)              | Low value, always useful                         |
| Sunken satchel                  | Cistern, flooded halls, Drowned Chapel, Pump Room       | Coins, jewelry, glass bottles, small finds                                    | Dive and search 2 s                       | 1                           | You're swimming while you search                 |
| Offering box                    | Chapels, the Vestry, shrines                            | Coins, funeral coins, signet rings                                            | Lockpicks, or smash it                    | Picks 0; smash 10           | Small but reliable value                         |
| Vestry cabinet                  | The Vestry, the chapel's side halls                     | Candles, wax, holy water, black candle, chalice                               | Quick                                     | 3                           | Where rite supplies are reliable                 |
| Font                            | The Vestry, Gloaming Chapel, Drowned Chapel             | Holy water                                                                    | Fill a glass bottle, 2 s                  | 1                           | Needs a glass bottle; a few fills each           |
| Rat nest                        | Crawls, dead ends, Rat Warren, Charnel Vault            | Coins, gold teeth, rings                                                      | Reach in 4 s                              | 6 (squealing)               | Rats bite, unless you wear gloves                |
| Webbed cocoon                   | Spider areas, crawls, Webbed Gallery                    | A wrapped explorer's gear, leather, gun parts                                 | Cut open 5 s; 2 s with a knife or hatchet | 3                           | Poison, unless you wear gloves; spiders nearby   |
| Smuggler's stash                | Behind a loose brick, marked in old chalk               | Ammo, laudanum, gun oil, glass bottles, coin                                  | Crowbar 3 s                               | 8                           | Hidden; you have to notice the chalk sign        |
| Surveyor's cache                | Dead ends on the Surveyor's routes, Survey Station      | Recipe fragments, chalk, a compass, map sketches                              | Quick                                     | 2                           | Found by following him or reading his marks      |
| Reliquary alcove                | Gloaming Chapel, Saints' Crypt                          | One legendary relic                                                           | Crowbar, 8 s                              | 6                           | Opening it adds to the Affliction meter          |

### Lootable prompts and flavor

| Lootable               | Prompt                    | Flavor (shown when opened, or on the Library entry)                                                                         |
| ---------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Wall niche             | [E] Search the niche      | "Someone was laid here with what they couldn't bear to leave." / "The slab is cracked. Something glints behind it."         |
| Bone pile              | [E] Rummage               | "Femurs, skulls, the small bones of hands. Not all of it is old." / "It shifts as you touch it, and keeps shifting after."  |
| Sarcophagus            | [E] Push the lid          | "The name has been chiselled off." / "Stone grinds on stone. Whatever is inside has waited a long time."                    |
| Dead explorer          | [E] Search the body       | "Their lamp is still on their head, cold." / "They were heading out. They didn't get far."                                  |
| Quarrymen's tool chest | [E] Pry it open           | "Stamped with a company name that went under a hundred years ago." / "Picks, wedges, and a lunch tin nobody came back for." |
| Workman's locker       | [E] Open the locker       | "A calendar inside the door, stopped on a month long gone." / "Somebody kept this one tidy, right to the end."              |
| Sunken satchel         | [E] Search the satchel    | "Swollen leather, heavy with water and whatever it held."                                                                   |
| Offering box           | [E] Pick the lock / smash | "For the souls below. The slot is worn smooth by fingers."                                                                  |
| Vestry cabinet         | [E] Open the cabinet      | "Candles in neat rows, and a smell of wax and damp."                                                                        |
| Font                   | [E] Fill a bottle         | "The water is perfectly still, and colder than it should be."                                                               |
| Rat nest               | [E] Reach in              | "Shredded cloth, bones gnawed white, and something that shines."                                                            |
| Webbed cocoon          | [E] Cut it open           | "Wrapped tight, head to foot. The shape inside is a person."                                                                |
| Smuggler's stash       | [E] Pry the brick loose   | "A chalk mark only a smuggler would know. The brick moves."                                                                 |
| Surveyor's cache       | [E] Open the satchel      | "Maps on maps, each one a little different from the last."                                                                  |
| Reliquary alcove       | [E] Pry open the alcove   | "Behind the grille, a saint's hand in silver. The air goes cold when you touch it."                                         |

### Reworking how loot spawns (Decided)

Today: about 30 crates a map (10 per level), a third of them corpses, trunks in place of some level 3 crates, a little loose loot, rarity counts per crate (`CRATE_RARITY`) and rarities allowed per level (`LEVEL_LOOT`).

The rework:

1. **Lootable types are data** (`src/lib/content/lootables.ts`): model, size, open time, tool needed, noise, catch, prompt and flavor lines, its own loot table and its own rarity counts.
2. **Pieces say where lootables go**, with `lootable-<type>-<n>` markers in Blender (as `crate-<n>` works today). A room's markers decide what kind of loot it has: that's how room type restricts loot.
3. **Generic `crate-<n>` spots stay** as the fallback, filled from the mixed table.
4. **Depth is per lootable.** The global `LEVEL_LOOT` and `CRATE_RARITY` go. Each lootable type has its own rarity counts **for each level** (fewest, most and chance, as `CRATE_RARITY` is today), and its table slides from shallow to deep as `CRATE_LOOT` does. The placements in this doc are the rules:
   - A sarcophagus on level 2 can hold rare and epic burial goods.
   - An offering box can hold a funeral coin (rare) on any level.
   - The Family Mausoleum's locked trunk stands on level 2 or 3: trunks are no longer level 3 only (`TRUNKS.tier` goes).
   - Crates, the fallback, keep today's spread: common and uncommon on levels 1–2, everything on level 3.
5. **A value budget per level** keeps maps balanced: more lootables doesn't mean more treasure. Each level aims for a total treasure value and spreads it across its lootables. The budget is the cap the per-lootable rarities fill up to.
6. **Quest items keep their rules:** one key per trunk **and one per locked gate** (the Family Mausoleum), in crates or lockers that aren't locked or jammed; rite items as today.
7. **Restriction rules, together:** by room type (the markers), by depth, by tool (crowbar, blade, lockpicks, sledgehammer), by cost (noise, time, danger), by clue (smuggler chalk, the Surveyor), and by item type (gun parts and fragments from corpses and cocoons; materials from chests, lockers and piles; treasure from tombs, boxes and trunks).

## Rooms

### Levels

A map has three levels. Today the generator places connector rooms on any level, and shares the major rooms out evenly between the levels at random. To say which levels a room appears on, kit entries get a **`levels`** field (for example `levels: [2, 3]`), counted from 1 as players see them. Rooms with no `levels` can appear on any level. (Today no room is restricted.)

### Existing pieces

| Piece (`MAP_KIT`)                 | Levels                        | Lootables                                                                                                 |
| --------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| The Angel's Well (`angel-well`)   | 1 (start)                     | One workman's locker at the foot of the pit                                                               |
| Ossuary Hall                      | Any: one major room per level | Bone piles, wall niches, a rat nest                                                                       |
| Quarry Gallery                    | Any: one major room per level | Quarrymen's tool chests, a dead explorer                                                                  |
| The Cistern                       | Any: one major room per level | Sunken satchels, a dead explorer on the walkway                                                           |
| Gloaming Chapel                   | 3 (last)                      | Vestry cabinets, a font and a locked trunk (side halls), offering boxes, sarcophagi, the reliquary alcove |
| The Shaft (`extraction-gate`)     | 1–2 (ends each)               | Workman's lockers                                                                                         |
| The Long Stair (`stairs-deep`)    | Between 1–2 and 2–3           | A dead explorer partway down                                                                              |
| `room-small`                      | Any                           | Wall niches, an offering box                                                                              |
| `room-crypt`                      | 2–3 (today: any)              | Sarcophagi, sealed niches, sometimes a locked trunk on level 3                                            |
| Charnel Vault (`room-vault`)      | Any                           | Bone piles, a rat nest, webbed cocoons high up                                                            |
| Burial Gallery (`room-gallery`)   | Any                           | Rows of wall niches, a sarcophagus at the end                                                             |
| `hall-side-room`                  | Any                           | Wall niches, a smuggler's stash                                                                           |
| `hall-crawl`, `hall-squeeze-long` | Any                           | A rat nest, a webbed cocoon, a dead explorer stuck partway                                                |
| `hall-canal`, `hall-flooded`      | Any                           | Sunken satchels                                                                                           |
| `hall-ledge`                      | Any                           | A dead explorer or tool chest up on the ledge                                                             |
| The Drop, The Pit                 | Any                           | A dead explorer at the bottom with good gear                                                              |
| `hall-dead-end`                   | Any                           | A smuggler's stash, rubble (bricks, pebbles), a Surveyor's cache                                          |

### New rooms (Decided: all of them)

The Gloaming Chapel stays the only Affliction-specific room; every new room appears in any Affliction's maps (Rumors has its own small map). The **banner** line is the subtitle under the room's name.

| New room          | Kind                  | Levels | Lootables                                                    | Banner                                      | Description                                                              |
| ----------------- | --------------------- | ------ | ------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------ |
| The Vestry        | Connector room        | 1–3    | Vestry cabinets, a font, an offering box                     | "Where the priests made ready"              | A small sacristy, robes on hooks, candle stores                          |
| Quarrymen's Lodge | Connector room        | 1–2    | Tool chests, workman's lockers                               | "The shift never ended"                     | Benches, a cold stove, picks on the wall                                 |
| Smugglers' Cellar | Connector room        | 1–2    | Smuggler's stashes, a dead explorer                          | "Nobody came down here to pray"             | An old wine cellar used for contraband                                   |
| The Pump Room     | Connector room        | 1–2    | Workman's lockers, sunken satchels                           | "The water won"                             | Old waterworks, rusted pumps, half-flooded                               |
| Rat Warren        | Crawl variant         | 1–2    | Rat nests                                                    | —                                           | Low tunnels chewed into soft rock                                        |
| Explorers' Camp   | Connector room        | 1–3    | Dead explorers, a workman's locker                           | "They meant to come back for it"            | An abandoned camp: cold fire, bedrolls, gear left behind                 |
| Survey Station    | Dead-end variant      | 1–3    | A Surveyor's cache                                           | "Every map down here is wrong"              | The old mapping crews' table and pinned maps; the Surveyor's haunt       |
| Rockfall          | Dead-end variant      | 1–3    | Rubble, a smuggler's stash, a dead explorer under the stones | —                                           | A collapsed passage; the pickaxe opens a way through                     |
| Family Mausoleum  | Connector room        | 2–3    | Sarcophagi, a locked trunk                                   | "A family that wanted to stay together"     | An iron-gated vault; a key or lockpicks open the gate                    |
| Webbed Gallery    | Connector room        | 2–3    | Webbed cocoons, a dead explorer                              | "Something else keeps its dead here"        | A burial gallery taken over by spiders                                   |
| Plague Pit        | Connector room        | 2–3    | Bone piles, grave dirt, rock salt                            | "They ran out of names"                     | A mass grave under a lime-washed vault; searching drains a little sanity |
| Drowned Chapel    | Connector room, water | 2–3    | Sunken satchels, an underwater offering box, a font          | "Mass is still being said, somewhere below" | A small chapel flooded to the pews                                       |
| Saints' Crypt     | Connector room, rare  | 3      | A reliquary alcove                                           | "Holier than it is safe"                    | A second legendary spot outside the Gloaming Chapel                      |

### Rappel rooms (Decided)

The Drop and the Pit already need a rope tied at an anchor at the top. These need **climbing pitons** to make the anchor, since there isn't one. Like the Drop, they go down but stay on the level they hang from (the long stair stays the only way between levels), and they're never on the main route.

| New room       | Kind                         | Levels | Banner                         | Description                                                                                  |
| -------------- | ---------------------------- | ------ | ------------------------------ | -------------------------------------------------------------------------------------------- |
| The Sinkhole   | Connector, descends          | 1–3    | "The floor gave way here"      | A collapsed floor, 10 m down, with a dead explorer at the bottom                             |
| Broken Stair   | Connector, descends          | 1–3    | "Half a stair is no stair"     | A stair that ends in air halfway down; 6 m to the landing below                              |
| Sunken Ossuary | Off-route room, below a hall | 2–3    | "Sealed off, and for a reason" | A bone chamber under a grate, only reached by rappelling; niches and a sarcophagus untouched |

## New mechanics this needs

Each is built in the phase listed under Phases.

- **Items:** the Gear slot (3) and Material type; durability on every item (in uses or seconds); the broken state; tooltip durability; the right-click menu; the Inspect panel; a base price on every item; the `crafted` mark and its sell rule.
- **Hub:** the Workshop (repair, craft, salvage); the Library; store tiers (trust per account); Afflictions that unlock (Rumors before the Gloaming, for every account).
- **Crafting:** discovery from lootables (fonts included); recipes and recipe fragments; field crafting (kneel, time, light, noise); the discovery alert and the new-item effect.
- **Combat:**
  - stamina per swing
  - sweeps (`melee.sweep`)
  - piercing shots (`firearm.pierce`)
  - silent fire (`silent`)
  - slow projectiles for the crossbow and slingshot
  - the throw landing preview
  - bleeding (`STATUSES`)
  - snares (hold a creature)
  - fused lures (`throwable.fuse`)
  - fire areas
  - salt lines creatures won't cross
  - weapons that work while crawling, in a squeeze or downed (spear, derringer: today `stepWeapon` blocks all item use in those states)
  - no sprinting with a weapon in hand (sledgehammer)
  - the club's snag
- **Items with their own behaviour:**
  - laudanum (no sanity loss, aim sway, slower)
  - the censer (keeps critters away while held, fills the noise meter)
  - the whistle (pings your position to the party and creatures)
  - grave dirt (pursuers lose track)
  - bait (rats go to it)
  - the tripwire bell (alerts the party when something crosses)
  - the pocket compass (a bearing on the HUD)
  - glow sticks (thrown lights that fade, in the light budget)
  - gloves and kneepads (their effects on nests, cocoons, ropes and crawling)
- **Treasure with a use:**
  - the cursed porcelain doll
  - the tarot draw at the start of a run
  - the black candle counting as all five rite candles
  - the custodian's key ring
  - the funeral coin's shrine use (waits for shrines, #16; until then it's treasure only)
- **World:**
  - spider webs (block a passage until cut or burned)
  - breakable rubble
  - pitons as anchors anywhere
  - smuggler chalk signs
  - fragile loot (breaks on a hard fall, and to the sledgehammer's 25%)
  - the alcove's meter cost
  - fonts
  - gated rooms (the mausoleum gate: key or lockpicks)
- **Loot:** lootable types; `lootable-*` markers; per-lootable tables and rarities per level (replacing `LEVEL_LOOT`, `CRATE_RARITY` and `TRUNKS.tier`); the value budget per level; keys for gates.
- **Rumors:** its map, the tutorial steps, training dummies, and the Gloaming unlocking after it.
- **Map:** a `levels` field on kit entries, honoured by the generator; the level on room banners.
- **Lighting:** `LIGHT_BUDGET` raised for glow sticks.

## Phases (Decided)

Foundations first, with a placeholder for every asset, so art can be made alongside everything else. Loot and rooms come next, because the room pieces are the longest art and they need their lootable markers settled early. Then the mechanics, then every item at once on top of mechanics that already work. The Workshop, crafting and the store come after, and Rumors last.

### Phase 1: item foundations and placeholders (Done)

Built, and moved into `docs/dev/`: [items.md](dev/items.md) (gear slots, materials, [durability](dev/items.md#durability), [Inspect](dev/items.md#inspect)), [economy.md](dev/economy.md#money-and-the-shop) (prices on the items, worn things selling for less) and [admin.md](dev/admin.md#art-and-assets) (planned art, in `src/lib/content/planned.ts`). Wear comes from shots, hits and blows for now; gear by the second and things by the use come with the items that need them (Phase 6), and Repair in the menu with the Workshop (Phase 7). The new items aren't defined yet: their art is listed as planned, and they are added with their behaviour in Phase 6.

- **Item types:** Gear (the 3-item gear slot) and Material (backpack only, never quick use).
- **Durability:** wear per stack, in uses or seconds; the broken state (broken icon and red shade on the slot, equipped but inert; armour breaks instead of tearing apart).
- **Base price** on every item (`ItemDef.price`); `sellPrice` reads the item, not `SHOP`.
- **UI:** tooltip durability, the right-click menu (Inspect; Repair appears once the Workshop exists), the Inspect panel.
- **Placeholders:** every asset in the art list below named in the content data with a placeholder, so all of it appears on the Art & Assets page. Items can be defined as data with placeholder art here, without their behaviour.

### Phase 2: lootables and loot spawning

Lootable types as data, `lootable-*` markers (in the existing pieces first), per-lootable tables, rarities per level and flavor text, the value budget per level, and keys for trunks and gates.

### Phase 3: rooms

The `levels` field in the generator, the level on room banners, then the 13 new rooms and 3 rappel rooms with their levels, lootable markers and banners. A room whose mechanic isn't built yet (webs, rubble, pitons, the mausoleum gate) is placed with that part open until Phase 5.

### Phase 4: combat mechanics

Every Combat entry under New mechanics.

### Phase 5: world mechanics

Every World entry under New mechanics.

### Phase 6: all items

Every item in this doc in one pass: data, behaviour on the mechanics from Phases 4 and 5, the items and treasure with their own behaviour, store entries, loot table entries, Inspect stats and help topics. Price and value changes to existing items go in here too, and the light budget goes up with glow sticks.

### Phase 7: Workshop, crafting and store

- **Discovery** from lootables, the **Library** page, the discovery alert and new-item effect.
- **Recipes** and recipe fragments.
- **The Workshop:** repair (and Repair in the right-click menu), crafting, salvage, and the `crafted` sell rule.
- **Field crafting** with the kit, and its animation.
- **Store tiers** with trust per account.

### Phase 8: Rumors

The tutorial Affliction, its map and dummies, its tutorial steps (which use discovery and field crafting from Phase 7), and the Gloaming unlocking after it for every account.

## Art assets

Art isn't a phase: it runs alongside. Phase 1 registers every asset below by name with a placeholder, so each one shows on the admin **Art & Assets** page (`/assets`) as **Placeholder** (a box for a model, a held pose for a clip) or **Missing**. Real files replace them whenever they're ready, in any order. **Needed by** is the first phase that uses the asset: start with the lowest. Paths follow `docs/dev/asset-pipeline.md`:

- images: `art/images/<name>.png`
- item models: `art/export/items/<id>.glb`
- props: `art/export/props/`
- explorer clips: `explorer-clips.glb`
- sounds: `art/sfx/<name>.wav`

### Item images

Every item shown in a slot: stash, loadout, store, Workshop, Library and pack. Square, like the existing ones (`knife`, `revolver`, `padded_coat`).

| Group             | Images                                                                                                                                                                                                                                                                             | Needed by |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| UI                | Broken icon (overlay), gear slot icon, material stash filter icon                                                                                                                                                                                                                  | 1         |
| Materials (16)    | Rags, twine, wax scraps, nails, wood, metal scraps, leather scraps, rubber, rope length, glass bottle, lamp oil, rock salt, holy water, bone, gun oil, gun parts                                                                                                                   | 2         |
| Melee (7)         | Hatchet, trench spade, short spear, nail-studded club, pickaxe, sledgehammer, throwing knives                                                                                                                                                                                      | 6         |
| Ranged (8)        | Bolt-action rifle, derringer, crossbow, slingshot, oil bottle, rifle rounds, crossbow bolts, pebbles                                                                                                                                                                               | 6         |
| Defense, gear (6) | Leather jerkin, field crafting kit, kneepads, felt overshoes, gloves, pocket compass                                                                                                                                                                                               | 6         |
| Quick use (13)    | Laudanum, glow sticks, climbing pitons, lockpicks, snare, tripwire bell, blessed salt, firecrackers, bait, grave dirt, incense censer, whistle; recipe fragment (shown in the Library)                                                                                             | 6         |
| Treasure (16)     | Silver snuffbox, jet rosary, cameo brooch, funeral coin, apothecary jar, military medal, tarot deck, uncut garnet, black candle, custodian's key ring, painted saint's icon, ossuary keeper's ledger, brass astrolabe, porcelain doll, bishop's crozier head, sealed reliquary jar | 2         |
| Library           | A silhouette for each craftable product (can be generated from its image)                                                                                                                                                                                                          | 7         |

### Item models (in the hand and on the floor)

Every item that can be held or dropped. Materials and treasure can stay placeholder boxes on the floor (the existing treasure has no models either: candle, padded coat, coins, rosary, tooth, signet, candlestick, chalice, relic).

| Model                                                                                              | Held pose     | Needed by    |
| -------------------------------------------------------------------------------------------------- | ------------- | ------------ |
| Hatchet, nail-studded club, throwing knife, derringer, slingshot                                   | One hand      | 4            |
| Trench spade, short spear, pickaxe, sledgehammer, bolt-action rifle, crossbow                      | Two hands     | 4            |
| Crossbow bolt, oil bottle (with a rag), firecrackers, glow stick                                   | Thrown / item | 4            |
| Snare, tripwire bell, blessed salt bag, bait                                                       | Item          | 4            |
| Climbing piton                                                                                     | Item          | 5            |
| Lockpicks, incense censer, whistle, laudanum bottle, grave dirt pouch, pocket compass              | Item          | 6            |
| Field crafting kit (closed, and open on the floor while crafting)                                  | Item          | 7            |
| Leather jerkin, kneepads, felt overshoes, gloves (on the explorer's body, if worn gear is visible) | —             | 6 (optional) |

### Lootable models

Each one with an open and a closed state, or a lid or door that moves, like the crate and trunk. They need collision sizes for `lootables.ts`.

| Lootable                                       | States                       | Needed by |
| ---------------------------------------------- | ---------------------------- | --------- |
| Wall niche                                     | Open, sealed (slab), emptied | 2         |
| Bone pile                                      | Whole, rummaged              | 2         |
| Sarcophagus                                    | Lid on, lid pushed aside     | 2         |
| Quarrymen's tool chest                         | Closed, pried open           | 2         |
| Workman's locker                               | Closed, door open            | 2         |
| Sunken satchel                                 | Closed, open                 | 2         |
| Offering box                                   | Locked, opened, smashed      | 2         |
| Vestry cabinet                                 | Closed, doors open           | 2         |
| Font (holds water)                             | Full, empty                  | 2         |
| Rat nest                                       | One state                    | 2         |
| Webbed cocoon                                  | Whole, cut open              | 2         |
| Smuggler's brick (with chalk sign on the wall) | In place, pulled out         | 2         |
| Surveyor's cache (a satchel)                   | Closed, open                 | 2         |
| Reliquary alcove                               | Grille shut, pried open      | 2         |
| Mausoleum gate (iron)                          | Shut, open                   | 3         |

### World models and effects

| Asset                                  | Needed by |
| -------------------------------------- | --------- |
| Spider web across an arch (whole, cut) | 5         |
| Breakable rubble wall (whole, broken)  | 5         |
| Piton anchor in rock (with rope tied)  | 5         |
| Smuggler's chalk sign (decal)          | 5         |
| Salt line (decal)                      | 4         |
| Fire patch (effect)                    | 4         |
| Training dummy                         | 8         |
| Dummy track (with a moving dummy)      | 8         |
| Hit damage numbers (UI effect)         | 8         |

### Room pieces

Each with its `crate-<n>` and `lootable-<type>-<n>` markers, plus the markers its mechanic needs (rubble, anchors, water volumes). The lootables each room holds are in the Rooms tables.

| Pieces                                                                                                                                                                                                                  | Needed by |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **Existing pieces:** add `lootable-*` markers to all 17 in "Existing pieces"                                                                                                                                            | 2         |
| **New rooms (13):** The Vestry, Quarrymen's Lodge, Smugglers' Cellar, The Pump Room, Rat Warren, Explorers' Camp, Survey Station, Rockfall, Family Mausoleum, Webbed Gallery, Plague Pit, Drowned Chapel, Saints' Crypt | 3         |
| **Rappel rooms (3):** The Sinkhole, Broken Stair, Sunken Ossuary                                                                                                                                                        | 3         |
| **Rumors map:** its start room, the short way in (tutorial stops 1–5), the training vault                                                                                                                               | 8         |

### Explorer animations

In `explorer-clips.glb`, beside the existing holding and using clips.

| Clip                                     | Needed by |
| ---------------------------------------- | --------- |
| Searching / reaching in (niches, nests)  | 2         |
| Prying (chests, stashes, alcoves)        | 2         |
| Pushing a lid (sarcophagus)              | 2         |
| Cutting (cocoons, webs)                  | 2         |
| Filling a bottle (fonts)                 | 2         |
| Spear thrust                             | 4         |
| Wide spade sweep                         | 4         |
| Two-handed sledge swing                  | 4         |
| Cranking a crossbow                      | 4         |
| Working a rifle bolt                     | 4         |
| Laying salt                              | 4         |
| Setting a snare                          | 4         |
| Hammering a piton                        | 5         |
| Field crafting (kneel and work, looping) | 7         |

### Sound effects

Through the audio manager's SFX category, mixed with `pnpm asset:levels`.

| Group     | Sounds                                                                                                                                                                                                                                                                           | Needed by |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Items     | Item breaking, repaired item, salvage, broken gun's dry click                                                                                                                                                                                                                    | 1         |
| Lootables | Opening each of the 15 lootables (niche slab, bone pile shifting, stone lid grinding, chest prying, locker door, satchel, offering box picked and smashed, cabinet, font filling, nest with rat squeals, cocoon cutting, brick pulled, cache, alcove grille), the mausoleum gate | 2         |
| Melee     | Swing and hit for the hatchet, trench spade, short spear, club (and its snag), pickaxe, sledgehammer; throwing knife thrown and landing; a stamina-out gasp                                                                                                                      | 4         |
| Ranged    | Rifle shot, bolt worked, round loaded; derringer shot and reload; crossbow twang (quiet), crank and bolt hit; slingshot snap and pebble land; oil bottle lit, thrown, shatter and fire loop                                                                                      | 4         |
| Utility   | Firecrackers (fuse, bangs), snare spring, salt poured, bleeding (creature), glow stick crack                                                                                                                                                                                     | 4         |
| World     | Rubble breaking, webs tearing and burning, piton hammered, smuggler's brick scraping                                                                                                                                                                                             | 5         |
| Items 2   | Whistle, tripwire bell, censer swinging, laudanum, compass, doll's phantom sounds, tarot draw                                                                                                                                                                                    | 6         |
| Hub       | Library discovery sting (the epic-find sound, reused), Workshop repair, craft and salvage, store tier unlocked                                                                                                                                                                   | 7         |
| Crafting  | Field crafting loop                                                                                                                                                                                                                                                              | 7         |
| Rumors    | Dummy hit, dummy reset, dummy track running                                                                                                                                                                                                                                      | 8         |

## Open questions

None right now. The values marked **Proposed** (rarity, weight, stack, the light budget) are starting points to tune in play.
