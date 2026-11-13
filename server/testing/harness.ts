import { vi } from 'vitest';
import type { WebSocket } from 'ws';
import { SIM_RATE, TICK_RATE } from '../../src/lib/shared/constants.ts';
import { emptyInventory } from '../../src/lib/shared/items/inventory.ts';
import type { CollisionWorld } from '../../src/lib/shared/map/collision.ts';
import { buildNav, type NavGrid } from '../../src/lib/shared/map/nav.ts';
import { PIECES } from '../../src/lib/shared/map/pieces.generated.ts';
import { spawnPoint } from '../../src/lib/shared/map/points.ts';
import type { MapLayout, Vec3 } from '../../src/lib/shared/map/types.ts';
import { realMap, realWorld } from '../../src/lib/shared/testing/maps.ts';
import { createPlayerState, eyeHeight, idleFrame } from '../../src/lib/shared/player/simulate.ts';
import type { InputFrame, Inventory, PlayerState } from '../../src/lib/shared/player/types.ts';
import type { ServerMessage } from '../../src/lib/shared/protocol.ts';
import { Session, type SessionHooks } from '../session.ts';

/**
 * Test fixtures for the game server (only imported by *.test.ts files). A real `Session` runs
 * with no database (every store call is skipped when `getDb()` is null), fake sockets that keep
 * what they were sent, and fake timers that drive its tick. See docs/dev/testing.md.
 */

type Message<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

/** A WebSocket that keeps everything sent to it. */
export class FakeSocket {
	readonly OPEN = 1;
	readyState = 1;
	sent: ServerMessage[] = [];
	private handlers = new Map<string, ((data?: unknown) => void)[]>();

	send(raw: string): void {
		this.sent.push(JSON.parse(raw) as ServerMessage);
	}

	close(): void {
		this.readyState = 3;
	}

	on(event: string, handler: (data?: unknown) => void): void {
		this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
	}

	/** The client sends a message (as the server's `message` event gets it). */
	receive(message: object | string): void {
		const raw = typeof message === 'string' ? message : JSON.stringify(message);
		for (const handler of this.handlers.get('message') ?? []) handler(Buffer.from(raw));
	}

	/** The connection closes. */
	hangUp(): void {
		this.close();
		for (const handler of this.handlers.get('close') ?? []) handler();
	}

	/** Every message of a type, oldest first. */
	all<T extends ServerMessage['type']>(type: T): Message<T>[] {
		return this.sent.filter((m): m is Message<T> => m.type === type);
	}

	/** The latest message of a type. */
	last<T extends ServerMessage['type']>(type: T): Message<T> | undefined {
		return this.all(type).at(-1);
	}

	get ws(): WebSocket {
		return this as unknown as WebSocket;
	}
}

/** Fake the clock and the tick timer (call in `beforeEach`; undo with `vi.useRealTimers`). */
export function fakeTime(): void {
	vi.useFakeTimers({
		toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance']
	});
}

/** A new expedition on a known map: `Session` picks its seed with Math.random. */
export function newSession(
	seed: number,
	hooks: SessionHooks = {},
	affliction = 'gloaming'
): Session {
	const random = vi.spyOn(Math, 'random').mockReturnValue(seed / 4294967296);
	try {
		return new Session(affliction, hooks);
	} finally {
		random.mockRestore();
	}
}

/** One player in a `Session`, with what they were sent. */
export class Diver {
	readonly socket = new FakeSocket();
	readonly id: string;
	private seq = 0;

	constructor(
		readonly session: Session,
		name = 'Diver',
		inventory: Inventory = emptyInventory()
	) {
		this.id = session.addPlayer(this.socket.ws, name, `explorer-${name}`, inventory).id;
	}

	/** Their authoritative state (live: changes as the session runs). */
	get state() {
		return this.player.state;
	}

	get player() {
		const player = this.session['players'].get(this.id);
		if (!player) throw new Error(`${this.id} is not in the session`);
		return player;
	}

	get inside(): boolean {
		return this.session.has(this.id);
	}

	/** Stand somewhere, still. */
	put(position: Vec3, yaw = this.state.yaw): void {
		this.state.position = [...position];
		this.state.velocity = [0, 0, 0];
		this.state.yaw = yaw;
	}

	/**
	 * Hold an input for `seconds`: frames go in as a client sends them, and the session ticks.
	 * Look and stance carry over from the state unless the input sets them.
	 */
	hold(input: Partial<InputFrame>, seconds: number): void {
		const perTick = SIM_RATE / TICK_RATE;
		for (let t = 0; t < Math.round(seconds * TICK_RATE); t++) {
			if (!this.inside) return;
			const frames = Array.from({ length: perTick }, () => ({
				...idleFrame(this.seq, this.state),
				...input,
				seq: this.seq++
			}));
			this.session.receiveInput(this.id, frames);
			vi.advanceTimersByTime(1000 / TICK_RATE);
		}
	}

	/** Where they see from. */
	get eye(): Vec3 {
		const s = this.state;
		return [s.position[0], s.position[1] + eyeHeight(s), s.position[2]];
	}

	/** The look (yaw and pitch, for an input) that points the eye at `target`. */
	lookAt(target: Vec3): { yaw: number; pitch: number } {
		const [ex, ey, ez] = this.eye;
		const dx = target[0] - ex;
		const dz = target[2] - ez;
		return {
			yaw: Math.atan2(-dx, -dz),
			pitch: Math.atan2(target[1] - ey, Math.hypot(dx, dz))
		};
	}

	/** One press of a button (e.g. attack, drop): pressed for a frame, then released. */
	press(input: Partial<InputFrame>): void {
		this.hold(input, 1 / TICK_RATE);
		this.hold({ ...input, ...released(input) }, 1 / TICK_RATE);
	}
}

/** The same input with every button let go. */
function released(input: Partial<InputFrame>): Partial<InputFrame> {
	const out: Partial<InputFrame> = {};
	for (const [key, value] of Object.entries(input)) {
		if (typeof value === 'boolean') Object.assign(out, { [key]: false });
	}
	return out;
}

/** A real map as a session builds it (layout, collision world, nav grid), cached per seed. */
export function mapFixture(seed: number) {
	let map = maps.get(seed);
	if (!map) {
		const layout = realMap(seed);
		const world = realWorld(layout);
		const start = spawnPoint(layout, PIECES).position;
		const nav = buildNav(world, layout, PIECES, start);
		map = { layout, world, nav, start, seed };
		maps.set(seed, map);
	}
	return map;
}

const maps = new Map<
	number,
	{ layout: MapLayout; world: CollisionWorld; nav: NavGrid; start: Vec3; seed: number }
>();

/** A player standing somewhere, for the directors (creatures, the Affliction) to see. */
export function prey(id: string, position: Vec3, yaw = 0): { id: string; state: PlayerState } {
	const state = createPlayerState(position, yaw);
	state.grounded = true;
	return { id, state };
}

/** Let the session tick on its own for `seconds` (players send nothing). */
export function wait(seconds: number): void {
	vi.advanceTimersByTime(seconds * 1000);
}
