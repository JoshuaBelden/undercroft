import { PUBLIC_GAME_SERVER_URL } from '$app/env/public';
import { ApiError, gameTicket, loadAccount } from '#lib/account/account.svelte.ts';
import { promptCrash } from '#lib/game/crash.svelte.ts';
import type { MarkSnapshot } from '#lib/shared/items/types.ts';
import type { PartyMember, PartyState } from '#lib/shared/party/types.ts';
import type { ClientMessage, ServerMessage } from '#lib/shared/protocol.ts';
import type { Person, SocialAction, SocialState } from '#lib/shared/social/types.ts';
import { GameClient, type ConnectionStatus } from './GameClient.ts';

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
	marks: []
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
	client ??= new GameClient(PUBLIC_GAME_SERVER_URL, () => ({ ticket }), {
		onStatus: (next, detail) => {
			connection.status = next;
			connection.detail = detail ?? '';
			if (next === 'connected') ticketRetried = false;
			// An expired ticket: get a new one and try again, once.
			if (next === 'rejected' && detail === 'Sign in to play' && !ticketRetried) {
				ticketRetried = true;
				connect();
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

/** Open the connection, if it isn't already. Safe to call from every page. */
export function start(): void {
	if (started) return;
	started = true;
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
	gameTicket()
		.then((fresh) => {
			if (!started) return;
			ticket = fresh;
			void loadAccount();
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
		case 'welcome':
			connection.welcome = message;
			connection.marks = [];
			break;
		case 'marks':
			connection.marks = message.marks;
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
		case 'banished':
			connection.welcome = null;
			break;
	}
}
