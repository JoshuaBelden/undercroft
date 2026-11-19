# Rope: climbing, laying, tying, and the drops

Rope does three things. You **climb** it: the ropes in the ways out, and any rope tied at an anchor. You **lay** it along the floor as you walk, to find the way back. You **tie** it at the top of a drop that is too far to climb down or jump, so the whole party can climb down and back up. Climbing is player movement in the shared simulation. Laying and tying are the server's, like chalk marks. Falls that hurt, and the hobble they leave, came with it (see [player.md](player.md#falls-and-conditions)).

## Files

| File                                 | What                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `src/lib/content/player/movement.ts` | `CLIMB` (reach, speeds, stamina, gap between climbers), `FALL`                                              |
| `src/lib/content/rope.ts`            | `ROPE` (laying, gathering, tying), `ANCHOR` (where a tied rope hangs)                                       |
| `src/lib/content/items.ts`           | `RopeSpec`, the `rope-pack` and `rope-bundle` items                                                         |
| `src/lib/shared/player/climb.ts`     | `ropeToGrab`, `grabRope`, `stepClimb`, `letGo`: climbing in the simulation                                  |
| `src/lib/shared/map/collision.ts`    | `RopeLine` and `Anchor` in the `CollisionWorld`, from `rope-*` / `anchor-*`                                 |
| `src/lib/shared/items/rope.ts`       | `ropeAction` (tie, untie, gather), `applyTied`, `tiedRopeLine`, `ropeNeeded`                                |
| `server/ropes.ts`                    | `Ropes`: the expedition's laid and tied ropes                                                               |
| `server/systems/ropes.ts`            | `RopeSystem`: `simulated` (attack starts laying; grabs and let-gos), `step` (laying, and the interact hold) |
| `server/session.ts`                  | `falls`                                                                                                     |
| `src/lib/game/map/HangingRopes.ts`   | Hanging ropes: a verlet chain each, skinned with a tube, pinned by climbers                                 |
| `src/lib/game/items/LaidRopes.ts`    | Laid ropes: tubes along the floor, a heap at each end                                                       |
| `src/lib/game/player/RopeCreaks.ts`  | Other climbers' ropes creaking (your own: `PlayerAudio.updateRope`)                                         |
| `scripts/blender/kit.py`             | `rope_anchor`, `rope_post`, `build_drop_hall`, `build_pit`                                                  |

## Ropes in the world

A `RopeLine` hangs straight down from `top` to the floor at `bottom`. It is climbable from the floor at its foot. When it has a `landing`, the ledge it hangs from, it can also be got onto from there, and a climber reaching the top hauls over onto it. An extraction rope has `exitY`: a climber whose feet get that high is out of the catacomb.

