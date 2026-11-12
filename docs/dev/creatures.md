# Creatures

Things that hunt the players. In code and docs they are **creatures**, and each kind is named after its model (the first is the `witch`). Player-facing text never names them; it talks about "something in the dark" or "it".

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
| `src/lib/game/creatures/Creatures.ts`   | Client: model, animation, half-light fade, sounds, admin markers    |
| `src/lib/game/assets.ts`                | `loadCharacter`: skinned clone and root-motion stripping            |

## Data

Each `CreatureDef` in `CREATURES` holds:

- `model`, `yawOffset` (the witch faces +Z in its file), `height`;
- `animations`: the model's animation map (see Animation maps);
- `gait`: the slot it is in while patrolling (`patrol`), waiting on alert (`alert`), creeping (`stalk`: investigating, and closing in) and bursting (`burst`);
- `movement`: a `MovementTuning` (creatures move with the player simulation);
- `creepSpeed`/`burstSpeed`, `creepTime`/`burstTime` (the chase rhythm);
- `patrol`: `radius` (m, along the grid, around its anchor) and `pause` [min, max] seconds at each spot;
- `alert`: `wait` [min, max] seconds, `maxWait`, and `linger` (seconds looking around where it investigates);
- `attack`: range, wind-up (when the hit lands), duration, damage, cooldown;
- `perception`: hearing radius per player movement (`hear`), `alertRange`, `agro.litRange`/`agro.darkRange`, `touch`, `evadeTime`;
- `visibleBand`: the half-light band;
- `breath.range`: how close its breathing is heard;
- `spawn`: how many per expedition and their minimum distance (along the grid) from the start;
- `health`, `stagger` (threshold and seconds), `hitRadius` and `corpseTime` (see Damage and death).

Attack clips are stretched on the client to `attack.duration`, so the strike lines up with `windup` on the server.

## Animation maps

