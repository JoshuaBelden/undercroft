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

## Available

- Move the social button to the left
- Real loot types, containers and loot tables (Phase 5 has one stand-in item)
- Loot spawning by depth
- Gloaming rite, full requirements: 5 candles, 1 chalk, the Pendant
- Turn the J rite info into an actual overlay
- Players can crawal when downed
- Players can press space bar for 1 second to Surrender
- descending count down should blur the background more
- Change the click to descend overlay to say Take Control
- Players can abandon the expedition
- clip and add rummage sound

## Backlog: Beta polish

- Bricks are thrown not melee
- Update creature ai so i can hide from them
- Add item models that show in hands
- Add actual model for the Affliction
- Shrines: hold one item through death or extraction
- Add icon images to items
- Add audio assets
- Crafting as a player skill: recipes, craft time, requires light, noise
- Chalk marks on walls (one per stick)
- Secret doors in the connector kit: hidden passages found with interact or pried open (moved from Phase 1)
- Water: wet items, drying near flame, wet batteries short out, waterproof packs, oilcloth pouches
- Start room variant: rappel down a rope that can be taken, removing that route back up (moved from Phase 1)
- Crowbar utility: prying niches, coffins, secret doors
- Light sources: candles (tiers, burn-down, placeable), lighter, torches, glow sticks (throwable)
- Out-of-expedition crafting, and crafting skill progression saved (moved from Phase 5)
- Gear durability and repair costs; repair in the hub (moved from Phase 5)
- Full audio pass and mix
- Help system complete and reviewed
- Settings complete: graphics, audio, controls, accessibility
- Keybinding screen with conflict detection and reset to defaults: players can change every keyboard shortcut themselves. It goes in the Controls group of the settings screen, which only lists the current bindings for now. Not needed before this phase.
- Performance pass (light budget, model LODs, network bandwidth)
- Balance pass: meter pacing, loot values, Thrall difficulty, candle tiers
- Admin tools consolidated into one admin panel
- Bug and crash reporting
- Closed beta with friends
- Sign in with Discord
- Sign in with Steam
- Link a provider to an existing email account
- Several explorers per account
- Password recovery (needs an email service)
