# The game view: the play page and its features

Underground, the client is one page, `src/routes/play/+page.svelte`. It owns what every part of the game shares: the engine and the camera (first person, over the shoulder, spectating, the dev map view and free camera), the map, the HUD, the screens over the game (menu, map, crate, settings, help, admin), the input and the results.

What each feature shows and plays down there is a **feature** in `src/lib/game/play/`, one file per feature. The page reaches it only through hooks. It is the client side of the server's systems ([session.md](session.md)). A new feature adds a file there and a line in `src/lib/game/play/index.ts`. It doesn't add `case`s to the page.

## Files

| File                                     | What                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/routes/play/+page.svelte`           | The page: engine, camera, map loading, HUD, screens, input, results, spectating            |
| `src/lib/game/play/feature.ts`           | `PlayFeature` (the hooks), `PlayContext` (what features get), `PlayUi`, `Prompt`, `Aim`    |
| `src/lib/game/play/index.ts`             | `createFeatures`: every feature, by name, in the order their hooks run                     |
| `src/lib/game/play/prompt.ts`            | `keyPrompt`: a HUD prompt with the action's key as a keycap                                |
| `src/lib/game/play/vitals.ts`            | Heartbeat, hurt shake, whispers, battery and bandage sounds; heal, battery, revive prompts |
| `src/lib/game/play/combat.ts`            | Shots, swings, throws and hits: sound, recoil, rumble, flashes and impacts                 |
| `src/lib/game/play/pack.ts`              | Items on the floor and in flight; picking up and dropping                                  |
| `src/lib/game/play/crates.svelte.ts`     | Loot crates and corpses: searching, the crate screen's state                               |
| `src/lib/game/play/doors.ts`             | Doors between levels                                                                       |
| `src/lib/game/play/marks.svelte.ts`      | Chalk marks: the chalk wheel, the label, drawing and rubbing out                           |
| `src/lib/game/play/ropes.ts`             | Hanging and laid ropes, climbing and rope prompts, falls                                   |
| `src/lib/game/play/survey.svelte.ts`     | Your map: what is drawn, the notebook, the map screen's view                               |
| `src/lib/game/play/rite.svelte.ts`       | What is known of the rite, who carries what, performing it, its banners                    |
| `src/lib/game/play/affliction.svelte.ts` | The manifestation, meter, omens and their ambience, the clock, the strobe                  |

A feature owns its renderers (`Marks`, `Crates`, `HangingRopes`... in `src/lib/game/`) and any state the page's template shows. A file with `$state` fields is a `.svelte.ts`, and the template reads them off `features` (`features.marks.wheel`, `features.rite.known`).

## Hooks

`PlayFeature`, all optional:

| Hook                        | When                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `mapLoaded(layout, world)`  | A map was built from the server's layout. The player already has the new collision world. |
| `restore()`                 | The page opened on an expedition already under way: catch up from `connection`.           |
| `message(message)`          | Any server message but `tick`. Check `ui.inWorld` before showing anything of the world.   |
| `tick(tick)`                | A tick, while in the world, before its events.                                            |
| `event(event)`              | Each of a tick's events, to every feature.                                                |
| `target(state, aim, taken)` | What interact would take (below).                                                         |
| `self(state, delta)`        | Every frame with your own state, before the HUD is put together.                          |
| `update(delta)`             | Every frame, once the camera is placed.                                                   |
| `left()`                    | Your part is over: dead and watching, or back on the surface. Forget what was about you.  |
| `clear()`                   | Back on the surface: drop everything that belonged to the expedition.                     |
| `dispose()`                 | The page is going away.                                                                   |

A feature gets a `PlayContext`: the engine, the canvas, input, audio and sounds, the connection's client, your `LocalPlayer`, the other players, the map renderer, the creatures, the view model, your head and headlamp, and `ui`. `ui` is the page's own state as features need it: whether you are in the world, playing, down, which screen is open (features may set it, as the crate does), `banner()`, `capture()` and `roomTitleAt()`.

## What interact takes

Every frame the page asks each feature's `target` in turn, in `index.ts` order, with your aim. The first to claim it has it, and the rest are told it is `taken`. The order matches the server: a floor item, then a crate, a door, your own chalk mark. Each feature keeps what it aimed at and highlights it.

## Prompts

`heldPrompt` in the page decides which prompt the HUD shows when more than one could, as one chain of feature prompts in order: the notebook, climbing, bandaging and batteries and reviving, the rite, extracting, a crate, a floor item, a door, your mark or chalk, rope gear. A feature's prompt returns null when it has nothing to say. A new prompt is a method on its feature and one line in that chain, where it belongs.

## Adding a feature

1. Write `src/lib/game/play/<feature>.ts` (`.svelte.ts` if the template shows its state): a class implementing `PlayFeature`, constructed with the `PlayContext`. Add its renderers to `ctx.engine.scene` in the constructor and dispose of them in `dispose`.
2. Add it to `createFeatures` in `src/lib/game/play/index.ts`.
3. Its sounds go in `src/lib/content/audio/sounds.ts`, played through `ctx.sounds`.
4. A prompt: a line in `heldPrompt`. A screen or overlay: a block in the page's template reading the feature's state.
