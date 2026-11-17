import { AFFLICTIONS, type AfflictionDef } from '../src/lib/content/afflictions.ts';
import { STROBE } from '../src/lib/content/statuses.ts';
import { TICK_RATE } from '../src/lib/shared/constants.ts';
import type { AfflictionSnapshot } from '../src/lib/shared/affliction/types.ts';
import { illumination, lampIllumination } from '../src/lib/shared/creature/visibility.ts';
import { lootValue } from '../src/lib/shared/items/inventory.ts';
import type { CollisionWorld } from '../src/lib/shared/map/collision.ts';
import { findPath, gridDistances, nearestPoint, type NavGrid } from '../src/lib/shared/map/nav.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';
import { eyeHeight } from '../src/lib/shared/player/simulate.ts';
import type { PlayerState } from '../src/lib/shared/player/types.ts';
import { Rng } from '../src/lib/shared/rng.ts';
import {
	applyStatus,
	hasStatus,
	stepStatuses,
	type Statuses
} from '../src/lib/shared/status/status.ts';
import type { CreatureBody, CreatureDirector, Prey } from './creatures.ts';

/**
 * The Affliction for one expedition: the hidden meter and its omen stages (lamp failure, bolder
 * and more creatures; clients add the sounds), and the manifestation the rite summons. It hunts
 * along the nav grid, winds up and strikes whoever it reaches, can only be hurt while lamp light
 * exposes it, and a lamp flicked on in its face (a strobe) stuns it. Banishing it resolves the
 * Affliction and calms it for good (see `calm`). Lamps fail only by omen stage.
 * See docs/dev/affliction.md.
 */

const DT = 1 / TICK_RATE;
/** Id the manifestation uses as a combat target. */
export const MANIFESTATION_ID = 'manifestation';
const REPATH = 0.5;
/** Seconds of steady light needed to expose it. */
const EXPOSE_HOLD = 0.4;
/** Below this much lamp light on it, it moves at its unlit speed. */
const UNLIT = 0.02;
/** A swing that has begun still lands on someone this much (m) beyond its reach. */
const REACH_SLACK = 0.4;
/** Height difference (m) beyond which it can't reach someone (a floor above or below). */
const REACH_HEIGHT = 2;
/** Seconds a swing takes without a body to time it. */
const STRIKE_SECONDS = 1.2;

interface Manifested {
	position: Vec3;
	state: 'gathering' | 'hunting' | 'banished';
	time: number;
	health: number;
	/** Seconds it stays exposed. */
	exposed: number;
	/** Seconds of steady light on it (decays twice as fast without). */
	charge: number;
	slowed: number;
	path: Vec3[];
	pathIndex: number;
	repath: number;
	statuses: Statuses;
	/** Seconds into the swing it is making, or -1 when it isn't swinging. */
	swing: number;
	/** The swing it is making has landed (or missed). */
	landed: boolean;
	/** Seconds it stands after a swing. */
	recover: number;
	/** Swings begun so far (clients animate each new one). */
	strikes: number;
}

/** A blow the manifestation landed on a player this tick, before what they wear absorbs. */
export interface AfflictionHit {
	playerId: string;
	amount: number;
}

export class AfflictionDirector {
	readonly def: AfflictionDef;
	/** 0..1: drives the omen stages. Nothing manifests when it fills. */
	meter = 0;
	stage = 0;
	/** Explorers who went down: how hard its strikes land (`strikeDamage`). */
	party = 1;
	private manifestation: Manifested | null = null;
	private lastKills = 0;
	private rng: Rng;
	/** What the rite summoned has been banished: the Affliction is resolved. */
	defeated = false;
	/** Resolved: no meter, no omens for the rest of the run. */
	calmed = false;

	constructor(
		private world: CollisionWorld,
		private nav: NavGrid,
		private creatures: CreatureDirector,
		seed: number,
		id = 'gloaming'
	) {
		this.def = AFFLICTIONS[id] ?? AFFLICTIONS.gloaming;
		this.rng = new Rng(seed ^ 0xaff1c7);
	}

	get manifested(): boolean {
		return this.manifestation !== null;
	}

