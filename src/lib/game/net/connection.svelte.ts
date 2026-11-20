import { ApiError, gameTicket, loadAccount, session } from '#lib/account/account.svelte.ts';
import { presenceFor } from '#lib/content/presence.ts';
import {
	currentGameServer,
	gameServerUrl,
	leaveFriendsGame,
	onGameServerChange,
	setJoinable,
	setPresence,
	unlockAchievement,
	watchParty
} from '#lib/desktop.ts';
import { raise } from '#lib/game/alerts.svelte.ts';
import { promptCrash } from '#lib/game/crash.svelte.ts';
import type { LaidRopeSnapshot, MarkSnapshot, TiedRopeSnapshot } from '#lib/shared/items/types.ts';
import type { Anchor } from '#lib/shared/map/collision.ts';
import type { PartyMember, PartyState } from '#lib/shared/party/types.ts';
import type { ClientMessage, ServerMessage } from '#lib/shared/protocol.ts';
import type { Person, SocialAction, SocialState } from '#lib/shared/social/types.ts';
import { GameClient, type ConnectionStatus } from './GameClient.ts';
import { answerVault } from './vault.ts';

/**
 * The one connection to the game server, shared by every page: the dashboard (the party, friends
 * and invites) and `/play` (the expedition). It is opened once a signed-in page loads and stays
 * open while moving between pages, so the party survives going to the Loadout page or the
 * settings. See docs/dev/systems.md.
 */

type Welcome = Extract<ServerMessage, { type: 'welcome' }>;

interface Connection {
	status: ConnectionStatus;
	/** Why the server turned us away, when it did. */
	detail: string;
	/** The party we're in, as the server last described it; null until connected. */
	party: PartyState | null;
	/** Our member id in it. */
	memberId: string | null;
	/** The last thing the server refused, in its words; cleared when the party next changes. */
	error: string;
	/** When the descent starts (`Date.now()` time), while everyone is ready and it counts down. */
	launchAt: number | null;
	/** Friends, requests and invites; null until the server has sent them. */
	social: SocialState | null;
	/** The answer to the last friend search. */
	search: { query: string; results: Person[] } | null;
	/** The expedition we are down in: what `/play` builds the map from. Null on the surface. */
	welcome: Welcome | null;
	/** The chalk marks of that expedition, as last sent (they follow the welcome). */
	marks: MarkSnapshot[];
	/** Its ropes, laid and tied, as last sent and grown since (they follow the welcome too). */
	ropes: { laid: LaidRopeSnapshot[]; tied: TiedRopeSnapshot[]; pitons: Anchor[] };
}

export const connection: Connection = $state({
	status: 'connecting',
	detail: '',
	party: null,
	memberId: null,
	error: '',
	launchAt: null,
	social: null,
	search: null,
	welcome: null,
	marks: [],
	ropes: { laid: [], tied: [], pitons: [] }
});

/** Something that wants every message as it arrives (the expedition on `/play`). */
interface Listener {
	onMessage?: (message: ServerMessage) => void;
	onStatus?: (status: ConnectionStatus) => void;
}

let listeners: Listener[] = [];
let client: GameClient | null = null;
/** Proof of who we are for the game server (from the site; see docs/dev/accounts.md). */
let ticket = '';
/** A rejected ticket has been replaced once already. */
let ticketRetried = false;
let retry: ReturnType<typeof setTimeout> | null = null;
let started = false;

/** Us, in the party. */
export function me(): PartyMember | null {
	return connection.party?.members.find((member) => member.id === connection.memberId) ?? null;
}

/** The connection itself, for the code that sends input every frame. */
export function gameClient(): GameClient {
	client ??= new GameClient(gameServerUrl(), () => ({ ticket, name: session.account?.gamerTag }), {
		onStatus: (next, detail) => {
			connection.status = next;
			connection.detail = detail ?? '';
			if (next === 'connected') ticketRetried = false;
			// An expired ticket: get a new one and try again, once.
			if (next === 'rejected' && detail === 'Sign in to play' && !ticketRetried) {
				ticketRetried = true;
				connect();
			} else if (next === 'rejected' && guest) {
				// A co-op host sent us home (we left, were removed, or they can't have us).
				connection.error = detail ?? '';
				leaveFriendsGame();
			}
			if (next !== 'connected') {
				connection.party = null;
				connection.launchAt = null;
				connection.welcome = null;
			}
			for (const listener of listeners) listener.onStatus?.(next);
		},
		onMessage: (message) => {
			receive(message);
			for (const listener of listeners) listener.onMessage?.(message);
		}
	});
	return client;
}

