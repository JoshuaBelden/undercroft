# Undercroft: Phase Plan (Start → Beta)

Goal: a playable beta with **one Affliction (Gloaming)**, solo and co-op, full extraction loop, hub, and economy. **No voice chat in the first beta.**

Every phase addresses six cross-cutting aspects, so they grow with the game instead of being bolted on at the end:

- **Dev docs**: `docs/dev/` explains each system and how to extend it.
- **Help system**: in-game player help for what that phase added.
- **Admin utilities**: debug and admin tools for testing that phase.
- **Audio**: sound for what that phase added.
- **Player settings**: settings that phase needs.
- **Keyboard assignments**: bindings that phase adds, all remappable.

**Architecture note:** the game server is authoritative, even while only one player connects. Solo runs use the same server path as co-op, so Phase 3 adds multiplayer flow rather than rewriting the game.

---

## Ready
how many creatures are spawned, respawn
armor doesn't seem to be working
legendary, epic, or quest find audio

Gloaming Rite: We are going to flush out the complete rite requirements and hints.
- Full requirements: 5 candles, 1 chalk, the Pendant. 
- Do not spawn the pendant quest item if anyone in the party has 1.
- There are three hints, one for the candle, 1 for the chalk, and 1 for the pendant. Invent text for each of these hints.
- Players can find hints in loot boxes or laying on furniture, tables, coffins.
- Revealed hint text will show up on the Affliction page, as well as above the requirements in the expedition affliction overlay. 
- The requirement slots on the affliction pane should show question marks if unknown, greyed if discovered but the user doesn't have an item, and show the item if it is in the players stash or backpack. Make them smaller like on the overlay.
- Update the affliction description to be in line with this new story of hints.
- Solving a rite doesn't automatically extract explorers, but it does kill the affliction and resolve it. Explorers must still extract.
- Add a way for players to reset an affliction status back to undiscovered and unresolved.
- The top of the screen should show the time left before they must extract. 
- Underneath the time, add a thin red status bar, maybe 4px heigh with a red border, and a red background for the progress of when the affliction arrives.
- Unrelated change, under the stash, add a button to sell all treasure.
- Bricks should be less frequent and be in places where there's rubble. Then there should be 1-3 bricks.

## Backlog: Beta polish and deployment

- Fix map clipping
- Review Lore and Flavor text
- Full audio pass and mix
- Help system complete and reviewed
- Settings complete: graphics, audio, controls, accessibility
- Performance pass (light budget, model LODs, network bandwidth)
- Asset delivery for production. Today every asset is fetched the first time it's used, so players only download what they see. The gaps:
  - Affliction-owned assets: add `affliction?` to `KitEntry` so `gloaming-chapel` only shows up in Gloaming maps. Reorganize `static/assets/` (and `art/export/`) into `shared/`, `ui/` and `afflictions/<id>/`.
  - Preload per run: a `preloadRun(layout, affliction)` in `src/lib/game/assets.ts` warms the model, character and sound caches during a descent progress bar, so nothing loads mid-run (no late footsteps, no boss pop-in). The hub prefetches the core set in the background.
  - Shrink: Opus instead of WAV in `build-audio.ts` (~5 MB → ~0.5 MB). Meshopt in `build-assets.ts` plus `MeshoptDecoder` (explorer 3.9 MB, witch 2.4 MB, ossuary-hall 1.5 MB). KTX2 textures later, with LODs.
  - Cache forever: content-hash every built file name (map textures already are), look up hand-written content URLs through a generated `assetUrl()`, and serve `/assets/*` as `immutable` with a one-year max-age from a CDN or reverse proxy in front of adapter-node.
  - Baseline: 21.7 MB total in `static/assets` (Nov 2026).
- Prefetch assets with progress shown on dashboard
- Balance pass: meter pacing, loot values, Thrall difficulty, candle tiers
- Bug and crash reporting

## Backlog - Post Beta

- Doors
- SSO with Discord and Steam, Link a provider to an existing email account
- Password recovery (needs an email service)
- Keybinding screen with conflict detection and reset to defaults: players can change every keyboard shortcut themselves. It goes in the Controls group of the settings screen, which only lists the current bindings for now. Not needed before this phase.
- Allow Explorer images
- Equip chalk symbols like emotes: choose the eight on your chalk wheel (`markWheel`, see docs/dev/marks.md)
- Shoulder swap weapons
- Shrines: hold one item through death or extraction
- Quests
- Explorer Levels and Skill Tree
- Several explorers per account
- Crafting as a player skill: recipes, craft time, requires light, noise
- Secret doors in the connector kit: hidden passages found with interact or pried open, fake walls
- Traps
- Water: wet items, drying near flame, wet batteries short out, waterproof packs, oilcloth pouches
- Start room variant: rappel down a rope that can be taken, removing that route back up (moved from Phase 1)
- Crowbar utility: prying niches, coffins, secret doors
- Light sources: candles (tiers, burn-down, placeable), lighter, torches, glow sticks (throwable)
- Out-of-expedition crafting, and crafting skill progression saved (moved from Phase 5)
- Gear durability and repair costs; repair in the hub (moved from Phase 5)
- Rope, climbing, descending, mapping by laying out on ground
- Jumping, mantling
