# The surface: stash, loadout and what you keep

Between expeditions an explorer owns a **stash** (kept on the surface) and a **loadout** (what goes down next). A new explorer has neither, and no money. What you carry out you keep; what you take down and don't bring back is gone.

## Files

| File                                | What                                                           |
| ----------------------------------- | -------------------------------------------------------------- |
| `src/lib/server/store/explorers.ts` | Stash and loadout rules in MongoDB; descent and return         |
| `src/routes/api/explorer/loadout/`  | Hub endpoint: move things between stash and loadout            |
| `server/belongings.ts`              | Game server: take the loadout at descent, give back at the end |
| `src/lib/ui/OutfitPanel.svelte`     | The outfitting overlay on the surface                          |
| `src/lib/content/economy.ts`        | Shop stock and prices, sell-back rate, the currency's name     |
| `src/lib/content/loot.ts`           | What loot is scattered and how densely                         |
| `src/lib/server/store/shop.ts`      | Buying, selling, admin grants, the ledger                      |
| `src/routes/api/shop/`              | Shop endpoint                                                  |
| `src/routes/api/admin/`             | Dev-mode account tools                                         |
| `src/lib/ui/ShopPanel.svelte`       | The shop overlay on the surface                                |
| `src/lib/account/account.svelte.ts` | Client: `session.account.explorer`, `changeLoadout`            |

The explorer document is described in [accounts.md](accounts.md).

## Stash and loadout

- **Stash:** a list of `ItemStack`, with no size limit yet. Stacks of the same item join unless they carry their own state (rounds loaded, wear): `addToStash`.
- **Loadout:** an `Inventory`, exactly what a player carries underground (quick slots, pack, pockets). It follows the same weight and bulk rules, through the same functions in `src/lib/shared/items/inventory.ts`, so a loadout can never be more than you could carry.

`POST /api/explorer/loadout` changes them and returns the `AccountView` afterwards:

- `{ action: 'take', index, count }`: stash entry `index` into the loadout, as many as fit (`addItem`: an empty quick slot first, then the pack). `noRoom` if none fit.
- `{ action: 'stow', from, count }`: from the loadout (`from` is an `ItemRef`) into the stash.

Every hub change goes through `changeExplorer`, which refuses while the explorer is underground and only writes if the stash and money are as they were when it read them.

## Descent and return

The game server is the only writer while an explorer is underground.

1. **Descent** (`Parties.begin`, `takeKit`): `takeLoadout` empties the loadout and sets `underground` to the session id, in one update. The inventory it returns is what `Session.addPlayer` gives the player. Fetching takes a moment, so a member who left meanwhile gets their kit straight back.
2. **Underground:** the hub refuses changes (`underground`), and `ExplorerView.underground` is true.
3. **Return** (`SessionHooks.onPlayerLeft(owner, carried)`, `giveBack`, `returnFromExpedition`):
   - **Got out** (`extracted`, `banished`, `resolved`): `carried` is the player's inventory. It becomes the loadout as arranged, so the kit is ready for next time, except loot, rite items and clues (`NOT_KIT`), which go to the stash.
   - **Didn't** (died, dropped for good, left the party while underground): `carried` is null. Nothing comes back: it is lying in the catacombs. The loadout was already emptied at descent.
   - Either way `underground` is cleared.

The `extracted`, `banished` and `resolved` messages carry `carried` (stacks) for the results screen; `died` means everything was lost.

When the game server starts, `releaseAll` clears every `underground` marker: nobody can be underground yet, and a crash would otherwise lock those explorers out of the hub. What they had taken down is gone.

## Loot

Loot is what explorers carry out to sell. For now there is one stand-in item, the `relic` (`kind: 'loot'`, drawn as a plain cube), with a `value`, a weight and a bulk so that carrying it is a choice. Real loot types, containers and loot tables are Phase 6.

- **Where:** `WorldItems.scatterLoot` (`server/items.ts`), seeded by the map seed, driven by `LOOT` in `src/lib/content/loot.ts`: about `perCell` per map cell, on standing dry nav points by walls, none within `minDistance` of the start, `spacing` apart. A spot is used with probability (its floor distance from the start ÷ the farthest) to the power `depthBias`, so most of it lies far in.
- **Carrying:** loot is not used in the hand, so it never takes a quick slot: `addItem` puts anything without a melee, firearm or throw spec straight in the pack.
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

- `{ action: 'buy', item, lots }`: charges `price × lots` and puts `lot × lots` in the stash. Refused if you can't afford it or the shop doesn't sell it.
- `{ action: 'sell', index, count }`: sells up to `count` from stash entry `index`.

The client only says what to buy or sell. Prices are looked up on the server, and the shop overlay shows the same table. Like every hub change it is refused while underground.

### The ledger

Every purchase, sale, grant and reset writes a line to the `ledger` collection: `explorer`, `at`, `kind` (`buy`, `sell`, `grant`, `reset`), `item`, `count`, `money` (the change) and `balance` (afterwards). It is the economy log: read it with any MongoDB client.

### Admin

`POST /api/admin` exists only in dev mode (`devMode` in `src/lib/dev.ts`); in a player build it is a 404. The admin panel's "Account" section uses it:

- `grantMoney { amount }` and `grantItem { item, count }`: to your own explorer's purse or stash.
- `resetExplorer`: your own explorer back to nothing: no money, empty stash and loadout, rite progress forgotten.
- `resetPassword { email, password }`: set a new password for any account (there is no password recovery email). Not in the panel: call the endpoint.

## Testing

A new explorer has nothing. In dev mode, the admin panel's Account section grants money and items on the surface; underground, Give puts things straight in your hands. Dying needs no salts: set sanity to 0 and wait out the bleed-out.
