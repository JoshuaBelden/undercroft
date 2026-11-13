# Core systems

The Phase 0 foundations every feature builds on.

## Networking

The game server (`server/`) is authoritative. Clients send messages, the server owns state and broadcasts it. Solo play is a session with one player; there is no separate single-player path.

Flow:

1. Client opens a WebSocket to `PUBLIC_GAME_SERVER_URL`.
2. Client sends `hello` with `PROTOCOL_VERSION` and its ticket. A mismatch gets `reject`.
3. Server puts the connection in a party (the one it was in, if its place is still held) and replies `party` (sent again whenever the party changes) and `social` (friends and invites, see [social.md](social.md)). The Expedition page shows the party.
4. Everyone sends `ready`; after the countdown the server sends `welcome` to every member with their player ID, the session ID, the tick rate and the map layout.
5. Client sends `input` frames (fixed 60 Hz steps); server broadcasts `tick` at `TICK_RATE` (20 Hz) with every player's snapshot. See [player.md](player.md) for prediction, reconciliation and how other players are interpolated.
6. Client sends `ping` every second; `pong` gives round-trip time.
7. Dev only: client sends `admin` commands; server sends `map` when an admin regenerates the layout.

**Bandwidth.** Messages are JSON, compressed by the WebSocket's `permessage-deflate` (set up in `server/index.ts`). It keeps its dictionary between messages, and consecutive ticks are nearly identical, so a four-player tick of about 6 KB of JSON goes out as about 200 bytes: roughly 4 KB/s per client at 20 Hz. The cost is CPU on the game server and about 300 KB of memory per connection. A tick leaves `items` (the world items, about 3 KB) out while it hasn't changed since the last tick; the client keeps the last list. The full list goes out again whenever someone arrives or reconnects, or the map changes (`Session.itemsSent`). To see what a tick costs, compare `JSON.stringify` of a tick message with the same message deflated; per player, the inventory (about 400 bytes) and the weapon state are the largest parts.

**One connection for the whole site.** `src/lib/game/net/connection.svelte.ts` owns the single `GameClient`. The root layout calls `start()` on every signed-in page, and the connection stays open while moving between pages, so the party survives going to the Loadout page, the Store or the settings. It keeps the reactive `connection` state (`status`, `party`, `memberId`, `error`, `launchAt`, `social`, `search`, `welcome`) that the dashboard renders, and `/play` listens in with `subscribe()` for the messages of the expedition (`tick`, `map`, the results). The root layout goes to `/play` whenever `connection.welcome` is set.

