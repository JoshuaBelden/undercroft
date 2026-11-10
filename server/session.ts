import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { MAP_KIT } from '../src/lib/content/map/kit.ts';
import { MOVEMENT } from '../src/lib/content/player/movement.ts';
import { SIM_RATE, TICK_RATE } from '../src/lib/shared/constants.ts';
import {
	buildCollisionWorld,
	findFreeSpot,
	type CollisionWorld
} from '../src/lib/shared/map/collision.ts';
import { generateLayout } from '../src/lib/shared/map/generate.ts';
import { PIECES } from '../src/lib/shared/map/pieces.generated.ts';
import { roomPoints, spawnPoint } from '../src/lib/shared/map/points.ts';
import type { MapLayout } from '../src/lib/shared/map/types.ts';
import { createPlayerState, sanitizeFrame, stepPlayer } from '../src/lib/shared/player/simulate.ts';
import type { InputFrame, PlayerState } from '../src/lib/shared/player/types.ts';
import { encode, type AdminCommand, type ServerMessage } from '../src/lib/shared/protocol.ts';
import { randomSeed } from '../src/lib/shared/rng.ts';
import { config } from './config.ts';
import { log } from './log.ts';

interface Player {
	id: string;
	name: string;
	socket: WebSocket;
	state: PlayerState;
	/** Input frames received but not yet simulated. */
	queue: InputFrame[];
	/** Last simulated input `seq`. */
	ack: number;
	/** Frames this player may still simulate; refills at SIM_RATE so inputs can't run faster than real time. */
	budget: number;
}

const DT = 1 / SIM_RATE;
const FRAMES_PER_TICK = SIM_RATE / TICK_RATE;
/** Catch-up allowance after network jitter, in frames. */
const BUDGET_CAP = FRAMES_PER_TICK * 3;
const MAX_QUEUE = SIM_RATE;
const MAX_FRAMES_PER_MESSAGE = 30;

/**
 * One expedition. Server-authoritative: the map and every player's state live here.
 * Solo play is a session with a single player.
 */
export class Session {
	readonly id = randomUUID();
	/** Map seed, kept for logs, admin tools and reproducing a layout. */
	seed = randomSeed();
	/** Authoritative map layout, sent to clients in `welcome`. */
	layout: MapLayout = generateLayout(this.seed, PIECES, MAP_KIT);
	private world: CollisionWorld = buildCollisionWorld(this.layout, PIECES);
	private players = new Map<string, Player>();
	private tick = 0;
	private timer: NodeJS.Timeout | null = null;

	get playerCount(): number {
		return this.players.size;
	}

	addPlayer(socket: WebSocket, name: string): Player {
		const player: Player = {
			id: randomUUID(),
			name,
			socket,
			state: this.spawnState(),
			queue: [],
			ack: -1,
			budget: FRAMES_PER_TICK
		};
		this.players.set(player.id, player);
		this.send(player, {
			type: 'welcome',
			playerId: player.id,
			sessionId: this.id,
			tickRate: TICK_RATE,
			layout: this.layout
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

	/** Queue untrusted input frames from a client. */
	receiveInput(playerId: string, frames: unknown): void {
		const player = this.players.get(playerId);
		if (!player || !Array.isArray(frames)) return;
		for (const raw of frames.slice(0, MAX_FRAMES_PER_MESSAGE)) {
			const frame = sanitizeFrame(raw);
			if (frame && frame.seq > player.ack) player.queue.push(frame);
		}
		// A client far ahead of real time loses its oldest frames rather than growing the queue.
		if (player.queue.length > MAX_QUEUE) player.queue.splice(0, player.queue.length - MAX_QUEUE);
	}

	admin(playerId: string, command: AdminCommand): void {
		const player = this.players.get(playerId);
		if (!player) return;
		if (!config.devMode) {
			log.warn(`Ignored admin command from ${player.name}: DEV_MODE is off`);
			return;
		}
		switch (command.kind) {
			case 'noclip':
			case 'infiniteStamina':
			case 'infiniteBattery':
				player.state.flags[command.kind] = command.enabled === true;
				break;
			case 'teleport': {
				const room = roomPoints(this.layout, PIECES, MAP_KIT).find((r) => r.name === command.room);
				if (!room) return;
				player.state.position = this.freeSpot(room.position);
				player.state.velocity = [0, 0, 0];
				break;
			}
			case 'regenerate':
				this.regenerate(
					typeof command.seed === 'number' && Number.isFinite(command.seed)
						? command.seed >>> 0
						: randomSeed()
				);
				break;
		}
		log.info(`Admin ${command.kind} by ${player.name}`);
	}

	private regenerate(seed: number): void {
		this.seed = seed;
		this.layout = generateLayout(seed, PIECES, MAP_KIT);
		this.world = buildCollisionWorld(this.layout, PIECES);
		for (const player of this.players.values()) {
			const flags = player.state.flags;
			player.state = this.spawnState();
			player.state.flags = flags;
			player.queue = [];
		}
		this.broadcast({ type: 'map', layout: this.layout });
		log.info(`Session ${this.id.slice(0, 8)} regenerated with seed ${seed}`);
	}

	private spawnState(): PlayerState {
		const spawn = spawnPoint(this.layout, PIECES);
		return createPlayerState(this.freeSpot(spawn.position), spawn.yaw);
	}

	private freeSpot(position: PlayerState['position']): PlayerState['position'] {
		return findFreeSpot(this.world, position, MOVEMENT.stances.stand.height, MOVEMENT.radius);
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
		for (const player of this.players.values()) {
			player.budget = Math.min(BUDGET_CAP, player.budget + FRAMES_PER_TICK);
			while (player.budget >= 1 && player.queue.length > 0) {
				const frame = player.queue.shift() as InputFrame;
				stepPlayer(player.state, frame, this.world, DT);
				player.ack = frame.seq;
				player.budget--;
			}
		}
		const players = [...this.players.values()].map((p) => ({
			id: p.id,
			name: p.name,
			state: p.state,
			ack: p.ack
		}));
		this.broadcast({ type: 'tick', tick: this.tick, serverTime: Date.now(), players });
	}

	private broadcast(message: ServerMessage): void {
		for (const player of this.players.values()) this.send(player, message);
	}

	private send(player: Player, message: ServerMessage): void {
		if (player.socket.readyState === player.socket.OPEN) player.socket.send(encode(message));
	}
}
