# The surface: stash, loadout and what you keep

Between expeditions an explorer owns a **stash** (kept on the surface) and a **loadout** (what goes down next). A new explorer has neither, and no money. What you carry out you keep; what you take down and don't bring back is gone.

The shop and money are described at the end of this file as they land.

## Files

| File                                | What                                                           |
| ----------------------------------- | -------------------------------------------------------------- |
| `src/lib/server/store/explorers.ts` | Stash and loadout rules in MongoDB; descent and return         |
| `src/routes/api/explorer/loadout/`  | Hub endpoint: move things between stash and loadout            |
| `server/belongings.ts`              | Game server: take the loadout at descent, give back at the end |
| `src/lib/ui/OutfitPanel.svelte`     | The outfitting overlay on the surface                          |
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

## Testing

A new explorer has nothing, so in dev mode use Give in the admin panel underground and carry it out. Dying needs no salts: set sanity to 0 and wait out the bleed-out.
