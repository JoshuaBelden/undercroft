# Deployment

The beta runs on one DigitalOcean droplet: Docker Compose with four containers, behind Caddy on one domain.

```
browser ──https──> caddy ─┬─ /ws       ──> game  (tsx server/index.ts, port 8787)
                          ├─ /assets/* ──> web   (immutable, one-year cache)
                          └─ everything ──> web  (node build, port 3000)
                  game, web ──> mongo (named volume)
```

| File                      | What                                                                        |
| ------------------------- | --------------------------------------------------------------------------- |
| `Dockerfile`              | One image for `web` and `game` (`pnpm install`, `pnpm build`)               |
| `docker-compose.prod.yml` | The production stack. Development keeps `docker-compose.yml` (MongoDB only) |
| `deploy/Caddyfile`        | TLS (automatic, Let's Encrypt), routing, asset caching, compression         |
| `deploy/provision.ts`     | Creates the droplet, firewall and DNS record (`pnpm deploy:provision`)      |
| `deploy/deploy.ts`        | Ships git `HEAD` and restarts the stack (`pnpm deploy:release`)             |
| `.env.production.example` | What goes in `/opt/undercroft/.env` on the droplet                          |

## Before the first deploy

- **A domain** (or subdomain) for the game, for the TLS certificate. If its DNS is on DigitalOcean, provisioning points it at the droplet; otherwise add the A record yourself.
- **A DigitalOcean API token** with write access, in your shell as `DIGITALOCEAN_ACCESS_TOKEN`. Don't commit it, put it in `.env`, or paste it into chat.
- **An SSH key** (`~/.ssh/id_ed25519.pub` by default). Provisioning registers it, and deploys log in with it as `root`.

## Provision (once)

```
pnpm deploy:provision --domain play.example.com --region nyc3
```

It is safe to run again: it finds what exists by name and tag (`undercroft`). It creates:

- an Ubuntu 24.04 droplet, `s-2vcpu-4gb` by default (`--size`), with monitoring and weekly droplet backups (`--no-backups` to skip; they cost 20% of the droplet price);
- cloud-init that installs Docker and a nightly `mongodump` to `/opt/undercroft/backups/`, kept for 14 days;
- a cloud firewall: 22, 80 and 443 (TCP, plus UDP for HTTP/3) in, anything out. MongoDB is never exposed;
- the domain's A record, if the zone is on DigitalOcean DNS.

Wait a few minutes after it finishes for cloud-init to install Docker.

## Deploy

Commit first: the deploy ships `git archive HEAD`, which includes the built `static/assets`.

```
pnpm deploy:release --host <droplet ip or domain> --domain play.example.com
```

On the droplet, `/opt/undercroft/.env` (production settings: `DOMAIN`, `MONGODB_DB`) is written on the first deploy and never touched again. `/opt/undercroft/app` is replaced each time. `docker compose up -d --build` then rebuilds the image and restarts what changed. The database lives in the `undercroft_mongo-data` volume and survives deploys. Players connected to the game server are dropped when it restarts; they reconnect into the hub.

Production always runs with `DEV_MODE=false` and `PUBLIC_DEV_MODE=false` (set in `docker-compose.prod.yml`), so admin tools never ship enabled. `PUBLIC_GAME_SERVER_URL` is `wss://<DOMAIN>/ws`, and the game server only accepts WebSockets on `/ws` (`GAME_SERVER_PATH`).

## Caching

Built asset files have content-hashed names (see [asset-pipeline.md](asset-pipeline.md#delivery)), so Caddy serves `/assets/*` with `Cache-Control: public, max-age=31536000, immutable`: a returning player downloads only what changed. SvelteKit's own `/_app/immutable/*` files are hashed and cached by adapter-node. Pages themselves are not cached.

Any file under `static/assets/` gets the immutable header, so never ship one under a name that will later hold different contents. Everything the build scripts write is hashed. The only unhashed file is `dev/dev-cube.glb`, which is dev-only.

## Operating

```
ssh root@<host>
cd /opt/undercroft/app
docker compose -f docker-compose.prod.yml --env-file ../.env ps
docker compose -f docker-compose.prod.yml --env-file ../.env logs -f game
```

**Restore a backup:** `gunzip -c /opt/undercroft/backups/mongo-<date>.gz | docker compose -f docker-compose.prod.yml --env-file ../.env exec -T mongo mongorestore --archive --drop`.

**Moving to managed MongoDB** later only means pointing `MONGODB_URI` for `web` and `game` at it in `docker-compose.prod.yml` and dropping the `mongo` service.

A CDN (DigitalOcean Spaces CDN) in front of `/assets` isn't needed for the beta: assets are cached forever after the first visit. Revisit it if players are far from the droplet's region.
