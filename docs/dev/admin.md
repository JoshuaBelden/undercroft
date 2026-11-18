# The admin app

A separate SvelteKit app in `admin/`, for the team: members, bug reports, crashes, the ideas board, feedback, game stats, the art and assets checklist and an audit log. It shares the game's MongoDB and its store code (`src/lib/server/store/`), and nothing else. Players never download any of it: it isn't in the game's build, and in production it lives on its own subdomain, `admin.<DOMAIN>`.

The in-game F10 admin panel is something else: dev-mode debug tools for testing an expedition (noclip, spawning creatures...), with F9 for a free camera over the map's debug grid ([map-generation.md](map-generation.md#debug-grid)). Neither ships enabled.

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
| `admin/src/routes/`                 | Dashboard, members, bug reports, crashes, ideas, feedback, art, audit log    |
| `admin/src/lib/server/assets.ts`    | The Art & Assets list (`src/lib/server/assets/`), re-exported                |
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
- **Remove picture**: their uploaded avatar, for a picture that shouldn't be one (`removeAvatar`). The page shows it, or their Discord avatar, which can't be removed here. Other players see it gone from their next connection. See [accounts.md](accounts.md#avatars).
- **Make admin**, **Remove admin**.
- **Delete account**: for good, after typing the gamer tag; not your own. Then back to the member list. What goes and what stays: [accounts.md](accounts.md#deleting-an-account).

### Suspending

`suspendAccount` sets `accounts.suspended` (`reason`, `until`, `by`, `at`) and deletes the account's sessions and tickets. From then on (`activeSuspension`):

- `sessionAccount` and `redeemTicket` refuse the account, so no page or game connection works;
- signing in (`signIn` in `src/lib/server/session.ts`, for passwords and Discord alike) answers with the reason and the end date;
- the game server checks everyone connected every 60 seconds (`server/suspensions.ts`) and sends a suspended player away (`Parties.expel`): told why, disconnected, out of their party and expedition with no place held.

A suspension with an end date lifts itself when it passes; the field stays on the account, as a record, until an admin lifts it or suspends again.

## Stats

The game server writes:

- **`runs`**: one document per player per expedition, when they leave it (`Session.logRun`, once per player): the outcome (`extracted`, `banished` (no longer written: banishing used to carry everyone out), `died`, `lost`: time ran out, `abandoned`, `left`: left the party or dropped for good), seconds, deepest level, kills, crates, clues, what they carried out is worth at the store (`carriedValue`, from `sellPrice`), party size, seed, version, the Affliction, and how long it took to manifest.
- **`serverStatus`**: one document, every 15 seconds (`server/stats.ts`): players online and underground, parties, expeditions, version, when it started, memory. The dashboard calls the game server down when it hasn't written for a minute.

The site keeps `accounts.lastSeen` (set when a game ticket is issued) for daily and weekly active members.

The dashboard: the game server now; members; what needs an answer (ideas waiting, unread feedback, reports that failed to file, crashes in the last day); then, over the last 7, 14, 30 or 90 days, runs, how many got out, a typical run, runs, players and sign-ups per day, how runs ended, and the ledger's money by kind. The charts are `BarChart.svelte`: inline SVG, a hover tooltip and a table under each.

**Adding a stat**: a field on `RunDoc` written in `Session.logRun`, a line in `runSummary`'s `$group`, and a tile on the dashboard. Old runs simply don't have it: average with `$avg`, which skips missing values.

## Art and assets

The Art & Assets page (`/assets`) is a working checklist for art and audio: every asset the game uses, every one it names but doesn't have, and every file nothing uses. Nothing in it is kept by hand. `buildCatalog` (`src/lib/server/assets/catalog.ts`) builds it on each visit from the generated manifests (`models.generated.ts`, `pieces.generated.ts`, `images.generated.ts`, `files.generated.ts`, `levels.generated.ts`), the content data (items, creatures, Afflictions, the explorer, `sounds.ts`, `animations.ts`) and what `readAssetDisk` (`disk.ts`) finds: every file under `static/assets` (in the Docker image, which has no `static/`, the site build's copy in `build/client/assets`), the clips and files in each glTF, and the source in `src/` and `server/`. It takes about a tenth of a second.

| Section      | Rows                                                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Models       | Each built `.glb`, with the items, creatures, manifestations and code (`modelUrl('…')`) that load it; items with no model (drawn as a placeholder box)            |
| Map pieces   | Each piece the generator places, with its `.gltf`, buffers and textures                                                                                           |
| Pictures     | Each interface picture, with the items, Afflictions and code (`imageUrl('…')`, or a constant ending in `IMAGE`) that name it; items that name no picture          |
| Sounds       | Every `SoundId`: recorded or synthesized, its category, the files that name it, its files, and how loud it plays (`pnpm asset:levels`); recordings no sound plays |
| Animations   | Each rigged model's standard slots: the clip, a held pose (speed 0), or what the slot falls back to (`ANIM_FALLBACKS`); a clip the map names but the file lacks   |
| Unused files | Anything under `static/assets` no row above covers                                                                                                                |

Statuses: **OK** (used and there), **Missing** (named but no file, or a clip the file lacks), **Placeholder** (a box for a model, a held pose for a clip), **Synthesized** (no recording: made in code), **Unused** (a file nothing uses). The counts of everything that isn't OK are at the top; filter by kind, status or a search. Pictures show a thumbnail and sounds a play button. Both load from the admin app itself (`/assets/file/<path>`, behind its sign-in; `assetFile` keeps the path inside the assets folder), so they work without the game site running.

**Levels** are the ones `pnpm asset:levels` last wrote to `src/lib/content/audio/levels.generated.ts`, with the files it measured: a sound whose files have changed since says "out of date". Run it after `pnpm asset:audio` and commit the file.

**Keeping it right:** load models with `modelUrl('<path>')` and pictures with `imageUrl('<name>')` (or a constant named `…IMAGE`), with the name written out, so the page can find them. A name built at run time (`` `footstep.${surface}` ``) still works in the game, but the page can't say where it is used. `catalog.test.ts` covers the rules; `disk.test.ts` also checks that every file the manifests name is there.
