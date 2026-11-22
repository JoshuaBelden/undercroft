import { stepLoudness } from '../src/lib/shared/items/gear.ts';
import { unseen } from '../src/lib/shared/player/conditions.ts';
import {
	CREATURES,
	creatureHealth,
	type CreatureAnim,
	type CreatureDef
} from '../src/lib/content/creatures.ts';
import { MOVEMENT } from '../src/lib/content/player/movement.ts';
import { SIM_RATE, TICK_RATE } from '../src/lib/shared/constants.ts';
import type { CreatureSnapshot, CreatureState } from '../src/lib/shared/creature/types.ts';
import { bodySamples, lampIllumination } from '../src/lib/shared/creature/visibility.ts';
import { segmentBlocked, type CollisionWorld } from '../src/lib/shared/map/collision.ts';
import {
	findPath,
	gridDistances,
	lowerStance,
	nearestPoint,
	reachFilter,
	type NavFilter,
	type NavGrid
} from '../src/lib/shared/map/nav.ts';
import type { ConditionId } from '../src/lib/content/player/conditions.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';
import {
	createPlayerState,
	eyeHeight,
	idleFrame,
	stepPlayer
} from '../src/lib/shared/player/simulate.ts';
import { ATTRACTION, byParty, type Movement } from '../src/lib/content/attraction.ts';
import { Attraction } from './attraction.ts';
import type { PlayerState } from '../src/lib/shared/player/types.ts';
import { Rng } from '../src/lib/shared/rng.ts';
import { STROBE } from '../src/lib/content/statuses.ts';
import {
	applyStatus,
	hasStatus,
	stepStatuses,
	type Statuses
} from '../src/lib/shared/status/status.ts';

/**
 * Server-side creature AI. Each creature patrols around its spawn point until it hears someone or
 * sees a lamp in front of it. Then it stops and waits (alert), creeps over to look (investigate),
 * and goes back to patrolling. Someone it sees close enough, touches, or is hit by, it chases
 * (agro) along the nav grid in a creep-then-burst rhythm and attacks in melee, until it loses them
 * for long enough; then it patrols from wherever it gave up. Movement reuses the player
 * simulation, so creatures collide, climb stairs and swim like players do.
 * See docs/dev/creatures.md.
 */

interface Creature {
	id: string;
	def: CreatureDef;
	/** The nav points it may use (its def's reach); undefined for anywhere. */
	allow: NavFilter | undefined;
	body: PlayerState;
	mode: CreatureState;
	anim: CreatureAnim;
	animTime: number;
	/** The centre of its patrol, and the nav points it patrols between (within patrol.radius). */
	anchor: Vec3;
	spots: number[];
	/** Patrol: where it's walking to, and seconds left pausing before picking the next spot. */
	goal: Vec3 | null;
	pause: number;
	/** Alert and investigate: the noise or light it's looking into. */
	alertPoint: Vec3 | null;
	/** Alert: seconds left waiting, and seconds waited. */
	alertLeft: number;
	alertTime: number;
	/** Investigate: arrived at the spot, seconds left looking around, and the yaw it arrived at. */
	arrived: boolean;
	linger: number;
	lookYaw: number;
	/** Agro: the player it chases, where it last perceived them, and seconds since. */
	target: string | null;
	lastKnown: Vec3 | null;
	evade: number;
	path: Vec3[];
	pathIndex: number;
	repath: number;
	bursting: boolean;
	/** Seconds left in the current creep or burst. */
	rhythm: number;
	attackTime: number;
	attackHit: boolean;
	cooldown: number;
	/** Stuck detection: distance to the current waypoint and how long it hasn't improved. */
	bestDistance: number;
	stuck: number;
	/** Seconds it has been (nearly) motionless. */
	still: number;
	/**
	 * Damage taken so far. It dies once that reaches its health for the party's size
	 * (`creatureHealth`), so it stays right however many arrive after it spawned.
	 */
	wounds: number;
	/** Seconds left reeling from a hard hit (no moving or attacking). */
	staggered: number;
	/** Seconds left held fast (a snare): no moving or attacking. */
	held: number;
	/** Bleeding: damage a second, seconds left, and who did it (they get the kill). */
	bleed: { dps: number; left: number; from: Prey | null } | null;
	/** Statuses it has (stunned: no moving or attacking), by its own reactions to them. */
	statuses: Statuses;
	/** Seconds since it died. */
	deadTime: number;
	/** One that keeps to itself (`def.shy`) but is something else: seen or hit, it turns. */
	fated: boolean;
	/** Fleeing at a run (it was hit), not a walk (it was seen). */
	running: boolean;
	/** A flier (`def.flight`): the player whose lamp it's at, and where it is in its flutter. */
	follow: string | null;
	phase: number;
	/** Flown off and out of the game: removed this tick. */
	gone: boolean;
}

/** A line creatures won't cross (blessed salt), across the floor from `a` to `b`. */
export interface Ward {
	a: Vec3;
	b: Vec3;
}

/** A creature's body for hit tests. */
export interface CreatureBody {
	id: string;
	position: Vec3;
	height: number;
	radius: number;
}

/** A player as the director sees them. */
export interface Prey {
	id: string;
	state: PlayerState;
}

export interface CreatureHit {
	playerId: string;
	damage: number;
	/** A condition the hit gives (a spider's poison). */
	condition?: { id: ConditionId; seconds?: number };
}

interface SpawnSpot {
	position: Vec3;
	yaw: number;
}

const DT = 1 / SIM_RATE;
const SUBSTEPS = Math.round(SIM_RATE / TICK_RATE);
const TICK_DT = 1 / TICK_RATE;
const REPATH = 0.5;
const WAYPOINT_REACHED = 0.35;
/** Seconds a waypoint may go unapproached before re-planning. */
const STUCK_TIME = 1.5;
/** Its eyes are this far up its body. */
const EYE = 0.88;
/** Seconds motionless before a moving creature's animation settles to idle. */
const STILL_TIME = 0.6;
/** Swimmers aim this far above the floor point they're heading for. */
const SWIM_AIM = 0.2;
/** Noises are heard this far up or down (gunfire carries to the floor above and below). */
const HEAR_HEIGHT = 5;
/** Its own players' movement is heard this far up or down. */
const STEP_HEIGHT = 3;
/** How fast (rad/s) it turns to face something while standing still. */
const TURN_RATE = 4;
/** Patrol spots closer than this to where it stands aren't picked (it would barely move). */
const MIN_PATROL_STEP = 4;
/** Creature markers snap to a nav point within this distance. */
const MARKER_SNAP = 2;
/** Groups of one kind spawned at the start keep at least this far apart. */
const SPREAD = 20;
/** A chase target out of its reach: it heads for the nearest point it can stand within this. */
const EDGE_RADIUS = 6;

export class CreatureDirector {
	private creatures: Creature[] = [];
	private rng: Rng;
	private nextId = 1;
	/** Nav points of the map's creature-* markers. */
	private markers: number[];
	/** The level of the map a position is on (from `populate`), for kinds kept to some levels. */
	private tierOf: ((position: Vec3) => number | null) | null = null;
	/** The party's noise and light, drawing witches in (server/attraction.ts). */
	readonly attraction = new Attraction();
	/**
	 * Each lamp's fliers, by `<kind>:<player>`: seconds it has been on bright, seconds it has been off, and seconds until the next one arrives.
	 */
	private lamps = new Map<string, { bright: number; dark: number; next: number }>();

	constructor(
		private world: CollisionWorld,
		private nav: NavGrid,
		markers: Vec3[],
		seed: number
	) {
		this.rng = new Rng(seed ^ 0x5eed);
		this.markers = markers.map((m) => nearestPoint(nav, m, MARKER_SNAP)).filter((i) => i >= 0);
	}

	get count(): number {
		return this.creatures.length;
	}

	/**
	 * Place the creatures a map starts with: every kind that scatters, by its spawn rule, far
	 * (along the grid) from the start. Kinds drawn in later (the witch) start with none. `tierOf`
	 * gives the level of the map a position is on, for kinds kept to some levels.
	 */
	populate(start: Vec3, tierOf?: (position: Vec3) => number | null): void {
		this.tierOf = tierOf ?? null;
		for (const def of Object.values(CREATURES)) {
			if (def.spawn.kind === 'scatter') this.scatter(def, start);
		}
	}

