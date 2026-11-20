import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { achievementsForRun } from '../src/lib/content/achievements.ts';
import { MAP_KIT } from '../src/lib/content/map/kit.ts';
import { SANITY } from '../src/lib/content/player/sanity.ts';
import { FALL, MOVEMENT } from '../src/lib/content/player/movement.ts';
import { type ClimberSpot } from '../src/lib/shared/player/climb.ts';
import { SIM_RATE, TICK_RATE } from '../src/lib/shared/constants.ts';
import {
	buildCollisionWorld,
	findFreeSpot,
	type CollisionWorld
} from '../src/lib/shared/map/collision.ts';
import { generateLayout } from '../src/lib/shared/map/generate.ts';
import { AFFLICTIONS, DEFAULT_AFFLICTION } from '../src/lib/content/afflictions.ts';
import { buildNav, type NavGrid } from '../src/lib/shared/map/nav.ts';
import { PIECES } from '../src/lib/shared/map/pieces.generated.ts';
import { occupiedCells } from '../src/lib/shared/map/grid.ts';
import { DEFAULT_MARK_WHEEL } from '../src/lib/content/marks.ts';
import { tierAt, tierCells } from '../src/lib/shared/map/doors.ts';
import { DEFAULT_HEADLAMP } from '../src/lib/content/items/headlamps.ts';
import { ITEMS } from '../src/lib/content/items.ts';
import { discoverable, recipesUsing } from '../src/lib/shared/items/crafting.ts';
import { allStacks, removeItem } from '../src/lib/shared/items/inventory.ts';
import type { GameEvent } from '../src/lib/shared/items/types.ts';
import { placeCrates } from '../src/lib/shared/map/crates.ts';
import {
	creatureSpawns,
	entryPoint,
	rubbleSites,
	spawnPoint
} from '../src/lib/shared/map/points.ts';
import type { MapLayout, Vec3 } from '../src/lib/shared/map/types.ts';
import { headlampOutput } from '../src/lib/shared/player/headlamp.ts';
import { createPlayerState, sanitizeFrame, stepPlayer } from '../src/lib/shared/player/simulate.ts';
import type {
	InputFrame,
	Inventory,
	PlayerState,
	SimEvent
} from '../src/lib/shared/player/types.ts';
import {
	encode,
	type AdminCommand,
	type ExpeditionSummary,
	type ServerMessage
} from '../src/lib/shared/protocol.ts';
import { randomSeed } from '../src/lib/shared/rng.ts';
import { config } from './config.ts';
import { resolve, type CombatContext } from './combat.ts';
import { AfflictionDirector } from './affliction.ts';
import { crashMessage, serverCrash } from './errors.ts';
import { carriedValue, logRun } from './stats.ts';
import type { RunOutcome } from '../src/lib/server/store/runs.ts';
import { RiteDirector, scatterRite } from './rite.ts';
import { Crates } from './crates.ts';
import { Doors } from './doors.ts';
import { CreatureDirector } from './creatures.ts';
import { WorldItems } from './items.ts';
import { createSystems } from './systems/index.ts';
import type { AdminHandlers, Player, SessionContext, SessionSystem } from './systems/system.ts';
import { log } from './log.ts';

export type { Player } from './systems/system.ts';

const DT = 1 / SIM_RATE;
/** Most unused real time a player can bank (e.g. after a pause), in frames: bounds speed bursts. */
const MAX_BANKED = SIM_RATE / 2;
const MAX_QUEUE = SIM_RATE * 2;
const MAX_FRAMES_PER_MESSAGE = 30;

/** The map for a seed: the layout, and which of its crate markers have a crate. */
function generate(seed: number, affliction: string): MapLayout {
	const layout = generateLayout(seed, PIECES, MAP_KIT, { affliction });
	layout.crates = placeCrates(layout, PIECES, seed);
	return layout;
}

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
	/** A player saw something in a lootable: where (docs/dev/crafting.md#discovery). */
	onDiscovered?: (owner: string, item: string, source: string) => void;
}

