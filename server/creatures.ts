import { CREATURES, type CreatureAnim, type CreatureDef } from '../src/lib/content/creatures.ts';
import { MOVEMENT } from '../src/lib/content/player/movement.ts';
import { SIM_RATE, TICK_RATE } from '../src/lib/shared/constants.ts';
import type { CreatureSnapshot } from '../src/lib/shared/creature/types.ts';
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
 * Server-side creature AI. Each creature stands still in a corner until it perceives someone
 * (their lamp on it or in its sight, their noise, or touch), then hunts them along the nav grid
 * in a creep-then-burst rhythm, attacks in melee, searches where it lost them, and goes still
 * again. Movement reuses the player simulation, so creatures collide, climb stairs and swim like
 * players do. See docs/dev/creatures.md.
 */

type Mode = 'idle' | 'hunt' | 'attack' | 'search' | 'dead';

interface Creature {
	id: string;
	def: CreatureDef;
	body: PlayerState;
	mode: Mode;
	anim: CreatureAnim;
	animTime: number;
	target: string | null;
	lastKnown: Vec3 | null;
	/** Seconds since the target was last perceived. */
	unseen: number;
	path: Vec3[];
	pathIndex: number;
	repath: number;
	bursting: boolean;
	/** Seconds left in the current creep or burst. */
	rhythm: number;
	attackTime: number;
	attackHit: boolean;
	cooldown: number;
	searchLeft: number;
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

export class CreatureDirector {
	private creatures: Creature[] = [];
	private rng: Rng;
	private nextId = 1;

	constructor(
		private world: CollisionWorld,
		private nav: NavGrid,
		seed: number
	) {
		this.rng = new Rng(seed ^ 0x5eed);
	}

	get count(): number {
		return this.creatures.length;
	}

	/** Place this expedition's creatures in corners far (along the grid) from the start. */
	populate(start: Vec3, kind = 'witch'): void {
		const def = CREATURES[kind];
		if (!def) return;
		const from = nearestPoint(this.nav, start);
		if (from < 0) return;
		const distance = this.gridDistances(from);
		const corners = this.nav.points
			.map((point, index) => ({ point, index }))
			.filter(
				({ point, index }) =>
					point.clearance === 'stand' &&
					!point.water &&
					point.neighbours.length <= 4 &&
					(distance[index] ?? 0) >= def.spawn.minDistance
			);
		const count = this.rng.int(def.spawn.count[0], def.spawn.count[1]);
		const placed: Vec3[] = [];
		for (let tries = 0; tries < 200 && placed.length < count && corners.length; tries++) {
			const { point, index } = this.rng.pick(corners);
			// Spread them out.
			if (placed.some((p) => Math.hypot(p[0] - point.position[0], p[2] - point.position[2]) < 20)) {
				continue;
			}
			placed.push(point.position);
			this.add(def, point.position, this.wallYaw(index));
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

	/** Add a creature far (along the grid) from every player, e.g. when an omen stage begins. */
	spawnFar(players: Vec3[], minDistance: number, kind = 'witch'): boolean {
		const def = CREATURES[kind];
		if (!def) return false;
		const starts = players.map((p) => nearestPoint(this.nav, p)).filter((i) => i >= 0);
		const distance = this.gridDistances(...starts);
		const spots = this.nav.points
			.map((point, index) => ({ point, index }))
			.filter(
				({ point, index }) =>
					point.clearance === 'stand' &&
					!point.water &&
					point.neighbours.length <= 4 &&
					(distance[index] ?? 0) >= minDistance
			);
		if (!spots.length) return false;
		const { point, index } = this.rng.pick(spots);
		this.add(def, point.position, this.wallYaw(index));
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
				c.mode = 'hunt';
				c.cooldown = c.def.attack.cooldown * 0.5;
			}
		}
		if (from && c.mode !== 'attack') {
			c.mode = 'hunt';
			c.target = from.id;
			c.lastKnown = [...from.state.position];
			c.unseen = 0;
			c.path = [];
			c.repath = 0;
		}
		return false;
	}