	/** One scattering kind's groups, spread out from each other. */
	private scatter(def: CreatureDef, start: Vec3): void {
		const rule = def.spawn;
		if (rule.kind !== 'scatter') return;
		if (this.rng.next() >= (rule.chance ?? 1)) return;
		const allow = reachFilter(def.reach);
		const from = nearestPoint(this.nav, start, 2, allow);
		if (from < 0) return;
		const distance = gridDistances(this.nav, [from], true, allow);
		const spots = (
			rule.where === 'corner'
				? this.cornerSpots(distance, rule.minDistance, allow)
				: this.openSpots(distance, rule.minDistance, allow)
		).filter((spot) => this.onTier(def, spot.position));
		const groups = this.rng.int(rule.groups[0], rule.groups[1]);
		const placed: Vec3[] = [];
		for (let tries = 0; tries < 200 && placed.length < groups && spots.length; tries++) {
			const spot = this.rng.pick(spots);
			if (
				placed.some((p) => Math.hypot(p[0] - spot.position[0], p[2] - spot.position[2]) < SPREAD)
			) {
				continue;
			}
			placed.push(spot.position);
			const size = this.rng.int(rule.size[0], rule.size[1]);
			const anchor = this.add(def, spot.position, spot.yaw);
			// The rest of the group: open points near the first, where it can go.
			const near = this.nearby(spot.position, rule.spread, allow);
			for (let i = 1; i < size && near.length; i++) {
				const at = this.nav.points[near.splice(this.rng.int(0, near.length - 1), 1)[0]];
				this.add(def, at.position, this.rng.next() * Math.PI * 2).anchor = [...anchor.anchor];
			}
		}
	}

	/**
	 * Admin: a creature a few metres in front of a player, facing them. `fated` makes one that keeps
	 * to itself (a dweller) one that turns.
	 */
	spawnNear(state: PlayerState, kind = 'witch', fated?: boolean, by?: string): void {
		const def = CREATURES[kind];
		if (!def) return;
		const ahead: Vec3 = [
			state.position[0] - Math.sin(state.yaw) * 4,
			state.position[1],
			state.position[2] - Math.cos(state.yaw) * 4
		];
		const index = nearestPoint(this.nav, ahead, 4, reachFilter(def.reach));
		if (index < 0) return;
		const position = this.nav.points[index].position;
		const c = this.add(def, position, yawTo(position, state.position));
		if (kind === ATTRACTION.kind) this.noteWitch('admin');
		if (fated !== undefined && def.shy) c.fated = fated;
		// A flier goes to the lamp of whoever brought it.
		if (def.flight) c.follow = by ?? null;
	}

	/** Where each living creature that's dreadful to see is (for sanity: seeing them). */
	bodies(): { kind: string; position: Vec3 }[] {
		return this.living()
			.filter((c) => c.def.dread)
			.map((c) => ({ kind: c.def.id, position: c.body.position }));
	}

	/** How many of a kind are alive. */
	alive(kind: string): number {
		return this.living().filter((c) => c.def.id === kind).length;
	}

	/** Living creatures' hit capsules. */
	hitBodies(): CreatureBody[] {
		return this.living()
			.filter((c) => !c.def.invulnerable)
			.map((c) => ({
				id: c.id,
				position: c.body.position,
				height: c.def.height,
				radius: c.def.hitRadius
			}));
	}

	/** The friendly ones (the surveyor): where each is, for talking to. */
	friendlies(): (CreatureBody & { kind: string })[] {
		return this.living()
			.filter((c) => c.def.friendly)
			.map((c) => ({
				id: c.id,
				kind: c.def.id,
				position: c.body.position,
				height: c.def.height,
				radius: c.def.hitRadius
			}));
	}

	/**
	 * Where one that wanders (the surveyor) has been before anyone arrived: `legs` walks from where
	 * it stands, each to one of its corners, as the points along them.
	 */
	wanderRoute(id: string, legs: number): Vec3[] {
		const c = this.creatures.find((x) => x.id === id);
		if (!c || !c.spots.length) return [];
		const route: Vec3[] = [];
		let from = nearestPoint(this.nav, c.body.position, 2, c.allow);
		for (let i = 0; i < legs && from >= 0; i++) {
			const to = this.rng.pick(c.spots);
			const path = findPath(this.nav, from, to, undefined, c.allow);
			if (path) route.push(...path);
			from = to;
		}
		return route;
	}

	/** Creatures killed this expedition (feeds the Affliction meter). */
	kills = 0;

	/**
	 * How bold creatures are (the Affliction's omen stage): they perceive and hear this much
	 * further, and creep for this much less time between bursts.
	 */
	boldness = 1;
	/** Explorers who went down: how much damage kills a creature (`creatureHealth`). */
	party = 1;

	/**
	 * Add a creature far (along the grid) from every player, e.g. when an omen stage begins: at a
	 * creature-* marker if one is far enough, otherwise in a corner.
	 */
	spawnFar(players: Vec3[], minDistance: number, kind = 'witch'): boolean {
		const def = CREATURES[kind];
		if (!def) return false;
		const allow = reachFilter(def.reach);
		const starts = players.map((p) => nearestPoint(this.nav, p)).filter((i) => i >= 0);
		const distance = gridDistances(this.nav, starts);
		let spots = this.markerSpots(distance, minDistance, allow);
		if (!spots.length) spots = this.cornerSpots(distance, minDistance, allow);
		if (!spots.length) return false;
		const spot = this.rng.pick(spots);
		this.add(def, spot.position, spot.yaw);
		// Only the omens spawn far.
		if (kind === ATTRACTION.kind) this.noteWitch('omen');
		return true;
	}

	/**
	 * Admin: why the last witch came (a meter, an omen, a dweller turning, admin) and seconds
	 * since, for the attraction bars.
	 */
	lastWitch: { cause: string; seconds: number } | null = null;

	private noteWitch(cause: string): void {
		this.lastWitch = { cause, seconds: 0 };
	}

	clear(): void {
		this.creatures = [];
	}

	/** Lines creatures won't cross right now (blessed salt, server/systems/hazards.ts). */
	wards: Ward[] = [];
	/** A training ground: nothing comes to noise or light (no witch, no moths). */
	quiet = false;
	/** Every hit this tick (for the training ground's numbers), and dummies made whole. */
	private struck: { id: string; amount: number; position: Vec3 }[] = [];
	private reset: { id: string; position: Vec3 }[] = [];
	/** Dummies on a track: where its middle is, which way across, how far either way, how long a run. */
	private tracks = new Map<
		string,
		{ centre: Vec3; yaw: number; half: number; seconds: number; t: number }
	>();
	/** Bait on the floor (HazardSystem): creatures of its kind within reach go to it instead. */
	lures: Lure[] = [];
	/** Censers held (GearSystem): creatures of these kinds won't come within the radius. */
	repels: Repel[] = [];
	/** Glow sticks lit (HazardSystem): moths come to them as to a bright lamp. */
	glows: { id: string; position: Vec3 }[] = [];
	/** Creatures that bled to death since this was last read (`takeBled`), and who opened the wound. */
	private bled: { id: string; by: string | null; position: Vec3 }[] = [];

	/** Those that bled to death since last asked, for the death to be told (CreatureSystem). */
	takeBled(): { id: string; by: string | null; position: Vec3 }[] {
		const out = this.bled;
		this.bled = [];
		return out;
	}

	/**
	 * Creatures of a kind come out at a spot (a rat swarm from a bone pile, spiders from an egg
	 * sac), on the nav points nearest it, coming for `at` the player if there is one.
	 */
	spawnAt(kind: string, position: Vec3, count: number, prey: Prey | null): void {
		const def = CREATURES[kind];
		if (!def) return;
		for (let i = 0; i < count; i++) {
			const index = nearestPoint(this.nav, position, 4, reachFilter(def.reach));
			if (index < 0) return;
			const at = this.nav.points[index].position;
			const c = this.add(def, [at[0] + (i % 2) * 0.3, at[1], at[2] + Math.floor(i / 2) * 0.3], 0);
			if (prey && !def.flight) this.chase(c, prey);
		}
	}

	/** The bait this creature goes to: of its kind, within reach, the nearest; or none. */
	private lureFor(c: Creature): Lure | null {
		let best: Lure | null = null;
		let bestD = Infinity;
		for (const lure of this.lures) {
			if (lure.creature !== c.def.id) continue;
			const d = distance3(lure.position, c.body.position);
			if (d <= lure.radius && d < bestD) {
				best = lure;
				bestD = d;
			}
		}
		return best;
	}

	/** Off after something that isn't a player (bait): it forgets whoever it was after and goes to look. */
	private goTo(c: Creature, point: Vec3): void {
		if (c.mode === 'agro' || c.mode === 'attack') {
			c.target = null;
			c.mode = 'investigate';
			c.arrived = false;
			c.linger = c.def.alert.linger;
			this.resetPath(c);
		}
		if (c.mode === 'patrol' || c.mode === 'alert') {
			c.mode = 'investigate';
			c.arrived = false;
			c.linger = c.def.alert.linger;
			this.resetPath(c);
		}
		c.alertPoint = [...point];
		// It stays at it while the bait lasts.
		if (c.mode === 'investigate') c.linger = Math.max(c.linger, 1);
	}

