# Unit tests

Unit tests run with [Vitest](https://vitest.dev). They cover the shared game logic (`src/lib/shared/`) and the game server (`server/`): no renderer, audio, browser or real database. There are no browser or Playwright tests.

```
pnpm test           # run every test once (what the quality gates mean)
pnpm test:watch     # rerun the affected tests on save
pnpm test nav       # only test files whose path contains "nav"
pnpm test:coverage  # run them with a coverage report
```

`pnpm test` must pass, along with `pnpm check` and `pnpm lint`, before a change is done. A change to shared or server logic comes with tests for it.

## Coverage

`pnpm test:coverage` prints a table per file (statements, branches, functions, lines, and the uncovered line numbers) and writes a browsable report to `coverage/index.html` (gitignored). Only the code meant to be unit tested is counted: `src/lib/shared/` and `server/` (`vitest.config.ts` `coverage.include`), less the fixtures and generated files, and the server's process wiring: `server/index.ts` (the WebSocket server, signals, startup), `db.ts` (the MongoDB connection), `config.ts` and `log.ts`. Those only do anything in a running server; start it to check them (`pnpm dev:server`).

The aim is at least 80% of lines, and it is well above that (about 97% of lines and 84% of branches). There is no threshold that fails the run: use the report to find untested rules, not to chase a percentage. What is left uncovered is mostly odd side cases (a store failing halfway, a creature stuck on geometry) that would take a lot of test code for little.

## Where tests live

Next to the code, named after it: `src/lib/shared/map/nav.ts` is tested by `src/lib/shared/map/nav.test.ts`, `server/session.ts` by `server/session.test.ts`. Vitest picks up `src/**/*.test.ts` and `server/**/*.test.ts` (`vitest.config.ts`). Test files are type-checked by `pnpm check` and linted like any other file. Nothing imports them, so they never reach a build.

Fixtures (only test files import them):

`src/lib/shared/testing/maps.ts`

- `realMap(seed, affliction?)`: a map built the way the server builds one (`server/session.ts` `generate`): the layout from the real kit and pieces, then its crates.
- `realWorld(layout)`: its collision world.
- `worldOf(colliders, volumes?)` with `box(center, size)`, `volume(kind, center, size)` and `FLOOR`: a small hand-built world for exact numbers (a cube on a floor, a ledge, a pool of water).

`server/testing/harness.ts`

- `newSession(seed, hooks?)`: a real `Session` on a known map (it picks its seed with `Math.random`, which this pins).
- `Diver`: a player in it, on a `FakeSocket` that keeps what it was sent (`socket.last('tick')`, `socket.all('marks')`). `hold(input, seconds)` sends input frames the way a client does and lets the session tick; `press(input)` presses a button once; `lookAt(point)` gives the yaw and pitch that look at something; `state` and `player` are the server's own.
- `fakeTime()`: fake timers, so the session's tick, the party countdown and invites run on `vi.advanceTimersByTime` instead of the clock. `wait(seconds)` lets a session tick with nobody sending input.
- `mapFixture(seed)`: a real map's layout, collision world and nav grid, cached, for testing the directors (creatures, the Affliction, crates, the rite) on their own. `prey(id, position)`: a player standing somewhere for them to see.
- `FakeSocket.receive(message)` and `hangUp()`: the client sends something, or disconnects (`server/connection.test.ts`).

`server/testing/setup.ts` quiets the server's log for every test.

## What to test

- **Determinism.** Same seed, same result: `Rng`, `generateLayout`, `placeCrates`, `rollCrate`, and `stepPlayer` (the client predicts with it, so it must replay the same from the same inputs).
- **Invariants over many seeds.** Map generation is tested over 40 seeds per Affliction: no two pieces share a cell, the start room comes first, the final room is deeper than every other room, only shared pieces or the Affliction's own are used. Nav: every point reachable from the spawn, a path to every extraction.
- **Rules.** Inventory: stacking, weight limit, swaps, sealed crate slots, splitting and dropping keep counts right. Movement: steps, ledges, low ceilings, water, stamina, the lamp.
- **The expedition, end to end.** `server/session.test.ts` plays it through a real `Session`: shooting and stabbing creatures, throwing, dropping and picking up, opening crates, chalk marks, going down and being revived, dying and watching, extracting, the deadline, banishing, the rite, admin commands, and a tick that throws.
- **Parties and friends.** `parties.test.ts` (readying, the countdown, descending together, dropping and coming back, kicking), `social.test.ts` (requests, invites, presence), `connection.test.ts` (hello, and every message routed).
- **Sanitizers.** Everything that reads untrusted network input (`sanitizeFrame`, `sanitizeAction`, `sanitizeRef`, admin commands, marks) rejects or clamps junk.

Not unit tested: rendering (Three.js), audio, Svelte components, the site's MongoDB stores (`src/lib/server/store/`) and the server's process wiring. Those are play-tested.

## Writing one

- **Use the real content.** Import `ITEMS`, `PIECES`, `MAP_KIT` and the tuning in `src/lib/content/` instead of mocking them, so a content change that breaks a rule fails a test. Pick items by what they are rather than by name (`inventory.test.ts` `itemWhere`), so new and renamed items don't break tests.
- **Mock only the database.** The game server runs without MongoDB (every store call is skipped when `getDb()` is null), so most server tests need no mocks at all. Where the logic is in what the server does with the store's answers (friends, belongings, progress), replace the store module with `vi.mock` and an in-memory stand-in (`social.test.ts`, `storage.test.ts`), never the server code under test.
- **Seed everything.** Never `Math.random()` in a test: a failure must repeat. Put the seed in the assertion message (`expect(x, \`seed ${seed}\`)`) so it can be reproduced, for example with `pnpm dev:server` and the admin regenerate.
- **Test the documented behaviour.** If a test fails, check the docs and the code before changing either: the generator's "final room is deepest" means rooms by the level they are entered at, because canal halls and the cistern reach below their floor.
- **Reach into the server only to set up or look.** Tests may read a session's private parts with bracket access (`session['crates']`, `session['world']`) to find a crate or a wall, or to check the outcome; what they exercise goes through the public API (`addPlayer`, `receiveInput`, `inventory`, `mark`, `admin`) as a client would.
- **Keep it fast.** The whole suite runs in under a minute. A `Session` takes about half a second to build (the nav grid is the slow part): open one per test, not one per assertion, and use `mapFixture` for the directors.

## Testing new server logic

Most of it can be tested through a `Session` or directly, as it is. If a piece of logic is tangled up with process or socket wiring, move it into its own function first (as `server/connection.ts` was taken out of `server/index.ts`), test that, and leave the wiring around it.