	/**
	 * A noise at `position` heard within `radius` (on about the same floor). With a source player
	 * (gunfire, a swing), creatures that hear it hunt them; without one (a brick landing), idle or
	 * searching creatures go and search the spot.
	 */
	hear(position: Vec3, radius: number, source: Prey | null): void {
		for (const c of this.living()) {
			const b = c.body.position;
			if (Math.abs(position[1] - b[1]) > HEAR_HEIGHT) continue;
			if (Math.hypot(position[0] - b[0], position[1] - b[1], position[2] - b[2]) > radius) continue;
			if (c.mode === 'attack') continue;
			if (source) {
				if (c.mode !== 'hunt' || c.target !== source.id) {
					c.path = [];
					c.repath = 0;
				}
				c.mode = 'hunt';
				c.target = source.id;
				c.lastKnown = [...source.state.position];
				c.unseen = 0;
			} else if (c.mode !== 'hunt') {
				c.mode = 'search';
				c.target = null;
				c.lastKnown = [...position];
				c.searchLeft = c.def.searchTime;
				c.path = [];
				c.repath = 0;
			}
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
				case 'idle':
					break;
				case 'hunt': {
					if (!target || c.unseen > c.def.perception.forget) {
						this.startSearch(c);
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
					move = reach ? null : this.steer(c, goal, target.state.position);
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
						c.mode = 'hunt';
						c.path = [];
						c.repath = 0;
					}
					break;
				}
				case 'search': {
					c.searchLeft -= TICK_DT;
					if (c.searchLeft <= 0) {
						c.mode = 'idle';
						c.path = [];
						break;
					}
					if (!c.lastKnown) {
						// Wander: pick somewhere nearby on the grid.
						const here = nearestPoint(this.nav, c.body.position);
						const options = this.nav.points.filter(
							(p) =>
								!p.water &&
								Math.hypot(p.position[0] - c.body.position[0], p.position[2] - c.body.position[2]) <
									8 &&
								Math.abs(p.position[1] - c.body.position[1]) < 1.5
						);
						c.lastKnown = options.length && here >= 0 ? this.rng.pick(options).position : null;
						c.path = [];
					}
					if (c.lastKnown) move = this.steer(c, c.lastKnown, null);
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
		this.creatures.push({
			id: `c${this.nextId++}`,
			def,
			body,
			mode: 'idle',
			anim: 'idle',
			animTime: 0,
			target: null,
			lastKnown: null,
			unseen: 0,
			path: [],
			pathIndex: 0,
			repath: 0,
			bursting: false,
			rhythm: def.creepTime[0],
			attackTime: 0,
			attackHit: false,
			cooldown: 0,
			searchLeft: 0,
			bestDistance: Infinity,
			stuck: 0,
			still: 0,
			health: def.health,
			staggered: 0,
			deadTime: 0
		});
	}

	/** Notice someone: lamp light on it or a lamp in sight, noise, or touch. Keeps the closest. */
	private perceive(c: Creature, targets: Prey[]): void {
		const eye: Vec3 = [c.body.position[0], c.body.position[1] + EYE, c.body.position[2]];
		const mid: Vec3 = [
			c.body.position[0],
			c.body.position[1] + c.def.height * 0.6,
			c.body.position[2]
		];
		const p = c.def.perception;
		let best: Prey | null = null;
		let bestD = Infinity;
		for (const prey of targets) {
			const s = prey.state;
			const d = Math.hypot(
				s.position[0] - c.body.position[0],
				s.position[1] - c.body.position[1],
				s.position[2] - c.body.position[2]
			);
			const bold = this.boldness;
			if (d > Math.max(p.lampSight * bold, p.hear.sprint * bold, p.touch) + 1) continue;
			const sensed =
				d <= p.touch ||
				(Math.abs(s.position[1] - c.body.position[1]) < 3 && d <= noiseRadius(s, c.def) * bold) ||
				(s.headlamp > 0 &&
					s.battery > 0 &&
					d <= p.lampSight * bold &&
					(lampIllumination(this.world, s, mid) > 0.01 ||
						!segmentBlocked(this.world, eye, [
							s.position[0],
							s.position[1] + MOVEMENT.stances[s.stance].eye,
							s.position[2]
						])));
			if (sensed && d < bestD) {
				best = prey;
				bestD = d;
			}
		}
		if (best) {
			if (c.mode === 'idle' || c.mode === 'search' || c.target !== best.id) {
				if (c.mode !== 'attack') c.mode = 'hunt';
				c.path = [];
				c.repath = 0;
			}
			c.target = best.id;
			c.lastKnown = [...best.state.position];
			c.unseen = 0;
		} else {
			c.unseen += TICK_DT;
		}
	}

	private startSearch(c: Creature): void {
		c.mode = 'search';
		c.target = null;
		c.searchLeft = c.def.searchTime;
		c.bursting = false;
		c.path = [];
		c.repath = 0;
		// Head to where it last perceived someone first; wander after.
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
	 * when there. `direct` (the target, if perceived) is chased straight when it's in plain view.
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
		if (c.pathIndex >= c.path.length) {
			// Arrived. Searching creatures pick a new spot; hunters wait for news.
			if (c.mode === 'search') c.lastKnown = null;
			return null;
		}
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
		else if (c.mode === 'idle' || c.still > STILL_TIME) anim = 'idle';
		// Down low for a crawl or a squeeze, whatever it's doing.
		else if (c.body.stance !== 'stand') anim = c.body.stance;
		else if (c.mode === 'search') anim = gait.search;
		else anim = bursting && speed > 2 ? gait.burst : gait.stalk;
		if (anim !== c.anim) {
			c.anim = anim;
			c.animTime = 0;
		} else {
			c.animTime += TICK_DT;
		}
	}

	private gridDistances(...from: number[]): number[] {
		return gridDistances(this.nav, from);
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

function yawTo(from: Vec3, to: Vec3): number {
	return Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));
}

function round(v: number): number {
	return Math.round(v * 1000) / 1000;
}
