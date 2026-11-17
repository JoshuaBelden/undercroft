# Run Diagnostics

**Run diagnostics** (in the account menu, under Report a bug) is a benchmark players run on their own machine. It walks a camera through the same map at each quality preset, measures every frame, and offers to send the numbers. They are filed on GitHub like a bug report, labelled `diagnostics`. It's how we measure low-end devices (an iPad, an old laptop) without having one on the desk. Issue #3 used it to decide on KTX2 textures and LODs.

## Files

| File                                     | What                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `src/lib/content/diagnostics.ts`         | `BENCHMARK`: the seed, the stages, timings, pace, party spacing, creatures |
| `src/lib/shared/diagnostics.ts`          | `BenchmarkResult`; frame statistics, refresh estimate, checking, Markdown  |
| `src/lib/game/benchmark/Benchmark.ts`    | `runBenchmark`: builds the scene, runs the stages, measures                |
| `src/lib/game/benchmark/route.ts`        | The walk: nav-grid paths from the spawn through the rooms; `pointAlong`    |
| `src/lib/game/benchmark/device.ts`       | WebGL limits, compressed texture families, texture memory estimate         |
| `src/lib/game/benchmark/state.svelte.ts` | `openDiagnostics` / `closeDiagnostics`                                     |
| `src/lib/ui/Diagnostics.svelte`          | The intro, the full-screen run, the results and Send                       |

## What it runs

Everything happens in the browser. There is no game server, no expedition, and nothing is saved. The map is generated client-side from `BENCHMARK.seed` with the shared generator, just as the server would. It's never game state, so the "map generation is server-side" rule isn't involved.

The scene is built from the game's own parts, so it costs what play costs:

- the map through `MapRenderer` (the same chunked merge);
- your headlamp on the camera (`Headlamp`), shadows per preset;
- teammates through the real `RemotePlayers`, fed made-up snapshots each frame: explorer bodies, walking animations, and their shadow-casting lamps;
- creatures (the first in `CREATURES`) standing on the route, idling;
- the same near-black ambient light as underground.

The camera walks `benchmarkRoute`: A\* paths on the creatures' nav grid from the spawn through each start, major and extraction room in build order, with every door open. It never goes through a wall, and it's the same route every run. It looks a few metres ahead along the path and turns smoothly, so the nav grid's zigzag doesn't shake the view.

