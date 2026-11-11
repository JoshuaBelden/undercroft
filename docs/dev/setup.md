# Setup

## Requirements

- Node.js 22.9 or newer
- pnpm 10 (`corepack enable` or `npm i -g pnpm`)
- Docker Desktop (for MongoDB)
- Blender (for assets)

## First run

```
pnpm install
cp .env.example .env
docker compose up -d
pnpm dev:server
pnpm dev
```

Open http://localhost:5173, create an account, choose an Affliction and press **Launch Expedition**. The status in the bottom-right shows the game server connection.

MongoDB is required: accounts, sessions and everything a player keeps live there. Without it the site can't sign anyone in and the game server rejects every connection (it logs a warning at start). If the container is up but the connection is refused, recreate it: `docker compose up -d --force-recreate mongo` (the data is in a volume and survives).

To play co-op on one machine, sign in to a second account in another browser profile or a private window. See [accounts.md](accounts.md).

## Environment variables

| Variable                 | Used by | Default                                 |
| ------------------------ | ------- | --------------------------------------- |
| `GAME_SERVER_PORT`       | server  | `8787`                                  |
| `MONGODB_URI`            | both    | `mongodb://localhost:27017`             |
| `MONGODB_DB`             | both    | `undercroft`                            |
| `PUBLIC_GAME_SERVER_URL` | client  | `ws://localhost:8787`                   |
| `PUBLIC_DEV_MODE`        | client  | `false` (dev server is always dev mode) |

The SvelteKit app's variables are declared in `src/env.ts`: public ones are imported from `$app/env/public`, server-only ones from `$app/env/private`. The game server reads its variables in `server/config.ts`. The two MongoDB variables are read by both and must match.

## Quality gates

Every change must leave these clean, with zero errors and zero warnings:

```
pnpm check   # svelte-check + TypeScript, fails on warnings
pnpm lint    # Prettier check + ESLint, fails on warnings
```

Run `pnpm format` to fix formatting.

## Production build

`pnpm build` produces a Node server in `build/` (adapter-node). The game server runs separately with `pnpm start:server`. Deployment to DigitalOcean is covered in Phase 3.