Every rigged model names its clips differently, so each one (every `CreatureDef`, and the explorer in [player.md](player.md#player-model)) maps them onto one standard set of slots (`ANIM_SLOTS` in `src/lib/content/animations.ts`):

`idle`, `walking`, `running`, `jumping`, `melee_attack`, `weapon_attack`, `spell_attack`, `dodge`, `climb`, `crouch`, `crawl`, `take_damage`, `die`.

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

On the client an `Animator` (one per model copy) plays the slot's clip, crossfading from the last. If the model has none, `resolveAnim` takes the first mapped slot from `ANIM_FALLBACKS` (`crawl` → `crouch` → `walking`, any attack → another attack, and so on). If nothing fits, the state is skipped and whatever was playing carries on. `LOOPING_ANIMS` lists the slots that repeat (`idle`, `walking`, `running`, `climb`, `crouch`, `crawl`); the rest play once and hold their last frame.

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

`populate(start)` places `spawn.count` (witch: 1–2) at least `spawn.minDistance` (25 m) along the grid from the start and 20 m apart. It uses `creature-*` markers first (snapped to the nearest nav point within 2 m, facing a random way), then dead-end corners (a standing point with at most 4 neighbours, facing into it) if there aren't enough markers. `spawnFar` (omen stages) does the same, away from every player. A new creature stands for one `patrol.pause`, then patrols with its spawn point as the anchor.

### States

`CreatureState`, sent in each snapshot as `state`:

- **patrol**: walks (`gait.patrol`) to a random nav point within `patrol.radius` of its anchor along the grid (at least 4 m from where it stands, standing room, not water), pauses `patrol.pause` seconds, and picks another. The spots are worked out once per anchor with `gridDistances`.
- **alert**: something caught its attention (see Perception). It stops, turns to face the spot (4 rad/s) and waits in `gait.alert` for `alert.wait` seconds. More noise or light extends the wait to at least `wait[0]`, but never past `alert.maxWait` in total. Then it investigates.
- **investigate**: creeps (`gait.stalk`) to the spot, looks side to side for `alert.linger` seconds, and goes back to patrolling (same anchor). Fresh noise or light on the way moves the spot (re-planned within 0.5 s) and restarts the linger.
- **agro**: chasing one player. A\* to where it last perceived them, re-planned every 0.5 s. It alternates creeping (`creepTime` at `creepSpeed`) with bursts (`burstTime` at `burstSpeed`, sent as sprint), and goes straight at them when they're within 3 m in plain view. It drops to the waypoint's `clearance` for crawls and squeezes, and presses climb only when stuck against a ledge. Each tick it doesn't perceive them (below) adds to an evade timer. At `evadeTime`, or when they go down, die or leave, it patrols again, **anchored where it gave up**.
- **attack**: in range with line of sight and off cooldown. The hit lands at `windup` if the target is still within 1.3× range. Then back to agro.
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

- Health drops by the amount. At zero the creature dies: mode `dead`, animation `die`. It's removed after `corpseTime`, and the client fades it out over the last 1.5 s. Kills are counted in `kills` (for the Affliction meter).
- A hit of at least `stagger.threshold` staggers it for `stagger.seconds` (no moving or attacking, animation `take_damage`) and cancels an attack whose hit hasn't landed yet.
- Any hit sets it chasing the attacker (agro).

Hit tests use `hitBodies()`: a vertical capsule of `height` and `hitRadius` per living creature.

## Boldness and extra spawns

`CreatureDirector.boldness` (1 by default) is set by the Affliction's omen stage. Perception radii (lamp sight, hearing) scale by it, and the creep phase between bursts is divided by it. `spawnFar(players, minDistance)` adds a creature at a corner at least that far (along the grid) from every player; omen stages use it. See [affliction.md](affliction.md).

## Noise

`hear(position, radius, source)` is called for gunfire, melee impacts and thrown items landing. Every living creature within `radius` and 5 m up or down (gunfire carries to the floors above and below) reacts, unless it's mid-attack:

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
| Low lamp, up to ~5 m     | visible |
| Bright lamp, up to ~15 m | visible |
| The faint edge of a beam | hidden  |
| No light                 | hidden  |

It's deterministic from player state. Every client draws the creature with the same answer, and the server uses it for the "seeing" sanity drain (see [player.md](player.md#sanity)). The client fades the model in quickly and out more slowly. While hidden the model isn't drawn at all, so it casts no shadow.

## Client

`Creatures` keeps one entry per snapshot:

- it eases position and yaw toward the snapshot and crossfades to the animation slot in the snapshot, starting `animTime` seconds in so one-shot clips stay in step;
- the model is `loadCharacter(def.model)`: a SkeletonUtils clone with its own materials (for fading), sharing clips;
- `loadCharacter` pins the root bone's x/z to its first keyframe, so a clip's root motion (the crouch walk, the hit reaction, the death fall) doesn't move the model away from the server position.

Sounds always play, visible or not: `creature.step` while in a moving slot, `creature.burst` on entering `gait.burst`, and `creature.attack` on entering an attack slot.

**Breathing**: `Creatures.listen(delta, listener)` (called each frame with the camera position) runs one `creature.breath` loop (`art/sfx/sfx_witch_breathing.mp3`) at `(1 − d / breath.range)²` for the nearest living creature, eased. It's heard through walls, so a creature close by gives itself away even when it can't be seen.

## Adding a creature

1. Export the model (feet at the origin, animations included) to `art/export/creatures/<name>.glb` and run `pnpm asset:build`.
2. Add a `CreatureDef` to `CREATURES`. `pnpm asset:build` prints the clip names in the file; map each one you want to a slot in `animations` and leave the rest out.
3. Spawn it: `populate(start, '<name>')`, or a new spawn rule in the director. Put `creature-<n>` markers in pieces where it should start.

Behaviour beyond the shared states (a different perception, a ranged attack) goes in the director, keyed by def fields, not by kind name.

## Admin

These need `DEV_MODE`:

- **Spawn in front**: about 4 m ahead, facing you.
- **Remove all**.
- **Show creatures**: wireframe markers drawn through walls (client-only; positions are always sent), coloured by state: grey patrolling, amber alert or investigating, red chasing or attacking.
- **God mode** and **Set sanity** (player section).