`GameClient` reconnects every 2 seconds after a drop, and a player who dropped takes their place back, in the party and underground (see [expedition.md](expedition.md#reconnection)). Parties and the expedition lifecycle are in [expedition.md](expedition.md).

**Adding a message:** add it to `ClientMessage` or `ServerMessage` in `protocol.ts`, add its `type` to the matching allowed set, handle it in `server/index.ts`, `parties.ts` or `session.ts`, and in the client.

## Rendering

`Engine` owns the renderer, scene, camera and frame loop. Register per-frame work with `engine.onUpdate(fn)`; it returns an unsubscribe function. Call `dispose()` on teardown.

**Graphics settings:** `engine.applyGraphics(settings.graphics)` applies FOV, brightness (tone-mapping exposure), quality (pixel ratio, shadows, shadow map size), the render resolution (`renderScale`, 0.5 to 1, multiplying the quality's pixel ratio) and the frame rate limit (`frameCap`: 30, 60 or 0 for none; the frame loop skips screen refreshes until the next frame is due). Call it again when the settings change.

**Light budget:** `LIGHT_BUDGET` caps active dynamic lights (ambient excluded). The stats overlay shows the count and turns red when over budget. Every candle, headlamp, torch and glow stick counts. Short flashes borrow a light that already exists rather than adding one: a gunshot lights the shooter's headlamp (see [items.md](items.md#client)).

## Input

Code never reads raw keys. Every input is an action in `actions.ts`:

```ts
toggleHelp: { label: 'Help', category: 'Interface', defaults: ['F1'] }
```

Bindings use `KeyboardEvent.code` (layout-independent) and `Mouse0`..`Mouse4`. Mouse buttons count as game input only while the pointer is captured, so clicks on menus and text fields are left alone. Bindings persist in settings.

- `input.isDown(action)` for held input.
- `input.onPressed(fn)` for presses; returns an unsubscribe function.
- `input.consumeLook()` returns mouse movement since the last call while the pointer is locked (mouse look is an axis, not an action).

**Tab** is a game key only in the game view (`/play`): there `src/routes/+layout.svelte` stops it moving the browser's focus (in the capture phase, so dialogs can't let it through), and the input map treats it as any other key. By default it is the `inventory` action, the pack. Everywhere else (the dashboard, settings, account, the sign-in pages) Tab moves between buttons and fields as usual, and no page binds `inventory`.

**Adding an action:** add it to `ACTIONS`. It appears in the settings controls list automatically. Use `{action:name}` in help text to show the player's binding.

## Audio

All sound goes through `AudioManager`. Categories: `master`, `music`, `ambience`, `sfx`. Each category is a gain bus feeding master; volumes come from settings. After master, an output stage applies two settings: mono (`accessibility.monoAudio`, a gain node mixing down to one channel, which both speakers then play) and muting while the game is in the background (`sound.muteInBackground`: tab hidden or window not focused). Every page has its own manager, so `applyAudioOptions()` re-applies both to all live managers. The settings screen calls it, and so do focus and visibility changes.

```ts
audio.play('/assets/audio/drip.ogg', { category: 'ambience', loop: true });
```

Browsers block audio until a user gesture; the game view calls `audio.unlock()` on the first click.

Game sounds are registered by id in `src/lib/content/audio/sounds.ts` and played through `SoundBank` (`sounds.play(id)`, `sounds.loop(id)`). A sound is a built recording (`pnpm asset:audio`) with a synthesized fallback; see [player.md](player.md#audio). Positional audio is added in Phase 1.

## Settings

`settings` is a persisted `$state` object in `settings.svelte.ts`. Groups: `audio` (volumes), `sound` (mute in background), `bindings`, `interface`, `controls` (mouse sensitivity, aiming sensitivity, invert Y), `graphics` (view, FOV, brightness, quality, camera shake, fullscreen, render resolution, frame rate limit) and `accessibility` (subtitles and sound captions, caption size, reduce flashing, toggle sprint and aim, mono audio; see [player.md](player.md#subtitles-and-sound-captions)), plus `profile` (the player name shown to the party). Change a value, then call `saveSettings()`. New keys merge in automatically; bump `SETTINGS_VERSION` only if an existing key changes meaning (this resets saved settings).

**The settings screen** is `src/lib/ui/Settings.svelte`, built on `TabScreen.svelte` (the admin screen uses the same one). A `TabScreen` fills the window: a top bar whose tabs are the groups (here Account, Audio, Graphics, Mouse, Accessibility, Interface, Controls) and a Back button, the selected group's title, then that group's fields in a container that scrolls on its own, so the screen never grows past the window. It styles the field classes for everything inside it: `setting` (a row: pill, then `hint`), `pill` (`name` left, `value` right; a `button.pill` is an action, a `label.pill` with a text input is an entry), and its `actions` and `footer` snippets add bar buttons and a footer.

- **On the dashboard** it is the `/settings` page (`src/routes/settings/`), outside the `(hub)` group so it replaces the dashboard's bar. Back (or the `toggleSettings` key) returns to the page you came from.
- **In `/play`** (underground) it is laid over the game with the `dim` prop, opened by `toggleSettings`. It is not a navigation there, so the game keeps running behind it. The page passes `onvolume`, `ongraphics` and `onaccount` so changes apply at once.

Every setting is a pill (`--setting-width`, 400px) with its name on the left and its value on the right, and no value needs the keyboard except the gamer tag. Two components draw them:

- `SliderField` for numbers: the pill itself is the slider, filled up to the value.
- `StepperField` for choices and on/off: `<` and `>` either side of the value step through the options and wrap round.

An optional `hint` is shown beside the pill.

**Adding a setting:** add it to `Settings` and `defaults()`, then render a `SliderField` or `StepperField` for it in its group in `Settings.svelte`. Keep the label short enough for the pill and put the explanation in `hint`.

## Fullscreen

`src/lib/ui/fullscreen.svelte.ts` puts the whole site in fullscreen: it is `document.documentElement` that goes fullscreen, not one page's element, so it lasts across every move between pages, the expedition included (pointer lock works inside it).

- **The key:** the `toggleFullscreen` action (F11 by default, the browser's own fullscreen key, which the input map takes from the browser). The root layout listens for it once, through an `InputMap` limited to that action, so no page has to.
- **The setting:** Display (Fullscreen / Windowed) at the top of the Graphics group does the same. `settings.graphics.fullscreen` remembers the choice. Browsers only allow fullscreen from a click or a key, so a saved choice is taken up again on the first click or key after the page loads (`watchFullscreen`, called by the root layout).
- **Escape:** while fullscreen, Chromium browsers lock the Escape key to the page (the keyboard lock API), so it still opens and closes the settings; holding it leaves fullscreen. Elsewhere Escape leaves fullscreen at once, as the browser decides. Leaving fullscreen any way the browser offers is remembered as windowed.
- `fullscreen.active` is reactive, for anything that shows the current state.

## Dialogs

`src/lib/ui/Dialog.svelte` is the one dialog for questions and confirmations anywhere in the game: rounded, with a header (the title), the content, and a footer of commands. Buttons put in the footer are drawn as pills; give the one that carries out the action `class="primary"`.

```svelte
{#if asking}
	<Dialog title="Reset to defaults" onclose={() => (asking = false)}>
		<p>Every setting goes back to how it was.</p>
		{#snippet footer()}
			<button type="button" onclick={() => (asking = false)}>Cancel</button>
			<button type="button" class="primary" onclick={reset}>Reset</button>
		{/snippet}
	</Dialog>
{/if}
```

Render it only while it should be open. It is a native modal `<dialog>`: focus stays inside it, the page behind cannot be clicked, and Escape calls `onclose`. Key presses inside it do not reach the `InputMap`, so Escape closes the dialog and not the screen under it. The settings screen's "Reset to defaults" is the first use.

## Slots

`src/lib/ui/Slot.svelte` is the one slot of the game: a 92px square with rounded corners that holds one thing. `name` is what is in it (`null` draws a grey question mark, for something not known yet) and `count` shows from 2 up. `size="large"` is twice as wide and tall (two slots and the gap between them: the weapon slots). A screen can make its slots smaller by setting the `--slot-size` CSS variable on an ancestor. `empty` draws nothing but an optional `hint` of what the slot is for. `image` is a picture id in `static/assets/ui/images`, shown instead of the name, and `detail` is small print in the bottom-left corner (rounds loaded). `mark` is a small icon in that corner, before the `detail`: what kind of thing it is. `slotMark(item)` (in `src/lib/ui/items.ts`) gives the filter icon for quest items, weapons, defense and treasure, and nothing for the rest; `ItemSlot` and the store pass it. The icons are `FILTER_ICONS`, shared with `ItemFilters`. `rarity` colours the left and bottom edge, 2px, for anything better than common (the `--rarity-*` colours in `src/app.css`); `ItemSlot` passes it from the item. `quest` makes that edge purple instead, and the mark with it, for a quest item (see [items.md](items.md#quest-items)). A screen that recolours a slot's border (hover, selection, drop targets) sets `--slot-border` on it, never `border-color`, so the rarity edge stays. Use it wherever a thing sits in a place of its own, so slots look the same on every screen; change the look there, not per screen. The Afflictions page's rite requirements use it as it is.

### Item slots

The browser's own context menu is turned off on every page (`src/routes/+layout.svelte` cancels `contextmenu` on the window), so the alternate click only ever opens the game's menus.

Slots that things are dragged between (the Loadout page, the pack screen) are built from these pieces:

- `ItemBoard` (`itemBoard.svelte.ts`): one per screen. It holds what is being dragged, which slot the tooltip is for, the open menu and the question being asked, and turns what the player does into `InventoryAction`s. Give it `belongings` (what the slots show), `act` (send a request) and, where they apply, `sell`, `locked`, `price` and `confirmDrop`.
- `ItemSlot`: a `Slot` in a button. Takes the `board`, its `SlotRef`, the `stack` and a `label` to read out. Dragging, dropping (slots that would take the dragged thing are marked in dark blue, the one under the cursor is lit, the rest dim), shift-click, the context menu (also the keyboard's menu key) and the tooltip (hover or focus) all report to the board.
- `ItemFilters`: the column of round category buttons beside a grid of items. Bind its `filter` (`ItemFilter`: `all`, a category, `ammo` or `treasure`) and filter the grid with `matchesFilter`. Ammunition and treasure are in the `other` category for slotting but are listed under their own filters, not under Other. The stash and the store use it.
- `ItemOverlays`: put one beside the slots. It draws the board's `ItemTooltip`, `ItemMenu` and dialogs.
- `LoadoutPanel`: an `Inventory` as EQUIPMENT, BACKPACK and QUICK USE, in a row.
- `CarriedWeight`: what an inventory weighs against the most that can be carried ("3.3 / 30 kg"), in the accent colour once it is enough to slow you. It sits beside the title of the loadout and of the pack screen.

`ItemTooltip` can be used on its own: give it a `stack` and the `DOMRect` of what it describes. It sits to the right of that, or to the left when there is no room, and shows the picture, name, flavor and the figures from `itemStats` (`src/lib/ui/items.ts`): only those that apply to the item. `QuantityDialog` asks how many (a slider), with the total when there is a price.

To add a menu entry, add it to `ItemBoard.entries` and handle it in `choose`.

## Help system

Help topics are data in `src/lib/content/help/index.ts`:

```ts
{ id: 'headlamp', title: 'Headlamp', category: 'Surviving', body: 'Press {action:headlamp} to...' }
```

Blank lines separate paragraphs, and a paragraph whose lines all start with `- ` is a list. `{action:name}` shows the player's current binding as a key cap (`KeyCap`), or "unbound". `category` is one of `HELP_CATEGORIES` (Getting started, Expeditions, The surface, Moving, Surviving, Gear and loot, The Gloaming, Settings). Each is a tab of the help screen, with its topics in the order they appear in the file.

`HelpScreen.svelte` is a full-window `TabScreen`, like the settings: a tab per section, with the section's articles as plain text in one readable column. It opens with F1 (`toggleHelp`) or the ? button on the dashboard, and over the game view underground (darkened, `dim`). New players start on Getting started: "Your first descent" and "Keys". Add topics for each feature as it ships, and keep both of those up to date when the first steps or the main keys change.

## Admin and dev mode

`devMode` (`src/lib/dev.ts`) is true on the dev server or when `PUBLIC_DEV_MODE=true`. `AdminPanel` (F10) renders nothing unless `devMode` is true. Gate every debug tool the same way.

**The admin screen** is a `TabScreen` laid like settings, one group per area: Session (connection, IDs, stats overlay), Map (seed, regenerate, debug view), Player (cheat toggles, sanity, teleport to rooms), Items (give, refill ammo, reset crates), Affliction (meter, force manifestation, banish), Rite, Creatures and Account (surface grants). It reopens on the group last used. To add a tool, put it in its group in `AdminPanel.svelte` with the same fields: `StepperField` for on/off, the `action` snippet for a command, a `form.setting` with a `label.pill` input and a submit button for a value.

- **Leaving it:** a move key (`moveForward`, `moveBack`, `moveLeft`, `moveRight`, `climb`, `stance`) closes it and captures the mouse again, so a change can be tried at once. Esc only closes it; Esc again opens settings. Esc can't capture the mouse (browsers don't count it as a user gesture), so click or move to carry on. `InputMap` passes Esc through even from a text field.

Player commands are sent to the server, which only accepts them when its own `DEV_MODE=true` (see [player.md](player.md)).

## Typefaces

The interface uses the same typefaces as the Apostate project: the Barlow family and Cinzel, loaded from Google Fonts in `src/routes/+layout.svelte`. They are named by tokens in `src/app.css`, and components use the tokens, never a family name:

| Token            | Typeface              | Used for                                      |
| ---------------- | --------------------- | --------------------------------------------- |
| `--font-display` | Barlow Condensed      | Headings, the coin count                      |
| `--font-body`    | Barlow Semi Condensed | Running text (the default)                    |
| `--font-ui`      | Barlow                | Buttons, inputs, tabs, HUD labels and prompts |
| `--font-lore`    | Cinzel                | The title, room banners, results and downed   |
| `--font-mono`    | system monospace      | Key caps, the stats overlay                   |

To change a typeface, change the token and the font link together.
