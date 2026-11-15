import { PARTY } from '../../src/lib/content/party.ts';
import { PROTOCOL_VERSION } from '../../src/lib/shared/constants.ts';
import type { LobbyStatus } from '../../src/lib/shared/desktop.ts';
import { SteamCallback } from 'steamworks.js';
import { STEAM, steamClient } from './steam.ts';
import { LoopbackTransport } from './transports.ts';
import { TunnelGuest, TunnelHost, type Transport } from './tunnel.ts';

/**
 * The party behind the game (docs/dev/hosting.md#the-lobby): who plays on whose PC. Everyone
 * starts as the host of their own Steam lobby, the party's invitation. Joining a friend's lobby
 * (their invite, or "Join game" in Steam) makes us their guest: our game connects to their game
 * server through the tunnel until we leave. Without Steam there is only solo.
 */
export interface Party {
	status(): LobbyStatus;
	/** The game server the page should connect to right now. */
	gameServer(): string;
	invite(): void;
	leave(): Promise<void>;
	setJoinable(joinable: boolean): void;
	/** Called when the status or the game server changes. */
	onChange(listener: () => void): void;
	/** A `+connect_lobby <id>` from Steam (the game started for a join, or a second launch). */
	connect(argv: string[]): void;
	stop(): void;
}

/** Where the host's own game server is, and the key its tunnel uses for guests. */
export interface LocalGame {
	url: string;
	hostKey: string;
}

const solo = (): LobbyStatus => ({
	available: false,
	role: 'host',
	lobbyId: null,
	owner: null,
	members: [],
	joinable: false,
	notice: null
});

/** No Steam: solo only, on our own game server. */
export class SoloParty implements Party {
	constructor(private readonly game: LocalGame) {}
	status(): LobbyStatus {
		return solo();
	}
	gameServer(): string {
		return this.game.url;
	}
	invite(): void {}
	async leave(): Promise<void> {}
	setJoinable(): void {}
	onChange(): void {}
	connect(): void {}
	stop(): void {}
}

/** `+connect_lobby <id>` in a command line (how Steam starts a game for a join). */
export function connectLobbyArg(argv: string[]): string | null {
	const at = argv.indexOf('+connect_lobby');
	const id = at >= 0 ? argv[at + 1] : undefined;
	return id && /^\d{1,20}$/.test(id) ? id : null;
}

type Client = NonNullable<ReturnType<typeof steamClient>>;
type Lobby = Awaited<ReturnType<Client['matchmaking']['createLobby']>>;

/** Steam's peer-to-peer packets, from and to lobby members only. */
class SteamTransport implements Transport {
	private listeners: ((peer: string, packet: Buffer) => void)[] = [];
	private readonly poll: ReturnType<typeof setInterval>;
	private readonly request: { disconnect(): void };

	constructor(
		private readonly client: Client,
		accept: (peer: string) => boolean
	) {
		this.request = client.callback.register(SteamCallback.P2PSessionRequest, (value) => {
			if (accept(value.remote.toString())) client.networking.acceptP2PSession(value.remote);
		});
		// Packets wait in Steam until read: often, so a tick isn't held back.
		this.poll = setInterval(() => {
			let size = client.networking.isP2PPacketAvailable();
			while (size > 0) {
				const packet = client.networking.readP2PPacket(size);
				const peer = packet.steamId.steamId64.toString();
				for (const listener of this.listeners) listener(peer, packet.data);
				size = client.networking.isP2PPacketAvailable();
			}
		}, 4);
	}

	send(peer: string, packet: Buffer): void {
		this.client.networking.sendP2PPacket(BigInt(peer), STEAM.reliable as never, packet);
	}

	onPacket(listener: (peer: string, packet: Buffer) => void): () => void {
		this.listeners.push(listener);
		return () => {
			this.listeners = this.listeners.filter((other) => other !== listener);
		};
	}

	stop(): void {
		clearInterval(this.poll);
		this.request.disconnect();
	}
}

