# CLAUDE.md

**Undercroft**. A co-op (and solo) first-person horror extraction game set in the catacombs.

- Game design: `docs/HANDOFF.md`
- Work items: GitHub Issues (https://github.com/JoshuaBelden/undercroft/issues)
- Dev docs: `docs/dev/`

Read `docs/HANDOFF.md` before designing any gameplay feature. Work in progress is the `Beta` milestone; post-beta ideas carry the `backlog` label. Stay inside the scope of the issue you're working on. Issues labelled `from-game` are bug reports filed by players from inside the game.

## Every feature covers

Each feature addresses six cross-cutting aspects, so they grow with the game instead of being bolted on at the end:

- **Dev docs**: `docs/dev/` explains each system and how to extend it.
- **Help system**: in-game player help for what it added.
- **Admin utilities**: debug and admin tools for testing it.
- **Audio**: sound for what it added.
- **Player settings**: settings it needs.
- **Keyboard assignments**: bindings it adds, all remappable.

## Tech stack

- **SvelteKit** (TypeScript, strict): UI, hub, menus, accounts, API routes
- **Three.js**: all 3D rendering (client only)
- **Game server**: separate Node process using WebSockets, server-authoritative simulation (`/server`)
- **MongoDB** running in **Docker** (`docker compose`)
- **pnpm** only. Never use npm or yarn.
- **Assets**: modeled in Blender, exported as glTF to `art/export/`, optimized into `static/assets/` by `pnpm asset:build`

## Commands

```
pnpm install            # install deps
docker compose up -d    # start MongoDB
pnpm dev                # SvelteKit client
pnpm dev:server         # game server (watch mode)
pnpm dev:seed [email]   # dev: fill explorers' stashes with items to test with
pnpm dev:admin          # admin app (admin/, port 5174; docs/dev/admin.md)
pnpm admin:grant <email> # make an account an admin (--remove to undo)
pnpm build              # production build (adapter-node)
pnpm check              # svelte-check + TypeScript
pnpm lint               # Prettier check + ESLint
pnpm format             # Prettier
pnpm asset:dev          # regenerate the placeholder dev asset
pnpm asset:build        # art/export/*.glb -> optimized static/assets/map + piece manifest
pnpm asset:audio        # art/sfx/*.wav -> Opus in static/assets/shared/audio + sound file list
pnpm asset:images       # art/images/*.png -> WebP in static/assets/ui/images (interface art)
pnpm asset:levels       # how loud every sound plays, for mixing (docs/dev/player.md#mix)
pnpm deploy:provision   # create the DigitalOcean droplet (needs DIGITALOCEAN_ACCESS_TOKEN)
pnpm release <bump>     # version + dated release notes + tag (docs/dev/releasing.md)
pnpm deploy:release     # ship git HEAD to the droplet (docs/dev/deployment.md)
```

## Development rules

- **No unit tests.** Do not create test files or add test frameworks.
- **No Playwright or browser automation tests.**
- **Zero errors, zero warnings.** Every change must leave `pnpm check` and `pnpm lint` clean. This includes Svelte compiler warnings (a11y, unused props, reactivity), TypeScript errors, and lint warnings.
- **Fix warnings, don't suppress them.** Ignore comments only when truly unavoidable, with a one-line reason next to them.
- Run `pnpm check` and `pnpm lint` before considering any task complete.

## Architecture rules

- **Server is authoritative** for game state: positions, the Affliction meter, Thralls, items, loot, sanity, rite progress. Clients send inputs and render.
- **Solo runs use the same server path** as co-op (one client connected). No separate single-player code path.
- **Map generation is seeded and server-side.** The server picks the seed, generates the layout, and sends it to clients. Clients only build geometry from the layout they receive.
- **Shared types** between client and server live in `src/lib/shared/`.
- **Imports**: SvelteKit 3 uses `#lib/...` subpath imports with explicit extensions (`#lib/game/Engine.ts`, `#lib/settings/settings.svelte.ts`). The server imports shared code by relative path with `.ts` extensions.
- **Environment variables**: client-visible variables are declared in `src/env.ts` and read from `$app/env/public`. The server reads `process.env` via `server/config.ts`.
- **Game content is data-driven.** Afflictions, Thralls, items, recipes, candle tiers, rooms, and loot tables are defined as data, not hardcoded in logic.
- **Input**: never hardcode keys. All input goes through the input map so keybindings stay remappable.
- **Audio**: all sound goes through the audio manager (categories: master, music, ambience, SFX). No voice chat in the first beta.
- **Settings**: all player settings go through the settings store and persist.
- **Admin/debug tools** are gated behind dev mode or the admin role and never ship enabled to players.
- **Lighting budget**: lights are dynamic (procedural maps, no baked lighting). Respect the max active light count; candles, headlamps, torches, and glow sticks all count.

## Project structure

```
src/
  env.ts        # environment variable definitions
  lib/
    game/       # client: engine, input, audio, networking
    settings/   # persisted player settings store
    shared/     # protocol, types and constants shared with server
    ui/         # Svelte components (HUD, menus, hub, help, admin)
    content/    # data definitions (help topics, afflictions, items, rooms...)
    dev.ts      # dev mode flag
  routes/       # SvelteKit pages and API routes
server/         # authoritative game server
admin/          # admin app (separate SvelteKit app, shares src/lib/server/store)
scripts/        # one-off tooling (asset generation)
static/assets/  # .glb models, textures, audio (optimized, committed)
art/            # raw art: .blend, 4K textures, raw exports (gitignored)
docs/
  HANDOFF.md
  LORE.md
  dev/          # developer docs, updated as features land
```

## Documentation

When a feature lands, update in the same change:

- `docs/dev/`: how the system works and how to extend it
- Player help content, if the feature is player-facing
- The GitHub issue: reference it in the commit (`Closes #12`) so it closes when pushed
- `CHANGELOG.md`: a line under `## Unreleased`, written for players, if they will notice it
- `src/lib/content/credits.ts`: a credit for any new third-party asset, tool or source
