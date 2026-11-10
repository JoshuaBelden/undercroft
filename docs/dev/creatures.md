# Creatures

Things that hunt the players. In code and docs they are **creatures**, and each kind is named after its model (the first is the `witch`). Player-facing text never names them; it talks about "something in the dark" or "it".

## Files

| File                                    | What                                                                |
| --------------------------------------- | ------------------------------------------------------------------- |
| `src/lib/content/creatures.ts`          | Creature definitions (data): model, animations, speeds, perception  |
| `src/lib/shared/map/nav.ts`             | Nav grid built from the collision world, A\* pathfinding            |
| `src/lib/shared/creature/visibility.ts` | Half-light: lamp illumination on a point, visibility band           |
| `src/lib/shared/creature/types.ts`      | `CreatureSnapshot` (sent in every `tick`)                           |
| `server/creatures.ts`                   | `CreatureDirector`: spawning, AI states, perception, movement, hits |
| `src/lib/game/creatures/Creatures.ts`   | Client: model, animation, half-light fade, sounds, admin markers    |
| `src/lib/game/assets.ts`                | `loadCreature`: skinned clone and root-motion stripping             |

## Data

Each `CreatureDef` in `CREATURES` holds:

- `model`, `yawOffset` (the witch faces +Z in its file), `height`;
- `animations`: clip name, speed and loop per state (`idle`, `stalk`, `burst`, `search`, `attack`);
- `movement`: a `MovementTuning` (creatures move with the player simulation);
- `creepSpeed`/`burstSpeed`, `creepTime`/`burstTime` (the rhythm), `searchTime`;
- `attack`: range, wind-up (when the hit lands), duration, damage, cooldown;
- `perception`: hearing radius per player movement, `lampSight`, `touch`, `forget`;
- `visibleBand`: the half-light band;
- `spawn`: how many per expedition and their minimum distance (along the grid) from the start.

The witch's attack clip is stretched on the client to `attack.duration`, so the strike lines up with `windup` on the server.

## Nav grid

`buildNav(world, layout, pieces, root)` runs once per map on the server (about 130 ms, about 2,500 points):

- Sample points on a **0.5 m lattice** over every occupied cell and level. The lattice includes cell centre lines, where the doorways are. Every floor surface in the level gets a point, top down (`floorHeightAt`).
- A point is kept if a body fits there. `clearance` is the tallest posture that fits (`stand` 1.7 m, `crouch` 1.15 m, `crawl` 0.65 m). The body is tested from ankle height (0.35 m), so low lips and ramp edges don't block it.
- Points in water are kept with `water: true`. A\* charges them 4×, so creatures wade or swim only when there's no dry way round: flooded halls on the main route, yes; the Cistern basin, only if the walkway is no shorter.
- Neighbours (8-way) link when the floor step is ≤ 0.5 m and a body fits at the midpoint. A midpoint on a seam between floor boxes falls back to a floor probe.
- Finally, only points reachable from `root` (the start spawn) are kept. That drops islands sampled on the roofs of lower pieces.

`findPath` is A\* with a binary heap. `nearestPoint` weights height ×3, so it doesn't snap to the floor above or below.

## AI (`CreatureDirector`)

One per session. `populate(start)` places 1–2 witches in corners at least 25 m away along the grid. A corner is a standing point with at most 4 neighbours, and the witch faces into it.

States:

- **idle**: still, facing the wall, until it perceives someone.
- **hunt**: A\* to the target's last known position, re-planned every 0.5 s. It alternates creeping (`creepTime` at `creepSpeed`) with bursts (`burstTime` at `burstSpeed`, sent as sprint), and goes straight at the target when it's within 3 m in plain view. It drops to the waypoint's `clearance` for crawls and squeezes, and presses climb only when stuck against a ledge.
- **attack**: in range with line of sight and off cooldown. The hit lands at `windup` if the target is still within 1.3× range.
- **search**: after `forget` seconds without perceiving anyone (or when its target goes down). It walks to the last known spot, then wanders nearby points until `searchTime` runs out, then goes idle where it stands.

Perception, checked every tick for players who aren't downed, dead or extracted:

- **touch**: within `touch` metres;
- **noise**: within the radius for how they move (sprint, walk, crouch, crawl, creep, swim, climbing), on roughly the same floor;
- **light**: their lamp is on, within `lampSight`, and either lights the creature or is in its line of sight.

It keeps the closest player it perceives.

Movement runs `stepPlayer` with the creature's tuning: 3 sim steps per server tick, the same collision, stairs, step-ups, water and squeezes as players. The body is a `PlayerState` with no lamp and infinite stamina.

## Half-light

`lampIllumination(world, player, point)` is the light one lamp puts on a point, in lamp units (1 = the starter lamp's bright mode at point blank). It is computed from the shared `headlampOutput` (mode, battery, flicker):

- `intensity / bright intensity`;
- × the cone (full to 0.8× the cone angle, fading to nothing at 1.2×);
- × `(1 − distance / range)²`;
- 0 if anything blocks the line from the lamp.

`creatureLight` takes the brightest of three samples up the body, summed over all lamps. A creature is visible when that is inside `visibleBand` (witch: 0.04–0.45):

| Light                    | Result             |
| ------------------------ | ------------------ |
| Low lamp, up to ~5 m     | visible            |
| Bright lamp, under ~7 m  | too bright, hidden |
| Bright lamp, ~7–15 m     | visible            |
| Bright lamp in a flicker | sometimes visible  |
| No light                 | hidden             |

It's deterministic from player state. Every client draws the creature with the same answer, and the server uses it for the "seeing" sanity drain (see [player.md](player.md#sanity)). The client fades the model in quickly and out more slowly. While hidden the model isn't drawn at all, so it casts no shadow.

## Client

`Creatures` keeps one entry per snapshot:

- it eases position and yaw toward the snapshot and crossfades the animation state (idle holds the last frame of `Arise`);
- the model is `loadCreature(def.model)`: a SkeletonUtils clone with its own materials (for fading), sharing clips;
- `loadCreature` pins the root bone's x/z to its first keyframe, so `run_fast_9`'s root motion doesn't move the model away from the server position.

Sounds always play, visible or not: `creature.step` per animation state, `creature.burst` and `creature.attack` on state changes.

## Adding a creature

1. Export the model (feet at the origin, animations included) to `art/export/creatures/<name>.glb` and run `pnpm asset:build`.
2. Add a `CreatureDef` to `CREATURES` with clip names from the file.
3. Spawn it: `populate(start, '<name>')`, or a new spawn rule in the director.

Behaviour beyond the shared states (a different perception, a ranged attack) goes in the director, keyed by def fields, not by kind name.

## Admin

These need `DEV_MODE`:

- **Spawn in front**: about 4 m ahead, facing you.
- **Remove all**.
- **Show creatures**: wireframe markers drawn through walls (client-only; positions are always sent).
- **God mode** and **Set sanity** (player section).
