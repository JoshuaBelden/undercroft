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
| `src/lib/content/loot.ts`           | What loot is scattered and how densely                         |
| `src/lib/server/store/shop.ts`      | Buying, selling, admin grants, the ledger                      |
| `src/routes/api/shop/`              | Shop endpoint                                                  |
| `src/routes/api/admin/`             | Dev-mode account tools                                         |
| `src/lib/ui/Shop.svelte`            | The shop (the dashboard's Store page)                          |
| `src/routes/(hub)/`                 | The dashboard: its layout and one page per tab                 |
| `src/lib/account/account.svelte.ts` | Client: `session.account.explorer`, `changeLoadout`            |

The explorer document is described in [accounts.md](accounts.md).

## The dashboard

Signing in lands on the dashboard. It is the `(hub)` route group: `+layout.svelte` draws the frame and each tab is its own page.

- **Frame:** the tabs (Expedition, Loadout, Afflictions) top-left, then money and the gamer tag top-right. Settings (a gear) and Help (a question mark) sit bottom-right. The gear is a link to the `/settings` page, which is outside the group and so replaces the frame (see [systems.md](systems.md#settings)); Help opens as an overlay. The `toggleSettings` (Escape) and `toggleHelp` actions do the same, through an `InputMap` limited to those two actions so the pages keep every other key.
- **Page width:** the frame gives each page the whole window under the bar, less 50px of padding on each side (none on narrow screens). A page that wants the centred 900px column wraps itself in the global `.page-column` class (`src/app.css`), as Expedition and Store do; a full-width page (Loadout, Afflictions) lays itself out.
- **Expedition** (`/`, the default): the setup screen. It shows the Affliction, what you are taking, and two ways out: "Start an expedition" (opens `/play`) or join one by invite code (opens `/play?code=...`). Nothing starts until then.
- **Loadout** (`/loadout`): `Outfit`.
- **Afflictions** (`/afflictions`): `Afflictions` (see [rite.md](rite.md)).
- **Store** (`/store`): `Shop`. It has no tab: the money in the frame is the link to it.

`/play` is the party screen and then the game: invite friends, ready up, descend (see [expedition.md](expedition.md)). It is the only place to descend from. It shows what you are taking down and links back to Loadout; it has no stash or store of its own. Leaving it for the dashboard leaves the party.

Links inside the group use route ids with `resolve` (`resolve('/(hub)/loadout')`), and the current tab is found from `page.route.id`: `resolve` returns relative paths during server rendering, so comparing it with the URL does not work.

## Stash and loadout

- **Stash:** a list of slots, each an `ItemStack` or null. A new explorer has `SLOTS.stash` (30); the array's length is the number of slots, so more can be added later by making it longer. Stacks follow the item's `maxStack`.
- **Loadout:** an `Inventory`, exactly what a player carries underground (equipment, backpack, quick-use slots). It follows the same slot and weight rules, through the same functions in `src/lib/shared/items/inventory.ts`, so a loadout can never be more than you could carry. See [items.md](items.md#inventory).

### The Loadout page

`Outfit` fills the page with two rounded, see-through panels. STASH on the left is as wide as its slots: a column of round filter buttons (all, weapons, defense, quick use, other) and the slots, 5 across, in a container that scrolls. A filter shows the stacks of that category first and then the empty slots, so there is still somewhere to drop things. LOADOUT takes the rest of the width and is a `LoadoutPanel`, with the weight of it (`CarriedWeight`) beside the title. The two are always side by side: in a narrower window the slots shrink (`--slot-size`, set on the page and read by `Slot`).

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

Every hub change goes through `changeExplorer`, which refuses while the explorer is underground and only writes if the money, stash and loadout are as they were when it read them.

Explorers from before slots (a stash list; a loadout of quick slots, pack and pockets) are converted the first time they are read (`upgrade` in `accounts.ts`, marked by `layout`): everything they own goes into the stash, which gets extra rows if it needs them, and the loadout starts empty.

## Descent and return

The game server is the only writer while an explorer is underground.

1. **Descent** (`Parties.begin`, `takeKit`): `takeLoadout` empties the loadout and sets `underground` to the session id, in one update. The inventory it returns is what `Session.addPlayer` gives the player. Fetching takes a moment, so a member who left meanwhile gets their kit straight back.
2. **Underground:** the hub refuses changes (`underground`), and `ExplorerView.underground` is true.
3. **Return** (`SessionHooks.onPlayerLeft(owner, carried)`, `giveBack`, `returnFromExpedition`):
   - **Got out** (`extracted`, `banished`, `resolved`): `carried` is the player's inventory. It becomes the loadout as arranged, so the kit is ready for next time, except loot, rite items and clues (`NOT_KIT`), which go to the stash as far as it has room. What doesn't fit stays in the loadout's backpack.
   - **Didn't** (died, dropped for good, left the party while underground): `carried` is null. Nothing comes back: it is lying in the catacombs. The loadout was already emptied at descent.
   - Either way `underground` is cleared.

The `extracted`, `banished` and `resolved` messages carry `carried` (stacks) for the results screen; `died` means everything was lost.

When the game server starts, `releaseAll` clears every `underground` marker: nobody can be underground yet, and a crash would otherwise lock those explorers out of the hub. What they had taken down is gone.

## Loot

Loot is what explorers carry out to sell. For now there is one stand-in item, the `relic` (`kind: 'loot'`, drawn as a plain cube), with a `value` and a weight, five to a backpack slot, so that carrying it is a choice. Real loot types, containers and loot tables are Phase 6.

- **Where:** `WorldItems.scatterLoot` (`server/items.ts`), seeded by the map seed, driven by `LOOT` in `src/lib/content/loot.ts`: about `perCell` per map cell, on standing dry nav points by walls, none within `minDistance` of the start, `spacing` apart. A spot is used with probability (its floor distance from the start ÷ the farthest) to the power `depthBias`, so most of it lies far in.
- **Carrying:** loot is in the `other` category, so it only goes in the backpack.
- **The meter:** loot carried hastens the Affliction. Each tick the meter gains `meter.perLoot` × the value all players carry between them (`lootValue`) × the tick length. See [affliction.md](affliction.md).
- **Coming back:** loot goes to the stash, not the loadout (see above).

To add a loot item, add an `ItemDef` with `kind: 'loot'` and a `value`. Scattering more than one kind needs `LOOT` to become a table.

## Money and the shop

An explorer's `money` is a whole number of coin. It only changes on the server.

Everything to tune is in `src/lib/content/economy.ts`:

- `SHOP`: what is sold, in order. Each entry is an `item`, a `price` and a `lot` (how many you get for that price: rounds come six or four at a time). Firearms are sold empty.
- `ECONOMY.sellBack`: the fraction of its price that shop gear sells back for (per unit, rounded down).
- `sellPrice(item)`: loot sells for its `value` (in `ITEMS`), shop gear for the sell-back, anything else for nothing and can't be sold.
- `ECONOMY.currency`: what money is called.

Loot values are on the items (`value` in `src/lib/content/items.ts`), and how much loot there is to find is `LOOT` in `src/lib/content/loot.ts`.

`POST /api/shop` returns the `AccountView` afterwards:

- `{ action: 'buy', item, lots }`: charges `price × lots` and puts `lot × lots` in the stash. Refused if you can't afford it, the shop doesn't sell it, or it won't all fit in the stash (`stashFull`).
- `{ action: 'sell', from, count }`: sells up to `count` from a slot. `from` is a `SlotRef` in the stash or the loadout: the store page sells from the stash, the Loadout page's menu from either.

The client only says what to buy or sell. Prices are looked up on the server, and the shop overlay shows the same table. Like every hub change it is refused while underground.

### The ledger

Every purchase, sale, grant and reset, and everything thrown away, writes a line to the `ledger` collection: `explorer`, `at`, `kind` (`buy`, `sell`, `discard`, `grant`, `reset`), `item`, `count`, `money` (the change) and `balance` (afterwards). It is the economy log: read it with any MongoDB client.

### Admin

`POST /api/admin` exists only in dev mode (`devMode` in `src/lib/dev.ts`); in a player build it is a 404. The admin panel's "Account" section uses it:

- `grantMoney { amount }` and `grantItem { item, count }`: to your own explorer's purse or stash (refused if the stash has no room for all of it).
- `resetExplorer`: your own explorer back to nothing: no money, empty stash and loadout, rite progress forgotten.
- `resetPassword { email, password }`: set a new password for any account (there is no password recovery email). Not in the panel: call the endpoint.

## Testing

A new explorer has nothing. `pnpm dev:seed` puts some of every item, and some money, in every explorer's stash (`pnpm dev:seed <email>` for one account; `scripts/seed-items.ts` lists what). In dev mode, the admin panel's Account section (F10 on the party screen) grants money and items; underground, Give puts things straight in your hands. Dying needs no salts: set sanity to 0 and wait out the bleed-out.
