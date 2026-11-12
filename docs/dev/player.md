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
| Other players                        | `src/lib/game/player/RemotePlayers.ts` |
| Player body (model and animation)    | `src/lib/game/player/PlayerBody.ts`    |
| Explorer model and camera (data)     | `src/lib/content/player/model.ts`      |
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
- **Squeezes:** a `vol-squeeze-*` volume marks the tight part of a piece (currently `hall-squeeze`). Inside it, `state.squeezing` is set, speed is capped at `squeezeSpeed` (0.7 m/s, momentum clamped on entry) and sprinting is impossible. The client grunts as you push through. Heavy packs that won't fit come with backpack tiers (Phase 5).
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

**Other players** are not predicted; they are interpolated (`RemotePlayers`):

- Each tick's snapshot is stored per player with the tick's `serverTime` (up to 10 samples).
- The client estimates the server clock from those timestamps. The estimate follows the least-delayed packet, so jitter doesn't move it.
- Every frame a remote player is drawn at server time minus `INTERPOLATION_DELAY` (100 ms, two ticks), between the two samples either side of that moment: position is lerped, yaw turns the short way, pitch is lerped.
- Past the newest sample it holds still (no extrapolation). A jump over 6 m between samples (teleport, respawn) snaps.
- The body's animation and the lamp use the latest snapshot.

So you see teammates about 100 ms plus latency in the past, and the local player in the present.

**Debugging:** with matching code, normal walking produces no corrections. A correction means the client and server simulations diverged (different code, map or tuning).

## Headlamp

`headlampOutput(state, model)` returns the light's intensity, range and cone for this instant.

- **Flicker:** deterministic, driven by the lamp's `lampClock` (seconds lit, part of the state) through a hash. The server can therefore later ask whether a lamp is flickering, for creature visibility, and get the same answer the client renders.
- **Low battery:** below `flicker.lowBattery`, the lamp dims and flickers more.

`Headlamp.ts` puts a `SpotLight` on the player's head: an object at the eyes, facing where they look. In first person that is where the camera is; over the shoulder the camera hangs back and the lamp stays on the head, which is where the server works out the light from. It casts one shadow on medium and high quality, and it counts toward `LIGHT_BUDGET`. The scene's ambient light is almost black, so the headlamp is the light.

**Other players' headlamps:** `RemotePlayers` gives each remote player a head pivot (eye height, yaw, pitch from their snapshot) with its own `Headlamp`. Their flicker uses the same `headlampOutput`, with the lamp clock advanced locally between 20 Hz snapshots so it stays smooth. Remote lamps cast shadows (at most 512 px) so their light doesn't leak through walls, and each one counts toward `LIGHT_BUDGET`.

A lamp that is off has zero intensity rather than `visible = false`. Changing the number of visible lights makes Three.js recompile every material, which would hitch every time someone toggles a lamp.

**Adding a headlamp model:** add an entry to `HEADLAMPS`. The player always uses the starter until the hub sells others (Phase 5).

## Player model

Every player is drawn with the explorer model (`PLAYER_MODEL` in `src/lib/content/player/model.ts`), built from `art/export/player/explorer.glb` by `pnpm asset:build`.

`PlayerBody` owns one copy of the model and animates it from that player's `PlayerState` alone, so the server sends nothing extra. `RemotePlayers` has one per other player; the play page has one for you, drawn only when the camera is outside your head. Each frame it picks an animation slot (see Animation maps in [creatures.md](creatures.md)):

| State                           | Slot             | Speed                                            |
| ------------------------------- | ---------------- | ------------------------------------------------ |
| Downed or dead                  | `die`            | plays once, then holds                           |
| Mantling                        | `climb`          | no clip: falls back to the walk                  |
| Swinging or throwing            | `melee_attack`   | stretched to the item's swing or throw           |
| Swimming                        | `crawl`          | ground speed / swim speed                        |
| Crouched or crawling            | `crouch`/`crawl` | ground speed / stance speed; stops when you stop |
| Standing still (under 0.2 m/s)  | `idle`           |                                                  |
| Faster than halfway to a sprint | `running`        | ground speed / sprint speed                      |
| Otherwise                       | `walking`        | ground speed / walk speed                        |

The explorer's map:

| Slot           | Clip                           | Notes                                             |
| -------------- | ------------------------------ | ------------------------------------------------- |
| `idle`         | `Walking`, held at frame 0     | a stand-in: the model has no idle clip            |
| `walking`      | `Walking`                      |                                                   |
| `running`      | `Running`                      |                                                   |
| `crouch`       | `Cautious_Crouch_Walk_Forward` |                                                   |
| `crawl`        | `Crawl_and_Look_Back`          | the first 2.1 s only; the rest stops to look back |
| `melee_attack` | `Heavy_Hammer_Swing`           |                                                   |
| `dodge`        | `Block5`                       | mapped, nothing plays it yet                      |
| `take_damage`  | `Face_Punch_Reaction_1`        | mapped, nothing plays it yet                      |
| `die`          | `Shot_and_Slow_Fall_Backward`  |                                                   |

Not yet done:

- Nothing is drawn in the body's hand, and firing a gun and reloading have no animation (the model has no clip for them).
- The body doesn't cast shadows. The lamp is inside the head, so a shadow-casting body would block its own lamp, and Three.js can't exempt one light.

## Camera

`settings.graphics.view` is `first` or `shoulder`; `toggleView` (V) switches it, and so does Camera under Graphics in the settings.

- **Lamp position:** whenever a body is drawn (other players, and you over the shoulder), its lamp is moved `PLAYER_MODEL.lampForward` (0.45 m) ahead of the eye point. The model's head is ahead of the eye point and leans further in a run, so a lamp left at the eye point would shine on the back of the head.
- **Only standing.** Crouched, crawling or swimming, the body would fill the view from behind, so the shoulder view gives way to the eyes and comes back when you stand up.
- **First person:** the camera is at the eyes and the held item is drawn by `ViewModel`.
- **Over the shoulder:** the camera sits behind and to the right of the head (`SHOULDER_CAMERA`: right, up, back, in the look frame). `segmentHit` from the eye to that spot pulls it in short of a wall. Your own `PlayerBody` is drawn and the viewmodel is hidden. If the camera is squeezed to within `hideWithin` (0.3 m) of the head, the body is hidden so you don't see it from the inside.