- **The map's ropes:** a `rope-<n>` empty in a piece marks the top of a rope, with custom properties `length` (m it hangs) and optionally `exit` (how far up it you get out). `buildCollisionWorld` turns them into `map-<n>` lines. The extraction room at the end of the first two levels, `extraction-gate`, has one up its shaft: `kit.ropes_for_extractions` swapped its modelled rope and `extract-0` for it in the hand-edited .blend (as it did for the retired `extraction-shaft`), and `kit.remove_extraction_ladders` took out its ladder. The Gloaming Chapel's ladder is the one hold-interact extract left.
- **The start rope:** see [below](#the-start-rope).
- **Tied ropes:** an `anchor-<n>` empty is where a rope can be tied. It sits on the ledge floor at the edge, turned about Z only, with its local +Y out over the drop. `buildCollisionWorld` works out an `Anchor`:
  - `top`: `ANCHOR.overhang` out (just past the lip; the tie point is on the edge) and `ANCHOR.height` up: as high as a climber's hands reach. The line climbed hangs straight down from there.
  - `knot` and `lip`, for drawing: the knot `ANCHOR.post.knot` up the post, which stands `ANCHOR.post.side` to the anchor's left looking out (where `kit.rope_post` puts it), and where the rope goes over the edge.
  - `landing`: `ANCHOR.stand` back, on the ledge.
  - `bottom`: the floor straight below, found with `floorHeightAt` no deeper than `ANCHOR.deepest`.

  A rope tied there is the line `tiedRopeLine(anchor)`, id `tied-<anchor id>`. `applyTied` puts the tied ones into `world.ropes`. The server does it on every change, and the client does it on every `ropes` message, so prediction can climb them too.

## The start rope

The start room's way down is a rope tied for good on the pit's lip: an `anchor-<n>` with a `rope` property (m). `buildCollisionWorld` makes it one of the map's ropes (`map-<n>`) with the anchor's `landing`, `knot` and `lip`, not an `Anchor`, so nobody ties or unties anything there. Its `bottom` is the rope's length below its top: where a climber's feet are at its end. When that is above the floor below, it is `hangsFree`:

- Climbing down past its end lets go (`stepClimb`): the drop is short of hurting (the Angel's Well: 1.7 m, `WELL_FOOT_DROP`; a fall hurts from about 2.2 m, `FALL.safeSpeed`).
- It can't be grabbed from the floor (`ropeToGrab`): its end is out of reach, so there is no climbing back up.
- It is drawn down to the hands of a climber at its end (`ropeEnd` in `HangingRopes.ts`, 1.75 m above `bottom`), with no heap of rope below it.

## Climbing

It runs in `stepPlayer` (`climb.ts`), so the client predicts it and the server decides. Tuning is `CLIMB`.

- **Grab:** a fresh press of `interact` (E / X) beside a rope, within `CLIMB.reach`, looking at it (within `CLIMB.facing`). Facing matters at a tied rope's post: looking out over the drop, a press goes over the edge; with your back to it, holding interact unties it (`ropeAction`). A press that took hold of a rope picks nothing up. You can grab:
  - from the floor at its foot (feet within `grabFromFloor` of it);
  - from its landing (feet within `grabFromTop`), which starts you `topDrop` below the ledge.

  Never on your own: it is a press (`interactKey`), so a held key doesn't grab again on stepping off. The climber hangs `CLIMB.hold` beside the rope. On a rope down a drop that is always the side away from the ledge, so the body stays clear of the rock face. On other ropes it is the side they came from.

- **On the rope:** forward climbs up (`upSpeed`), back climbs down (`downSpeed`), scaled by the push. With sprint held, up is `fastUpSpeed` (draining `fastUpDrain`) and down is a slide, `slideSpeed`. It costs stamina: `upDrain` (or `fastUpDrain`), `downDrain`, and `hangDrain`, a crawl, while hanging still. Nothing comes back while you are on a rope. A full 12 m climb up costs about 84 of 100 at the normal pace, about 113 at the fast one. Spent, the hands give out and you drop. Stance (C / B) lets go on purpose: `LocalPlayer` turns a stance press on a rope into `InputFrame.letGo` for one frame, and never changes stance there. Hands and weapons are out of use (`canUseHands`).
- **Nobody climbs past anyone:** `stepPlayer` takes `others`, the feet of everyone else on a rope. A climber stops `CLIMB.gap` short of the nearest one above or below, and can't grab where someone already hangs. The server builds `others` each step (`climbersBesides`). The client builds it from the latest snapshots (`LocalPlayer.setClimbers`), and the server corrects any misprediction.
- **Off the rope:**
  - At the foot, going down: you step off onto the floor.
  - At a landing, going up: you haul over onto it (a mantle).
  - At `exitY`: you are extracted.
  - A rope that disappears (untied from above): you fall.
- **Events:** `grab` and `letgo` (sim) become the `ropeGrab` and `ropeLetGo` game events, which are heard. Climbing makes noise, `hear.walk` while moving (`noiseRadius`).

## Laying rope

Rope packs (`rope-pack`, 100 m, sold for 50) and rope bundles (`rope-bundle`, 40 m, rare in crates, not sold) carry `rope: { length }`: how far it lays, and whether it reaches the bottom of a drop. Both are quick-use, one to a slot. **A rope item is used whole:** laying it or tying it spends the pack or bundle however much of it went down, and gathering it up or untying it gives back the same item (`LaidRopeSnapshot.item`, `TiedRopeSnapshot.item`). A stack keeps no metres.

- **Start:** with rope in the hand, a press of attack calls `RopeSystem.startLaying`. That starts a laid rope at your feet (`Ropes.start`) and remembers the hand slot it came from (`layingFrom`).
- **Paying out, while attack is held:** `stepRopes` → `stepLaying`, server-side, never from client points. Every `ROPE.spacing` m walked, it adds a point on the floor (`floorHeightAt`), up to the item's `length`.
- **Stop** (`stopLaying`): letting go of attack, the item's length all laid, anything that takes the hands (`canUseHands`: climbing, swimming, downed, a crate), or the rope leaving the hand. The rope stays where it lies, and the item it came from is used up (`useUpRope`: from that slot, or wherever they now carry one). Let go before a single point was laid, and nothing was laid and nothing is spent.
- **No physics:** a laid rope crosses and bunches over itself where it was walked.
- **Sending it:** new points go out each tick as `ropeGrow`. Starting, stopping, gathering, tying and untying send the whole list (`ropes { laid, tied }`), as do welcome, reconnect, regenerate and admin clear.
- **Limit:** past `ROPE.max` ropes in an expedition, the oldest is gone.

## Interact: tie, untie, gather

`ropeAction` (shared) says what holding interact does where you stand, and the server counts `PlayerState.roping` toward it. Like the other holds, it never counts while a crate, mark, rite, extraction or door hold is going. Changing target starts it over.

| Where                                     | With                          | Does                                                                        |
| ----------------------------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| At an anchor's landing, nothing tied      | rope, `length` ≥ `ropeNeeded` | `tieSeconds`: ties it, using up the whole item                              |
| At an anchor's landing, nothing tied      | rope, too short               | Nothing ("Not enough rope: this drop needs N m")                            |
| At an anchor's landing, a rope tied there | anything                      | `tieSeconds`: unties it, the item back to you; never while someone is on it |
| Within `pickupReach` of a laid rope       | anything                      | `pickupSeconds`: gathers it up, the item back to you                        |

`ropeNeeded` is the drop plus `ROPE.knot`. Rope given back goes in the pack, or at your feet if it won't fit. Tying and untying are heard (`ROPE.noise`).

## Rope drops

`drop-hall` (a gallery 12 m up a tall hall) and `pit` (a 12 m shaft in a chamber floor) are `descends: true, needsRope: true` connectors, 4 levels tall. You come in at the top (level 3) and the way on is at the foot (level 0). Each has an `anchor-0` with a post beside it, and crates at the foot. At `CLIMB.downSpeed` the 12 m takes about 18 s.

They are never on the main route. After the side branches, the generator hangs `ropeDrops` (1) of them off any opening still free, each with a `dropBranch` of connectors on at its foot. That pass draws from its own RNG stream, so adding drops left the rest of every map as it was. The nav grid can't step down 12 m, so everything below a drop is off the grid: creatures don't go there, and rite items are never put there (`Crates.stow` uses only crates you can walk to). See [map-generation.md](map-generation.md#algorithm).

## Rendering

- **Hanging ropes** (`HangingRopes`): one verlet chain per `RopeLine`, a point every 0.25 m down to the floor (exactly the drop: a longer chain is squashed against the floor and kinks), `ITERATIONS` constraint passes at 60 Hz. The top is pinned. Each climber holds the point nearest their hands, kept where it hangs at rest, so the rope stays straight above them. Sway is meant to be slight: heavy `DAMPING`, a small `JOLT` when someone takes hold or lets go, and `STRAIGHTEN` drawing every point back under the top. It is skinned as a tube with a fixed index buffer and positions rewritten each frame. A tied rope (`RopeLine.knot` and `lip`, from its `Anchor`) hangs from just over the lip, and its lead (from the knot on the post, along the ledge floor and over the edge) is a fixed tube, so it looks tied on. Ropes cast no shadows: a strand this thin a step from a lamp threw one onto the stone that looked like a second rope. A `rope_bundle` heap lies at the foot. The play page calls `sync(world)` whenever ropes change, and `update(delta, climbers)` each frame.
- **Laid ropes** (`LaidRopes`): a `TubeGeometry` along a centripetal Catmull-Rom curve through the points. Each point is nudged sideways by a seeded amount, so everyone sees the same rope, and lifted by the rope's radius. It is drawn in pieces of 40 points, and as it grows only the last piece is rebuilt. Heaps lie at both ends.
- **Material:** both share `ropeMaterial()`, a hemp colour with diagonal strands drawn on a canvas (map and bump). No lights, so nothing counts against the light budget: rope is lit only by lamps.

## Audio

| Sound                         | When                                                             |
| ----------------------------- | ---------------------------------------------------------------- |
| `rope.tension`                | Every 0.5 m anyone climbs (`sfx_rope_tension.mp3`)               |
| `rope.grab`                   | Taking hold (the tension recording, higher)                      |
| `rope.letgo`                  | Letting go or slipping off (synth)                               |
| `rope.tie`                    | Tying, untying, gathering up (`sfx_rope_tying.mp3`, first 3.5 s) |
| `rope.payout`                 | Every 2 m laid (synth)                                           |
| `fall.land`, `fall.land.hard` | A fall that hurt (synth)                                         |
| `condition.hobble`            | Your own hobbling fall (the exertion grunts)                     |

## Body animation

`rope_idle` (`Rope_Hang_Idle`) and `rope_climb` (`Climb_Up_Rope`) loop. Climbing down plays `rope_climb` backwards: `PlayerBody` sets its rate to the climbing speed, negative going down. `fall` (`Climb_Attempt_and_Fall_5`) plays once while falling fast, and for a moment after a fall that hobbles.

## Admin

In the admin panel (dev mode):

- **Items:** Give `rope-pack` or `rope-bundle`; "Clear ropes" (`clearRopes`) takes up every rope, laid and tied, and anyone on one falls.
- **Player:** "Clear conditions" (`clearConditions`) takes off a hobble.
- God mode takes no fall damage and no hobble. Infinite stamina climbs without tiring.

## Adding a rope or a drop

- **A rope to climb in a piece:** a `rope-<n>` empty at its top, with `length` (and `exit` for a way out). Use `kit.rope_anchor`. Leave room beside it (`CLIMB.hold` + the body's radius) on the side players come from.
- **A rope tied for good** (like the start room's): an `anchor-<n>` with a `rope` property, its post beside it. Make it end in the air, short of a drop that hurts, to make a way down that can't be climbed back up.
- **A drop:** build the piece with its way in at the top level and its way on at the foot, and an `anchor-<n>` at the edge (`kit.rope_post` adds the anchor and its post). The post sits to one side, so the landing is clear. Then give it `descends: true, needsRope: true` in `MAP_KIT`.