/**
 * One expedition. Server-authoritative: the map and every player's state live here. Solo play is
 * a session with a single player.
 *
 * The session is the host: it builds the map, takes players in and out, simulates their input
 * and broadcasts the tick. What each feature does down there is a system (server/systems/,
 * docs/dev/session.md), run from here through its hooks.
 */
export class Session implements SessionContext {
	readonly id = randomUUID();
	/** Map seed, kept for logs, admin tools and reproducing a layout. */
	seed = randomSeed();
	/** Authoritative map layout, sent to clients in `welcome`. */
	layout!: MapLayout;
	// Everything built from the map: set by `build`, from the constructor and `regenerate`.
	world!: CollisionWorld;
	nav!: NavGrid;
	creatures!: CreatureDirector;
	items!: WorldItems;
	crates!: Crates;
	doors!: Doors;
	affliction!: AfflictionDirector;
	rite!: RiteDirector;
	/** Which level of the map each occupied cell is on (deepest level reached). */
	private tiers = new Map<string, number>();
	/** Items not put in this map: quest items someone in the party already owns. */
	private withheld = new Set<string>();
	/** Events this tick, broadcast with it. */
	events: GameEvent[] = [];
	/** How many of `events` have been counted toward players' stats (see `tally`). */
	private tallied = 0;
	private dropped = new Set<string>();
	readonly players = new Map<string, Player>();
	/** Dead players still watching: they get ticks but are not in the simulation. */
	private spectators = new Map<string, { name: string; socket: WebSocket }>();
	/** Players who got out alive. */
	private escaped = 0;
	private tick = 0;
	private timer: NodeJS.Timeout | null = null;
	private hadPlayers = false;
	/** How many players went down (for game stats). */
	joined = 0;
	/** Players whose run has been written (server/stats.ts), so each is written once. */
	private logged = new Set<string>();
	/**
	 * The world items list as last sent in a tick. A tick leaves the list out while it is unchanged;
	 * null makes the next tick carry it (a new map, someone arriving or reconnecting).
	 */
	private itemsSent: string | null = null;
	/** Every feature's part in the expedition, by name (server/systems/index.ts). */
	readonly systems = createSystems(this);
	/** The same, in order: hooks and steps run in this order. */
	private ordered: SessionSystem[] = Object.values(this.systems);
	/** Admin commands, each carried out by one system (or the session itself). */
	private adminHandlers: AdminHandlers = this.collectAdmin();

	/** `affliction` is the one the party's host chose (key into AFFLICTIONS). */
	constructor(
		private chosen: string,
		readonly hooks: SessionHooks = {}
	) {
		if (!AFFLICTIONS[chosen]) this.chosen = DEFAULT_AFFLICTION.id;
		this.build(this.seed);
	}

	/** Generate the map for a seed (with the chosen Affliction's own pieces) and fill it. */
	private build(seed: number): void {
		this.layout = generate(seed, this.chosen);
		this.world = buildCollisionWorld(this.layout, PIECES);
		this.nav = this.buildNav();
		this.doors = new Doors(this.world, this.nav, this.layout.doors);
		this.tiers = tierCells(this.layout, PIECES);
		this.creatures = new CreatureDirector(
			this.world,
			this.nav,
			creatureSpawns(this.layout, PIECES),
			seed
		);
		this.items = new WorldItems(this.world);
		this.itemsSent = null;
		this.affliction = new AfflictionDirector(
			this.world,
			this.nav,
			this.creatures,
			this.seed,
			this.chosen
		);
		this.rite = new RiteDirector(this.affliction.def.rite, this.layout, PIECES);
		this.populate();
		for (const system of this.ordered) system.mapBuilt?.();
	}