	/** A blow that sends it reeling (a sledgehammer): staggered `seconds`, whatever the blow. */
	stagger(id: string, seconds: number): void {
		const c = this.creatures.find((x) => x.id === id);
		if (!c || c.mode === 'dead' || c.def.flight) return;
		c.staggered = Math.max(c.staggered, seconds);
		if (c.mode === 'attack' && !c.attackHit) {
			c.mode = 'agro';
			c.cooldown = c.def.attack.cooldown * 0.5;
		}
	}

	/**
	 * A training dummy's tick: it stands, or runs its track side to side (`track`: half its run
	 * either way along local X), staggers and bleeds as anything does, and turns to no one.
	 */
	private train(c: Creature): void {
		c.staggered = Math.max(0, c.staggered - TICK_DT);
		if (c.bleed) {
			const wound = c.bleed;
			wound.left -= TICK_DT;
			if (wound.left <= 0) c.bleed = null;
			this.damage(c.id, wound.dps * TICK_DT, wound.from);
		}
		const track = this.tracks.get(c.id);
		if (track && c.staggered <= 0 && c.held <= 0) {
			track.t += TICK_DT;
			const k = Math.sin((track.t / track.seconds) * Math.PI * 2) * track.half;
			c.body.position = [
				track.centre[0] + Math.cos(track.yaw) * k,
				track.centre[1],
				track.centre[2] - Math.sin(track.yaw) * k
			];
		}
		c.held = Math.max(0, c.held - TICK_DT);
		this.animate(c, false);
	}

	/**
	 * Stand a training dummy at a place, facing `yaw`; with `track` (m), it runs that far side
	 * to side across where it faces.
	 */
	placeDummy(position: Vec3, yaw: number, track?: number): void {
		const def = CREATURES.dummy;
		if (!def) return;
		const c = this.add(def, [...position], yaw);
		c.mode = 'patrol';
		if (track) {
			this.tracks.set(c.id, { centre: [...position], yaw, half: track / 2, seconds: 6, t: 0 });
		}
	}

	/** Dummy hits this tick, for the client's numbers; and dummies that came whole again. */
	takeStruck(): {
		struck: { id: string; amount: number; position: Vec3 }[];
		reset: { id: string; position: Vec3 }[];
	} {
		const out = { struck: this.struck, reset: this.reset };
		this.struck = [];
		this.reset = [];
		return out;
	}

	/** Hold a creature fast for `seconds` (a snare). False if there is no such creature alive. */
	hold(id: string, seconds: number): boolean {
		const c = this.creatures.find((x) => x.id === id);
		if (!c || c.mode === 'dead' || c.def.flight) return false;
		c.held = Math.max(c.held, seconds);
		if (c.mode === 'attack' && !c.attackHit) {
			c.mode = 'agro';
			c.cooldown = c.def.attack.cooldown * 0.5;
		}
		return true;
	}

	/**
	 * Set a creature bleeding: `dps` a second for `seconds`, `from` a player (it comes for them,
	 * and the kill is theirs). A fresh wound replaces a weaker one. False if it can't bleed.
	 */
	bleed(id: string, dps: number, seconds: number, from: Prey | null): boolean {
		const c = this.creatures.find((x) => x.id === id);
		if (!c || c.mode === 'dead' || c.def.invulnerable) return false;
		if (c.bleed && c.bleed.dps * c.bleed.left > dps * seconds) return true;
		c.bleed = { dps, left: seconds, from };
		return true;
	}

	/** Whether a creature is bleeding (for the client's cue). */
	bleeding(id: string): boolean {
		return !!this.creatures.find((x) => x.id === id)?.bleed;
	}

	/** What kind of creature this is (CREATURES), dead or alive, while it is in the map. */
	kindOf(id: string): string | undefined {
		return this.creatures.find((x) => x.id === id)?.def.id;
	}

	/** Admin: kill every creature. */
	killAll(): void {
		for (const c of this.living()) if (!c.def.invulnerable) this.kill(c);
	}

	/**
	 * A player hurt a creature. A hard hit staggers it (cancelling an attack that hasn't landed);
	 * any hit sets it on the attacker. Returns true if this killed it.
	 */
	damage(id: string, amount: number, from: Prey | null): boolean {
		const c = this.creatures.find((x) => x.id === id);
		if (!c || c.mode === 'dead' || c.def.invulnerable) return false;
		c.wounds += amount;
		if (c.def.dummy) this.struck.push({ id: c.id, amount, position: [...c.body.position] });
		if (c.wounds >= creatureHealth(c.def, this.party)) {
			// A training dummy is whole again, never dead.
			if (c.def.dummy) {
				c.wounds = 0;
				this.reset.push({ id: c.id, position: [...c.body.position] });
				return false;
			}
			this.kill(c);
			return true;
		}
		if (amount >= c.def.stagger.threshold) {
			c.staggered = c.def.stagger.seconds;
			if (c.mode === 'attack' && !c.attackHit) {
				c.mode = 'agro';
				c.cooldown = c.def.attack.cooldown * 0.5;
			}
		}
		// A flier only dies; it never comes for anyone.
		if (c.def.flight) return false;
		if (c.def.shy) {
			// One that keeps to itself runs off; one that's something else shows what it is.
			if (c.fated && from) this.turn(c, from);
			else if (c.mode !== 'flee' || !c.running) this.flee(c, from ? [from] : [], true);
			return false;
		}
		if (from && c.mode !== 'attack') this.chase(c, from);
		return false;
	}

	/** Someone is right on top of it (one that keeps to itself): within `seenRange`, in sight. */
	private seenBy(c: Creature, targets: Prey[]): Prey | null {
		const shy = c.def.shy;
		if (!shy) return null;
		const b = c.body.position;
		const mid: Vec3 = [b[0], b[1] + c.def.height * 0.6, b[2]];
		for (const prey of targets) {
			const s = prey.state;
			const eye: Vec3 = [s.position[0], s.position[1] + eyeHeight(s), s.position[2]];
			const dist = Math.hypot(mid[0] - eye[0], mid[1] - eye[1], mid[2] - eye[2]);
			if (dist > shy.seenRange) continue;
			if (!segmentBlocked(this.world, eye, mid)) return prey;
		}
		return null;
	}

	/** It was something else all along: it becomes its `shy.turnInto` and goes for them. */
	private turn(c: Creature, prey: Prey): void {
		const def = c.def.shy && CREATURES[c.def.shy.turnInto];
		if (!def) return;
		c.def = def;
		c.allow = reachFilter(def.reach);
		c.wounds = 0;
		c.staggered = 0;
		c.statuses = {};
		c.fated = false;
		c.running = false;
		c.mode = 'patrol';
		this.chase(c, prey);
		if (def.id === ATTRACTION.kind) this.noteWitch('a dweller turned');
	}

	/**
	 * Leave for a corner at least `shy.fleeDistance` (along the grid) from everyone it knows of,
	 * walking (seen) or running (hit). With nowhere that far, the farthest corner it can find.
	 */
	private flee(c: Creature, from: Prey[], running: boolean): void {
		const shy = c.def.shy;
		if (!shy) return;
		const starts = from.map((p) => nearestPoint(this.nav, p.state.position)).filter((i) => i >= 0);
		if (!starts.length) starts.push(nearestPoint(this.nav, c.body.position, 2, c.allow));
		const distance = gridDistances(this.nav, starts, false, c.allow);
		let spots = this.cornerSpots(distance, shy.fleeDistance, c.allow);
		if (!spots.length) spots = this.cornerSpots(distance, shy.fleeDistance / 2, c.allow);
		c.mode = 'flee';
		c.running = running;
		c.target = null;
		c.goal = null;
		this.resetPath(c);
		if (!spots.length) return;
		const spot = this.rng.pick(spots);
		c.goal = spot.position;
		c.lookYaw = spot.yaw;
	}

	/** Head for the corner it chose; there, sit again (facing into it). */
	private fleeing(c: Creature): Vec3 | null {
		const move = c.goal ? this.steer(c, c.goal, null) : null;
		if (move) return move;
		this.startPatrol(c, [...c.body.position]);
		c.body.yaw = c.lookYaw;
		c.running = false;
		return null;
	}

