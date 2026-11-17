import { app, BrowserWindow, ipcMain, Menu, screen, session, shell } from 'electron';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LOCAL_COOKIE } from '../../src/lib/server/local.ts';
import { DESKTOP_IPC, STEAM_TEST_APP_ID } from '../../src/lib/shared/desktop.ts';
import { LoopbackParty, SoloParty, SteamParty, type LocalGame, type Party } from './lobby.ts';
import { startLocalHost, type LocalHostProcess } from './localHost.ts';
import { destination, hostedSite, PROTOCOL, protocolTarget } from './navigation.ts';
import {
	startSteam,
	steamAchievement,
	steamClient,
	steamPresence,
	steamStatus,
	steamTicket
} from './steam.ts';

/**
 * Undercroft's desktop app: one window showing the game, with Steam behind it. The game runs on
 * this PC (docs/dev/hosting.md): a host process with the player's save, the game server and the
 * site (desktop/src/localHost.ts), and co-op through Steam lobbies (desktop/src/lobby.ts). With
 * `UNDERCROFT_URL` set, or in a hosted build (`--hosted`, for beta testers), the window shows the
 * hosted site instead, as a browser would, and `undercroft://` links open it.
 * See docs/dev/desktop.md.
 */

/** Set at build time (desktop/build.mjs). */
declare const BUILD_GAME_URL: string;
declare const BUILD_STEAM_APP_ID: number;
declare const BUILD_HOSTED: boolean;

/** `pnpm desktop:dev`: devtools, and the dev host (Vite) for the local site. */
const dev = !app.isPackaged && process.argv.includes('--dev');
/** The hosted game to show (`UNDERCROFT_URL`, or a hosted build's site), or null to run our own. */
const remote = hostedSite(process.env.UNDERCROFT_URL, BUILD_GAME_URL, BUILD_HOSTED);
const appId = Number(process.env.STEAM_APP_ID) || BUILD_STEAM_APP_ID || STEAM_TEST_APP_ID;

/** The site the window shows: the local host's (set once it is up), or `remote`. */
let game: URL = remote ?? new URL('http://127.0.0.1');
let host: LocalHostProcess | null = null;
let party: Party | null = null;
/** Ours, kept the same if the host process has to start again. */
const local = { secret: randomBytes(32).toString('hex'), hostKey: randomBytes(32).toString('hex') };
const localGame: LocalGame = { url: '', hostKey: local.hostKey };

// The overlay's switches must be set before the app is ready, so Steam starts first of all.
if (startSteam(appId)) app.exit(0);
// A second copy of the game just brings the first to the front.
if (!app.requestSingleInstanceLock()) app.exit(0);
// A hosted build answers `undercroft://` links (for this Windows user, on its first start).
if (BUILD_HOSTED && app.isPackaged) app.setAsDefaultProtocolClient(PROTOCOL);
// The game keeps running (and its sounds keep playing) when the window is behind another.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

let window: BrowserWindow | null = null;

// --- Window size and place, kept between runs ----------------------------------------------

interface WindowState {
	width: number;
	height: number;
	x?: number;
	y?: number;
	maximized?: boolean;
}

const statePath = (): string => path.join(app.getPath('userData'), 'window.json');

function loadState(): WindowState {
	const fallback = { width: 1600, height: 900 };
	try {
		const saved = JSON.parse(readFileSync(statePath(), 'utf8')) as WindowState;
		if (!(saved.width >= 640 && saved.height >= 360)) return fallback;
		// Only where a screen still is (a monitor may have been unplugged since).
		const onScreen =
			saved.x === undefined ||
			saved.y === undefined ||
			screen.getAllDisplays().some(({ workArea: a }) => {
				const { x = 0, y = 0 } = saved;
				return x >= a.x - 50 && y >= a.y - 50 && x < a.x + a.width && y < a.y + a.height;
			});
		return onScreen ? saved : { width: saved.width, height: saved.height };
	} catch {
		return fallback;
	}
}

function saveState(win: BrowserWindow): void {
	const bounds = win.getNormalBounds();
	const state: WindowState = { ...bounds, maximized: win.isMaximized() };
	try {
		writeFileSync(statePath(), JSON.stringify(state));
	} catch {
		// Only a convenience: next time it opens at the default size.
	}
}

