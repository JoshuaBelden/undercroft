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

Open http://localhost:5173 and choose **Descend**. The status in the bottom-right shows the game server connection.

The game server keeps running if MongoDB is down; it logs a warning. Nothing persists to the database yet.

## Environment variables

| Variable                 | Used by | Default                                 |
| ------------------------ | ------- | --------------------------------------- |
| `GAME_SERVER_PORT`       | server  | `8787`                                  |
| `MONGODB_URI`            | server  | `mongodb://localhost:27017`             |
| `MONGODB_DB`             | server  | `undercroft`                            |
| `PUBLIC_GAME_SERVER_URL` | client  | `ws://localhost:8787`                   |
| `PUBLIC_DEV_MODE`        | client  | `false` (dev server is always dev mode) |

Client variables are declared in `src/env.ts` and imported from `$app/env/public`. Add new client variables there. Server variables are read in `server/config.ts`.

## Quality gates

Every change must leave these clean, with zero errors and zero warnings:

```
pnpm check   # svelte-check + TypeScript, fails on warnings
pnpm lint    # Prettier check + ESLint, fails on warnings
```

Run `pnpm format` to fix formatting.

## Production build

`pnpm build` produces a Node server in `build/` (adapter-node). The game server runs separately with `pnpm start:server`. Deployment to DigitalOcean is covered in Phase 3.