The view changes nothing on the server: you still move, aim and shoot from the eyes along the look direction, so over the shoulder a shot lands slightly left of the centre of the screen at close range.

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
- **Expedition stingers:** `expedition.intro` (`sfx_expedition_intro.mp3`) on arriving underground and `expedition.outro` (`sfx_extraction_outro.mp3`) on leaving alive, both on the music bus. See [expedition.md](expedition.md#leaving-and-results).
- **Menu click:** `ui.click` (`menu_click.wav`) plays on every move between pages off the expedition: the dashboard tabs, store, social, settings, the keys that switch them, and back/forward. The root layout (`src/routes/+layout.svelte`) plays it from `onNavigate`, so any new page gets it for free. It skips navigation into or out of `/play` and query-only changes.

### Subtitles and sound captions

One setting (`settings.accessibility.captions`, off by default; `captionSize` sets the text size) shows what is heard as text. It is data-driven from the sound registry:

- A sound is captioned if its entry has a `caption` (lowercase, no brackets; the HUD adds them). Sounds without one are never captioned: the player's own footsteps, breath and clicks, and constant background like drips.
- `captionOthers: true` captions a sound only when it comes from the world (`playAt`), not when the player makes it themselves (`play`). Gunshots use it.
- `SoundBank` raises a cue on `oncaption` from `play`, `playAt` and a loop's `setVolume`, before the audio-unlocked check, so captions work with the sound off or muted.
- **Audibility:** a cue is only raised when `level × volume × distance falloff` reaches `CAPTION_THRESHOLD`. The falloff is `AudioManager.distanceGain`, the same inverse curve the panner uses, so a sound is captioned about as far as it is heard.
- **Direction:** positional cues carry `ahead`, `behind`, `left`, `right`, `above` or `below`, from `captionDirection` (listener position and facing from `AudioManager.listener`). Non-positional sounds and loops have none.
- **Loops** (heartbeat, omen drone, the manifestation's rumble) re-raise their cue every 0.5 s while audible, which keeps the caption up.
- `CaptionFeed` (`src/lib/game/audio/captions.svelte.ts`) holds up to 4 captions, one per sound id; a repeat refreshes its timer and direction instead of adding a line. `Captions.svelte` draws them at the bottom of the screen.

**Adding a caption:** add `caption` to the sound in `sounds.ts`. Describe the sound, not its source; captions must not give away more than hearing it would. Never name creatures.

**Spoken lines:** there are none yet. When one is added, give its sound a `caption` with the words; it rides the same system and the same setting.

## Gloom

`PlayerState.gloom` (0..1) is lamp failure from the Affliction, set by the server each tick. `headlampOutput` turns it into more flicker, lower output and, above 0.7, moments with no light at all. It's deterministic from state like the rest of the lamp. See [affliction.md](affliction.md).

## Items

`PlayerState` carries `inventory` (equipment, backpack, quick-use slots and which of them is in the hand) and `weapon` (the held item's action). `InputFrame` has `attack`, `aim`, `reload`, `drop` and `select`. The `primaryWeapon` and `secondaryWeapon` actions and the quick-use wheel (`quickUse`, held) set `select`. `stepPlayer` advances the held item with `stepWeapon` and can collect `SimEvent`s for the server to resolve. Aiming a firearm caps speed at `aimSpeed` and blocks sprinting. All of it is described in [items.md](items.md).

## Sanity

Sanity is health (0 to `SANITY.max`). All tuning lives in `SANITY` (`src/lib/content/player/sanity.ts`).

Applied by the server (`server/session.ts`) each tick:

- **Attacks:** a creature's hit takes `attack.damage`, less what the item in the defense slot takes off (`defenseReduction`).
- **Darkness:** `darknessDrain`/s while your lamp gives no light (off or flat) and other players' lamps put less than 0.02 on your eye.
- **Seeing:** `seeingDrain`/s while a creature is visible (`creatureLight` in its `visibleBand`), within `seeingRange`, inside your view cone (0.9 rad half-angle) and in line of sight.
- **God mode** (admin flag) ignores all of it.

At 0 the server sets `downed`. In the shared step, `stepDowned` keeps a downed player on the floor in crawl stance: they can look around and drag themselves along at `MOVEMENT.downedSpeed`, with no bandaging or items. They can still extract: `stepDowned` runs the same `updateExtraction` (hold interact, still, at an extraction point), and the HUD shows the climb-out prompt while downed. `downedTime` counts up, and at `bleedOut` (60 s) `dead` is set. The server then sends `died` and removes the player, like `extracted`. The expedition still ends when nobody is left.

**Surrender:** holding `climb` while downed counts `surrendering` up; at `SANITY.surrenderSeconds` (1 s) `dead` is set at once. `Session.down` sets `surrendering` to -1, which means the key has to be let go once first, so a key already held when going down (mid-climb) does not surrender. Both are in the shared step, so the client predicts them.

**Reviving:** the server keeps each player's last simulated input. While a player who isn't downed holds `interact` within `reviveRange` of a downed teammate and has salts (an item with `revive`) in a quick-use slot, `reviving` counts up. At `reviveSeconds` one is used and the teammate gets up with `reviveTo` sanity. If nobody else could help (solo, or everyone else is down too), a downed player with salts in a quick-use slot uses their own after 3 s. Salts in the backpack don't count.

**Bandages:** take one in the hand from the quick-use wheel and hold `attack`, standing still, with less than full sanity. `bandaging` counts up in the shared step (so it predicts), and at the item's `heal.seconds` one is used for `heal.amount`. Moving, letting go or switching what is in the hand resets it.

Bandages and smelling salts are quick-use items (see [items.md](items.md)); players bring them down in their loadout (see [economy.md](economy.md)).

**Client:**

- The HUD shows a vignette that darkens with lost sanity and pulses below 40%.
- **Party panel** (`src/lib/ui/PartyHealth.svelte`, bottom-left): every explorer on the expedition, each with their gamer tag in small text above a health (sanity) bar and a stamina bar, and "Downed" when they are. Teammates come from `RemotePlayers.players()` (their tick snapshots, so it is the server's state) in a stable order; this player is always last, at the bottom, with slightly larger bars and the posture and headlamp battery under them. Solo it is just you.
- A hit (a drop of more than 3 in one frame) flashes red, plays `player.hurt` and shakes the camera, scaled by the **Camera shake** setting.
- `heartbeat` loops louder and faster below 40%; `whisper` plays near you below 20%.
- Downed, the camera tilts and `DownedScreen` shows the bleed-out bar, what happens next and the hold-to-surrender prompt.

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
