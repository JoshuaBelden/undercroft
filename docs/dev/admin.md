# The admin app

A separate SvelteKit app in `admin/`, for the team: members, bug reports, crashes, the ideas board, feedback, game stats and an audit log. It shares the game's MongoDB and its store code (`src/lib/server/store/`), and nothing else. Players never download any of it: it isn't in the game's build, and in production it lives on its own subdomain, `admin.<DOMAIN>`.

The in-game F10 admin panel is something else: dev-mode debug tools for testing an expedition (noclip, spawning creatures...). It never ships enabled.

## Running it

```
pnpm dev:admin                # http://localhost:5174 (beside pnpm dev on 5173)
pnpm build:admin              # admin/build (adapter-node)
pnpm admin:grant <email>      # make an account an admin; --remove takes it away
```

`pnpm check` and `pnpm lint` cover `admin/` too. In development it reads the game's `.env` (Vite's `envDir: '..'`); its variables are declared in `admin/src/env.ts`: `MONGODB_URI`, `MONGODB_DB`, `GAME_ORIGIN` (the game site, for links in emails sent from here), `RESEND_API_KEY`, `MAIL_FROM`, `GITHUB_TOKEN`, `GITHUB_REPO`.

## Files

| File                                | What                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `admin/src/hooks.server.ts`         | Finds the admin from the cookie on every request; everyone else to sign-in   |
| `admin/src/lib/server/store.ts`     | The game's store, re-exported (`#lib/server/store.ts`)                       |
| `admin/src/lib/content.ts`          | The game's labels and statuses the pages show (safe in the browser)          |
| `admin/src/lib/server/members.ts`   | Member search and a member's explorers and ledger                            |
| `admin/src/lib/server/stats.ts`     | Sign-ups, active members, the economy, for the dashboard                     |
| `admin/src/lib/ui/Action.svelte`    | A button that runs one form action, asking first when it should              |
| `admin/src/routes/`                 | Dashboard, members, bug reports, crashes, ideas, feedback, audit log         |
| `src/lib/server/store/admin.ts`     | Roles, admin-app sessions, the audit log                                     |
| `src/lib/server/store/runs.ts`      | Game stats: runs and the game server's status                                |
| `src/lib/content/admin.ts`          | Session length, page size, the audit log's action names                      |
| `scripts/admin-grant.ts`            | `pnpm admin:grant`                                                           |
| `server/suspensions.ts`, `stats.ts` | Game server: closing suspended players' connections; writing runs and status |

The admin app imports the game's code by relative path, as the game server does, through those two barrels; anything it imports from `src/lib/server/` must not use `$app` modules the admin app doesn't define (`mail.ts` and `github.ts` read `$app/env/private` variables both apps declare).

## Who can sign in

An account with `role: 'admin'` and two-step sign-in on. The sign-in page asks for the email, the password and the code together, under the game's `THROTTLE` limits; the same answer comes back for a wrong password, an unknown email and an account that isn't an admin.

- **The first admin**: `pnpm admin:grant <email>` (on the droplet, see [deployment.md](deployment.md#admins)). After that, any admin can make others admins from their member page.
- **Its own session**: the `undercroft.admin` cookie (`SameSite=Strict`, `httpOnly`) and the `adminSessions` collection, 12 hours (`ADMIN.sessionHours`). It is separate from the game's session: signing in to the game doesn't sign you in here.
- **Checked on every request**: `adminSessionAccount` reads the account each time, so taking the role away (or suspending the admin) shuts them out on their next click. Removing the role also deletes their admin sessions.
- An admin can't remove their own role or suspend themselves, so there is always one way back in.

Every page answers with `Cache-Control: no-store` and `X-Frame-Options: DENY`; Caddy adds `X-Robots-Tag: noindex`.

## The audit log

Every change made from here goes through `audit(db, admin, action, target, detail)` into `adminLog`: who, what, to what, when. `pnpm admin:grant` writes as `script`. The Audit log page shows the latest 200; a member's page shows what was done to them. The action names are `AUDIT_ACTIONS` in `src/lib/content/admin.ts`: add one there for a new kind of change.

## Members

Search by email, gamer tag or Discord name (a case-insensitive substring); without a search, the newest 50. A member's page has their profile, how they sign in, their explorer and ledger, their runs, bug reports, ideas and feedback, and the audit history, with these actions:

- **Suspend**, with a reason (the player sees it) and a number of days, or 0 for until lifted. See below.
- **Lift the suspension.**
- **Sign out everywhere**: every browser session and game ticket (`deleteSessionsFor`).
- **Email a password reset**: the game's own reset email, linking to `GAME_ORIGIN`.
- **Turn off two-step sign-in**: for someone who lost their phone and their recovery codes. Only once you are sure it is them.
- **Change the gamer tag**: for a name that shouldn't be one. Other players see the new one from their next connection.
- **Make admin**, **Remove admin**.

### Suspending

`suspendAccount` sets `accounts.suspended` (`reason`, `until`, `by`, `at`) and deletes the account's sessions and tickets. From then on (`activeSuspension`):

- `sessionAccount` and `redeemTicket` refuse the account, so no page or game connection works;
- signing in (`signIn` in `src/lib/server/session.ts`, for passwords and Discord alike) answers with the reason and the end date;
- the game server checks everyone connected every 60 seconds (`server/suspensions.ts`) and sends a suspended player away (`Parties.expel`): told why, disconnected, out of their party and expedition with no place held.

A suspension with an end date lifts itself when it passes; the field stays on the account, as a record, until an admin lifts it or suspends again.

## Stats

The game server writes:

- **`runs`**: one document per player per expedition, when they leave it (`Session.logRun`, once per player): the outcome (`extracted`, `banished`, `died`, `lost`: time ran out, `abandoned`, `left`: left the party or dropped for good), seconds, deepest level, kills, crates, clues, what they carried out is worth at the store (`carriedValue`, from `sellPrice`), party size, seed, version, the Affliction, and how long it took to manifest.
- **`serverStatus`**: one document, every 15 seconds (`server/stats.ts`): players online and underground, parties, expeditions, version, when it started, memory. The dashboard calls the game server down when it hasn't written for a minute.

The site keeps `accounts.lastSeen` (set when a game ticket is issued) for daily and weekly active members.

The dashboard: the game server now; members; what needs an answer (ideas waiting, unread feedback, reports that failed to file, crashes in the last day); then, over the last 7, 14, 30 or 90 days, runs, how many got out, a typical run, runs, players and sign-ups per day, how runs ended, and the ledger's money by kind. The charts are `BarChart.svelte`: inline SVG, a hover tooltip and a table under each.

**Adding a stat**: a field on `RunDoc` written in `Session.logRun`, a line in `runSummary`'s `$group`, and a tile on the dashboard. Old runs simply don't have it: average with `$avg`, which skips missing values.
