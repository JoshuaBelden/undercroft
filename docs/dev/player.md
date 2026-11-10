# Player: movement, collision, networking, headlamp

The first-person player. The server is authoritative. The client predicts its own movement with the same code and reconciles with the server.

## Files

| What                                 | Where                                  |
| ------------------------------------ | -------------------------------------- |
| State and input types                | `src/lib/shared/player/types.ts`       |
| Simulation (pure, shared)            | `src/lib/shared/player/simulate.ts`    |
| Headlamp output and flicker (shared) | `src/lib/shared/player/headlamp.ts`    |
| Collision world                      | `src/lib/shared/map/collision.ts`      |
| Spawn and teleport points            | `src/lib/shared/map/points.ts`         |
| Movement tuning (data)               | `src/lib/content/player/movement.ts`   |
| Headlamp models (data)               | `src/lib/content/items/headlamps.ts`   |
| Server side                          | `server/session.ts`                    |
| Client prediction and camera         | `src/lib/game/player/LocalPlayer.ts`   |
| Headlamp light                       | `src/lib/game/player/Headlamp.ts`      |
| Other players (placeholder)          | `src/lib/game/player/RemotePlayers.ts` |
| Footsteps, breathing, click          | `src/lib/game/player/PlayerAudio.ts`   |
| HUD                                  | `src/lib/ui/Hud.svelte`                |

## Simulation

`stepPlayer(state, input, world, dt)` advances one fixed step of `1 / SIM_RATE` (60 Hz). It must stay deterministic: the server and the client run it on the same inputs and must agree. Don't read clocks, randomness or anything client-only inside it.

Each step:

1. Applies look.
2. Advances a mantle in progress, if any, and stops there (see Mantling).
3. Checks the water at the feet: swimming, wading or dry (see Water).
4. Changes stance if the taller capsule fits (not while swimming).
5. Moves:
   - walking: accelerates toward the wanted velocity for the stance, capped by sneak or sprint and slowed when wading; applies gravity, or a small "stick" velocity while grounded so the player stays on slopes and stairs;
   - swimming: swims (see Water);
   - noclip: flies.
6. Resolves collisions.
7. On land, tries a mantle while `climb` is held.
8. Updates stamina (or breath) and battery.

All tuning is data in `MOVEMENT` and `HEADLAMPS`: speeds, capsule heights, eye heights, stride, swim and mantle settings, stamina rates, light intensities, drain and flicker.

- **Stances:** stand (1.75 m), crouch (1.2 m), crawl (0.7 m). The client cycles the wanted stance with one key. Standing up is blocked while the taller capsule wouldn't fit (`capsuleFits`). The wanted stance persists, so you rise (as far as fits) once there's room.
- **Sneak ("creep" in game):** caps speed at `sneakSpeed` and wins over sprint. It sets `state.sneaking`, which silences footsteps now and will reduce noise for Thralls in Phase 2.
- **Stance key (client):** a tap cycles the wanted stance; holding it for 350 ms toggles creep instead (`LocalPlayer.updateStanceKey`). Holding sprint resets the wanted stance to standing and turns creep off.
- **Stamina:** sprinting drains it, and it regenerates after a short delay. At zero the player is `exhausted` and can't sprint, climb or dive until stamina recovers to `recoverAt`.
- **Battery:** drains by headlamp mode. At zero the lamp gives no light.
- **Flags:** `noclip`, `infiniteStamina` and `infiniteBattery` live in the state, so prediction matches the server. Only admin commands set them.

## Water

