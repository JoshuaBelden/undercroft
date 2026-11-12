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

- admin screen escape should close, not open settings
- Weapon reload mechanics, audio
- Add item models that show in hands
- Improved background image on dashboard
- Explore and extract effects
- Players should see other users health
- Affliction status is based off of the host. So if a host hasn't uncovered an affliction, they still have to find clues
- Allow Explorer images
- Bricks are thrown not melee
- Update creature ai so explorers can hide from them
- Shrines: hold one item through death or extraction
- Chalk marks on walls (one per stick)
- We need bigger maps with multiple extraction rooms
- Gloaming rite, full requirements: 5 candles, 1 chalk, the Pendant
- Review Lore and Flavor text

## Backlog: Beta polish and deployment

- Full audio pass and mix
- Help system complete and reviewed
- Settings complete: graphics, audio, controls, accessibility
- Keybinding screen with conflict detection and reset to defaults: players can change every keyboard shortcut themselves. It goes in the Controls group of the settings screen, which only lists the current bindings for now. Not needed before this phase.
- Performance pass (light budget, model LODs, network bandwidth)
- Asset delivery for production. Today every asset is fetched the first time it's used, so players only download what they see. The gaps:
  - Affliction-owned assets: add `affliction?` to `KitEntry` so `gloaming-chapel` only shows up in Gloaming maps. Reorganize `static/assets/` (and `art/export/`) into `shared/`, `ui/` and `afflictions/<id>/`.
  - Preload per run: a `preloadRun(layout, affliction)` in `src/lib/game/assets.ts` warms the model, character and sound caches during a descent progress bar, so nothing loads mid-run (no late footsteps, no boss pop-in). The hub prefetches the core set in the background.
  - Shrink: Opus instead of WAV in `build-audio.ts` (~5 MB → ~0.5 MB). Meshopt in `build-assets.ts` plus `MeshoptDecoder` (explorer 3.9 MB, witch 2.4 MB, ossuary-hall 1.5 MB). KTX2 textures later, with LODs.
  - Cache forever: content-hash every built file name (map textures already are), look up hand-written content URLs through a generated `assetUrl()`, and serve `/assets/*` as `immutable` with a one-year max-age from a CDN or reverse proxy in front of adapter-node.
  - Baseline: 21.7 MB total in `static/assets` (Nov 2026).
- Balance pass: meter pacing, loot values, Thrall difficulty, candle tiers
- Admin tools consolidated into one admin panel
- Bug and crash reporting
- Sign in with Discord
- Sign in with Steam
- Link a provider to an existing email account
- Password recovery (needs an email service)
- Closed beta with friends

## Backlog - Post Beta

- Quests
- Explorer Levels and Skill Tree
- Several explorers per account
- Crafting as a player skill: recipes, craft time, requires light, noise
- Secret doors in the connector kit: hidden passages found with interact or pried open (moved from Phase 1)
- Water: wet items, drying near flame, wet batteries short out, waterproof packs, oilcloth pouches
- Start room variant: rappel down a rope that can be taken, removing that route back up (moved from Phase 1)
- Crowbar utility: prying niches, coffins, secret doors
- Light sources: candles (tiers, burn-down, placeable), lighter, torches, glow sticks (throwable)
- Out-of-expedition crafting, and crafting skill progression saved (moved from Phase 5)
- Gear durability and repair costs; repair in the hub (moved from Phase 5)
