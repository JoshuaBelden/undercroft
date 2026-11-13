# Accounts, sign-in and explorers

The whole game is behind sign-in. An account is an email, a gamer tag, and a way to sign in: a password, a linked Discord account, or both. Two-step sign-in (an authenticator app) can be turned on. Each account has one explorer: the character who owns the stash, the loadout, the money and the rite progress. Steam sign-in is a later phase.

## Files

| File                                               | What                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `src/lib/content/account.ts`                       | Rules: lengths, lifetimes, `THROTTLE` limits, `DISCORD_RESULTS`  |
| `src/lib/shared/account/types.ts`                  | `AccountView`, `ExplorerView`: what the browser gets             |
| `src/lib/server/store/accounts.ts`                 | Accounts, sessions, tickets, explorers in MongoDB                |
| `src/lib/server/store/auth.ts`                     | Reset links, two-step challenges, Discord sign-ups, limits       |
| `src/lib/server/totp.ts`                           | Authenticator codes (RFC 6238)                                   |
| `src/lib/server/mail.ts`                           | Email through Resend (or the log, without a key)                 |
| `src/lib/server/discord.ts`                        | The Discord OAuth2 round trip                                    |
| `src/lib/server/db.ts`                             | The SvelteKit server's MongoDB connection                        |
| `src/lib/server/session.ts`                        | The cookies; `signIn` (a session, or a two-step challenge first) |
| `src/hooks.server.ts`                              | Finds the account for every request; gates everything else       |
| `src/routes/auth/`                                 | Signed-out pages (`AuthForm.svelte`, `AuthPage.svelte`), Discord |
| `src/routes/account/`, `src/lib/ui/Account.svelte` | The Account screen; `AccountMenu.svelte` opens it                |
| `src/routes/api/auth/`, `api/account/`             | Signing in, up and out, resets, two-step; changing the account   |
| `src/routes/api/ticket/`                           | A ticket for the game server                                     |
| `src/lib/account/account.svelte.ts`                | Client: the signed-in account (`session.account`), API helper    |
| `server/accounts.ts`                               | Game server: who a ticket belongs to                             |

`src/lib/server/store/` is used by both processes. It takes the `Db` as an argument and imports by relative path, so the game server can import it too. It must not import anything from `$app`.

## Data (MongoDB)

