# The desktop app (Electron and Steam)

`desktop/` is Undercroft as a Windows program: an Electron window with Steam behind it through [steamworks.js](https://github.com/ceifa/steamworks.js). It runs the whole game on the player's own PC: the site, the game server and a save, with co-op through Steam lobbies. That is player hosting, covered in [hosting.md](hosting.md). The client, site and game server code are the same as the browser game's. The desktop app adds what a browser can't have: Steam as the account, achievements, rich presence, the Steam overlay, co-op without our servers, and a Quit button.

With `UNDERCROFT_URL` set, the window shows that site instead (undercroft.us, say), as a browser would. That is the only time Steam sign-in on the hosted site ([Steam sign-in](#steam-sign-in)) is used.

Nothing is published to Steam from here yet. Until the game has its own Steam app, everything runs against Valve's public test app, **480 (Spacewar)**.

## Files

| File                                                         | What                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `desktop/src/main.ts`                                        | The main process: the window, what may load in it, permissions, the bridge's IPC handlers         |
| `desktop/src/steam.ts`                                       | Steamworks: start-up, status, tickets, achievements, rich presence                                |
| `desktop/src/preload.ts`                                     | Puts the bridge on the page as `window.undercroft`                                                |
| `desktop/src/navigation.ts`                                  | Where a link may go (the window, the system browser, nowhere). Unit tested                        |
| `desktop/build.mjs`                                          | Bundles main and preload into `desktop/dist/` with esbuild; build-time settings                   |
| `desktop/package.json`                                       | Electron, electron-builder (its `build` section) and steamworks.js                                |
| `src/lib/shared/desktop.ts`                                  | The bridge's types and IPC channel names, shared by the preload script and the client             |
| `src/lib/desktop.ts`                                         | The client's only way to the bridge: `desktop()`, `isDesktop()`, `gameServerUrl()`, Steam helpers |
| `src/lib/account/steam.ts`                                   | Client: is Steam here, and a ticket from it (for signing in and linking)                          |
| `src/lib/server/steam.ts`                                    | Site: checking a ticket with Steam (`verifySteamTicket`). Unit tested                             |
| `desktop/src/localHost.ts`, `host/`, `lobby.ts`, `tunnel.ts` | Player hosting: the local game and co-op ([hosting.md](hosting.md))                               |
| `src/lib/content/achievements.ts`                            | The achievements, as data, and who earns them                                                     |
| `src/lib/content/presence.ts`                                | Rich presence: what friends see in Steam                                                          |
| `deploy/steam/`                                              | SteamPipe build script, achievements list and rich presence file for the partner site             |

## Running it

```
pnpm desktop:dev        # build desktop/dist; start the host process (Vite + game server); open the window
```

`pnpm desktop:dev` needs neither `pnpm dev` nor `pnpm dev:server`, nor MongoDB: its host process runs its own site (Vite, with hot reload) and game server on free ports, on a local save (see [hosting.md](hosting.md#the-local-host)). Changes to the site reload as usual. Changes to the game server need the app restarted. To show a hosted site instead, set `UNDERCROFT_URL` (for example `UNDERCROFT_URL=http://localhost:5173 pnpm desktop:dev` with your own `pnpm dev`). `DEV_MODE=true` before it turns on the game server's admin commands. Arguments after `--` go to Electron (`pnpm desktop:dev -- --user-data-dir=<folder>` for a separate save). In `desktop:dev`, **F12** opens devtools, **F5** reloads, and the terminal shows each page loaded and the page's errors and warnings. Electron's warning about the Content Security Policy only shows in dev: Vite's dev server uses `eval`, and a packaged build doesn't warn.

Steam is used if it is running and signed in; otherwise the app says `Steam: not available` in the terminal and works like a browser (the Steam button and links don't show). Steam has to be running before the app starts.

If `pnpm install` didn't download Electron itself (there's no `desktop/node_modules/electron/dist`), run `node desktop/node_modules/electron/install.js`.

## Building it

```
pnpm desktop:build      # = pnpm -C desktop dist
```

This builds the site first (`pnpm build`), then bundles the host process (`dist/host.mjs`) and the site (`dist/site/`, its static files beside it), then packages everything. It writes `desktop/release/win-unpacked/Undercroft.exe` (the folder a Steam depot uploads) and `desktop/release/Undercroft Setup <version>.exe` (an installer, for testers outside Steam). Both are gitignored. Settings are baked in at build time by `desktop/build.mjs`:

| Variable         | Default                 | What                         |
| ---------------- | ----------------------- | ---------------------------- |
| `UNDERCROFT_URL` | `https://undercroft.us` | The site the window opens    |
| `STEAM_APP_ID`   | `480`                   | The Steam app it starts with |

Both can also be set when the app runs, which is how `desktop:dev` points at the local client. The version is `desktop/package.json`'s, which `pnpm release` keeps the same as the game's.

The app isn't in an asar archive (`asar: false`). The host process loads ES modules and sharp's native parts, which Node can't read from inside one. To keep the download small, only the English Chromium locale is kept (`electronLanguages`) and steamworks.js's Linux and macOS binaries are left out. Electron itself is most of what is left (about 300 MB installed, 110 MB for the installer). There is no icon or code signing yet: the default Electron icon shows, and Windows SmartScreen warns about an unsigned installer.

## How it works

### The window

One `BrowserWindow` loads the site. Its size and position are kept in `window.json` in the app's user data folder, and only reused if a screen is still there. Only one copy runs at a time: starting it again brings the first to the front. Background throttling is off, so the game keeps its frame rate and sound when the window is behind another one. If the site can't be reached, a small page says so and offers to try again.

### Navigation

`destination()` in `navigation.ts` decides where every link and redirect goes:

- **The game's own origin** stays in the window.
- **Discord's sign-in pages** (`discord.com/oauth2/…`, `discord.com/login`) also stay in the window. The Discord round trip has to end in this window, so the session cookie is set here and not in the system browser.
- **Any other `http(s)` link** opens in the system browser (GitHub, the source code link, credits).
- **Anything else** (`file:`, `javascript:`, custom schemes) is blocked.

New windows are never opened, and webviews are never attached. Permissions are only granted to the game's pages, and only the ones the game uses: pointer lock, fullscreen, keyboard lock and writing to the clipboard (recovery codes).

### The bridge

The page is sandboxed with context isolation and no Node. The preload script exposes one object, `window.undercroft` (`DesktopBridge` in `src/lib/shared/desktop.ts`):

```ts
window.undercroft = {
	platform: 'desktop',
	bridge: 1, // DESKTOP_BRIDGE_VERSION
	version: '0.2.0',
	quit(),
	steam: { status(), ticket(), achievement(id), presence(key, value) }
};
```

Every call goes to the main process over IPC (`DESKTOP_IPC`). The main process only answers a page on the game's origin, and checks each argument. Client code never reads `window.undercroft` directly: it goes through `src/lib/desktop.ts`, which returns null in a browser, or when the bridge's version isn't the one the page was built for. A site that has moved on to a newer bridge then behaves like a browser in an older desktop app, instead of breaking.

**Adding to the bridge**: add the method to `DesktopBridge` and a channel to `DESKTOP_IPC` (`src/lib/shared/desktop.ts`), forward it in `preload.ts`, handle it in `main.ts` with `handle(...)`, and wrap it in `src/lib/desktop.ts`. A change that an older desktop app can't serve bumps `DESKTOP_BRIDGE_VERSION`.

### The game server URL

The client asks `gameServerUrl()` (`src/lib/desktop.ts`) which game server to connect to. Today that is always `PUBLIC_GAME_SERVER_URL`. It is the one place to change when the desktop app hosts its own server (a solo run on this computer, or a player hosting co-op), so the rest of the client doesn't change.

## Steam

`desktop/src/steam.ts` starts Steamworks before the app is ready (`startSteam`), because the overlay needs Chromium switches set at start-up (`electronEnableSteamOverlay`: GPU in process, no direct composition, and a repaint every frame). steamworks.js runs Steam's callbacks itself, 30 times a second. With a real app id, a packaged build started outside Steam asks Steam to start it (`restartAppIfNecessary`) and quits. With 480 it never does, because Spacewar isn't owned that way.

The overlay opens with **Shift+Tab** like in any Steam game.

### Steam sign-in

"Continue with Steam" shows on the sign-in and sign-up pages when two things are true: the site has Steam sign-in set up (`steamSignInEnabled`), and this is the desktop app with Steam running.

1. The page asks the bridge for a Web API ticket (`GetAuthTicketForWebApi`, identity `undercroft`), along with the SteamID and Steam name.
2. It posts them to `POST /api/auth/steam`.
3. The site checks the ticket with Steam (`ISteamUserAuth/AuthenticateUserTicket` on `partner.steam-api.com`, with the publisher key, app id and identity) and gets the SteamID it belongs to. A VAC or publisher ban is refused.
4. If that SteamID is linked to an account, `signIn` signs it in (or asks for its two-step code). Otherwise a `signups` entry is made, and the player picks a gamer tag at `/auth/steam/tag` (it starts as their Steam name). The account has no email. See [accounts.md](accounts.md#steam).

The Steam name the app reports is only ever shown. The SteamID it reports is only believed in trusted local testing (below). Every try counts against the `steam` limit, because each one asks Steam.

Linking from the Account screen works the same way (`POST /api/account/steam`), and so does unlinking (`DELETE`). Unlinking is refused when Steam is the only way in.

| Variable            | What                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `STEAM_WEB_API_KEY` | The publisher Web API key (Steamworks partner site → Users & Permissions → Manage Groups). Empty: Steam sign-in off. |
| `STEAM_APP_ID`      | The app the tickets are for. `480` until the game has its own.                                                       |
| `STEAM_DEV_TRUST`   | Local testing only: see below. Ignored unless `PUBLIC_DEV_MODE` is on too.                                           |

**Testing locally.** App 480 has no publisher key we can use, so the site can't check a ticket with Steam. With `STEAM_DEV_TRUST=true` and dev mode on, the site still requires a ticket, but believes the SteamID the desktop app reports. That is enough to test the whole flow: sign-up, signing in again, linking and unlinking. It is never honoured outside dev mode (`verifySteamTicket` checks, and its tests do too), and production doesn't set it (`docker-compose.prod.yml`). Add it to your `.env` and restart `pnpm dev`:

```
STEAM_DEV_TRUST=true
```

### Achievements

The game server decides who earns an achievement, and the desktop app records it on Steam:

1. `src/lib/content/achievements.ts` lists each achievement: its Steam API name (`id`), name, description and `trigger`. A trigger is either how a run ended (`{ on: 'run', outcomes, minParty }`) or the rite being performed (`{ on: 'rite' }`).
2. The game server (`server/session.ts`) sends `{ type: 'achievement', ids }` when a run ends for a player (`logRun`), and to everyone still underground when the rite is performed (`awardRite`).
3. The client (`connection.svelte.ts`) passes each id to `unlockAchievement`. Steam ignores one that is already unlocked. A browser does nothing with it. An older client doesn't know the message and drops it, so the protocol version didn't change.

The admin screen's **Steam** group (dev mode, in the desktop app) shows what Steam reports and can unlock each achievement directly. Until the game's own app exists, Steam refuses ours. **Unlock ACH_WIN_ONE_GAME** unlocks one of Spacewar's, to see the overlay's toast. It unlocks on your real Steam account, under Spacewar.

**Adding an achievement**: add it to `ACHIEVEMENTS` (a new trigger kind needs a line in `achievementsForRun` or a call like `awardRite` in the session), add a row to `deploy/steam/achievements.md` (a test checks the two match), and enter it in the partner site with its icons. Never rename a shipped API name.

### Rich presence

What friends see beside the player's name in Steam: on the surface, in a party, or in the undercroft alone or with others. `src/lib/content/presence.ts` maps each state to a token. `deploy/steam/rich_presence_english.vdf` gives each token its English text, and is uploaded to the partner site (Rich Presence Localization). A test checks the two match. The client sets it from the connection whenever the party or the expedition changes (`showPresence`). Steam's `steam_player_group` groups the party together in friends lists.

**Adding a state**: a token and text in `PRESENCE`, the same line in the `.vdf`, and the case in `presenceFor`.

## Uploading to Steam

Not done yet. When the game has its app and a Windows depot:

1. In the partner site, enter the achievements (`deploy/steam/achievements.md`) and upload the rich presence file.
2. Set `STEAM_WEB_API_KEY` and `STEAM_APP_ID` on the droplet's `.env` ([deployment.md](deployment.md)) and deploy.
3. Build with the app id: `STEAM_APP_ID=<id> pnpm desktop:build`.
4. Run `STEAM_APP_ID=<id> STEAM_DEPOT_ID=<depot> STEAM_BUILDER=<build account> pnpm steam:upload`. It writes `desktop/release/steam/app_build_<id>.vdf` from `deploy/steam/app_build.vdf.template`, and prints the steamcmd command it would run.
5. Run it again with `--upload` to upload, with [steamcmd](https://developer.valvesoftware.com/wiki/SteamCMD) installed (`STEAMCMD` if it isn't on the PATH). It asks for the password and Steam Guard code itself.
6. Set the build live on a branch from the partner site. The script never sets a build live.

## Licence

The game is AGPL-3.0, and the desktop app links the Steamworks SDK (`steam_api64.dll`), which isn't free software. Shipping that combination needs a linking exception from the copyright holder: a draft is in `LICENSE-EXCEPTION-STEAMWORKS.md`, **not yet in force**. Adopt it (and have it reviewed) before the desktop app is distributed.
