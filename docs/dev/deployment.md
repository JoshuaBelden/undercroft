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
- **A DigitalOcean API token** with write access, in your shell as `DIGITALOCEAN_ACCESS_TOKEN` or in the file `~/.undercroft/do-token` (outside the repo). Don't commit it, put it in `.env`, or paste it into chat.
- **An SSH key** (`~/.ssh/id_ed25519.pub` by default). Provisioning registers it, and deploys log in with it as `root`.

## Provision (once)

```
pnpm deploy:provision --domain play.example.com
```

It is safe to run again: it finds what exists by name and tag (`undercroft`). It creates:

- an Ubuntu 24.04 droplet in `sfo3` (`--region`), `s-1vcpu-1gb` by default (`--size`; the cheapest that runs the stack, about $6 a month), with monitoring. `--backups` adds weekly droplet backups (20% of the droplet price). Resize up from the DigitalOcean dashboard as players arrive: choose a CPU and RAM only resize, so you can come back down;
- cloud-init that adds 2 GB of swap (building the image needs more than 1 GB of memory), installs Docker and sets up a nightly `mongodump` to `/opt/undercroft/backups/`, kept for 14 days;
- a cloud firewall: 22, 80 and 443 (TCP, plus UDP for HTTP/3) in, anything out. MongoDB is never exposed;
- the domain's A record, if the zone is on DigitalOcean DNS.

Wait a few minutes after it finishes for cloud-init to install Docker.

## Deploy

Commit first: the deploy ships `git archive HEAD` (or the tag or commit given with `--ref`, for a release: see [releasing.md](releasing.md)), which includes the built `static/assets`.

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

## The live beta

| What    | Value                                                            |
| ------- | ---------------------------------------------------------------- |
| URL     | https://undercroft.us (`www.` redirects to it; DNS at GoDaddy)   |
| Droplet | `undercroft`, 64.23.154.42, `s-1vcpu-1gb` in `sfo3`              |
| Release | `pnpm deploy:release --host 64.23.154.42 --domain undercroft.us` |

`--domain` only matters on the first deploy, when it writes `/opt/undercroft/.env`. After that the domain in that file is the one used, so changing it means editing the file (below), not passing a new `--domain`.

## Email and Discord

Password-reset emails and "Sign in with Discord" need keys in `/opt/undercroft/.env` on the droplet. The first deploy writes that file and later deploys never touch it, so add these lines by hand, then run `docker compose -f docker-compose.prod.yml --env-file ../.env up -d` in `/opt/undercroft/app`. Without them the site still works: the Discord button is hidden, and reset links only go to the `web` log (`... logs -f web`), which is also a way to help a player by hand.

**Resend** (email). The droplet can't send mail itself (DigitalOcean blocks SMTP), so emails go through Resend's HTTPS API.

1. Make an account at resend.com, add the domain `undercroft.us`, and add the DNS records it lists (SPF and DKIM, as TXT/MX records) at GoDaddy. Wait for Resend to show the domain as verified.
2. Create an API key with sending access only, then set `RESEND_API_KEY=re_...` in `.env`. `MAIL_FROM` defaults to `Undercroft <noreply@<DOMAIN>>`, which must be on the verified domain.

**Discord** (sign-in).

1. At discord.com/developers/applications, create an application named Undercroft. Under OAuth2, add the redirect `https://undercroft.us/auth/discord/callback` (and `http://localhost:5173/auth/discord/callback` for development).
2. Copy the Client ID and Client Secret into `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.

Keep these keys out of the repository and out of chat, like the DigitalOcean token.

## Changing the domain

Point the new name's A record at the droplet, then on the droplet set `DOMAIN=<new name>` in `/opt/undercroft/.env` and run `docker compose -f docker-compose.prod.yml --env-file ../.env up -d` in `/opt/undercroft/app`. Caddy gets a certificate for the new name by itself, and for `www.<name>`, which it redirects to the bare name (add a `www` CNAME to the domain for that). Until there is a real domain, `<ip-with-dashes>.sslip.io` (a public DNS name that resolves to the IP inside it) works for HTTPS.