/** The party through Steam lobbies and Steam's relay network. */
export class SteamParty implements Party {
	private readonly me: string;
	private lobby: Lobby | null = null;
	private role: 'host' | 'guest' = 'host';
	private guest: TunnelGuest | null = null;
	private readonly host: TunnelHost;
	private readonly transport: SteamTransport;
	private joinable = true;
	private notice: string | null = null;
	private listeners: (() => void)[] = [];
	private readonly callbacks: { disconnect(): void }[] = [];
	private busy: Promise<void> = Promise.resolve();

	constructor(
		private readonly client: Client,
		private readonly game: LocalGame
	) {
		this.me = client.localplayer.getSteamId().steamId64.toString();
		this.transport = new SteamTransport(client, (peer) => this.members().includes(peer));
		this.host = new TunnelHost(
			this.transport,
			() => game.url,
			game.hostKey,
			(peer) => this.role === 'host' && peer !== this.me && this.members().includes(peer)
		);
		this.callbacks.push(
			client.callback.register(SteamCallback.GameLobbyJoinRequested, (value) =>
				this.join(value.lobby_steam_id.toString())
			),
			client.callback.register(SteamCallback.LobbyChatUpdate, (value) => this.chatUpdate(value))
		);
	}

	/** Make our own lobby (and join a friend's if Steam started us for that). */
	async start(argv: string[]): Promise<void> {
		await this.queue(() => this.ownLobby());
		this.connect(argv);
	}

	/** One lobby change at a time: joining while leaving would leave two lobbies half made. */
	private queue(task: () => Promise<void>): Promise<void> {
		this.busy = this.busy.then(task).catch((error: unknown) => {
			console.log(`Lobby: ${error instanceof Error ? error.message : error}`);
		});
		return this.busy;
	}

	private async ownLobby(): Promise<void> {
		const lobby = await this.client.matchmaking.createLobby(
			STEAM.friendsOnly as never,
			PARTY.maxSize
		);
		lobby.mergeFullData({ game: 'undercroft', protocol: String(PROTOCOL_VERSION) });
		lobby.setJoinable(this.joinable);
		this.lobby = lobby;
		this.role = 'host';
		// "Join game" in a friend's Steam friends list (Steam launches us with this if needed).
		this.client.localplayer.setRichPresence('connect', `+connect_lobby ${lobby.id}`);
		console.log(`Lobby: hosting ${lobby.id}`);
		this.changed();
	}

	connect(argv: string[]): void {
		const id = connectLobbyArg(argv);
		if (id) this.join(id);
	}

	private join(id: string): void {
		void this.queue(async () => {
			if (this.lobby && this.lobby.id.toString() === id) return;
			const lobby = await this.client.matchmaking.joinLobby(BigInt(id));
			const owner = lobby.getOwner().steamId64.toString();
			if (owner === this.me) return;
			if (
				lobby.getData('game') !== 'undercroft' ||
				lobby.getData('protocol') !== String(PROTOCOL_VERSION)
			) {
				lobby.leave();
				this.notice =
					"Your friend's game is a different version of Undercroft. Update both, then try again";
				this.changed();
				return;
			}
			this.lobby?.leave();
			this.lobby = lobby;
			this.role = 'guest';
			this.host.closeAll();
			this.guest = new TunnelGuest(this.transport, owner);
			await this.guest.start();
			this.client.localplayer.setRichPresence('connect', null);
			console.log(`Lobby: joined ${id} (host ${owner})`);
			this.changed();
		});
	}

	private chatUpdate(value: {
		lobby: bigint;
		user_changed: bigint;
		member_state_change: number;
	}): void {
		if (!this.lobby || value.lobby !== this.lobby.id) return;
		// Entered is 0; anything else is someone leaving (left, disconnected, kicked, banned).
		const leaving = value.member_state_change !== 0;
		if (this.role === 'guest' && leaving && value.user_changed.toString() === this.owner()) {
			this.notice = 'The host left the game';
			void this.leave();
			return;
		}
		this.changed();
	}

	async leave(): Promise<void> {
		await this.queue(async () => {
			if (this.role !== 'guest') return;
			this.guest?.stop();
			this.guest = null;
			this.lobby?.leave();
			this.lobby = null;
			await this.ownLobby();
		});
	}

