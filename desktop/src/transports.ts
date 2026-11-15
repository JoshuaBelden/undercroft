import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import type { Transport } from './tunnel.ts';

/**
 * How the tunnel's packets get between two desktop apps (docs/dev/hosting.md#the-tunnel):
 * - `SteamTransport` (desktop/src/steam.ts): Steam peer-to-peer, through Valve's relay network.
 * - `LoopbackTransport`: a WebSocket on this PC, to try host and guest on one machine
 *   (`UNDERCROFT_TUNNEL=loopback`, never in a packaged build). Steam can't be signed in twice.
 * - `memoryTransports`: two ends in one process, for the unit tests.
 */

type Listener = (peer: string, packet: Buffer) => void;

class Listeners {
	private list: Listener[] = [];

	add(listener: Listener): () => void {
		this.list.push(listener);
		return () => {
			this.list = this.list.filter((other) => other !== listener);
		};
	}

	emit(peer: string, packet: Buffer): void {
		for (const listener of this.list) listener(peer, packet);
	}
}

/** Two transports joined to each other, as players `a` and `b`. */
export function memoryTransports(a: string, b: string): [Transport, Transport] {
	const ends = [new Listeners(), new Listeners()];
	const make = (self: number, me: string): Transport => ({
		send: (_peer, packet) => queueMicrotask(() => ends[1 - self].emit(me, Buffer.from(packet))),
		onPacket: (listener) => ends[self].add(listener),
		stop: () => {}
	});
	return [make(0, a), make(1, b)];
}

/**
 * Loopback testing: the host listens on `port`, a guest connects to it and says (in its first
 * message) which pretend SteamID it is. Dev only.
 */
export class LoopbackTransport implements Transport {
	private listeners = new Listeners();
	private server: WebSocketServer | null = null;
	private peers = new Map<string, WebSocket>();

	private constructor(private readonly me: string) {}

	static async host(me: string, port: number): Promise<LoopbackTransport> {
		const transport = new LoopbackTransport(me);
		const server = new WebSocketServer({ host: '127.0.0.1', port });
		transport.server = server;
		await new Promise<void>((resolve, reject) => {
			server.once('listening', resolve);
			server.once('error', reject);
		});
		server.on('connection', (socket) => {
			let peer: string | null = null;
			socket.on('message', (data) => {
				const packet = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
				if (peer === null) {
					peer = packet.toString('utf8');
					transport.peers.set(peer, socket);
					return;
				}
				transport.listeners.emit(peer, packet);
			});
			socket.on('close', () => {
				if (peer && transport.peers.get(peer) === socket) transport.peers.delete(peer);
			});
		});
		console.log(`Loopback tunnel: hosting on ${(server.address() as AddressInfo).port}`);
		return transport;
	}

	static async join(me: string, host: string, port: number): Promise<LoopbackTransport> {
		const transport = new LoopbackTransport(me);
		const socket = new WebSocket(`ws://127.0.0.1:${port}`);
		await new Promise<void>((resolve, reject) => {
			socket.once('open', resolve);
			socket.once('error', reject);
		});
		socket.send(Buffer.from(me, 'utf8'));
		transport.peers.set(host, socket);
		socket.on('message', (data) => {
			transport.listeners.emit(
				host,
				Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
			);
		});
		return transport;
	}

	send(peer: string, packet: Buffer): void {
		const socket = this.peers.get(peer);
		if (socket?.readyState === WebSocket.OPEN) socket.send(packet);
	}

	onPacket(listener: Listener): () => void {
		return this.listeners.add(listener);
	}

	stop(): void {
		for (const socket of this.peers.values()) socket.close();
		this.peers.clear();
		this.server?.close();
		this.server = null;
	}

	/** The pretend SteamIDs connected (the host's lobby, in loopback testing). */
	get connected(): string[] {
		return [...this.peers.keys()].filter((peer) => peer !== this.me);
	}
}
