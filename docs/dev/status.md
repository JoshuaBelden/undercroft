# Status effects

A status is something that happens to a creature for a while: **stunned** is the first. The system only keeps time: which statuses a creature has, for how long, and how long it is immune after. **A status doesn't define its effect.** How long it lasts on a creature, and how long that creature is immune after, is in that creature's data. What it does to the creature is in that creature's own code.

## Files

| File                                   | What                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `src/lib/content/statuses.ts`          | `STATUSES` (names, for help and admin), `StatusReaction`, `STROBE`         |
| `src/lib/shared/status/status.ts`      | Bookkeeping: `applyStatus`, `stepStatuses`, `hasStatus`, `endStatus`       |
| `src/lib/content/afflictions.ts`       | `ManifestationSpec.vulnerable` and `.statuses`: the Gloaming's reactions   |
| `src/lib/content/creatures.ts`         | `CreatureDef.vulnerable` and `.statuses` (optional: none of them, for now) |
| `server/affliction.ts`, `creatures.ts` | What stunned does to the manifestation and to creatures; `strobe()`        |

## Data

- `STATUSES[id]`: `{ id, name, description }`. No durations, no behaviour.
- A creature's `statuses: { [status]: { seconds, immunity } }` is how it takes each status: `seconds` it lasts on it, then `immunity` seconds before it can have it again. **A creature with no entry for a status never gets it.**
- A creature's `vulnerable: StatusSource[]` lists what can cause it a status. The only source is `'strobe'`.
- `STROBE`: `{ light, causes }`. The strobe causes `stunned` on what this one lamp lights at least `light` (lamp units).

The Gloaming: `vulnerable: ['strobe']`, `statuses: { stunned: { seconds: 2, immunity: 20 } }`.

## Bookkeeping

A creature keeps a `Statuses` record (`{ [id]: { left, immune } }`), starting empty.

- `applyStatus(statuses, id, reactions)` gives it the status for its reaction's `seconds`. It is refused (false) with no reaction, while it already has it, or while it is immune.
- `stepStatuses(statuses, reactions, dt)` runs each tick. A status that runs out starts that creature's `immunity`; entries are removed once both run out.
- `hasStatus(statuses, id)` is what the creature's code checks.
- `endStatus(statuses, id, reactions)` ends one early. Its immunity still follows.

## The strobe

Turning a headlamp on from off, at any level, is a strobe. `Session.simulate` notes `headlampOutput(state).on` before each input frame, and `AfflictionSystem.simulated` looks again after it. If it went from off to on (with battery: a dead lamp gives no flash), that calls `AfflictionDirector.strobe(state)` and `CreatureDirector.strobe(state)`, and raises a `strobe` event `{ player, position, stunned }` (how many it stunned). Each one checks that the creature is vulnerable to `'strobe'` and that this player's lamp lights it, using `lampIllumination` (occlusion included):

- the manifestation: on its core;
- creatures: the brightest of their `bodySamples`.

Then it applies `STROBE.causes` by the creature's own reaction. The client plays `strobe.flash` when a strobe stunned something (the lamp's own click plays anyway).

## What stunned does

- **The manifestation:** it stands where it is, and a swing not yet landed is lost. Exposure and weapons work as usual. The snapshot's `stunned` makes the client play `take_damage`, then hold it still, with `manifest.stun`.
- **Creatures:** like a stagger. It stands where it is, an attack not yet landed is cancelled, and its animation is `take_damage`. No creature in the game is vulnerable yet; the tests use a test-only kind.

## Adding a status or a vulnerability

1. **A status:** add it to `STATUSES` (name and description).
2. **What causes it:** a source in `StatusSource`, and wherever it happens, a call like `strobe()` that checks `vulnerable` and calls `applyStatus` with the creature's reactions.
3. **Each creature that can get it:** an entry in its `statuses` (its own seconds and immunity), and its source in `vulnerable`. Then decide in that creature's director code what having it does (`hasStatus`), and what clients see (put it in the snapshot).
4. Tests: `status.test.ts` for the bookkeeping; the creature's own director tests for the effect.

## Admin

`DEV_MODE`: **Stun it** in the Affliction group stuns the manifestation (`stun`), by its own reaction, so immunity still applies.
