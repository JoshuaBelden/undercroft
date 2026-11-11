import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { CREATURES } from '../src/lib/content/creatures.ts';
import { MAP_KIT } from '../src/lib/content/map/kit.ts';
import { SANITY } from '../src/lib/content/player/sanity.ts';
import { MOVEMENT } from '../src/lib/content/player/movement.ts';
import { SIM_RATE, TICK_RATE } from '../src/lib/shared/constants.ts';
import {
	buildCollisionWorld,
	findFreeSpot,
	segmentBlocked,
	type CollisionWorld
} from '../src/lib/shared/map/collision.ts';
import {
	creatureLight,
	halfLightVisible,
	illumination
} from '../src/lib/shared/creature/visibility.ts';
import { generateLayout } from '../src/lib/shared/map/generate.ts';
import { LEVEL_HEIGHT } from '../src/lib/shared/map/grid.ts';
import { buildNav, type NavGrid } from '../src/lib/shared/map/nav.ts';
import { PIECES } from '../src/lib/shared/map/pieces.generated.ts';
import { occupiedCells } from '../src/lib/shared/map/grid.ts';
import { ITEMS } from '../src/lib/content/items.ts';
import { DEFAULT_HEADLAMP } from '../src/lib/content/items/headlamps.ts';
import {
	addItem,
	allStacks,
	applyAction,
	defenseReduction,
	held,
	newStack,
	quickWith,
	sanitizeAction,
	spendQuick
} from '../src/lib/shared/items/inventory.ts';
import type { GameEvent } from '../src/lib/shared/items/types.ts';
import { aimRay, reequip } from '../src/lib/shared/items/weapons.ts';
import { roomPoints, spawnPoint } from '../src/lib/shared/map/points.ts';
import type { MapLayout, Vec3 } from '../src/lib/shared/map/types.ts';
import { headlampOutput } from '../src/lib/shared/player/headlamp.ts';
import {
	createPlayerState,
	eyeHeight,
	sanitizeFrame,
	stepPlayer
} from '../src/lib/shared/player/simulate.ts';
import type {
	InputFrame,
	Inventory,
	PlayerState,
	SimEvent
} from '../src/lib/shared/player/types.ts';
import { encode, type AdminCommand, type ServerMessage } from '../src/lib/shared/protocol.ts';
import { randomSeed } from '../src/lib/shared/rng.ts';
import { config } from './config.ts';
import { hurt as hurtCreature, resolve, targets, type CombatContext } from './combat.ts';
import { AfflictionDirector } from './affliction.ts';
import { RiteDirector, scatterRite } from './rite.ts';
import { CreatureDirector } from './creatures.ts';
import { WorldItems } from './items.ts';
import { log } from './log.ts';

interface Player {
	id: string;
	/** Whose player this is, for the session's owner (the explorer id). */
	owner: string;
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
	/** Most recent input simulated (held buttons the server acts on, like revive). */
	lastInput: InputFrame | null;
}

const DT = 1 / SIM_RATE;
/** Most unused real time a player can bank (e.g. after a pause), in frames: bounds speed bursts. */
const MAX_BANKED = SIM_RATE / 2;
const MAX_QUEUE = SIM_RATE * 2;
const MAX_FRAMES_PER_MESSAGE = 30;
const TICK_DT = 1 / TICK_RATE;
/** A downed player with nobody able to help uses their own salts after this many seconds. */
const SELF_REVIVE_DELAY = 3;
/** Below this much lamp light from teammates, a player with their lamp off is in the dark. */
const DARK = 0.02;
/** Half-angle (radians) of the view cone used for "seeing" a creature. */
const VIEW_HALF_ANGLE = 0.9;

