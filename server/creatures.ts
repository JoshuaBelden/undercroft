import { CREATURES, type CreatureAnim, type CreatureDef } from '../src/lib/content/creatures.ts';
import { MOVEMENT } from '../src/lib/content/player/movement.ts';
import { SIM_RATE, TICK_RATE } from '../src/lib/shared/constants.ts';
import type { CreatureSnapshot, CreatureState } from '../src/lib/shared/creature/types.ts';
import { lampIllumination } from '../src/lib/shared/creature/visibility.ts';
import { segmentBlocked, type CollisionWorld } from '../src/lib/shared/map/collision.ts';
import {
	findPath,
	gridDistances,
	lowerStance,
	nearestPoint,
	type NavGrid
} from '../src/lib/shared/map/nav.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';
import { createPlayerState, idleFrame, stepPlayer } from '../src/lib/shared/player/simulate.ts';
import type { PlayerState } from '../src/lib/shared/player/types.ts';
import { Rng } from '../src/lib/shared/rng.ts';

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
	health: number;
	/** Seconds left reeling from a hard hit (no moving or attacking). */
	staggered: number;
	/** Seconds since it died. */
	deadTime: number;
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
const EYE = 1.5;
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
/** Spawned creatures keep at least this far apart. */
const SPREAD = 20;

export class CreatureDirector {
	private creatures: Creature[] = [];
	private rng: Rng;
	private nextId = 1;
	/** Nav points of the map's creature-* markers. */
	private markers: number[];

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
	 * Place this expedition's creatures far (along the grid) from the start: at creature-*
	 * markers, then in corners if there aren't enough markers.
	 */
	populate(start: Vec3, kind = 'witch'): void {
		const def = CREATURES[kind];
		if (!def) return;
		const from = nearestPoint(this.nav, start);
		if (from < 0) return;
		const distance = gridDistances(this.nav, [from]);
		const count = this.rng.int(def.spawn.count[0], def.spawn.count[1]);
		const placed: Vec3[] = [];
		for (const spots of [
			this.markerSpots(distance, def.spawn.minDistance),
			this.cornerSpots(distance, def.spawn.minDistance)
		]) {
			for (let tries = 0; tries < 200 && placed.length < count && spots.length; tries++) {
				const spot = this.rng.pick(spots);
				// Spread them out.
				if (
					placed.some((p) => Math.hypot(p[0] - spot.position[0], p[2] - spot.position[2]) < SPREAD)
				) {
					continue;
				}
				placed.push(spot.position);
				this.add(def, spot.position, spot.yaw);
			}
		}
	}

	/** Admin: a creature a few metres in front of a player, facing them. */
	spawnNear(state: PlayerState, kind = 'witch'): void {
		const def = CREATURES[kind];
		if (!def) return;
		const ahead: Vec3 = [
			state.position[0] - Math.sin(state.yaw) * 4,
			state.position[1],
			state.position[2] - Math.cos(state.yaw) * 4
		];
		const index = nearestPoint(this.nav, ahead, 4);
		if (index < 0) return;
		const position = this.nav.points[index].position;
		this.add(def, position, yawTo(position, state.position));
	}

	/** Where each living creature is (for sanity: seeing them). */
	bodies(): { kind: string; position: Vec3 }[] {
		return this.living().map((c) => ({ kind: c.def.id, position: c.body.position }));
	}

	/** Living creatures' hit capsules. */
	hitBodies(): CreatureBody[] {
		return this.living().map((c) => ({
			id: c.id,
			position: c.body.position,
			height: c.def.height,
			radius: c.def.hitRadius
		}));
	}

	/** Creatures killed this expedition (feeds the Affliction meter). */
	kills = 0;

	/**
	 * How bold creatures are (the Affliction's omen stage): they perceive and hear this much
	 * further, and creep for this much less time between bursts.
	 */
	boldness = 1;

	/**
	 * Add a creature far (along the grid) from every player, e.g. when an omen stage begins: at a
	 * creature-* marker if one is far enough, otherwise in a corner.
	 */
	spawnFar(players: Vec3[], minDistance: number, kind = 'witch'): boolean {
		const def = CREATURES[kind];
		if (!def) return false;
		const starts = players.map((p) => nearestPoint(this.nav, p)).filter((i) => i >= 0);
		const distance = gridDistances(this.nav, starts);
		let spots = this.markerSpots(distance, minDistance);
		if (!spots.length) spots = this.cornerSpots(distance, minDistance);
		if (!spots.length) return false;
		const spot = this.rng.pick(spots);
		this.add(def, spot.position, spot.yaw);
		return true;
	}

	clear(): void {
		this.creatures = [];
	}

	/** Admin: kill every creature. */
	killAll(): void {
		for (const c of this.living()) this.kill(c);
	}

