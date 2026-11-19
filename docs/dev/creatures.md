# Creatures

Things that share the catacombs with the players. In code and docs they are **creatures**, and each kind is named after its model. Player-facing text never names the ones that hunt (the `witch`); it talks about "something in the dark" or "it". The animals (rats, spiders, moths) and the surveyor can be named.

| Kind           | What it does                                                                                    | How it gets there                                                            |
| -------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `witch`        | Hunts (patrol, alert, investigate, chase, attack). Won't crawl, squeeze or swim.                | Drawn by the party's noise and light (Attraction), omens, dwellers that turn |
| `rat`          | Nests in small groups; noise and light draw it; a minor bite.                                   | Scattered at the start: 4-7 groups of 1-4                                    |
| `spider`       | Ignores everyone until hit (`passive`); its bite poisons.                                       | Scattered: 3-6 groups of 1-5                                                 |
| `giant-spider` | Hunts like a witch at shorter ranges; its bite poisons. Can't fit a crawl.                      | 40% of maps, one only, in a far corner                                       |
| `dweller`      | Sits in corners (`shy`); seen, walks off to a far corner; one in five turns into a witch.       | Scattered: 3-6, in corners                                                   |
| `moth`         | Flutters at headlamps (`flight`); harmless.                                                     | Comes to a high beam on for 5 s: 3-5                                         |
| `surveyor`     | Friendly and unhurtable (`friendly`, `invulnerable`); wanders corner to corner; shares his map. | Always one, 30 m or more from the start                                      |

## Files

| File                                    | What                                                                |
| --------------------------------------- | ------------------------------------------------------------------- |
| `src/lib/content/creatures.ts`          | Creature definitions (data): model, animations, speeds, perception  |
| `src/lib/content/animations.ts`         | Animation slots, fallbacks and the animation map type               |
| `src/lib/game/Animator.ts`              | Client: plays a model's clips by slot, through its map              |
| `src/lib/shared/map/nav.ts`             | Nav grid built from the collision world, A\* pathfinding            |
| `src/lib/shared/creature/visibility.ts` | Half-light: lamp illumination on a point, visibility band           |
| `src/lib/shared/creature/types.ts`      | `CreatureState`, `CreatureSnapshot` (sent in every `tick`)          |
| `server/creatures.ts`                   | `CreatureDirector`: spawning, AI states, perception, movement, hits |
| `src/lib/content/attraction.ts`         | Attraction (data): the noise and light meters, thresholds, cap      |
| `server/attraction.ts`                  | `Attraction`: the party's noise and light meters                    |
| `server/systems/surveyor.ts`            | The surveyor's route and sharing his map                            |
| `src/lib/shared/creature/talk.ts`       | `lookedAtFriendly`: the look-at test for talking to the surveyor    |
| `src/lib/game/play/surveyor.ts`         | Client: the surveyor's prompt and the share sound                   |
| `src/lib/ui/AttractionBars.svelte`      | Admin: noise, light and omen bars under the clock                   |
| `scripts/blender/critters.py`           | The rat's, spider's and moth's clips (see Clips for the critters)   |
| `src/lib/game/creatures/Creatures.ts`   | Client: model, animation, half-light fade, sounds, admin markers    |
| `src/lib/game/assets.ts`                | `loadCharacter`: skinned clone and root-motion stripping            |

## Data

Each `CreatureDef` in `CREATURES` holds:

