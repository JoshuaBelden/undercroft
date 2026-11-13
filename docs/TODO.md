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
- Performance: check F3 stats (fps, draw calls) on a low-end machine, then decide on KTX2 textures (GPU memory) and LODs. Asset baseline: 15 MB in `static/assets` (textures are 3.9 MB of it).
- Fill in the remaining Credits placeholders (`todo: true` in src/lib/content/credits.ts): inspirations, the image generator, any AI sound or writing tools, testers. Name the Freesound creators whose sounds are CC BY.

## Backlog - Post Beta Ideas

- Discord avatar pulled over
- Design and Implement a Logo
- Allow Explorer model and images changes
- Show gamer tags above explorer models
- Report players feature (maybe)
- Creatures should be able to crawl
- mapping tools
- Door Mechanics
- Equip chalk symbols like emotes: choose the eight on your chalk wheel (`markWheel`, see docs/dev/marks.md), perhaps free type?
- Shoulder swap weapons
- fine tune loot tables
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
- Balance pass, after more map work and beta testing. Each run is now logged on the server (outcome, time, depth, kills, crates, value carried out, when the Gloaming came) and summed up on the admin dashboard (docs/dev/admin.md#stats): tune from that. Starting points from the numbers (Nov 2026): a bandage heals 25, less than one creature hit (30); the Gloaming's presence drains 8 sanity/s within 3.5 m (about 12 s to down you, before its touch); crates near the start are worth about 32 against 107 at the far end; the meter brings the Gloaming at 30 min by time alone, nearer 20 with a big haul; candles and chalk for the rite are plentiful (about 7 candles a map). Also meter pacing, loot values, creature difficulty, candle tiers.
- Keybinding screen with conflict detection and reset to defaults: players can change every keyboard shortcut themselves. It goes in the Controls group of the settings screen, which only lists the current bindings for now. Not needed before this phase.