	/**
	 * A player turned their lamp on from off (a strobe): every creature vulnerable to it that this
	 * lamp lights gets what it causes (stunned), by its own reaction, unless it is immune. Returns
	 * how many did.
	 */
	strobe(state: PlayerState): number {
		let n = 0;
		for (const c of this.living()) {
			if (!c.def.vulnerable?.includes('strobe')) continue;
			const light = Math.max(
				...bodySamples(c.body.position, c.def.height).map((p) =>
					lampIllumination(this.world, state, p)
				)
			);
			if (light < STROBE.light) continue;
			if (applyStatus(c.statuses, STROBE.causes, c.def.statuses ?? {})) n++;
		}
		return n;
	}

	/** Is this creature stunned (tests, admin)? */
	stunned(id: string): boolean {
		const c = this.creatures.find((x) => x.id === id);
		return !!c && hasStatus(c.statuses, 'stunned');
	}

	/**
	 * A noise at `position` heard within `radius` (on about the same floor). With a source player
	 * (gunfire, a swing) within its chase range, it chases them; otherwise (a brick landing,
	 * distant gunfire) it's alerted to the spot, unless it's already chasing someone.
	 */
	hear(position: Vec3, radius: number, source: Prey | null): void {
		// Every noise adds to the party's (server/attraction.ts).
		this.attraction.heard(radius, position, source?.id ?? null);
		for (const c of this.living()) {
			const b = c.body.position;
			if (Math.abs(position[1] - b[1]) > HEAR_HEIGHT) continue;
			if (distance3(position, b) > radius) continue;
			if (c.mode === 'attack') continue;
			// A passive kind pays noise no mind (it only bites back).
			if (c.def.perception.passive) continue;
			if (source) {
				const near =
					distance3(source.state.position, b) <= c.def.perception.agro.litRange * this.boldness;
				if (near || (c.mode === 'agro' && c.target === source.id)) {
					this.chase(c, source);
					continue;
				}
			}
			if (c.mode !== 'agro') this.alertTo(c, position);
		}
	}

	private living(): Creature[] {
		return this.creatures.filter((c) => c.mode !== 'dead');
	}

	private kill(c: Creature): void {
		c.mode = 'dead';
		c.deadTime = 0;
		c.target = null;
		c.path = [];
		c.body.velocity = [0, c.body.velocity[1], 0];
		this.kills += c.def.killWeight;
	}

	/**
	 * The party's noise and light this tick. A meter that fills brings a witch to whoever added the
	 * most, a few metres off, coming to look; with as many about as the party's cap, the nearest
	 * one goes to look instead. Either way the meter starts again. With nowhere for one to appear,
	 * it stays full and tries again shortly.
	 */
	private attract(targets: Prey[]): void {
		const explorers = targets.map((p) => ({
			id: p.id,
			state: p.state,
			movement: movementNoise(p.state)
		}));
		for (const draw of this.attraction.step(explorers, this.boldness)) {
			const player = targets.find((p) => p.id === draw.player);
			if (!player) continue;
			const kind = ATTRACTION.kind;
			if (this.alive(kind) >= byParty(ATTRACTION.cap, this.attraction.party)) {
				this.lookNearest(kind, player.state.position);
				this.attraction.answered(draw.meter);
				this.noteWitch(`${draw.meter} (at the cap: one went to look)`);
			} else if (this.summon(kind, player.state)) {
				this.attraction.answered(draw.meter);
				this.noteWitch(draw.meter);
			} else {
				this.attraction.hold(draw.meter);
			}
		}
	}

	/**
	 * Bring a creature to someone: it appears `ATTRACTION.distance` m away along the grid (out of
	 * their sight if it can) and comes to look where they are. Returns false with nowhere to put it.
	 */
	summon(kind: string, state: PlayerState): boolean {
		const def = CREATURES[kind];
		if (!def) return false;
		const allow = reachFilter(def.reach);
		let from = nearestPoint(this.nav, state.position, 2, allow);
		if (from < 0) from = nearestPoint(this.nav, state.position, EDGE_RADIUS, allow);
		if (from < 0) return false;
		const distance = gridDistances(this.nav, [from], false, allow);
		const [near, far] = ATTRACTION.distance;
		const eye: Vec3 = [state.position[0], state.position[1] + eyeHeight(state), state.position[2]];
		const spots: number[] = [];
		const hidden: number[] = [];
		distance.forEach((d, i) => {
			const point = this.nav.points[i];
			if (d === undefined || d < near || d > far) return;
			if (point.water || point.clearance !== 'stand') return;
			spots.push(i);
			const p = point.position;
			if (segmentBlocked(this.world, eye, [p[0], p[1] + def.height * 0.7, p[2]])) hidden.push(i);
		});
		const options = hidden.length ? hidden : spots;
		if (!options.length) return false;
		const position = this.nav.points[this.rng.pick(options)].position;
		const c = this.add(def, position, yawTo(position, state.position));
		this.lookInto(c, state.position);
		return true;
	}

	/** The nearest of a kind that isn't hunting someone goes to look at a spot. */
	private lookNearest(kind: string, point: Vec3): void {
		let best: Creature | null = null;
		let bestD = Infinity;
		for (const c of this.living()) {
			if (c.def.id !== kind || c.mode === 'agro' || c.mode === 'attack') continue;
			const d = distance3(c.body.position, point);
			if (d < bestD) {
				bestD = d;
				best = c;
			}
		}
		if (best) this.lookInto(best, point);
	}

	/** Go and look at a spot now (investigating), without waiting first. */
	private lookInto(c: Creature, point: Vec3): void {
		c.mode = 'investigate';
		c.alertPoint = [...point];
		c.arrived = false;
		c.linger = c.def.alert.linger;
		c.goal = null;
		c.pause = 0;
		this.resetPath(c);
	}

	/** Advance every creature by one server tick. Returns the hits that landed. */
	step(prey: Prey[]): CreatureHit[] {
		const hits: CreatureHit[] = [];
		// Grave dirt on them: nothing can find them (those chasing them lose them).
		const targets = prey.filter(
			(p) => !p.state.downed && !p.state.dead && !p.state.extracted && !unseen(p.state)
		);
		if (this.lastWitch) this.lastWitch.seconds += TICK_DT;
		if (!this.quiet) {
			this.attract(targets);
			this.lampFliers(targets);
		}
		for (const c of this.creatures) {
			if (c.mode === 'dead') {
				// It drops where it is (a flier falls).
				c.deadTime += TICK_DT;
				this.move(c, null, false);
				this.animate(c, false);
				continue;
			}
			if (c.def.flight) {
				this.fly(c, targets);
				continue;
			}
			if (c.def.dummy) {
				this.train(c);
				continue;
			}
			c.cooldown = Math.max(0, c.cooldown - TICK_DT);
			stepStatuses(c.statuses, c.def.statuses ?? {}, TICK_DT);
			if (c.bleed) {
				// Its wound runs: the damage a tick, and whoever opened it gets the kill.
				const wound = c.bleed;
				wound.left -= TICK_DT;
				if (wound.left <= 0) c.bleed = null;
				if (this.damage(c.id, wound.dps * TICK_DT, wound.from)) {
					const b = c.body.position;
					this.bled.push({
						id: c.id,
						by: wound.from?.id ?? null,
						position: [b[0], b[1] + 1, b[2]]
					});
					continue;
				}
			}
			if (c.held > 0) {
				// Held fast: it struggles where it is.
				c.held -= TICK_DT;
				this.move(c, null, false);
				this.animate(c, false);
				continue;
			}
			if (c.def.shy && c.mode === 'patrol') {
				// Sitting, it's seen: it gets up and goes, or shows what it is.
				const seer = this.seenBy(c, targets);
				if (seer && c.fated) this.turn(c, seer);
				else if (seer) this.flee(c, targets, false);
			}
			// Bait in reach: it goes to that, whoever is about.
			const lure = this.lureFor(c);
			if (lure) {
				this.goTo(c, lure.position);
			} else {
				this.perceive(c, targets);
			}
			if (hasStatus(c.statuses, 'stunned')) {
				// Stunned: it stands where it is, and an attack not yet landed is lost.
				if (c.mode === 'attack' && !c.attackHit) {
					c.mode = 'agro';
					c.cooldown = c.def.attack.cooldown * 0.5;
				}
				this.move(c, null, false);
				this.animate(c, false);
				continue;
			}
			if (c.staggered > 0) {
				c.staggered -= TICK_DT;
				this.move(c, null, false);
				this.animate(c, false);
				continue;
			}
			const target = targets.find((p) => p.id === c.target) ?? null;
			let move: Vec3 | null = null;
			let sprint = false;
			switch (c.mode) {
				case 'patrol':
					// One that keeps to itself sits where it is.
					if (c.def.friendly) {
						// Someone close: it stops and turns to them.
						const near = this.nearest(c, targets, c.def.friendly.notice);
						if (near) {
							this.turnTo(c, yawTo(c.body.position, near.state.position));
							break;
						}
					}
					move = c.def.shy ? null : this.patrol(c);
					break;
				case 'flee':
					move = this.fleeing(c);
					sprint = c.running;
					break;
				case 'alert':
					c.alertTime += TICK_DT;
					c.alertLeft -= TICK_DT;
					if (c.alertPoint) this.turnTo(c, yawTo(c.body.position, c.alertPoint));
					if (c.alertLeft <= 0) {
						c.mode = 'investigate';
						c.arrived = false;
						c.linger = c.def.alert.linger;
						this.resetPath(c);
					}
					break;
				case 'investigate':
					move = this.investigate(c);
					break;
				case 'agro': {
					if (!target || c.evade > c.def.perception.evadeTime) {
						// Lost them: patrol from here.
						this.startPatrol(c, [...c.body.position]);
						break;
					}
					const reach = this.inReach(c, target.state);
					if (reach && c.cooldown <= 0) {
						c.mode = 'attack';
						c.attackTime = 0;
						c.attackHit = false;
						c.body.yaw = yawTo(c.body.position, target.state.position);
						break;
					}
					c.rhythm -= TICK_DT;
					if (c.rhythm <= 0) {
						c.bursting = !c.bursting;
						const [lo, hi] = c.bursting ? c.def.burstTime : c.def.creepTime;
						c.rhythm = (lo + this.rng.next() * (hi - lo)) / (c.bursting ? 1 : this.boldness);
					}
					// Close enough to see it: go straight at them; otherwise follow the grid.
					const goal = c.lastKnown ?? target.state.position;
					move = reach ? null : this.steer(c, goal, c.evade === 0 ? target.state.position : null);
					sprint = c.bursting;
					break;
				}
				case 'attack': {
					c.attackTime += TICK_DT;
					if (target) c.body.yaw = yawTo(c.body.position, target.state.position);
					if (!c.attackHit && c.attackTime >= c.def.attack.windup) {
						c.attackHit = true;
						if (target && this.inReach(c, target.state, 1.3)) {
							const { damage, condition } = c.def.attack;
							hits.push({ playerId: target.id, damage, ...(condition && { condition }) });
						}
					}
					if (c.attackTime >= c.def.attack.duration) {
						c.cooldown = c.def.attack.cooldown;
						c.mode = 'agro';
						this.resetPath(c);
					}
					break;
				}
			}
			this.move(c, move, sprint);
			this.animate(c, sprint && move !== null);
		}
		this.creatures = this.creatures.filter(
			(c) => !c.gone && (c.mode !== 'dead' || c.deadTime < c.def.corpseTime)
		);
		return hits;
	}