// --- The window ------------------------------------------------------------------------------

function createWindow(): void {
	const state = loadState();
	const win = new BrowserWindow({
		...state,
		minWidth: 960,
		minHeight: 540,
		title: 'Undercroft',
		// The site's own background, so there is no white flash before the first paint.
		backgroundColor: '#0a0908',
		show: false,
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			backgroundThrottling: false,
			devTools: dev,
			// The page's bridge says whether it is our own local site (desktop/src/preload.ts).
			additionalArguments: remote ? [] : ['--undercroft-local']
		}
	});
	window = win;
	if (state.maximized) win.maximize();
	win.once('ready-to-show', () => win.show());
	win.on('close', () => saveState(win));
	win.on('closed', () => (window = null));

	const contents = win.webContents;
	// Links: the game and the Discord sign-in stay here, other web links go to the browser.
	contents.setWindowOpenHandler(({ url }) => {
		if (destination(game.origin, url) === 'browser') void shell.openExternal(url);
		return { action: 'deny' };
	});
	contents.on('will-navigate', (event, url) => {
		const where = destination(game.origin, url);
		if (where === 'window') return;
		event.preventDefault();
		if (where === 'browser') void shell.openExternal(url);
	});
	contents.on('will-redirect', (event, url) => {
		// A redirect to somewhere else entirely (not the Discord round trip) goes no further.
		if (destination(game.origin, url) !== 'window') event.preventDefault();
	});
	// No webviews, ever.
	contents.on('will-attach-webview', (event) => event.preventDefault());
	if (dev) {
		contents.on('before-input-event', devKeys);
		// What the window is doing, in the terminal that ran `pnpm desktop:dev`.
		contents.on('did-finish-load', () => console.log(`Loaded ${contents.getURL()}`));
		contents.on('console-message', ({ level, message }) => {
			if (level === 'error' || level === 'warning') console.log(`Page ${level}: ${message}`);
		});
	}

	// Started by an `undercroft://` link: the page it asks for.
	const start = protocolTarget(process.argv, game) ?? game;
	void win.loadURL(start.href).catch(() => showOffline(win));
}

/** F12 opens devtools in `pnpm desktop:dev`; F5 reloads. Never in a packaged build. */
function devKeys(event: Electron.Event, input: Electron.Input): void {
	if (input.type !== 'keyDown' || !window) return;
	if (input.key === 'F12') window.webContents.toggleDevTools();
	else if (input.key === 'F5') window.webContents.reload();
	else return;
	event.preventDefault();
}