Water comes from `vol-water-*` volumes in the pieces (the manifest's `volumes`). `waterSurface(world, point)` returns the surface height at the feet, or null.

- **Swimming** starts when the water over the feet is deeper than `swim.depth` (1.2 m). It ends only when you stand on the bottom in shallower water or leave the water, because a floating swimmer's feet are close to the surface.
- **While swimming:**
  - the capsule is short (`swim.height`) and there is no gravity;
  - movement follows the look direction, including pitch;
  - `climb` swims up and `swimDown` swims down;
  - buoyancy floats you with the eye `swim.floatEye` above the surface unless you're diving (`swimDown`, or moving forward while looking down);
  - you can't swim up out of the water;
  - at the surface, holding `climb` (Space) at an edge mantles out (up to `mantle.maxFromWater` above the surface). Never automatic;
  - swimmers also step up onto low ledges, so swimming into submerged steps walks you out.
- **Breath:** while the eye is underwater (`state.underwater`), stamina drains at `swim.breathDrain` and doesn't regenerate. At zero you're `exhausted`, and buoyancy always wins, so you're forced up. Drowning damage comes with sanity in Phase 2.
- **Wading** (shallower water) slows movement by `wadeSpeed` and switches footsteps to splashes.

## Mantling

`findMantle` (`collision.ts`) looks for a ledge `reach` ahead along the yaw. All of these must hold:

- something blocks a short probe capsule just in front of the feet;
- the ledge top lies between the minimum and maximum heights;
- a capsule fits on it, over a floor (tried standing, then crouched, then crawling);
- there's room to rise straight up from where you are and halfway onto the ledge.

**When it's tried:**

- on land, while `climb` is held: ledges from `stepHeight` up to `mantle.maxHeight` (1.2 m) above the feet;
- in water: while `climb` is held at the surface.

**What happens:** a successful find starts `state.mantle`. For `duration` seconds the position follows a fixed path (rise, then move over), input is ignored, and collisions are skipped because the target was already validated. At the end you stand on the ledge in the stance that fit. A mantle costs `staminaCost`.

It's part of the deterministic state, so server and prediction agree. The client dips the camera during a mantle.

## Collision

`buildCollisionWorld(layout, PIECES)` turns every piece's `col-*` boxes (exported from Blender, stored in the manifest) into world-space oriented boxes and buckets them in a 4 m spatial hash.

- **Player shape:** a vertical capsule, approximated by 3 spheres. Each sphere is pushed out of every nearby box over 4 iterations.
- **Floors and slopes:** contacts with normal.y > 0.7 count as floor. They resolve vertically, so the player doesn't slide down ramps. The stairs are a single ramp collider.
- **Ceilings:** contacts facing down stop upward velocity.
- **Walls:** contacts push out horizontally and remove the velocity going into the wall.
- **Low ledges:** up to `stepHeight` (0.4 m), stepped onto. `stepUp` checks there's room on top, then binary-searches the ledge height. The chapel dais (0.35 m) steps up; the benches (0.45 m) block.
- **Ground probe:** a sphere just below the feet decides `grounded` when resting exactly on a floor.

Collision boxes must cover everything walkable. Every surface the player can reach needs a box under it, and a piece's boxes must stay inside its declared `levels` (`pnpm asset:build` checks this).

## Networking

| Step                    | What happens                                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client, each 1/60 s     | Builds an `InputFrame` (move axes, look, sprint, wanted stance, wanted headlamp mode), steps the simulation locally, keeps it as pending, and sends new frames once per rendered frame (`input` message).                                                                       |
| Server, each 20 Hz tick | Simulates queued frames for each player, at most at real-time rate (a per-player budget refilled at `SIM_RATE`, so flooding frames can't speed a player up). Records the last applied `seq` as `ack`. Broadcasts `tick` with a `PlayerSnapshot` (state + ack) for every player. |
| Client, on snapshot     | Resets to the server state, drops pending frames up to `ack`, and replays the rest. Any difference from the previous prediction becomes a visual offset that fades over 100 ms. Differences over 2 m (teleport, respawn) snap.                                                  |

The camera interpolates between the last two simulation steps, so movement is smooth at any frame rate. Input frames are sanitized on the server (`sanitizeFrame`).

**Debugging:** with matching code, normal walking produces no corrections. A correction means the client and server simulations diverged (different code, map or tuning).

## Headlamp

`headlampOutput(state, model)` returns the light's intensity, range and cone for this instant.

- **Flicker:** deterministic, driven by the lamp's `lampClock` (seconds lit, part of the state) through a hash. The server can therefore later ask whether a lamp is flickering, for the half-light Thrall, and get the same answer the client renders.
- **Low battery:** below `flicker.lowBattery`, the lamp dims and flickers more.

`Headlamp.ts` puts a `SpotLight` on the camera. It casts one shadow on medium and high quality, and it counts toward `LIGHT_BUDGET`. The scene's ambient light is almost black, so the headlamp is the light.

**Other players' headlamps:** `RemotePlayers` gives each remote player a head pivot (eye height, yaw, pitch from their snapshot) with its own `Headlamp`. Their flicker uses the same `headlampOutput`, with the lamp clock advanced locally between 20 Hz snapshots so it stays smooth. Remote lamps cast shadows (at most 512 px) so their light doesn't leak through walls, and each one counts toward `LIGHT_BUDGET`.

A lamp that is off has zero intensity rather than `visible = false`. Changing the number of visible lights makes Three.js recompile every material, which would hitch every time someone toggles a lamp.

**Adding a headlamp model:** add an entry to `HEADLAMPS`. The player always uses the starter until inventory exists (Phase 4).

## Audio

Sounds are registered in `src/lib/content/audio/sounds.ts`. Each entry names:

- a built recording (`file`, an id from `pnpm asset:audio`; see [asset-pipeline.md](asset-pipeline.md#audio));
- a `synth` placeholder generated in code (`src/lib/game/audio/synth.ts`), used when no recording is built for it;
- a volume and category, plus optional `rate` and `variation`.

`SoundBank` plays sounds by id through the `AudioManager` category buses. When a file has several variants (sliced footsteps), a random one plays each time.

- **Footsteps:**
  - fire every `stride` metres travelled while grounded (per stance; sprint uses `sprintStride` and the running recording);
  - the surface comes from the material under the feet, via a short raycast, mapped in `src/lib/content/audio/surfaces.ts`;
  - one walking recording covers all surfaces, pitched per surface with `rate`.
- **Breathing:** two loops, calm and fast, crossfaded by stamina. Silent at full stamina (it fades in over the first 10% used), panting when nearly spent, silent underwater. A gasp plays the moment stamina hits zero, or on surfacing if it ran out underwater.
- **The headlamp** plays a switch-on click for low and bright, and a switch-off click for off.
- **Water:** a splash on entering, swim strokes per `swim.stride` (quieter underwater), and splashing footsteps while wading.
- **Climbing:** a scrape and grunt when a mantle starts.
- **Underwater muffling:** `AudioManager.setMuffle(1)` sweeps a low-pass filter over the sfx and ambience buses (music is unaffected).
- **Sneaking** plays no footsteps.

## Admin tools

Admin tools are in the admin panel (F10) and need `PUBLIC_DEV_MODE` on the client. The server only accepts the commands when `DEV_MODE=true` (`server/config.ts`).

| Tool                       | Effect                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| Noclip                     | Fly through walls; look direction steers (sprint doubles speed).                                    |
| Infinite stamina / battery | No drain.                                                                                           |
| Teleport                   | To the start room or any major room. Lands on the nearest clear spot with a floor (`findFreeSpot`). |
| Regenerate                 | New map, from a given seed or a random one. Everyone respawns; flags are kept.                      |
| Map debug view             | Client-only orbit camera with flat lighting, for inspecting layouts.                                |
