# Undercroft

A co-op first-person horror extraction game set in the catacombs, for one to four players in the browser.

Descend into a catacomb that is different every time, lit only by your headlamp. Loot what you can carry, find what the rite needs to banish the Affliction, and climb back out before it takes you. What you bring out you keep; what you lose down there stays lost.

> **Status: closed beta.** Expect rough edges, balance changes and the occasional wipe. The release notes for each version are on the [GitHub releases](https://github.com/JoshuaBelden/undercroft/releases) page and in game under What's new.

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

| Command               | What                                                           |
| --------------------- | -------------------------------------------------------------- |
| `pnpm dev`            | the client, with hot reload                                    |
| `pnpm dev:server`     | the game server, restarting on changes                         |
| `pnpm check`          | Svelte and TypeScript checks (must be clean)                   |
| `pnpm lint`           | Prettier and ESLint (must be clean); `pnpm format` fixes style |
| `pnpm asset:export`   | map kit (.blend) → map-piece exports, headless in Blender      |
| `pnpm asset:build`    | Blender exports → optimized models in `static/assets/`         |
| `pnpm asset:audio`    | raw sounds → Opus                                              |
| `pnpm asset:images`   | interface art → WebP                                           |
| `pnpm release <bump>` | with the notes written: version, tag, GitHub release, deploy   |
| `pnpm deploy:release` | ship the committed build to the server                         |

The asset commands need the raw art (see below).

## Working on art

The built, optimized assets are committed in `static/assets/`, so **working on code needs none of this**. The raw art (the Blender map kit, 4K textures, raw recordings and exports) is a separate private repository, [undercroft-art](https://github.com/JoshuaBelden/undercroft-art), whose large files are in [Git LFS](https://git-lfs.com). To work on art:

1. Install Git LFS once per machine (it comes with Git for Windows; `brew install git-lfs` on macOS, `sudo apt install git-lfs` on Debian or Ubuntu), then run `git lfs install`.
2. Ask the owner for access to undercroft-art.
3. Clone it into `art/` inside this checkout (about 2 GB; this repository ignores `art/`):

   ```
   git clone https://github.com/JoshuaBelden/undercroft-art.git art
   ```

4. Install [Blender](https://www.blender.org), then run `pnpm asset:export` (writes the map-piece exports, which aren't stored) and `pnpm asset:build`.

Then use git in `art/` as usual: pull it alongside this repository (`git -C art pull`), and commit and push art changes there. Only one person edits a `.blend` at a time, since binary files can't be merged. The LFS quota is shared, so commit finished work rather than every save. The full guide (checking files downloaded, adding a new file type to LFS, locking, fetching only part of it, fixing problems) is in [docs/dev/asset-pipeline.md](docs/dev/asset-pipeline.md#raw-art).

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

Undercroft is made with AI assistance. The statement on how AI is used and every third-party asset and font are credited on the in-game **Credits** page, from [src/lib/content/credits.ts](src/lib/content/credits.ts).