/** The site couldn't be reached: say so, with a way to try again. */
function showOffline(win: BrowserWindow): void {
	const page = `<!doctype html><meta charset="utf-8"><title>Undercroft</title>
<body style="background:#0a0908;color:#d8cfc0;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h1 style="font-weight:500">Can't reach Undercroft</h1>
<p>Check your connection, then try again.</p>
<p style="opacity:.6">${game.origin}</p>
<button onclick="location.href=${JSON.stringify(game.href)}" style="font:inherit;padding:.5em 1.5em">Try again</button></div>`;
	void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`);
}

// --- Permissions: only what the game uses ----------------------------------------------------

const ALLOWED = new Set(['pointerLock', 'fullscreen', 'keyboardLock', 'clipboard-sanitized-write']);

function lockDownPermissions(): void {
	const fromGame = (url: string): boolean => destination(game.origin, url) === 'window';
	session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
		callback(ALLOWED.has(permission) && fromGame(contents.getURL()));
	});
	session.defaultSession.setPermissionCheckHandler((_contents, permission, origin) => {
		return ALLOWED.has(permission) && fromGame(origin);
	});
}

// --- The bridge (desktop/src/preload.ts) -----------------------------------------------------

function handleBridge(): void {
	// Only the game's own pages may use it (not Discord's, on the way through sign-in).
	const trusted = (event: Electron.IpcMainInvokeEvent): boolean => {
		try {
			return new URL(event.senderFrame?.url ?? '').origin === game.origin;
		} catch {
			return false;
		}
	};
	const handle = (channel: string, run: (...args: unknown[]) => unknown): void => {
		ipcMain.handle(channel, (event, ...args) => (trusted(event) ? run(...args) : null));
	};
	handle(DESKTOP_IPC.quit, () => app.quit());
	handle(DESKTOP_IPC.steamStatus, () => steamStatus());
	handle(DESKTOP_IPC.steamTicket, () => steamTicket());
	handle(DESKTOP_IPC.steamAchievement, (id) => steamAchievement(id));
	handle(DESKTOP_IPC.steamPresence, (key, value) => steamPresence(key, value));
	// Empty: the hosted site's own game server (UNDERCROFT_URL), as in a browser.
	handle(DESKTOP_IPC.gameServer, () => party?.gameServer() ?? '');
	handle(DESKTOP_IPC.partyStatus, () => party?.status() ?? null);
	handle(DESKTOP_IPC.partyInvite, () => party?.invite());
	handle(DESKTOP_IPC.partyLeave, () => party?.leave());
	handle(DESKTOP_IPC.partyJoinable, (joinable) => party?.setJoinable(joinable === true));
}

// --- The local game (docs/dev/hosting.md) ----------------------------------------------------

/** Start the host process, and let the window in to its site. */
async function startHost(): Promise<void> {
	const steam = steamStatus();
	host = await startLocalHost({
		dev,
		userData: app.getPath('userData'),
		steamId: steam.steamId,
		persona: steam.persona,
		...local
	});
	game = new URL(host.siteUrl);
	localGame.url = host.gameUrl;
	await session.defaultSession.cookies.set({
		url: host.siteUrl,
		name: LOCAL_COOKIE,
		value: local.secret,
		httpOnly: true,
		sameSite: 'strict'
	});
	host.onCrash(() => void restartHost());
}

/** The host process stopped by itself: start it again and reload the game. */
async function restartHost(): Promise<void> {
	try {
		await startHost();
		window?.webContents.send(DESKTOP_IPC.gameServerChanged, party?.gameServer() ?? localGame.url);
		void window?.loadURL(game.href);
	} catch (error) {
		console.log(`[host] could not start again: ${(error as Error).message}`);
	}
}

/** Co-op: Steam lobbies, or loopback testing on one PC (dev only), or solo without Steam. */
async function startParty(): Promise<Party> {
	const loopback = !app.isPackaged && process.env.UNDERCROFT_TUNNEL === 'loopback';
	const client = steamClient();
	if (loopback) {
		const as = process.env.UNDERCROFT_LOOPBACK === 'guest' ? 'guest' : 'host';
		const made = new LoopbackParty(localGame, as);
		await made.start();
		return made;
	}
	if (client) {
		const made = new SteamParty(client, localGame);
		await made.start(process.argv);
		return made;
	}
	return new SoloParty(localGame);
}

/** Tell the page when the party or the game server to use changes. */
function forwardParty(current: Party): void {
	let server = current.gameServer();
	current.onChange(() => {
		const contents = window?.webContents;
		if (!contents) return;
		contents.send(DESKTOP_IPC.partyChanged, current.status());
		const now = current.gameServer();
		if (now !== server) {
			server = now;
			contents.send(DESKTOP_IPC.gameServerChanged, now);
		}
	});
}

// --- Start -----------------------------------------------------------------------------------

app.on('second-instance', (_event, argv) => {
	// Steam starting us again for a join (`+connect_lobby <id>`) while we are running.
	party?.connect(argv);
	if (!window) return;
	// An `undercroft://` link while we are running: the page it asks for, if any.
	const target = protocolTarget(argv, game);
	if (target) void window.loadURL(target.href);
	if (window.isMinimized()) window.restore();
	window.focus();
});

app.on('window-all-closed', () => app.quit());

/** Stop the party and the host (the save is written) before the app goes. */
let quitting = false;
app.on('before-quit', (event) => {
	if (quitting || (!host && !party)) return;
	event.preventDefault();
	quitting = true;
	party?.stop();
	void (host?.stop() ?? Promise.resolve()).finally(() => app.quit());
});

void app.whenReady().then(async () => {
	Menu.setApplicationMenu(null);
	lockDownPermissions();
	handleBridge();
	if (!remote) {
		try {
			await startHost();
			party = await startParty();
			forwardParty(party);
		} catch (error) {
			console.log(`Could not start the game: ${(error as Error).message}`);
		}
	}
	createWindow();
	console.log(`Undercroft desktop ${app.getVersion()}: ${game.origin}`);
});
