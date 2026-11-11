# Core systems

The Phase 0 foundations every feature builds on.

## Networking

The game server (`server/`) is authoritative. Clients send messages, the server owns state and broadcasts it. Solo play is a session with one player; there is no separate single-player path.

Flow:

1. Client opens a WebSocket to `PUBLIC_GAME_SERVER_URL`.
2. Client sends `hello` with `PROTOCOL_VERSION`, its name and optionally a party invite code. A mismatch gets `reject`.
3. Server puts the connection in a party and replies `party` (sent again whenever the party changes). The client shows the lobby.
4. The party leader sends `descend`. Server replies `welcome` to every member with their player ID, the session ID, the tick rate and the map layout.
5. Client sends `input` frames (fixed 60 Hz steps); server broadcasts `tick` at `TICK_RATE` (20 Hz) with every player's snapshot. See [player.md](player.md) for prediction, reconciliation and how other players are interpolated.
6. Client sends `ping` every second; `pong` gives round-trip time.
7. Dev only: client sends `admin` commands; server sends `map` when an admin regenerates the layout.

`GameClient` reconnects every 2 seconds after a drop, and a player who dropped while underground takes their place back (see [expedition.md](expedition.md#reconnection)). Parties and the expedition lifecycle are in [expedition.md](expedition.md).

**Adding a message:** add it to `ClientMessage` or `ServerMessage` in `protocol.ts`, add its `type` to the matching allowed set, handle it in `server/index.ts`, `parties.ts` or `session.ts`, and in the client.

## Rendering

`Engine` owns the renderer, scene, camera and frame loop. Register per-frame work with `engine.onUpdate(fn)`; it returns an unsubscribe function. Call `dispose()` on teardown.

**Graphics settings:** `engine.applyGraphics(settings.graphics)` applies FOV, brightness (tone-mapping exposure) and quality (pixel ratio, shadows, shadow map size). Call it again when the settings change.

**Light budget:** `LIGHT_BUDGET` caps active dynamic lights (ambient excluded). The stats overlay shows the count and turns red when over budget. Every candle, headlamp, torch and glow stick counts.

## Input

Code never reads raw keys. Every input is an action in `actions.ts`:

```ts
toggleHelp: { label: 'Help', category: 'Interface', defaults: ['F1'] }
```

Bindings use `KeyboardEvent.code` (layout-independent) and `Mouse0`..`Mouse4`. Mouse buttons count as game input only while the pointer is captured, so clicks on menus and text fields are left alone. Bindings persist in settings.

- `input.isDown(action)` for held input.
- `input.onPressed(fn)` for presses; returns an unsubscribe function.
- `input.consumeLook()` returns mouse movement since the last call while the pointer is locked (mouse look is an axis, not an action).

**Adding an action:** add it to `ACTIONS`. It appears in the settings controls list automatically. Use `{action:name}` in help text to show the player's binding.

## Audio

All sound goes through `AudioManager`. Categories: `master`, `music`, `ambience`, `sfx`. Each category is a gain bus feeding master; volumes come from settings.

```ts
audio.play('/assets/audio/drip.ogg', { category: 'ambience', loop: true });
```

Browsers block audio until a user gesture; the game view calls `audio.unlock()` on the first click.

Game sounds are registered by id in `src/lib/content/audio/sounds.ts` and played through `SoundBank` (`sounds.play(id)`, `sounds.loop(id)`). A sound is a built recording (`pnpm asset:audio`) with a synthesized fallback; see [player.md](player.md#audio). Positional audio is added in Phase 1.

## Settings

`settings` is a persisted `$state` object in `settings.svelte.ts`. Groups: `audio`, `bindings`, `interface`, `controls` (mouse sensitivity, invert Y), `graphics` (FOV, brightness, quality, camera shake) and `accessibility` (subtitles and sound captions, caption size; see [player.md](player.md#subtitles-and-sound-captions)), plus `profile` (the player name shown to the party). Change a value, then call `saveSettings()`. New keys merge in automatically; bump `SETTINGS_VERSION` only if an existing key changes meaning (this resets saved settings).

**Adding a setting:** add it to `Settings` and `defaults()`, then add a control in `SettingsMenu.svelte`.

## Help system

Help topics are data in `src/lib/content/help/index.ts`:

```ts
{ id: 'headlamp', title: 'Headlamp', category: 'Light', body: 'Press {action:headlamp} to...' }
```

Blank lines separate paragraphs. `{action:name}` renders the current binding. `HelpPanel` lists topics; open it with F1 or from the main menu. Each phase adds topics for what it ships.

## Admin and dev mode

`devMode` (`src/lib/dev.ts`) is true on the dev server or when `PUBLIC_DEV_MODE=true`. `AdminPanel` (F10) renders nothing unless `devMode` is true. Gate every debug tool the same way.

Current tools: connection, session and player IDs; stats overlay toggle (F3); map seed and regenerate; map debug view; noclip, infinite stamina and battery, and teleport to rooms. Player commands are sent to the server, which only accepts them when its own `DEV_MODE=true` (see [player.md](player.md)).
