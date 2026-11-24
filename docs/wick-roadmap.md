# WICK roadmap

**WICK** (WebGL Integrated Creation Kit) is the engine being drawn out of Undercroft, one system at a time, so another browser game can be built on it: Three.js and 3D models, input, audio, settings, multiplayer, membership and tooling.

**This file is the plan and its status.** It overrides older issues and notes about the engine, and no GitHub issue is needed per milestone. Work on WICK pauses between milestones while Undercroft features go on. When you come back, start at [How to resume](#how-to-resume).

## Status

| #   | Milestone                                    | Status      | Done       | Merge                 |
| --- | -------------------------------------------- | ----------- | ---------- | --------------------- |
| 1   | [Foundation + Audio](#1-foundation--audio)   | **done**    | 2026-11-24 | branch `wick-1-audio` |
| 2   | [Render](#2-render)                          | **next**    |            |                       |
| 3   | [Input](#3-input)                            | not started |            |                       |
| 4   | [Settings](#4-settings)                      | not started |            |                       |
| 5   | [Multiplayer: client](#5-multiplayer-client) | not started |            |                       |
| 6   | [Multiplayer: server](#6-multiplayer-server) | not started |            |                       |
| 7   | [Membership](#7-membership)                  | not started |            |                       |
| 8   | [Tooling](#8-tooling)                        | not started |            |                       |

After milestone 8, the [cleanup inside Undercroft](#after-the-roadmap-cleanup-inside-undercroft) continues at the same pace.

## How to resume

1. **Read this file**, then the University's [Architecture](../wick/university/src/routes/architecture/+page.svelte) chapter and the last finished milestone's chapter, to see the pattern in practice. Audio is the reference: `wick/packages/audio`, its bootstrap in `src/lib/game/audio/`, and its chapter.
2. **Find the milestone marked _next_** in the table.
3. **Re-survey its files before starting.** Undercroft has kept growing since the checklist was written: new sounds, actions, settings, systems. Check the milestone's _Inject and move_ list against the code (`git log --since=<the last Done date> -- <those paths>`), update the checklist here, and add anything that changed to [Drift notes](#drift-notes).
4. **Branch** `wick-<n>-<name>` from `main`, for example `wick-2-render`. One milestone at a time: never two WICK branches, or a WICK branch beside a feature branch.
5. **Do the checklist**, using [the technique](#the-technique-inject-move-bootstrap).
6. **Verify** (each milestone's _Verify_ list, plus `pnpm check`, `pnpm lint` and `pnpm test` all clean).
7. **Update this file in the same branch.** Mark the milestone done with the date, mark the following one _next_, and record anything learned under [Decisions](#decisions) or [Drift notes](#drift-notes). Then merge.

## The technique: inject, move, bootstrap

Every module crosses into WICK the same way:

1. **Inject.** In Undercroft, replace the module's imports of game content (`#lib/content/...`) and of global state (`settings`, singletons) with parameters: a config object, a catalog, an interface the game implements. `src/lib/shared/map/generate.ts` already works this way (the kit and pieces are passed in). Tests stay green.
2. **Move.** `git mv` the module and its colocated tests into `wick/packages/<name>/src/`, so history follows. Tests that leaned on Undercroft's content get a small fixture instead (see `wick/packages/audio/src/SoundBank.test.ts`).
3. **Bootstrap.** Leave a thin Undercroft module at the old path that hands WICK the game's content. Usually that's a subclass whose constructor passes the config (`src/lib/game/audio/AudioManager.ts`). The rest of Undercroft keeps importing the old path, so the move barely touches it.
4. **Teach it.** Write the package's University chapter, in an engineering voice for junior engineers: what the system is for, the underlying technology and how it works under the hood, how WICK builds on it, a step-by-step guide, extending it, and an API reference, with diagrams and a demo built only on WICK. Set its `ready: true` in `wick/university/src/lib/chapters.ts`. Chapters, READMEs and code inside `wick/` never mention Undercroft: they describe WICK on its own terms. Every public method gets a JSDoc comment (`@param`, `@returns`, an `@example` where it helps) for IntelliSense.

### The boundary rule

**Nothing in `wick/` imports anything outside `wick/`.** WICK packages depend only on each other (by package name, `@wick/<name>`) and on libraries.

- ESLint's `no-restricted-imports` on `wick/**` rejects `#lib` and any relative path out of `wick/` (see `eslint.config.js`).
- Each package type-checks alone: its `tsconfig.json` covers only its own `src` (`pnpm check` runs every WICK package's `check`).
- The University's demos are built from WICK alone.

This is what lets `wick/` leave for its own repository later. `git subtree split --prefix=wick -b wick-only` makes a branch of just `wick/`, with its history. Push that branch as the new repository, and point Undercroft's `@wick/*` dependencies at it in place of `workspace:*`.

### Layout

```
wick/
  tsconfig.base.json    shared compiler options for every package
  packages/<name>/      @wick/<name>: package.json (exports ./src/index.ts), tsconfig.json, src/
  university/           @wick/university: the docs site (SvelteKit, static), port 5175
```

- **New package:** copy `packages/audio`'s `package.json` and `tsconfig.json`, rename it, and add it to the root `package.json` dependencies as `workspace:*`. `pnpm-workspace.yaml` already covers `wick/packages/*`, and `vitest.config.ts` already covers `wick/packages/*/src/**/*.test.ts`.
- **University imports:** its own modules go through `#university/*`, not `$lib`, which SvelteKit 3 doesn't provide. Internal links use `resolve()`, and `ChapterRoute` in `chapters.ts` lists the chapters that have pages.

## Milestones

### 1. Foundation + Audio

**Done.** It added:

- the workspace;
- the boundary lint;
- `@wick/audio`: `AudioManager`, `SoundBank`, `FadingLoop`, `captionDirection`;
- the University with its home page, the Architecture chapter, and the Audio chapter with a live demo.

What changed hands:

- **Injected:**
  - The audio categories became `AudioConfig.categories`, with `dry` and `defaultCategory`.
  - The mono and mute-in-background settings became `AudioConfig.options`.
  - The sound registry and built files became `SoundCatalog`.
  - `FadingLoop` reads through `LoopSource`.
  - `SoundDef` and `CaptionCue` are now generic.
- **Undercroft keeps:**
  - `content/audio/*`: the registry, categories (with `SOUND_CATEGORIES`), files, levels, surfaces and ambience tuning.
  - `Ambience.ts`.
  - The caption feed (`captions.svelte.ts`).
  - The bootstrap subclasses `src/lib/game/audio/AudioManager.ts` and `SoundBank.ts`.
- **Demo recordings:** the University's demo plays copies of a few Undercroft recordings, in `wick/university/static/demo/` (unnamed there: WICK never mentions Undercroft).

### 2. Render

`@wick/render`: the Three.js engine loop, glTF loading, animation, the light budget.

- **Inject and move:**
  - `src/lib/game/Engine.ts`: renderer, scene, camera, frame loop, quality presets, stats. It already imports only `GraphicsSettings`, which becomes a type in WICK, passed in.
  - `src/lib/game/assets.ts`: glTF + meshopt loading, skinned-mesh cloning. Already clean.
  - `src/lib/game/Animator.ts`: it imports `content/animations`, which becomes an injected clip table.
  - `loopClip.ts`.
  - `LIGHT_BUDGET` (now in `Engine.ts`). Today it's only a number that `ui/StatsOverlay.svelte` reads. Keep it as a number in WICK; enforcing it is not this milestone.
- **Undercroft keeps:**
  - `MapRenderer`, `Headlamp`, creatures, items, the affliction renderer.
  - `preload.ts`: it imports content and stays, calling WICK's loader.
  - The scene lighting in `play/+page.svelte`.
- **University:** the Render chapter. Diagrams: the frame loop, and the asset cache and cloning. Demo: a spinning glTF with an animation and a quality switch.
- **Verify:**
  - Undercroft plays solo in Rumors and the Gloaming.
  - Graphics quality presets and the frame cap still apply.
  - The stats overlay shows the light count.
  - The benchmark (`src/lib/game/benchmark/`) runs.

### 3. Input

`@wick/input`: remappable keyboard, mouse and controller actions; controller menus.

- **Inject and move:**
  - `src/lib/game/input/InputMap.ts`: it imports actions and the global `settings`. Bindings come through an interface instead.
  - `gamepad.ts`: it imports `content/rumble`, which becomes an injected table.
  - `device.svelte.ts`, `menus.ts`, `repeat.ts`, `hold.ts`.
- **Undercroft keeps:** `actions.ts` (its action list, default keys, `PAD_DEFAULTS`) and the rumble content, both passed in.
- **University:** the Input chapter. Diagrams: from raw event to action, and how a binding is resolved. Demo: two actions you can remap, on a keyboard or a controller.
- **Verify:**
  - Every action works on keyboard and controller.
  - Remapping a key and a pad button persists over a reload.
  - Controller menu navigation works in the hub and the settings.

### 4. Settings

`@wick/settings`: a persisted settings store, with engine sections and the game's own.

- **Inject and move:** split `src/lib/settings/settings.svelte.ts` into two parts:
  - **WICK's:** a store factory (schema, defaults, persistence, migration), with the graphics, audio volume, accessibility and binding sections.
  - **Undercroft's:** its own sections, such as teammate headlamp shadows.
- This store implements the interfaces milestones 1 and 3 introduced: audio's `options` and volumes, and input's bindings. The bootstraps then read from it.
- **University:** the Settings chapter. Demo: a schema with two sections, persisted.
- **Verify:**
  - Every setting persists.
  - Old saved settings still load (migration).
  - The volume sliders, mono and mute-in-background still work.

### 5. Multiplayer: client

`@wick/net`: the client side.

- **Inject and move:**
  - `src/lib/shared/protocol.ts`: only the envelope (encode, decode, version, a type set) moves. It becomes generic over the game's message union, and the messages themselves stay in Undercroft.
  - `src/lib/game/net/GameClient.ts`: reconnect and ping. Already clean.
  - Client prediction lifted out of `src/lib/game/player/LocalPlayer.ts`: pending inputs, replay after a snapshot, correction blending (around its lines 36, 56–57, 335). The game passes in its step function.
- **Undercroft keeps:** `net/connection.svelte.ts` (party, desktop, social, presence), and everything else in `LocalPlayer.ts`.
- **University:** the Multiplayer chapter, part 1. Diagrams: the envelope, and the prediction and replay timeline. Demo: a predicted dot against a simulated laggy server, run in the page.
- **Verify:**
  - Co-op with two clients, and a solo run.
  - Movement still feels the same (no rubber-banding).
  - Reconnect works after the server restarts.
  - `pnpm desktop:dev` co-op works.

### 6. Multiplayer: server

`@wick/net/server`: the authoritative tick, plus the event bus that untangles the server.

- **Inject and move:**
  - Split `server/session.ts` (983 lines). WICK gets the runtime:
    - the tick loop (`start`, `step`);
    - the input queue and catch-up (`MAX_BANKED`, `MAX_QUEUE`);
    - `safeStep` crash handling;
    - the `SessionSystem` hook interface (`server/systems/system.ts`);
    - broadcast plumbing.
  - Undercroft keeps a session holding:
    - the map build and the training ground;
    - the directors;
    - the fall rules;
    - its tick message fields.
  - `SessionSystem`'s `Player` record is generic: Undercroft extends it, adding `markWheel`, `crate` and its stats.
- **The event bus:** a typed bus in WICK. Systems that call each other through `ctx.systems.X` move onto it, the worst first:
  - **The strobe.** One status emitter over registered status targets replaces `AfflictionDirector.strobe` and `CreatureDirector.strobe` (`server/systems/affliction.ts:60`), with `StatusTarget` registered by each director.
  - **Noise.** `creatures.hear` becomes a noise event; it's called from about 15 systems.
  - **Readable things.** `pack` and `crates` now call `systems.rite.readClue`.
  - **Generic code that knows the boss.** `combat.ts` special-cases `MANIFESTATION_ID`.
- **University:** the Multiplayer chapter, part 2. Diagrams: one tick from start to finish, the system hooks, and the bus. Demo: if feasible, a server running in a worker with two clients in the page.
- **Verify:**
  - Every server test passes; there are many session tests.
  - Co-op and solo runs.
  - The strobe stuns the Gloaming's manifestation and creatures, and doesn't crash in Rumors (issue #121's test).

### 7. Membership

`@wick/membership`: accounts and everything around them.

- **Inject and move:** from `src/lib/server/store/`:
  - accounts, auth, sessions, friends, avatars, deletion, and the admin role;
  - also `totp.ts`, `mail.ts`, `steam.ts` and `session.ts`.
  - `github.ts`, `reports.ts` and `crash.svelte.ts` (crash and bug report filing).
  - **`accounts.ts` (644 lines) is split.** Game data per account attaches through an account hook: progression, explorers, inventory, recipes, discoveries, marks.
- **The admin app shell** (`admin/`) can move, but Undercroft's pages stay.
- **Undercroft keeps:**
  - the stores `progression`, `explorers`, `shop`, `quests`, `workshop`, `runs` and `discoveries`;
  - its API routes for game data.
- **University:** the Membership chapter. Diagrams: sign-in and two-factor, and the account hook. No live demo, since it needs a database; walk through the code instead.
- **Verify:**
  - Sign up, sign in, two-factor, Discord and Steam sign-in, friends, account deletion.
  - The admin app.
  - A bug report and a crash get filed.

### 8. Tooling

`@wick/tooling`: the asset pipeline, releases and deploys, and the desktop app.

- **Inject and move:**
  - Pipeline mechanics: `scripts/hashed.ts`, `build-images.ts`, the generic parts of `build-audio.ts` (Opus encoding) and glTF optimizing.
  - `scripts/release.ts` and `deploy/`, with their config injected.
  - The desktop shell: `desktop/` (Electron, `steamworks.js`, tunnel, lobby, frames). The app id, the name ("undercroft" is hard-coded in `main.ts`, `navigation.ts` and `lobby.ts`) and the host entry (`host/boot.ts`) come from config.
- **Undercroft keeps:**
  - `build-assets.ts`, which is built around the map kit, sockets and markers;
  - `audio.config.ts`, `items.config.ts` and `scripts/blender/*`.
- **University:** the Tooling chapter. Diagrams: the asset pipeline, and the release flow.
- **Verify:**
  - `pnpm asset:audio`, `asset:images` and `asset:build` produce identical output.
  - `pnpm desktop:build`.
  - A dry run of `pnpm release`.

### After the roadmap: cleanup inside Undercroft

These are the tangles the survey found that WICK doesn't fix by itself:

- **Break up `CreatureDirector`** (`server/creatures.ts`, 1,811 lines). The ward, glow, lure and repel state that `hazards` and `gear` write straight into should be its own state, reached through events.
- **Shrink `src/routes/play/+page.svelte`** (1,645 lines) to a bootstrap. Today it builds every subsystem by hand and reaches into features by name.
- **Remove the remaining `ctx.systems.X` cross-calls** between server systems.
- **Strip content imports out of `src/lib/shared/player/simulate.ts`** (`SANITY`, `EXPEDITION` and the headlamp) and `src/lib/shared/items/*`.

## Decisions

- **2026-11-24: the name.** WICK, the WebGL Integrated Creation Kit.
- **2026-11-24: a pnpm workspace in this repo**, all of it under `wick/`. Changes go live in Undercroft at once, and the folder can leave with its history (the boundary rule).
- **2026-11-24: extraction first, cleanup as code crosses**, not a cleanup pass beforehand. A module is cleaned up as it moves, because injecting its content is the cleanup.
- **2026-11-24: Audio first.** It was nearly clean, small, and easy to verify by ear, which made it a good place to prove the technique.
- **2026-11-24: multiplayer is in scope** (milestones 5 and 6). The event bus is introduced there, so that's where most of the server's tangles get fixed.
- **2026-11-24: a thin subclass as the bootstrap**, kept at the old path, so the rest of Undercroft didn't change its imports.
- **2026-11-24: University pages are Svelte files**, with diagrams as inline SVG components and no Markdown pipeline. That means no extra dependencies, and code samples are strings rendered by `Code.svelte`.
- **2026-11-24: WICK never mentions Undercroft.** Packages, the README and University chapters describe WICK on its own terms, so this roadmap lives in Undercroft's `docs/`, not in `wick/`.
- **2026-11-24: the University teaches the technology.** Chapters are written for junior engineers. They explain the underlying platform and the concepts behind it (for audio: the Web Audio graph, parameter automation, biquad filters, convolution and impulse responses, HRTFs, distance models) before showing how WICK uses them. Their tone is direct and technical, not simplified.
- **2026-11-24: JSDoc on every public API.** Classes get a summary and an `@example`; methods get `@param` and `@returns` (and `@throws`); interface fields get a line each. This is for IntelliSense.

## Drift notes

Record here what changed in Undercroft, between milestones, in code a later milestone will move, so its checklist gets re-checked before work starts.

- _(none yet)_