	snapshots(): CreatureSnapshot[] {
		return this.creatures.map((c) => ({
			id: c.id,
			kind: c.def.id,
			state: c.mode,
			position: [round(c.body.position[0]), round(c.body.position[1]), round(c.body.position[2])],
			yaw: round(c.body.yaw),
			anim: c.anim,
			animTime: round(c.animTime)
		}));
	}

	// --- internals ---

	private add(def: CreatureDef, position: Vec3, yaw: number): Creature {
		const body = createPlayerState(position, yaw);
		body.headlamp = 0;
		body.flags.infiniteStamina = true;
		const c: Creature = {
			id: `c${this.nextId++}`,
			def,
			allow: reachFilter(def.reach),
			body,
			mode: 'patrol',
			anim: 'idle',
			animTime: 0,
			anchor: [...position],
			spots: [],
			goal: null,
			pause: 0,
			alertPoint: null,
			alertLeft: 0,
			alertTime: 0,
			arrived: false,
			linger: 0,
			lookYaw: 0,
			target: null,
			lastKnown: null,
			evade: 0,
			path: [],
			pathIndex: 0,
			repath: 0,
			bursting: false,
			rhythm: def.creepTime[0],
			attackTime: 0,
			attackHit: false,
			cooldown: 0,
			bestDistance: Infinity,
			stuck: 0,
			still: 0,
			wounds: 0,
			staggered: 0,
			held: 0,
			bleed: null,
			statuses: {},
			deadTime: 0,
			fated: !!def.shy && this.rng.next() < def.shy.turnChance,
			running: false,
			follow: null,
			phase: this.rng.next() * Math.PI * 2,
			gone: false
		};
		// A flier has no patrol: it's at a lamp.
		if (!def.flight) this.startPatrol(c, c.anchor);
		// Stand a moment before setting off.
		c.pause = this.between(def.patrol.pause);
		this.creatures.push(c);
		return c;
	}

	// --- fliers (def.flight): moths at the lamps ---

	/**
	 * Keep each bright lamp's fliers coming: once it has been on bright for `after` seconds, one every
	 * `arrive` seconds for as long as it stays bright, up to `max`. On low, no more come
	 * but those there stay. Lamp off for `disperse` seconds, or its owner down or gone: all of them
	 * leave.
	 */
	private lampFliers(targets: Prey[]): void {
		for (const def of Object.values(CREATURES)) {
			const flight = def.flight;
			if (!flight) continue;
			for (const p of targets) {
				const s = p.state;
				const key = `${def.id}:${p.id}`;
				let lamp = this.lamps.get(key);
				if (!lamp) {
					lamp = { bright: 0, dark: 0, next: 0 };
					this.lamps.set(key, lamp);
				}
				const mine = this.living().filter(
					(c) => c.def === def && c.follow === p.id && c.mode !== 'flee'
				);
				const lit = s.headlamp > 0 && s.battery > 0;
				if (lit) lamp.dark = 0;
				if (lit && s.headlamp === 2) {
					if (lamp.bright === 0) lamp.next = 0;
					lamp.bright += TICK_DT;
					if (lamp.bright >= flight.after && mine.length < flight.max) {
						lamp.next -= TICK_DT;
						if (lamp.next <= 0) {
							lamp.next = flight.arrive;
							this.flyIn(def, s, p.id);
						}
					}
				} else {
					lamp.bright = 0;
				}
				if (!lit) {
					lamp.dark += TICK_DT;
					if (lamp.dark >= flight.disperse) for (const c of mine) this.flyOff(c);
				}
			}
			// A glow stick lit is a bright lamp lying on the floor.
			for (const glow of this.glows) {
				const key = `${def.id}:${glow.id}`;
				let lamp = this.lamps.get(key);
				if (!lamp) {
					lamp = { bright: 0, dark: 0, next: 0 };
					this.lamps.set(key, lamp);
				}
				const mine = this.living().filter(
					(c) => c.def === def && c.follow === glow.id && c.mode !== 'flee'
				);
				lamp.bright += TICK_DT;
				if (lamp.bright >= flight.after && mine.length < flight.max) {
					lamp.next -= TICK_DT;
					if (lamp.next <= 0) {
						lamp.next = flight.arrive;
						this.flyTo(def, glow);
					}
				}
			}
			for (const c of this.living()) {
				if (c.def !== def || c.mode === 'flee') continue;
				const known =
					targets.some((t) => t.id === c.follow) || this.glows.some((g) => g.id === c.follow);
				if (!known) this.flyOff(c);
			}
		}
	}

	/** One flies in toward a lamp, from out along the beam (or wherever is open nearest it). */
	private flyIn(def: CreatureDef, s: PlayerState, follow: string): void {
		const flight = def.flight;
		if (!flight) return;
		const eye: Vec3 = [s.position[0], s.position[1] + eyeHeight(s), s.position[2]];
		for (const d of [flight.from, flight.from * 0.6, flight.from * 0.3]) {
			for (const turn of [0, 0.7, -0.7, 1.5, -1.5, Math.PI]) {
				const yaw = s.yaw + turn;
				const at: Vec3 = [eye[0] - Math.sin(yaw) * d, eye[1] + 0.3, eye[2] - Math.cos(yaw) * d];
				if (segmentBlocked(this.world, eye, at)) continue;
				const c = this.add(def, at, yawTo(at, eye));
				c.follow = follow;
				c.mode = 'patrol';
				return;
			}
		}
	}

	/** One flies in to a glow stick, from somewhere open above it. */
	private flyTo(def: CreatureDef, glow: { id: string; position: Vec3 }): void {
		const flight = def.flight;
		if (!flight) return;
		const at: Vec3 = [glow.position[0], glow.position[1] + 0.4, glow.position[2]];
		for (const turn of [0, 1.5, 3, 4.5]) {
			const from: Vec3 = [
				at[0] + Math.sin(turn) * flight.from * 0.4,
				at[1] + 1,
				at[2] + Math.cos(turn) * flight.from * 0.4
			];
			if (segmentBlocked(this.world, at, from)) continue;
			const c = this.add(def, from, yawTo(from, at));
			c.follow = glow.id;
			c.mode = 'patrol';
			return;
		}
	}

