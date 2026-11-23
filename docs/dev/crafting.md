# Crafting

Discovery, the Library, recipes and recipe fragments, the Workshop (craft, repair, salvage), field crafting below, and the `crafted` sell rule. The design is in [the handoff](../handoff-gear-crafting-loot.md#discovery-and-the-library-decided).

## Files

| What                                                                                   | Where                                                                                                            |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Recipes, repairs, salvage, tuning (`RECIPES`, `REPAIRS`, `SALVAGE`, `CRAFT`)           | `src/lib/content/recipes.ts`                                                                                     |
| The rules: discoverable, recipe status, repair cost, salvage, crafted value, fragments | `src/lib/shared/items/crafting.ts`                                                                               |
| Discoveries and trust on the explorer                                                  | `src/lib/server/store/discoveries.ts` (`ExplorerDoc.discovered`, `fresh`, `sold`)                                |
| The Workshop                                                                           | `src/lib/server/store/workshop.ts`, `POST /api/explorer/workshop`                                                |
| Fresh discoveries looked at                                                            | `POST /api/explorer/library`                                                                                     |
| Discovery in an expedition                                                             | `Session.discover`, `CrateSystem` (slots in sight, fragments, fonts)                                             |
| Field crafting                                                                         | `server/systems/craft.ts` (`CraftSystem`), the `craft` and `stopCraft` messages                                  |
| The pages                                                                              | `src/lib/ui/Workshop.svelte`, `Library.svelte`, `CraftPanel.svelte` (the in-game Craft tab)                      |
| Tests                                                                                  | `src/lib/shared/items/crafting.test.ts`, `src/lib/server/store/workshop.test.ts`, `server/systems/craft.test.ts` |

## Discovery

An item is discovered by seeing it in a lootable: every slot in sight in a lootable a player has open (`CrateSystem.step`, each tick it sends them the `crate` view) and what a font fills. `Session.discover(player, item, source)` keeps it on the player (`Player.discovered`, read at descent with `discoveries()` in `server/belongings.ts`), records where (`onDiscovered` to `discover()`, once per item and lootable a run), and the first time sends `discovered` (an alert with the epic-find sting: "Discovered: rubber. Used in 2 recipes."). Buying, salvaging, a teammate's drop or a floor pickup never discover. What can't be discovered: anything no lootable holds (`discoverable`: bricks and pebbles lie loose), quest items, clues and fragments. A co-op guest's discoveries stay in their own save.

On the explorer, `discovered` maps each item to the lootable kinds it was seen in (stored with `~` for an id's dots, which an update would read as a path: `storedKey`, `discoveriesOf`); `fresh` lists those not yet looked at, whose slots shimmer (`Slot`'s `fresh`) on the Loadout page and in the Library until hovered (`markSeen`).

## The Library

The Library page lists what is discovered, the full width of the page: each item as a slot with the item tooltip (`TipSlot`), where it was seen and how many recipes use it. The recipes are on the Workshop's Craft tab.

## What a recipe makes

What a recipe makes is a secret until it has been made once. In the Workshop's Craft tab and the in-game Craft tab, a recipe never made shows its product as a grey ? slot named ???, even when every ingredient is known and it can be crafted; its ingredients show as usual. Once made, its product slot (with the item tooltip) and name show from then on.

Made means a `recipe:<id>` first in the explorer's progression (docs/dev/progression.md: `workshopCrafted` in the Workshop, `Experience.crafted` below, kept at the end of a run whatever the outcome). `madeRecipes(firsts)` reads them, and the account view sends them as `ExplorerView.made`. Below, the play page starts from the account's (`knowMade`, `made` in `src/lib/game/discoveries.svelte.ts`) and adds a recipe when its `crafted` message comes. A recipe taught by a quest (`learned`) is known from the start (`productKnown`). Resetting an explorer's levels and skills (admin) clears the firsts, so what their recipes make is secret again.

## Fragments

`recipe-fragment` (`fragment: true`) is found in lootables and read where it lies, like a clue (taking it from the loot screen reads it). `fragmentFinds` gives an undiscovered ingredient of a recipe already started, else of any recipe (which starts it), else nothing (only a note); it is discovered with the source `fragment`, and the `fragment` message tells the reader.

## The Workshop

Materials come from the stash, then the loadout's backpack and quick slots (`materialSlots`, `onHand` in `src/lib/shared/items/crafting.ts`: what was carried back up counts without being moved first; equipped things never do). What is made goes into the stash. Each is one change to the explorer (all of it or none):

- **Craft**: the tab lists every recipe with any ingredient discovered (`recipeStatus`: `hidden`, `started`, `available`), those that can be made first: the product (its slot with the item tooltip, a silhouette until it can be made) and a slot per ingredient (`IngredientSlots`: each with the item tooltip, dim with none on hand, the count red with too few, on hand / needed; `?` for one not discovered). An available one has a count (up to 20) and Craft. Above the list, a pill for every discovered material the listed recipes take filters it: pick one or more and only the recipes that take all of them stay (Clear resets it; not kept between visits). What is made is marked `crafted`; a `field` recipe can be made below too.
- **Repair** a stack in the stash or the loadout: its `REPAIRS` materials, and coin: `CRAFT.repairShare` (20%) of its price, by the share of it worn. A broken one can be mended. Repair in an item's menu on the Loadout page opens the Workshop with it chosen (`workshopAsk`).
- **Salvage** a stack into its `SALVAGE` materials (rope: a length per 5 m). Never treasure, never a discovery. It is not a Workshop tab: it is Salvage in an item's menu in the stash and loadout (`ItemBoard`'s `salvage`, asked first in `ItemOverlays`).

