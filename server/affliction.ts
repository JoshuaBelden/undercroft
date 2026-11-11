import { AFFLICTIONS, type AfflictionDef } from '../src/lib/content/afflictions.ts';
import { TICK_RATE } from '../src/lib/shared/constants.ts';
import type { AfflictionSnapshot } from '../src/lib/shared/affliction/types.ts';
import { illumination } from '../src/lib/shared/creature/visibility.ts';
import { lootValue } from '../src/lib/shared/items/inventory.ts';
import type { CollisionWorld } from '../src/lib/shared/map/collision.ts';
import { findPath, gridDistances, nearestPoint, type NavGrid } from '../src/lib/shared/map/nav.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';
import { eyeHeight } from '../src/lib/shared/player/simulate.ts';
import { Rng } from '../src/lib/shared/rng.ts';
import type { CreatureBody, CreatureDirector, Prey } from './creatures.ts';

/**
 * The Affliction for one expedition: the hidden meter, omen stages (lamp failure, bolder and
 * more creatures; clients add the sounds), and the manifestation at 100%. For the Gloaming the
 * manifestation is living darkness: it hunts along the nav grid, snuffs lamps near it, drains
 * sanity, and can only be hurt while bright light exposes it. Banishing it ends the expedition.
 * See docs/dev/affliction.md.
 */

const DT = 1 / TICK_RATE;
/** Id the darkness uses as a combat target. */
export const MANIFESTATION_ID = 'manifestation';
/** Gloom on every lamp while the darkness gathers. */
const GATHER_GLOOM = 0.8;
/** How fast lamps fail toward the darkness: 2 = dead at half the gutter radius. */
const GUTTER_STEEPNESS = 2;
const REPATH = 0.5;
/** Seconds of steady light needed to expose it. */
const EXPOSE_HOLD = 0.4;
/** Below this much lamp light on it, it moves at its dark speed. */
const DARK = 0.02;

interface Darkness {
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
	/** Per player: seconds until its touch can hit them again. */
	touch: Map<string, number>;
}

/** What the darkness did to a player this tick. */
export interface AfflictionHit {
	playerId: string;
	amount: number;
	/** A touch (a hard hit) rather than the steady drain. */
	touch: boolean;
}

