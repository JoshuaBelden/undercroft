# Undercroft Work Items

Every phase addresses six cross-cutting aspects, so they grow with the game instead of being bolted on at the end:

- **Dev docs**: `docs/dev/` explains each system and how to extend it.
- **Help system**: in-game player help for what that phase added.
- **Admin utilities**: debug and admin tools for testing that phase.
- **Audio**: sound for what that phase added.
- **Player settings**: settings that phase needs.
- **Keyboard assignments**: bindings that phase adds, all remappable.

**Architecture note:** the game server is authoritative, even while only one player connects. Solo runs use the same server path as co-op, so Phase 3 adds multiplayer flow rather than rewriting the game.

## Ready: Beta polish and deployment

- Audio: recordings for the 21 sounds still synthesized (`pnpm asset:levels` lists them: melee, bricks, bullet impacts, being hurt, heartbeat, whispers, the manifestation, rite and clue bells, store purchase), then a listening pass on the new mix (docs/dev/player.md#mix).
- Help system complete and reviewed
- Performance pass: compare F3 stats (fps, draw calls) before and after the map merge and lamp shadow skipping on a low-end machine, then decide on KTX2 textures (GPU memory) and LODs. Asset baseline: 15 MB in `static/assets` after meshopt and Opus (Nov 2026; textures are 3.9 MB of it). Done: compressed ticks (about 200 bytes for four players, see docs/dev/systems.md), the map merged into chunks, shadows only for lamps lighting the view.
- Set `SOURCE_URL` in src/lib/content/credits.ts once the GitHub repository is public.
- Fill in the Credits placeholders (`todo: true` in src/lib/content/credits.ts): inspirations, model, animation and sound sources, AI tools, testers.
- Balance pass: meter pacing, loot values, Thrall difficulty, candle tiers

## Backlog - Post Beta Ideas

- Bug and crash reporting, feature request, feedback
- fine tune loot tables
- mapping
- Creatures should be able to crawl
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
- feats, season pass
- controller support