/**
 * In the desktop app: playing on a friend's PC as their co-op guest (docs/dev/hosting.md), with
 * the game connection going through the tunnel. False on our own game server, and in a browser.
 */
let guest = false;

/** Open the connection, if it isn't already. Safe to call from every page. */
export function start(): void {
	if (started) return;
	started = true;
	// The desktop app moved us to a friend's game server, or back to our own.
	watchParty((status) => {
		guest = status.role === 'guest';
	});
	onGameServerChange((url) => {
		const client = gameClient();
		client.setUrl(url);
		// Closed for good (a host sent us home): connect again, to the new one.
		if (connection.status === 'rejected') connect();
	});
	connect();
}

export function send(message: ClientMessage): void {
	client?.send(message);
}

/** Friends and invites: ask the server for something. */
export function social(action: SocialAction): void {
	send({ type: 'social', action });
}

/** Hear every message and status change until the returned function is called. */
export function subscribe(listener: Listener): () => void {
	listeners = [...listeners, listener];
	return () => {
		listeners = listeners.filter((other) => other !== listener);
	};
}

/** Get a ticket from the site, then connect with it. */
function connect(): void {
	if (retry) clearTimeout(retry);
	retry = null;
	// The account first: its gamer tag goes in `hello` (a co-op host has no account for us).
	Promise.all([gameTicket(), currentGameServer(), loadAccount()])
		.then(([fresh, url]) => {
			if (!started) return;
			ticket = fresh;
			gameClient().setUrl(url);
			gameClient().connect();
		})
		.catch((error: unknown) => {
			if (!started) return;
			// Not signed in any more: back to the sign-in page. Anything else (the site restarting,
			// the network) is not a reason to sign anyone out: try again shortly.
			if (error instanceof ApiError && error.signedOut) location.href = '/auth/sign-in';
			else retry = setTimeout(connect, 2000);
		});
}

function receive(message: ServerMessage): void {
	switch (message.type) {
		case 'party':
			connection.party = message.party;
			connection.memberId = message.you;
			connection.error = '';
			connection.launchAt =
				message.party.launchIn === null ? null : Date.now() + message.party.launchIn;
			break;
		case 'partyError':
			connection.error = message.reason;
			break;
		case 'social':
			connection.social = message.state;
			break;
		case 'socialSearch':
			connection.search = { query: message.query, results: message.results };
			break;
		case 'alert':
			raise(message.alert);
			break;
		case 'welcome':
			connection.welcome = message;
			connection.marks = [];
			connection.ropes = { laid: [], tied: [], pitons: [] };
			break;
		case 'marks':
			connection.marks = message.marks;
			break;
		case 'ropes':
			connection.ropes = { laid: message.laid, tied: message.tied, pitons: message.pitons };
			break;
		case 'ropeGrow':
			for (const grown of message.ropes) {
				connection.ropes.laid.find((r) => r.id === grown.id)?.points.push(...grown.points);
			}
			break;
		case 'serverError':
			// Something broke on the game server: ask whether to report it (docs/dev/reports.md).
			promptCrash({
				source: 'game',
				message: message.message,
				...(message.id ? { errorId: message.id } : {})
			});
			break;
		case 'extracted':
		case 'died':
		case 'abandoned':
			connection.welcome = null;
			break;
		case 'vault':
			// Only a co-op host asks: this player's belongings are in their own save.
			void answerVault(message, send);
			break;
		case 'achievement':
			// The server decided it (src/lib/content/achievements.ts); Steam only records it.
			for (const id of message.ids) unlockAchievement(id);
			break;
	}
	showPresence();
}

/** Tell Steam where we are (desktop app only; nothing is sent unless it changed). */
function showPresence(): void {
	const party = connection.party;
	const size = party?.members.length ?? 1;
	const underground = connection.welcome !== null || me()?.inExpedition === true;
	setPresence(presenceFor(underground, size), size, size > 1 && party ? party.leader : null);
	// Our Steam lobby takes friends only while our own party is on the surface.
	if (!guest && party) setJoinable(!party.expedition);
}
