# Alerts

A short notice that slides in at the right edge so a player doesn't miss something that happened to them: a friend request, a party invite, or an item added to what they carry or keep. Clicking one goes where it is about. They show on every page once signed in, underground too.

Alerts are **live only**. Nothing is stored, and a player who isn't connected when it happens gets nothing. There is no separate service: the game server sends them over the connection every signed-in page already holds ([systems.md](systems.md)), and the client raises its own for things it learns from the site's API or the tick.

## Files

| What                                     | Where                                                       |
| ---------------------------------------- | ----------------------------------------------------------- |
| The `Alert` type                         | `src/lib/shared/alerts/types.ts`                            |
| The server sending one to an account     | `server/alerts.ts` (`Alerts.send`)                          |
| What each says, timing, merging          | `src/lib/content/alerts.ts` (`ALERT`, `alertText`)          |
| The list showing, `raise`, click-through | `src/lib/game/alerts.svelte.ts`                             |
| How they look and move                   | `src/lib/ui/Alerts.svelte` (in `src/routes/+layout.svelte`) |
| Its sound                                | `ui.alert` in `src/lib/content/audio/sounds.ts`             |
| Turning them off                         | `settings.interface.alerts` (Settings > Interface > Alerts) |

## Kinds

`Alert` is one of:

- `{ kind: 'social', event, person }`: something between you and another player (`person`, with their gamer tag). `event` is a `SocialAlertEvent`: `friendRequest`, `friendRequestSent`, `friendAccepted`, `partyInvite`, `partyInviteSent`, `partyJoined`, `partyInviteDeclined`. Clicking opens the Social page.
- `{ kind: 'item', item, count, source, from? }`: `count` of an item came to you. `source` is `store` (bought), `grant` (dev admin tools), `pickup` (picked up underground) or `gift` (another player, `from`, gave it). It shows the item in a small slot (`Slot.svelte`) on the left. Clicking opens the Loadout page, or underground the in-game menu on its Pack tab.

## Where they come from

- **The game server** sends `alert { alert }` (`ServerMessage`) through `Alerts.send(account, alert)`. It reaches that account's connection on any page or underground, and returns false when they aren't connected. `server/social.ts` sends them once a request or invite has gone through (never for a refusal, which is still a `partyError`):
  - a request: `friendRequest` to them, `friendRequestSent` to you; if they had already asked you, it makes you friends and both get `friendAccepted`;
  - accepting a request: `friendAccepted` to both;
  - an invite: `partyInvite` to them, `partyInviteSent` to you;
  - answering one: `partyJoined` or `partyInviteDeclined` to the host.
- **The client**, from what it already knows to be done:
  - `trade()` after a successful buy (`count` is the lot times the lots bought) and `adminAccount()` after a grant (`src/lib/account/account.svelte.ts`);
  - the `pickup` tick event for your own player (`src/lib/game/play/pack.ts`). The event carries `count`, how many `WorldItems.pickUp` took.

## On screen

`raise(alert)` adds it to `alerts.list`, unless the setting is off, and plays `ui.alert` (the root layout's UI sound, through `onAlertSound`). They stack down from the middle of the right edge, 16px in, newest at the bottom. Each slides in from the right (`fly`), goes after `ALERT.seconds` (3), and the ones below move up into its place (`animate:flip`). Pointing at one or focusing it holds it; letting go starts its time over. At most `ALERT.max` show at once, and a new one past that pushes out the oldest. With reduced motion asked for by the system, they appear and go without sliding.

**Merging:** an item alert like one still showing (`mergesWith`: same item, same source, same giver) adds its count to that one and starts its time over, so three bandages picked up in a row make one "3 × Bandage".

**Clicking:** `follow(id)` takes it away and runs the target for its kind. The site's targets go to `/loadout` and `/social`. The play page puts in its own while it is open (`useAlertTargets`): an item alert opens the in-game menu on the Pack tab, and a social one does nothing, because going to the Social page would leave the expedition. Underground the pointer is held by the game, so an alert can only be clicked while a menu has let it go.

There is no key or controller button for alerts. They don't take the focus, and the keys that open Social (O) and the in-game menu already go to the same places.

## Adding one

1. A new social event: add it to `SocialAlertEvent` and its words to `SOCIAL_ALERTS`. A new item source: add it to `ItemAlertSource` and its heading to `ITEM_ALERTS`. Something of a new kind: add a member to `Alert`, its text to `alertText`, and a click target to `AlertTargets` (both the site's and the play page's).
2. Send it. From the game server, call `Alerts.send(account, alert)` (build it in `server/start.ts` and hand it to what needs it, as `Social` gets it). From the client, call `raise(alert)` once the thing has actually happened.
3. Add a test alongside the server code that sends it, and a button to the admin screen's Alerts tab if it looks different from the others.

**Gifts between players** (to come) fit this as they are: the server that moves the item calls `Alerts.send(recipient, { kind: 'item', source: 'gift', from, item, count })`. Make the gift a game server action, like `social`, so it can. If it were made in a SvelteKit route instead, that process can't reach the player's connection: the site and the game server share only MongoDB, and a bridge between them would be needed first.

## Admin

The in-game admin screen (dev mode) has an **Alerts** tab that raises test alerts in this browser only: the item and count chosen under Items (press it again to see merging), a gift, a friend request, a party invite, and three at once to see them stack.
