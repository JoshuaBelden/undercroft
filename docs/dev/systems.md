# Core systems

The Phase 0 foundations every feature builds on.

## Networking

The game server (`server/`) is authoritative. Clients send messages, the server owns state and broadcasts it. Solo play is a session with one player; there is no separate single-player path.

Flow:

1. Client opens a WebSocket to `PUBLIC_GAME_SERVER_URL`.
2. Client sends `hello` with `PROTOCOL_VERSION`. A mismatch gets `reject`.
3. Server replies `welcome` with player and session IDs, the tick rate, and the map layout.
4. Server broadcasts `tick` at `TICK_RATE` (20 Hz).
5. Client sends `ping` every second; `pong` gives round-trip time.

`GameClient` reconnects every 2 seconds after a drop. In Phase 0 every connection joins one shared session; Phase 1 introduces per-expedition sessions.

**Adding a message:** add it to `ClientMessage` or `ServerMessage` in `protocol.ts`, add its `type` to the matching allowed set, handle it in `server/index.ts` or `session.ts`, and in the client.

## Rendering

`Engine` owns the renderer, scene, camera and frame loop. Register per-frame work with `engine.onUpdate(fn)`; it returns an unsubscribe function. Call `dispose()` on teardown.

**Light budget:** `LIGHT_BUDGET` caps active dynamic lights (ambient excluded). The stats overlay shows the count and turns red when over budget. Every candle, headlamp, torch and glow stick counts.

## Input

Code never reads raw keys. Every input is an action in `actions.ts`:

```ts
toggleHelp: { label: 'Help', category: 'Interface', defaults: ['F1'] }
```

Bindings use `KeyboardEvent.code` (layout-independent) and `Mouse0`..`Mouse4`. Bindings persist in settings.

- `input.isDown(action)` for held input.
- `input.onPressed(fn)` for presses; returns an unsubscribe function.

**Adding an action:** add it to `ACTIONS`. It appears in the settings controls list automatically. Use `{action:name}` in help text to show the player's binding.

## Audio

All sound goes through `AudioManager`. Categories: `master`, `music`, `ambience`, `sfx`. Each category is a gain bus feeding master; volumes come from settings.

```ts
audio.play('/assets/audio/drip.ogg', { category: 'ambience', loop: true });
```

Browsers block audio until a user gesture; the game view calls `audio.unlock()` on the first pointer press. Positional audio is added in Phase 1.

## Settings

`settings` is a persisted `$state` object in `settings.svelte.ts`. Change a value, then call `saveSettings()`. New keys merge in automatically; bump `SETTINGS_VERSION` only if an existing key changes meaning (this resets saved settings).

**Adding a setting:** add it to `Settings` and `defaults()`, then add a control in `SettingsMenu.svelte`.

## Help system

Help topics are data in `src/lib/content/help/index.ts`:

```ts
{ id: 'headlamp', title: 'Headlamp', category: 'Light', body: 'Press {action:headlamp} to...' }
```

Blank lines separate paragraphs. `{action:name}` renders the current binding. `HelpPanel` lists topics; open it with F1 or from the main menu. Each phase adds topics for what it ships.

## Admin and dev mode

`devMode` (`src/lib/dev.ts`) is true on the dev server or when `PUBLIC_DEV_MODE=true`. `AdminPanel` (F10) renders nothing unless `devMode` is true. Gate every debug tool the same way.

Current tools: connection, session and player IDs; stats overlay toggle (F3).
