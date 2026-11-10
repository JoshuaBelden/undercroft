# Undercroft: Phase Plan (Start → Beta)

Goal: a playable beta with **one Affliction (Gloaming)**, solo and co-op, full extraction loop, hub, and economy. **No voice chat in the first beta.**

Every phase addresses six cross-cutting aspects, so they grow with the game instead of being bolted on at the end:

- **Dev docs**: `docs/dev/` explains each system and how to extend it.
- **Help system**: in-game player help for what that phase added.
- **Admin utilities**: debug and admin tools for testing that phase.
- **Audio**: sound for what that phase added.
- **Player settings**: settings that phase needs.
- **Keyboard assignments**: bindings that phase adds, all remappable.

**Architecture note:** the game server is authoritative from Phase 0, even while only one player connects. Solo runs use the same server path as co-op, so Phase 3 adds multiplayer flow rather than rewriting the game.

---

## Phase 0: Foundation ✅

- [x] SvelteKit + TypeScript (strict) + Three.js with pnpm
- [x] MongoDB in Docker (`docker compose`)
- [x] ESLint, Prettier, `svelte-check` passing with zero warnings
- [x] Game server scaffold (Node + WebSockets), single client connecting
- [x] Shared types folder between client and server
- [x] Asset pipeline: Blender → `.glb` → loaded in Three.js
- [x] `CLAUDE.md` in place

Aspects:

- [x] **Dev docs**: setup guide, project structure, asset pipeline.
- [x] **Help system**: help panel component and content format (empty).
- [x] **Admin**: dev mode flag; FPS and stats overlay.
- [x] **Audio**: audio manager with volume categories (master, music, ambience, SFX).
- [x] **Settings**: settings store with persistence; settings menu shell.
- [x] **Keybinds**: input map abstraction; nothing reads raw keys.

## Phase 1: Map and expedition

A generated Gloaming map you can start an expedition into, explore, and extract from.

- Start an expedition: server creates a session, picks a seed, client generates the map
- [x] First-person controller: walk, sprint, crouch, crawl, look; stamina
- [x] Collision against map geometry
- [x] Headlamp with settings (off, low, bright), battery drain, starter flicker
- [x] Dynamic lighting with a light budget
- [x] Grid-based generator: 5 static major rooms (Stairwell, Ossuary Hall, Quarry Gallery, Cistern, Gloaming Chapel), random connections
- Connector kit: halls, square rooms, canals, squeezes, crawlspaces, secret doors, swim sections, depth transitions (done: halls, junctions, square rooms, crypt, side rooms, squeezes, crawlspaces, dead ends, stairs down; still to do: canals, secret doors, swim sections)
- [x] Map graph: guaranteed path from start to the Chapel, plus loops
- Start room variants: stairs or rappel rope (rope can be taken)
- Extraction points defined in room models; extracting ends the expedition
- Swimming with breath tied to stamina
- Room banners on entering major rooms

Aspects:

- **Dev docs**: networking model, movement and prediction, lighting budget, generator algorithm, building and tagging room models and connector pieces in Blender.
- **Help system**: movement, stamina, headlamp, extraction, squeezes, swimming.
- **Admin**: seed input, regenerate map, map debug view, noclip, teleport, reveal secret doors, infinite battery/stamina.
- **Audio**: footsteps (by surface), breathing tied to stamina, headlamp click, dripping, distant echoes, swim/underwater audio, tight-space muffling.
- **Settings**: mouse sensitivity, invert Y, FOV, graphics quality, brightness/gamma calibration.
- **Keybinds**: move, sprint, crouch, crawl, headlamp mode, interact, swim up/down, climb/rappel.

## Phase 2: Creatures and combat

- Sanity as health; downed state; revive (smelling salts, auto-used solo); bandages
- Minimal inventory to support weapons, ammo, and healing (full inventory comes in Phase 4)
- Gloaming Thrall: half-light visibility, slow approach and fast bursts, melee attack
- Thrall AI on the server: perception (light, sound), pathing on the grid
- Melee: crowbar, knife, brick
- Ranged: revolver, shotgun, ammo; gunfire noise
- Affliction meter (~30 min): time, loot carried, kills
- Omens: escalating effects by meter stage (sounds, flicker, failing lights, whispers)
- Manifestation at 100%: spawns somewhere and hunts
- Banishing the manifestation → extraction without resolving

Aspects:

- **Dev docs**: Thrall AI, half-light visibility system, combat, Affliction meter and omen staging.
- **Help system**: sanity, reviving, combat, Thralls (light behavior), what omens mean (vaguely).
- **Admin**: set meter %, force manifestation, spawn Thrall, god mode, show Thrall positions, give weapons/ammo.
- **Audio**: Thrall tells and attacks, sanity effects (heartbeat, whispers), omen layers by stage, manifestation signal, melee and weapon sounds.
- **Settings**: subtitles and sound captions, camera shake intensity.
- **Keybinds**: attack, aim, reload, revive, use item, weapon slots.

## Phase 3: Multiplayer

- Multiple clients per session; other players interpolated, local player predicted
- Parties: create, invite by code, ready up, descend together
- Session hosting on DigitalOcean (game server + MongoDB in Docker)
- Reconnection handling
- Spectating when dead until the team extracts or wipes
- Text chat and pings (no voice chat)
- Solo vs. co-op balance (Thrall aggression, meter pacing)

Aspects:

- **Dev docs**: session lifecycle, party flow, hosting and deployment on DigitalOcean.
- **Help system**: co-op, parties, reviving teammates, pings.
- **Admin**: session list, kick, server health, force-end session, network stats.
- **Audio**: other players' footsteps, breathing, and actions with distance attenuation; ping sounds.
- **Settings**: chat options (on/off, size), name display.
- **Keybinds**: ping, chat, scoreboard/party view.

## Phase 4: Items and the rite

- Full inventory: weight and size, pick up, drop, hand off (any player can pick up dropped loot)
- Light sources: candles (tiers, burn-down, placeable), lighter, torches, glow sticks (throwable)
- Chalk marks on walls (one per stick)
- Crowbar utility: prying niches, coffins, secret doors
- Crafting as a player skill: recipes, craft time, requires light, noise
- Water: wet items, drying near flame, wet batteries short out, waterproof packs, oilcloth pouches
- Loot spawning by depth
- Shrines: hold one item through death or extraction
- Rite panel: viewable by every player any time
- Generic clues reveal requirement slots; last clue reveals rite location
- Rite progress recorded across runs
- Item pooling to the rite holder; holder initiates in the valid room
- Gloaming rite: 5 candles, 1 chalk, the Pendant
- Resolution → automatic extraction and progression unlock

Aspects:

- **Dev docs**: item data format, recipes, loot tables, rite data format, adding clues and requirements.
- **Help system**: inventory, crafting, candles, chalk, water, shrines, rites, clues, the holder.
- **Admin**: spawn item, give all recipes, set wetness, spawn shrine, reveal all clues, reset rite progress, give rite items, teleport to rite room.
- **Audio**: pickup/drop, candle light and snuff, chalk scraping, crafting, wet sounds, clue sting, rite initiation and resolution.
- **Settings**: HUD options (inventory display, item prompts).
- **Keybinds**: inventory, quick slots, drop, throw, craft menu, place light, chalk mark, rite panel, initiate rite.

## Phase 5: Hub, economy, persistence

- Accounts and player persistence (MongoDB)
- Hub: shop (purchased gear), selling loot, repair, stash, out-of-expedition crafting
- Gear durability and repair costs
- Loadout before descent
- Death and extraction outcomes applied to stash and money
- Crafting skill progression saved

Aspects:

- **Dev docs**: data models, economy values and where to tune them.
- **Help system**: hub, shop, repair, loadouts, death penalties.
- **Admin**: grant money/items, edit player data, reset account, economy logs.
- **Audio**: hub ambience and music, shop/UI sounds.
- **Settings**: account settings.
- **Keybinds**: hub navigation, UI shortcuts.

## Phase 6: Beta polish

- Full audio pass and mix
- Help system complete and reviewed
- Settings complete: graphics, audio, controls, accessibility
- Keybinding screen with conflict detection and reset to defaults
- Performance pass (light budget, model LODs, network bandwidth)
- Balance pass: meter pacing, loot values, Thrall difficulty, candle tiers
- Admin tools consolidated into one admin panel
- Bug and crash reporting
- Closed beta with friends

Aspects:

- **Dev docs**: complete and current for every system.
- **Help system**: first-run onboarding through the Gloaming.
- **Admin**: one consolidated panel, player reports.
- **Audio**: final mix, music cues.
- **Settings**: complete.
- **Keybinds**: complete, remappable, conflict-checked.