	/** It leaves: off away from the lamp, gone `leave` seconds later. */
	private flyOff(c: Creature): void {
		const flight = c.def.flight;
		if (!flight) return;
		c.mode = 'flee';
		c.linger = flight.leave;
		const b = c.body.position;
		const away = this.rng.next() * Math.PI * 2;
		c.goal = [b[0] - Math.sin(away) * 6, b[1] + 1, b[2] - Math.cos(away) * 6];
	}

	/**
	 * Flutter about a point out along its lamp's beam (or fly off), at up to `speed`, stopping short
	 * of anything solid.
	 */
	private fly(c: Creature, targets: Prey[]): void {
		const flight = c.def.flight;
		if (!flight) return;
		const b = c.body.position;
		let goal: Vec3;
		if (c.mode === 'flee') {
			c.linger -= TICK_DT;
			if (c.linger <= 0 || !c.goal) {
				c.gone = true;
				return;
			}
			goal = c.goal;
		} else {
			const owner = targets.find((t) => t.id === c.follow);
			const glow = this.glows.find((g) => g.id === c.follow);
			c.phase += TICK_DT * 2.2;
			const r = flight.radius;
			if (glow) {
				// Round a glow stick on the floor.
				goal = [
					glow.position[0] + Math.cos(c.phase) * r,
					glow.position[1] + 0.5 + Math.sin(c.phase * 1.7) * r * 0.6,
					glow.position[2] + Math.sin(c.phase * 1.3) * r
				];
			} else if (!owner) {
				this.flyOff(c);
				return;
			} else {
				const s = owner.state;
				const cp = Math.cos(s.pitch);
				const eye = s.position[1] + eyeHeight(s);
				goal = [
					s.position[0] - Math.sin(s.yaw) * cp * flight.ahead + Math.cos(c.phase) * r,
					eye + Math.sin(s.pitch) * flight.ahead + Math.sin(c.phase * 1.7) * r * 0.6,
					s.position[2] - Math.cos(s.yaw) * cp * flight.ahead + Math.sin(c.phase * 1.3) * r
				];
			}
		}
		const d: Vec3 = [goal[0] - b[0], goal[1] - b[1], goal[2] - b[2]];
		const dist = Math.hypot(d[0], d[1], d[2]);
		const step = Math.min(dist, flight.speed * TICK_DT);
		const jitter = () => (this.rng.next() - 0.5) * 0.04;
		const next: Vec3 =
			dist > 1e-4
				? [
						b[0] + (d[0] / dist) * step + jitter(),
						b[1] + (d[1] / dist) * step + jitter(),
						b[2] + (d[2] / dist) * step + jitter()
					]
				: [...b];
		if (!segmentBlocked(this.world, b, next)) {
			c.body.position = next;
			if (dist > 0.05) c.body.yaw = Math.atan2(-d[0], -d[2]);
		}
		this.setAnim(c, c.mode === 'flee' || dist > 1 ? 'running' : 'walking');
	}

	/**
	 * What it notices this tick. Chasing: whether it still perceives its target (and anyone it
	 * sees closer). Otherwise: someone in sight close enough sets it chasing; noise or a lamp in
	 * front of it alerts it to the spot.
	 */
	private perceive(c: Creature, targets: Prey[]): void {
		const p = c.def.perception;
		const bold = this.boldness;
		const alertRange = p.alertRange * bold;
		const chasing = c.mode === 'agro' || c.mode === 'attack';
		// Left alone, a passive kind notices no one.
		if (p.passive && !chasing) return;
		let seen: Prey | null = null;
		let seenD = Infinity;
		let heard: Prey | null = null;
		let heardD = Infinity;
		/** Its target: seen (or their lamp, or touched), or only heard. */
		let tracked = false;
		let followed = false;
		for (const prey of targets) {
			const s = prey.state;
			const d = distance3(s.position, c.body.position);
			if (d > Math.max(alertRange, p.touch) + 1) continue;
			const isTarget = chasing && c.target === prey.id;
			// The one it chases it keeps facing, so it needn't be in front.
			const sighted = d <= p.touch || this.sees(c, s, d, !isTarget);
			if (sighted && d < seenD) {
				seen = prey;
				seenD = d;
			}
			if (isTarget) {
				tracked = sighted || this.seesLamp(c, s, d, false);
				followed = !tracked && this.hearsSteps(c, s, d);
			} else if (!sighted && (this.hearsSteps(c, s, d) || this.seesLamp(c, s, d, true))) {
				if (d < heardD) {
					heard = prey;
					heardD = d;
				}
			}
		}
		if (chasing) {
			const target = targets.find((t) => t.id === c.target);
			if (tracked && target) {
				c.lastKnown = [...target.state.position];
				c.evade = 0;
			} else {
				// Hearing them only tells it which way to go: unseen, it still gives up in time.
				if (followed && target) c.lastKnown = [...target.state.position];
				c.evade += TICK_DT;
			}
			// Someone closer in plain sight takes over (not mid-swing, and not for a passive kind).
			if (seen && seen.id !== c.target && c.mode === 'agro' && !p.passive) {
				const current = target ? distance3(target.state.position, c.body.position) : Infinity;
				if (!tracked || seenD < current) this.chase(c, seen);
			}
			return;
		}
		if (seen) this.chase(c, seen);
		else if (heard) this.alertTo(c, heard.state.position);
	}

	/** In its line of sight (and in front of it, if `front`), close enough to chase. */
	private sees(c: Creature, s: PlayerState, d: number, front: boolean): boolean {
		const { agro } = c.def.perception;
		const lit = s.headlamp > 0 && s.battery > 0;
		const range = lit ? agro.litRange : agro.darkRange * s.mods.darkSpotted;
		if (d > range * this.boldness) return false;
		const chest: Vec3 = [
			s.position[0],
			s.position[1] + MOVEMENT.stances[s.stance].eye * 0.8,
			s.position[2]
		];
		if (front && !this.inFront(c, chest)) return false;
		return !segmentBlocked(this.world, this.eye(c), chest);
	}

	/** Their movement, within earshot on about the same floor. */
	private hearsSteps(c: Creature, s: PlayerState, d: number): boolean {
		if (Math.abs(s.position[1] - c.body.position[1]) > STEP_HEIGHT) return false;
		return d <= Math.min(noiseRadius(s, c.def), c.def.perception.alertRange) * this.boldness;
	}

	/** Their lit lamp, within alert range, in sight or lighting it (and in front, if `front`). */
	private seesLamp(c: Creature, s: PlayerState, d: number, front: boolean): boolean {
		if (s.headlamp <= 0 || s.battery <= 0) return false;
		if (d > c.def.perception.alertRange * this.boldness) return false;
		const lamp: Vec3 = [
			s.position[0],
			s.position[1] + MOVEMENT.stances[s.stance].eye,
			s.position[2]
		];
		if (front && !this.inFront(c, lamp)) return false;
		const mid: Vec3 = [
			c.body.position[0],
			c.body.position[1] + c.def.height * 0.6,
			c.body.position[2]
		];
		return (
			!segmentBlocked(this.world, this.eye(c), lamp) || lampIllumination(this.world, s, mid) > 0.01
		);
	}

	/** In the half of the world it faces. */
	private inFront(c: Creature, point: Vec3): boolean {
		const dx = point[0] - c.body.position[0];
		const dz = point[2] - c.body.position[2];
		return -Math.sin(c.body.yaw) * dx - Math.cos(c.body.yaw) * dz >= 0;
	}

	private eye(c: Creature): Vec3 {
		return [c.body.position[0], c.body.position[1] + c.def.height * EYE, c.body.position[2]];
	}

	/** Chase a player (or switch to them). */
	private chase(c: Creature, prey: Prey): void {
		if (c.mode !== 'agro' && c.mode !== 'attack') {
			c.mode = 'agro';
			c.bursting = false;
			c.rhythm = this.between(c.def.creepTime) / this.boldness;
			this.resetPath(c);
		} else if (c.target !== prey.id) {
			this.resetPath(c);
		}
		c.target = prey.id;
		c.lastKnown = [...prey.state.position];
		c.evade = 0;
	}

