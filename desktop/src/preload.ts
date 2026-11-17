import { contextBridge, ipcRenderer } from 'electron';
import {
	DESKTOP_BRIDGE_VERSION,
	DESKTOP_IPC,
	type DesktopBridge
} from '../../src/lib/shared/desktop.ts';

/**
 * The page's way to the desktop app: `window.undercroft` (src/lib/shared/desktop.ts). Runs
 * sandboxed, so it only forwards calls to the main process, which checks the page is the game's.
 * Bundled into one file by desktop/build.mjs: a sandboxed preload can't load others.
 */

declare const BUILD_VERSION: string;

/** Listen to an event the main process sends; returns how to stop. */
function listen<T>(channel: string, listener: (value: T) => void): () => void {
	const handler = (_event: unknown, value: T): void => listener(value);
	ipcRenderer.on(channel, handler);
	return () => ipcRenderer.removeListener(channel, handler);
}

const bridge: DesktopBridge = {
	platform: 'desktop',
	bridge: DESKTOP_BRIDGE_VERSION,
	version: BUILD_VERSION,
	// The main process says whether the window shows its own local site (process.argv).
	local: process.argv.includes('--undercroft-local'),
	quit: () => ipcRenderer.invoke(DESKTOP_IPC.quit),
	gameServer: () => ipcRenderer.invoke(DESKTOP_IPC.gameServer),
	onGameServer: (listener) => listen(DESKTOP_IPC.gameServerChanged, listener),
	steam: {
		status: () => ipcRenderer.invoke(DESKTOP_IPC.steamStatus),
		ticket: () => ipcRenderer.invoke(DESKTOP_IPC.steamTicket),
		achievement: (id) => ipcRenderer.invoke(DESKTOP_IPC.steamAchievement, id),
		presence: (key, value) => ipcRenderer.invoke(DESKTOP_IPC.steamPresence, key, value)
	},
	party: {
		status: () => ipcRenderer.invoke(DESKTOP_IPC.partyStatus),
		invite: () => ipcRenderer.invoke(DESKTOP_IPC.partyInvite),
		leave: () => ipcRenderer.invoke(DESKTOP_IPC.partyLeave),
		setJoinable: (joinable) => ipcRenderer.invoke(DESKTOP_IPC.partyJoinable, joinable),
		onChange: (listener) => listen(DESKTOP_IPC.partyChanged, listener)
	}
};

contextBridge.exposeInMainWorld('undercroft', bridge);
