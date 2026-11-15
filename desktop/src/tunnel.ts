import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { GUEST_HEADERS } from '../../src/lib/server/local.ts';
import { decodeFrame, encodeFrame, FRAME, MAX_FRAME, MessageCodec, type Frame } from './frames.ts';

/**
 * The tunnel (docs/dev/hosting.md#the-tunnel): a co-op guest's game connection carried to the
 * host's game server over a peer-to-peer link (Steam's relay network; a local socket in loopback
 * testing). The guest's page connects to a WebSocket on its own PC (`TunnelGuest`); the host's
 * desktop app opens one to its own game server for each (`TunnelHost`), telling it which SteamID
 * the guest is: the one the link says sent the packets, never one the guest claims.
 */

/** A way to send packets to another player's desktop app, by their SteamID. */
export interface Transport {
	send(peer: string, packet: Buffer): void;
	/** Every packet that arrives, with who sent it. Returns how to stop listening. */
	onPacket(listener: (peer: string, packet: Buffer) => void): () => void;
	stop(): void;
}

const text = (data: RawData): string =>
	Array.isArray(data)
		? Buffer.concat(data).toString('utf8')
		: Buffer.from(data as ArrayBuffer).toString('utf8');

interface HostConnection {
	socket: WebSocket;
	codec: MessageCodec;
	/** What arrived before the socket to the game server opened. */
	waiting: string[];
}

/** The host's end: one connection to its own game server for each guest connection. */
export class TunnelHost {
	private connections = new Map<string, HostConnection>();
	private readonly unlisten: () => void;

	constructor(
		private readonly transport: Transport,
		private readonly gameServer: () => string,
		private readonly hostKey: string,
		/** Only players in the host's lobby get through. */
		private readonly allowed: (peer: string) => boolean
	) {
		this.unlisten = transport.onPacket((peer, packet) => this.packet(peer, packet));
	}

	/** How many guest connections are open (the admin screen). */
	get open(): number {
		return this.connections.size;
	}

	private send(peer: string, frame: Frame): void {
		this.transport.send(peer, encodeFrame(frame));
	}

	private packet(peer: string, packet: Buffer): void {
		const frame = decodeFrame(packet);
		if (!frame) return;
		const key = `${peer}:${frame.connection}`;
		if (frame.kind === FRAME.open) {
			if (!this.allowed(peer)) {
				this.send(peer, {
					kind: FRAME.close,
					connection: frame.connection,
					payload: Buffer.from('Not in the lobby')
				});
				return;
			}
			this.connections.get(key)?.socket.close();
			this.openFor(peer, frame.connection, key);
			return;
		}
		const connection = this.connections.get(key);
		if (!connection) return;
		if (frame.kind === FRAME.close) {
			this.connections.delete(key);
			connection.socket.close();
			return;
		}
		let message: string;
		try {
			message = connection.codec.unpack(frame.payload);
		} catch {
			// Something we can't read means the two ends no longer agree: start again.
			this.connections.delete(key);
			connection.socket.close();
			this.send(peer, {
				kind: FRAME.close,
				connection: frame.connection,
				payload: Buffer.alloc(0)
			});
			return;
		}
		if (connection.socket.readyState === WebSocket.OPEN) connection.socket.send(message);
		else connection.waiting.push(message);
	}

	private openFor(peer: string, id: number, key: string): void {
		const socket = new WebSocket(this.gameServer(), {
			headers: { [GUEST_HEADERS.hostKey]: this.hostKey, [GUEST_HEADERS.steamId]: peer }
		});
		const connection: HostConnection = { socket, codec: new MessageCodec(), waiting: [] };
		this.connections.set(key, connection);
		socket.on('open', () => {
			for (const message of connection.waiting) socket.send(message);
			connection.waiting = [];
		});
		socket.on('message', (data) => {
			if (this.connections.get(key) !== connection) return;
			const payload = connection.codec.pack(text(data));
			if (payload.length > MAX_FRAME) return;
			this.send(peer, { kind: FRAME.data, connection: id, payload });
		});
		const closed = (): void => {
			if (this.connections.get(key) !== connection) return;
			this.connections.delete(key);
			this.send(peer, { kind: FRAME.close, connection: id, payload: Buffer.alloc(0) });
		};
		socket.on('close', closed);
		socket.on('error', closed);
	}

	/** Close every guest's connection (the lobby is gone, or the app is closing). */
	closeAll(): void {
		for (const connection of this.connections.values()) connection.socket.close();
		this.connections.clear();
	}

	stop(): void {
		this.closeAll();
		this.unlisten();
	}
}

/** The guest's end: a WebSocket on this PC for the page, carried to the host. */
export class TunnelGuest {
	private server: WebSocketServer | null = null;
	private pages = new Map<number, { socket: WebSocket; codec: MessageCodec }>();
	private next = 1;
	private readonly unlisten: () => void;
	/** The address the page connects to, once listening. */
	url = '';

	constructor(
		private readonly transport: Transport,
		/** The lobby owner's SteamID. */
		private readonly host: string
	) {
		this.unlisten = transport.onPacket((peer, packet) => {
			if (peer === this.host) this.packet(packet);
		});
	}

	async start(): Promise<string> {
		const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
		this.server = server;
		await new Promise<void>((resolve, reject) => {
			server.once('listening', resolve);
			server.once('error', reject);
		});
		server.on('connection', (socket) => this.page(socket));
		this.url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
		return this.url;
	}

	private send(frame: Frame): void {
		this.transport.send(this.host, encodeFrame(frame));
	}

	private page(socket: WebSocket): void {
		const id = this.next++;
		const page = { socket, codec: new MessageCodec() };
		this.pages.set(id, page);
		this.send({ kind: FRAME.open, connection: id, payload: Buffer.alloc(0) });
		socket.on('message', (data) => {
			const payload = page.codec.pack(text(data));
			if (payload.length <= MAX_FRAME) this.send({ kind: FRAME.data, connection: id, payload });
		});
		socket.on('close', () => {
			if (!this.pages.delete(id)) return;
			this.send({ kind: FRAME.close, connection: id, payload: Buffer.alloc(0) });
		});
	}

	private packet(packet: Buffer): void {
		const frame = decodeFrame(packet);
		if (!frame) return;
		const page = this.pages.get(frame.connection);
		if (!page) return;
		if (frame.kind === FRAME.close) {
			this.pages.delete(frame.connection);
			// 4000: the host's end closed. The page's client reconnects, which opens a new one.
			page.socket.close(4000, frame.payload.toString('utf8').slice(0, 100));
			return;
		}
		if (frame.kind !== FRAME.data) return;
		try {
			page.socket.send(page.codec.unpack(frame.payload));
		} catch {
			this.pages.delete(frame.connection);
			page.socket.close(4000, 'Lost the connection to the host');
		}
	}

	stop(): void {
		for (const [id, page] of this.pages) {
			this.send({ kind: FRAME.close, connection: id, payload: Buffer.alloc(0) });
			page.socket.close(4000, 'Left the lobby');
		}
		this.pages.clear();
		this.server?.close();
		this.server = null;
		this.unlisten();
	}
}
