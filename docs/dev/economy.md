# The surface: stash, loadout and what you keep

Between expeditions an explorer owns a **stash** (kept on the surface) and a **loadout** (what goes down next). A new explorer has neither, and no money. What you carry out you keep; what you take down and don't bring back is gone.

## Files

| File                                | What                                                           |
| ----------------------------------- | -------------------------------------------------------------- |
| `src/lib/server/store/explorers.ts` | Stash and loadout rules in MongoDB; descent and return         |
| `src/routes/api/explorer/loadout/`  | Hub endpoint: rearrange the stash and the loadout              |
| `server/belongings.ts`              | Game server: take the loadout at descent, give back at the end |
| `src/lib/ui/Outfit.svelte`          | Stash and loadout (the dashboard's Loadout page)               |
| `src/lib/shared/items/inventory.ts` | The slot rules, shared with the game server                    |
| `src/lib/content/economy.ts`        | Shop stock and prices, sell-back rate, the currency's name     |
| `src/lib/content/loot.ts`           | Loot tables: what crates hold, by rarity and depth             |
| `src/lib/shared/items/loot.ts`      | Rolling a crate's contents and loose loot from the tables      |
| `src/lib/server/store/shop.ts`      | Buying, selling, admin grants, the ledger                      |
| `src/routes/api/shop/`              | Shop endpoint                                                  |
| `src/routes/api/admin/`             | Dev-mode account tools                                         |
| `src/lib/ui/Shop.svelte`            | The shop (the dashboard's Store page): buying only             |
| `src/lib/ui/ItemFilters.svelte`     | The round category filters beside the stash and the store      |
| `src/routes/(hub)/`                 | The dashboard: its layout and one page per tab                 |
| `src/lib/account/account.svelte.ts` | Client: `session.account.explorer`, `changeLoadout`            |

The explorer document is described in [accounts.md](accounts.md).

## The dashboard

Signing in lands on the dashboard. It is the `(hub)` route group: `+layout.svelte` draws the frame and each tab is its own page.

- **Frame:** the tabs (Expedition, Loadout, Afflictions) top-left, then money and the gamer tag top-right. Settings (a gear), Social (a pill with a speech bubble and the number of requests and invites waiting) and Help (a question mark) sit bottom-right. Social is a link to the Social page, as is the `toggleSocial` action (O). The gear is a link to the `/settings` page, which is outside the group and so replaces the frame (see [systems.md](systems.md#settings)); Help opens as an overlay. The `toggleHelp` action does the same as its button. `toggleSettings` (Escape) backs out one step: it closes Help if it is open, otherwise returns to the Expedition page, and only from the Expedition page opens `/settings`. `inventory` (Tab: the key that opens the pack underground) goes to the Loadout page, through an `InputMap` limited to those four actions so the pages keep every other key.
- **Page width:** the frame gives each page the whole window under the bar, less 50px of padding on each side (none on narrow screens). A page that wants the centred 900px column wraps itself in the global `.page-column` class (`src/app.css`); the pages there are now are all full-width (Expedition, Loadout, Store, Afflictions) and lay themselves out.
- **Expedition** (`/`, the default): the lobby. Everyone in the party as a pane (`ExplorerPane`), centred, and the launch panel in the lower right: the Affliction the host chose, and Launch Expedition (see [expedition.md](expedition.md#parties)).
- **Loadout** (`/loadout`): `Outfit`.
- **Afflictions** (`/afflictions`): `Afflictions` (see [rite.md](rite.md)).
- **Social** (`/social`): `Social`: the party, friends and finding players (see [social.md](social.md)). It has no tab: the Social button in the frame is the link to it.
- **Store** (`/store`): `Shop`. It has no tab: the money in the frame is the link to it.

`/play` is the game and nothing else: the browser is sent there when an expedition starts, and back to the surface when it is over: the Loadout page for whoever came out with what they carried, the dashboard otherwise (see [expedition.md](expedition.md)). The party lives on the game server connection, which every page shares, so moving between dashboard pages keeps it.

Links inside the group use route ids with `resolve` (`resolve('/(hub)/loadout')`), and the current tab is found from `page.route.id`: `resolve` returns relative paths during server rendering, so comparing it with the URL does not work.

## Stash and loadout

- **Stash:** a list of slots, each an `ItemStack` or null. A new explorer has `SLOTS.stash` (30); the array's length is the number of slots, so more can be added later by making it longer. Stacks follow the item's `maxStack`.
- **Loadout:** an `Inventory`, exactly what a player carries underground (equipment, backpack, quick-use slots). It follows the same slot and weight rules, through the same functions in `src/lib/shared/items/inventory.ts`, so a loadout can never be more than you could carry. See [items.md](items.md#inventory).

### The Loadout page

`Outfit` fills the page with two rounded, see-through panels. STASH on the left is as wide as its slots: a column of round filter buttons (`ItemFilters`: all, weapons, ammunition, defense, quick use, treasure, other) and the slots, 5 across, in a container that scrolls. A filter shows the stacks of that category first and then the empty slots, so there is still somewhere to drop things. LOADOUT takes the rest of the width and is a `LoadoutPanel`, with the weight of it (`CarriedWeight`) beside the title. The two are always side by side: in a narrower window the slots shrink (`--slot-size`, set on the page and read by `Slot`).

Everything is drag and drop; there are no buttons. Slots are `ItemSlot`s on one `ItemBoard` (see [systems.md](systems.md#item-slots)):

- drag a stack onto a slot: it moves, joins a stack of the same item, or swaps places;
- shift-click: stash to loadout (where it belongs) and back;
- right-click: Equip or Unequip, Split, Sell (with the price) and Drop. Split and Sell ask how many in a `QuantityDialog`; Drop is confirmed, because on the surface the thing is gone for good;
- hover or focus: the tooltip.

A change plays `inventory.drop` (`shop.sell` for a sale).

Moves show at once. `Outfit` runs the request through `applyAction` on a copy of the stash and loadout, shows the result, and then sends it; requests go one at a time, in order, and when the last answer is in, the server's `AccountView` replaces what was shown. A move the rules refuse is refused on the spot, without a request. If the server refuses one, the account is read again. Selling is not predicted (the purse is the server's to say).

### The endpoint

`POST /api/explorer/loadout` takes an `InventoryAction`, the same requests the pack screen sends underground, with stash slots allowed. It returns the `AccountView` afterwards:

- `{ kind: 'move', from, to, count? }`: one slot onto another.
- `{ kind: 'quick', from }`: shift-click.
- `{ kind: 'equip', from }`: into the weapon, defense or quick-use slot it belongs in.
- `{ kind: 'split', from, count }`.
- `{ kind: 'drop', from, count }`: thrown away. Written to the ledger as `discard`.

`arrange` (`explorers.ts`) runs it with `applyAction`. A refusal is `noRoom` (not allowed there, or nowhere to put it) or `heavy` (past `CARRY.max`).

Every hub change goes through `changeExplorer`, which refuses while the explorer is underground or `ready` (ready to descend with their party: the game server sets it when they confirm their loadout and clears it when they cancel, leave, drop or descend, `lockKit` in `server/belongings.ts`) and only writes if the money, stash and loadout are as they were when it read them.

Explorers from before slots (a stash list; a loadout of quick slots, pack and pockets) are converted the first time they are read (`upgrade` in `accounts.ts`, marked by `layout`): everything they own goes into the stash, which gets extra rows if it needs them, and the loadout starts empty.

## Descent and return

The game server is the only writer while an explorer is underground.

1. **Descent** (`Parties.begin`, `takeKit`): `takeLoadout` empties the loadout and sets `underground` to the session id, in one update. The inventory it returns is what `Session.addPlayer` gives the player. Fetching takes a moment, so a member who left meanwhile gets their kit straight back.
2. **Underground:** the hub refuses changes (`underground`), and `ExplorerView.underground` is true.
3. **Return** (`SessionHooks.onPlayerLeft(owner, carried)`, `giveBack`, `returnFromExpedition`):
   - **Got out** (`extracted`, `banished`, `resolved`): `carried` is the player's inventory. All of it becomes the loadout, arranged as it was: the kit is ready for next time, and what was found stays in the backpack. The player lands on the Loadout page to put it in the stash or sell it.
   - **Didn't** (died, dropped for good, left the party while underground): `carried` is null. Nothing comes back: it is lying in the catacombs. The loadout was already emptied at descent.
   - Either way `underground` is cleared.

The `extracted`, `banished` and `resolved` messages carry `carried` (stacks) for the results screen; `died` means everything was lost.

When the game server starts, `releaseAll` clears every `underground` marker: nobody can be underground yet, and a crash would otherwise lock those explorers out of the hub. What they had taken down is gone.

## Loot

Loot is what explorers carry out to sell: items with `kind: 'loot'`, a `value`, a weight and a stack size, so that carrying it is a choice (coins stack to 20 and weigh nothing; a chalice takes a slot and weighs 1.8 kg). All of it is `treasure: true`: good for nothing but its value, so it is listed under the Treasure filter (not Other), its tooltip says Treasure, and its slot has a small diamond in the bottom-left corner (weapons and defense show their filter icons there too). None has a model yet: on the floor they are boxes from `placeholder`.

### Rarity

Every item has a rarity (`ItemDef.rarity`, `rarityOf(item)`): `common` (when left out), `uncommon`, `rare`, `epic` or `legendary`. `RARITIES` lists them commonest first with their names. A slot holding something shows its rarity as a 2px left and bottom edge (none for common, then grey, green, blue, yellow: the `--rarity-*` colours in `src/app.css`), and the tooltip names it under the item's name. See [systems.md](systems.md#slots). Quest items show a purple edge instead (see [items.md](items.md#quest-items)).

| Rarity    | Loot                    |
| --------- | ----------------------- |
| Common    | Old coins, bone rosary  |
| Uncommon  | Gold tooth, signet ring |
| Rare      | Silver candlestick      |
| Epic      | Chalice                 |
| Legendary | Reliquary (id `relic`)  |

### Tables

All of it is data in `src/lib/content/loot.ts`. There is no editor: change the file.

- `CRATE_LOOT`: everything a crate can hold, each with a `count` range (how many come together) and a `weight` near the start and at the far end of the map. Supplies (bandages, rounds, salts, chalk, candles) are in it as common things.
- `CRATE_RARITY`: how many things of each rarity a crate holds, as a fewest and a most: 1 to 4 common, 0 to 2 uncommon, 0 or 1 rare, 0 or 1 epic, 0 or 1 legendary. With `CRATES.fill` at 0.35 a map has about 20 crates holding about 2 things each, a couple of rares, an epic in about half of maps and a legendary in about one in five, nearly all of them deep. Each one above the fewest is there with probability `chance`, which also runs from a value near the start to one at the far end. A crate never has more than the most.
- `LOOSE_LOOT`: the little that lies on the floor.

**Depth** is one number from 0 to 1: a spot's distance along the floor from the start, divided by the farthest reachable point's (`gridDistances`). Descents only lead down, so it rises with the level too. Every weight and chance slides between its two values by it.

`rollCrate(depth, rng)` (`src/lib/shared/items/loot.ts`) fills a crate:

1. Roll how many of each rarity.
2. If both an epic and a legendary came up, drop one of them (a coin toss).
3. For each, draw an item of that rarity from `CRATE_LOOT` by weight. What is drawn leaves the pool, so a crate never holds the same thing twice (if a rarity runs out of things, it gets fewer).
4. If that is more than the crate's 8 slots, leave out the commonest.
5. Lay them out from the first slot, commonest first, so the best is revealed last.

It is seeded by the map seed, so a seed gives the same crates with the same things in them.

### Where it is

- **Crates** hold most of it. See [items.md](items.md#loot-crates).
- **Loose:** `WorldItems.scatterLoot` (`server/items.ts`), seeded by the map seed, driven by `LOOSE_LOOT`: about `perCell` per map cell, on standing dry nav points by walls, none within `minDistance` of the start, `spacing` apart. A spot is used with probability (its depth) to the power `depthBias`, so most of it lies far in. Each is one draw from the `CRATE_LOOT` entries of the rarities in `LOOSE_LOOT.rarities` (common and uncommon).

### Carrying it

- **Carrying:** loot is in the `other` category, so it only goes in the backpack.
- **The meter:** loot carried hastens the Affliction. Each tick the meter gains `meter.perLoot` × the value all players carry between them (`lootValue`) × the tick length. See [affliction.md](affliction.md).
- **Coming back:** loot stays in the loadout's backpack (see above); the player moves it to the stash or sells it.

To add a loot item, add an `ItemDef` with `kind: 'loot'`, a `value`, a `rarity` and `treasure: true`, and an entry in `CRATE_LOOT`. A rarity with nothing in `CRATE_LOOT` simply never turns up.

## Money and the shop

An explorer's `money` is a whole number of coin. It only changes on the server.

Everything to tune is in `src/lib/content/economy.ts`:

- `SHOP`: what is sold, in order. Each entry is an `item`, a `price` and a `lot` (how many you get for that price: rounds come six or four at a time). Firearms are sold empty.
- `ECONOMY.sellBack`: the fraction of its price that shop gear sells back for (per unit, rounded down).
- `sellPrice(item)`: loot sells for its `value` (in `ITEMS`), shop gear for the sell-back, anything else for nothing and can't be sold.
- `ECONOMY.currency`: what money is called.

Loot values are on the items (`value` in `src/lib/content/items.ts`), and how much loot there is to find is `CRATE_RARITY`, `CRATES.fill` and `LOOSE_LOOT` in `src/lib/content/loot.ts`.

`POST /api/shop` returns the `AccountView` afterwards:

- `{ action: 'buy', item, lots }`: charges `price × lots` and puts `lot × lots` in the stash. Refused if you can't afford it, the shop doesn't sell it, or it won't all fit in the stash (`stashFull`).
- `{ action: 'sell', from, count }`: sells up to `count` from a slot. `from` is a `SlotRef` in the stash or the loadout. Selling is done from the Loadout page's menu; the Store page only buys.

The client only says what to buy or sell. Prices are looked up on the server, and the Store page shows the same table. Like every hub change it is refused while underground or ready to descend.

### The Store page

`Shop` is for buying only. It draws one panel in the same style as the stash, titled STORE: the `ItemFilters` column and a grid of `SHOP` entries, `SLOTS.stashColumns` across. Each entry is a `Slot` in a button, with the lot size as the count and the price as the small print in the corner. A filter shows only the entries of that category (`matchesFilter`).

Clicking an entry slides a light panel in from the right edge of the window, from the bottom of the dashboard's bar down (the frame measures the bar and sets `--hub-bar` for this) (clicking it again, the close button or Escape takes it away; Escape is caught in the capture phase so the dashboard does not open Settings). It shows the picture, name, category, flavor and `itemStats(stack, true)`: the `forSale` form leaves out what only applies to a stack you own (rounds loaded, how full the stack is, what it sells for). Its footer has the total, what you have, a quantity (in lots, 1 to 99, the server's limit) and Purchase, which sends `buy`, plays `shop.buy` and closes the panel (a refused purchase leaves it open). Purchase is disabled while underground or when the total is more than you have; a refusal from the server (no room in the stash) is shown above it.

### The ledger

Every purchase, sale, grant and reset, and everything thrown away, writes a line to the `ledger` collection: `explorer`, `at`, `kind` (`buy`, `sell`, `discard`, `grant`, `reset`), `item`, `count`, `money` (the change) and `balance` (afterwards). It is the economy log: read it with any MongoDB client.

### Admin

`POST /api/admin` exists only in dev mode (`devMode` in `src/lib/dev.ts`); in a player build it is a 404. The admin panel's "Account" section uses it:

- `grantMoney { amount }` and `grantItem { item, count }`: to your own explorer's purse or stash (refused if the stash has no room for all of it).
- `resetExplorer`: your own explorer back to nothing: no money, empty stash and loadout, rite progress forgotten.
- `resetPassword { email, password }`: set a new password for any account (there is no password recovery email). Not in the panel: call the endpoint.

## Testing

A new explorer has nothing. `pnpm dev:seed` puts some of every item, and some money, in every explorer's stash (`pnpm dev:seed <email>` for one account; `scripts/seed-items.ts` lists what). In dev mode, the admin panel's Account section (F10 on the party screen) grants money and items; underground, Give puts things straight in your hands. Dying needs no salts: set sanity to 0 and wait out the bleed-out.