- `model`, `yawOffset` (every model so far faces +Z in its file), `height` (its eyes, reach and visibility samples scale with it);
- `scale` and `lift` (client only): the model drawn bigger or smaller and raised (or lowered) so its feet meet the server position. The rat and spider share one model each across sizes (`spider` 0.1, `giant-spider` 0.4);
- `reach`: whether it goes into squeezes (`crouch`), `crawl`s and water (`swim`). Its paths, patrol spots and spawn spots leave the rest out (see Reach);
- `dread`: seeing it wears sanity down (only these are in `bodies()`); `killWeight`: how much a kill feeds the Affliction meter (1 for a witch or the giant spider, 0 for vermin);
- `sounds`: its own sound ids by what it's doing (`step`, `burst`, `attack`, `hurt`, `die`, `breath`); the rest are the shared `creature.*` ones (`creatureSound`);
- `animations`: the model's animation map (see Animation maps);
- `gait`: the slot it is in while patrolling (`patrol`), waiting on alert (`alert`), creeping (`stalk`: investigating, and closing in) and bursting (`burst`);
- `movement`: a `MovementTuning` (creatures move with the player simulation);
- `creepSpeed`/`burstSpeed`, `creepTime`/`burstTime` (the chase rhythm);
- `patrol`: `radius` (m, along the grid, around its anchor) and `pause` [min, max] seconds at each spot;
- `alert`: `wait` [min, max] seconds, `maxWait`, and `linger` (seconds looking around where it investigates);
- `attack`: range, wind-up (when the hit lands), duration, damage, cooldown, and an optional `condition` a landed hit gives (the spiders' `poisoned`; see [player.md](player.md#conditions));
- `perception`: hearing radius per player movement (`hear`), `alertRange`, `agro.litRange`/`agro.darkRange`, `touch`, `evadeTime`, and `passive` (it notices no one and ignores noises; only a hit sets it on someone, and then it tracks them as usual);
- `visibleBand`: the half-light band;
- `breath.range` (optional): how close its breathing is heard;
- `spawn`: how it gets into the catacombs (see Spawning);
- `shy`, `flight`, `friendly`, `wanders`, `invulnerable` (optional): the dweller's, the moth's and the surveyor's behaviour (see Kinds);
- `health`: damage that kills it, by party size (the first entry for one explorer, the next for two; the last covers any larger party). The witch's is `[240, 290, 340]`. `creatureHealth(def, party)` reads it. A creature counts the damage it has taken (`wounds`), and `CreatureDirector.party` (set by the session each tick from the explorers who went down) decides how much kills it, so one that spawned before the whole party arrived is still as tough as it should be.
- `stagger` (threshold and seconds), `hitRadius` and `corpseTime` (see Damage and death).
- `vulnerable` and `statuses` (optional): what can cause it a status (the strobe) and how it takes each, its own seconds and immunity. Stunned, it stands still and an unlanded attack is cancelled. See [status.md](status.md).

Attack clips are stretched on the client to `attack.duration`, so the strike lines up with `windup` on the server.

## Animation maps

Every rigged model names its clips differently, so each one (every `CreatureDef`, and the explorer in [player.md](player.md#player-model)) maps them onto one standard set of slots (`ANIM_SLOTS` in `src/lib/content/animations.ts`):

`idle`, `walking`, `running`, `jumping`, `melee_attack`, `weapon_attack`, `spell_attack`, `dodge`, `climb`, `rope_idle`, `rope_climb`, `fall`, `crouch`, `crawl`, `take_damage`, `die`.

`rope_idle`, `rope_climb` and `fall` are the explorer's (hanging on a rope, climbing it, falling; see [rope.md](rope.md#body-animation)); no creature uses them yet.

`animations` holds one entry per slot the model has a clip for: `{ clip, speed?, start?, end? }`. `clip` is the name in the file and `speed` the playback rate (default 1; 0 holds the first frame as a pose). `start` and `end` (seconds into the clip) use only part of it, to skip a lead-in or cut a tail off. Two slots can share a clip. Slots the model has nothing for are left out.

The server only ever sends a slot name (`CreatureSnapshot.anim`), picked in `CreatureDirector.animate`:

| Situation                         | Slot                         |
| --------------------------------- | ---------------------------- |
| Dead                              | `die`                        |
| Staggered                         | `take_damage`                |
| Attacking                         | `melee_attack`               |
| Climbing a ledge                  | `climb`                      |
| Alert                             | `gait.alert`                 |
| Stopped for 0.6 s                 | `idle`                       |
| Down low for a crawl or a squeeze | `crawl` or `crouch`          |
| Patrolling                        | `gait.patrol`                |
| Investigating                     | `gait.stalk`                 |
| Chasing                           | `gait.burst` or `gait.stalk` |

On the client an `Animator` (one per model copy) plays the slot's clip, crossfading from the last. If the model has none, `resolveAnim` takes the first mapped slot from `ANIM_FALLBACKS` (`crawl` → `crouch` → `walking`, any attack → another attack, and so on). If nothing fits, the state is skipped and whatever was playing carries on. `LOOPING_ANIMS` lists the slots that repeat (`idle`, `walking`, `running`, `climb`, `rope_idle`, `rope_climb`, `crouch`, `crawl`); the rest play once and hold their last frame.

The witch's map:

| Slot           | Clip                           | Notes                                                      |
| -------------- | ------------------------------ | ---------------------------------------------------------- |
| `idle`         | `Idle_9`                       | pauses, and waiting on alert (`gait.alert`)                |
| `walking`      | `Walking`                      | patrolling (`gait.patrol`)                                 |
| `running`      | `Running`                      | bursts                                                     |
| `crouch`       | `Cautious_Crouch_Walk_Forward` | investigating and closing in (`gait.stalk`), and squeezes  |
| `spell_attack` | `mage_soell_cast_3`            | its only attack clip, so it stands in for the melee strike |
| `take_damage`  | `Hit_Reaction`                 |                                                            |
| `die`          | `Strangled_and_Fall_Forward`   | starts 3.2 s in, where it buckles                          |

It has no jump, dodge, climb, crawl, melee or weapon clip. `Standard_Forward_Charge_inplace` is in the file but unused.

## Nav grid

`buildNav(world, layout, pieces, root)` runs once per map on the server (about 130 ms, about 2,500 points):

- Sample points on a **0.5 m lattice** over every occupied cell and level. The lattice includes cell centre lines, where the doorways are. Every floor surface in the level gets a point, top down (`floorHeightAt`).
- A point is kept if a body fits there. `clearance` is the tallest posture that fits (`stand` 1.7 m, `crouch` 1.15 m, `crawl` 0.65 m). The body is tested from ankle height (0.35 m), so low lips and ramp edges don't block it.
- Points in water are kept with `water: true`. A\* charges them 4×, so creatures wade or swim only when there's no dry way round: flooded halls on the main route, yes; the Cistern basin, only if the walkway is no shorter.
- Neighbours (8-way) link when the floor step is ≤ 0.5 m and a body fits at the midpoint. A midpoint on a seam between floor boxes falls back to a floor probe.
- Finally, only points reachable from `root` (the start spawn) are kept. That drops islands sampled on the roofs of lower pieces.

`findPath` is A\* with a binary heap. `nearestPoint` weights height ×3, so it doesn't snap to the floor above or below.

## AI (`CreatureDirector`)

One per session, built with the map's `creature-*` marker positions (`creatureSpawns(layout, PIECES)` in `src/lib/shared/map/points.ts`).

The idea: a creature can be hidden from. Turn your lamp off, keep still or move quietly, get out of its way, and it loses interest. Up close, or once it has you, that isn't enough.

### Spawning

Each def's `spawn` rule (`SpawnRule`) says how it gets into the catacombs. Nothing comes back once it's killed.

- **`attracted`** (the witch): none at the start. The party's noise and light draw them in (see Attraction). Omen stages also add one with `spawnFar` (at a `creature-*` marker or a corner far from every player), and a dweller can turn into one.
- **`scatter`**: `populate(start)` places them when the map is made: `groups` (a [min, max] count), each of `size`, at least `minDistance` along the grid from the start and 20 m from the kind's other groups. The first of a group stands at a spot (`where`: `anywhere` it can go, dry; or `corner`: dead ends and room corners, a standing point with at most 4 neighbours, facing into it); the rest stand within `spread` m of it and share its anchor. `chance` (default 1) that the kind appears at all. The rat, spider, giant spider, dweller and surveyor scatter.
- **`lamp`** (the moth): comes to lit headlamps (see Moths).

A new creature stands for one `patrol.pause`, then patrols with its spawn point as the anchor.

### Reach

`reach: { crouch, crawl, swim }` turns into a nav filter (`reachFilter` in `nav.ts`), which `findPath`, `gridDistances` and `nearestPoint` take as `allow`. A creature never paths onto a point its reach leaves out, and its spawn and patrol spots are only where it may go. The witch, the dweller and the surveyor are upright (`UPRIGHT`: none of the three); the giant spider squeezes but can't crawl or swim; rats, small spiders and moths go anywhere (`ANYWHERE`).

Chasing someone it can't reach (in a crawl, a squeeze, water), it paths to the nearest point it may stand within 6 m of them and waits at the edge while its evade timer runs. Getting down into a crawl is a real way to lose a witch. "Straight at them" (within 3 m in plain view) only happens where it may stand.

### Attraction

How witches arrive (`Attraction`, owned by the director; data in `src/lib/content/attraction.ts`). Two meters, **noise** and **light**, add up what the whole party does each tick (explorers not down, dead or out):

| Source                           | Light (per second, each) | Noise (per second, each)                                                      |
| -------------------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| Lamp bright (battery left)       | +1                       |                                                                               |
| Lamp low                         | 0 (holds)                |                                                                               |
| Lamp off, or a flat battery      | −2                       |                                                                               |
| Movement (`movementNoise`)       |                          | still or sneaking −2, crouch or crawl 0, walk or climb +1, swim +2, sprint +4 |
| Every `hear()` (gunshot, crate…) |                          | + its radius × `perNoise` (a gunshot about 35, a crate 6)                     |

A noise nobody made (a crate, a door) counts to whoever is nearest it. Omen `boldness` multiplies what fills a meter (not what drains it). Neither goes below 0.

**Thresholds:** light 60, noise 100, × `party[n]` for `n` explorers (`[1, 1.5, 1.9, 2.2]`). Alone, a minute of bright lamp, about two minutes of walking, 25 s of sprinting or three gunshots fills one; a bigger party fills them faster, against a higher bar.

**A full meter** holds there (nothing drains it) and is a draw for whoever added the most to it:

- under the cap (`cap[n]` witches alive, of any origin: `[1, 2, 3, 4]`), `summon` puts a witch 5–10 m from them along the witch's grid, out of their sight if any spot is, and sets it **investigating** their position: it creeps over, looks about, and perception does the rest;
- at the cap, the nearest witch that isn't chasing someone goes to look there instead.

Either way the meter starts again from nothing (`reset`), so a long fight can't fill the catacombs. With nowhere to put one, the meter stays full and tries again in `retry` (5) seconds.

`CreatureDirector.hear` feeds the noise meter, so every existing noise source counts without a call of its own.

### States

`CreatureState`, sent in each snapshot as `state`:

- **patrol**: walks (`gait.patrol`) to a random nav point within `patrol.radius` of its anchor along the grid (at least 4 m from where it stands, standing room, not water), pauses `patrol.pause` seconds, and picks another. The spots are worked out once per anchor with `gridDistances`.
- **alert**: something caught its attention (see Perception). It stops, turns to face the spot (4 rad/s) and waits in `gait.alert` for `alert.wait` seconds. More noise or light extends the wait to at least `wait[0]`, but never past `alert.maxWait` in total. Then it investigates.
- **investigate**: creeps (`gait.stalk`) to the spot, looks side to side for `alert.linger` seconds, and goes back to patrolling (same anchor). Fresh noise or light on the way moves the spot (re-planned within 0.5 s) and restarts the linger.
- **agro**: chasing one player. A\* to where it last perceived them, re-planned every 0.5 s. It alternates creeping (`creepTime` at `creepSpeed`) with bursts (`burstTime` at `burstSpeed`, sent as sprint), and goes straight at them when they're within 3 m in plain view. It drops to the waypoint's `clearance` for crawls and squeezes, and presses climb only when stuck against a ledge. Each tick it doesn't perceive them (below) adds to an evade timer. At `evadeTime`, or when they go down, die or leave, it patrols again, **anchored where it gave up**.
- **attack**: in range with line of sight and off cooldown. The hit lands at `windup` if the target is still within 1.3× range. Then back to agro.
- **flee**: one that keeps to itself (a dweller) leaving after being seen or hit; a moth flying off. See Kinds.
- **dead**: see Damage and death.

### Perception

Checked every tick for players who aren't downed, dead or extracted. "In front" is the half of the world it faces (180°). All distances scale with `boldness`.

| Sense                                                                          | Range                                                                   | Result |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------ |
| **Touch**, any direction                                                       | `touch` (2.5 m)                                                         | agro   |
| **Sight**: line of sight to their chest, in front                              | `agro.litRange` (10 m) with their lamp on, `agro.darkRange` (3.5 m) off | agro   |
| **Noise**: their movement, any direction, within 3 m up or down                | the `hear` radius for how they move, capped at `alertRange`             | alert  |
| **Light**: their lamp is on, in front, and in its line of sight or lighting it | `alertRange` (14 m)                                                     | alert  |

The closest player wins. A lamp behind it never alerts it, and someone in the dark who keeps still is noticed only within `darkRange`. Standing still where it saw your light isn't hiding: it investigates that spot.

While chasing, it keeps track of its target if it touches them, sees them (front not needed: it faces them) or sees their lamp, all within `alertRange`. Each of those resets the evade timer. Hearing them only updates where it heads: it follows the sound, but the timer keeps running. So getting away means breaking line of sight with your lamp off (beyond `agro.darkRange`) for `evadeTime` (6 s). Running is fine, as long as it can't see you. Someone else it sees closer takes over the chase.

Movement runs `stepPlayer` with the creature's tuning: 3 sim steps per server tick, the same collision, stairs, step-ups, water and squeezes as players. The body is a `PlayerState` with no lamp and infinite stamina.

## Damage and death

Players hurt creatures through `CreatureDirector.damage(id, amount, from)`, called by `server/combat.ts` (see [items.md](items.md)):

- Health drops by the amount. At zero the creature dies: mode `dead`, animation `die`. It's removed after `corpseTime`, and the client fades it out over the last 1.5 s. Kills add the def's `killWeight` to `kills` (for the Affliction meter). One that's `invulnerable` (the surveyor) takes no damage and has no hit capsule, so shots pass through it; admin Kill all leaves it.
- A hit of at least `stagger.threshold` staggers it for `stagger.seconds` (no moving or attacking, animation `take_damage`) and cancels an attack whose hit hasn't landed yet.
- Any hit sets it chasing the attacker (agro).

Hit tests use `hitBodies()`: a vertical capsule of `height` and `hitRadius` per living creature.

## Kinds

Behaviour beyond the shared states is keyed by def fields, never by kind name.

### Rats and spiders

Small (`small(speed, sprint)` movement: as quick through a crawl as in the open, a 0.2 m body) and go anywhere. The **rat** perceives like a witch at short range: a lamp in sight within 6 m, or anyone within 1.5 m in the dark, and noise alerts it. Its bite is 6. The **spider** is `passive`: noise and light don't reach it, and only a hit sets it (and only it) on the attacker. The **giant spider** hunts with full perception. Every spider bite carries `condition: { id: 'poisoned' }` (no faster than a crouch, no sprinting, 60 s), which `CreatureSystem` applies to whoever it lands on after the coat takes its share.

### Dwellers (`shy`)

A shy creature sits where it is (`patrol` mode, never walking) in its `crouch` slot. Each tick, `seenBy` checks every explorer: it's within `seenRange` (14 m), within 0.9 rad of where they look, in their line of sight, and either lit into its `visibleBand` or within 3 m. Seen:

- one that's **fated** (rolled at spawn, `turnChance` 0.2) **turns**: its def becomes `turnInto` (`witch`), with fresh wounds, and it chases whoever saw it. The snapshot's `kind` changes and the client swaps the model. A turned dweller counts toward the witch cap;
- otherwise it **flees** (mode `flee`) to a corner at least `fleeDistance` (25 m) along the grid from everyone, walking, then sits again facing into the corner.

A hit turns a fated one, and sends any other running (`flee` at a sprint).

### Moths (`flight`)

Fliers don't use the nav grid or the player simulation while alive. `lampFliers` watches each explorer's lamp. Once it has been on bright for `after` (5) seconds, up to `count` (3-5, rolled each time it goes bright) come, one every `arrive` seconds, placed `from` m out along their look (or nearer, or to the side or behind, wherever is open). On low no more come, and those there stay. Lamp off for `disperse` seconds, or its owner down, dead or out: all theirs leave. Leaving is mode `flee`, flying off for `leave` seconds before they're removed.

`fly` moves each toward a point `ahead` m out along its owner's look, wandering within `radius`, at up to `speed`, with a little jitter. A step that would cross anything solid isn't taken. Animation: `walking` (Fly) while fluttering, `running` (Dart) arriving or leaving. A hit kills one (health 1); dead, it falls with the player simulation like any corpse. Moths are `silent`: no sound at all, not even the shared creature ones. They aren't heard by, and don't add to, the attraction meters.

### The surveyor (`friendly`, `wanders`, `invulnerable`)

One that `wanders` patrols corner to corner: its patrol spots are only dead ends and room corners within `patrol.radius` (35 m), and each walk re-anchors where the last ended. It pauses `patrol.pause` (6–14 s) at each, in its idle slot (`CrouchLookAroundBow`). `friendly`: with an explorer within `notice` (4 m), it stops and turns to the nearest.

`SurveyorSystem` keeps its route: every survey cell (`cellAt`) it walks through. On first sight it also adds `legs` (5) walks planned from where it stands (`wanderRoute`), so it has "been" somewhere before anyone arrives. Holding interact on it (`lookedAtFriendly`: within `range` 2.5 m, in sight, no floor item or crate taking interact first) fills `PlayerState.consulting`; at `seconds` (1.5) its route is drawn into that player's map (`SurveySystem.reveal`, which sends the map if it grew) and a `surveyorMap` event goes out. Once per player per surveyor. The client (`play/surveyor.ts`) shows "to look at his map" until he has shared with you, plays `surveyor.share`, and banners what you got. A map needs a notebook to read; the cells are drawn either way.

## Boldness and extra spawns

`CreatureDirector.boldness` (1 by default) is set by the Affliction's omen stage. Perception radii (lamp sight, hearing) scale by it, the creep phase between bursts is divided by it, and the attraction meters fill faster by it. `spawnFar(players, minDistance)` adds a creature at a corner at least that far (along the grid) from every player; omen stages use it. See [affliction.md](affliction.md).

## Noise

`hear(position, radius, source)` is called for gunfire, melee impacts and thrown items landing (and crates, doors, chalk, ropes, falls and sketching). It adds to the party's noise meter (see Attraction). Every living creature within `radius` and 5 m up or down (gunfire carries to the floors above and below) reacts, unless it's mid-attack or `passive`:

- **With a source player within `agro.litRange`** (or the one it's already chasing): it chases them.
- **Otherwise** (a brick landing, gunfire further off): it's alerted to the spot, unless it's chasing someone. That's how lures work: it waits, then goes to look where the brick landed.

This is on top of perception (above), which only covers the player's own movement.

## Half-light

`lampIllumination(world, player, point)` is the light one lamp puts on a point, in lamp units (1 = the starter lamp's bright mode at point blank). It is computed from the shared `headlampOutput` (mode, battery, flicker):

- `intensity / bright intensity`;
- × the cone (full to 0.8× the cone angle, fading to nothing at 1.2×);
- × `(1 − distance / range)²`;
- 0 if anything blocks the line from the lamp.

`creatureLight` takes the brightest of three samples up the body, summed over all lamps. A creature is visible when that is inside `visibleBand`. A finite upper bound hides it in full light as well as in the dark (true half-light). `Infinity` means any light above the lower bound shows it.

The witch's band is 0.04–Infinity: a bright lamp shows her, so only the dark (or the faint edge of a beam) hides her:

| Light                    | Result  |
| ------------------------ | ------- |
| Low lamp, up to ~3.5 m   | visible |
| Bright lamp, up to ~14 m | visible |
| The faint edge of a beam | hidden  |
| No light                 | hidden  |

It's deterministic from player state. Every client draws the creature with the same answer, and the server uses it for the "seeing" sanity drain (see [player.md](player.md#sanity)). The client fades the model in quickly and out more slowly. While hidden the model isn't drawn at all, so it casts no shadow.

## Client

`Creatures` keeps one entry per snapshot:

- it eases position and yaw toward the snapshot and crossfades to the animation slot in the snapshot, starting `animTime` seconds in so one-shot clips stay in step;
- the model is `loadCharacter(def.model)`: a SkeletonUtils clone with its own materials (for fading), sharing clips;
- `loadCharacter` pins the root bone's x/z to its first keyframe, so a clip's root motion (the crouch walk, the hit reaction, the death fall) doesn't move the model away from the server position.

A snapshot whose `kind` changes (a dweller turning) gets the new kind's model. `scale` and `lift` are applied to the model.

Each sound is the def's own (`sounds`) or the shared one (`creatureSound`); `Creatures.soundOf(id, which)` gives the hurt and die sounds for combat events. A `silent` def (the moth) plays none. The rats', spiders', dwellers' and surveyor's are synthesized placeholders (`squeak`, `skitter`, `shuffle`, `whisper`, `hiss`, `rustle`) until there are recordings.

The witch's sounds always play, visible or not: `creature.step` while in a moving slot (`sfx_creature_footsteps`, sliced into single steps), `creature.burst` on entering `gait.burst` (the `jump-scare` recording; at most once every `BURST_SOUND_GAP` (8) seconds per creature, since a stalking creature bursts every few seconds and the clip is 5 s long), and `creature.attack` on entering an attack slot (`sfx_witch_attack`). `creature.breath` is the `sfx_witch_breathing` loop; `creature.die` is `sfx_witch_death`; `creature.hurt` is still synthesized.

**Breathing**: `Creatures.listen(delta, listener)` (called each frame with the camera position) runs one `creature.breath` loop (`art/sfx/sfx_witch_breathing.mp3`) at `(1 − d / breath.range)²` for the nearest living creature that breathes (has `breath`), eased. It's heard through walls, so a creature close by gives itself away even when it can't be seen.

## Clips for the critters

The rat, spider and moth came rigged with no animation. `scripts/blender/critters.py` keys simple procedural clips for each (in `art/blender/<name>.blend`, as NLA tracks) and exports them on the bare skeleton to `art/export/creatures/<name>-clips.glb`, which `pnpm asset:build` merges into the model by bone name (`mergeClips`, see [asset-pipeline.md](asset-pipeline.md#the-explorer)):

| Model  | Clips                                                                                        |
| ------ | -------------------------------------------------------------------------------------------- |
| rat    | `Idle` (breathing, sniffing), `Walk` (trot), `Run` (bound), `Bite`, `Hurt`, `Die`            |
| spider | `Idle`, `Walk`, `Run` (alternating leg sets), `Strike` (rears up), `Hurt`, `Die` (legs curl) |
| moth   | `Hover`, `Fly`, `Dart` (wingbeats at 3, 4 and 6 a second), `Hurt`, `Die`                     |

Each rig in the script lists its bones by job (spine, legs front to back, wings) and each clip is a function of time that turns those bones about axes in the model's rest space (`swing` forward and back, `lift` up and down, `pitch`, `roll`, `yaw`), keyed on every frame over whole cycles so loops meet. Run it in Blender with the `.blend` open (the docstring has the lines), check the clips by eye, then `pnpm asset:build`. To change a clip, edit its function and run `build_all()` and `export()` again.

## Adding a creature

1. Export the model (feet at the origin, animations included) to `art/export/creatures/<name>.glb` and run `pnpm asset:build`. Without clips, key some in `critters.py` (a new `RIGS` entry) or borrow them (`CLIP_DONORS`).
2. Add a `CreatureDef` to `CREATURES`. `pnpm asset:build` prints the clip names in the file; map each one you want to a slot in `animations` and leave the rest out. Size it with `scale`/`lift` if the model isn't to scale.
3. Give it a spawn rule (`scatter`, `attracted`, `lamp`), a `reach`, and its own `sounds` (synth placeholders in `content/audio/sounds.ts` until there are recordings).
4. Add a help topic for players.

Behaviour beyond the shared states (a different perception, a ranged attack) goes in the director, keyed by def fields, not by kind name.

## Admin

These need `DEV_MODE`:

- **Kind** and **Spawn in front**: one of that kind about 4 m ahead, facing you (a moth goes to your lamp). **Spawn a dweller that turns**: one fated to become a witch.
- **Kill all** (not the surveyor) and **Remove all**.
- **Show creatures**: wireframe markers drawn through walls (client-only; positions are always sent), coloured by state: grey patrolling, amber alert or investigating, red chasing or attacking, blue fleeing.
- **Show attraction**: bars for the noise and light meters and the Affliction's (omen) meter under the clock, then how many witches are alive and why the last one came (`noise`, `light`, at the cap, `omen`, `a dweller turned`, `admin`; `CreatureDirector.lastWitch`). A meter that brings one shows full for 1.5 s (`Attraction.answered`) though it has started again, so a gunshot that fills it at once still reads. The tick carries `attraction` only in dev mode.
- **Fill noise**, **Fill light** (a witch comes, or one goes to look at the cap) and **Empty both**.
- **God mode** and **Set sanity** (player section).
