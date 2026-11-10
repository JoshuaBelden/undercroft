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
2. Changes stance if the taller capsule fits.
3. Accelerates toward the wanted velocity for the stance (or sprint).
4. Applies gravity, or a small "stick" velocity while grounded so the player stays on slopes and stairs.
5. Moves and resolves collisions.
6. Updates stamina and battery.

All tuning is data in `MOVEMENT` and `HEADLAMPS`: speeds, capsule heights, eye heights, stride, stamina rates, light intensities, drain and flicker.

- **Stances:** stand (1.75 m), crouch (1.2 m), crawl (0.7 m). Standing up is blocked while the taller capsule wouldn't fit (`capsuleFits`). From a crawl under a low ceiling, the player rises as far as fits.
- **Stamina:** sprinting drains it, and it regenerates after a short delay. At zero the player is `exhausted` and can't sprint until stamina recovers to `recoverAt`.
- **Battery:** drains by headlamp mode. At zero the lamp gives no light.
- **Flags:** `noclip`, `infiniteStamina` and `infiniteBattery` live in the state, so prediction matches the server. Only admin commands set them.

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

**Adding a headlamp model:** add an entry to `HEADLAMPS`. The player always uses the starter until inventory exists (Phase 4).

## Audio (placeholders)

Sounds are registered in `src/lib/content/audio/sounds.ts`. Each has either a `url` (a file in `static/assets/audio`) or a `synth` placeholder generated in code (`src/lib/game/audio/synth.ts`). `SoundBank` plays sounds by id through the `AudioManager` category buses.

- **To replace a placeholder with a recording,** add `url` to its entry. No code changes.
- **Footsteps** fire every `stride` metres travelled while grounded (per stance; sprint uses `sprintStride`). The surface comes from the material under the feet, via a short raycast, mapped in `src/lib/content/audio/surfaces.ts`.
- **Breathing** is a loop whose volume and rate follow stamina.
- **The headlamp click** plays when the mode changes.

## Admin tools

Admin tools are in the admin panel (F10) and need `PUBLIC_DEV_MODE` on the client. The server only accepts the commands when `DEV_MODE=true` (`server/config.ts`).

| Tool                       | Effect                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| Noclip                     | Fly through walls; look direction steers (sprint doubles speed).                                    |
| Infinite stamina / battery | No drain.                                                                                           |
| Teleport                   | To the start room or any major room. Lands on the nearest clear spot with a floor (`findFreeSpot`). |
| Regenerate                 | New map, from a given seed or a random one. Everyone respawns; flags are kept.                      |
| Map debug view             | Client-only orbit camera with flat lighting, for inspecting layouts.                                |