	/** Creatures and loose items for the current map. */
	private populate(): void {
		// Measured from where the catacombs begin: the foot of the start room's rope.
		const start = entryPoint(this.world, this.layout, PIECES);
		this.creatures.populate(start, (p) => tierAt(this.tiers, p));
		const cells = new Set<string>();
		for (const placement of this.layout.placements) {
			const piece = PIECES[placement.piece];
			if (!piece) continue;
			for (const [x, z, level] of occupiedCells(piece, placement)) cells.add(`${x},${z},${level}`);
		}
		this.crates = new Crates(
			this.world,
			this.layout.crates,
			this.nav,
			start,
			this.seed,
			this.layout.doors.filter((door) => door.kind === 'gate').length
		);
		this.items.scatter(this.nav, this.seed, start, rubbleSites(this.layout, PIECES));
		this.items.scatterLoot(this.nav, this.seed, start, cells.size);
		scatterRite(
			this.affliction.def.rite,
			{
				layout: this.layout,
				pieces: PIECES,
				kit: MAP_KIT,
				world: this.world,
				nav: this.nav,
				start,
				seed: this.seed
			},
			this.items,
			this.crates,
			this.withheld
		);
	}

	/** Every system's admin commands in one table; two systems may not claim the same one. */
	private collectAdmin(): AdminHandlers {
		const handlers: Record<string, unknown> = {
			throw: () => {
				throw new Error('Test error from the admin panel');
			},
			regenerate: (_player: Player, command: AdminCommand & { kind: 'regenerate' }) =>
				this.regenerate(
					typeof command.seed === 'number' && Number.isFinite(command.seed)
						? command.seed >>> 0
						: randomSeed()
				)
		} satisfies AdminHandlers;
		for (const [name, system] of Object.entries(this.systems) as [string, SessionSystem][]) {
			for (const [kind, handler] of Object.entries(system.admin ?? {})) {
				if (handlers[kind]) throw new Error(`Admin command ${kind} is claimed twice (${name})`);
				handlers[kind] = handler;
			}
		}
		return handlers as AdminHandlers;
	}

	/**
	 * Leave these items out of the map (a quest item someone in the party already owns). Called
	 * before anyone arrives; whatever was already placed is taken out.
	 */
	withhold(items: string[]): void {
		for (const item of items) {
			this.withheld.add(item);
			this.crates.removeItem(item);
			this.items.removeAll(item);
		}
	}

	/** Which Affliction this expedition is against (key into AFFLICTIONS). */
	get afflictionId(): string {
		return this.affliction.def.id;
	}