	invite(): void {
		this.lobby?.openInviteDialog();
	}

	setJoinable(joinable: boolean): void {
		this.joinable = joinable;
		if (this.role === 'host') this.lobby?.setJoinable(joinable);
		this.changed();
	}

	gameServer(): string {
		return this.role === 'guest' && this.guest ? this.guest.url : this.game.url;
	}

	private owner(): string | null {
		return this.lobby ? this.lobby.getOwner().steamId64.toString() : null;
	}

	private members(): string[] {
		if (!this.lobby) return [];
		const owner = this.owner();
		const ids = this.lobby.getMembers().map((member) => member.steamId64.toString());
		return [...ids.filter((id) => id === owner), ...ids.filter((id) => id !== owner)];
	}

	status(): LobbyStatus {
		const notice = this.notice;
		this.notice = null;
		return {
			available: this.lobby !== null,
			role: this.role,
			lobbyId: this.lobby ? this.lobby.id.toString() : null,
			owner: this.owner(),
			members: this.members(),
			joinable: this.joinable,
			notice
		};
	}

	onChange(listener: () => void): void {
		this.listeners.push(listener);
	}

	private changed(): void {
		for (const listener of this.listeners) listener();
	}

	stop(): void {
		this.guest?.stop();
		this.host.stop();
		this.transport.stop();
		for (const callback of this.callbacks) callback.disconnect();
		this.lobby?.leave();
		this.lobby = null;
	}
}

/** Pretend SteamIDs for loopback testing. */
export const LOOPBACK = {
	host: '76561190000000001',
	guest: '76561190000000002',
	port: 47811
} as const;

/**
 * Loopback testing on one PC (dev only, `UNDERCROFT_TUNNEL=loopback`): `UNDERCROFT_LOOPBACK=host`
 * hosts, `=guest` joins it straight away. The same tunnel as with Steam, over a local socket.
 */
export class LoopbackParty implements Party {
	private role: 'host' | 'guest';
	private guest: TunnelGuest | null = null;
	private tunnelHost: TunnelHost | null = null;
	private transport: LoopbackTransport | null = null;
	private listeners: (() => void)[] = [];
	private notice: string | null = null;

	constructor(
		private readonly game: LocalGame,
		private readonly as: 'host' | 'guest'
	) {
		this.role = as;
	}

	async start(): Promise<void> {
		if (this.as === 'host') {
			this.transport = await LoopbackTransport.host(LOOPBACK.host, LOOPBACK.port);
			this.tunnelHost = new TunnelHost(
				this.transport,
				() => this.game.url,
				this.game.hostKey,
				() => true
			);
		} else {
			this.transport = await LoopbackTransport.join(LOOPBACK.guest, LOOPBACK.host, LOOPBACK.port);
			this.guest = new TunnelGuest(this.transport, LOOPBACK.host);
			await this.guest.start();
		}
		this.changed();
	}

	status(): LobbyStatus {
		const notice = this.notice;
		this.notice = null;
		const members =
			this.role === 'host'
				? [LOOPBACK.host, ...(this.transport?.connected ?? [])]
				: [LOOPBACK.host, LOOPBACK.guest];
		return {
			available: true,
			role: this.role,
			lobbyId: 'loopback',
			owner: LOOPBACK.host,
			members,
			joinable: true,
			notice
		};
	}

	gameServer(): string {
		return this.role === 'guest' && this.guest ? this.guest.url : this.game.url;
	}

	invite(): void {
		console.log('Loopback: start another copy with UNDERCROFT_LOOPBACK=guest to join');
	}

	async leave(): Promise<void> {
		if (this.role !== 'guest') return;
		this.guest?.stop();
		this.guest = null;
		this.transport?.stop();
		this.transport = null;
		this.role = 'host';
		this.changed();
	}

	setJoinable(): void {}
	connect(): void {}

	onChange(listener: () => void): void {
		this.listeners.push(listener);
	}

	private changed(): void {
		for (const listener of this.listeners) listener();
	}

	stop(): void {
		this.guest?.stop();
		this.tunnelHost?.stop();
		this.transport?.stop();
	}
}
