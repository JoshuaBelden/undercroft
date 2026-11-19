# The expedition on the server: Session and its systems

One expedition is one `Session` (`server/session.ts`). It is server-authoritative: the map and every player's state live there. Solo play is a session with one player.

The session is a host. It builds the map, takes players in and out, simulates their input, runs the tick and broadcasts it. Everything a feature does down there is a **system** in `server/systems/`, one file per feature, and the session reaches it only through hooks. A new feature adds a file there and a line in `server/systems/index.ts`. It doesn't add branches to `session.ts`.

## Files

| File                           | What                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `server/session.ts`            | `Session`: the map, players, input, the tick, leaving, run stats, sending              |
| `server/systems/system.ts`     | `Player`, `SessionContext` (what systems get), `SessionSystem` (the hooks), `TICK_DT`  |
| `server/systems/index.ts`      | `createSystems`: every system, by name, in the order they run                          |
| `server/systems/creatures.ts`  | Creature blows; admin spawn, clear, kill                                               |
| `server/systems/affliction.ts` | The meter, omens, the strobe, summoning and banishing ([affliction.md](affliction.md)) |
| `server/systems/pack.ts`       | Pack screen requests, picking up, thrown items ([items.md](items.md))                  |
| `server/systems/sanity.ts`     | Darkness and seeing creatures drain sanity; revives ([player.md](player.md))           |
| `server/systems/rite.ts`       | Reading hints, performing the rite ([rite.md](rite.md))                                |
| `server/systems/deadline.ts`   | The expedition's clock; time running out ([expedition.md](expedition.md))              |
| `server/systems/crates.ts`     | Opening loot crates and corpses, looting, shutting them                                |
| `server/systems/doors.ts`      | Unbarring doors between levels                                                         |
| `server/systems/marks.ts`      | Chalk marks: drawing, rubbing out, sending ([marks.md](marks.md))                      |
| `server/systems/ropes.ts`      | Laying, tying, untying and gathering rope ([rope.md](rope.md))                         |
| `server/systems/survey.ts`     | The explorer's map: sketching and showing ([map.md](map.md))                           |
| `server/systems/surveyor.ts`   | The surveyor's route, and sharing his map ([creatures.md](creatures.md))               |
| `server/systems/cheats.ts`     | Admin tools for your own explorer: flags, give, ammo, conditions, teleport             |

The directors and stores the systems use (`CreatureDirector`, `AfflictionDirector`, `RiteDirector`, `WorldItems`, `Crates`, `Doors`, `Marks`, `Ropes`, `Surveys`) stay where they were, in `server/`. They hold a feature's state and rules. A system is the glue between one of them and the expedition: who is holding interact on what, what event goes out, who is told.

## What the session keeps

- **The map** (`build`): the layout, collision world, nav grid, and what is built from them: creatures, world items, crates, doors, the Affliction, the rite. They are replaced when an admin regenerates the map, so a system reads them from the context each time and never keeps one.
- **Players**: `addPlayer`, `reattach`, `removePlayer`, `abandon`, spectators.
- **Input**: `receiveInput` queues frames; each tick `simulate` runs `stepPlayer`, combat (`server/combat.ts`) and falls for each frame.
- **Leaving**: the dead and the extracted are told how it went (`died`, `extracted`), their runs are written (`logRun`) and they leave.
- **The tick message**: every player, creature, item, event, the Affliction (with the rite and the deadline), crates and doors.
- **Helpers every system needs**: `hurt`, `down`, `revive`, `canUseHands`, `freeSpot`, `awardEveryoneDown`, `send`, `broadcast`, `combat`, and `events` (this tick's).

## A tick

1. Each player's queued input frames are simulated (`simulate`). After movement, combat and falls, every system's `simulated` hook sees the frame: whether interact or attack went down on it, whether the lamp was lit before, and what the movement did (`SimEvent`s).
2. Every system's `step` runs, in the order of `index.ts`.
3. The tick's kills, crates and clues are counted, the dead and the extracted leave, and the tick goes out.

The order in `index.ts` matters. A system that reacts to something another does in the same tick goes after it. The Affliction resolves a banishing in its step, so a shot fired in this tick's input counts this tick. A system whose step comes first sees the others' state from the tick before. Crates, doors and marks all count interact held. Each checks what interact would take first (a floor item, then a crate), so a hold goes to one of them, whatever the order.

## Hooks

A system implements any of these (`SessionSystem`, all optional):

| Hook                      | When                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `mapBuilt()`              | A map was built: the first, or a regenerated one. Replace what was made from the old. |
| `regenerating()`          | An admin is replacing the map: let go of anything in the old one.                     |
| `regenerated()`           | The new map was built and sent (`map`): send what goes with it.                       |
| `joined(player, resumed)` | A player came down, or back on a new connection, and was sent `welcome`.              |
| `reconnecting(player)`    | A dropped player is back: what they had open went with the old connection.            |
| `left(player)`            | A player is leaving the session (extracted, dead, abandoned, gone).                   |
| `downed(player)`          | A player went down. `Session.down` already zeroed every hold timer on `PlayerState`.  |
| `simulated(player, step)` | One of their input frames was simulated.                                              |
| `step()`                  | Once per tick, after all input.                                                       |
| `admin`                   | Admin commands it carries out, by kind (see below).                                   |

A system gets a `SessionContext`, the session itself seen through that interface. When one system needs another, it asks through `ctx.systems`, by name: a crate's loot goes through `ctx.systems.pack.afterRequest`, a hint read in a crate through `ctx.systems.rite.readClue`, the rite summons through `ctx.systems.affliction.summon`. Keep those calls few. Most of what a system needs is on the context.

## Admin commands

`admin` maps a command kind to a handler. The command comes in narrowed to its kind, so `command.value` is typed:

```ts
admin = {
	clearMarks: () => {
		this.marks.clear();
		this.changed();
	}
} satisfies SessionSystem['admin'];
```

The session collects every system's handlers when it starts, and throws if two claim the same kind. A handler returns `false` when it refuses the command (bad arguments), so it isn't logged. The session handles `throw` and `regenerate` itself. Every admin command is ignored unless `DEV_MODE` is on.

## Adding a system

1. Write `server/systems/<feature>.ts`: a class implementing `SessionSystem`, constructed with the `SessionContext`. Keep its state in the class: maps of who is doing what, a store like `Marks`. Its rules stay in a director or a store in `server/` or `src/lib/shared/`, so they can be tested on their own.
2. Add it to `createSystems` in `server/systems/index.ts`, where its step belongs.
3. A message from the client gets a one-line method on `Session` that finds the player and hands it to the system (`mark`, `inventory`, `closeCrate`), and a `case` in `server/connection.ts`.
4. A new hold timer on `PlayerState` is zeroed in `Session.down`, with the others.
5. Test it in `server/systems/<feature>.test.ts` through a real `Session` ([testing.md](testing.md)).
