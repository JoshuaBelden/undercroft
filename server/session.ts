import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { TICK_RATE } from '../src/lib/shared/constants.ts';
import { encode, type ServerMessage } from '../src/lib/shared/protocol.ts';
import { log } from './log.ts';

interface Player {
	id: string;
	name: string;
	socket: WebSocket;
}

/**
 * One expedition. Server-authoritative: all game state lives here.
 * Solo play is a session with a single player.
 */
export class Session {
	readonly id = randomUUID();
	private players = new Map<string, Player>();
	private tick = 0;
	private timer: NodeJS.Timeout | null = null;

	get playerCount(): number {
		return this.players.size;
	}

	addPlayer(socket: WebSocket, name: string): Player {
		const player: Player = { id: randomUUID(), name, socket };
		this.players.set(player.id, player);
		this.send(player, {
			type: 'welcome',
			playerId: player.id,
			sessionId: this.id,
			tickRate: TICK_RATE
		});
		log.info(`Player ${name} joined session ${this.id.slice(0, 8)}`);
		if (!this.timer) this.start();
		return player;
	}

	removePlayer(playerId: string): void {
		const player = this.players.get(playerId);
		if (!player) return;
		this.players.delete(playerId);
		log.info(`Player ${player.name} left session ${this.id.slice(0, 8)}`);
		if (this.players.size === 0) this.stop();
	}

	private start(): void {
		this.timer = setInterval(() => this.step(), 1000 / TICK_RATE);
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	private step(): void {
		this.tick++;
		const players = [...this.players.values()].map((p) => ({ id: p.id, name: p.name }));
		this.broadcast({ type: 'tick', tick: this.tick, serverTime: Date.now(), players });
	}

	private broadcast(message: ServerMessage): void {
		for (const player of this.players.values()) this.send(player, message);
	}

	private send(player: Player, message: ServerMessage): void {
		if (player.socket.readyState === player.socket.OPEN) player.socket.send(encode(message));
	}
}
