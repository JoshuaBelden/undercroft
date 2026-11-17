import type { WebSocket } from 'ws';
import { TICK_RATE } from '../../src/lib/shared/constants.ts';
import type { CollisionWorld } from '../../src/lib/shared/map/collision.ts';
import type { NavGrid } from '../../src/lib/shared/map/nav.ts';
import type { MapLayout, Vec3 } from '../../src/lib/shared/map/types.ts';
import type { GameEvent } from '../../src/lib/shared/items/types.ts';
import type { InputFrame, PlayerState, SimEvent } from '../../src/lib/shared/player/types.ts';
import type { AdminCommand, ServerMessage } from '../../src/lib/shared/protocol.ts';
import type { AfflictionDirector } from '../affliction.ts';
import type { CombatContext } from '../combat.ts';
import type { Crates } from '../crates.ts';
import type { CreatureDirector } from '../creatures.ts';
import type { Doors } from '../doors.ts';
import type { WorldItems } from '../items.ts';
import type { RiteDirector } from '../rite.ts';
import type { SessionHooks } from '../session.ts';
import type { Systems } from './index.ts';

/**
 * The plug-in seam of the game server (docs/dev/session.md). A `Session` owns the map, the
 * players and the tick; everything a feature does there (ropes, chalk marks, crates, the rite...)
 * is a `SessionSystem` in this folder, registered in `index.ts`. A new feature adds a file here
 * and a line there, not branches in `session.ts`.
 */

/** Seconds per server tick: what a held action (opening, tying, unbarring...) adds each tick. */
export const TICK_DT = 1 / TICK_RATE;

export interface Player {
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
	/** What they have done down here, for the results screen (see `Session.summary`). */
	stats: { kills: number; crates: number; clues: number };
	/** Most recent input simulated (held buttons the server acts on, like revive). */
	lastInput: InputFrame | null;
	/** The loot crate they have open (its id). */
	crate: string | null;
	/** The chalk symbols on their wheel: the only ones they may draw. */
	markWheel: readonly string[];
}

/** One input frame a player's movement was just simulated for (`SessionSystem.simulated`). */
export interface SimulatedFrame {
	frame: InputFrame;
	/** Interact went down on this frame (it was up on the one before). */
	pressedInteract: boolean;
	/** Attack went down on this frame. */
	pressedAttack: boolean;
	/** The headlamp was lit before this frame. */
	wasLit: boolean;
	/** What their own movement did (landings, ropes grabbed and let go). */
	events: SimEvent[];
}

/** What a session gives its systems: the map, the players and the shared helpers. */
export interface SessionContext {
	readonly id: string;
	readonly seed: number;
	readonly layout: MapLayout;
	// Built from the map: replaced when it is regenerated, so read them each time, never keep one.
	readonly world: CollisionWorld;
	readonly nav: NavGrid;
	readonly creatures: CreatureDirector;
	readonly items: WorldItems;
	readonly crates: Crates;
	readonly doors: Doors;
	readonly affliction: AfflictionDirector;
	readonly rite: RiteDirector;
	readonly hooks: SessionHooks;
	/** How many players went down (party size, for tuning and stats). */
	readonly joined: number;
	readonly players: ReadonlyMap<string, Player>;
	/** This tick's events, broadcast with it (a new array every tick: push, don't keep). */
	readonly events: GameEvent[];
	/** The other systems, by name, for the few things one asks of another. */
	readonly systems: Systems;
	send(player: Player, message: ServerMessage): void;
	/** To everyone down here, and the dead who are watching. */
	broadcast(message: ServerMessage): void;
	/** Take sanity off a player (not in god mode, not if already down); at 0 they go down. */
	hurt(player: Player, amount: number): void;
	down(player: Player): void;
	revive(player: Player): void;
	/** Not down, not in water, not climbing, not busy with something else in the hands. */
	canUseHands(player: Player): boolean;
	/** The nearest spot to `position` a standing player fits. */
	freeSpot(position: Vec3): Vec3;
	/** Achievements for everyone still down here (not dead or out). */
	awardEveryoneDown(earned: string[]): void;
	combat(): CombatContext;
}

/** What an admin command handler gets: the command, narrowed to its kind. */
export type AdminHandlers = {
	[K in AdminCommand['kind']]?: (
		player: Player,
		command: AdminCommand & { kind: K }
	) => boolean | void;
};

/**
 * A feature's part in an expedition. Every hook is optional. Hooks run in the order systems are
 * listed in `index.ts`, which is also the order of their `step` in a tick.
 */
export interface SessionSystem {
	/** A map was built (the first one, or a regenerated one): replace whatever was made from the old. */
	mapBuilt?(): void;
	/** An admin is replacing the map: let go of anything in the old one. */
	regenerating?(): void;
	/** The new map was built and sent to everyone (`map`): tell them what goes with it. */
	regenerated?(): void;
	/** A player came down (`resumed` false) or back on a new connection, and was sent `welcome`. */
	joined?(player: Player, resumed: boolean): void;
	/** A dropped player is back: whatever they had open went with the old connection. */
	reconnecting?(player: Player): void;
	/** A player is leaving the session (extracted, dead, abandoned or gone). */
	left?(player: Player): void;
	/** A player went down. */
	downed?(player: Player): void;
	/** A player's input frame was simulated (in order, after combat and falls). */
	simulated?(player: Player, step: SimulatedFrame): void;
	/** Once per tick, after every player's input was simulated. */
	step?(): void;
	/**
	 * Admin commands this system carries out (dev mode only). Return false when the command was
	 * refused (bad arguments): it is not logged.
	 */
	admin?: AdminHandlers;
}
