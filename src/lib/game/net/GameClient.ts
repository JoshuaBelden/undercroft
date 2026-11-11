import { PROTOCOL_VERSION } from '#lib/shared/constants.ts';
import {
	decodeServer,
	encode,
	type ClientMessage,
	type ServerMessage
} from '#lib/shared/protocol.ts';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'rejected';

interface Handlers {
	onStatus?: (status: ConnectionStatus, detail?: string) => void;
	onMessage?: (message: ServerMessage) => void;
}

/**
 * Who we say we are on connecting: the player's name, the party to join (if any), and the token
 * of the connection we are resuming (if any).
 */
export type Hello = () => { name: string; code?: string; resume?: string };

/**
 * WebSocket connection to the authoritative game server.
 * Reconnects automatically and measures round-trip time. The connection counts as up once the
 * server has put us in a party.
 */
export class GameClient {
	private socket: WebSocket | null = null;
	private pingTimer: ReturnType<typeof setInterval> | null = null;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private closed = false;
	rtt = 0;
	/** Our player id in the current expedition (from `welcome`). */
	playerId: string | null = null;

	constructor(
		private url: string,
		private hello: Hello,
		private handlers: Handlers = {}
	) {}

	connect(): void {
		this.closed = false;
		this.handlers.onStatus?.('connecting');
		const socket = new WebSocket(this.url);
		this.socket = socket;

		socket.addEventListener('open', () => {
			this.send({ type: 'hello', protocol: PROTOCOL_VERSION, ...this.hello() });
			this.pingTimer = setInterval(
				() => this.send({ type: 'ping', clientTime: performance.now() }),
				1000
			);
		});

		let connected = false;
		socket.addEventListener('message', (event) => {
			const message = decodeServer(String(event.data));
			if (!message) return;
			if (message.type === 'party') {
				if (!connected) this.handlers.onStatus?.('connected');
				connected = true;
			} else if (message.type === 'welcome') {
				this.playerId = message.playerId;
			} else if (message.type === 'reject') {
				this.closed = true;
				this.handlers.onStatus?.('rejected', message.reason);
			} else if (message.type === 'pong') {
				this.rtt = performance.now() - message.clientTime;
			}
			this.handlers.onMessage?.(message);
		});

		socket.addEventListener('close', () => {
			this.clearPing();
			if (this.closed) return;
			this.handlers.onStatus?.('disconnected');
			this.retryTimer = setTimeout(() => this.connect(), 2000);
		});
	}

	send(message: ClientMessage): void {
		if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(encode(message));
	}

	dispose(): void {
		this.closed = true;
		this.clearPing();
		if (this.retryTimer) clearTimeout(this.retryTimer);
		this.socket?.close();
		this.socket = null;
	}

	private clearPing(): void {
		if (this.pingTimer) clearInterval(this.pingTimer);
		this.pingTimer = null;
	}
}
