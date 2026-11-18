# Player: movement, collision, networking, headlamp, sanity

The first-person player. The server is authoritative. The client predicts its own movement with the same code and reconciles with the server.

## Files

| What                                 | Where                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| State and input types                | `src/lib/shared/player/types.ts`                                              |
| Simulation (pure, shared)            | `src/lib/shared/player/simulate.ts`                                           |
| Headlamp output and flicker (shared) | `src/lib/shared/player/headlamp.ts`                                           |
| Collision world                      | `src/lib/shared/map/collision.ts`                                             |
| Spawn and teleport points            | `src/lib/shared/map/points.ts`                                                |
| Movement tuning (data)               | `src/lib/content/player/movement.ts`                                          |
| Climbing ropes (shared)              | `src/lib/shared/player/climb.ts`                                              |
| Conditions (data / shared)           | `src/lib/content/player/conditions.ts`, `src/lib/shared/player/conditions.ts` |
| Headlamp models (data)               | `src/lib/content/items/headlamps.ts`                                          |
| Server side                          | `server/session.ts`, `server/systems/sanity.ts`                               |
| Client prediction and camera         | `src/lib/game/player/LocalPlayer.ts`                                          |
| Headlamp light                       | `src/lib/game/player/Headlamp.ts`                                             |
| Other players                        | `src/lib/game/player/RemotePlayers.ts`                                        |
| Player body (model and animation)    | `src/lib/game/player/PlayerBody.ts`                                           |
| Gamer tags above heads               | `src/lib/game/player/gamerTag.ts`, `src/lib/content/player/gamerTags.ts`      |
| Explorer model and camera (data)     | `src/lib/content/player/model.ts`                                             |
| Footsteps, breathing, click          | `src/lib/game/player/PlayerAudio.ts`                                          |
| HUD                                  | `src/lib/ui/Hud.svelte`                                                       |
| Sanity tuning (data)                 | `src/lib/content/player/sanity.ts`                                            |
| Downed overlay                       | `src/lib/ui/DownedScreen.svelte`                                              |

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
- **Squeezes:** a `vol-squeeze-*` volume marks the tight part of a piece (currently `hall-squeeze-long`). Inside it, `state.squeezing` is set, speed is capped at `squeezeSpeed` (0.7 m/s, momentum clamped on entry), sprinting is impossible, and so is fighting: the held weapon can't swing, fire, aim or throw (`able` in `stepPlayer`, so the client predicts it and the server agrees). The squeeze is three cells, with about 9 m of it tight. The client gasps as you start to push through, then grunts. Heavy packs that won't fit come with backpack tiers (Phase 5).
- **Sneak ("creep" in game):** caps speed at `sneakSpeed` and wins over sprint. It sets `state.sneaking`, which silences footsteps, and creatures only hear it within `hear.creep` (see [creatures.md](creatures.md)).
- **Headlamp key (client):** a tap switches the lamp off, or back on at the brightness it last had (`lampOn`); held for `LAMP_HOLD_MS` (0.4 s) it switches between low and bright, and comes on if it was off (`LocalPlayer.updateLampKey`). The mode goes to the server in every input frame (`InputFrame.headlamp`).
- **Stance key (client):** a tap (released within 350 ms) cycles the wanted stance; while the key is held you creep, and releasing a hold leaves the stance as it was (`LocalPlayer.updateStanceKey`). Holding sprint resets the wanted stance to standing and stops creeping.
- **Stamina:** sprinting drains it, and it regenerates after a short delay. At zero the player is `exhausted` and can't sprint, climb or dive until stamina recovers to `recoverAt`.
- **Battery:** drains by headlamp mode. At zero the lamp gives no light. It is a fraction of the lamp's full voltage (`HeadlampModel.volts`, 24 V for the starter lamp); the HUD shows it in volts beside the cells (`Math.ceil(battery × volts)`, so a lamp still giving light never reads 0V). A battery item adds its `charge.volts` (see [items.md](items.md)). Under `lowAlert.volts` (3 V) with the lamp on, the client beeps (`battery.low`) at once and then every `lowAlert.seconds` (60); turning the lamp off pauses the minute, and charging above 3 V resets it.
- **Flags:** `noclip`, `infiniteStamina` and `infiniteBattery` live in the state, so prediction matches the server. Only admin commands set them.