export class AfflictionDirector {
	readonly def: AfflictionDef;
	/** 0..1. Hidden from players. */
	meter = 0;
	stage = 0;
	private darkness: Darkness | null = null;
	private lastKills = 0;
	private rng: Rng;
	/** Set once it's banished: the session ends the expedition. */
	banished = false;

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
		return this.darkness !== null;
	}

	/** Admin: set the meter (0..1). Stages catch up on the next step. */
	setMeter(value: number): void {
		this.meter = Math.max(0, Math.min(1, value));
	}

	/** Admin: banish it now. */
	banish(): void {
		if (this.darkness && this.darkness.state !== 'banished') this.dissolve(this.darkness);
	}

	/**
	 * Advance one tick: the meter, stages, the darkness. Sets every player's gloom and returns
	 * the sanity the darkness takes.
	 */
	step(players: Prey[]): AfflictionHit[] {
		const def = this.def;
		// The meter: time underground, kills, loot carried.
		const kills = this.creatures.kills - this.lastKills;
		this.lastKills = this.creatures.kills;
		if (!this.darkness) {
			const loot = players.reduce((sum, p) => sum + lootValue(p.state.inventory), 0);
			this.meter = Math.min(
				1,
				this.meter +
					DT / def.meter.seconds +
					kills * def.meter.perKill +
					loot * def.meter.perLoot * DT
			);
		}
		this.updateStage(players);
		if (this.meter >= 1 && !this.darkness) this.manifest(players);

		const base = def.stages[this.stage - 1]?.gloom ?? 0;
		const hits: AfflictionHit[] = [];
		const d = this.darkness;
		const able = players.filter((p) => !p.state.downed && !p.state.dead && !p.state.extracted);
		if (d) this.stepDarkness(d, players, able, hits);
		for (const p of players) p.state.gloom = Math.max(base, d ? this.gloomFrom(d, p) : 0);
		return hits;
	}

	/** Hit capsule while it's hunting or gathering. */
	hitBody(): CreatureBody | null {
		const d = this.darkness;
		if (!d || d.state === 'banished') return null;
		const m = this.def.manifestation;
		return { id: MANIFESTATION_ID, position: d.position, height: m.hitHeight, radius: m.hitRadius };
	}

	/** A weapon hit it. Exposed, it takes damage (and may be banished); otherwise it only slows. */
	damage(amount: number): boolean {
		const d = this.darkness;
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
		return (this.darkness?.exposed ?? 0) > 0;
	}

	/** Everything but the rite, which the session adds (see server/rite.ts). */
	snapshot(dev: boolean): Omit<AfflictionSnapshot, 'rite'> {
		const d = this.darkness;
		const snap: Omit<AfflictionSnapshot, 'rite'> = {
			id: this.def.id,
			omen: this.stage,
			manifestation: d
				? {
						position: d.position.map((v) => Math.round(v * 1000) / 1000) as Vec3,
						state: d.state,
						exposed: d.exposed > 0,
						radius: this.def.manifestation.radius
					}
				: null
		};
		if (dev) snap.meter = Math.round(this.meter * 1000) / 1000;
		return snap;
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

	private manifest(players: Prey[]): void {
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
		if (!at) return;
		this.darkness = {
			position: [...at],
			state: 'gathering',
			time: 0,
			health: m.health,
			exposed: 0,
			charge: 0,
			slowed: 0,
			path: [],
			pathIndex: 0,
			repath: 0,
			touch: new Map()
		};
	}

	private dissolve(d: Darkness): void {
		d.state = 'banished';
		d.time = 0;
		this.banished = true;
	}

	private stepDarkness(d: Darkness, players: Prey[], able: Prey[], hits: AfflictionHit[]): void {
		const m = this.def.manifestation;
		d.time += DT;
		if (d.state === 'banished') return;
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

		// Hunt the nearest player who's still up.
		const target = this.nearest(d, able);
		if (target) {
			const speed = (light < DARK ? m.darkSpeed : m.speed) * (d.slowed > 0 ? 0.3 : 1);
			this.move(d, target.state.position, speed * DT);
		}

		// Its darkness drains, its core strikes.
		for (const p of able) {
			const dist = this.distance(d, p);
			if (dist <= m.radius) hits.push({ playerId: p.id, amount: m.drain * DT, touch: false });
			const cooldown = Math.max(0, (d.touch.get(p.id) ?? 0) - DT);
			const horizontal = Math.hypot(
				p.state.position[0] - d.position[0],
				p.state.position[2] - d.position[2]
			);
			if (
				horizontal <= m.core &&
				Math.abs(p.state.position[1] - d.position[1]) < 2 &&
				cooldown <= 0
			) {
				hits.push({ playerId: p.id, amount: m.touchDamage, touch: true });
				d.touch.set(p.id, m.touchInterval);
			} else {
				d.touch.set(p.id, cooldown);
			}
		}
	}

	/** Gloom this player's lamp suffers from the darkness. */
	private gloomFrom(d: Darkness, p: Prey): number {
		if (d.state === 'banished') return 0;
		if (d.state === 'gathering') return GATHER_GLOOM;
		const dist = this.distance(d, p);
		// Steep: lamps die outright within half the gutter radius and struggle beyond it.
		return Math.max(
			0,
			Math.min(1, (1 - dist / this.def.manifestation.gutterRadius) * GUTTER_STEEPNESS)
		);
	}

	/** Eye-to-core distance. */
	private distance(d: Darkness, p: Prey): number {
		const core = this.core(d);
		const s = p.state;
		return Math.hypot(
			s.position[0] - core[0],
			s.position[1] + eyeHeight(s) - core[1],
			s.position[2] - core[2]
		);
	}

	private core(d: Darkness): Vec3 {
		return [d.position[0], d.position[1] + this.def.manifestation.hitHeight / 2, d.position[2]];
	}

	private nearest(d: Darkness, able: Prey[]): Prey | null {
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
	 * Drift toward a point along the nav grid. It's darkness, not a body: no collision, through
	 * water, crawls and squeezes alike.
	 */
	private move(d: Darkness, goal: Vec3, step: number): void {
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
