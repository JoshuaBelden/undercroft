# The Affliction: meter, omens, manifestation, banishing

An Affliction is the force behind an expedition (see `docs/HANDOFF.md`). The rite that resolves it is in [rite.md](rite.md). In code it is the hidden **meter**, the **omen stages** players read it by, and the **manifestation** at 100%. The first Affliction is the Gloaming: its manifestation is a figure that hunts the players.

## Files

| File                                       | What                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `src/lib/content/afflictions.ts`           | Affliction definitions (data): meter rates, omen stages, manifestation   |
| `src/lib/shared/affliction/types.ts`       | `AfflictionSnapshot` (in every `tick`)                                   |
| `src/lib/shared/player/headlamp.ts`        | Gloom: lamp failure in the shared lamp output                            |
| `server/affliction.ts`                     | `AfflictionDirector`: meter, stages, the manifestation, exposure, banish |
| `src/lib/game/affliction/Manifestation.ts` | Client: the figure, presence rumble, hiss, fading away                   |
| `src/lib/game/audio/Ambience.ts`           | Omen sound layers (`setOmen`)                                            |

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

`PlayerState.gloom` (0..1) is set by the server every tick to the current omen stage's `gloom` (0 before the first stage; 0.45 at the last, for the Gloaming). Nothing else adds to it: the manifestation puts no lamp out, so the map is never darker than the last omen stage makes it.

`headlampOutput` applies it:

- more flickers (`+ gloom × 4` per second);
- lower output (`× (1 − 0.6 × gloom)`);
- above 0.7, whole moments where the lamp gives no light (seeded by the lamp clock).

Because it's in the shared lamp code, it is deterministic: prediction, half-light visibility (failing lamps reveal creatures more often) and the server all agree. The HUD darkens the screen edges with gloom.

## The manifestation

When the meter fills:

1. **Spawn:** a nav point 30 to 60 m along the grid from every player (or as far as the map allows).
2. **Gathering** (`gatherSeconds`): it stands where it appeared, and clients hear the `manifest.signal`.
3. **Hunting:** it goes along the nav grid (A\*, re-planned every 0.5 s) toward the nearest player who isn't down, at `speed`, or `unlitSpeed` when no lamp light reaches it. The server simulates it as a point, not a body: no collision, and water, crawls and squeezes don't slow it.
   - Within `radius`, sanity drains at `drain` per second.
   - Its core (`core` metres, horizontally) hits for `touchDamage` every `touchInterval`.
   - Downed players are ignored.

### Exposure and banishing (light and weapons)

- **Exposure:** each tick the lamp light on its core is summed from all players (`illumination`, occlusion included). Light at or above `exposeLight`, held steadily for 0.4 s (a flicker isn't enough), exposes it for `exposeLinger` seconds. Lamps work right up to it, so any lamp held on it at reasonable range does it; several lamps add up.
- **Damage:** exposed, weapon hits come off its `health`. Unexposed, they only slow it for `slowSeconds`. It's a combat target with id `manifestation` (`server/combat.ts` `targets()` and `hurt()`), so shots, swings and thrown items all work.
- **Banish:** at 0 health it's banished. Every player still in the expedition, downed ones included, gets the `banished` message and leaves; the results screen says the dark recedes and the Gloaming is not resolved.

## Client

`Manifestation` draws the figure at the snapshot position, hisses when light exposes it, and fades it away over 3 s when banished. A presence rumble loop gets louder within 28 m. There is no darkness around it: no cloud, and no effect on lamps.

### The figure

If the manifestation has a `body` (`ManifestationBody` in `afflictions.ts`), that rigged model is what players see. It is drawn by the client only: the server simulates a point with a hit capsule. Without a `body` nothing is drawn.

`body` holds the model, `yawOffset`, `scale`, an animation map (see Animation maps in [creatures.md](creatures.md)), `strikeSeconds` and `flinchSeconds`. The client picks the slot:

| Situation                                                     | Slot                                         |
| ------------------------------------------------------------- | -------------------------------------------- |
| Banished                                                      | `die`                                        |
| Its touch just landed (`strikes` rose)                        | `melee_attack`, stretched to `strikeSeconds` |
| A weapon just hit it (`hit()`)                                | `take_damage` for `flinchSeconds`            |
| Hunting, faster than halfway between `speed` and `unlitSpeed` | `running`                                    |
| Hunting, moving                                               | `walking`                                    |
| Gathering, or standing                                        | `idle`                                       |

- **Heading and speed** come from how it moves between frames; the snapshot has no yaw.
- **Strikes:** the snapshot's `strikes` counts touches landed. The touch itself is instant on the server, so the swing plays after the damage, not before.
- **Fading:** the figure fades in over 3 s when it manifests and fades out when banished.

The Gloaming's body is `gloaming_boss.glb`, scaled 1.3 (about 2.2 m, its hit capsule's height):

| Slot           | Clip                                                    |
| -------------- | ------------------------------------------------------- |
| `idle`         | `Walking`, held at frame 0 (the model has no idle clip) |
| `walking`      | `Walking`                                               |
| `running`      | `Running`                                               |
| `melee_attack` | `Charged_Upward_Slash`                                  |
| `take_damage`  | `Face_Punch_Reaction`                                   |
| `die`          | `Shot_and_Fall_Forward`                                 |

## Adding an Affliction

1. Add an `AfflictionDef` to `AFFLICTIONS` (meter, stages, manifestation spec).
2. The meter, stages, gloom and omen sounds work from data.
3. Give the manifestation a `body`, the figure players see: export it to `art/export/creatures/`, run `pnpm asset:build`, and map its clips.
4. A manifestation that behaves differently (not a figure that hunts) needs its own behaviour in `AfflictionDirector` and its own client renderer, chosen by the Affliction id. An expedition is against the Affliction its party's host chose on the Expedition page (`PartyState.affliction`, passed to `Session`); every entry in `AFFLICTIONS` appears in the picker.

## Admin

These need `DEV_MODE`:

- a meter readout and omen stage;
- **Set meter %**;
- **Force manifestation** (sets the meter to 100%);
- **Banish**.
