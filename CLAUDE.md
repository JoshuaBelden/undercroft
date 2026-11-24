# CLAUDE.md

**Undercroft**. A co-op (and solo) third-person horror extraction game set in the catacombs.

- Work items: GitHub Issues (https://github.com/JoshuaBelden/undercroft/issues)
- Dev docs: `docs/dev/`
- **WICK**, the engine being drawn out of Undercroft into `wick/`: `docs/wick-roadmap.md` is its plan and status (it overrides older notes; no issue per milestone). Work on it pauses between milestones; to pick it back up, follow its "How to resume".

Before designing a gameplay feature, read its issue and the `docs/dev/` doc for each system it touches: they hold the design as it stands. Work in progress is the `Beta` milestone; post-beta ideas carry the `backlog` label. Stay inside the scope of the issue you're working on. Issues labelled `from-game` are bug reports filed by players from inside the game.

## Every feature covers

Each feature addresses six cross-cutting aspects, so they grow with the game instead of being bolted on at the end:

- **Dev docs**: `docs/dev/` explains each system and how to extend it.
- **Help system**: in-game player help for what it added.
- **Admin utilities**: debug and admin tools for testing it.
- **Audio**: sound for what it added (registered in `sounds.ts`; recordings only, never synthesized).
- **Player settings**: settings it needs.
- **Keyboard and controller assignments**: bindings it adds, keys and controller buttons, all remappable.

## Tech stack

- **SvelteKit** (TypeScript, strict): UI, hub, menus, accounts, API routes
- **Three.js**: all 3D rendering (client only)
- **Game server**: separate Node process using WebSockets, server-authoritative simulation (`/server`)
- **MongoDB** running in **Docker** (`docker compose`)
- **pnpm** only. Never use npm or yarn.
- **Assets**: modeled in Blender, exported as glTF to `art/export/`, optimized into `static/assets/` by `pnpm asset:build`. Raw art (`art/`) is the private undercroft-art repo in Git LFS (docs/dev/asset-pipeline.md#raw-art)

## Commands

```
pnpm install            # install deps
docker compose up -d    # start MongoDB
pnpm dev:all            # MongoDB, then site + game server + admin app together, colour-prefixed
pnpm dev                # SvelteKit client
pnpm dev:server         # game server (watch mode)
pnpm dev:admin          # admin app (admin/, port 5174; docs/dev/admin.md)
pnpm university:dev     # the WICK University, the engine's docs and demos (wick/university, port 5175)
pnpm desktop:dev        # desktop app: local site + game server + save, Steam co-op (docs/dev/hosting.md)
pnpm desktop:build      # desktop app: desktop/release/win-unpacked + installer
pnpm steam:upload       # SteamPipe build script; uploads only with --upload (docs/dev/desktop.md)
pnpm admin:grant <email> # make an account an admin (--remove to undo)
pnpm build              # production build (adapter-node)
pnpm check              # svelte-check + TypeScript
pnpm lint               # Prettier check + ESLint
pnpm test               # unit tests (Vitest; pnpm test:watch to rerun on save)
pnpm test:coverage      # unit tests with a coverage report (coverage/index.html)
pnpm format             # Prettier
pnpm asset:dev          # regenerate the placeholder dev asset
pnpm asset:export       # art/blender/catacomb-kit.blend -> art/export/<piece>.glb, headless Blender
pnpm asset:build        # art/export/*.glb -> optimized static/assets/map + piece manifest
pnpm asset:audio        # art/sfx/*.wav -> Opus in static/assets/shared/audio + sound file list
pnpm asset:images       # art/images/*.png -> WebP in static/assets/ui/images (interface art)
pnpm asset:levels       # how loud every sound plays, for mixing; writes levels for the admin Art & Assets page (docs/dev/player.md#mix)
pnpm deploy:provision   # create the DigitalOcean droplet (needs DIGITALOCEAN_ACCESS_TOKEN)
pnpm release <bump>     # after /release-notes: version, commit, tag, GitHub release, deploy (docs/dev/releasing.md)
pnpm deploy:release     # ship git HEAD to the droplet (docs/dev/deployment.md)
```

## Development rules

- **Unit tests** with Vitest, for the shared game logic and the game server (a real `Session` runs in tests with fake sockets and no database). Colocate them as `*.test.ts` next to the code. No other test frameworks. See `docs/dev/testing.md`.
- **No Playwright or browser automation tests.**
- **Zero errors, zero warnings.** Every change must leave `pnpm check`, `pnpm lint` and `pnpm test` clean. This includes Svelte compiler warnings (a11y, unused props, reactivity), TypeScript errors, and lint warnings.
- **Fix warnings, don't suppress them.** Ignore comments only when truly unavoidable, with a one-line reason next to them.
- Run `pnpm check`, `pnpm lint` and `pnpm test` before considering any task complete. A change to shared or server logic comes with tests for it.
- **Branches**: never commit to `main`. Each issue gets its own branch named `<issue-id>-<feature-name>` in kebab-case (`4-credits-cleanup`, `51-map-sketching`), and lands through a pull request to `main` whose description closes the issue (`Closes #4`).
- **One feature at a time.** Never create more than one branch or open more than one PR. Work stays on the current feature's branch and PR until it's merged; don't split work into extra branches, stacked PRs, or parallel worktrees.

## Architecture rules

- **Server is authoritative** for game state: positions, the Affliction meter, Thralls, items, loot, sanity, rite progress. Clients send inputs and render.
- **Solo runs use the same server path** as co-op (one client connected). No separate single-player code path.
- **Map generation is seeded and server-side.** The server picks the seed, generates the layout, and sends it to clients. Clients only build geometry from the layout they receive.
- **Shared types** between client and server live in `src/lib/shared/`.
- **Imports**: SvelteKit 3 uses `#lib/...` subpath imports with explicit extensions (`#lib/game/Engine.ts`, `#lib/settings/settings.svelte.ts`). The server imports shared code by relative path with `.ts` extensions. WICK packages are imported by name (`@wick/audio`).
- **WICK's boundary**: nothing in `wick/` imports anything outside `wick/` (no `#lib`, no relative path out); game content reaches WICK as parameters, passed in by a thin Undercroft bootstrap at the old path (`src/lib/game/audio/AudioManager.ts`). ESLint enforces it. A WICK package's change comes with its University chapter updated.
- **Environment variables**: client-visible variables are declared in `src/env.ts` and read from `$app/env/public`. The server reads `process.env` via `server/config.ts`.
- **Game content is data-driven.** Afflictions, Thralls, items, recipes, candle tiers, rooms, and loot tables are defined as data, not hardcoded in logic.
- **Input**: never hardcode keys or buttons. All input, keyboard, mouse and controller, goes through the input map so bindings stay remappable. Every new action gets a controller button (or none) in `PAD_DEFAULTS` (see `docs/dev/controller.md`).
- **Audio**: all sound goes through the audio manager (WICK's `@wick/audio`, set up in `src/lib/game/audio/`; categories: master, music, ambience, SFX). No voice chat in the first beta.
- **Never synthesize sounds in code.** Every sound is a recording. A new sound goes into `sounds.ts` with its `file` id and stays silent until the recording is built; the admin Art & Assets page lists it as missing so the user knows what to record. No procedural/placeholder audio (oscillators, noise buffers) as a stand-in.
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
    shared/testing/ # fixtures for *.test.ts (real maps, hand-built worlds)
  routes/       # SvelteKit pages and API routes
server/         # authoritative game server
admin/          # admin app (separate SvelteKit app, shares src/lib/server/store)
desktop/        # desktop app (Electron + steamworks.js): the client in a window, with Steam
scripts/        # one-off tooling (asset generation)
static/assets/  # .glb models, textures, audio (optimized, committed)
art/            # raw art: .blend, 4K textures, raw exports (its own private repo, undercroft-art, in Git LFS; ignored here)
wick/           # WICK, the engine: packages/<name> (@wick/<name>), university/ (docs + demos); its plan is docs/wick-roadmap.md
docs/
  dev/          # developer docs, updated as features land
```

## Documentation

When a feature lands, update in the same change:

- `docs/dev/`: how the system works and how to extend it
- Player help content, if the feature is player-facing
- The GitHub issue: reference it in the commit (`Closes #12`) so it closes when pushed
- No changelog file: release notes are written for each release from the commits since the last (the `release-notes` skill), so give each commit a subject that says what changed
- `src/lib/content/credits.ts`: a credit for any new third-party asset or source
