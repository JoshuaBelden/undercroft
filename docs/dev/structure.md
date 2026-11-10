# Project structure

```
src/
  env.ts                    client environment variable definitions
  app.css                   global styles and color tokens
  lib/
    dev.ts                  devMode flag (gates admin tools)
    shared/                 code shared by client and server
      constants.ts          protocol version, tick rate, ports
      protocol.ts           WebSocket message types, encode/decode
    game/
      Engine.ts             Three.js renderer, scene, camera, frame loop, stats, light budget
      assets.ts             glTF model loading and cache, asset path registry
      input/
        actions.ts          action definitions and default bindings
        InputMap.ts         raw input -> actions
      audio/
        AudioManager.ts     Web Audio buses and playback
      net/
        GameClient.ts       WebSocket client, reconnect, RTT
    settings/
      settings.svelte.ts    persisted player settings ($state)
    content/
      help/index.ts         player help topics
    ui/                     Svelte components (Panel, menus, overlays)
  routes/
    +page.svelte            main menu
    play/+page.svelte       game view (client-only)
server/
  index.ts                  WebSocket server entry
  session.ts                Session: authoritative state and tick loop
  config.ts                 environment
  db.ts                     MongoDB connection
  log.ts                    logging
scripts/
  make-dev-asset.ts         generates the placeholder dev asset
static/assets/              models, textures, audio served at /assets
```

## Imports

SvelteKit 3 resolves `#lib/*` to `src/lib/*` using Node subpath imports. Include the file extension:

```ts
import { Engine } from '#lib/game/Engine.ts';
import { settings } from '#lib/settings/settings.svelte.ts';
import Panel from '#lib/ui/Panel.svelte';
```

The server cannot use `#lib`-only SvelteKit features. It imports shared code by relative path: `../src/lib/shared/protocol.ts`. Keep `src/lib/shared/` free of browser, Svelte, and SvelteKit imports.

## Where things go

- New message types: `src/lib/shared/protocol.ts` (update both the union and the allowed type set).
- New game data (items, rooms, Afflictions): `src/lib/content/`.
- New player settings: `src/lib/settings/settings.svelte.ts`.
- New inputs: `src/lib/game/input/actions.ts`.
