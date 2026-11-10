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
import { LEVEL_HEIGHT } from '../src/lib/shared/map/grid.ts';
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
	/**
	 * Frames simulated so far, measured against wall-clock time since `clock`: a player can never
	 * be simulated faster than real time, but one that fell behind (network hiccup) catches up.
	 */
	processed: number;
	clock: number | null;
	joinedAt: number;
	/** Deepest level reached below the start (0 = the start level). */
	deepestLevel: number;
}

const DT = 1 / SIM_RATE;
/** Most unused real time a player can bank (e.g. after a pause), in frames: bounds speed bursts. */
const MAX_BANKED = SIM_RATE / 2;
const MAX_QUEUE = SIM_RATE * 2;
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
	private hadPlayers = false;

	get playerCount(): number {
		return this.players.size;
	}

	/** Everyone who joined has extracted or left: this expedition is over. */
	get ended(): boolean {
		return this.hadPlayers && this.players.size === 0;
	}

	has(playerId: string): boolean {
		return this.players.has(playerId);
	}

	addPlayer(socket: WebSocket, name: string): Player {
		const player: Player = {
			id: randomUUID(),
			name,
			socket,
			state: this.spawnState(),
			queue: [],
			ack: -1,
			processed: 0,
			clock: null,
			joinedAt: Date.now(),
			deepestLevel: 0
		};
		this.players.set(player.id, player);
		this.hadPlayers = true;
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
		if (this.players.size === 0) {
			this.stop();
			log.info(`Expedition ${this.id.slice(0, 8)} ended`);
		}
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
		const now = performance.now();
		for (const player of this.players.values()) {
			if (player.queue.length === 0) continue;
			player.clock ??= now;
			const due = Math.floor(((now - player.clock) / 1000) * SIM_RATE) + 1;
			// Don't let a long pause bank more than MAX_BANKED frames of catch-up.
			if (due - player.processed > MAX_BANKED) player.processed = due - MAX_BANKED;
			while (player.processed < due && player.queue.length > 0 && !player.state.extracted) {
				const frame = player.queue.shift() as InputFrame;
				stepPlayer(player.state, frame, this.world, DT);
				player.ack = frame.seq;
				player.processed++;
			}
			const level = Math.round(-player.state.position[1] / LEVEL_HEIGHT);
			player.deepestLevel = Math.max(player.deepestLevel, level);
		}
		for (const player of [...this.players.values()]) {
			if (!player.state.extracted) continue;
			this.send(player, {
				type: 'extracted',
				seconds: Math.round((Date.now() - player.joinedAt) / 1000),
				deepestLevel: player.deepestLevel
			});
			log.info(`Player ${player.name} extracted from session ${this.id.slice(0, 8)}`);
			this.removePlayer(player.id);
		}
		if (this.players.size === 0) return;
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
