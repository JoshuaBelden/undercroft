# Player: movement, collision, networking, headlamp, sanity

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
| Sanity tuning (data)                 | `src/lib/content/player/sanity.ts`     |
| Downed overlay                       | `src/lib/ui/DownedScreen.svelte`       |

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
- **Squeezes:** a `vol-squeeze-*` volume marks the tight part of a piece (currently `hall-squeeze`). Inside it, `state.squeezing` is set, speed is capped at `squeezeSpeed` (0.7 m/s, momentum clamped on entry) and sprinting is impossible. The client grunts as you push through. Heavy packs that won't fit come with inventory (Phase 4).
- **Sneak ("creep" in game):** caps speed at `sneakSpeed` and wins over sprint. It sets `state.sneaking`, which silences footsteps, and creatures only hear it within `hear.creep` (see [creatures.md](creatures.md)).
- **Stance key (client):** a tap (released within 350 ms) cycles the wanted stance; while the key is held you creep, and releasing a hold leaves the stance as it was (`LocalPlayer.updateStanceKey`). Holding sprint resets the wanted stance to standing and stops creeping.
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
- **Climbing and squeezes:** an exertion grunt (`exertion`, sliced into variants) when a mantle starts, and every 1.3–2.2 s while pushing through a squeeze.
- **Muffling and reverb:** the sfx and ambience buses pass through a low-pass filter (`AudioManager.setMuffle`) and send to a convolution reverb with a synthetic stone-room impulse (`setReverb`). Music bypasses both.
- **Acoustics:** each kit entry can set `acoustics` (`tight`, `tunnel` (default), `hall`, `vast`). `ACOUSTICS` in `src/lib/content/audio/ambience.ts` maps each to reverb and muffle. `Ambience` finds the piece the player is in and eases toward its values: crawlspaces and squeezes sound close and damped, the Cistern and the Chapel echo. Underwater forces full muffle and no reverb.
- **Positional audio:** `AudioManager.playBufferAt` / `SoundBank.playAt` place a sound in 3D (HRTF panning, inverse distance falloff). The page updates the listener from the camera every frame (`setListener`).
- **Ambience** (`src/lib/game/audio/Ambience.ts`, tuning in `AMBIENCE`):
  - drips around the listener every few seconds, more often near water;
  - every 25–70 s, a distant knock, rockfall or creak from a random direction;
  - every 60–150 s, an unsettling ambient swell (`ambience.creepy`) around the listener, not from a point;
  - a lapping loop that fades in near water volumes.
  - All of it plays on the ambience bus, so the Ambience volume slider controls it. All of them now use recordings; the synthesized versions remain as fallbacks.
- **Sneaking** plays no footsteps.

## Sanity

Sanity is health (0 to `SANITY.max`). All tuning lives in `SANITY` (`src/lib/content/player/sanity.ts`).

Applied by the server (`server/session.ts`) each tick:

- **Attacks:** a creature's hit takes `attack.damage`.
- **Darkness:** `darknessDrain`/s while your lamp gives no light (off or flat) and other players' lamps put less than 0.02 on your eye.
- **Seeing:** `seeingDrain`/s while a creature is in half-light (`creatureLight` in its `visibleBand`), within `seeingRange`, inside your view cone (0.9 rad half-angle) and in line of sight.
- **God mode** (admin flag) ignores all of it.

At 0 the server sets `downed`. In the shared step, `stepDowned` keeps a downed player on the floor in crawl stance: look only, no extraction or bandaging. `downedTime` counts up, and at `bleedOut` (60 s) `dead` is set. The server then sends `died` and removes the player, like `extracted`. The expedition still ends when nobody is left.

**Reviving:** the server keeps each player's last simulated input. While a player who isn't downed holds `interact` within `reviveRange` of a downed teammate and has salts, `reviving` counts up. At `reviveSeconds` one salt is used and the teammate gets up with `reviveTo` sanity. If nobody else could help (solo, or everyone else is down too), a downed player with salts uses their own after 3 s.

**Bandages:** hold `heal` standing still with a bandage and less than full sanity. `bandaging` counts up in the shared step (so it predicts), and at `bandageSeconds` one bandage is used for `bandageHeal`. Moving or letting go resets it.

Until the inventory exists (Phase 4), each player starts with `startingSalts` and `startingBandages`.

**Client:**

- The HUD shows a sanity bar (only below max), bandage and salt counts, and a vignette that darkens with lost sanity and pulses below 40%.
- A hit (a drop of more than 3 in one frame) flashes red, plays `player.hurt` and shakes the camera, scaled by the **Camera shake** setting.
- `heartbeat` loops louder and faster below 40%; `whisper` plays near you below 20%.
- Downed, the camera tilts and `DownedScreen` shows the bleed-out bar and what happens next.

## Admin tools

Admin tools are in the admin panel (F10) and need `PUBLIC_DEV_MODE` on the client. The server only accepts the commands when `DEV_MODE=true` (`server/config.ts`).

| Tool                       | Effect                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| Noclip                     | Fly through walls; look direction steers (sprint doubles speed).                                    |
| Infinite stamina / battery | No drain.                                                                                           |
| Teleport                   | To the start room or any major room. Lands on the nearest clear spot with a floor (`findFreeSpot`). |
| Regenerate                 | New map, from a given seed or a random one. Everyone respawns; flags are kept.                      |
| Map debug view             | Client-only orbit camera with flat lighting, for inspecting layouts.                                |
| God mode                   | No sanity loss.                                                                                     |
| Set sanity                 | Sets your sanity (0 downs you; above 0 gets you up if downed).                                      |
| Creatures                  | Spawn one in front of you, remove all, show markers through walls (see creatures.md).               |