	/** Start from the clues the party already found on earlier runs. */
	revealClues(clues: number): void {
		this.systems.rite.reveal(clues);
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

	/** `inventory` is what they bring down: their loadout. `markWheel`: their chalk symbols. */
	addPlayer(
		socket: WebSocket,
		name: string,
		owner: string,
		inventory: Inventory,
		markWheel: readonly string[] = DEFAULT_MARK_WHEEL,
		discovered: ReadonlySet<string> = new Set()
	): Player {
		const player: Player = {
			id: randomUUID(),
			owner,
			name,
			socket,
			discovered: new Set(discovered),
			seenIn: new Set(),
			state: this.spawnState(inventory, this.players.size),
			queue: [],
			ack: -1,
			processed: 0,
			clock: null,
			joinedAt: Date.now(),
			deepestLevel: 0,
			stats: { kills: 0, crates: 0, clues: 0 },
			lastInput: null,
			crate: null,
			crateLatch: false,
			markWheel
		};
		this.players.set(player.id, player);
		this.itemsSent = null;
		this.hadPlayers = true;
		this.joined++;
		this.welcome(player, false);
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
		this.itemsSent = null;
		player.queue = [];
		player.ack = -1;
		player.processed = 0;
		player.clock = null;
		player.lastInput = null;
		// Whatever screen they had open is gone with the old connection.
		for (const system of this.ordered) system.reconnecting?.(player);
		this.welcome(player, true);
		log.info(`Player ${player.name} reconnected to session ${this.id.slice(0, 8)}`);
		return true;
	}

	/** The map and who they are, then whatever each system has for someone arriving. */
	private welcome(player: Player, resumed: boolean): void {
		this.send(player, {
			type: 'welcome',
			playerId: player.id,
			sessionId: this.id,
			tickRate: TICK_RATE,
			layout: this.layout,
			resumed,
			markWheel: [...player.markWheel]
		});
		for (const system of this.ordered) system.joined?.(player, resumed);
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
		for (const system of this.ordered) system.left?.(player);
		// Not extracted, dead or abandoned: they left the party or dropped for good.
		this.logRun(player, carried ? 'extracted' : 'left', carried);
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

	/**
	 * A player gives up and goes back to the surface. It costs what dying costs: everything they
	 * carried stays where they stood, for the others to pick up.
	 */
	abandon(playerId: string): void {
		const player = this.players.get(playerId);
		if (!player || player.state.dead || player.state.extracted) return;
		this.items.dropAll(allStacks(player.state.inventory), player.state.position);
		this.send(player, { type: 'abandoned', ...this.summary(player) });
		this.logRun(player, 'abandoned', null);
		log.info(`Player ${player.name} abandoned session ${this.id.slice(0, 8)}`);
		this.removePlayer(player.id);
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

	/** A request from the pack screen (PackSystem.request). */
	inventory(playerId: string, raw: unknown): void {
		const player = this.players.get(playerId);
		if (player) this.systems.pack.request(player, raw);
	}

	/** Draw a chalk mark (MarkSystem.draw). */
	mark(playerId: string, symbol: unknown, position: unknown, normal: unknown): void {
		const player = this.players.get(playerId);
		if (player) this.systems.marks.draw(player, symbol, position, normal);
	}

	/** Make or mend something below (CraftSystem.start). */
	craft(playerId: string, request: { recipe?: unknown; repair?: unknown }): void {
		const player = this.players.get(playerId);
		if (player) this.systems.craft.start(player, request);
	}

	stopCraft(playerId: string): void {
		const player = this.players.get(playerId);
		if (player) this.systems.craft.stop(player);
	}

	/** The player is done with the loot crate they had open (CrateSystem.close). */
	closeCrate(playerId: string): void {
		const player = this.players.get(playerId);
		if (player) this.systems.crates.close(player);
	}

	canUseHands(player: Player): boolean {
		const s = player.state;
		return (
			!s.downed &&
			!s.dead &&
			!s.extracted &&
			!s.swimming &&
			!s.mantle &&
			!s.climbing &&
			s.bandaging === 0 &&
			s.charging === 0 &&
			s.tending === 0 &&
			s.reviving === 0 &&
			!player.crate
		);
	}

	admin(playerId: string, command: AdminCommand): void {
		const player = this.players.get(playerId);
		if (!player) return;
		if (!config.devMode) {
			log.warn(`Ignored admin command from ${player.name}: DEV_MODE is off`);
			return;
		}
		const handler = this.adminHandlers[command.kind] as
			((player: Player, command: AdminCommand) => boolean | void) | undefined;
		if (handler?.(player, command) === false) return;
		log.info(`Admin ${command.kind} by ${player.name}`);
	}

	private regenerate(seed: number): void {
		this.seed = seed;
		for (const system of this.ordered) system.regenerating?.();
		this.build(seed);
		for (const [index, player] of [...this.players.values()].entries()) {
			const flags = player.state.flags;
			player.state = this.spawnState(player.state.inventory, index);
			player.state.flags = flags;
			player.queue = [];
		}
		this.broadcast({ type: 'map', layout: this.layout });
		for (const system of this.ordered) system.regenerated?.();
		log.info(`Session ${this.id.slice(0, 8)} regenerated with seed ${seed}`);
	}

	private buildNav(): NavGrid {
		const started = performance.now();
		const nav = buildNav(
			this.world,
			this.layout,
			PIECES,
			entryPoint(this.world, this.layout, PIECES)
		);
		log.info(
			`Nav grid: ${nav.points.length} points in ${Math.round(performance.now() - started)} ms`
		);
		return nav;
	}

	/** A new body at the start room's spawn `index` (one each, in the order players joined). */
	private spawnState(inventory: Inventory, index: number): PlayerState {
		const spawn = spawnPoint(this.layout, PIECES, index);
		return createPlayerState(this.freeSpot(spawn.position), spawn.yaw, inventory);
	}

	freeSpot(position: Vec3): Vec3 {
		return findFreeSpot(this.world, position, MOVEMENT.stances.stand.height, MOVEMENT.radius);
	}

	private start(): void {
		this.timer = setInterval(() => this.safeStep(), 1000 / TICK_RATE);
	}

	/** Errors already told to the players, so one that repeats every tick is told once. */
	private crashesTold = new Set<string>();

	/**
	 * A tick that throws doesn't stop the expedition: the error is recorded, everyone in it (and
	 * watching) is asked whether to report it, once per error, and the next tick runs as usual.
	 */
	private safeStep(): void {
		try {
			this.step();
		} catch (error) {
			const message = crashMessage(error);
			void serverCrash(error, `Session ${this.id.slice(0, 8)} tick`).then((id) => {
				if (this.crashesTold.has(message)) return;
				this.crashesTold.add(message);
				const crash: ServerMessage = { type: 'serverError', id, message };
				for (const player of this.players.values()) this.send(player, crash);
				for (const spectator of this.spectators.values()) this.sendTo(spectator.socket, crash);
			});
		}
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
				this.simulate(player, player.queue.shift() as InputFrame);
			}
			const level = tierAt(this.tiers, player.state.position);
			if (level !== null) player.deepestLevel = Math.max(player.deepestLevel, level);
		}
		for (const system of this.ordered) system.step?.();
		this.tally();
		this.leaving();
		if (this.players.size === 0) return;
		this.broadcastTick();
		this.events = [];
		this.tallied = 0;
	}

	/** One input frame: the player's movement and weapon, then what each system makes of it. */
	private simulate(player: Player, frame: InputFrame): void {
		const events: SimEvent[] = [];
		const wasLit = headlampOutput(player.state).on;
		stepPlayer(
			player.state,
			frame,
			this.world,
			DT,
			MOVEMENT,
			DEFAULT_HEADLAMP,
			events,
			this.climbersBesides(player),
			this.systems.tend.teammatesBesides(player)
		);
		resolve(this.combat(), player, events);
		this.falls(player, events);
		const step = {
			frame,
			pressedInteract: frame.interact && !player.lastInput?.interact,
			pressedAttack: frame.attack && !player.lastInput?.attack,
			wasLit,
			events
		};
		for (const system of this.ordered) system.simulated?.(player, step);
		player.lastInput = frame;
		player.ack = frame.seq;
		player.processed++;
	}

	discover(player: Player, item: string, source: string): void {
		if (!discoverable(item)) return;
		const where = `${item}:${source}`;
		if (player.seenIn.has(where)) return;
		player.seenIn.add(where);
		this.hooks.onDiscovered?.(player.owner, item, source);
		if (player.discovered.has(item)) return;
		player.discovered.add(item);
		this.send(player, { type: 'discovered', item, recipes: recipesUsing(item).length });
	}

	/** Falls that hurt: a hard landing costs sanity, and is heard. */
	private falls(player: Player, events: SimEvent[]): void {
		for (const event of events) {
			if (event.kind !== 'land') continue;
			const position: Vec3 = [...player.state.position];
			this.hurt(player, (event.speed - FALL.safeSpeed) * FALL.damagePerSpeed);
			this.events.push({
				kind: 'fall',
				player: player.id,
				position,
				hard: event.speed >= FALL.hardSpeed
			});
			// A hard fall breaks what is fragile in the pack (docs/dev/world.md#fragile-loot).
			if (event.speed >= FALL.hardSpeed) {
				for (const stack of allStacks(player.state.inventory)) {
					if (!ITEMS[stack.item]?.fragile) continue;
					removeItem(player.state.inventory, stack.item, stack.count);
					this.events.push({ kind: 'shatter', item: stack.item, position });
				}
			}
			this.creatures.hear(position, FALL.noise, player);
		}
	}

	/** The dead and the extracted are told how it went and leave; the dead can watch the rest. */
	private leaving(): void {
		const timedOut = this.systems.deadline.timedOut;
		const alive = [...this.players.values()].some((p) => !p.state.dead && !p.state.extracted);
		for (const player of [...this.players.values()]) {
			if (player.state.dead && !this.dropped.has(player.id)) {
				// Everything they carried stays where they fell, for anyone to pick up.
				this.dropped.add(player.id);
				this.items.dropAll(allStacks(player.state.inventory), player.state.position);
			}
			if (!player.state.extracted && !player.state.dead) continue;
			const result = this.summary(player);
			if (player.state.dead) {
				this.send(player, {
					type: 'died',
					...result,
					spectating: alive,
					...(timedOut ? { lost: true } : {})
				});
				log.info(`Player ${player.name} died in session ${this.id.slice(0, 8)}`);
				this.logRun(player, timedOut ? 'lost' : 'died', null);
			} else {
				this.escaped++;
				for (const stack of allStacks(player.state.inventory)) {
					if (ITEMS[stack.item]?.spoils)
						removeItem(player.state.inventory, stack.item, stack.count);
				}
				this.send(player, {
					type: 'extracted',
					...result,
					carried: allStacks(player.state.inventory)
				});
				log.info(`Player ${player.name} extracted from session ${this.id.slice(0, 8)}`);
				this.logRun(player, 'extracted', player.state.inventory);
			}
			this.removePlayer(player.id, player.state.dead ? null : player.state.inventory);
			if (player.state.dead && alive) {
				this.spectators.set(player.id, { name: player.name, socket: player.socket });
			}
		}
	}

	private broadcastTick(): void {
		const players = [...this.players.values()].map((p) => ({
			id: p.id,
			name: p.name,
			state: p.state,
			ack: p.ack
		}));
		const items = this.items.snapshots();
		const itemsKey = JSON.stringify(items);
		const itemsChanged = itemsKey !== this.itemsSent;
		this.itemsSent = itemsKey;
		this.broadcast({
			type: 'tick',
			tick: this.tick,
			serverTime: Date.now(),
			players,
			creatures: this.creatures.snapshots(),
			...(itemsChanged ? { items } : {}),
			projectiles: this.items.projectileSnapshots(),
			events: this.events,
			affliction: {
				...this.affliction.snapshot(),
				rite: this.rite.snapshot(),
				deadline: Math.ceil(this.systems.deadline.seconds)
			},
			crates: this.crates.snapshot(),
			doors: this.doors.snapshot(),
			sealed: this.doors.sealedSnapshot(),
			walls: this.systems.walls.snapshot(),
			hazards: this.systems.hazards.snapshot(),
			// For the admin bars only: never sent outside dev mode.
			...(config.devMode && {
				attraction: {
					noise: round2(this.creatures.attraction.fraction('noise')),
					light: round2(this.creatures.attraction.fraction('light')),
					witches: this.creatures.alive('witch'),
					...(this.creatures.lastWitch && {
						last: {
							cause: this.creatures.lastWitch.cause,
							seconds: Math.floor(this.creatures.lastWitch.seconds)
						}
					})
				}
			})
		});
	}

	/** Count this tick's kills, crates and clues (events not yet counted) to whoever did them. */
	private tally(): void {
		for (const event of this.events.slice(this.tallied)) {
			const by = event.kind === 'creatureDie' ? event.by : 'player' in event ? event.player : null;
			const stats = by ? this.players.get(by)?.stats : undefined;
			if (!stats) continue;
			if (event.kind === 'creatureDie') stats.kills++;
			else if (event.kind === 'crateOpen') stats.crates++;
			else if (event.kind === 'clue') stats.clues++;
		}
		this.tallied = this.events.length;
	}

	/** How the expedition went for a player who is leaving it. */
	private summary(player: Player): ExpeditionSummary {
		this.tally();
		return {
			seconds: Math.round((Date.now() - player.joinedAt) / 1000),
			deepestLevel: player.deepestLevel,
			...player.stats
		};
	}

	/** Write how a player's expedition went, once (server/stats.ts). */
	private logRun(player: Player, outcome: RunOutcome, carried: Inventory | null): void {
		if (this.logged.has(player.id)) return;
		this.logged.add(player.id);
		const summary = this.summary(player);
		const earned = achievementsForRun(outcome, this.joined);
		if (earned.length > 0) this.send(player, { type: 'achievement', ids: earned });
		const startedAt = this.systems.deadline.startedAt;
		const manifestedAt = this.systems.affliction.manifestedAt;
		logRun({
			explorer: player.owner,
			session: this.id,
			seed: this.seed,
			affliction: this.chosen,
			outcome,
			...summary,
			carriedValue: carriedValue(carried),
			partySize: this.joined,
			manifestedAfter:
				manifestedAt && startedAt ? Math.round((manifestedAt - startedAt) / 1000) : null
		});
	}

	combat(): CombatContext {
		return {
			world: this.world,
			creatures: this.creatures,
			affliction: this.affliction,
			items: this.items,
			out: this.events
		};
	}

	awardEveryoneDown(earned: string[]): void {
		if (earned.length === 0) return;
		for (const player of this.players.values()) {
			if (player.state.dead || player.state.extracted) continue;
			this.send(player, { type: 'achievement', ids: earned });
		}
	}

	/** Everyone but `player` on a rope: where their feet are (nobody climbs past anyone). */
	private climbersBesides(player: Player): ClimberSpot[] {
		const spots: ClimberSpot[] = [];
		for (const other of this.players.values()) {
			const climb = other.state.climbing;
			if (other !== player && climb) spots.push({ rope: climb.rope, y: other.state.position[1] });
		}
		return spots;
	}

	hurt(player: Player, amount: number): void {
		const s = player.state;
		if (s.flags.godMode || s.downed || s.dead) return;
		s.sanity = Math.max(0, s.sanity - amount);
		if (s.sanity <= 0) this.down(player);
	}

	down(player: Player): void {
		const s = player.state;
		s.sanity = 0;
		s.downed = true;
		s.downedTime = 0;
		// Whatever is held as they fall (climb, mid-scramble) must be let go before it surrenders.
		s.surrendering = -1;
		s.mantle = null;
		s.climbing = null;
		s.extracting = 0;
		s.bandaging = 0;
		s.charging = 0;
		s.tending = 0;
		s.patient = null;
		s.reviving = 0;
		s.opening = 0;
		s.erasing = 0;
		s.roping = 0;
		s.unbarring = 0;
		s.sketching = 0;
		s.sharing = 0;
		for (const system of this.ordered) system.downed?.(player);
		log.info(`Player ${player.name} is down`);
	}

	revive(player: Player): void {
		const s = player.state;
		s.downed = false;
		s.downedTime = 0;
		s.surrendering = 0;
		s.sanity = Math.max(s.sanity, SANITY.reviveTo);
	}

	broadcast(message: ServerMessage): void {
		const encoded = encode(message);
		for (const player of this.players.values()) this.sendTo(player.socket, encoded);
		for (const spectator of this.spectators.values()) this.sendTo(spectator.socket, encoded);
	}

	send(player: Player, message: ServerMessage): void {
		this.sendTo(player.socket, message);
	}

	private sendTo(socket: WebSocket, message: ServerMessage | string): void {
		if (socket.readyState !== socket.OPEN) return;
		socket.send(typeof message === 'string' ? message : encode(message));
	}
}

/** Two decimal places (the admin bars). */
function round2(v: number): number {
	return Math.round(v * 100) / 100;
}
