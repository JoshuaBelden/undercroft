# Undercroft

Co-op (and solo) first-person horror extraction game set in the catacombs.

## Quick start

```
pnpm install
cp .env.example .env
docker compose up -d    # MongoDB
pnpm dev:server         # game server on ws://localhost:8787
pnpm dev                # client on http://localhost:5173
```

Open the client, choose **Descend**. In game: `Esc` settings, `F1` help, `F3` stats, `F10` admin (dev mode).

## Docs

- [CLAUDE.md](CLAUDE.md): development rules
- [docs/HANDOFF.md](docs/HANDOFF.md): game design
- [docs/PHASES.md](docs/PHASES.md): phase plan
- [docs/LORE.md](docs/LORE.md): lore
- [docs/dev/](docs/dev/): developer docs