	/** Admin: set the meter (0..1). Stages catch up on the next step. */
	setMeter(value: number): void {
		this.meter = Math.max(0, Math.min(1, value));
	}

	/**
	 * The rite was performed: the manifestation appears in its room, on the floor point there
	 * (`inRoom`) farthest from where it was performed, and gathers before it hunts. With no such
	 * point it appears far from everyone instead. Does nothing if it is already out.
	 */
	summon(inRoom: (position: Vec3) => boolean, from: Vec3, players: Prey[]): void {
		if (this.manifestation || this.calmed) return;
		let at: Vec3 | null = null;
		let farthest = -1;
		for (const point of this.nav.points) {
			if (!inRoom(point.position)) continue;
			const p = point.position;
			const d = Math.hypot(p[0] - from[0], p[1] - from[1], p[2] - from[2]);
			if (d > farthest) {
				farthest = d;
				at = p;
			}
		}
		if (at) this.appear(at);
		else this.manifestFar(players);
	}

	/** Admin: bring it out far from everyone (no rite room to summon it into). */
	forceManifest(players: Prey[]): void {
		if (!this.manifestation && !this.calmed) this.manifestFar(players);
	}

	/**
	 * Resolved: the meter stops for good, omens and gloom lift, and creatures are only as bold as
	 * ever. The creatures themselves stay.
	 */
	calm(): void {
		if (this.calmed) return;
		this.calmed = true;
		this.stage = 0;
		this.creatures.boldness = 1;
	}

	/** Admin: banish it now (it counts, like a weapon would). */
	banish(): void {
		if (this.manifestation && this.manifestation.state !== 'banished')
			this.dissolve(this.manifestation);
	}

	/** Admin: stun it (by its own reaction, so immunity still applies). */
	stun(): boolean {
		const d = this.manifestation;
		if (!d || d.state === 'banished') return false;
		return applyStatus(d.statuses, STROBE.causes, this.def.manifestation.statuses);
	}

	/**
	 * A player turned their lamp on from off: if the manifestation is vulnerable to the strobe and
	 * this lamp lights its core, it gets what the strobe causes (stunned), unless it is immune.
	 */
	strobe(state: PlayerState): boolean {
		const d = this.manifestation;
		const m = this.def.manifestation;
		if (!d || d.state === 'banished' || !m.vulnerable.includes('strobe')) return false;
		if (lampIllumination(this.world, state, this.core(d)) < STROBE.light) return false;
		return applyStatus(d.statuses, STROBE.causes, m.statuses);
	}

	/**
	 * Advance one tick: the meter, stages, the manifestation. Sets every player's gloom (the
	 * omen stage's) and returns the blows the manifestation landed.
	 */
	step(players: Prey[]): AfflictionHit[] {
		const def = this.def;
		if (this.calmed) {
			if (this.manifestation) this.manifestation.time += DT;
			for (const p of players) p.state.gloom = 0;
			return [];
		}
		// The meter: time underground, kills, loot carried.
		const kills = this.creatures.kills - this.lastKills;
		this.lastKills = this.creatures.kills;
		const loot = players.reduce((sum, p) => sum + lootValue(p.state.inventory), 0);
		this.meter = Math.min(
			1,
			this.meter +
				DT / def.meter.seconds +
				kills * def.meter.perKill +
				loot * def.meter.perLoot * DT
		);
		this.updateStage(players);

		const base = def.stages[this.stage - 1]?.gloom ?? 0;
		const hits: AfflictionHit[] = [];
		const d = this.manifestation;
		const able = players.filter((p) => !p.state.downed && !p.state.dead && !p.state.extracted);
		if (d) this.stepManifestation(d, players, able, hits);
		for (const p of players) p.state.gloom = base;
		return hits;
	}

	/** Hit capsule while it's hunting or gathering. */
	hitBody(): CreatureBody | null {
		const d = this.manifestation;
		if (!d || d.state === 'banished') return null;
		const m = this.def.manifestation;
		return { id: MANIFESTATION_ID, position: d.position, height: m.hitHeight, radius: m.hitRadius };
	}