The Workshop page shows each recipe or repair as its product (`TipSlot`) and its ingredient slots. Item tooltips (`ItemTooltip`) are moved onto the body as they open: these panels have a `backdrop-filter`, which would otherwise make `position: fixed` the panel's and put the tooltip in the wrong place.

Each is a ledger line (`craft`, `repair`, `salvage`).

## Selling what was made

A `crafted` stack sells for what its recipe's materials sell for (a share, for a recipe that makes several: `craftedValue`), by its condition, so making things never makes coin. Crafted and found stacks of one item never merge (`sameKind`).

## Field crafting

With a working `crafting` gear (the field crafting kit) worn, the in-game menu has a Craft tab. It lists the `field` recipes known in full that the player carries enough of at least one ingredient for (`carriedCount`); the rest would only list what isn't to hand. A `field` recipe the player has discovered all of, with its materials carried, sends `craft { recipe }`; something worn they carry the materials to mend sends `craft { repair }`. `CraftSystem` kneels them (`PlayerState.crafting`, which `kneeling` reads: the medkit's pose) for `CRAFT.field.seconds`, heard `noise` away every `every` seconds, while their lamp is lit. Moving, the dark, being downed or the kit breaking stops it, and nothing is used. Done: the materials go and the thing is made into the pack (`crafted`), or the stack's wear goes down by `CRAFT.fieldRepair` (30%) of the most it takes; the kit wears a use. `crafted` tells them (an alert).

## Learned recipes

A recipe with `learned: true` (the quarryman's charge) is taught by a quest (`QuestDef.teachesRecipes`, [quests.md](quests.md#the-barred-stair)), never found: it is left out of the Library and the Workshop, and `recipeStatus(recipe, discovered, learned)` calls it available only to those taught, whatever they have discovered. It is field only. Below, the `quests` message tells the client what was taught, for the Craft tab; `CraftSystem.start` asks `QuestSystem.learned`.

## Admin

The F10 Account group (dev mode): **Discover everything**, **Forget discoveries** and **Trust (coin sold)**, which opens store tiers ([economy.md](economy.md#store-tiers)).

## Adding a recipe

A line in `RECIPES` (`makes`, `count`, `field`, `ingredients`): every ingredient must be something a lootable holds (a test checks), and no gun that fires rounds, nor rounds, is ever made. Mending and breaking something down are `REPAIRS` and `SALVAGE` lines.
