# The Affliction: meter, omens, manifestation, banishing

An Affliction is the force behind an expedition. The rite that resolves it is in [rite.md](rite.md). In code it is the hidden **meter**, the **omen stages** players read it by, and the **manifestation** the rite summons. Banishing the manifestation resolves the Affliction. The first Affliction is the Gloaming: its manifestation is a figure that hunts the players.

## Files

| File                                       | What                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `src/lib/content/afflictions.ts`           | Affliction definitions (data): meter rates, omen stages, manifestation       |
| `src/lib/shared/affliction/types.ts`       | `AfflictionSnapshot` (in every `tick`)                                       |
| `src/lib/shared/player/headlamp.ts`        | Gloom: lamp failure in the shared lamp output                                |
| `server/affliction.ts`                     | `AfflictionDirector`: meter, stages, the manifestation's AI, its ray, banish |
| `src/lib/content/statuses.ts`              | Statuses and the strobe (see [status.md](status.md))                         |
| `src/lib/game/affliction/Manifestation.ts` | Client: the figure, its attack and stun sounds, fading away                  |
| `src/lib/game/audio/Ambience.ts`           | Omen sound layers (`setOmen`)                                                |

## The meter

`meter` runs from 0 to 1 and is never shown to players. Each server tick:

- time adds `1 / meter.seconds` per second (1800 s for the Gloaming), while anyone is underground;
- each creature killed adds `meter.perKill` (0.04);
- loot carried adds `meter.perLoot` per second for each unit of value the players carry between them (see [economy.md](economy.md#loot)).

It stops at 1, at the last omen stage. **Nothing manifests when it fills:** only the rite summons the manifestation. Each tick's snapshot carries `omen`, `meter` (rounded; only the admin panel shows it, players never see it) and `calmed`.

## Omen stages

`stages` are ascending thresholds (Gloaming: 25%, 50%, 75%, 90%). Entering a stage:

- sets the **gloom** baseline for every lamp;
- sets creature **boldness** (`CreatureDirector.boldness`): perception and hearing radii scale by it, creep time between bursts shrinks, and the party's noise and light meters fill faster (so witches are drawn in sooner; see [creatures.md](creatures.md#attraction));
- **spawns** `spawn` extra witches far from players (`spawnFar`, the manifestation's spawn distance), on top of those the party draws in;
- sends an `omen` event, and the snapshot's `omen` changes. Clients apply the stage's `ambience`: distant knocks and swells come `knocks`/`swells` times as often, `whispers` per minute play close by, and a low drone loop fades in to `drone`.

## Gloom (lamp failure)

`PlayerState.gloom` (0..1) is set by the server every tick to the current omen stage's `gloom` (0 before the first stage; 0.45 at the last, for the Gloaming). Nothing else adds to it, so the map is never darker than the last omen stage makes it. (The manifestation's ray puts one lamp out for a while, but by a condition, not gloom: see The ray.)

`headlampOutput` applies it:

- more flickers (`+ gloom × 4` per second);
- lower output (`× (1 − 0.6 × gloom)`);
- above 0.7, whole moments where the lamp gives no light (seeded by the lamp clock).

Because it's in the shared lamp code, it is deterministic: prediction, half-light visibility (failing lamps reveal creatures more often) and the server all agree. The HUD darkens the screen edges with gloom.

## The manifestation

It appears only when the rite is performed (`RiteSystem.step` calls `AfflictionSystem.summon`, which calls `AfflictionDirector.summon`). Nobody sees it before that.

1. **Summoned:** on the nav point in the rite's room (`RiteDirector.inRoom`) farthest from where the rite was performed: the room's far corner. If the room has no nav point, it appears 30 to 60 m along the grid from every player instead (`manifestFar`, `spawnDistance`). It is summoned once per expedition. A `manifest` event goes to everyone; the fight music starting is how players hear it (see Client).
2. **Gathering** (`gatherSeconds`, 2 s): it stands where it appeared.
3. **Hunting** (below): it closes in on the nearest player who isn't down, swings at whoever it reaches, runs them down now and then, fires its ray from a distance, and now and then vanishes. The server simulates it as a point, not a body: no collision, and water, crawls and squeezes don't slow it. Downed players are ignored.

All its tuning is data in `ManifestationSpec`: `movement`, `rush`, `ray` and `vanish` hold the numbers below.

### Hunting

It goes along the nav grid (A\*, re-planned every 0.5 s) at `speed` (2 m/s), or `unlitSpeed` (2.8 m/s) when no lamp light reaches it, or flat out while it runs someone down (below). Where it heads depends on its **tactic** (`Manifested.tactic`, chosen in `AfflictionDirector.goal`):

- **Close** (the default): it aims where its prey is going, not where they are: their position plus their velocity times up to `movement.lead` seconds (no further ahead than it takes to get there), snapped to the nav grid. Within 2.5 m it goes straight for them.
- **Flank**: when the way left along its path to them is more than `movement.detour` times the straight distance (a table or a pillar between), or by chance (`flankChance` per second) while they are within `flankRange`, it circles round them one way (`side`) for `flankSeconds`. Its aim is a point 1.5 m from them, 100° on round from where it is, so the aim keeps moving ahead of it. Committing to one way round is what stops a player keeping it on the far side of a table: reversing just runs into it.
- **Retreat**: after a swing, with `retreatChance`, it backs off `retreatDistance` m, away and to one side, for `retreatSeconds`. It doesn't swing while backing off, but it can cast.

### Striking

A telegraphed melee strike. **There is no touch, aura or other ongoing damage**: standing next to it between strikes costs nothing.

- Within `reach` (1.6 m along the floor, on its level) of the player it hunts, it stops and begins a swing. The snapshot's `strikes` counts swings begun, so clients play the wind-up (`melee_attack`, stretched to `body.strikeSeconds`) and `manifest.windup` (`sfx_gloaming_boss_attack.mp3`, which builds to its peak about as the blow lands) before the blow.
- At `strikeAt` (0.8 s) into the swing the blow lands on every able player still within reach (plus 0.4 m of slack). Stepping out of reach before then dodges it.
- After the swing it stands for `strikeRecover` seconds, then hunts again (or backs off, above).
- **How hard:** `strikeDamage`, by party size: the explorers who went down (`Session.joined`, set on `AfflictionDirector.party`). The Gloaming's is `[40, 50, 60]`: 40 solo, 50 for two, 60 for three or more (the last entry covers any larger party, `byParty`). It doesn't drop as players die or leave.
- **Armor:** the session puts each blow through `absorbBlow`, like a creature's (see [items.md](items.md)): what is worn takes what it can (a `break` event if it tears), and the rest comes off sanity, once.

### Running its prey down

Like a creature's burst, now and then it charges. While it hunts, once `rush.every` (4 to 8 s, random) has passed, with its prey within `rush.range` (3 to 16 m along the floor) and a clear line to them, it charges for `rush.seconds` (1 to 1.8 s) at `rush.speed` (5.5 m/s, as fast as a sprinting explorer), closing in straight (`close`). Reaching them ends it in a swing; a strobe ends it too. It won't charge while backing off. The snapshot's `rushing` drives the client: the `running` slot (the witch's charge, see The figure) and `manifest.rush`.

### The ray (it puts your light out)

Keeping your distance isn't safe either.

- **When:** hunting and not charging, with its prey between `ray.range` (4 to 20 m along the floor), a clear line from its core to their chest (`segmentBlocked`), and its cooldown run out, it begins to gather it. The snapshot's `casts` counts rays begun, `charge` (0..1) how far it has gathered the current one, and `aim` where it aims it.
- **The charge (the telegraph):** it stands for `ray.chargeSeconds` (1.3 s), its aim (`Manifested.aim`) following its prey's chest until `ray.aimLock` (0.3 s) before it fires. A strobe in that time stuns it and the ray is lost.
- **The strike:** at the end of the charge the ray strikes at once (no flight) from its core along the line to its aim, as far as stone (`segmentHit`) or 1.5 times its longest range, and hits the nearest player along it whose body (sampled from feet to eyes) is within `ray.width` (0.45 m) of the line. So getting out of the line in the last moment, or putting stone between you, dodges it. Each ray raises a `ray` event (`from`, `to` where it struck, and `player`, or null).
- **A hit:** `ray.damage` by party size, through what is worn like a blow, and the `snuffed` condition on the player for `ray.snuffSeconds` (12 s).
- **Snuffed:** a condition with `dark: true` ([player.md](player.md#falls-and-conditions)): while it lasts, `stepPlayer` keeps `headlamp` at 0 whatever the input says (`lampBlocked`), so prediction and the server agree, and the HUD shows it beside health. The client also switches its own lamp setting off, so the lamp doesn't come back by itself when it wears off: the player has to turn it on again (and doing that with it in the beam is a strobe).
- **Cooldown:** a random time in `ray.cooldown` (7 to 12 s) after each; half that before the first.

### Vanishing

- After a random `vanish.every` (25 to 40 s) of hunting (counted only while it is free to act: not mid-swing, casting or stunned), it vanishes: `state: 'vanished'`. It has no hit capsule, can't be hurt or stunned, and doesn't move.
- After a random `vanish.seconds` (3 to 6 s) it comes back (`comeBack`), for the player farthest from the rest (whoever is alone; the only one, solo). It tries spots `vanish.distance` (5 to 9 m) from them, behind them first (180°, then 150°/210°, then 120°/240°), and takes the first on their level, out of every lamp's light, and with a path to them no longer than three times the distance. With none it comes back where it went.
- It stands for `vanish.returnSeconds` (`state: 'gathering'`), then hunts.

### Banishing (weapons)

- **Damage:** every weapon hit comes off its health: `health` by party size (`[500, 650, 800]`), set when it appears. There is no light condition: lamps on it only slow it (`speed`). It's a combat target with id `manifestation` (`server/combat.ts` `targets()` and `hurt()`), so shots, swings and thrown items all work.
- **Banished:** at 0 health it fades away (`state: 'banished'`), and `AfflictionDirector.defeated` is set. That **resolves the Affliction**: the director calms itself (below), and in its next `stepAffliction` the session marks the rite `resolved`, raises a `resolved` event (`rite.resolve` and a banner) and calls `SessionHooks.onResolved`. Nobody is carried out: everyone still has to extract past the creatures, before the deadline.

### Stunned (the strobe)

The Gloaming is vulnerable to the strobe (`vulnerable: ['strobe']`): a headlamp turned on from off, at any level, by a player whose lamp lights its core (`lampIllumination` at least `STROBE.light`). It is `stunned` by its own reaction, `statuses.stunned`: 2 s stunned, then 20 s immune. What stunned does is the boss's own code: it stands where it is, and a swing or cast not yet loosed is lost. Weapons work as usual while it's stunned. It can't be stunned while vanished. The snapshot's `stunned` drives the client. See [status.md](status.md) for the status system.

### Calmed

`AfflictionDirector.calm()` runs when it is banished: the meter stops for good, the stage drops to 0 (the session sends an `omen` event, so ambience goes back to normal), gloom goes to 0, and creature boldness to 1. The creatures stay. `snapshot().calmed` is then true for the rest of the expedition, and nothing more is summoned.

## Client

The fight has music: the Affliction's `manifestation.music` (a sound id, the Gloaming's `music.gloaming.fight`) loops on the music bus while the snapshot has a manifestation that isn't banished, and fades out with the figure when it is. The `Affliction` play feature runs it (see [player.md](player.md#fading-loops)). Leave `music` out and the fight has none. Banishing it plays `rite.resolve`, the fight won.

`Manifestation` draws the figure at the snapshot position, shrieks (`manifest.stun`, `sfx_gloaming_boss_stun.mp3`) when a strobe stuns it, and fades it away over 3 s when banished. The fight music carries its arrival, its presence and its end, so it has no sound of its own for those (no summoning signal, presence rumble or banishing howl). There is no darkness around it and no glow on it.

Its other sounds, all through the sound bank:

| Sound              | When                                                         | Source (for now)                             |
| ------------------ | ------------------------------------------------------------ | -------------------------------------------- |
| `manifest.cast`    | `casts` rose: the ray gathering                              | the attack recording, slowed (`rate` 0.7)    |
| `manifest.ray`     | a `ray` event, at `from`: it strikes                         | synth `whoosh`, low                          |
| `manifest.ray.hit` | a `ray` event, at `to`: where it struck                      | synth `crack`, low                           |
| `lamp.snuffed`     | a `ray` event on you: your lamp gutters out                  | the headlamp-off click, slowed (`rate` 0.55) |
| `manifest.rush`    | `rushing` became true: it charges                            | the witch's burst, deeper (`rate` 0.75)      |
| `manifest.vanish`  | `state` became `vanished`                                    | synth `whisper`, low                         |
| `manifest.return`  | `state` left `vanished`: it is back (the figure jumps there) | the stun recording, slowed (`rate` 0.75)     |

The ray is drawn by `RayEffects` (`src/lib/game/affliction/RayEffects.ts`), with no lights, so none of it counts toward the light budget. **The charge:** while `charge` is above 0, blue smoke (additive `Points` with a soft canvas-drawn puff) swirls in to its hands round a dark core that swells with the charge, and the figure turns to face `aim`. Its hands are its two hand bones (`mixamorigLeftHand`, `mixamorigRightHand`), or a guess in front of its chest without them. **The ray:** on a `ray` event, a dark beam (a thin near-black cylinder in a wider additive blue sheath) from its hands to `to`, with thin white streaks (1px `LineSegments`, laid out afresh every frame so they crackle) along it, so it shows even end-on to whoever it hits, gone in 0.5 s, and blue smoke along it that drifts off and fades over 1.1 s. Vanishing fades the figure out over 0.6 s, and back in where it returns.

### The figure

If the manifestation has a `body` (`ManifestationBody` in `afflictions.ts`), that rigged model is what players see. It is drawn by the client only: the server simulates a point with a hit capsule. Without a `body` nothing is drawn.

`body` holds the model, `yawOffset`, `scale`, an animation map (see Animation maps in [creatures.md](creatures.md)), `strikeSeconds` and `flinchSeconds`. The client picks the slot:

| Situation                           | Slot                                             |
| ----------------------------------- | ------------------------------------------------ |
| Banished                            | `die`                                            |
| Stunned                             | `take_damage`, then held still                   |
| A swing just began (`strikes` rose) | `melee_attack`, stretched to `strikeSeconds`     |
| A ray began (`casts` rose)          | `spell_attack`, stretched to `ray.chargeSeconds` |
| A weapon just hit it (`hit()`)      | `take_damage` for `flinchSeconds`                |
| Hunting, charging (`rushing`)       | `running`                                        |
| Hunting, moving                     | `walking`                                        |
| Gathering, or standing              | `idle`                                           |

- **Heading and speed** come from how it moves between frames; the snapshot has no yaw.
- **Strikes:** the snapshot's `strikes` counts swings begun, so the wind-up plays (with `manifest.windup`) before the blow lands at `strikeAt`.
- **Fading:** the figure fades in over 3 s when it manifests and fades out when banished; it fades out over 0.6 s when it vanishes, and in again where it comes back.

The Gloaming's body is `gloaming_boss.glb`, scaled 1.3 (about 2.2 m, its hit capsule's height):

| Slot           | Clip                                                              |
| -------------- | ----------------------------------------------------------------- |
| `idle`         | `Borrowed_Idle` (the witch's `Idle_9`)                            |
| `walking`      | `Borrowed_Walking` (the witch's `Walking`)                        |
| `running`      | `Borrowed_Charge` (the witch's `Standard_Forward_Charge_inplace`) |
| `spell_attack` | `Borrowed_Cast` (the witch's `mage_soell_cast_3`, to 1.4 s)       |
| `melee_attack` | `Charged_Upward_Slash`                                            |
| `take_damage`  | `Face_Punch_Reaction`                                             |
| `die`          | `Shot_and_Fall_Forward`                                           |

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
- **Make it swing** (`bossStrike`): a swing now, in reach or not;
- **Make it fire its ray** (`bossRay`): at the nearest player, whatever the range, line or cooldown;
- **Make it charge** (`bossRush`): at the nearest player, whatever the range or wait;
- **Make it vanish** (`bossVanish`): it comes back as it would;
- **Banish (resolves it)** (`banish`): as a weapon would, so the Affliction is resolved.
