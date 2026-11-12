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
      rng.ts                seeded PRNG (deterministic on server and client)
      player/               player state types, fixed-step simulation, headlamp output
      map/                  map types, grid math, layout generator, piece manifest, nav grid
      creature/             creature snapshot type, half-light visibility
      affliction/           Affliction snapshot type
      items/                inventory helpers, weapon step, pickup rule, item/event types
    game/
      Engine.ts             Three.js renderer, scene, camera, frame loop, stats, light budget
      assets.ts             glTF model loading and cache, asset path registry
      map/MapRenderer.ts    places map pieces from a layout
      player/               local player prediction, headlamp light, remote players, player audio
      creatures/            creature models, animation, half-light fade, sounds
      affliction/           the manifestation (the figure) renderer
      items/                viewmodel (held item), world items, muzzle flash and impacts
      input/
        actions.ts          action definitions and default bindings
        InputMap.ts         raw input -> actions
      audio/
        AudioManager.ts     Web Audio buses and playback
        captions.svelte.ts  sound caption feed and direction
      net/
        GameClient.ts       WebSocket client, reconnect, RTT
    settings/
      settings.svelte.ts    persisted player settings ($state)
    account/
      account.svelte.ts     the signed-in account on the client, API helper
    server/                 SvelteKit server only
      db.ts                 MongoDB connection
      session.ts            session cookie
      store/accounts.ts     accounts, sessions, tickets, explorers (also used by the game server)
      store/explorers.ts    stash and loadout; descent and return (also used by the game server)
      store/shop.ts         buying, selling, admin grants, the ledger
    content/
      help/index.ts         player help topics
      map/kit.ts            map piece roles and weights
      player/movement.ts    movement and stamina tuning
      player/sanity.ts      sanity, downed and revive tuning
      creatures.ts          creature definitions
      afflictions.ts        Affliction definitions: meter, omen stages, manifestation
      items.ts              item definitions (weapons, ammo, consumables)
      carry.ts              backpacks and how weight slows you
      loot.ts               loot tables: what crates hold by rarity and depth; crate tuning
      economy.ts            shop stock, prices, sell-back
      loadout.ts            what lies around the map (bricks)
      items/headlamps.ts    headlamp models
      audio/                sound registry and footstep surfaces
    ui/                     Svelte components (Panel, Dialog, Slot, menus, overlays)
  hooks.server.ts           finds the account for each request; everything is behind sign-in
  routes/
    (hub)/                  dashboard: frame (+layout) and a page per tab
      +page.svelte          Expedition: the party, the Affliction, launch
      loadout/ afflictions/ store/ social/
    play/+page.svelte       expedition: the game view (client-only)
    auth/                   sign-in and sign-up pages
    api/                    JSON endpoints: auth, account, ticket, explorer, shop, admin (dev)
server/
  index.ts                  WebSocket server entry
  accounts.ts               who a connection is, from the ticket in its hello
  belongings.ts             loadouts taken down at descent, belongings given back after
  session.ts                Session: authoritative state and tick loop, sanity, revives
  creatures.ts              CreatureDirector: creature AI, damage, noise
  combat.ts                 resolves shots, swings, throws and drops
  affliction.ts             AfflictionDirector: meter, omens, manifestation, banishing
  rite.ts                   RiteDirector: clues, the rite room, performing; places rite items
  progress.ts               rite progress per player, kept across expeditions (MongoDB)
  items.ts                  WorldItems: items in the map, pickups, thrown items
  crates.ts                 Crates: what loot crates hold, revealing it, who has one open
  config.ts                 environment
  db.ts                     MongoDB connection
  log.ts                    logging
scripts/
  make-dev-asset.ts         generates the placeholder dev asset
  build-assets.ts           optimizes Blender exports, writes the piece manifest
  blender/kit.py            builds the catacomb kit pieces inside Blender
  blender/items.py          builds the item models inside Blender
  blender/props.py          builds the loot crate and adds crate markers inside Blender
static/assets/              models, textures, audio served at /assets
art/                        raw art sources (gitignored except README)
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