**Stages** (`BENCHMARK.stages`): Low, Medium and High alone, then each again with a party of four. The party stages split what a full party costs: Low with a party has four lamps but no shadows, Medium has the shadows on fewer pixels, High has both. (Results sent before the party stages were split only have High with a party.) Each stage applies its preset through `Engine.applyGraphics` with render scale 1, no frame cap and a 75° field of view (the player's brightness is kept). It settles for `warmup` seconds while shaders compile and shadow maps resize, then measures for `seconds`. Every stage walks the same stretch from the same starting point, so stages compare with each other, and runs on different machines compare too.

**Measured per stage:** average fps, the 1% low (the frame rate of the slowest 1% of frames), average, 95th percentile and worst frame time, and draw calls, triangles and lights per frame (`renderer.info`, shadow passes included). **Per run:** load time, the scene's textures and their estimated GPU memory (each image once, RGBA8 with mipmaps), geometries, WebGL 1 or 2, the max texture size, the compressed texture families the GPU takes (`astc`, `etc2`, `s3tc`, `bptc`...: what a KTX2/Basis texture would be transcoded to), CPU cores and device memory when the browser says, the canvas size and pixel ratio, and the screen's refresh rate.

**The refresh rate matters.** Browsers draw at most once per screen refresh, so a stage at 60 fps on a 60 Hz iPad is capped, not maxed out. `estimateRefresh` reads it from the fastest frames. Look at the 1% low and the p95 to see headroom.

The run stops if the player cancels (Escape, or B on a controller), if the page is hidden (drawing pauses), or if the WebGL context is lost (that last one is a result worth knowing: the GPU ran out of memory). Afterwards the context is released with `forceContextLoss`, because Safari allows only a few live ones.

## Sending

**Send** posts a `ReportInput` with `benchmark` to `/api/report` (see [reports.md](reports.md)). It goes through the same throttle and storage as a bug report. The title is `Diagnostics: <GPU>`; the description is the player's optional note, which may be empty only on a diagnostics report. The server checks the result with `cleanBenchmark`, so every number must be finite and in range and every string is capped. The GitHub issue body starts with `benchmarkMarkdown` (a table per stage and the device facts), then the usual Diagnostics details block. Its labels are `REPORT.diagnosticsLabels` (`diagnostics`, `from-game`), not `bug`. The admin app's Bug reports page marks it **Diagnostics** and shows the same table.

To read results: `gh issue list --label diagnostics`.

## What we learned

The first runs came from an iPad (Safari, Apple GPU, 8 cores, 1590×1160 at 2×, 120 Hz screen): issues #72 and #73. They decided [#3](https://github.com/JoshuaBelden/undercroft/issues/3).

| Stage (#73)           | FPS | Frame time |
| --------------------- | --- | ---------- |
| Low                   | 117 | 8.5 ms     |
| Medium                | 85  | 11.8 ms    |
| High                  | 68  | 14.8 ms    |
| Low, party of four    | 92  | 10.9 ms    |
| Medium, party of four | 56  | 17.9 ms    |
| High, party of four   | 44  | 22.5 ms    |

- **The cost is lighting and pixels, not assets.** Three teammates' lamps cost about 2.4 ms without shadows (Low) and about 6 ms with them (Medium): roughly 4 ms is their shadow passes, which double the triangles drawn (138k to 240k). Medium to High (1.8 times the pixels) costs about 3 ms. That's why the **Teammate lamp shadows** setting exists ([player.md](player.md#teammate-shadows)).
- **KTX2 textures: not now.** The scene's 29 textures take about 155 MB uncompressed. The context was never lost, and the map loads in 0.8 s. The GPU takes ASTC, ETC2 and BPTC, so KTX2 (Basis, transcoded to those) stays an easy option if a weaker device shows memory trouble: lost contexts, or stutter as textures upload.
- **LODs: no.** 110k to 240k triangles and about 300 draws a frame is light for the GPU, and the catacombs' tight passages leave little far enough away for a simpler model to help. The heaviest items (`rope_bundle` 29k, `bandage` 23k) could take a stronger simplify pass if triangles ever matter.
- **A freeze when teammates first appear.** One frame of about 0.6 s landed in the first party stage in both runs: in High with a party in #72, and in Low with a party in #73. It's likely every material recompiling for the new light count, finished late by Safari. In play, that could hit when someone joins or reconnects mid-expedition. Not fixed yet.

The iPad is a modern tablet, not a low-end machine. A run on old integrated graphics is the next thing worth having.

## Extending it

- **A stage:** add it to `BENCHMARK.stages` (a quality and a party size). The run's length (`BENCHMARK_SECONDS`) and the UI follow.
- **A measurement:** add the field to `BenchmarkStageResult` or `BenchmarkResult`, fill it in `runBenchmark`, check it in `cleanBenchmark` (the server refuses results it can't read), and add it to `benchmarkMarkdown`. Older reports in the database won't have it.
- **What's in the scene:** build it in `runBenchmark` from the game's own classes, so it costs what the game costs.
- **Changing `seed`, `speed` or `stages`** makes new results incomparable with older ones. Say so in the commit.

## Admin and testing

- Unit tests: `src/lib/shared/diagnostics.test.ts` (statistics, refresh, checking, the table), `src/lib/game/benchmark/route.test.ts` (the route on the benchmark map) and `src/lib/server/store/reports.test.ts` (diagnostics reports).
- Without `GITHUB_TOKEN` (development), a sent result stays `pending` and shows in the admin app's Bug reports page, which is the quickest way to see one end to end.
- No settings, key bindings or sounds of its own: it uses no game actions. Escape and the controller's B close it like any dialog, and its buttons sound like every other menu button.
