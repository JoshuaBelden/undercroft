/**
 * What the desktop app (desktop/, Electron) gives the page, as `window.undercroft`. Missing in a
 * plain browser. The client only reaches it through src/lib/desktop.ts. Types only, shared by the
 * desktop app's preload script and the client. See docs/dev/desktop.md#bridge.
 */

/** Bumped when the bridge changes in a way the page has to know about. */
export const DESKTOP_BRIDGE_VERSION = 2;

export interface SteamStatus {
	/** Steam is running, signed in, and the app started with it. */
	available: boolean;
	appId: number;
	/** 64-bit SteamID as a decimal string (null when not available). */
	steamId: string | null;
	/** Their Steam name. */
	persona: string | null;
}

export interface SteamBridge {
	status(): Promise<SteamStatus>;
	/**
	 * A Web API auth ticket (hex) for the site to check with Steam (`/api/auth/steam`), made for
	 * the identity `STEAM_TICKET_IDENTITY`. Null when Steam isn't available or refuses.
	 */
	ticket(): Promise<string | null>;
	/** Unlock an achievement by its API name. False when Steam isn't available or doesn't know it. */
	achievement(id: string): Promise<boolean>;
	/** Set a rich presence key (`steam_display` and the tokens it uses); null value clears it. */
	presence(key: string, value: string | null): Promise<void>;
}

/**
 * The Steam lobby behind the party (docs/dev/hosting.md#the-lobby): everyone in it plays on the
 * owner's PC. A player alone is the owner of a lobby of one, waiting for invites.
 */
export interface LobbyStatus {
	/** Steam is running and the lobby is up. Without it there is no co-op, only solo. */
	available: boolean;
	/** `host`: our PC runs the expedition. `guest`: we play on the owner's. */
	role: 'host' | 'guest';
	lobbyId: string | null;
	/** The owner's SteamID. */
	owner: string | null;
	/** Everyone in the lobby, by SteamID, the owner first. */
	members: string[];
	/** Friends can join now (only while the party is on the surface). */
	joinable: boolean;
	/** Something to tell the player (we left a lobby, or couldn't join one), once. */
	notice: string | null;
}

export interface PartyBridge {
	status(): Promise<LobbyStatus>;
	/** Steam's invite dialog, for the lobby. */
	invite(): Promise<void>;
	/** Leave someone else's lobby: back to our own (and our own game server). */
	leave(): Promise<void>;
	/** The host's party went underground (false) or came back (true). */
	setJoinable(joinable: boolean): Promise<void>;
	/** Called whenever the lobby changes. Returns how to stop. */
	onChange(listener: (status: LobbyStatus) => void): () => void;
}

export interface DesktopBridge {
	platform: 'desktop';
	bridge: typeof DESKTOP_BRIDGE_VERSION;
	/** The desktop app's own version (its package.json). */
	version: string;
	/** The page is the desktop app's own site (docs/dev/hosting.md), not the hosted one. */
	local: boolean;
	quit(): Promise<void>;
	/** The game server to connect to: our own, or a co-op host's through the tunnel. */
	gameServer(): Promise<string>;
	/** Called when that changes (we joined or left someone's lobby). Returns how to stop. */
	onGameServer(listener: (url: string) => void): () => void;
	steam: SteamBridge;
	party: PartyBridge;
}

/** The identity Steam Web API tickets are made for, and checked against (`ISteamUserAuth`). */
export const STEAM_TICKET_IDENTITY = 'undercroft';

/** Valve's public test app (Spacewar): used until Undercroft has its own app id. */
export const STEAM_TEST_APP_ID = 480;

/** The IPC channels between the preload script and the main process. */
export const DESKTOP_IPC = {
	quit: 'undercroft:quit',
	steamStatus: 'undercroft:steam:status',
	steamTicket: 'undercroft:steam:ticket',
	steamAchievement: 'undercroft:steam:achievement',
	steamPresence: 'undercroft:steam:presence',
	gameServer: 'undercroft:game-server',
	gameServerChanged: 'undercroft:game-server:changed',
	partyStatus: 'undercroft:party:status',
	partyInvite: 'undercroft:party:invite',
	partyLeave: 'undercroft:party:leave',
	partyJoinable: 'undercroft:party:joinable',
	partyChanged: 'undercroft:party:changed'
} as const;
