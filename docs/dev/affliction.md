# The Affliction: meter, omens, manifestation, banishing

An Affliction is the force behind an expedition (see `docs/HANDOFF.md`). The rite that resolves it is in [rite.md](rite.md). In code it is the hidden **meter**, the **omen stages** players read it by, and the **manifestation** at 100%. The first Affliction is the Gloaming: its manifestation is living darkness.

## Files

| File                                  | What                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/content/afflictions.ts`      | Affliction definitions (data): meter rates, omen stages, manifestation |
| `src/lib/shared/affliction/types.ts`  | `AfflictionSnapshot` (in every `tick`)                                 |
| `src/lib/shared/player/headlamp.ts`   | Gloom: lamp failure in the shared lamp output                          |
| `server/affliction.ts`                | `AfflictionDirector`: meter, stages, the darkness, exposure, banish    |
| `src/lib/game/affliction/Darkness.ts` | Client: the darkness cloud, presence rumble, hiss, dissolve            |
| `src/lib/game/audio/Ambience.ts`      | Omen sound layers (`setOmen`)                                          |

## The meter

`meter` runs from 0 to 1 and is never shown to players. Each server tick:

- time adds `1 / meter.seconds` per second (1800 s for the Gloaming), while anyone is underground;
- each creature killed adds `meter.perKill` (0.04);
- loot carried adds `meter.perLoot` per second for each unit of value the players carry between them (see [economy.md](economy.md#loot)).

At 1 it manifests and the meter stops. Clients only receive the omen stage. In dev mode the snapshot also carries `meter`, for the admin panel.

## Omen stages

`stages` are ascending thresholds (Gloaming: 25%, 50%, 75%, 90%). Entering a stage:

- sets the **gloom** baseline for every lamp;
- sets creature **boldness** (`CreatureDirector.boldness`): perception and hearing radii scale by it, and creep time between bursts shrinks;
- **spawns** `spawn` extra creatures far from players (`spawnFar`, the manifestation's spawn distance);
- sends an `omen` event, and the snapshot's `omen` changes. Clients apply the stage's `ambience`: distant knocks and swells come `knocks`/`swells` times as often, `whispers` per minute play close by, and a low drone loop fades in to `drone`.

## Gloom (lamp failure)

`PlayerState.gloom` (0..1) is set by the server every tick:

- the stage baseline;
- or, if higher, the manifestation's pull: 0.8 everywhere while it gathers, and near it `(1 − distance / gutterRadius) × 2`, so lamps die outright within half the gutter radius.

`headlampOutput` applies it:

- more flickers (`+ gloom × 4` per second);
- lower output (`× (1 − 0.6 × gloom)`);
- above 0.7, whole moments where the lamp gives no light (seeded by the lamp clock).

Because it's in the shared lamp code, it is deterministic: prediction, half-light visibility (failing lamps reveal creatures more often) and the server all agree. The HUD darkens the screen edges with gloom.

## The manifestation (living darkness)

When the meter fills:

1. **Spawn:** a nav point 30 to 60 m along the grid from every player (or as far as the map allows).
2. **Gathering** (`gatherSeconds`): every lamp in the map gutters, and clients hear the `manifest.signal`.
3. **Hunting:** it drifts along the nav grid (A\*, re-planned every 0.5 s) toward the nearest player who isn't down, at `speed`, or `darkSpeed` when no lamp light reaches it. It is darkness, not a body: no collision, and water, crawls and squeezes don't slow it.
   - Within `radius`, sanity drains at `drain` per second.
   - Its core (`core` metres, horizontally) hits for `touchDamage` every `touchInterval`.
   - Downed players are ignored.

### Exposure and banishing (light and weapons)

- **Exposure:** each tick the lamp light on its core is summed from all players (`illumination`, occlusion included). Light at or above `exposeLight`, held steadily for 0.4 s (a flicker isn't enough), exposes it for `exposeLinger` seconds. Since lamps die close to it, it has to be lit from range: a bright beam from about 8 to 15 m, or several lamps at once. A low lamp never manages it.
- **Damage:** exposed, weapon hits come off its `health`. Unexposed, they only slow it for `slowSeconds`. It's a combat target with id `manifestation` (`server/combat.ts` `targets()` and `hurt()`), so shots, swings and thrown items all work.
- **Banish:** at 0 health it's banished. Every player still in the expedition, downed ones included, gets the `banished` message and leaves; the results screen says the dark recedes and the Gloaming is not resolved.

## Client

`Darkness` draws a cloud of dark smoke sprites around the snapshot position. It churns slowly, draws in tight while gathering, thins and recoils (with a hiss) when exposed or hit, and comes apart when banished. A presence rumble loop gets louder within 28 m.

## Adding an Affliction

1. Add an `AfflictionDef` to `AFFLICTIONS` (meter, stages, manifestation spec).
2. The meter, stages, gloom and omen sounds work from data.
3. A different manifestation (not darkness) needs its own behaviour in `AfflictionDirector` and its own client renderer, chosen by the Affliction id. Expeditions currently always use the Gloaming; the hub will choose.

## Admin

These need `DEV_MODE`:

- a meter readout and omen stage;
- **Set meter %**;
- **Force manifestation** (sets the meter to 100%);
- **Banish**.
