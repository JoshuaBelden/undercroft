# Controllers

Xbox, PlayStation and Steam controllers play the game through the same actions as the keyboard and mouse. Any controller the browser reports with the standard layout (`Gamepad.mapping === 'standard'`) works. Other controllers are ignored: players who have one fix it with their system's or Steam Input's own mapping, never in the game.

Keyboard, mouse and controller all work at the same time, as in most PC games. Whichever was used last decides the button icons in prompts and help, and whether the cursor shows.

## Status

| Part                                | What                                                                                                                                             | State   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| 1. The controller plays the game    | Reading controllers, analog move and look, creeping and sprint, wheels, playing without the mouse captured, icons, rumble, settings, admin, help | Done    |
| 2. The controller drives every menu | Focus navigation on every screen, item slots, dialogs, the dashboard pages                                                                       | Planned |

Until part 2 lands, these need the mouse: the pack, loot crates, the settings overlay, the spectate bar, the results screen's Continue and the Ready button.

## Files

| File                                  | What                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/lib/game/input/gamepad.ts`       | Reads controllers each frame: buttons, sticks, presses; rumble                          |
| `src/lib/game/input/device.svelte.ts` | `device`, the last device used (reactive); the bindings to show for it                  |
| `src/lib/game/input/actions.ts`       | `PAD_DEFAULTS`, `defaultPadBindings()`, labels for controller buttons                   |
| `src/lib/game/input/InputMap.ts`      | Controller buttons as actions, beside keys and mouse buttons; the sticks                |
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
- **The left stick also presses the move actions.** A direction counts as pressed while that axis is past `STICK_PRESS`, so everything that reacts to a move key (walking away from a crate closes it, moving leaves the admin screen) also reacts to the stick.
- **Dialogs:** while a modal `<dialog>` is open, controller presses don't reach the `InputMap`. Key presses don't either (`Dialog.svelte` stops them).

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

Controller bindings are their own settings group, `settings.padBindings` (action -> codes), not part of `settings.bindings`. Saved settings keep every binding list as it was saved, so a separate group is what lets existing players get the controller defaults. The defaults are `PAD_DEFAULTS`, below `ACTIONS` in `actions.ts`. The layout is fixed until the keybinding screen (post beta) can change it; the Controls tab lists it.

| Button     | Action                                  | Button      | Action                        |
| ---------- | --------------------------------------- | ----------- | ----------------------------- |
| Left stick | Move (a light push creeps)              | Right stick | Look; points at an open wheel |
| L3         | Sprint (toggle, or hold: a setting)     | R3          | Free                          |
| A          | Climb / swim up / surrender (hold)      | RT          | Attack / fire / use           |
| B          | Stance (tap / hold to creep); swim down | LT          | Aim (hold) / throw            |
| X          | Interact / revive (hold)                | LB          | Quick-use wheel (hold)        |
| Y          | Other weapon                            | RB          | Reload                        |
| D-pad up   | Headlamp mode                           | D-pad down  | Drop held item                |
| D-pad left | Camera: first person / shoulder         | D-pad right | Help                          |
| View       | Pack                                    | Menu        | Settings                      |

No controller button: choosing primary or secondary directly (Y swaps the two), friends, fullscreen (browsers only allow it from a click or a key), performance stats and the admin panel. Their prompts and help show the keyboard key even while the controller is in use.

## Moving and looking

- **Analog movement.** The left stick fills `InputFrame.moveX`/`moveZ` with its value (-1..1). The server already clamps them to that range and only normalises a wish longer than 1, so half a push walks at half speed. No protocol or server change.
- **A light push creeps.** Below `CREEP_PUSH` (about half), the client sends `sneak: true`, exactly as holding the stance key does: capped at the creep speed and silent to creatures (`noiseRadius` in `server/creatures.ts` looks at the flag, not the speed). Past it, a normal, audible walk. The HUD shows creep either way.
- **Sprint** on L3 is a toggle by default (`settings.controller.sprint`): a click starts it, and stopping, slowing below `SPRINT_PUSH`, aiming or creeping ends it. Set to Hold, it is held like the sprint key. Holding a stick click down while pushing that stick is uncomfortable, hence the toggle. The keyboard has its own (Accessibility > Sprint, off by default): `LocalPlayer.sprintBy` remembers which device switched sprint on, so each follows its own setting and the controller's also ends on slowing or aiming.
- **B in water** is swim down: stance is bound to it too, but a stance press is ignored while swimming (for every device), so nobody climbs out of the water crouched. Swimming where you look (push forward looking up or down) works with the stick as it does with keys.
- **Climbing stays on A.** The simulation never climbs on its own (`simulate.ts`, "Never automatic"): a haul costs stamina and can be heard.
- **Looking.** The right stick, after its dead zone, goes through a curve (finer near the centre, faster toward the edge) to at most `PAD_TURN` (about 180 degrees a second) times `settings.controller.lookSensitivity`. Aiming slows it by the same zoom as the mouse (`lookScale`). No turn boost at the edge and no aim assist; both are tuning for the balance pass if wanted.
- **Wheels.** While the quick-use or chalk wheel is open, the right stick points at it directly. Letting the stick go back to the centre keeps the last choice, so letting go of the stick before LB doesn't lose it.

## Playing without the mouse captured

Underground, the game normally runs only while the pointer is locked. Browsers don't count a controller press as a user gesture, so a controller can't capture the pointer (or go fullscreen). While the controller is the device in use, the play page runs the game without the lock: "Take Control" isn't shown (A on it just plays), and the cursor is hidden over the game. Using the mouse again goes back to needing a click to capture it. Closing the pack, a crate or the admin screen captures the pointer again only for the mouse (`capture()`).

Sound needs a gesture too, but only once per page load ("sticky" activation); signing in or any click before the descent gives it.

## Button icons

`KeyCap` draws a binding: a keycap for keys, or a controller button. The buttons are our own drawings in the keycap's style, no logos, in two sets:

- **Xbox style** (A/B/X/Y, LB/RB/LT/RT, View/Menu): Xbox, Steam (the Deck and Steam Controllers have A/B/X/Y in the same places, and with Steam running the browser sees them as an Xbox 360 controller anyway), and any other standard controller.
- **PlayStation** (Cross/Circle/Square/Triangle, L1/R1/L2/R2, Create/Options): when the controller's `id` has Sony's vendor ID `054c` or a PlayStation product name.

The id isn't reliable everywhere: on Windows, Chrome and Firefox name every XInput controller the same, and a PlayStation controller through Steam Input looks like an Xbox one. Settings > Controller > Button icons (Auto / Xbox / PlayStation) overrides the detection.

In help text, `{action:name}` renders the binding for the device in use. `{pad:name}` always renders the controller button (the Controller topic uses it).

## Rumble

`rumble(id)` plays an effect from `RUMBLE` (`src/lib/content/rumble.ts`: duration and strong/weak motor strength) on the controllers that can, while the controller is the device in use and Settings > Controller > Vibration is on. Today: firing, taking a hit, going down.

Rumble is `vibrationActuator.playEffect('dual-rumble')`, missing on some setups: Firefox has none, and Chrome on Windows has none for the DualSense. Where it's missing, `rumble` does nothing and the Vibration setting says the controller or browser can't vibrate.

To add an effect: add it to `RUMBLE` and call `rumble(id)` where it happens.

## Settings

Settings > Controller: look sensitivity, invert Y (separate from the mouse's), stick dead zone, vibration, sprint (toggle / hold) and button icons. Settings > Controls lists each action's controller button beside its keys.

## Admin

Admin > Controller (dev only): each connected controller with its id, layout and detected icon set, its sticks, triggers and buttons live, and a Test rumble button. Use it to check a new controller or browser.

## Menus (part 2)

Every screen is built from native buttons and inputs, so one focus system drives them all:

- The D-pad or left stick moves the focus to the nearest control in that direction, with a visible highlight and a quiet `ui.focus` tick.
- A presses; B backs out one step, the same chain as Esc (dialog, then panel, then page).
- LB/RB switch tabs (settings, admin, the dashboard); the right stick scrolls the list under the focus.
- On a focused slider or stepper, left and right change the value instead of moving away.
- A screen opens with its first control focused, or the one last used there.

Item slots: A picks an item up (slots that would take it are lit dark blue, as when dragging), A on a lit slot puts it down, B cancels. Y opens the item menu, X sends the item where it belongs (shift-click). This uses `ItemBoard.startDrag` and `dropOn`, so the rules for what goes where stay in one place.

Some actions sit on menu buttons: D-pad right is Help, View the pack, Menu the settings. While a menu has the focus, the D-pad moves it and those actions wait.

It covers every dashboard page, the settings page, Help and every dialog. Typing (sign-in, the gamer tag) still needs a keyboard; there is no on-screen keyboard.

## Testing

There are no automated tests. Each part is checked by hand with an Xbox controller in Chrome, Firefox and Safari on macOS. PlayStation detection and Steam controllers haven't been tried on real hardware; the PlayStation icons can still be seen with the Button icons setting.

## Adding an action

Give it an entry in `PAD_DEFAULTS` (an empty list if it has no button; TypeScript refuses a missing one), and it reaches existing players' settings automatically.