## Water

Water comes from `vol-water-*` volumes in the pieces (the manifest's `volumes`). `waterSurface(world, point)` returns the surface height at the feet, or null.

- **Swimming** starts when the water over the feet is deeper than `swim.depth` (1.2 m). It ends only when you stand on the bottom in shallower water or leave the water, because a floating swimmer's feet are close to the surface.
- **While swimming:**
  - the capsule is short (`swim.height`) and there is no gravity;
  - movement follows the look direction, including pitch;
  - `climb` swims up and `swimDown` swims down;
  - at the surface, buoyancy floats you with the eye `swim.floatEye` above it unless you're diving (`swimDown`, or moving forward while looking down);
  - once you dive you're `submerged`: no buoyancy, so you stay at the depth you swim to (up, down and holding still are all your own doing) until you swim back up to the surface, where floating takes over again;
  - sprinting (swimming hard) works at the surface only, not with the eye underwater;
  - no weapons: you can't swing, fire, aim or throw;
  - you can't swim up out of the water;
  - at the surface, holding `climb` (Space) at an edge mantles out (up to `mantle.maxFromWater` above the surface). Never automatic;
  - swimmers also step up onto low ledges, so swimming into submerged steps walks you out.
- **Breath:** while the eye is underwater (`state.underwater`), stamina drains at `swim.breathDrain` and doesn't regenerate. At zero you're `exhausted`, which ends `submerged` and floats you up: the one time you surface on your own. Drowning damage comes with sanity in Phase 2.
- **Wading** (shallower water) slows movement by `wadeSpeed` and switches footsteps to splashes.

### Underwater

With the camera under a water surface (`Underwater.below`: the camera, not the body, so it works over the shoulder and in the free camera too), the view goes murky:

- **Fog:** `Underwater` (`src/lib/game/Underwater.ts`) puts a dense, dark green `FogExp2` on the scene, fading in and out over 0.2 s. Things a few metres off are half hidden and nothing past about 9 m shows. Every map material takes fog by default, so a new one needs nothing.
- **Overlay:** `UnderwaterOverlay.svelte`: a murky green tint, darker toward the edges. Nothing moves in it.
- **Sound:** the world is muffled and dry (`Ambience`, as before), under a low `underwater.drone` loop on the ambience bus that follows the fade.
- Off in the map debug view, which is fully lit.

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

## Ropes

Climbing a rope is its own mode of the simulation (`state.climbing`), entered with a fresh press of `climb` beside one: up and down it, nobody past anyone, off at either end or out of the catacomb up an extraction rope. See [rope.md](rope.md#climbing).

## Falls and conditions

**Falls.** Landing from the air faster than `FALL.safeSpeed` (9 m/s, about a 2.2 m drop with gravity 18) is a fall that hurts. `stepPlayer` raises a `land` sim event with the speed, and the server takes `(speed - safeSpeed) * FALL.damagePerSpeed` sanity for it (`Session.falls` → `hurt`). That is about 27 for 4 m, and a 12 m drop downs you. It also makes a `fall` game event (`hard` over `FALL.hardSpeed`, for the louder thump), and creatures hear it (`FALL.noise`). Landing in water never hurts. God mode takes no fall.

**Conditions** are something wrong with an explorer for a while. They are data (`CONDITIONS` in `src/lib/content/player/conditions.ts`), and `state.conditions` holds the active ones with the seconds they have left. `stepPlayer` counts them down (`stepConditions`) and applies their effects. A condition's `slow` caps speed at that stance's walking speed whatever your stance, and stops sprinting (`conditionSpeedCap`). Getting one you already have starts it over.

- **Hobbled** (`hobble`, 20 s, no faster than a crawl): every fall that hurts. The simulation applies it on landing, so the client predicts the slow-down at once. While you move hobbled, the view limps: the eye dips and the head nods on every other step (`LocalPlayer.updateLimp`, `LIMP`), easing in and out, scaled by Settings > Graphics > Camera shake.

The HUD shows each one as a chip under your bars in the party panel, with its name and the seconds left, draining as it wears off (`Hud.svelte`, `conditions`). Admin: "Clear conditions" in the Player group.

To add a condition: an entry in `CONDITIONS` (id, name, seconds, description and its effects), a way to get it (`applyCondition` in the simulation, or on the server), and a line in the "Falls and conditions" help topic. A new kind of effect goes where movement or the hands read it (`conditionSpeedCap` is the pattern).

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

The camera interpolates between the last two simulation steps, so movement is smooth at any frame rate. Input frames are sanitized on the server (`sanitizeFrame`), which also applies `handsBusy` while the in-game menu is open (`reading`, see [items.md](items.md#the-in-game-menu)).

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
- **Low and bright** are a choice, not a step up: low (intensity 7, 8 m, a 0.7 rad half-cone) is dim, for getting about carefully, and shows a creature only within about 3.5 m; bright (55, 18 m, 0.75 rad) is as wide as low and far brighter, at three times the drain. A creature shows within about 14 m. The strobe (switching on from off, [status.md](status.md)) needs 0.05 on the creature: within about 3 m on low. Tuning the modes, check these distances with `lampIllumination` ([creatures.md](creatures.md#half-light)); wider cones don't change the light count, but spread each lamp's shadow map wider.

`Headlamp.ts` puts a `SpotLight` on the player's head: an object at the eyes, facing where they look. In first person that is where the camera is; over the shoulder the camera hangs back and the lamp stays on the head, which is where the server works out the light from. It casts one shadow on medium and high quality, and it counts toward `LIGHT_BUDGET`. The scene's ambient light is almost black, so the headlamp is the light.

**Other players' headlamps:** `RemotePlayers` gives each remote player a head pivot (eye height, yaw, pitch from their snapshot) with its own `Headlamp`. Their flicker uses the same `headlampOutput`, with the lamp clock advanced locally between 20 Hz snapshots so it stays smooth. Remote lamps cast shadows (at most 512 px) so their light doesn't leak through walls, and each one counts toward `LIGHT_BUDGET`. **Reduce flashing** (`src/lib/game/flashing.ts`) only changes what is drawn: `SteadyLight` eases every lamp's light (and the viewmodel's fill) toward the shared `headlampOutput` over about 0.3 s, so flicker becomes a waver and cut-outs slow dips. `flashStrength()` scales muzzle flashes, flares and the shot's ambient pulse to a quarter, and the hurt vignette fades in and out slowly. The simulation, and so what the server counts as lit, doesn't change.

**Toggle sprint and aim** (accessibility settings) are handled in `LocalPlayer`: a press switches sprint or aim on and the input frames carry it as if held. Sprint ends when you stop moving or press the stance key. The controller has its own sprint setting, a toggle by default (see [controller.md](controller.md#moving-and-looking)); `sprintBy` remembers which device switched it on. Aim only toggles with a firearm in hand (with anything else the aim key throws on every press) and ends when the gun leaves the hand. Aiming sensitivity (`controls.aimSensitivity`) multiplies the look speed while zoomed in.

A lamp redraws its shadow map only while it's lit and its light could reach the view (`Headlamp.update` with the camera's frustum). Otherwise `shadow.autoUpdate` is off, and Three.js keeps the old map without a pass over the scene. Shadows are never turned off with `castShadow` while playing, because changing how many lights cast shadows recompiles every material, like changing the number of lights. "Nearest" below swaps which lamp casts without changing how many.

### Teammate shadows

Each lamp that casts shadows draws the scene again into its shadow map every frame it's lit and in view. In a party of four that's three extra passes. Run Diagnostics on an iPad measured about 4 ms a frame for them, enough to take Medium from above 60 fps to 56 ([diagnostics.md](diagnostics.md#what-we-learned)). The **Teammate lamp shadows** setting (`graphics.teammateShadows`) picks whose lamps cast shadows besides your own:

- **All** (the default): every teammate's lamp. Their light stops at walls, as it should.
- **Nearest**: only the nearest teammate with a lit lamp. `RemotePlayers.pickCaster` chooses each frame with `pickShadowCaster` (`src/lib/game/player/shadowCaster.ts`), and another lamp takes over only once it's 1.5 m closer, so two teammates side by side don't swap it every frame. Someone is always the caster while anyone is there, lit or not, so the number of shadow-casting lights never changes and nothing recompiles. An unlit caster costs nothing, since its map isn't redrawn.
- **Off**: no teammate's lamp casts shadows.

A lamp without shadows **shines through walls**: a teammate in the next passage lights your side of the rock. That's the price, and the setting's hint says so. Low quality has no shadows whatever this says (`setShadows(enabled = false)`). Run Diagnostics always uses All, so its results compare across machines.

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

The body doesn't cast shadows. The lamp is inside the head, so a shadow-casting body would block its own lamp, and Three.js can't exempt one light.

### Holding and using items

What is in a player's hand shows on their body: the item's model in the right hand, the arms posed for it, and using it plays on the arms.

**The item in the hand.** `PlayerBody` hangs a group from the right hand bone (`PLAYER_MODEL.hand`, `mixamorigRightHand`: three.js drops the `:` from Mixamo's bone names) and puts the held item's model in it at the item's `grip` (`offset` and `rotation` in the hand bone's frame, in `src/lib/content/items.ts`; see [items.md](items.md#data)). It swaps when the held item changes, and is put away while the player is down, dead, on a rope or swimming. An item without a `grip` isn't drawn. The model comes from `itemModel` (`src/lib/game/items/itemModel.ts`), shared with the viewmodel.

**Upper-body poses.** The legs keep playing the full-body clip above. Over it, `UpperBody` (`src/lib/game/UpperBody.ts`) plays clips that turn only arm and hand bones. Each frame, after the full-body clip has posed the skeleton, every bone an upper clip turns is slerped from that pose toward the clip's, so walking, running and crouching need no clip per hold. A bone the clip leaves alone (the free arm of a one-handed hold) follows the legs' clip. Poses fade in and out over 0.2 s; a shot or reload over 0.05 s, so the kick isn't lost. `upperBodyPose(state)` (`src/lib/game/player/pose.ts`) picks the slot from the state alone:

| State                                                                        | Upper slot                        | Clip                                          |
| ---------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------- |
| Down, dead, on a rope, mantling, swimming, crawling, swinging or throwing    | none: the full-body clip          |                                               |
| Bandaging yourself, or tending a teammate with a heal item                   | `use_bandage`                     | `Use_Bandage` (loops)                         |
| Changing your battery, or a teammate's                                       | `use_battery`                     | `Use_Battery` (loops)                         |
| A gun firing (each new shot, by `weapon.shots`, restarts it)                 | `fire_one_hand` / `fire_two_hand` | `Fire_One_Hand` / `Fire_Two_Hand`             |
| A gun reloading                                                              | `reload`                          | `Reload`, stretched to its `reloadTime`       |
| Anything else in the hand, by its `grip.pose` (`oneHand`, `twoHand`, `item`) | `hold_one_hand` and so on         | `Hold_One_Hand`, `Hold_Two_Hand`, `Hold_Item` |

The slots are `UPPER_SLOTS` in `src/lib/content/animations.ts`, mapped to clips in `PLAYER_MODEL.upper`. A swing or throw keeps the full-body `melee_attack`.

**The clips** are hand-keyed in `art/blender/Explorer.blend` by `scripts/blender/explorer.py` and merged into the explorer at build time (see [asset-pipeline.md](asset-pipeline.md#the-explorer)). Each key there gives where each wrist goes and which way the hand faces; a temporary IK chain solves the arm and the result is baked to rotation keys, fingers curled by a `grip` amount. To change a pose, edit `CLIPS` there, run `explorer.build_all()` and `explorer.export()` in Blender, then `pnpm asset:build`. A clip found elsewhere (Mixamo) works the same, as long as it keys only the arms: put it in the .blend as an NLA track and name it in `PLAYER_MODEL.upper`.

**Shots from the gun.** Another player's muzzle flare and smoke start at the barrel of the gun in their hands (`PlayerBody.muzzle`, the item's `hold.muzzle` in its model's space, via `RemotePlayers.muzzle`), and so does yours over the shoulder. Until the body's gun is drawn they fall back to a point in front of the eyes. The shot itself still goes from the eye along the look direction on the server, so it lands where the crosshair is.

## Gamer tags

Each teammate's gamer tag hangs above their explorer (`GamerTag` in `src/lib/game/player/gamerTag.ts`, one per remote player, made and updated by `RemotePlayers`). The rule, kept so the dark still keeps people apart:

- **Line of sight.** The tag is a sprite that is depth-tested against the map, so rock between you and them hides it exactly as it hides their body. No raycasts: the depth buffer does it for free. Murky water hides it too (the sprite takes the scene's fog).
- **Fades with distance.** Whole up to `GAMER_TAGS.fullUntil` (8 m) from the camera, gone by `goneAt` (20 m), eased between (`tagOpacity`, tested in `gamerTag.test.ts`).
- **Same size on screen.** `sizeAttenuation: false`, sized to `screenHeight` of the view at a 75° field of view, so a tag far off is still readable while it lasts.
- **Unlit and not tone-mapped**, so it reads in the black whether or not anyone's lamp is on them. It sits `above` (0.3 m) over their eyes, so it follows them when they crouch, crawl or go down.
- Not drawn for the teammate a spectator is watching through (`setHidden`), and never for yourself (you aren't a remote player, even over the shoulder).

The name comes from the player snapshot (`PlayerSnapshot.name`, the gamer tag the server read from the database), and is redrawn if it changes. The canvas is drawn in the UI's body typeface, and drawn again once that has loaded.

**Setting:** Interface > Gamer tags (`interface.gamerTags`, on by default) hides them all. The page passes it to `RemotePlayers.setTags` each frame, with the admin **Gamer tags through walls** toggle (Player tab), which turns off the depth test so tags show over the rock (still fading).

**Tuning:** distances, size, colours and the font are data in `GAMER_TAGS` (`src/lib/content/player/gamerTags.ts`). No sound and no bindings.

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
- **Breathing:** two loops, calm and fast, crossfaded by stamina. Silent until stamina is down to a quarter (`BREATH_BELOW` in `PlayerAudio.ts`; it fades in over the next 5%), panting as it runs out, silent underwater. Running out of stamina makes no gasp.
- **The headlamp** plays a switch-on click for low and bright, and a switch-off click for off.
- **Water:** a splash on entering, swim strokes per `swim.stride` (quieter underwater), and splashing footsteps while wading.
- **Climbing and squeezes:** an exertion grunt (`exertion`, sliced into variants) when a mantle starts, and every 1.3–2.2 s while pushing through a squeeze, after a `gasp` as you start into it.
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
- **Expedition stingers:** `expedition.intro` (`sfx_expedition_intro.mp3`) on arriving underground and `expedition.outro` (`sfx_extraction_outro.mp3`) on leaving alive, both on the music bus. Banishing what the rite summoned plays `rite.resolve` (`sfx_boss_fight_won.mp3`), the fight won, on the music bus too. See [expedition.md](expedition.md#leaving-and-results).
- **Menu navigation:** `ui.nav` (`sfx_menu_nav.mp3`) plays on every move between pages off the expedition: the dashboard tabs, store, social, settings, the keys that switch them, and back/forward. The root layout (`src/routes/+layout.svelte`) plays it from `onNavigate`, so any new page gets it for free. It skips navigation into or out of `/play`, query-only changes, and a move a button press just started (within `PRESS_LEADS`, 300 ms), which already sounded as the press.
- **Button presses:** `ui.button` (`sfx_menu_button_click.mp3`) plays whenever a button is pressed, on any page: a `<button>` (not disabled) or `[role="button"]`, the `BUTTON` selector in `menus.ts`. Links don't, since they move between pages. The root layout catches every click on the window on the way down (`onclickcapture`), so new buttons get it for free. Only trusted clicks count, a mouse click or Enter/Space, so a page clicking a button itself makes no sound, and none while the pointer is locked underground. The controller's A clicks through code, so `menus.ts` raises `onMenuPress` for it instead.
- **Menu ticks (controller):** `ui.focus`, the navigation sound quieter, as the focus moves in a menu; `ui.step`, the same a little lower, as the right stick steps a value (the store's quantity); and `ui.hold`, the button press, when a button held in a menu presses its control (Launch, the store). The root layout plays them from `onMenuMove` and `onMenuHold` (see [controller.md](controller.md#menus)).
- **Fight music:** while the Affliction's manifestation is in the world, from the rite summoning it to its banishing, its `manifestation.music` loops on the music bus (the Gloaming's: `music.gloaming.fight`, `music_gloaming_boss_fight_start.mp3` cropped to the 34 s before its fade-out). It plays from its very start, the opening heard as written; its last 2 s crossfade into its first 2 s, and each pass after the first loops from 2 s in (`loopFrom: 0` in `scripts/audio.config.ts`, which writes `AUDIO_LOOP_STARTS`; `SoundBank.loop` passes it on as the source's `loopStart`). It comes in over 0.5 s and, once the manifestation is banished, fades out over 3 s with the figure, under the stinger. The `Affliction` play feature (`src/lib/game/play/affliction.svelte.ts`) drives it from each tick's manifestation `state`, so a player who joins mid-fight hears it too. Leaving the expedition fades it out. It sits at about -24 LUFS, under the manifestation's wind-up, which is the cue to dodge. See [affliction.md](affliction.md#client).
- **Surface ambience:** <a id="surface-ambience"></a>`ambience.dashboard` (`ambient_dashboard.mp3`, built as a seamless loop with a 2 s crossfade) is the bed under the dashboard and every other page off the expedition: settings, credits, sign-in. The root layout runs it as a `FadingLoop` (below). It plays on the ambience bus, so the Ambience and Master sliders turn it up or down as they move. Browsers keep a page silent until its first click, key or tap, so it waits for one (a controller press doesn't count), then fades in over 3 s. Going down into an expedition (`/play`) fades it out over 1.5 s and stops it. Coming back fades it in again.
- **Fading loops:** <a id="fading-loops"></a>`FadingLoop` (`src/lib/game/audio/FadingLoop.ts`) is a looped sound that fades in while it is wanted and fades out, then stops, when it isn't: `new FadingLoop(sounds, id, { in, out })`, then `setWanted(true | false)` as often as you like (repeats change nothing) and `allow()` once the page may make sound. A loop that finishes loading after it stopped being wanted is dropped. The fades are `SoundHandle.setVolume(value, seconds)`. The surface ambience and the fight music use it.
- **Panel toggle:** `ui.toggle` (`menu_click.wav`, quiet and higher), when the rite panel is hidden or shown underground (see [rite.md](rite.md#hiding-the-panel)). The admin free camera uses it too, as it starts or stops, moves your body to it or goes back to your body (see [map-generation.md](map-generation.md#debug-grid)).

### Mix

Every built file is peak-normalized (-1 dBFS), so how loud it sounds depends on the recording. The registry `volume` sets where it sits in the mix. `pnpm asset:levels` measures every sound: the file's loudness (EBU R128, LUFS) plus its `volume`, which is the level it plays at the source, before distance and the player's volume settings. It also lists the sounds that are still synthesized placeholders, and writes the levels to `src/lib/content/audio/levels.generated.ts` for the admin app's [Art & Assets page](admin.md#art-and-assets), which shows them beside each sound (and the placeholders, without running anything). Fit a new sound into these bands:

| Plays at (LUFS) | What                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| -17 to -19      | gunshots (the shotgun above the revolver), the creature attacking and dying                                       |
| -19 to -20      | music stingers (descent, return, a rare find)                                                                     |
| -20 to -23      | warnings and big moments: gasp, low battery, protection torn, entering water, the creature bursting out, rockfall |
| -24 to -27      | handling things: crates, reloads, bandaging, chalk, pickups and drops; your fast breathing                        |
| -27 to -30      | footsteps (yours and the creature's), slow breathing, swimming, ambience beds                                     |
| -30 to -35      | small clicks: the headlamp, menus, distant drips                                                                  |

Gameplay cues stay audible over the beds: a creature's steps are as loud as your own. A sound played at a position also falls off with distance (`REF_DISTANCE` 1.5 m to `MAX_DISTANCE` 60 m in `AudioManager.ts`), so world sounds can sit at the top of their band.

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

Applied by the server each tick (`server/systems/sanity.ts`; creature and Affliction blows in `creatures.ts` and `affliction.ts` there):

- **Attacks:** a creature's hit takes `attack.damage`, less what the shield of the item in the defense slot takes first (`absorbBlow`, see [items.md](items.md)).
- **Darkness:** `darknessDrain`/s while your lamp gives no light (off or flat) and other players' lamps put less than 0.02 on your eye.
- **Seeing:** `seeingDrain`/s while a creature is visible (`creatureLight` in its `visibleBand`), within `seeingRange`, inside your view cone (0.9 rad half-angle) and in line of sight.
- **God mode** (admin flag) ignores all of it.

At 0 the server sets `downed`. In the shared step, `stepDowned` keeps a downed player on the floor in crawl stance: they can look around and drag themselves along at `MOVEMENT.downedSpeed`, with no bandaging or items. They can still extract: `stepDowned` runs the same `updateExtraction` (hold interact, still, at an extraction point), and the HUD shows the climb-out prompt while downed. `downedTime` counts up, and at `bleedOut` (60 s) `dead` is set. The server then sends `died` and removes the player, like `extracted`. The expedition still ends when nobody is left.

**Surrender:** holding `climb` while downed counts `surrendering` up; at `SANITY.surrenderSeconds` (1 s) `dead` is set at once. `Session.down` sets `surrendering` to -1, which means the key has to be let go once first, so a key already held when going down (mid-climb) does not surrender. Both are in the shared step, so the client predicts them.

**Reviving:** the server keeps each player's last simulated input. While a player who isn't downed holds `interact` within `reviveRange` of a downed teammate and has salts (an item with `revive`) in a quick-use slot, `reviving` counts up. At `reviveSeconds` one is used and the teammate gets up with `reviveTo` sanity. If nobody else could help (solo, or everyone else is down too), a downed player with salts in a quick-use slot uses their own after 3 s. Salts in the backpack don't count.

**Bandages:** take one in the hand from the quick-use wheel and hold `attack`, standing still, with less than full sanity. `bandaging` counts up in the shared step (so it predicts), and at the item's `heal.seconds` one is used for `heal.amount`. Moving, letting go or switching what is in the hand resets it.

A bandage (or a battery) can go to a teammate instead: hold `aim` looking at them. See [items.md](items.md#using-items-on-a-teammate).

Bandages and smelling salts are quick-use items (see [items.md](items.md)); players bring them down in their loadout (see [economy.md](economy.md)).

**Client:**

- The HUD shows a vignette that darkens with lost sanity (and with the omens' gloom). It doesn't pulse: the heartbeat below 40% is heard, not shown.
- **Party panel** (`src/lib/ui/PartyHealth.svelte`, bottom-left): every explorer on the expedition, each with their gamer tag in small text above a health (sanity) bar and a stamina bar, and "Downed" when they are. Teammates come from `RemotePlayers.players()` (their tick snapshots, so it is the server's state) in a stable order; this player is always last, at the bottom, with slightly larger bars and the posture and headlamp battery (the headlamp key as a small keycap, the cells, then the voltage in small text) under them. Solo it is just you. It is always shown, even with the rite panel hidden.
- A hit (a drop of more than 3 in one frame) flashes red, plays `player.hurt` and shakes the camera, scaled by the **Camera shake** setting.
- `heartbeat` loops louder and faster below 40%; `whisper` plays near you below 20%.
- Downed, the camera tilts and `DownedScreen` shows the bleed-out bar, what happens next and the hold-to-surrender prompt.

## Admin tools

Admin tools are in the admin panel (F10) and need `PUBLIC_DEV_MODE` on the client. The server only accepts the commands when `DEV_MODE=true` (`server/config.ts`).

| Tool                       | Effect                                                                                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Noclip                     | Fly through walls; look direction steers (sprint doubles speed).                                                                                                                                                                        |
| Infinite stamina / battery | No drain.                                                                                                                                                                                                                               |
| Teleport                   | To the start room or any major room. Lands on the nearest clear spot with a floor (`findFreeSpot`).                                                                                                                                     |
| Regenerate                 | New map, from a given seed or a random one. Everyone respawns; flags are kept.                                                                                                                                                          |
| Map debug view             | Client-only orbit camera with flat lighting, for inspecting layouts.                                                                                                                                                                    |
| God mode                   | No sanity loss.                                                                                                                                                                                                                         |
| Set sanity                 | Sets your sanity (0 downs you; above 0 gets you up if downed).                                                                                                                                                                          |
| Creatures                  | Spawn one in front of you, remove all, show markers through walls (see creatures.md).                                                                                                                                                   |
| Gamer tags through walls   | Client only: teammates' tags drawn over the rock (still fading), to find them. See Gamer tags.                                                                                                                                          |
| Grip check (Items tab)     | Client only: a test explorer 2 m in front of you holding an item, posed to hold, fire, reload or use it (`GripCheck`, `src/lib/game/player/GripCheck.ts`). Step through every item with a `grip`, to check where each sits in the hand. |