	/**
	 * Something caught its attention at `point`. On patrol it stops to wait; already waiting, it
	 * waits longer (up to alert.maxWait); on its way to look, it heads for the new spot.
	 */
	private alertTo(c: Creature, point: Vec3): void {
		const { alert } = c.def;
		c.alertPoint = [...point];
		if (c.mode === 'patrol') {
			c.mode = 'alert';
			c.alertTime = 0;
			c.alertLeft = this.between(alert.wait);
			c.goal = null;
			this.resetPath(c);
		} else if (c.mode === 'alert') {
			c.alertLeft = Math.min(Math.max(c.alertLeft, alert.wait[0]), alert.maxWait - c.alertTime);
		} else if (c.mode === 'investigate') {
			// Its path re-plans to the new spot on the next REPATH.
			if (c.arrived) this.resetPath(c);
			c.arrived = false;
			c.linger = alert.linger;
		}
	}

	/** Patrol around `anchor`: work out the spots it may walk to. */
	private startPatrol(c: Creature, anchor: Vec3): void {
		c.mode = 'patrol';
		c.target = null;
		c.lastKnown = null;
		c.alertPoint = null;
		c.bursting = false;
		c.goal = null;
		c.pause = 0;
		c.anchor = anchor;
		this.resetPath(c);
		const from = nearestPoint(this.nav, anchor, 2, c.allow);
		const distance = gridDistances(this.nav, [from], false, c.allow);
		c.spots = [];
		for (let i = 0; i < this.nav.points.length; i++) {
			const d = distance[i];
			const point = this.nav.points[i];
			if (d === undefined || d > c.def.patrol.radius) continue;
			if (point.water || point.clearance !== 'stand') continue;
			// One that wanders goes corner to corner.
			if (c.def.wanders && point.neighbours.length > 4) continue;
			// Kept to its levels.
			if (!this.onTier(c.def, point.position)) continue;
			c.spots.push(i);
		}
	}

	/** The nearest of these players within `range`, if any. */
	private nearest(c: Creature, targets: Prey[], range: number): Prey | null {
		let best: Prey | null = null;
		let bestD = range;
		for (const t of targets) {
			const d = distance3(t.state.position, c.body.position);
			if (d <= bestD) {
				bestD = d;
				best = t;
			}
		}
		return best;
	}

	/** Walk to a random spot near the anchor, pause, repeat. */
	private patrol(c: Creature): Vec3 | null {
		if (c.pause > 0) {
			c.pause -= TICK_DT;
			return null;
		}
		if (!c.goal) {
			const b = c.body.position;
			const far = c.spots.filter((i) => {
				const q = this.nav.points[i].position;
				return Math.hypot(q[0] - b[0], q[2] - b[2]) >= MIN_PATROL_STEP;
			});
			const options = far.length ? far : c.spots;
			if (!options.length) return null;
			c.goal = this.nav.points[this.rng.pick(options)].position;
			this.resetPath(c);
		}
		const move = this.steer(c, c.goal, null);
		if (!move) {
			// One that wanders carries on from here next time.
			if (c.def.wanders) this.startPatrol(c, [...c.body.position]);
			c.goal = null;
			c.pause = this.between(c.def.patrol.pause);
		}
		return move;
	}

	/** Creep to the alert point, look around a while, then patrol again. */
	private investigate(c: Creature): Vec3 | null {
		if (!c.arrived) {
			const move = c.alertPoint ? this.steer(c, c.alertPoint, null) : null;
			if (move) return move;
			c.arrived = true;
			c.lookYaw = c.body.yaw;
		}
		c.linger -= TICK_DT;
		// Look one way, then the other.
		const t = c.def.alert.linger - c.linger;
		this.turnTo(c, c.lookYaw + Math.sin(t * 1.2) * 1.1);
		if (c.linger <= 0) this.startPatrol(c, c.anchor);
		return null;
	}

	/** Turn toward a yaw at TURN_RATE. */
	private turnTo(c: Creature, yaw: number): void {
		const diff = Math.atan2(Math.sin(yaw - c.body.yaw), Math.cos(yaw - c.body.yaw));
		const step = TURN_RATE * TICK_DT;
		c.body.yaw += Math.max(-step, Math.min(step, diff));
	}

	private resetPath(c: Creature): void {
		c.path = [];
		c.pathIndex = 0;
		c.repath = 0;
	}

	private between([lo, hi]: [number, number]): number {
		return lo + this.rng.next() * (hi - lo);
	}

	/** Within striking distance of a player, with nothing in between. */
	private inReach(c: Creature, s: PlayerState, slack = 1): boolean {
		const b = c.body.position;
		const horizontal = Math.hypot(s.position[0] - b[0], s.position[2] - b[2]);
		if (horizontal > c.def.attack.range * slack || Math.abs(s.position[1] - b[1]) > 1.2)
			return false;
		return !segmentBlocked(
			this.world,
			[b[0], b[1] + Math.min(1.2, c.def.height * 0.7), b[2]],
			[s.position[0], s.position[1] + Math.min(0.8, c.def.height * 0.7), s.position[2]]
		);
	}

	/**
	 * Direction to move toward `goal` along the grid (re-planned every REPATH seconds), or null
	 * when there (or there's no way). `direct` (the target, if perceived) is chased straight when
	 * it's in plain view.
	 */
	private steer(c: Creature, goal: Vec3, direct: Vec3 | null): Vec3 | null {
		const b = c.body.position;
		// Straight at them only where it may stand.
		if (
			direct &&
			Math.hypot(direct[0] - b[0], direct[2] - b[2]) < 3 &&
			Math.abs(direct[1] - b[1]) < 0.6 &&
			this.mayStand(c, direct)
		) {
			const h = Math.min(1, c.def.height * 0.6);
			if (
				!segmentBlocked(this.world, [b[0], b[1] + h, b[2]], [direct[0], direct[1] + h, direct[2]])
			) {
				return [direct[0] - b[0], 0, direct[2] - b[2]];
			}
		}
		c.repath -= TICK_DT;
		if (c.repath <= 0 || c.pathIndex >= c.path.length) {
			c.repath = REPATH;
			// Somewhere it can't go (a crawl, water): as near as it can get.
			let to = nearestPoint(this.nav, goal, 2, c.allow);
			if (to < 0 && c.allow) to = nearestPoint(this.nav, goal, EDGE_RADIUS, c.allow);
			const from = nearestPoint(this.nav, b, 2, c.allow);
			const path = findPath(this.nav, from, to, undefined, c.allow);
			c.path = path ?? [];
			c.pathIndex = c.path.length > 1 ? 1 : 0;
			c.bestDistance = Infinity;
			c.stuck = 0;
		}
		while (c.pathIndex < c.path.length) {
			const w = c.path[c.pathIndex];
			// A swimmer floats well above the floor points it follows.
			const reach = c.body.swimming ? 2.5 : 1;
			if (
				Math.hypot(w[0] - b[0], w[2] - b[2]) > WAYPOINT_REACHED ||
				Math.abs(w[1] - b[1]) > reach
			) {
				break;
			}
			c.pathIndex++;
			c.bestDistance = Infinity;
			c.stuck = 0;
		}
		if (c.pathIndex >= c.path.length) return null;
		const w = c.path[c.pathIndex];
		const distance = Math.hypot(w[0] - b[0], w[2] - b[2]);
		if (distance < c.bestDistance - 0.05) {
			c.bestDistance = distance;
			c.stuck = 0;
		} else if ((c.stuck += TICK_DT) > STUCK_TIME) {
			// Not getting closer: skip ahead and re-plan.
			c.pathIndex++;
			c.repath = 0;
		}
		return [w[0] - b[0], 0, w[2] - b[2]];
	}

	private move(c: Creature, direction: Vec3 | null, sprint: boolean): void {
		const before: Vec3 = [...c.body.position];
		this.walk(c, direction, sprint);
		// A line it won't cross (blessed salt), or a censer's smoke it won't come into: it stays out.
		const after = c.body.position;
		const smoke = this.repels.some(
			(r) =>
				r.kinds.includes(c.def.id) &&
				Math.abs(after[1] - r.position[1]) < 2 &&
				Math.hypot(after[0] - r.position[0], after[2] - r.position[2]) < r.radius &&
				Math.hypot(after[0] - r.position[0], after[2] - r.position[2]) <
					Math.hypot(before[0] - r.position[0], before[2] - r.position[2])
		);
		if (smoke || this.wards.some((w) => crosses(before, after, w))) {
			c.body.position = before;
			c.body.velocity = [0, c.body.velocity[1], 0];
		}
	}

