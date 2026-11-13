# Contributing to Undercroft

Thanks for helping. Undercroft is a small project in closed beta, so the best contributions right now are bug reports, fixes, performance work and polish on what's already there. For anything bigger, open an issue first so we can agree on the design before you build it.

## Ground rules

- **Sign the CLA.** On your first pull request a bot asks you to sign the [Contributor License Agreement](CLA.md) by leaving a comment. You keep your copyright; the CLA lets the project change its license or offer the game commercially later.
- **Licenses.** Code you contribute is released under the [AGPL-3.0](LICENSE). Art, sound and writing are covered by [LICENSE-ASSETS.md](LICENSE-ASSETS.md): you may use them to develop and test Undercroft, not elsewhere.
- **Be kind.** Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- **Security problems** go through a private report, not an issue: see [SECURITY.md](SECURITY.md).

## Getting set up

You need Node.js 22.9+, pnpm (through `corepack enable`) and Docker. Then follow [docs/dev/setup.md](docs/dev/setup.md). Use pnpm only, never npm or yarn.

The raw art (`art/`: the Blender kit, 4K textures, raw recordings) isn't in the repository. You don't need it: the built, optimized assets are committed under `static/assets/`.

## How the code is organised

Read [docs/dev/structure.md](docs/dev/structure.md) first, then the doc for the system you're touching in [docs/dev/](docs/dev/). [CLAUDE.md](CLAUDE.md) is the project's rulebook, for people and AI coding agents alike. The rules that matter most:

- **The server is authoritative.** Clients send input and draw what the server says. Solo play uses the same server path as co-op.
- **Content is data.** Afflictions, creatures, items, loot tables and map pieces are data in `src/lib/content/`, not logic.
- **No hardcoded keys, sounds or settings.** Input goes through the input map, sound through the audio manager, and settings through the settings store.
- **Shared types** between client and server live in `src/lib/shared/`.

## Before you open a pull request

1. `pnpm check`, `pnpm lint` and `pnpm test` must all finish with **zero errors and zero warnings**. Fix a warning rather than silencing it.
2. Add unit tests for changes to shared or server logic (see [docs/dev/testing.md](docs/dev/testing.md)), and play-test your change: there are no browser tests, so describe what you tried in the pull request.
3. Update the docs in the same change: the `docs/dev/` page for the system, the in-game help if players will notice, and an entry under `## Unreleased` in [CHANGELOG.md](CHANGELOG.md), written for players.
4. Keep the pull request to one change, with a clear title and a description of what and why.

## AI-assisted contributions

You're welcome to use AI tools (the project itself is built with Claude Code; see the Credits page). You are responsible for what you submit: read and understand every line, test it, and make sure it follows the rules above. CLAUDE.md gives agents the same instructions it gives people.

## Reporting bugs

Players can report bugs from the game itself (the account menu, or the settings screen): the report becomes an issue here, with the version and details attached. You can also open an issue with what happened, what you expected, and how to reproduce it. Include your browser, the version from the bottom of the dashboard, and solo or co-op. The browser console log (F12) helps a lot.
