# The Affliction: meter, omens, manifestation, banishing

An Affliction is the force behind an expedition. The rite that resolves it is in [rite.md](rite.md). In code it is the hidden **meter**, the **omen stages** players read it by, and the **manifestation** the rite summons. Banishing the manifestation resolves the Affliction. The first Affliction is the Gloaming: its manifestation is a figure that hunts the players.

## Files

| File                                       | What                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `src/lib/content/afflictions.ts`           | Affliction definitions (data): meter rates, omen stages, manifestation   |
| `src/lib/shared/affliction/types.ts`       | `AfflictionSnapshot` (in every `tick`)                                   |
| `src/lib/shared/player/headlamp.ts`        | Gloom: lamp failure in the shared lamp output                            |
| `server/affliction.ts`                     | `AfflictionDirector`: meter, stages, the manifestation, exposure, banish |
| `src/lib/content/statuses.ts`              | Statuses and the strobe (see [status.md](status.md))                     |
| `src/lib/game/affliction/Manifestation.ts` | Client: the figure, its attack and stun sounds, fading away              |
| `src/lib/game/audio/Ambience.ts`           | Omen sound layers (`setOmen`)                                            |

## The meter

`meter` runs from 0 to 1 and is never shown to players. Each server tick:

- time adds `1 / meter.seconds` per second (1800 s for the Gloaming), while anyone is underground;
- each creature killed adds `meter.perKill` (0.04);
- loot carried adds `meter.perLoot` per second for each unit of value the players carry between them (see [economy.md](economy.md#loot)).

It stops at 1, at the last omen stage. **Nothing manifests when it fills:** only the rite summons the manifestation. Each tick's snapshot carries `omen`, `meter` (rounded; only the admin panel shows it, players never see it) and `calmed`.

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

It appears only when the rite is performed (`RiteSystem.step` calls `AfflictionSystem.summon`, which calls `AfflictionDirector.summon`). Nobody sees it before that.

1. **Summoned:** on the nav point in the rite's room (`RiteDirector.inRoom`) farthest from where the rite was performed: the room's far corner. If the room has no nav point, it appears 30 to 60 m along the grid from every player instead (`manifestFar`, `spawnDistance`). It is summoned once per expedition. A `manifest` event goes to everyone; the fight music starting is how players hear it (see Client).
2. **Gathering** (`gatherSeconds`, 2 s): it stands where it appeared.
3. **Hunting:** it goes along the nav grid (A\*, re-planned every 0.5 s) toward the nearest player who isn't down, at `speed`, or `unlitSpeed` when no lamp light reaches it. The server simulates it as a point, not a body: no collision, and water, crawls and squeezes don't slow it. Downed players are ignored.

### Striking

Its only damage is a telegraphed strike. **There is no touch, aura or other ongoing damage**: standing next to it between strikes costs nothing.

- Within `reach` (1.6 m along the floor, on its level) of the player it hunts, it stops and begins a swing. The snapshot's `strikes` counts swings begun, so clients play the wind-up (`melee_attack`, stretched to `body.strikeSeconds`) and `manifest.windup` (`sfx_gloaming_boss_attack.mp3`, which builds to its peak about as the blow lands) before the blow.
- At `strikeAt` (0.8 s) into the swing the blow lands on every able player still within reach (plus 0.4 m of slack). Stepping out of reach before then dodges it.
- After the swing it stands for `strikeRecover` seconds, then hunts again.
- **How hard:** `strikeDamage`, by party size: the explorers who went down (`Session.joined`, set on `AfflictionDirector.party`). The Gloaming's is `[40, 50, 60]`: 40 solo, 50 for two, 60 for three or more (the last entry covers any larger party). It doesn't drop as players die or leave.
- **Armor:** the session puts each blow through `absorbBlow`, like a creature's (see [items.md](items.md)): what is worn takes what it can (a `break` event if it tears), and the rest comes off sanity, once.

### Exposure and banishing (light and weapons)

- **Exposure:** each tick the lamp light on its core is summed from all players (`illumination`, occlusion included). Light at or above `exposeLight`, held steadily for 0.4 s (a flicker isn't enough), exposes it for `exposeLinger` seconds. The snapshot's `charge` (0..1) is how far that has built up, and is 1 while exposed. Lamps work right up to it; several lamps add up.
- **Damage:** exposed, weapon hits come off its `health`. Unexposed, they only slow it for `slowSeconds`. It's a combat target with id `manifestation` (`server/combat.ts` `targets()` and `hurt()`), so shots, swings and thrown items all work.
- **Banished:** at 0 health it fades away (`state: 'banished'`) and `AfflictionDirector.defeated` is set. That **resolves the Affliction**: the director calms itself (below), and in its next `stepAffliction` the session marks the rite `resolved`, raises a `resolved` event (`rite.resolve` and a banner) and calls `SessionHooks.onResolved`. Nobody is carried out: everyone still has to extract past the creatures, before the deadline.

### Stunned (the strobe)

The Gloaming is vulnerable to the strobe (`vulnerable: ['strobe']`): a headlamp turned on from off, at any level, by a player whose lamp lights its core (`lampIllumination` at least `STROBE.light`). It is `stunned` by its own reaction, `statuses.stunned`: 2 s stunned, then 20 s immune. What stunned does is the boss's own code: it stands where it is, and a swing not yet landed is lost. Weapons and exposure work as usual while it's stunned. The snapshot's `stunned` drives the client. See [status.md](status.md) for the status system.

### Calmed

`AfflictionDirector.calm()` runs when it is banished: the meter stops for good, the stage drops to 0 (the session sends an `omen` event, so ambience goes back to normal), gloom goes to 0, and creature boldness to 1. The creatures stay. `snapshot().calmed` is then true for the rest of the expedition, and nothing more is summoned.

## Client

The fight has music: the Affliction's `manifestation.music` (a sound id, the Gloaming's `music.gloaming.fight`) loops on the music bus while the snapshot has a manifestation that isn't banished, and fades out with the figure when it is. The `Affliction` play feature runs it (see [player.md](player.md#fading-loops)). Leave `music` out and the fight has none. Banishing it plays `rite.resolve`, the fight won.

`Manifestation` draws the figure at the snapshot position, flares (silently) when light exposes it, shrieks (`manifest.stun`, `sfx_gloaming_boss_stun.mp3`) when a strobe stuns it, and fades it away over 3 s when banished. The fight music carries its arrival, its presence and its end, so it has no sound of its own for those (no summoning signal, presence rumble, hiss when exposed or banishing howl). There is no darkness around it: no cloud, and no effect on lamps.

### The figure

If the manifestation has a `body` (`ManifestationBody` in `afflictions.ts`), that rigged model is what players see. It is drawn by the client only: the server simulates a point with a hit capsule. Without a `body` nothing is drawn.

`body` holds the model, `yawOffset`, `scale`, an animation map (see Animation maps in [creatures.md](creatures.md)), `strikeSeconds` and `flinchSeconds`. The client picks the slot:

| Situation                                                     | Slot                                         |
| ------------------------------------------------------------- | -------------------------------------------- |
| Banished                                                      | `die`                                        |
| Stunned                                                       | `take_damage`, then held still               |
| A swing just began (`strikes` rose)                           | `melee_attack`, stretched to `strikeSeconds` |
| A weapon just hit it (`hit()`)                                | `take_damage` for `flinchSeconds`            |
| Hunting, faster than halfway between `speed` and `unlitSpeed` | `running`                                    |
| Hunting, moving                                               | `walking`                                    |
| Gathering, or standing                                        | `idle`                                       |

- **Heading and speed** come from how it moves between frames; the snapshot has no yaw.
- **Strikes:** the snapshot's `strikes` counts swings begun, so the wind-up plays (with `manifest.windup`) before the blow lands at `strikeAt`.
- **Burning:** its materials glow (`emissive`, a warm white) with `charge` as lamp light builds on it, and flare and flicker while it is exposed, so players can see their lamps working.
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

1. Add an `AfflictionDef` to `AFFLICTIONS` (meter, stages, manifestation spec, rite). Give the manifestation `music` for its fight: add the recording to `scripts/audio.config.ts` (cropped and looped, like `music.gloaming.fight`), run `pnpm asset:audio`, and register it in `src/lib/content/audio/sounds.ts` on the music bus.
2. The meter, stages, gloom and omen sounds work from data.
3. Give the manifestation a `body`, the figure players see: export it to `art/export/creatures/`, run `pnpm asset:build`, and map its clips.
4. A manifestation that behaves differently (not a figure that hunts) needs its own behaviour in `AfflictionDirector` and its own client renderer, chosen by the Affliction id. An expedition is against the Affliction its party's host chose on the Expedition page (`PartyState.affliction`, passed to `Session`); every entry in `AFFLICTIONS` appears in the picker.

## Admin

These need `DEV_MODE`:

- a meter readout and omen stage;
- **Set meter %**;
- **Summon manifestation** (`manifest`): as the rite does, into the rite's room, from where you stand;
- **Stun it** (`stun`): immunity still applies;
- **Banish (resolves it)** (`banish`): as a weapon would, so the Affliction is resolved.