	private walk(c: Creature, direction: Vec3 | null, sprint: boolean): void {
		const frame = idleFrame(0, c.body);
		if (direction && Math.hypot(direction[0], direction[2]) > 1e-3) {
			frame.yaw = Math.atan2(-direction[0], -direction[2]);
			frame.moveZ = 1;
			// Climb only when held up (a real ledge); stairs and steps are walked.
			frame.climb = c.stuck > 0.4;
		}
		// Get down for crawls and squeezes along the way.
		const here = nearestPoint(this.nav, c.body.position, 1);
		const next = c.path[c.pathIndex];
		const nextIndex = next ? nearestPoint(this.nav, next, 0.5) : -1;
		let stance = here >= 0 ? this.nav.points[here].clearance : 'stand';
		if (nextIndex >= 0) stance = lowerStance(stance, this.nav.points[nextIndex].clearance);
		frame.stance = stance;
		frame.sprint = sprint && stance === 'stand';
		frame.pitch = 0;
		if (c.body.swimming && next) {
			// Swim where the path goes: dive under low ceilings, come up for the way out.
			const b = c.body.position;
			const horizontal = Math.max(0.3, Math.hypot(next[0] - b[0], next[2] - b[2]));
			const rise = next[1] + SWIM_AIM - b[1];
			frame.pitch = Math.max(-1.2, Math.min(1.2, Math.atan2(rise, horizontal)));
			frame.swimDown = rise < -0.15;
			// Only climb out where the path rises (not back onto the ledge it just left).
			frame.climb = rise > 0.3;
		}
		for (let i = 0; i < SUBSTEPS; i++) stepPlayer(c.body, frame, this.world, DT, c.def.movement);
	}

	private animate(c: Creature, bursting: boolean): void {
		let anim: CreatureAnim;
		const speed = Math.hypot(c.body.velocity[0], c.body.velocity[2]);
		// Brief pauses (re-planning, turning at a waypoint) keep the walk going.
		c.still = speed < 0.15 ? c.still + TICK_DT : 0;
		const { gait } = c.def;
		if (c.mode === 'dead') anim = 'die';
		else if (c.staggered > 0 || c.held > 0 || hasStatus(c.statuses, 'stunned'))
			anim = 'take_damage';
		else if (c.mode === 'attack') anim = 'melee_attack';
		else if (c.body.mantle) anim = 'climb';
		else if (c.mode === 'alert') anim = gait.alert;
		else if (c.still > STILL_TIME) anim = 'idle';
		// Down low for a crawl or a squeeze, whatever it's doing.
		else if (c.body.stance !== 'stand') anim = c.body.stance;
		else if (c.mode === 'patrol') anim = gait.patrol;
		else if (c.mode === 'investigate') anim = gait.stalk;
		else anim = bursting && speed > 2 ? gait.burst : gait.stalk;
		this.setAnim(c, anim);
	}

	/** Into an animation slot (from its start), or on through the one it's in. */
	private setAnim(c: Creature, anim: CreatureAnim): void {
		if (anim !== c.anim) {
			c.anim = anim;
			c.animTime = 0;
		} else {
			c.animTime += TICK_DT;
		}
	}

	/** On a level of the map this kind keeps to (always, if it isn't kept to any). */
	private onTier(def: CreatureDef, position: Vec3): boolean {
		const tiers = def.spawn.kind === 'scatter' ? def.spawn.tiers : undefined;
		if (!tiers || !this.tierOf) return true;
		const tier = this.tierOf(position);
		return tier !== null && tiers.includes(tier);
	}

	/** Whether the nav point under a position is one it may use. */
	private mayStand(c: Creature, position: Vec3): boolean {
		if (!c.allow) return true;
		const index = nearestPoint(this.nav, position, 1);
		return index >= 0 && c.allow(this.nav.points[index]);
	}

	/** Creature markers far enough (along the grid) from `distance`'s origin, facing a random way. */
	private markerSpots(
		distance: number[],
		minDistance: number,
		allow: NavFilter | undefined
	): SpawnSpot[] {
		return this.markers
			.filter((index) => (distance[index] ?? 0) >= minDistance)
			.filter((index) => !allow || allow(this.nav.points[index]))
			.map((index) => ({
				position: this.nav.points[index].position,
				yaw: this.rng.next() * Math.PI * 2
			}));
	}

	/** Dead-end corners far enough away (and where it may go), facing into the corner. */
	private cornerSpots(
		distance: number[],
		minDistance: number,
		allow: NavFilter | undefined
	): SpawnSpot[] {
		const spots: SpawnSpot[] = [];
		this.nav.points.forEach((point, index) => {
			if (
				point.clearance === 'stand' &&
				!point.water &&
				point.neighbours.length <= 4 &&
				(distance[index] ?? 0) >= minDistance &&
				(!allow || allow(point))
			) {
				spots.push({ position: point.position, yaw: this.wallYaw(index) });
			}
		});
		return spots;
	}

	/** Any dry point far enough away (and where it may go), facing a random way. */
	private openSpots(
		distance: number[],
		minDistance: number,
		allow: NavFilter | undefined
	): SpawnSpot[] {
		const spots: SpawnSpot[] = [];
		this.nav.points.forEach((point, index) => {
			if (point.water || (distance[index] ?? 0) < minDistance) return;
			if (allow && !allow(point)) return;
			spots.push({ position: point.position, yaw: this.rng.next() * Math.PI * 2 });
		});
		return spots;
	}

	/** Dry points it may use within `radius` (along the grid) of a position. */
	private nearby(position: Vec3, radius: number, allow: NavFilter | undefined): number[] {
		const from = nearestPoint(this.nav, position, 2, allow);
		const distance = gridDistances(this.nav, [from], false, allow);
		const out: number[] = [];
		distance.forEach((d, i) => {
			if (d !== undefined && d > 0 && d <= radius && !this.nav.points[i].water) out.push(i);
		});
		return out;
	}

	/** Facing into the corner: away from the open directions around a point. */
	private wallYaw(index: number): number {
		const p = this.nav.points[index];
		let ox = 0;
		let oz = 0;
		for (const n of p.neighbours) {
			const q = this.nav.points[n].position;
			ox += q[0] - p.position[0];
			oz += q[2] - p.position[2];
		}
		// Face away from open space (forward is -Z at yaw 0).
		return Math.atan2(ox, oz);
	}
}

/** Bait lying on the floor: creatures of a kind within `radius` go to it. */
export interface Lure {
	creature: string;
	position: Vec3;
	radius: number;
}

/** A censer's smoke: creatures of these kinds won't come within `radius` of `position`. */
export interface Repel {
	kinds: string[];
	position: Vec3;
	radius: number;
}

/** How a player is moving, for the noise it makes. */
export function movementNoise(s: PlayerState): Movement {
	const speed = Math.hypot(s.velocity[0], s.velocity[2]);
	if (s.mantle) return 'climb';
	// On a rope: the creak and scrape of climbing, nothing while only hanging there.
	if (s.climbing) return Math.abs(s.velocity[1]) > 0.05 ? 'climb' : 'still';
	if (s.swimming) return speed > 0.3 ? 'swim' : 'still';
	if (speed < 0.3) return 'still';
	if (s.sneaking) return 'creep';
	if (speed > MOVEMENT.stances.stand.speed + 0.4) return 'sprint';
	if (s.stance === 'crawl') return 'crawl';
	if (s.stance === 'crouch') return 'crouch';
	return 'walk';
}

/** How far a player's movement can be heard. */
function noiseRadius(s: PlayerState, def: CreatureDef): number {
	const hear = def.perception.hear;
	const movement = movementNoise(s);
	if (movement === 'still') return 0;
	// Kneepads quieten a crawl, felt overshoes every other step.
	const loudness =
		movement === 'climb' || movement === 'swim'
			? 1
			: stepLoudness(s.inventory, movement === 'crawl');
	return hear[movement === 'climb' ? 'walk' : movement] * loudness;
}

function distance3(a: Vec3, b: Vec3): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function yawTo(from: Vec3, to: Vec3): number {
	return Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));
}

function round(v: number): number {
	return Math.round(v * 1000) / 1000;
}

/**
 * Whether a move from `from` to `to` crosses a ward's line (on the floor, seen from above; a line
 * on another floor, more than a storey off, doesn't count).
 */
export function crosses(from: Vec3, to: Vec3, ward: Ward): boolean {
	if (Math.abs(from[1] - ward.a[1]) > 2) return false;
	const side = (p: Vec3) =>
		(ward.b[0] - ward.a[0]) * (p[2] - ward.a[2]) - (ward.b[2] - ward.a[2]) * (p[0] - ward.a[0]);
	const sf = side(from);
	const st = side(to);
	if (sf === 0 && st === 0) return false;
	if (sf * st > 0) return false;
	// The line from the ward's ends against the move: the ends on either side of it too.
	const across = (p: Vec3) =>
		(to[0] - from[0]) * (p[2] - from[2]) - (to[2] - from[2]) * (p[0] - from[0]);
	return across(ward.a) * across(ward.b) <= 0;
}
