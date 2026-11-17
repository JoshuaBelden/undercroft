import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { CREATURES } from '../src/lib/content/creatures.ts';
import { MAP_KIT } from '../src/lib/content/map/kit.ts';
import { SANITY } from '../src/lib/content/player/sanity.ts';
import { FALL, MOVEMENT } from '../src/lib/content/player/movement.ts';
import { type ClimberSpot } from '../src/lib/shared/player/climb.ts';
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
import { AFFLICTIONS, DEFAULT_AFFLICTION } from '../src/lib/content/afflictions.ts';
import { LEVEL_HEIGHT } from '../src/lib/shared/map/grid.ts';
import { buildNav, type NavGrid } from '../src/lib/shared/map/nav.ts';
import { PIECES } from '../src/lib/shared/map/pieces.generated.ts';
import { occupiedCells } from '../src/lib/shared/map/grid.ts';
import { ITEMS } from '../src/lib/content/items.ts';
import { CORPSES, CRATES } from '../src/lib/content/loot.ts';
import { DEFAULT_MARK_WHEEL, MARKS } from '../src/lib/content/marks.ts';
import { DEFAULT_HEADLAMP } from '../src/lib/content/items/headlamps.ts';
import {
	addItem,
	allStacks,
	applyAction,
	absorbBlow,
	getSlot,
	handRef,
	held,
	newStack,
	quickWith,
	removeItem,
	sanitizeAction,
	spendQuick,
	takeStack,
	wearChalk
} from '../src/lib/shared/items/inventory.ts';
import { CRATE_REACH, lookedAtMark } from '../src/lib/shared/items/pickup.ts';
import type { GameEvent } from '../src/lib/shared/items/types.ts';
import { aimRay, reequip } from '../src/lib/shared/items/weapons.ts';
import { crateCentre, placeCrates } from '../src/lib/shared/map/crates.ts';
import {
	creatureSpawns,
	dropSpot,
	roomPoints,
	rubbleSites,
	spawnPoint
} from '../src/lib/shared/map/points.ts';
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
	ItemStack,
	PlayerState,
	SimEvent
} from '../src/lib/shared/player/types.ts';
import { HAND } from '../src/lib/shared/player/types.ts';
import {
	encode,
	type AdminCommand,
	type ExpeditionSummary,
	type ServerMessage
} from '../src/lib/shared/protocol.ts';
import { randomSeed } from '../src/lib/shared/rng.ts';
import { config } from './config.ts';
import { hurt as hurtCreature, resolve, targets, type CombatContext } from './combat.ts';
import { AfflictionDirector } from './affliction.ts';
import { crashMessage, serverCrash } from './errors.ts';
import { carriedValue, logRun } from './stats.ts';
import type { RunOutcome } from '../src/lib/server/store/runs.ts';
import { RiteDirector, scatterRite } from './rite.ts';
import { Crates, type Crate } from './crates.ts';
import { CreatureDirector } from './creatures.ts';
import { WorldItems } from './items.ts';
import { Marks } from './marks.ts';
import { Ropes } from './ropes.ts';
import { ROPE } from '../src/lib/content/rope.ts';
import {
	applyTied,
	laidLength,
	ropeLength,
	ropeAction,
	ropeInHand
} from '../src/lib/shared/items/rope.ts';
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
	/** What they have done down here, for the results screen (see `summary`). */
	stats: { kills: number; crates: number; clues: number };
	/** Most recent input simulated (held buttons the server acts on, like revive). */
	lastInput: InputFrame | null;
	/** The loot crate they have open (its id). */
	crate: string | null;
	/** The chalk symbols on their wheel: the only ones they may draw. */
	markWheel: readonly string[];
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
	layout!: MapLayout;
	// Everything built from the map: set by `build`, from the constructor and `regenerate`.
	private world!: CollisionWorld;
	private nav!: NavGrid;
	private creatures!: CreatureDirector;
	private items!: WorldItems;
	private crates!: Crates;
	private affliction!: AfflictionDirector;
	private rite!: RiteDirector;
	/** Chalk marks on the walls. */
	private marks = new Marks();
	private ropes = new Ropes();
	/** What each player's interact hold is on (`roping`): changing target starts it over. */
	private ropeTargets = new Map<string, string>();
	/** The hand slot (`Inventory.selected`) each player is laying rope from. */
	private layingFrom = new Map<string, number>();
	/** Items not put in this map: quest items someone in the party already owns. */
	private withheld = new Set<string>();
	/** When the first player arrived (ms): the deadline counts from here. */
	private startedAt: number | null = null;
	/** Admin: seconds taken off (or put back on) the clock. */
	private clockShift = 0;
	/** Time ran out: everyone still underground has been lost. */
	private timedOut = false;
	/** Events this tick, broadcast with it. */
	private events: GameEvent[] = [];
	/** How many of `events` have been counted toward players' stats (see `tally`). */
	private tallied = 0;
	private dropped = new Set<string>();
	private players = new Map<string, Player>();
	/** Dead players still watching: they get ticks but are not in the simulation. */
	private spectators = new Map<string, { name: string; socket: WebSocket }>();
	/** Players who got out alive (climbed out, or were carried out by a banishing). */
	private escaped = 0;
	private tick = 0;
	private timer: NodeJS.Timeout | null = null;
	private hadPlayers = false;
	/** How many players went down (for game stats). */
	private joined = 0;
	/** When the Affliction manifested (ms); null until it does. */
	private manifestedAt: number | null = null;
	/** Players whose run has been written (server/stats.ts), so each is written once. */
	private logged = new Set<string>();
	/**
	 * The world items list as last sent in a tick. A tick leaves the list out while it is unchanged;
	 * null makes the next tick carry it (a new map, someone arriving or reconnecting).
	 */
	private itemsSent: string | null = null;

	/** `affliction` is the one the party's host chose (key into AFFLICTIONS). */
	constructor(
		private chosen: string,
		private hooks: SessionHooks = {}
	) {
		if (!AFFLICTIONS[chosen]) this.chosen = DEFAULT_AFFLICTION.id;
		this.build(this.seed);
	}

	/** Generate the map for a seed (with the chosen Affliction's own pieces) and fill it. */
	private build(seed: number): void {
		this.layout = generate(seed, this.chosen);
		this.world = buildCollisionWorld(this.layout, PIECES);
		this.nav = this.buildNav();
		this.creatures = new CreatureDirector(
			this.world,
			this.nav,
			creatureSpawns(this.layout, PIECES),
			seed
		);
		this.items = new WorldItems(this.world);
		this.itemsSent = null;
		this.affliction = this.direct();
		this.rite = new RiteDirector(this.affliction.def.rite, this.layout, PIECES);
		this.populate();
	}

	/** The chosen Affliction, at work in the current map. */
	private direct(): AfflictionDirector {
		return new AfflictionDirector(this.world, this.nav, this.creatures, this.seed, this.chosen);
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
		this.crates = new Crates(this.world, this.layout.crates, this.nav, start, this.seed);
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

	/** Seconds left before anyone still underground is lost. */
	private get deadline(): number {
		const total = this.affliction.def.expeditionSeconds;
		if (this.startedAt === null) return total;
		return Math.max(0, total - (Date.now() - this.startedAt) / 1000 - this.clockShift);
	}

	/** Which Affliction this expedition is against (key into AFFLICTIONS). */
	get afflictionId(): string {
		return this.affliction.def.id;
	}

	/** Start from the clues the party already found on earlier runs. */
	revealClues(clues: number): void {
		this.rite.reveal(clues);
		if (this.rite.complete) this.clearHints();
	}

	/** Every hint is known: the copies left in the map are taken away. */
	private clearHints(): void {
		this.items.removeAll('clue');
		this.crates.removeItem('clue');
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
		markWheel: readonly string[] = DEFAULT_MARK_WHEEL
	): Player {
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
			stats: { kills: 0, crates: 0, clues: 0 },
			lastInput: null,
			crate: null,
			markWheel
		};
		this.players.set(player.id, player);
		this.itemsSent = null;
		this.hadPlayers = true;
		this.joined++;
		this.startedAt ??= Date.now();
		this.send(player, {
			type: 'welcome',
			playerId: player.id,
			sessionId: this.id,
			tickRate: TICK_RATE,
			layout: this.layout,
			resumed: false,
			markWheel: [...player.markWheel]
		});
		this.send(player, { type: 'marks', marks: this.marks.snapshot() });
		this.send(player, { type: 'ropes', ...this.ropes.snapshot() });
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
		this.shutCrate(player);
		this.send(player, {
			type: 'welcome',
			playerId: player.id,
			sessionId: this.id,
			tickRate: TICK_RATE,
			layout: this.layout,
			resumed: true,
			markWheel: [...player.markWheel]
		});
		this.send(player, { type: 'marks', marks: this.marks.snapshot() });
		this.send(player, { type: 'ropes', ...this.ropes.snapshot() });
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
		this.shutCrate(player);
		this.ropes.stop(player.id);
		this.layingFrom.delete(player.id);
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

	/** A request from the pack screen: move, equip or split something, or drop it on the floor. */
	inventory(playerId: string, raw: unknown): void {
		const player = this.players.get(playerId);
		if (!player) return;
		const s = player.state;
		if (s.downed || s.dead || s.extracted) return;
		const crate = player.crate ? this.crates.get(player.crate) : null;
		if (crate) {
			this.lootAction(player, crate, raw);
			return;
		}
		const action = sanitizeAction(raw);
		if (!action) return;
		const inHand = held(s.inventory);
		const { dropped } = applyAction({ inventory: s.inventory }, action);
		this.afterInventory(player, inHand, dropped);
	}

	/**
	 * The same, with a loot crate open: its slots stand where the stash does on the surface, so
	 * things move both ways. What hasn't been revealed yet can't be touched.
	 */
	private lootAction(player: Player, crate: Crate, raw: unknown): void {
		const action = sanitizeAction(raw, true);
		if (!action) return;
		// A hint is read where it lies, never carried.
		const from = 'from' in action ? action.from : null;
		if (from?.area === 'stash' && !crate.hidden.has(from.index)) {
			const stack = crate.slots[from.index];
			if (stack && ITEMS[stack.item]?.kind === 'clue') {
				if (this.readClue(player, crate.position)) this.crates.clear(crate, from.index);
				return;
			}
		}
		const inv = player.state.inventory;
		const inHand = held(inv);
		const { dropped } = applyAction(
			{ inventory: inv, stash: crate.slots, sealed: crate.hidden },
			action
		);
		this.afterInventory(player, inHand, dropped);
	}

	/** After a request was carried out: what came out lands on the floor, the hand is checked. */
	private afterInventory(player: Player, inHand: ItemStack | null, dropped?: ItemStack): void {
		const s = player.state;
		const inv = s.inventory;
		if (dropped) {
			const { origin, direction } = aimRay(s, eyeHeight(s));
			this.items.drop(dropped, origin, direction);
			this.events.push({ kind: 'drop', player: player.id, item: dropped.item, position: origin });
		}
		// What's in the hand changed: whatever it was doing stops and the new item comes up.
		if (held(inv) !== inHand) reequip(s.weapon);
	}

	/**
	 * Draw a chalk mark with the chalk in the hand, where the client says their view meets the
	 * stone. Refused unless they can use items and the place checks out (see Marks.check).
	 */
	mark(playerId: string, symbol: unknown, position: unknown, normal: unknown): void {
		const player = this.players.get(playerId);
		if (!player) return;
		const s = player.state;
		const stack = held(s.inventory);
		if (!stack || !ITEMS[stack.item]?.chalk || !this.canUseHands(player)) return;
		const { origin, direction } = aimRay(s, eyeHeight(s));
		const flat = Math.hypot(direction[0], direction[2]) || 1;
		const facing: Vec3 = [direction[0] / flat, 0, direction[2] / flat];
		const mark = this.marks.check(
			this.world,
			origin,
			facing,
			player.markWheel,
			symbol,
			position,
			normal
		);
		if (!mark) return;
		const added = this.marks.add({ ...mark, by: player.id, name: player.name });
		const inHand = held(s.inventory);
		wearChalk(s.inventory);
		if (held(s.inventory) !== inHand) reequip(s.weapon);
		this.events.push({ kind: 'mark', player: player.id, position: added.position });
		this.creatures.hear(added.position, MARKS.noise, player);
		this.broadcast({ type: 'marks', marks: this.marks.snapshot() });
	}

	/** Not down, not in water, not climbing, not busy with something else in the hands. */
	private canUseHands(player: Player): boolean {
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
			s.reviving === 0 &&
			!player.crate
		);
	}

	/** The player is done with the loot crate they had open. */
	closeCrate(playerId: string): void {
		const player = this.players.get(playerId);
		if (!player) return;
		// Always answered, even if it had shut already: the client waits for this.
		if (player.crate) this.shutCrate(player);
		else this.send(player, { type: 'crate', id: null, slots: [], reveal: 0 });
	}

	private shutCrate(player: Player): void {
		if (!player.crate) return;
		const crate = this.crates.get(player.crate);
		if (crate) this.crates.close(crate);
		player.crate = null;
		this.send(player, { type: 'crate', id: null, slots: [], reveal: 0 });
	}

	admin(playerId: string, command: AdminCommand): void {
		const player = this.players.get(playerId);
		if (!player) return;
		if (!config.devMode) {
			log.warn(`Ignored admin command from ${player.name}: DEV_MODE is off`);
			return;
		}
		switch (command.kind) {
			case 'throw':
				throw new Error('Test error from the admin panel');
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
			case 'setDeadline':
				if (typeof command.seconds === 'number' && Number.isFinite(command.seconds)) {
					this.clockShift += this.deadline - Math.max(0, command.seconds);
				}
				break;
			case 'clearConditions':
				player.state.conditions = [];
				break;
			case 'clearRopes':
				this.ropes.clear();
				this.ropesChanged();
				break;
			case 'clearMarks':
				this.marks.clear();
				this.broadcast({ type: 'marks', marks: [] });
				break;
			case 'resetCrates':
				for (const other of this.players.values()) this.shutCrate(other);
				this.crates.fill();
				break;
			case 'teleport': {
				const room = roomPoints(this.layout, PIECES, MAP_KIT).find((r) => r.name === command.room);
				if (!room) return;
				player.state.position = this.freeSpot(room.position);
				player.state.velocity = [0, 0, 0];
				break;
			}
			case 'teleportTo': {
				const at = command.position;
				if (!Array.isArray(at) || at.length !== 3 || !at.every(Number.isFinite)) return;
				const [x, y, z] = at as Vec3;
				const feet: Vec3 = [x, y - eyeHeight(player.state), z];
				const spot = player.state.flags.noclip
					? feet
					: dropSpot(this.world, feet, MOVEMENT.stances.stand.height, MOVEMENT.radius);
				if (!spot) return;
				player.state.position = spot;
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
		for (const player of this.players.values()) this.shutCrate(player);
		const clues = this.rite.clues;
		this.build(seed);
		this.revealClues(clues);
		for (const player of this.players.values()) {
			const flags = player.state.flags;
			player.state = this.spawnState(player.state.inventory);
			player.state.flags = flags;
			player.queue = [];
		}
		this.marks.clear();
		this.ropes.clear();
		this.broadcast({ type: 'map', layout: this.layout });
		this.broadcast({ type: 'marks', marks: [] });
		this.broadcast({ type: 'ropes', laid: [], tied: [] });
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
				const frame = player.queue.shift() as InputFrame;
				const pressedInteract = frame.interact && !player.lastInput?.interact;
				const pressedAttack = frame.attack && !player.lastInput?.attack;
				const events: SimEvent[] = [];
				const others = this.climbersBesides(player);
				stepPlayer(player.state, frame, this.world, DT, MOVEMENT, DEFAULT_HEADLAMP, events, others);
				resolve(this.combat(), player, events);
				this.moved(player, events);
				// A press that took hold of a rope did only that.
				if (pressedInteract && !player.state.climbing) this.pickUp(player);
				if (pressedAttack) this.startLaying(player);
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
		this.stepDeadline();
		this.stepCrates();
		this.stepMarks();
		this.stepRopes();
		this.tally();
		// Anyone still alive down here after this tick? The dead can watch them.
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
					...(this.timedOut ? { lost: true } : {})
				});
				log.info(`Player ${player.name} died in session ${this.id.slice(0, 8)}`);
				this.logRun(player, this.timedOut ? 'lost' : 'died', null);
			} else {
				this.escaped++;
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
		if (this.affliction.banished && this.players.size > 0) {
			log.info(`Session ${this.id.slice(0, 8)}: banished`);
			for (const player of [...this.players.values()]) {
				this.escaped++;
				this.send(player, {
					type: 'banished',
					...this.summary(player),
					carried: allStacks(player.state.inventory)
				});
				this.logRun(player, 'banished', player.state.inventory);
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
				deadline: Math.ceil(this.deadline)
			},
			crates: this.crates.snapshot()
		});
		this.events = [];
		this.tallied = 0;
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
				this.manifestedAt && this.startedAt
					? Math.round((this.manifestedAt - this.startedAt) / 1000)
					: null
		});
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
			if (this.readClue(player, position)) this.items.remove(item.id);
			return;
		}
		const taken = this.items.pickUp(s, item);
		if (taken) this.events.push({ kind: 'pickup', player: player.id, item: taken, position });
	}

	/**
	 * A hint was read (on a wall, on furniture, in a crate): the next hint is learned, whichever
	 * copy it was. Returns false if there was nothing left to learn (the copy is left alone).
	 */
	private readClue(player: Player, position: Vec3): boolean {
		const found = this.rite.find();
		if (!found) return false;
		if (this.rite.complete) this.clearHints();
		this.events.push({ kind: 'clue', player: player.id, position: [...position], ...found });
		this.hooks.onClues?.(this.rite.clues);
		log.info(`${player.name} found a hint (${this.rite.clues}) in ${this.id.slice(0, 8)}`);
		return true;
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
			this.manifestedAt ??= Date.now();
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
			if (!player) continue;
			const s = player.state;
			if (s.flags.godMode || s.downed || s.dead) continue;
			// What is worn takes the blow first.
			const { through, torn } = absorbBlow(s.inventory, hit.damage);
			if (torn) this.events.push({ kind: 'break', item: torn, position: [...s.position] });
			this.hurt(player, through);
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

	/** A creature is in front of the player, in line of sight, within range and lit enough to see. */
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
	 * the Affliction is resolved and calmed, but everyone still has to get out.
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
			if (s.performing < seconds || this.rite.resolved) continue;
			s.performing = 0;
			this.rite.take(s);
			this.rite.resolved = true;
			const stage = this.affliction.stage;
			this.affliction.calm();
			this.events.push({ kind: 'rite', player: player.id, position: [...s.position] });
			if (stage !== 0) this.events.push({ kind: 'omen', stage: 0 });
			this.hooks.onResolved?.();
			log.info(`${player.name} performed the rite in ${this.id.slice(0, 8)}`);
		}
	}

	/** Time is up: everyone still underground is lost, and what they carry stays down here. */
	private stepDeadline(): void {
		if (this.timedOut || this.startedAt === null || this.deadline > 0) return;
		this.timedOut = true;
		this.events.push({ kind: 'deadline' });
		for (const player of this.players.values()) {
			if (player.state.extracted || player.state.dead) continue;
			player.state.dead = true;
			player.state.downed = false;
		}
		log.info(`Session ${this.id.slice(0, 8)}: time ran out`);
	}

	/**
	 * Loot crates: holding interact on one nobody is using opens it for that player. While they
	 * have it open, what is in it is revealed a slot at a time and they are told what they can
	 * see. It shuts when they walk away, go down or lose their connection.
	 */
	private stepCrates(): void {
		for (const player of this.players.values()) {
			const s = player.state;
			const able = !s.downed && !s.dead && !s.extracted && !s.swimming;
			const { origin, direction } = aimRay(s, eyeHeight(s));
			if (player.crate) {
				s.opening = 0;
				const crate = this.crates.get(player.crate);
				const centre = crate ? crateCentre(crate) : origin;
				const away = Math.hypot(
					centre[0] - origin[0],
					centre[1] - origin[1],
					centre[2] - origin[2]
				);
				const connected = player.socket.readyState === player.socket.OPEN;
				if (!crate || !able || !connected || away > CRATE_REACH.leave) this.shutCrate(player);
				continue;
			}
			const crate =
				able && player.lastInput?.interact && !this.items.lookedAt(s, origin, direction)
					? this.crates.lookedAt(origin, direction)
					: null;
			if (!crate || crate.user !== null) {
				s.opening = 0;
				continue;
			}
			s.opening += TICK_DT;
			if (s.opening < CRATES.openSeconds) continue;
			s.opening = 0;
			player.crate = crate.id;
			if (this.crates.open(crate, player.id)) {
				this.events.push({
					kind: 'crateOpen',
					id: crate.id,
					player: player.id,
					position: crateCentre(crate)
				});
				// No source: creatures that hear the lid (or, more quietly, a body turned over) go and look.
				const noise = crate.kind === 'corpse' ? CORPSES.noise : CRATES.noise;
				this.creatures.hear(crate.position, noise, null);
			}
			log.info(`${player.name} opened crate ${crate.id} in ${this.id.slice(0, 8)}`);
		}
		for (const crate of this.crates.step(TICK_DT)) {
			if (!crate.user) continue;
			this.events.push({ kind: 'rummage', player: crate.user, position: crateCentre(crate) });
		}
		for (const player of this.players.values()) {
			const crate = player.crate ? this.crates.get(player.crate) : null;
			if (crate) this.send(player, { type: 'crate', id: crate.id, ...this.crates.view(crate) });
		}
	}

	/**
	 * Chalk marks: holding interact on your own mark (when no floor item or crate is what interact
	 * would take) rubs it out after MARKS.eraseSeconds.
	 */
	private stepMarks(): void {
		for (const player of this.players.values()) {
			const s = player.state;
			const { origin, direction } = aimRay(s, eyeHeight(s));
			const mark =
				this.canUseHands(player) &&
				player.lastInput?.interact &&
				!this.items.lookedAt(s, origin, direction) &&
				!this.crates.lookedAt(origin, direction)
					? lookedAtMark(this.world, origin, direction, this.marks.all(), (m) => m.by === player.id)
					: null;
			if (!mark) {
				s.erasing = 0;
				continue;
			}
			s.erasing += TICK_DT;
			if (s.erasing < MARKS.eraseSeconds) continue;
			s.erasing = 0;
			this.marks.remove(mark.id);
			this.events.push({ kind: 'rub', player: player.id, position: mark.position });
			this.broadcast({ type: 'marks', marks: this.marks.snapshot() });
		}
	}

	/**
	 * Pressing attack with rope in the hand starts paying it out along the floor where you stand;
	 * it lays while attack is held (docs/dev/rope.md). Which slot it came from is kept, so letting
	 * go uses up that one.
	 */
	private startLaying(player: Player): void {
		const s = player.state;
		if (this.ropes.layingBy(player.id)) return;
		const stack = ropeInHand(s);
		if (!stack || !this.canUseHands(player) || !s.grounded) return;
		this.ropes.start(player.id, player.name, stack.item, [...s.position]);
		this.layingFrom.set(player.id, s.inventory.selected);
		this.ropesChanged();
	}

	/**
	 * Stop laying: the rope stays where it lies, and the pack or bundle it came from is used up,
	 * however much of it went down. Let go before any was laid, and it is kept.
	 */
	private stopLaying(player: Player): void {
		const slot = this.layingFrom.get(player.id);
		this.layingFrom.delete(player.id);
		const rope = this.ropes.stop(player.id);
		if (rope && slot !== undefined) this.useUpRope(player, slot, rope.item);
		this.ropesChanged();
	}

	/**
	 * Ropes each tick: pay out the ones being laid as their layers walk, and count interact held
	 * to tie a rope at an anchor, untie one, or gather up a laid rope.
	 */
	private stepRopes(): void {
		for (const player of this.players.values()) {
			this.stepLaying(player);
			this.stepRoping(player);
		}
		const grown = this.ropes.takeGrowth();
		if (grown.length) this.broadcast({ type: 'ropeGrow', ropes: grown });
	}

	private stepLaying(player: Player): void {
		const rope = this.ropes.layingBy(player.id);
		if (!rope) return;
		const s = player.state;
		const stack = ropeInHand(s);
		// Letting go of attack stops it, and so does anything that takes the hands or the rope
		// out of them.
		const still =
			player.lastInput?.attack === true &&
			stack?.item === rope.item &&
			s.inventory.selected === this.layingFrom.get(player.id) &&
			this.canUseHands(player);
		if (!still || !stack) {
			this.stopLaying(player);
			return;
		}
		if (!s.grounded) return;
		const before = rope.points.length;
		const left = ropeLength(stack) - laidLength(rope);
		this.ropes.extend(this.world, rope, s.position, left);
		// A rustle every couple of metres laid.
		const every = Math.round(2 / ROPE.spacing);
		if (Math.floor(rope.points.length / every) > Math.floor(before / every)) {
			this.events.push({ kind: 'ropeLay', player: player.id, position: [...s.position] });
		}
		// All of it paid out.
		if (ropeLength(stack) - laidLength(rope) < ROPE.spacing) this.stopLaying(player);
	}

	private stepRoping(player: Player): void {
		const s = player.state;
		const busy =
			!this.canUseHands(player) ||
			!player.lastInput?.interact ||
			s.opening > 0 ||
			s.erasing > 0 ||
			s.performing > 0 ||
			s.extracting > 0 ||
			!s.grounded;
		const action = busy
			? null
			: ropeAction(this.world, this.ropes.laidList(), this.ropes.tiedList(), s);
		const target =
			action?.kind === 'gather'
				? action.rope.id
				: action && action.kind !== 'short'
					? `${action.kind}:${action.anchor.id}`
					: null;
		// Nobody unties a rope out from under someone climbing it.
		const occupied =
			action?.kind === 'untie' &&
			[...this.players.values()].some((p) => p.state.climbing?.rope === `tied-${action.anchor.id}`);
		if (!action || !target || occupied) {
			s.roping = 0;
			this.ropeTargets.delete(player.id);
			return;
		}
		if (this.ropeTargets.get(player.id) !== target) {
			// Something new to tie, untie or gather: start over.
			s.roping = 0;
			this.ropeTargets.set(player.id, target);
		}
		s.roping += TICK_DT;
		const seconds = action.kind === 'gather' ? ROPE.pickupSeconds : ROPE.tieSeconds;
		if (s.roping < seconds) return;
		s.roping = 0;
		this.ropeTargets.delete(player.id);
		const position: Vec3 = [...s.position];
		if (action.kind === 'tie') {
			const stack = ropeInHand(s);
			if (!stack) return;
			// Tied off, the whole pack or bundle is used, however long the drop.
			this.useUpRope(player, s.inventory.selected, stack.item);
			this.ropes.tie({
				anchor: action.anchor.id,
				by: player.id,
				name: player.name,
				item: stack.item
			});
			this.events.push({ kind: 'ropeTie', player: player.id, position });
			this.creatures.hear(position, ROPE.noise, player);
		} else if (action.kind === 'untie') {
			const tied = this.ropes.untie(action.anchor.id);
			if (tied) this.giveRope(player, tied.item);
			this.events.push({ kind: 'ropeUntie', player: player.id, position });
			this.creatures.hear(position, ROPE.noise, player);
		} else if (action.kind === 'gather') {
			const rope = this.ropes.removeLaid(action.rope.id);
			if (rope) this.giveRope(player, rope.item);
			this.events.push({ kind: 'ropeGather', player: player.id, position });
		}
		this.ropesChanged();
	}

	/**
	 * A rope pack or bundle used up (laid or tied): the one in hand slot `slot` if it is still
	 * there, else one like it from anywhere they carry it. An emptied hand goes back to a weapon.
	 */
	private useUpRope(player: Player, slot: number, item: string): void {
		const inv = player.state.inventory;
		const ref = handRef(inv, slot);
		const stack = ref ? getSlot({ inventory: inv }, ref) : null;
		if (ref && stack?.item === item) {
			takeStack({ inventory: inv }, ref, 1);
			if (inv.selected === slot) {
				inv.selected = HAND.primary;
				reequip(player.state.weapon);
			}
			return;
		}
		const hand = inv.selected;
		removeItem(inv, item, 1);
		if (inv.selected !== hand) reequip(player.state.weapon);
	}

	/** Rope taken back (gathered up, untied): the pack or bundle it was, in the pack or at their feet. */
	private giveRope(player: Player, item: string): void {
		const stack = newStack(item);
		if (addItem(player.state.inventory, stack) > 0) {
			this.items.place(stack, [...player.state.position]);
		}
	}

	/** Ropes changed: the tied ones are climbable (or not) from now, and everyone is told. */
	private ropesChanged(): void {
		applyTied(this.world, this.ropes.tiedList());
		this.broadcast({ type: 'ropes', ...this.ropes.snapshot() });
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

	/** What a player's own movement did this step: falls that hurt, ropes grabbed and let go. */
	private moved(player: Player, events: SimEvent[]): void {
		const position: Vec3 = [...player.state.position];
		for (const event of events) {
			if (event.kind === 'land') {
				this.hurt(player, (event.speed - FALL.safeSpeed) * FALL.damagePerSpeed);
				this.events.push({
					kind: 'fall',
					player: player.id,
					position,
					hard: event.speed >= FALL.hardSpeed
				});
				this.creatures.hear(position, FALL.noise, player);
			} else if (event.kind === 'grab') {
				this.events.push({ kind: 'ropeGrab', player: player.id, position });
			} else if (event.kind === 'letgo') {
				this.events.push({ kind: 'ropeLetGo', player: player.id, position });
			}
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
		// Whatever is held as they fall (climb, mid-scramble) must be let go before it surrenders.
		s.surrendering = -1;
		s.mantle = null;
		s.climbing = null;
		s.extracting = 0;
		s.bandaging = 0;
		s.charging = 0;
		s.reviving = 0;
		s.opening = 0;
		s.erasing = 0;
		s.roping = 0;
		this.shutCrate(player);
		log.info(`Player ${player.name} is down`);
	}

	private revive(player: Player): void {
		const s = player.state;
		s.downed = false;
		s.downedTime = 0;
		s.surrendering = 0;
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
