# Rumors

The first Affliction, and the only one a new player can choose: a tutorial walked step by step, and a vault to train in. The Gloaming stays locked until a player has got out of Rumors once (every account, including those who played the Gloaming before). After that it stays open as a training ground. The design is in [the handoff](../handoff-gear-crafting-loot.md#rumors-the-tutorial-and-training-ground-decided).

## Files

| What                                                                   | Where                                                                                                      |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| The Affliction and its `TrainingSpec` (crates, things, dummies, steps) | `AFFLICTIONS.rumors` in `src/lib/content/afflictions.ts`                                                   |
| The map                                                                | `tryTraining` and `trainingWalls` (`generate.ts`, `walls.ts`); `trainingCrates`, `worldSpots` (`spots.ts`) |
| The pieces                                                             | `rumors-walk`, `rumors-vault` (`scripts/blender/rooms.py`, kit entries owned by `rumors`)                  |
| The session: dummies, tutorial stock, no threat                        | `Session.populateTraining`, `stockTraining`, `tutorial`, `hurt` (`server/session.ts`)                      |
| Dummies                                                                | `CREATURES.dummy` (`dummy: true`), `CreatureDirector.placeDummy`, `train`, `takeStruck`                    |
| The dummy model (a placeholder)                                        | `scripts/blender/dummy.py` -> `art/export/creatures/dummy.glb`                                             |
| Done, and the Gloaming's lock                                          | `onTrained` -> `Progress`; `Parties.locked`; `afflictionLocked`, `requires`                                |
| The tutorial on screen, dummy numbers                                  | `src/lib/game/play/training.svelte.ts`, `src/lib/ui/TrainingOverlay.svelte`                                |
| Tests                                                                  | `server/systems/training.test.ts`                                                                          |

## The map

An Affliction with `training` gets its own map (`generateLayout` with `training`): the start room and its exit, the walk, then the vault, every opening left a dead end. No levels, branches, rope drops, loops or doors. The walk's far end and the vault's way in are `vault` sockets, so the walk is always walked from the start. Off the vault's side arches, each a dead end, are a web and a fall of rubble (`trainingWalls`). The walk's crate markers are the map's only crates (`trainingCrates`).

`spot-<name>` markers name places in a piece (`PieceDef.spots`, `worldSpots` in world space). The walk has the tutorial's: `step-crate`, `kit`, `step-kit`, `step-recipe`, `chalk`, `step-chalk`. The vault has `range`, `dummy-5`/`10`/`20`/`40` (that far from `range`), `track`, `step-vault` and `step-out`, rubble markers for bricks, and its ladder out (`extract-0`).

## No threat, normal rules

The Affliction director starts calmed (no meter, omens or manifestation; `manifestation` is optional on an Affliction), the creature director is `quiet` (nothing is drawn to noise or light) and only the dummies are placed. Things hurt as anywhere, but in a training ground `hurt` never takes sanity below 1: nobody goes down. Rounds are spent, things wear and break, what is used is gone.

## Dummies

`dummy: true` creatures stand (or run their track: `track` metres side to side across where they face), never notice or attack, stagger and bleed as anything does, and never die: taking their health, they are whole again. Each hit is a `dummyHit` event with its damage (a number rising off it on screen) and a reset is `dummyReset`.

## The tutorial

`steps` are told once each, as a note alert where alerts show (up `ALERT.tutorialSeconds`, 20 s, or until clicked away), when a player comes within `radius` of the step's spot (the first, with no spot, on arriving). Steps marked `firstTime` (the stocked crates, the kit) are told only when the tutorial is stocked: the session says which on arriving (the `tutorial` message). `crates` (what each of the walk's crates holds) and `floor` things marked `firstTime` are only there the first time: the party tells the session (`tutorial(firstTime)`) whether anyone going down hasn't done it yet; otherwise they are empty. Bricks are always there.

## Done

Getting out of a training ground (`onTrained`) records it as resolved in `Progress`. An Affliction's `requires` (the Gloaming's is `rumors`) keeps it locked until that is done: the host can't choose it and nobody can ready for it (`Parties.locked`), its pane on the Afflictions page shows it as not yet discovered (and the first time the page is seen after it opens, the unknown pane fades into it: remembered per explorer in localStorage) (the unknown banner, no rite or location), and the Expedition picker leaves it out (`afflictionLocked`). F10's **Forget Afflictions** forgets it again.

## Admin

- **Rumors done** (F10, Account group, dev mode): marks Rumors resolved, the Gloaming open.
- **Forget Afflictions** (F10, Account group): no progress against any Affliction, Rumors to do again.
- The admin app's **Reset to a new player** (a member's page) starts them over entirely ([admin.md](admin.md)).

## Adding a step, a dummy or a thing

A `spot-<name>` empty in the piece (`rooms.py`), then a line in the spec's `steps`, `dummies` or `floor`.