	/** A weapon hit it. Exposed, it takes damage (and may be banished); otherwise it only slows. */
	damage(amount: number): boolean {
		const d = this.manifestation;
		if (!d || d.state === 'banished') return false;
		if (d.exposed <= 0) {
			d.slowed = this.def.manifestation.slowSeconds;
			return false;
		}
		d.health -= amount;
		if (d.health > 0) return false;
		this.dissolve(d);
		return true;
	}

	/** Is it exposed (for hit feedback)? */
	get exposed(): boolean {
		return (this.manifestation?.exposed ?? 0) > 0;
	}

	/** Damage a landed strike does, for this party's size. */
	get strikeDamage(): number {
		const table = this.def.manifestation.strikeDamage;
		return table[Math.max(0, Math.min(table.length, this.party) - 1)] ?? 0;
	}

	/** Everything but the rite and the deadline, which the session adds (see server/rite.ts). */
	snapshot(): Omit<AfflictionSnapshot, 'rite' | 'deadline'> {
		const d = this.manifestation;
		return {
			id: this.def.id,
			omen: this.stage,
			meter: Math.round(this.meter * 1000) / 1000,
			calmed: this.calmed,
			manifestation: d
				? {
						position: d.position.map((v) => Math.round(v * 1000) / 1000) as Vec3,
						state: d.state,
						exposed: d.exposed > 0,
						charge: d.exposed > 0 ? 1 : Math.round(Math.min(1, d.charge / EXPOSE_HOLD) * 100) / 100,
						stunned: hasStatus(d.statuses, 'stunned'),
						strikes: d.strikes
					}
				: null
		};
	}

	// --- internals ---

	private updateStage(players: Prey[]): void {
		const stages = this.def.stages;
		let stage = 0;
		while (stage < stages.length && this.meter >= stages[stage].at) stage++;
		if (stage === this.stage) return;
		// Spawns happen once, when a stage is first reached.
		for (let s = this.stage; s < stage; s++) {
			const spec = stages[s];
			for (let i = 0; i < spec.spawn; i++) {
				this.creatures.spawnFar(
					players.map((p) => p.state.position),
					this.def.manifestation.spawnDistance
				);
			}
		}
		this.stage = stage;
		this.creatures.boldness = stages[stage - 1]?.boldness ?? 1;
	}

	private manifestFar(players: Prey[]): void {
		const m = this.def.manifestation;
		const starts = players.map((p) => nearestPoint(this.nav, p.state.position));
		const distance = gridDistances(this.nav, starts);
		let spots = this.nav.points.filter(
			(_, i) => (distance[i] ?? 0) >= m.spawnDistance && (distance[i] ?? 0) < m.spawnDistance + 30
		);
		if (!spots.length) {
			// Small or explored-out map: as far as it gets.
			const far = Math.max(...distance.filter((v) => v !== undefined));
			spots = this.nav.points.filter((_, i) => (distance[i] ?? 0) >= far * 0.8);
		}
		const at = spots.length ? this.rng.pick(spots).position : this.nav.points[0]?.position;
		if (at) this.appear(at);
	}

	private appear(at: Vec3): void {
		this.manifestation = {
			position: [...at],
			state: 'gathering',
			time: 0,
			health: this.def.manifestation.health,
			exposed: 0,
			charge: 0,
			slowed: 0,
			path: [],
			pathIndex: 0,
			repath: 0,
			statuses: {},
			swing: -1,
			landed: false,
			recover: 0,
			strikes: 0
		};
	}

	/** Banished: it fades away, and the Affliction is resolved. */
	private dissolve(d: Manifested): void {
		d.state = 'banished';
		d.time = 0;
		this.defeated = true;
		this.calm();
	}

