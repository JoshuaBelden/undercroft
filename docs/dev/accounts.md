# Accounts, sign-in and explorers

The whole game is behind sign-in. An account is an email, a password and a gamer tag. Each account has one explorer: the character who owns the stash, the loadout, the money and the rite progress. Discord and Steam sign-in are a later phase.

## Files

| File                                   | What                                                             |
| -------------------------------------- | ---------------------------------------------------------------- |
| `src/lib/content/account.ts`           | Rules: tag length, password length, session and ticket lifetimes |
| `src/lib/shared/account/types.ts`      | `AccountView`, `ExplorerView`: what the browser gets             |
| `src/lib/server/store/accounts.ts`     | Accounts, sessions, tickets, explorers in MongoDB                |
| `src/lib/server/db.ts`                 | The SvelteKit server's MongoDB connection                        |
| `src/lib/server/session.ts`            | The session cookie                                               |
| `src/hooks.server.ts`                  | Finds the account for every request; gates everything else       |
| `src/routes/auth/`                     | Sign-in and sign-up pages (`AuthForm.svelte`)                    |
| `src/routes/api/auth/`, `api/account/` | Sign up, sign in, sign out; the account; change the gamer tag    |
| `src/routes/api/ticket/`               | A ticket for the game server                                     |
| `src/lib/account/account.svelte.ts`    | Client: the signed-in account (`session.account`), API helper    |
| `server/accounts.ts`                   | Game server: who a ticket belongs to                             |

`src/lib/server/store/` is used by both processes. It takes the `Db` as an argument and imports by relative path, so the game server can import it too. It must not import anything from `$app`.

## Data (MongoDB)

- `accounts`: `_id`, `email` (lower-cased, unique), `password` (`scrypt$<salt>$<hash>`, from `node:crypto`), `gamerTag`, `tagKey` (lower-cased tag, unique, so tags can't differ only by case).
- `explorers`: `_id`, `account`, `money`, `stash`, `loadout`, `underground`. One per account today, created the first time it is needed (`explorerFor`). It is a separate collection, keyed by its own id, so an account can have several later.
- `sessions`: `_id` is the cookie value; `account`, `expires` (30 days).
- `tickets`: `_id` is the ticket; `account`, `expires` (12 hours).
- `progress`: rite progress, keyed by explorer (see [rite.md](rite.md)).
- `ledger`: the economy log (see [economy.md](economy.md#the-ledger)).

Sessions and tickets have a TTL index, so MongoDB removes them when they expire. `ensureIndexes` creates all the indexes and runs when either process connects.

There is no email service, so addresses are not verified and there is no "forgot password" email.

## The site (SvelteKit)

`hooks.server.ts` reads the `undercroft.session` cookie and sets `locals.account` (`id`, `email`, `gamerTag`). Without an account, anything outside `/auth/` and `/api/auth/` redirects to `/auth/sign-in`, or returns 401 for `/api/`. `+layout.server.ts` passes the account to every page.

Endpoints (JSON):

| Endpoint                  | Does                                                           |
| ------------------------- | -------------------------------------------------------------- |
| `POST /api/auth/sign-up`  | `{ email, password, gamerTag }`: creates the account, signs in |
| `POST /api/auth/sign-in`  | `{ email, password }`                                          |
| `POST /api/auth/sign-out` | Ends the session                                               |
| `GET /api/account`        | `AccountView`: gamer tag, explorer, rite progress              |
| `PATCH /api/account`      | `{ gamerTag }`: change the gamer tag                           |
| `POST /api/ticket`        | `{ ticket }` for the game server                               |

A refusal is `{ error }` with a message for the player. Sign-in gives the same message for a wrong password and an unknown email.

The cookie is `httpOnly` and `SameSite=Lax`, and `Secure` when the site is served over https.

On the client, `session.account` (`account.svelte.ts`) holds the last `AccountView`; `loadAccount()` fetches it again. The server is the only thing that changes an account.

## The gamer tag

The gamer tag is the name other players see: in the lobby, while spectating, in the rite panel. It is 3 to 24 letters, numbers, spaces, `-` or `_`, and unique regardless of case (`cleanTag`). It is set at sign-up and changed in Settings. After a change the client sends `rename` to the game server, which reads the tag from the database again; the client never sends a name.

## The game server

The game server is a different origin and can't see the session cookie. So:

1. The play page asks the site for a ticket (`POST /api/ticket`).
2. It sends the ticket in `hello`.
3. The game server looks the ticket up in MongoDB (`identify` in `server/accounts.ts`) and gets the account, its explorer and the gamer tag.

A `hello` without a valid ticket gets `reject { reason: 'Sign in to play' }`. The client then asks for a new ticket and tries once more (the old one may have expired); if the site says it isn't signed in, it goes to the sign-in page.

A ticket can be used again until it expires, so a dropped connection reconnects with the same one.

An account is one `Member` on the game server (`Parties.byAccount`). If the account connects again while it is already there, the new connection becomes that member and the old one is closed with `reject { reason: 'You connected from somewhere else' }`. This is also how a dropped player takes their place back underground (see [expedition.md](expedition.md#reconnection)), and it stops one account being in two places.

Both processes need MongoDB. Without it the site can't sign anyone in and the game server rejects every `hello`.

## Testing with more than one player

A session is a cookie, so two players on one machine need two browser profiles, or one normal window and one private window, each signed in to its own account.
