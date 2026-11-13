# Undercroft

A co-op first-person horror extraction game set in the catacombs, for one to four players in the browser.

Descend into a catacomb that is different every time, lit only by your headlamp. Loot what you can carry, find what the rite needs to banish the Affliction, and climb back out before it takes you. What you bring out you keep; what you lose down there stays lost.

> **Status: closed beta.** Expect rough edges, balance changes and the occasional wipe. See [CHANGELOG.md](CHANGELOG.md) for what's in each version.

## Features

- **Solo or co-op** in the same server-authoritative game: invite friends by gamer tag.
- **Procedural catacombs** built from hand-made modular pieces: tunnels, ossuaries, a flooded cistern, crawlspaces, squeezes and stairs down.
- **Afflictions:** a hidden meter that worsens as you linger, read through omens, resolved by a rite you piece together from hints. The first is the Gloaming.
- **Extraction loop:** a stash, a loadout and a store on the surface. Loot crates and the dead below.
- **Light and sound as the game:** your headlamp's battery, sanity in the dark, chalk marks to find your way, and spatial audio with captions.

## Tech

| Part        | What                                                                          |
| ----------- | ----------------------------------------------------------------------------- |
| Client      | [SvelteKit](https://svelte.dev) (TypeScript), [three.js](https://threejs.org) |
| Game server | Node.js and WebSockets, authoritative at 20 Hz (`server/`)                    |
| Data        | MongoDB, in Docker                                                            |
| Art         | Blender, optimized by a glTF Transform pipeline into `static/assets/`         |
| Hosting     | Docker Compose behind Caddy on one DigitalOcean droplet                       |

## Quick start

You need Node.js 22.9+, pnpm (`corepack enable`) and Docker.

```
pnpm install
cp .env.example .env
docker compose up -d    # MongoDB
pnpm dev:server         # game server on ws://localhost:8787
pnpm dev                # client on http://localhost:5173
```

Create an account and press **Launch Expedition**. In game: `Esc` settings, `F1` help, `F3` stats, `F10` admin tools (dev mode only). To play co-op locally, sign in to a second account in a private window.

More in [docs/dev/setup.md](docs/dev/setup.md).

## Commands

| Command                 | What                                                           |
| ----------------------- | -------------------------------------------------------------- |
| `pnpm dev`              | the client, with hot reload                                    |
| `pnpm dev:server`       | the game server, restarting on changes                         |
| `pnpm dev:seed [email]` | fill explorers' stashes with items to test with                |
| `pnpm check`            | Svelte and TypeScript checks (must be clean)                   |
| `pnpm lint`             | Prettier and ESLint (must be clean); `pnpm format` fixes style |
| `pnpm asset:build`      | Blender exports → optimized models in `static/assets/`         |
| `pnpm asset:audio`      | raw sounds → Opus                                              |
| `pnpm asset:images`     | interface art → WebP                                           |
| `pnpm release <bump>`   | bump the version, date the release notes, tag                  |
| `pnpm deploy:release`   | ship the committed build to the server                         |

The asset commands need the raw art in `art/`, which isn't in the repository. You only need them to change art; the built assets are committed.

## Repository

```
src/lib/shared/    types and simulation shared by client and server
src/lib/game/      the client game: rendering, input, audio, networking
src/lib/content/   game content as data: Afflictions, creatures, items, loot, map kit, credits
src/lib/ui/        Svelte components
src/routes/        pages: the dashboard, the expedition, sign-in, About
server/            the authoritative game server
scripts/           asset pipeline and release tooling
deploy/            provisioning and deployment
docs/dev/          developer documentation, one page per system
```

## Documentation

- [docs/dev/](docs/dev/): how each system works and how to extend it. Start with [structure.md](docs/dev/structure.md) and [systems.md](docs/dev/systems.md).
- [Issues](https://github.com/JoshuaBelden/undercroft/issues): what's being worked on now (the Beta milestone) and the backlog.
- [CLAUDE.md](CLAUDE.md): the project's rules, for contributors and AI coding agents.
- [docs/dev/releasing.md](docs/dev/releasing.md): versions, release notes and credits.
- [docs/dev/deployment.md](docs/dev/deployment.md): hosting.

## Contributing

Bug reports and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first: contributors sign a [CLA](CLA.md), and every change must leave `pnpm check` and `pnpm lint` without errors or warnings. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md), and report security issues privately ([SECURITY.md](SECURITY.md)).

## License

- **Code:** [GNU AGPL-3.0](LICENSE). You may run, study, change and share it. If you run a modified version for others, including as a hosted server, you must publish your changes under the same license.
- **Assets, writing and the Undercroft name:** all rights reserved ([LICENSE-ASSETS.md](LICENSE-ASSETS.md)). You may use them to develop and test Undercroft, but not to run your own copy for others or in other projects. Third-party assets keep their own licenses.

## Credits

Undercroft is made by Joshua Belden, with AI assistance. The statement on how AI is used, the inspirations, and every asset, font and tool are credited on the in-game **Credits** page, from [src/lib/content/credits.ts](src/lib/content/credits.ts).
