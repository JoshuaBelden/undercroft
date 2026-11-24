# The explorer's map

Each explorer draws their own map, in a surveyor's notebook carried in the pack. It starts blank. Standing still with the map open and holding Sketch draws what is around them; standing next to a teammate and holding Show copies each map into the other. Nobody else's walking changes your map. The design discussion is [#51](https://github.com/JoshuaBelden/undercroft/issues/51).

The decisions behind it:

- **Earned:** no notebook, no map. It is an item (`notebook`, 35 coin in the store) taking a backpack slot and weight, lost with everything else on death.
- **Drawn by hand:** walking uncovers nothing. A sketch takes `SURVEY.sketchSeconds` standing still, is heard (`SURVEY.sketchNoise`) and leaves you exposed (nothing pauses).
- **Your own:** each player's map is theirs. Showing it to a teammate close by (`SURVEY.shareRange`, both with notebooks) merges the two, both ways.
- **No live teammates** on the map: you know where they were when they showed you theirs.
- **The surveyor** (a friendly creature, [creatures.md](creatures.md#the-surveyor-friendly-wanders-invulnerable)) wanders the catacombs, and everywhere he has been is in his map. Holding interact on him draws it into yours once (`SurveySystem.reveal`), notebook or not.
- It is the Map tab of the in-game menu, beside Pack and Rite ([#102](https://github.com/JoshuaBelden/undercroft/issues/102)).

## Files

| File                                 | What                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `src/lib/content/map/survey.ts`      | `SURVEY` tuning: sketch and show times, reach, noise, range, the screen's zoom                   |
| `src/lib/content/map/kit.ts`         | `sketch` on a kit entry: the symbol a piece gets (`water`, `crawl`, `squeeze`)                   |
| `src/lib/content/items.ts`           | `notebook`, with `survey: true`                                                                  |
| `src/lib/shared/map/survey.ts`       | `surveyMap` (what a map can show), `sketchCells` (what one sketch draws), `carriesSurvey`        |
| `server/survey.ts`                   | `Surveys`: the cells each player has drawn                                                       |
| `server/systems/survey.ts`           | `SurveySystem`: `step` (the holds), `sketch`, `partner`, `show`, `send`; admin commands          |
| `src/lib/ui/MapPane.svelte`          | The Map tab: the page, zoom and pan, the Sketch and Show holds                                   |
| `src/lib/ui/MapTools.svelte`         | Its buttons in the menu's header: Up, the level, Down, Find me                                   |
| `src/lib/ui/mapView.svelte.ts`       | `MapView`: where the page looks (level, centre, zoom, following you), shared by the two          |
| `src/lib/ui/mapSketch.ts`            | Drawing the page on a canvas                                                                     |
| `src/routes/play/+page.svelte`       | Opening it (`toggleMap`: the menu on its Map tab)                                                |
| `src/lib/game/play/survey.svelte.ts` | The `survey` message, the notebook, the screen's view of you (`screenView`) ([play.md](play.md)) |

## What a map can show (`surveyMap`)

The map works on the layout's grid: 4 m cells, one level every 4 m (see [map-generation.md](map-generation.md#coordinates)). `surveyMap(layout, PIECES, MAP_KIT)` runs the same on the server and the client, from the layout both already have, so only the cells drawn ever go over the wire.

- **Cells:** every cell a piece fills (caps fill none), with the piece it belongs to and whether it is in a room (start, major, extraction, or a connector with `room: true`).
- **Sides:** each side of a cell is `open` (more of the same piece), `way` (a way through: the pieces on both sides have a socket there) or `wall`. A cap has a socket too, but caps aren't counted, so a capped opening is a wall. A dead end is walked into (its bricks lie there), so the opening into one is a way.
- **Next:** where you can walk from a cell: across an `open` or `way` side, or up and down within one piece (a stair). Every cell can be reached from the start (tested).
- **Features:** a stair (a `descends` piece, or the `descent` long stair between levels) gets `down` on its top level and `up` on its bottom one; an extraction room gets `extraction`; a kit entry's `sketch` puts that symbol on it. **Rooms:** a piece with a `title` is named on the map.

## Sketching (`sketchCells`)

1. The player holds Sketch on the map screen. The client sends `survey: 'sketch'` in every input frame while it is held (`LocalPlayer.survey`); the map screen's panel stops movement, so they stand still.
2. Each tick, `stepSurvey` counts `PlayerState.sketching` up while they hold it, can use their hands (`canUseHands`), carry a notebook (`carriesSurvey`) and move slower than `SURVEY.stillSpeed`. Anything else sets it back to 0.
3. At `SURVEY.sketchSeconds`, `sketchCells` works out what goes down: only what they can see. The cell they stand in (`cellAt`: halfway down a stair either level will do), then out from it through the ways and across their own piece. A cell only goes down if its middle, at about eye height, is no more than `SURVEY.sketchRange` metres from the eye and the segment to it is clear (`segmentBlocked`). Nothing is reached through a cell that didn't go down. So a corner or a pillar stops the pencil, even in the room they stand in, and a long passage is drawn only as far as the range.
4. The cells are added to their map (`Surveys.draw`), they are sent `{ type: 'survey', cells }`, a `sketch` event plays the pencil (heard by the others near), and creatures hear it (`SURVEY.sketchNoise`).
5. `sketching` stays at -1 until the hold is let go, so holding on doesn't sketch again.

## Showing a map

Holding Show (`survey: 'share'`) counts `PlayerState.sharing` the same way, while `mapPartner` finds a teammate: the nearest other player within `SURVEY.shareRange`, on their feet, with a notebook of their own. At `SURVEY.shareSeconds`, `Surveys.share` puts each map's cells in the other, both are sent their map, and a `showMap` event turns the pages. Teammates' inventories aren't in the tick, so the screen offers the nearest teammate on their feet and the server decides; without a notebook their hold just doesn't fill.

## On the wire

`{ type: 'survey', cells: [x, z, level][] }`: the player's whole map, sent to them after `welcome` (on a reconnect too), whenever it grows, and empty after an admin regenerates the map (`build` starts every map over). Maps change rarely, so they cost nothing per tick. `PlayerState.sketching` and `sharing` are in the tick, for the screen's progress.

Known gap: the client has the whole layout ([#35](https://github.com/JoshuaBelden/undercroft/issues/35)), so the blank page only hides the map on screen.

## The screen

The map is the **Map tab** of the in-game menu (`GameMenu`, see [items.md](items.md#the-in-game-menu)), between Pack and Rite, shown only with a notebook in the pack. The `map` action (M) opens the menu on it (`toggleMap`), and puts the menu away when the Map tab is already showing; the tab pill, or LB/RB, get there from the other tabs. Without a notebook M does nothing but the HUD saying "No notebook to draw a map in" for a moment. Close (a pill at the bottom right of the menu), B, the pack key or going down put it away. Each time the tab shows, a fresh `MapView` opens it on your level, centred on you, and it follows you until the page is dragged. `map.open` and `map.close` play as the tab comes and goes (`mapShowing` in the play page). On the Map tab you stand still (the movement keys don't walk, as they do on the other tabs: sketching needs you still), and `Survey.open` lets the feature work out your place on the page each frame.

The tab's own buttons are pills in the middle of the menu's header (`MapTools`): Up, the level, Down and Find me. The page and the Sketch and Show holds are the tab's pane (`MapPane`); the menu is as big as the map while it shows.

- **Page:** `drawSketch` (`mapSketch.ts`) draws on a canvas, north up: squared paper, the floor washed in, then the walls in pencil that wobbles the same way every time (seeded by position). Passages are 2 m wide down the middle of their cells; rooms fill theirs. A way into a cell not drawn yet trails off as a short stub. Symbols: stair treads with an arrow and "to level N", a ladder in a ring for the way out, waves for water, "crawl", and a pinch for a squeeze. Room names, chalk marks in drawn cells (their strokes, from `MARK_SYMBOLS`), you as a red arrowhead, and a compass.
- **Levels** are numbered for players from 1 at the start (`levelNumber`). One at a time; PageUp/PageDown or the Up and Down buttons in the header (on a controller, LB/RB switch the menu's tabs: the D-pad reaches the buttons).
- **Zoom:** the wheel over the page, `mapZoomIn`/`mapZoomOut` (keys and the triggers), between `SURVEY.zoom.min` and `max` pixels per metre. The last zoom is kept (`settings.interface.mapZoom`). **Pan:** drag the page, or the right stick. Find me brings it back to you.
- **Holds:** Sketch and Show are pill buttons held with the mouse, or with `sketchMap` and `showMap` (E and R), or X and Y on a controller (the menu's `holding`, while the Map tab shows; see [controller.md](controller.md#menus)). Whichever is down is sent to the server; the buttons fill as `sketching` and `sharing` come back.

## Sounds

`map.open` and `map.close` (the notebook), `map.sketch` (the pencil: your own in your hands, others' where they stand; the `sfx_scribble` recording, `map.scribble`) and `map.show` (pages), in `src/lib/content/audio/sounds.ts`. The others are not recorded yet (silent).

## Admin

In the admin panel's Map group (dev mode only): **Reveal whole map** draws every cell into your map (`revealMap`) and **Clear map** empties it (`clearMap`).

## Extending it

- **A new symbol:** add it to `SketchSymbol` (`src/lib/shared/map/types.ts`), set `sketch` on the kit entries that get it, and draw it in `symbol()` in `mapSketch.ts`.
- **Tuning:** `SURVEY` in `src/lib/content/map/survey.ts`.
- **Later ideas** from the discussion: sanity smudging the map, Afflictions acting on it (as data), needing light to read it, rope laying out a route (#29).
