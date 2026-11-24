# Controllers

Xbox, PlayStation and Steam controllers play the game through the same actions as the keyboard and mouse. Any controller the browser reports with the standard layout (`Gamepad.mapping === 'standard'`) works. Other controllers are ignored: players who have one fix it with their system's or Steam Input's own mapping, never in the game.

Keyboard, mouse and controller all work at the same time, as in most PC games. Whichever was used last decides the button icons in prompts and help, and whether the cursor shows.

## Status

| Part                                | What                                                                                                                                             | State |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 1. The controller plays the game    | Reading controllers, analog move and look, creeping and sprint, wheels, playing without the mouse captured, icons, rumble, settings, admin, help | Done  |
| 2. The controller drives every menu | Focus navigation on every screen, item slots, dialogs, the dashboard pages                                                                       | Done  |

## Files

| File                                  | What                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/lib/game/input/gamepad.ts`       | Reads controllers each frame: buttons, sticks, presses; rumble                          |
| `src/lib/game/input/device.svelte.ts` | `device`, the last device used (reactive); the bindings to show for it                  |
| `src/lib/game/input/actions.ts`       | `PAD_DEFAULTS`, `defaultPadBindings()`, labels for controller buttons                   |
| `src/lib/game/input/InputMap.ts`      | Controller buttons as actions, beside keys and mouse buttons; the sticks                |
| `src/lib/game/input/menus.ts`         | Menus: `menu()`, focus moved by the D-pad and stick, A/B/X/Y, tabs, scrolling, holds    |
| `src/lib/game/input/repeat.ts`        | Held directions in menus repeating, and the right stick stepping a value (tested)       |
| `src/lib/game/input/hold.ts`          | `HOLD_TIME`; a menu hold told from a quick press (unit tested)                          |
| `src/lib/game/input/hints.svelte.ts`  | Which menu has the controller, and the hold under way, for the icons (reactive)         |
| `src/lib/ui/ButtonHint.svelte`        | A shortcut's button inside the control it presses; the slide that fills for a hold      |
| `src/lib/ui/ItemSlot.svelte`          | Item slots with a controller: carry, send, the item menu (`ItemBoard.carry`)            |
| `src/lib/ui/crateFocus.ts`            | Where the focus goes once X has sent an item out of a crate (`CrateFocus`)              |
| `src/lib/settings/settings.svelte.ts` | `padBindings` and the `controller` group                                                |
| `src/lib/game/player/LocalPlayer.ts`  | Analog movement, creeping on a light push, toggle sprint, stick look, the wheel pointer |
| `src/lib/content/rumble.ts`           | Rumble effects (data)                                                                   |
| `src/lib/ui/KeyCap.svelte`            | A binding on screen: a keycap, or a controller button in the current icon set           |
| `src/lib/ui/Settings.svelte`          | The Controller tab; controller buttons in the Controls list                             |
| `src/lib/ui/AdminPanel.svelte`        | The Controller group (dev)                                                              |
| `src/routes/+layout.svelte`           | Starts reading controllers, once for the whole site                                     |
| `src/routes/play/+page.svelte`        | Playing without the mouse captured, rumble, the disconnect notice                       |

## Reading controllers

The Gamepad API has no button events: the state has to be read every frame. `gamepad.ts` does that in its own `requestAnimationFrame` loop, started once by the root layout, so it runs on the dashboard as well as underground.

- **Standard layout only.** Pads whose `mapping` isn't `'standard'` are skipped.
- **Every controller drives the one player.** Co-op is online, so a browser has one player. The buttons of all connected controllers are merged, and the last one pressed picks the icons.
- **Only while the window has focus** (`document.hasFocus()`), as the keyboard already behaves.
- **Dead zone:** radial, `settings.controller.deadZone` (15% by default). Inside it a stick reads 0; past it, the value is rescaled to start from 0.
- **Triggers** (LT/RT) are analog: they count as pressed past `TRIGGER_PRESS`.
- **The left stick also presses the move actions.** A direction counts as pressed while that axis is past `STICK_PRESS`, so everything that reacts to a move key (walking away from a crate closes it, moving leaves the admin screen) also reacts to the stick. Not while a menu is open: there the stick moves the focus, and B closes the crate or the admin screen. So in the in-game menu, where the keyboard can still walk, a controller stands still.
- **Dialogs:** while a modal `<dialog>` is open, controller presses don't reach the `InputMap`. Key presses don't either (`Dialog.svelte` stops them).
- **Menus:** while a menu is open, the buttons it moves with don't reach the `InputMap` (see [Menus](#menus)).

## The last device used

`device` (`device.svelte.ts`, reactive) is kept up to date by `gamepad.ts`:

- **Controller:** any button pressed, or a stick or trigger past its dead zone.
- **Keyboard and mouse:** any key, click or wheel, or the mouse moving more than a few pixels (a bumped desk doesn't switch).

It decides the icons in prompts and help and, underground, whether the game needs the mouse captured (see below).

**Disconnects.** When the last controller goes while it was the device in use, a "Controller disconnected" notice shows until a controller connects or the keyboard or mouse is used. The icons go back to the keyboard. The server can't pause a co-op game, so the player simply stops: no stick, no movement.

## Bindings

A controller binding is a code, like a key's `KeyboardEvent.code`:

| Code                                   | Button (Xbox / PlayStation)               |
| -------------------------------------- | ----------------------------------------- |
| `PadA` `PadB` `PadX` `PadY`            | A B X Y / Cross Circle Square Triangle    |
| `PadLB` `PadRB`                        | LB RB / L1 R1                             |
| `PadLT` `PadRT`                        | LT RT / L2 R2                             |
| `PadView` `PadMenu`                    | View Menu / Create Options                |
| `PadL3` `PadR3`                        | Stick clicks                              |
| `PadUp` `PadDown` `PadLeft` `PadRight` | D-pad                                     |
| `PadStickUp` `PadStickDown` ...        | Left stick pushed that way (move actions) |

These are the 17 standard buttons less the guide button, which the system keeps. The PlayStation touchpad and the Steam Deck's back grips aren't bound: every supported controller plays the same in every browser.

Controller bindings are their own settings group, `settings.padBindings` (action -> codes), not part of `settings.bindings`. The defaults are `PAD_DEFAULTS`, below `ACTIONS` in `actions.ts`. The layout is fixed until the keybinding screen (post beta) can change it; the Controls tab lists it. Since players can't change it yet, a saved layout is only an older one: loading settings always takes `PAD_DEFAULTS` (`load` in `settings.svelte.ts`), so a new button for an existing action (R3 for Social) reaches everyone. When the keybinding screen arrives, load the saved one again, with a way to bring new defaults to players who never changed theirs.

| Button     | Action                                                    | Button      | Action                        |
| ---------- | --------------------------------------------------------- | ----------- | ----------------------------- |
| Left stick | Move (a light push creeps)                                | Right stick | Look; points at an open wheel |
| L3         | Sprint (toggle, or hold: a setting)                       | R3          | Rite panel; Social            |
| A          | Climb / swim up / surrender (hold)                        | RT          | Attack / fire / use / throw   |
| B          | Stance (tap / hold to creep); swim down; let go of a rope | LT          | Aim (hold)                    |
| X          | Interact / grab a rope / revive (hold)                    | LB          | Quick-use wheel (hold)        |
| Y          | Other weapon                                              | RB          | Reload                        |
| D-pad up   | Headlamp (tap: on/off, hold 1 s: low/bright)              | D-pad down  | (free)                        |
| D-pad left | (free)                                                    | D-pad right | Help                          |
| View       | Pack and rite (the in-game menu)                          | Menu        | Settings                      |

R3 is the rite panel underground (hide or show it, see [rite.md](rite.md#hiding-the-panel)) and Social on the dashboard (see the dashboard's shortcuts below). The two never listen at once, so they share the button.

No controller button: choosing primary or secondary directly (Y swaps the two), fullscreen (browsers only allow it from a click or a key), performance stats and the admin panel. Their prompts and help show the keyboard key even while the controller is in use.

## Moving and looking

- **Analog movement.** The left stick fills `InputFrame.moveX`/`moveZ` with its value (-1..1). The server already clamps them to that range and only normalises a wish longer than 1, so half a push walks at half speed. No protocol or server change.
- **A light push creeps.** Below `CREEP_PUSH` (about half), the client sends `sneak: true`, exactly as holding the stance key does: capped at the creep speed and silent to creatures (`noiseRadius` in `server/creatures.ts` looks at the flag, not the speed). Past it, a normal, audible walk. The HUD shows creep either way.
- **Sprint** on L3 is a toggle by default (`settings.controller.sprint`): a click starts it, and stopping, slowing below `SPRINT_PUSH`, aiming or creeping ends it. Set to Hold, it is held like the sprint key. Holding a stick click down while pushing that stick is uncomfortable, hence the toggle. The keyboard has its own (Accessibility > Sprint, off by default): `LocalPlayer.sprintBy` remembers which device switched sprint on, so each follows its own setting and the controller's also ends on slowing or aiming.
- **B in water** is swim down: stance is bound to it too, but a stance press is ignored while swimming (for every device), so nobody climbs out of the water crouched. Swimming where you look (push forward looking up or down) works with the stick as it does with keys.
- **Climbing stays on A.** The simulation never climbs on its own (`simulate.ts`, "Never automatic"): a haul costs stamina and can be heard.
- **Ropes:** X (interact) takes hold of a rope you are looking at (a fresh press). On it the stick climbs up and down, L3 (sprint) climbs faster or slides, and B (stance) lets go: a stance press on a rope only lets go, it never changes stance. See [rope.md](rope.md).
- **Looking.** The right stick, after its dead zone, goes through a curve (finer near the centre, faster toward the edge) to at most `PAD_TURN` (about 180 degrees a second) times `settings.controller.lookSensitivity`. No turn boost at the edge and no aim assist; both are tuning for the balance pass if wanted.
- **Wheels.** While the quick-use or chalk wheel is open, the right stick points at it directly. Letting the stick go back to the centre keeps the last choice, so letting go of the stick before LB doesn't lose it.

## Playing without the mouse captured

Underground, the game normally runs only while the pointer is locked. Browsers don't count a controller press as a user gesture, so a controller can't capture the pointer (or go fullscreen). While the controller is the device in use, the play page runs the game without the lock: "Take Control" isn't shown (A on it just plays), and the cursor is hidden over the game. Using the mouse again goes back to needing a click to capture it. Closing the in-game menu, a crate or the admin screen captures the pointer again only for the mouse (`capture()`).

Sound needs a gesture too, but only once per page load ("sticky" activation); signing in or any click before the descent gives it.

## Button icons

`KeyCap` draws a binding: a keycap for keys, or a controller button. The buttons are our own drawings in the keycap's style, no logos, in two sets:

- **Xbox style** (A/B/X/Y, LB/RB/LT/RT, View/Menu): Xbox, Steam (the Deck and Steam Controllers have A/B/X/Y in the same places, and with Steam running the browser sees them as an Xbox 360 controller anyway), and any other standard controller.
- **PlayStation** (Cross/Circle/Square/Triangle, L1/R1/L2/R2, Create/Options): when the controller's `id` has Sony's vendor ID `054c` or a PlayStation product name.

The id isn't reliable everywhere: on Windows, Chrome and Firefox name every XInput controller the same, and a PlayStation controller through Steam Input looks like an Xbox one. Settings > Controller > Button icons (Auto / Xbox / PlayStation) overrides the detection.

In help text, `{action:name}` renders the binding for the device in use. `{pad:name}` always renders the controller button, and `{button:PadA}` a fixed one (the menu buttons); the Playing with a controller topic uses both.

## Rumble

`rumble(id)` plays an effect from `RUMBLE` (`src/lib/content/rumble.ts`: duration and strong/weak motor strength) on the controllers that can, while the controller is the device in use and Settings > Controller > Vibration is on. Today: firing, a throw drawn back all the way, taking a hit, going down.

Rumble is `vibrationActuator.playEffect('dual-rumble')`, missing on some setups: Firefox has none, and Chrome on Windows has none for the DualSense. Where it's missing, `rumble` does nothing and the Vibration setting says the controller or browser can't vibrate.

To add an effect: add it to `RUMBLE` and call `rumble(id)` where it happens.

## Settings

Settings > Controller: look sensitivity, invert Y (separate from the mouse's), stick dead zone, vibration, sprint (toggle / hold) and button icons. Settings > Controls lists each action's controller button beside its keys.

## Admin

Admin > Controller (dev only): each connected controller with its id, layout and detected icon set, its sticks, triggers and buttons live, and a Test rumble button. Use it to check a new controller or browser.

## Menus

Every screen is built from native buttons, links and inputs, so one focus system drives them all (`menus.ts`):

- The D-pad or left stick moves the focus to the nearest control that way (held, it repeats), with `ui.focus`, the menu navigation sound, quiet.
- A presses it (a button sounds `ui.button`, through `onMenuPress`). B backs out one step, the same chain as Esc: dialog, then panel, then page. On the dashboard B goes back to the Expedition page.
- LB/RB switch tabs: the settings and admin groups, the dashboard's tabs (from the store or social, to the first or last).
- The right stick scrolls whatever scrolls around the focus.
- On a slider, or a stepper (a value with arrows either side), left and right change the value instead of moving away.
- The store's quantity is on the right stick instead (`data-pad-stick-stepper`): while the item details are open, its left and right make it fewer or more wherever the focus is, with a quiet `ui.step` tick. Held, it repeats at the same rate as a held direction, with no speed-up (`repeat.ts`); at 1 or 99 the disabled button isn't pressed, so there is no tick. The quantity is no stop for the D-pad or left stick, so they go straight to Purchase. A push mostly sideways steps and doesn't scroll; up and down still scroll the details. Typing a number and the − / + buttons work as before.
- A menu opens on its first control outside its header (where tabs and Close are), or on the one used last there: the dashboard remembers each page, settings and admin each group.
- Typing (sign-in, a gamer tag, the store's quantity) still needs a keyboard; there is no on-screen keyboard.

**Which menu has the controller.** A screen marks its root with `{@attach menu({ back, tabs, key })}`. The one on top gets the controller: inside an open modal dialog if there is one, otherwise the one latest in the page (an overlay is rendered after what it covers, a menu inside another after that one). While any menu is open it keeps the D-pad, the left stick's directions, A, B, X, Y, LB and RB from the `InputMap`; View and Menu (the pack and settings) still work. So D-pad right moves the focus instead of opening Help while a menu is open; on the dashboard Help is the ? button.

**The dashboard's shortcuts.** Beyond moving and pressing, the dashboard (`src/routes/(hub)/+layout.svelte` and its pages) has shortcuts, each but View with its button on screen (see below):

| Shortcut          | Button              | Where                                                                                |
| ----------------- | ------------------- | ------------------------------------------------------------------------------------ |
| Tabs              | LB / RB             | Every dashboard page; the icons sit either side of the tab bar                       |
| Loadout           | View (`inventory`)  | Goes to the Loadout page (its pill, bottom left). Not a toggle: B goes back          |
| Social            | R3 (`toggleSocial`) | Opens the Social page. R3 doesn't close it, B does (its key, O, still toggles)       |
| Launch Expedition | hold X              | Expedition page, while Launch can be pressed. Cancel, once ready, is a focus and A   |
| Confirm loadout   | hold X              | Loadout page, while Confirm shows                                                    |
| Store             | hold Y              | Every dashboard page but the Store itself, and not while ready (the store is closed) |
| Purchase          | hold Y              | The store's item details, while Purchase can be pressed                              |

View and R3 go through the `InputMap` (bindings, remappable). The dashboard's input map hears `inventory` from the controller only (`InputMap`'s `padOnly`): its key is Tab, which moves the focus there. The holds and LB/RB are menu buttons, fixed like A and B.

**Holds.** A control with `data-pad-hold="x"` (or `"y"`) is pressed by holding that button for `HOLD_TIME` (600 ms, in `hold.ts`: tune the feel there), from anywhere in its menu, while it is enabled and its menu has the controller. A grey slide fills the control's background from left to right as it is held, like a crate's search bar, and `ui.hold`, the button press sound, plays when it completes (the root layout, `onMenuHold`). Letting go early empties it and does what a quick press of the button does: the focused control's `padpress`, on release instead of on press. So on the Loadout page a quick X on an item slot still sends it and a quick Y opens its menu, while a hold confirms or opens the store. Where no control is held for a button (the pack, crates, the store), X and Y act on press as before.

- A hold only counts from a fresh press: holding X through Launch doesn't go on to confirm on the Loadout page.
- One at a time: a press of the other button meanwhile acts on press.
- If the control goes away, is disabled or a menu opens over it, the hold empties and letting go does nothing. Nor does the window losing the focus.
- `Hold` (`hold.ts`) is the timing alone, without the DOM, and is unit tested; `menus.ts` reads the buttons and presses the control.

**Held buttons a screen counts itself.** A hold whose length the game decides (the map's sketch and show, counted by the server: [map.md](map.md)) can't be a `data-pad-hold`, which presses its control once after `HOLD_TIME`. Instead the menu takes `holding(button, down)`: X or Y going down calls it with `true`, and letting go (or the menu no longer being on top, or closing) with `false`. A menu with `holding` takes X and Y as held buttons: they don't press the focused control. One at a time, like the holds above.

**Buttons on screen.** `ButtonHint` shows a shortcut's button (`KeyCap`, in the current icon set) inside the control it presses, after its label, only while the controller is the device in use: keyboard and mouse players see nothing. With `hold` it also draws the slide: absolutely placed in the control, under its label (`[data-pad-hold]` in `src/app.css` makes the control its box and clips it to the control's shape). Each page renders it only where its shortcut works right then (Launch only while it can be pressed, the store not on the Store page or while ready, Social not on the Social page), and a menu button's (LB/RB, a hold) shows only while its menu is the one the controller drives (`hints.top`), so not under an open dialog, Help or the item menu. It is hidden from screen readers (the label says it), and `--hint-gap` sets the space after the label where the control isn't a flex row with a gap.

The icon is drawn in its control's own two colours, swapped, rather than the white keycap and coloured letters of the HUD and Help (`KeyCap`'s `tint="control"`): the control sets `--hint-cap` to its text colour and `--hint-label` to its background. Underground it is used too, with the button after its text: the hold prompts (`HoldPrompt`: extract, open a crate, revive, surrender) in the pill's colours, and the headlamp's key and the rite panel's interact key in the HUD's (the defaults: `--text` for the cap, `--bg` for the letter). Help keeps the white keycaps.

| Control                            | Cap (`--hint-cap`) | Letter (`--hint-label`)                 |
| ---------------------------------- | ------------------ | --------------------------------------- |
| Launch, Confirm loadout            | `--panel` (dark)   | `--launch` (`--launch-bright` when lit) |
| Purchase                           | `--text`           | `--accent`                              |
| The money (Store)                  | `--accent`         | `--bg`                                  |
| Tabs (LB/RB), Social: the defaults | `--text`           | `--bg`                                  |

**The focus** is the browser's own, set with `focus({ focusVisible: true })`, so the `:focus-visible` styles keyboard users see are the highlight. While a controller is in use, something in the open menu always has the focus: when a menu opens, or the focused control goes away (a tab switch, an item taken), it moves to the control used last, else the nearest to where it was.

**Item slots.** A picks an item up; the slots that would take it are lit dark blue, as when dragging, and the one with the focus is lit when it would take it. A on a lit slot puts it down, A on the slot it came from (or B) puts it back. X sends an item where it belongs (shift-click), Y opens the item menu at the slot: on release on the Loadout page, where holding them confirms or opens the store (see Holds above). Carrying is `ItemBoard`'s dragging (`ItemBoard.carry`), so the rules for what goes where stay in one place. A crate opens on its top-left slot: the focus can rest on slots not searched yet, and stays put when one is revealed.

**Looting with X.** In a crate (or a corpse: the same screen), once X has sent an item to the pack, the focus moves on to the next slot in reading order (to the right, then the start of the next row) that holds something or is still sealed, so pressing X again and again empties the crate. The server carries the move out, so `CrateScreen` doesn't move the focus on the press: it tells `CrateFocus` (`crateFocus.ts`) about every press in the screen, and `CrateFocus` waits for the crate's slots to change. Only a slot left empty moves the focus. It stays put when the pack is full (nothing changes), when only part of a stack fit, and on the last thing in the crate (no wrap to the top). It doesn't move either if the focus has left the slot by the time the answer comes, or if another button was pressed since. A hint read with X leaves its slot too, so that moves on as well. Sending from the pack into the crate, and the stash on the Loadout page, don't move the focus. The move is `moveFocus(control)` in `menus.ts`, the D-pad's own: lit, scrolled to, and the `ui.focus` tick. A screen that moves the focus by itself uses it too.

**Markup that steers it:**

| Markup                                      | What                                                                                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{@attach menu({ back, tabs, key })}`       | A menu. `back` is B, `tabs(by)` is LB (-1) / RB (1), `key` remembers the control used last across openings                                                      |
| `menu({ holding })`                         | X and Y as held buttons: `holding(button, down)` when one goes down and when it comes up (the menu's Map tab)                                                   |
| `data-pad-stop` with `tabindex="-1"`        | Somewhere the focus can rest that isn't a control, so a grid with gaps still moves as a grid (a crate's sealed slots)                                           |
| `data-pad-scroll`                           | What the right stick scrolls when nothing around the focus does (a `TabScreen`'s fields, with the focus on its tabs, as in Help)                                |
| `data-pad-stepper`                          | One stop for a value with buttons either side (and maybe a field between): left and right press its first and last buttons (`StepperField`)                     |
| `data-pad-stick-stepper`                    | Like `data-pad-stepper`, but the right stick's left and right press its first and last buttons, wherever the focus is, and it is no stop (the store's quantity) |
| `data-pad-hold="x"` / `"y"`                 | Holding that button presses this control from anywhere in the menu (Launch, Confirm loadout, the store, Purchase); put a `ButtonHint` with `hold` in it         |
| `padpress` event (`CustomEvent<PadButton>`) | Sent to the focused control before A, B, X or Y does anything; `preventDefault()` says it was handled (`ItemSlot.svelte`)                                       |

**Adding a screen:** give its root `{@attach menu({ back: onclose })}`. `Panel`, `Dialog` and `TabScreen` already have it, so screens built from them need nothing more. Buttons and links inside just work.

It covers every dashboard page and the account menu, the settings, account, About and error pages, Help, every dialog (the bug report too), the in-game menu (LB/RB switch between Pack and Rite), crates, the settings and admin overlays, the store's item details, the spectate bar, the results screen and the launch countdown. The sign-in pages are left out: they need typing.

## Testing

Only the repeat timing and the right stick's step (`repeat.test.ts`), the hold timing (`hold.test.ts`), and where the focus goes after X in a crate (`src/lib/ui/crateFocus.test.ts`, against the real inventory rules) are unit tested. The rest is checked by hand with an Xbox controller in Chrome, Firefox and Safari on macOS. PlayStation detection and Steam controllers haven't been tried on real hardware; the PlayStation icons can still be seen with the Button icons setting.

## Adding an action

Give it an entry in `PAD_DEFAULTS` (an empty list if it has no button; TypeScript refuses a missing one), and it reaches existing players' settings automatically.