/** Lets the owner (the party) follow who is still down there. */
export interface SessionHooks {
	/**
	 * A player extracted, died, was carried out or left. `carried` is what they brought out with
	 * them; null if they didn't make it (it stays in the catacombs).
	 */
	onPlayerLeft?: (owner: string, carried: Inventory | null) => void;
	/** The last player left: the expedition is over. */
	onEnded?: () => void;
	/** A clue was found (or revealed by an admin): this many are now known. */
	onClues?: (clues: number) => void;
	/** The rite was performed: the Affliction is resolved for everyone in the expedition. */
	onResolved?: () => void;
	/** An admin wiped what is known about the rite. */
	onRiteReset?: () => void;
}

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
	private nav: NavGrid = this.buildNav();
	private creatures = new CreatureDirector(this.world, this.nav, this.seed);
	private items = new WorldItems(this.world);
	private affliction = new AfflictionDirector(this.world, this.nav, this.creatures, this.seed);
	private rite = new RiteDirector(this.affliction.def.rite, this.layout, PIECES);
	/** The rite has been performed: everyone is carried out at the end of this tick. */
	private resolved = false;
	/** Events this tick, broadcast with it. */
	private events: GameEvent[] = [];
	private dropped = new Set<string>();
	private players = new Map<string, Player>();
	/** Dead players still watching: they get ticks but are not in the simulation. */
	private spectators = new Map<string, { name: string; socket: WebSocket }>();
	/** Players who got out alive (climbed out, or were carried out by a banishing). */
	private escaped = 0;
	private tick = 0;
	private timer: NodeJS.Timeout | null = null;
	private hadPlayers = false;

	constructor(private hooks: SessionHooks = {}) {
		this.populate();
	}

	/** Creatures and loose items for the current map. */
	private populate(): void {
		const start = spawnPoint(this.layout, PIECES).position;
		this.creatures.populate(start);
		const cells = new Set<string>();
		for (const placement of this.layout.placements) {
			const piece = PIECES[placement.piece];
			if (!piece) continue;
			for (const [x, z, level] of occupiedCells(piece, placement)) cells.add(`${x},${z},${level}`);
		}
		this.items.scatter(this.nav, this.seed, start, cells.size);
		this.items.scatterLoot(this.nav, this.seed, start, cells.size);
		scatterRite(
			this.affliction.def.rite,
			this.layout,
			PIECES,
			MAP_KIT,
			this.nav,
			start,
			this.seed,
			this.items
		);
	}

	/** Which Affliction this expedition is against (key into AFFLICTIONS). */
	get afflictionId(): string {
		return this.affliction.def.id;
	}

	/** Start from the clues the party already found on earlier runs. */
	revealClues(clues: number): void {
		this.rite.reveal(clues);
		if (this.rite.complete) this.items.removeAll('clue');
	}

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

	/** `inventory` is what they bring down: their loadout. */
	addPlayer(socket: WebSocket, name: string, owner: string, inventory: Inventory): Player {
		const player: Player = {
			id: randomUUID(),
			owner,
			name,
			socket,
			state: this.spawnState(inventory),
			queue: [],
			ack: -1,
			processed: 0,
			clock: null,
			joinedAt: Date.now(),
			deepestLevel: 0,
			lastInput: null
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

	/**
	 * A dropped player is back on a new connection: they pick up where they stood. Their input
	 * numbering may have restarted (page reload), so acknowledgement starts over.
	 */
	reattach(playerId: string, socket: WebSocket): boolean {
		const player = this.players.get(playerId);
		if (!player) return false;
		player.socket = socket;
		player.queue = [];
		player.ack = -1;
		player.processed = 0;
		player.clock = null;
		player.lastInput = null;
		this.send(player, {
			type: 'welcome',
			playerId: player.id,
			sessionId: this.id,
			tickRate: TICK_RATE,
			layout: this.layout
		});
		log.info(`Player ${player.name} reconnected to session ${this.id.slice(0, 8)}`);
		return true;
	}

	/** Stop sending ticks to a dead player who was watching. */
	removeSpectator(playerId: string): void {
		this.spectators.delete(playerId);
	}

	/**
	 * Take a player out of the expedition. `carried` is what they got out with; left out (they
	 * died, dropped for good, or walked away from the party) it is lost.
	 */
	removePlayer(playerId: string, carried: Inventory | null = null): void {
		this.spectators.delete(playerId);
		const player = this.players.get(playerId);
		if (!player) return;
		this.players.delete(playerId);
		log.info(`Player ${player.name} left session ${this.id.slice(0, 8)}`);
		this.hooks.onPlayerLeft?.(player.owner, carried);
		if (this.players.size === 0) {
			this.stop();
			log.info(`Expedition ${this.id.slice(0, 8)} ended`);
			for (const spectator of this.spectators.values()) {
				this.sendTo(spectator.socket, { type: 'spectateEnd', escaped: this.escaped });
			}
			this.spectators.clear();
			this.hooks.onEnded?.();
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

	/** A request from the pack screen: move, equip or split something, or drop it on the floor. */
	inventory(playerId: string, raw: unknown): void {
		const player = this.players.get(playerId);
		const action = sanitizeAction(raw);
		if (!player || !action) return;
		const s = player.state;
		if (s.downed || s.dead || s.extracted) return;
		const inv = s.inventory;
		const inHand = held(inv);
		const { dropped } = applyAction({ inventory: inv }, action);
		if (dropped) {
			const { origin, direction } = aimRay(s, eyeHeight(s));
			this.items.drop(dropped, origin, direction);
			this.events.push({ kind: 'drop', player: player.id, item: dropped.item, position: origin });
		}
		// What's in the hand changed: whatever it was doing stops and the new item comes up.
		if (held(inv) !== inHand) reequip(s.weapon);
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
			case 'godMode':
				player.state.flags[command.kind] = command.enabled === true;
				break;
			case 'spawnCreature':
				this.creatures.spawnNear(player.state);
				break;
			case 'clearCreatures':
				this.creatures.clear();
				break;
			case 'killCreatures':
				this.creatures.killAll();
				break;
			case 'setMeter':
				if (typeof command.value === 'number' && Number.isFinite(command.value)) {
					this.affliction.setMeter(command.value);
				}
				break;
			case 'manifest':
				this.affliction.setMeter(1);
				break;
			case 'banish':
				this.affliction.banish();
				break;
			case 'infiniteAmmo':
				player.state.flags.infiniteAmmo = command.enabled === true;
				break;
			case 'give': {
				if (typeof command.item !== 'string' || !ITEMS[command.item]) return;
				const count = Math.max(1, Math.min(99, Math.floor(Number(command.count) || 1)));
				const magazine = ITEMS[command.item].firearm?.magazine;
				addItem(player.state.inventory, newStack(command.item, count, magazine));
				break;
			}
			case 'refillAmmo':
				for (const slot of ['primary', 'secondary'] as const) {
					const stack = player.state.inventory.equipment[slot];
					const gun = stack ? ITEMS[stack.item]?.firearm : undefined;
					if (!stack || !gun) continue;
					stack.loaded = gun.magazine;
					addItem(player.state.inventory, newStack(gun.ammo, gun.magazine * 4));
				}
				break;
			case 'setSanity': {
				const value =
					typeof command.value === 'number' && Number.isFinite(command.value)
						? command.value
						: SANITY.max;
				player.state.sanity = Math.max(0, Math.min(SANITY.max, value));
				if (player.state.sanity <= 0) this.down(player);
				else if (player.state.downed) this.revive(player);
				break;
			}
			case 'revealClues':
				this.revealClues(Infinity);
				this.hooks.onClues?.(this.rite.clues);
				break;
			case 'resetRite':
				this.rite.reset();
				this.hooks.onRiteReset?.();
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
		this.nav = this.buildNav();
		this.creatures = new CreatureDirector(this.world, this.nav, seed);
		this.items = new WorldItems(this.world);
		this.affliction = new AfflictionDirector(this.world, this.nav, this.creatures, seed);
		const clues = this.rite.clues;
		this.rite = new RiteDirector(this.affliction.def.rite, this.layout, PIECES);
		this.populate();
		this.revealClues(clues);
		for (const player of this.players.values()) {
			const flags = player.state.flags;
			player.state = this.spawnState(player.state.inventory);
			player.state.flags = flags;
			player.queue = [];
		}
		this.broadcast({ type: 'map', layout: this.layout });
		log.info(`Session ${this.id.slice(0, 8)} regenerated with seed ${seed}`);
	}

	private buildNav(): NavGrid {
		const started = performance.now();
		const nav = buildNav(this.world, this.layout, PIECES, spawnPoint(this.layout, PIECES).position);
		log.info(
			`Nav grid: ${nav.points.length} points in ${Math.round(performance.now() - started)} ms`
		);
		return nav;
	}

	private spawnState(inventory: Inventory): PlayerState {
		const spawn = spawnPoint(this.layout, PIECES);
		return createPlayerState(this.freeSpot(spawn.position), spawn.yaw, inventory);
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
				const pressedInteract = frame.interact && !player.lastInput?.interact;
				const events: SimEvent[] = [];
				stepPlayer(player.state, frame, this.world, DT, MOVEMENT, DEFAULT_HEADLAMP, events);
				resolve(this.combat(), player, events);
				if (pressedInteract) this.pickUp(player);
				player.lastInput = frame;
				player.ack = frame.seq;
				player.processed++;
			}
			const level = Math.round(-player.state.position[1] / LEVEL_HEIGHT);
			player.deepestLevel = Math.max(player.deepestLevel, level);
		}
		this.stepCreatures();
		this.stepAffliction();
		this.stepProjectiles();
		this.stepSanity();
		this.stepRevives();
		this.stepRite();
		// Anyone still alive down here after this tick? The dead can watch them.
		const alive = [...this.players.values()].some((p) => !p.state.dead && !p.state.extracted);
		for (const player of [...this.players.values()]) {
			if (player.state.dead && !this.dropped.has(player.id)) {
				// Everything they carried stays where they fell, for anyone to pick up.
				this.dropped.add(player.id);
				this.items.dropAll(allStacks(player.state.inventory), player.state.position);
			}
			if (!player.state.extracted && !player.state.dead) continue;
			const result = {
				seconds: Math.round((Date.now() - player.joinedAt) / 1000),
				deepestLevel: player.deepestLevel
			};
			if (player.state.dead) {
				this.send(player, { type: 'died', ...result, spectating: alive });
				log.info(`Player ${player.name} died in session ${this.id.slice(0, 8)}`);
			} else {
				this.escaped++;
				this.send(player, {
					type: 'extracted',
					...result,
					carried: allStacks(player.state.inventory)
				});
				log.info(`Player ${player.name} extracted from session ${this.id.slice(0, 8)}`);
			}
			this.removePlayer(player.id, player.state.dead ? null : player.state.inventory);
			if (player.state.dead && alive) {
				this.spectators.set(player.id, { name: player.name, socket: player.socket });
			}
		}
		if (this.resolved && this.players.size > 0) {
			log.info(`Session ${this.id.slice(0, 8)}: the rite is performed`);
			this.hooks.onResolved?.();
			for (const player of [...this.players.values()]) {
				this.escaped++;
				this.send(player, {
					type: 'resolved',
					seconds: Math.round((Date.now() - player.joinedAt) / 1000),
					deepestLevel: player.deepestLevel,
					carried: allStacks(player.state.inventory)
				});
				this.removePlayer(player.id, player.state.inventory);
			}
		}
		if (this.affliction.banished && this.players.size > 0) {
			log.info(`Session ${this.id.slice(0, 8)}: banished`);
			for (const player of [...this.players.values()]) {
				this.escaped++;
				this.send(player, {
					type: 'banished',
					seconds: Math.round((Date.now() - player.joinedAt) / 1000),
					deepestLevel: player.deepestLevel,
					carried: allStacks(player.state.inventory)
				});
				this.removePlayer(player.id, player.state.inventory);
			}
		}
		if (this.players.size === 0) return;
		const players = [...this.players.values()].map((p) => ({
			id: p.id,
			name: p.name,
			state: p.state,
			ack: p.ack
		}));
		this.broadcast({
			type: 'tick',
			tick: this.tick,
			serverTime: Date.now(),
			players,
			creatures: this.creatures.snapshots(),
			items: this.items.snapshots(),
			projectiles: this.items.projectileSnapshots(),
			events: this.events,
			affliction: { ...this.affliction.snapshot(config.devMode), rite: this.rite.snapshot() }
		});
		this.events = [];
	}

	private combat(): CombatContext {
		return {
			world: this.world,
			creatures: this.creatures,
			affliction: this.affliction,
			items: this.items,
			out: this.events
		};
	}

	/** Interact pressed: pick up the item the player is looking at, if any. */
	private pickUp(player: Player): void {
		const s = player.state;
		if (s.downed || s.dead || s.swimming) return;
		const { origin, direction } = aimRay(s, eyeHeight(s));
		const item = this.items.lookedAt(s, origin, direction);
		if (!item) return;
		const position: Vec3 = [...item.position];
		if (ITEMS[item.stack.item]?.kind === 'clue') {
			// Read where it lies. One that tells nothing new (another copy) is left alone.
			const found = this.rite.find();
			if (!found) return;
			this.items.remove(item.id);
			if (this.rite.complete) this.items.removeAll('clue');
			this.events.push({ kind: 'clue', player: player.id, position, ...found });
			this.hooks.onClues?.(this.rite.clues);
			log.info(`${player.name} found a clue (${this.rite.clues}) in ${this.id.slice(0, 8)}`);
			return;
		}
		const taken = this.items.pickUp(s, item);
		if (taken) this.events.push({ kind: 'pickup', player: player.id, item: taken, position });
	}

	/** The meter, omens and the manifestation; banishing it ends the expedition for everyone. */
	private stepAffliction(): void {
		const before = this.affliction.stage;
		const manifested = this.affliction.manifested;
		const prey = [...this.players.values()].map((p) => ({ id: p.id, state: p.state }));
		for (const hit of this.affliction.step(prey)) {
			const player = this.players.get(hit.playerId);
			if (player) this.hurt(player, hit.amount);
		}
		if (this.affliction.stage !== before) {
			this.events.push({ kind: 'omen', stage: this.affliction.stage });
			log.info(`Session ${this.id.slice(0, 8)} omen stage ${this.affliction.stage}`);
		}
		if (!manifested && this.affliction.manifested) {
			this.events.push({ kind: 'manifest' });
			log.info(`Session ${this.id.slice(0, 8)}: the Affliction manifests`);
		}
	}

	/** Thrown items: hit creatures, land, make noise. */
	private stepProjectiles(): void {
		const ctx = this.combat();
		for (const result of this.items.stepProjectiles(targets(ctx))) {
			if (result.kind === 'hitCreature') {
				const thrower = this.players.get(result.thrower);
				hurtCreature(ctx, result.creature, result.damage, thrower ?? null);
			} else {
				this.events.push({ kind: 'land', item: result.item, position: result.position });
				// No source: creatures go and look where it landed (a lure).
				this.creatures.hear(result.position, result.noise, null);
			}
		}
	}

	private stepCreatures(): void {
		const prey = [...this.players.values()].map((p) => ({ id: p.id, state: p.state }));
		for (const hit of this.creatures.step(prey)) {
			const player = this.players.get(hit.playerId);
			// What is worn takes some of a blow.
			if (player) {
				this.hurt(player, hit.damage * (1 - defenseReduction(player.state.inventory)));
			}
		}
	}

	/** Darkness and seeing creatures wear sanity down. */
	private stepSanity(): void {
		const states = [...this.players.values()].map((p) => p.state);
		const bodies = this.creatures.bodies();
		for (const player of this.players.values()) {
			const s = player.state;
			if (s.downed || s.dead || s.extracted) continue;
			const eye: Vec3 = [s.position[0], s.position[1] + eyeHeight(s), s.position[2]];
			let drain = 0;
			if (!headlampOutput(s).on) {
				const others = states.filter((o) => o !== s);
				if (illumination(this.world, others, eye) < DARK) drain += SANITY.darknessDrain;
			}
			if (bodies.some((b) => this.sees(s, eye, b.position, b.kind, states))) {
				drain += SANITY.seeingDrain;
			}
			if (drain > 0) this.hurt(player, drain * TICK_DT);
		}
	}

	/** A creature is in front of the player, in line of sight, within range and in half-light. */
	private sees(
		s: PlayerState,
		eye: Vec3,
		position: Vec3,
		kind: string,
		states: PlayerState[]
	): boolean {
		const def = CREATURES[kind];
		if (!def) return false;
		const mid: Vec3 = [position[0], position[1] + def.height * 0.6, position[2]];
		const d: Vec3 = [mid[0] - eye[0], mid[1] - eye[1], mid[2] - eye[2]];
		const dist = Math.hypot(d[0], d[1], d[2]);
		if (dist > SANITY.seeingRange || dist < 1e-3) return false;
		const cp = Math.cos(s.pitch);
		const look: Vec3 = [-Math.sin(s.yaw) * cp, Math.sin(s.pitch), -Math.cos(s.yaw) * cp];
		const along = (d[0] * look[0] + d[1] * look[1] + d[2] * look[2]) / dist;
		if (along < Math.cos(VIEW_HALF_ANGLE)) return false;
		const light = creatureLight(this.world, states, position, def.height);
		if (!halfLightVisible(light, def.visibleBand)) return false;
		return !segmentBlocked(this.world, eye, mid);
	}

	/**
	 * Holding interact next to a downed teammate, with something that revives (smelling salts) in
	 * a quick-use slot, revives them. When nobody is able to help (solo, or everyone else is
	 * down), a downed player's own are used.
	 */
	private stepRevives(): void {
		const players = [...this.players.values()];
		const able = players.filter((p) => !p.state.downed && !p.state.dead && !p.state.extracted);
		for (const reviver of players) {
			const s = reviver.state;
			const patient =
				!s.downed && !s.dead && quickWith(s.inventory, 'revive') >= 0 && reviver.lastInput?.interact
					? players.find(
							(p) =>
								p !== reviver &&
								p.state.downed &&
								!p.state.dead &&
								Math.hypot(
									p.state.position[0] - s.position[0],
									p.state.position[1] - s.position[1],
									p.state.position[2] - s.position[2]
								) <= SANITY.reviveRange
						)
					: undefined;
			if (!patient) {
				s.reviving = 0;
				continue;
			}
			s.reviving += TICK_DT;
			if (s.reviving >= SANITY.reviveSeconds) {
				s.reviving = 0;
				spendQuick(s.inventory, quickWith(s.inventory, 'revive'));
				this.revive(patient);
				log.info(`${reviver.name} revived ${patient.name}`);
			}
		}
		for (const player of players) {
			const s = player.state;
			if (!s.downed || s.dead || s.downedTime < SELF_REVIVE_DELAY) continue;
			const salts = quickWith(s.inventory, 'revive');
			if (salts < 0) continue;
			if (able.some((p) => p !== player)) continue;
			spendQuick(s.inventory, salts);
			this.revive(player);
		}
	}

	/**
	 * The rite: whoever carries everything it needs, in its room, holds interact. When it is done
	 * the Affliction is resolved and everyone is carried out (see `step`).
	 */
	private stepRite(): void {
		const seconds = this.affliction.def.rite.seconds;
		for (const player of this.players.values()) {
			const s = player.state;
			const able = !s.downed && !s.dead && !s.extracted;
			if (!able || !player.lastInput?.interact || !this.rite.canPerform(s)) {
				s.performing = 0;
				continue;
			}
			s.performing += TICK_DT;
			if (s.performing < seconds || this.resolved) continue;
			this.rite.take(s);
			this.resolved = true;
			log.info(`${player.name} performed the rite in ${this.id.slice(0, 8)}`);
		}
	}

	private hurt(player: Player, amount: number): void {
		const s = player.state;
		if (s.flags.godMode || s.downed || s.dead) return;
		s.sanity = Math.max(0, s.sanity - amount);
		if (s.sanity <= 0) this.down(player);
	}

	private down(player: Player): void {
		const s = player.state;
		s.sanity = 0;
		s.downed = true;
		s.downedTime = 0;
		s.mantle = null;
		s.extracting = 0;
		s.bandaging = 0;
		s.reviving = 0;
		log.info(`Player ${player.name} is down`);
	}

	private revive(player: Player): void {
		const s = player.state;
		s.downed = false;
		s.downedTime = 0;
		s.sanity = Math.max(s.sanity, SANITY.reviveTo);
	}

	/** To everyone down here, and the dead who are watching. */
	private broadcast(message: ServerMessage): void {
		const encoded = encode(message);
		for (const player of this.players.values()) this.sendTo(player.socket, encoded);
		for (const spectator of this.spectators.values()) this.sendTo(spectator.socket, encoded);
	}

	private send(player: Player, message: ServerMessage): void {
		this.sendTo(player.socket, message);
	}

	private sendTo(socket: WebSocket, message: ServerMessage | string): void {
		if (socket.readyState !== socket.OPEN) return;
		socket.send(typeof message === 'string' ? message : encode(message));
	}
}