	private stepManifestation(
		d: Manifested,
		players: Prey[],
		able: Prey[],
		hits: AfflictionHit[]
	): void {
		const m = this.def.manifestation;
		d.time += DT;
		if (d.state === 'banished') return;
		stepStatuses(d.statuses, m.statuses, DT);
		if (d.state === 'gathering') {
			if (d.time >= m.gatherSeconds) {
				d.state = 'hunting';
				d.time = 0;
			}
			return;
		}
		// Light on its core: exposed for a while after.
		const core = this.core(d);
		const light = illumination(
			this.world,
			players.map((p) => p.state),
			core
		);
		// Light has to be held on it: a moment of steady light, not a flicker, exposes it.
		d.charge = light >= m.exposeLight ? d.charge + DT : Math.max(0, d.charge - DT * 2);
		d.exposed = d.charge >= EXPOSE_HOLD ? m.exposeLinger : Math.max(0, d.exposed - DT);
		d.slowed = Math.max(0, d.slowed - DT);

		// Stunned, it stands where it is, and a swing not yet landed is lost.
		if (hasStatus(d.statuses, 'stunned')) {
			d.swing = -1;
			d.recover = 0;
			return;
		}

		// Swinging: it stands, and the blow lands partway through on whoever is still in reach.
		if (d.swing >= 0) {
			d.swing += DT;
			if (!d.landed && d.swing >= m.strikeAt) {
				d.landed = true;
				for (const p of able) {
					if (this.reaches(d, p, m.reach + REACH_SLACK)) {
						hits.push({ playerId: p.id, amount: this.strikeDamage });
					}
				}
			}
			if (d.swing >= (m.body?.strikeSeconds ?? STRIKE_SECONDS)) {
				d.swing = -1;
				d.recover = m.strikeRecover;
			}
			return;
		}
		if (d.recover > 0) {
			d.recover = Math.max(0, d.recover - DT);
			return;
		}

		// Hunt the nearest player who's still up; within reach, it begins a swing.
		const target = this.nearest(d, able);
		if (!target) return;
		if (this.reaches(d, target, m.reach)) {
			d.swing = 0;
			d.landed = false;
			d.strikes++;
			return;
		}
		const speed = (light < UNLIT ? m.unlitSpeed : m.speed) * (d.slowed > 0 ? 0.3 : 1);
		this.move(d, target.state.position, speed * DT);
	}

	/** Is a player within this distance of it along the floor (and on its level)? */
	private reaches(d: Manifested, p: Prey, distance: number): boolean {
		const s = p.state.position;
		return (
			Math.hypot(s[0] - d.position[0], s[2] - d.position[2]) <= distance &&
			Math.abs(s[1] - d.position[1]) < REACH_HEIGHT
		);
	}

	/** Eye-to-core distance. */
	private distance(d: Manifested, p: Prey): number {
		const core = this.core(d);
		const s = p.state;
		return Math.hypot(
			s.position[0] - core[0],
			s.position[1] + eyeHeight(s) - core[1],
			s.position[2] - core[2]
		);
	}

	private core(d: Manifested): Vec3 {
		return [d.position[0], d.position[1] + this.def.manifestation.hitHeight / 2, d.position[2]];
	}

	private nearest(d: Manifested, able: Prey[]): Prey | null {
		let best: Prey | null = null;
		let bestD = Infinity;
		for (const p of able) {
			const dist = this.distance(d, p);
			if (dist < bestD) {
				best = p;
				bestD = dist;
			}
		}
		return best;
	}

	/**
	 * Move toward a point along the nav grid. It is simulated as a point, not a body: no
	 * collision, through water, crawls and squeezes alike.
	 */
	private move(d: Manifested, goal: Vec3, step: number): void {
		d.repath -= DT;
		if (d.repath <= 0 || d.pathIndex >= d.path.length) {
			d.repath = REPATH;
			d.path =
				findPath(
					this.nav,
					nearestPoint(this.nav, d.position, 4),
					nearestPoint(this.nav, goal, 4)
				) ?? [];
			d.pathIndex = d.path.length > 1 ? 1 : 0;
		}
		let left = step;
		while (left > 0) {
			const w = d.pathIndex < d.path.length ? d.path[d.pathIndex] : goal;
			const to: Vec3 = [w[0] - d.position[0], w[1] - d.position[1], w[2] - d.position[2]];
			const len = Math.hypot(to[0], to[1], to[2]);
			if (len <= left) {
				d.position = [...w];
				left -= len;
				if (d.pathIndex < d.path.length) d.pathIndex++;
				else break;
			} else {
				for (let i = 0; i < 3; i++) d.position[i] += (to[i] / len) * left;
				left = 0;
			}
		}
	}
}