	/**
	 * A player hurt a creature. A hard hit staggers it (cancelling an attack that hasn't landed);
	 * any hit sets it on the attacker. Returns true if this killed it.
	 */
	damage(id: string, amount: number, from: Prey | null): boolean {
		const c = this.creatures.find((x) => x.id === id);
		if (!c || c.mode === 'dead') return false;
		c.health -= amount;
		if (c.health <= 0) {
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
		if (from && c.mode !== 'attack') this.chase(c, from);
		return false;
	}

	/**
	 * A noise at `position` heard within `radius` (on about the same floor). With a source player
	 * (gunfire, a swing) within its chase range, it chases them; otherwise (a brick landing,
	 * distant gunfire) it's alerted to the spot, unless it's already chasing someone.
	 */
	hear(position: Vec3, radius: number, source: Prey | null): void {
		for (const c of this.living()) {
			const b = c.body.position;
			if (Math.abs(position[1] - b[1]) > HEAR_HEIGHT) continue;
			if (distance3(position, b) > radius) continue;
			if (c.mode === 'attack') continue;
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
		this.kills++;
	}

	/** Advance every creature by one server tick. Returns the hits that landed. */
	step(prey: Prey[]): CreatureHit[] {
		const hits: CreatureHit[] = [];
		const targets = prey.filter((p) => !p.state.downed && !p.state.dead && !p.state.extracted);
		for (const c of this.creatures) {
			if (c.mode === 'dead') {
				c.deadTime += TICK_DT;
				this.move(c, null, false);
				this.animate(c, false);
				continue;
			}
			c.cooldown = Math.max(0, c.cooldown - TICK_DT);
			this.perceive(c, targets);
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
					move = this.patrol(c);
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
							hits.push({ playerId: target.id, damage: c.def.attack.damage });
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
			(c) => c.mode !== 'dead' || c.deadTime < c.def.corpseTime
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

	private add(def: CreatureDef, position: Vec3, yaw: number): void {
		const body = createPlayerState(position, yaw);
		body.headlamp = 0;
		body.flags.infiniteStamina = true;
		const c: Creature = {
			id: `c${this.nextId++}`,
			def,
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
			health: def.health,
			staggered: 0,
			deadTime: 0
		};
		this.startPatrol(c, c.anchor);
		// Stand a moment before setting off.
		c.pause = this.between(def.patrol.pause);
		this.creatures.push(c);
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
			// Someone closer in plain sight takes over (not mid-swing).
			if (seen && seen.id !== c.target && c.mode === 'agro') {
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
		if (d > (lit ? agro.litRange : agro.darkRange) * this.boldness) return false;
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
		return [c.body.position[0], c.body.position[1] + EYE, c.body.position[2]];
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
		const from = nearestPoint(this.nav, anchor);
		const distance = gridDistances(this.nav, [from]);
		c.spots = [];
		for (let i = 0; i < this.nav.points.length; i++) {
			const d = distance[i];
			const point = this.nav.points[i];
			if (d === undefined || d > c.def.patrol.radius) continue;
			if (point.water || point.clearance !== 'stand') continue;
			c.spots.push(i);
		}
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
			[b[0], b[1] + 1.2, b[2]],
			[s.position[0], s.position[1] + 0.8, s.position[2]]
		);
	}

	/**
	 * Direction to move toward `goal` along the grid (re-planned every REPATH seconds), or null
	 * when there (or there's no way). `direct` (the target, if perceived) is chased straight when
	 * it's in plain view.
	 */
	private steer(c: Creature, goal: Vec3, direct: Vec3 | null): Vec3 | null {
		const b = c.body.position;
		if (
			direct &&
			Math.hypot(direct[0] - b[0], direct[2] - b[2]) < 3 &&
			Math.abs(direct[1] - b[1]) < 0.6
		) {
			if (
				!segmentBlocked(this.world, [b[0], b[1] + 1, b[2]], [direct[0], direct[1] + 1, direct[2]])
			) {
				return [direct[0] - b[0], 0, direct[2] - b[2]];
			}
		}
		c.repath -= TICK_DT;
		if (c.repath <= 0 || c.pathIndex >= c.path.length) {
			c.repath = REPATH;
			const path = findPath(this.nav, nearestPoint(this.nav, b), nearestPoint(this.nav, goal));
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
		else if (c.staggered > 0) anim = 'take_damage';
		else if (c.mode === 'attack') anim = 'melee_attack';
		else if (c.body.mantle) anim = 'climb';
		else if (c.mode === 'alert') anim = gait.alert;
		else if (c.still > STILL_TIME) anim = 'idle';
		// Down low for a crawl or a squeeze, whatever it's doing.
		else if (c.body.stance !== 'stand') anim = c.body.stance;
		else if (c.mode === 'patrol') anim = gait.patrol;
		else if (c.mode === 'investigate') anim = gait.stalk;
		else anim = bursting && speed > 2 ? gait.burst : gait.stalk;
		if (anim !== c.anim) {
			c.anim = anim;
			c.animTime = 0;
		} else {
			c.animTime += TICK_DT;
		}
	}

	/** Creature markers far enough (along the grid) from `distance`'s origin, facing a random way. */
	private markerSpots(distance: number[], minDistance: number): SpawnSpot[] {
		return this.markers
			.filter((index) => (distance[index] ?? 0) >= minDistance)
			.map((index) => ({
				position: this.nav.points[index].position,
				yaw: this.rng.next() * Math.PI * 2
			}));
	}

	/** Dead-end corners far enough away, facing into the corner. */
	private cornerSpots(distance: number[], minDistance: number): SpawnSpot[] {
		const spots: SpawnSpot[] = [];
		this.nav.points.forEach((point, index) => {
			if (
				point.clearance === 'stand' &&
				!point.water &&
				point.neighbours.length <= 4 &&
				(distance[index] ?? 0) >= minDistance
			) {
				spots.push({ position: point.position, yaw: this.wallYaw(index) });
			}
		});
		return spots;
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

/** How far a player's movement can be heard. */
function noiseRadius(s: PlayerState, def: CreatureDef): number {
	const hear = def.perception.hear;
	const speed = Math.hypot(s.velocity[0], s.velocity[2]);
	if (s.mantle) return hear.walk;
	if (s.swimming) return speed > 0.3 ? hear.swim : 0;
	if (speed < 0.3) return 0;
	if (s.sneaking) return hear.creep;
	if (speed > MOVEMENT.stances.stand.speed + 0.4) return hear.sprint;
	if (s.stance === 'crawl') return hear.crawl;
	if (s.stance === 'crouch') return hear.crouch;
	return hear.walk;
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