- `accounts`: `_id`, `email` (lower-cased, unique), `password` (`scrypt$<salt>$<hash>`, from `node:crypto`; missing on an account made with Discord until one is set), `gamerTag`, `tagKey` (lower-cased tag, unique, so tags can't differ only by case), `discord` (`{ id, username }`; `discord.id` unique), `totp` (`secret`, `enabledAt`, `recovery`: the sha256 of each unused recovery code, `usedStep`: the last time step accepted), `totpPending` (a secret being set up), `role` (`'admin'`: can use the admin app, see [admin.md](admin.md)), `suspended` (`reason`, `until`, `by`, `at`: set by an admin, see [admin.md](admin.md#suspending)), `lastSeen` (when a game ticket was last issued), `createdAt`.
- `explorers`: `_id`, `account`, `money`, `stash` (one entry per stash slot: a stack or null), `loadout` (an `Inventory`), `layout` (how those two are stored; older documents are converted when read, see [economy.md](economy.md)), `underground`. One per account today, created the first time it is needed (`explorerFor`). It is a separate collection, keyed by its own id, so an account can have several later.
- `sessions`: `_id` is the cookie value; `account`, `expires` (30 days).
- `tickets`: `_id` is the ticket; `account`, `expires` (12 hours).
- `resets`: `_id` is the sha256 of an emailed reset token (the token itself is never stored); `account`, `expires` (1 hour).
- `challenges`: a sign-in waiting for its two-step code. `_id` is the token in the `undercroft.challenge` cookie; `account`, `expires` (5 minutes), `attempts`.
- `signups`: a Discord sign-up waiting for its gamer tag. `_id` is the token in the `undercroft.signup` cookie; `discord`, `email`, `expires` (15 minutes).
- `throttle`: `_id` is `<rule>:<key>`; `count`, `expires`. See [Limits](#limits).
- `progress`: rite progress, keyed by explorer (see [rite.md](rite.md)).
- `ledger`: the economy log (see [economy.md](economy.md#the-ledger)).
- `adminSessions`, `adminLog`: the admin app's sessions and audit log; `runs`, `serverStatus`: game stats (see [admin.md](admin.md)).
- `reports`, `errors`, `ideas`, `ideaVotes`, `feedback`: what players send us (see [reports.md](reports.md)).

Sessions, tickets, resets, challenges, sign-ups and throttles have a TTL index, so MongoDB removes them when they expire. `ensureIndexes` creates all the indexes (`ensureAuthIndexes` for `auth.ts`'s) and runs when either process connects.

Addresses aren't verified at sign-up yet. A reset link only works for whoever reads the mailbox, so a reset does prove the address.

## The site (SvelteKit)

`hooks.server.ts` reads the `undercroft.session` cookie and sets `locals.account` (`id`, `email`, `gamerTag`). Without an account, anything outside `/auth/` and `/api/auth/` redirects to `/auth/sign-in`, or returns 401 for `/api/`. The paths that stay open are `isOpen` in `session.ts`; the release notes and credits are behind sign-in too. `+layout.server.ts` passes the account to every page, and it reads the URL so it runs again on every navigation, in the browser too: a session that ended goes to the sign-in page on the next click instead of to a page that waits for an account.

Endpoints (JSON):

| Endpoint                        | Does                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `POST /api/auth/sign-up`        | `{ email, password, gamerTag }`: creates the account, signs in               |
| `POST /api/auth/sign-in`        | `{ email, password }`: `{ ok }`, or `{ mfa: true }` (see below)              |
| `POST /api/auth/mfa`            | `{ code }`: the second step; 410 when it has to start again                  |
| `POST /api/auth/forgot`         | `{ email }`: emails a reset link; the same answer either way                 |
| `POST /api/auth/reset`          | `{ token, password }`: new password, signs out everywhere                    |
| `POST /api/auth/discord-signup` | `{ gamerTag }`: finishes a Discord sign-up                                   |
| `POST /api/auth/sign-out`       | Ends the session                                                             |
| `GET /api/account`              | `AccountView`: gamer tag, explorer, rite progress                            |
| `PATCH /api/account`            | `{ gamerTag }`: change the gamer tag                                         |
| `DELETE /api/account`           | `{ gamerTag, password, code }`: delete the account (see below), sign out     |
| `POST /api/ticket`              | `{ ticket }` for the game server                                             |
| `POST /api/account/password`    | `{ current, password }`: change it (or set one); signs out other browsers    |
| `POST /api/account/mfa/setup`   | `{ secret, qr }`: a new secret (kept as `totpPending`) and its QR code (SVG) |
| `POST /api/account/mfa/enable`  | `{ code }`: turns it on; `{ codes, account }`, the recovery codes shown once |
| `POST /api/account/mfa/disable` | `{ code }` (app or recovery code): turns it off                              |
| `DELETE /api/account/discord`   | Unlink Discord; refused without a password                                   |
| `DELETE /api/account/sessions`  | Sign out every other browser                                                 |

A refusal is `{ error }` with a message for the player. Sign-in gives the same message for a wrong password and an unknown email.

The cookie is `httpOnly` and `SameSite=Lax`, and `Secure` when the site is served over https.

On the client, `session.account` (`account.svelte.ts`) holds the last `AccountView`; `loadAccount()` fetches it again. The server is the only thing that changes an account.

## The gamer tag

The gamer tag is the name other players see: in the lobby, while spectating, in the rite overlay. It is 3 to 24 letters, numbers, spaces, `-` or `_`, and unique regardless of case (`cleanTag`). It is set at sign-up and changed on the Account screen. After a change the client sends `rename` to the game server, which reads the tag from the database again; the client never sends a name.

## The Account screen

The gamer tag at the top right of the dashboard is a menu (`AccountMenu.svelte`): Account and Sign out. It closes on Escape (which then doesn't also back out of the page), on a click elsewhere, and after a choice; the arrow keys move between its items. Account opens `/account`, a TabScreen like `/settings` and, like it, outside the dashboard group, so it replaces the frame. Escape (`toggleSettings`) leaves it. Its groups:

- **Profile**: the gamer tag (sends `rename` after a change), the email, Sign out, Delete account.
- **Sign-in**: change or set the password; link or unlink Discord (shown when Discord is configured, or already linked).
- **Security**: turn two-step sign-in on (QR code, the key as text, a code to confirm, then the recovery codes once) or off; sign out everywhere else.

Account things live only here, not in Settings, so the gamer tag can't be changed underground.

## Deleting an account

`deleteAccount` (`src/lib/server/store/deletion.ts`) is the one way an account goes, used by the admin app's member page (docs/dev/admin.md#members) and by Delete account on the Account screen (`DELETE /api/account`). The player confirms by typing their gamer tag (any case), plus their password if they have one (counted under the `signIn` limit) and a two-step code if that is on. Admins type the gamer tag exactly and can't delete themselves. Either way it goes in the audit log with the account id and gamer tag (`deleteAccount`, or `deleteOwnAccount` with the player as the one who did it).

- **Removed:** the account; its `sessions`, `tickets`, `adminSessions`, `resets` and `challenges`; its explorers with their `ledger` and rite `progress`; every `friends` document it is in (friendships and requests, both ways); its `ideaVotes`, each taking one off its idea's `votes`.
- **Kept, anonymous:** its `reports`, `feedback` and `ideas`, with the account and gamer tag replaced by `DELETED_ACCOUNT` (`deleted`, "Deleted player"; the admin app doesn't link those to a member page). Its `runs` stay as they are: they name only the explorer id, which no longer leads anywhere, so the stats stay whole. GitHub issues already filed from its reports aren't touched.
- **The game server** checks every minute (`server/suspensions.ts`, with suspensions): `deletedAmong` looks for everyone connected and everyone on their friend lists. A deleted player still connected is sent away (`Parties.expel`), and `Social.forget` drops their invites and reads the lists of anyone online who had them again.

The email and gamer tag are free to be used again at once.

Adding a collection that stores an account or explorer id: decide whether it is removed or anonymized, and add it to `deleteAccount`.

## Forgot password

`/auth/forgot` → `POST /api/auth/forgot` makes a reset (`requestReset`) and emails `<origin>/auth/reset?token=…` (`resetMail`). The answer is the same whether or not the email has an account. `/auth/reset` checks the link first (`resetIsValid`), then `consumeReset` sets the password, removes every reset for the account, and deletes all its sessions and tickets (`deleteSessionsFor`). Two-step sign-in still applies afterwards.

### Email

`sendMail` (`src/lib/server/mail.ts`) posts to Resend's API with `RESEND_API_KEY`, from `MAIL_FROM`. Without a key (development) it writes the email, link included, to the `pnpm dev` console. Setting up the domain: [deployment.md](deployment.md#email-and-discord).

## Two-step sign-in

TOTP (RFC 6238: SHA-1, 6 digits, 30 seconds, as every authenticator app expects), in `src/lib/server/totp.ts` with `node:crypto`. A code is accepted one step either side of now, and never for a step at or before `usedStep`, so a code can't be replayed. Recovery codes look like `xxxxx-xxxxx`; only their hashes are kept, and each is removed when used.

Signing in: once the password (or Discord) is right, `signIn` (`session.ts`) refuses a suspended account (with the reason), or creates the session, or, if the account has `totp`, starts a challenge and sets the `undercroft.challenge` cookie. The browser goes to `/auth/mfa`, and `POST /api/auth/mfa` (`finishChallenge`) creates the session when the code is right. Any new way of signing in should go through `signIn`, so two-step sign-in applies to it.

Setting up: `/mfa/setup` stores the secret as `totpPending` and returns it with a QR code (`qrcode`, as SVG, shown in an `<img>`). Only `/mfa/enable` with a code from that secret moves it to `totp`, so a bad scan can't lock anyone out.

## Discord

The OAuth2 code flow with the `identify` and `email` scopes (`src/lib/server/discord.ts`). It is only offered when `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are set (`discordEnabled`).

- `/auth/discord` (sign in) and `/auth/discord/link` (signed in, from the Account screen) set the `undercroft.oauth` cookie (a random `state` and the mode) and send the browser to Discord (`goToDiscord`).
- `/auth/discord/callback` checks the state, swaps the code for the Discord user, then:
  - **link**: links it to the signed-in account (refused if another account has it), back to `/account?discord=…`;
  - an account already linked to this Discord id is signed in through `signIn`;
  - no verified email on Discord: refused;
  - **an email that already has an account: refused, never linked by itself.** Whoever controls the Discord account might not own the Undercroft one. They sign in with the password and link from the Account screen;
  - otherwise a `signups` entry and `/auth/discord/tag`, where they choose a gamer tag (it starts as their Discord name). The account is only created then.
- Results come back as `?discord=<reason>`, said to the player through `DISCORD_RESULTS`.

Unlinking is refused for an account without a password, so it always has a way in.

**Adding another provider** (Steam, say): a module like `discord.ts`, routes like `/auth/discord`, a unique sparse field on `accounts` like `discord.id`, and `signIn` for the session. If the provider gives no email, sign-up has to ask for one, or the account can't recover a password.

## Limits

`throttle(db, rule, key)` counts a try and says whether it is allowed; `throttled` only checks. The rules are data (`THROTTLE` in `content/account.ts`): `signIn` (per email) and `code` (per account, through `checkSecondFactor`) count only wrong passwords and codes, so getting it right never uses one up; `forgot` (per email) and `forgotFromAddress` (per IP) count every reset email. `report`, `idea`, `feedback` and `vote` (per account) count every one sent (see [reports.md](reports.md)). A challenge also ends after too many attempts.

## The game server

The game server is a different origin and can't see the session cookie. So:

1. The connection module (`src/lib/game/net/connection.svelte.ts`) asks the site for a ticket (`POST /api/ticket`).
2. It sends the ticket in `hello`.
3. The game server looks the ticket up in MongoDB (`identify` in `server/accounts.ts`) and gets the account, its explorer and the gamer tag.

A `hello` without a valid ticket gets `reject { reason: 'Sign in to play' }`. The client then asks for a new ticket and tries once more (the old one may have expired); if the site says it isn't signed in (401), it goes to the sign-in page. Any other failure to get a ticket is retried: it is not a reason to sign anyone out.

A ticket can be used again until it expires, so a dropped connection reconnects with the same one.

An account is one `Member` on the game server (`Parties.byAccount`). If the account connects again while it is already there, the new connection becomes that member and the old one is closed with `reject { reason: 'You connected from somewhere else' }`. This is also how a dropped player takes their place back, in the party and underground (see [expedition.md](expedition.md#reconnection)), and it stops one account being in two places.

Both processes need MongoDB. Without it the site can't sign anyone in and the game server rejects every `hello`.

## Testing with more than one player

A session is a cookie, so two players on one machine need two browser profiles, or one normal window and one private window, each signed in to its own account.
