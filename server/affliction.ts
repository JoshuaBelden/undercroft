import {
	AFFLICTIONS,
	type AfflictionDef,
	type ManifestationSpec
} from '../src/lib/content/afflictions.ts';
import { STROBE } from '../src/lib/content/statuses.ts';
import { TICK_RATE } from '../src/lib/shared/constants.ts';
import type { AfflictionSnapshot } from '../src/lib/shared/affliction/types.ts';
import { illumination, lampIllumination } from '../src/lib/shared/creature/visibility.ts';
import { lootValue } from '../src/lib/shared/items/inventory.ts';
import {
	segmentBlocked,
	segmentHit,
	type CollisionWorld
} from '../src/lib/shared/map/collision.ts';
import {
	findPath,
	gridDistances,
	nearestPoint,
	pathLength,
	type NavGrid
} from '../src/lib/shared/map/nav.ts';
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
 * along the nav grid, cutting players off, circling round obstacles to flank, backing off between
 * blows, and now and then running its prey down flat out; winds up and strikes whoever it reaches;
 * from a distance gathers a dark ray that strikes at once and puts out the lamp it hits; and now and then vanishes, to come back behind whoever is alone. Every
 * weapon hit wears it down, and a lamp flicked on in its face (a strobe) stuns it. Banishing it
 * resolves the Affliction and calms it for good (see `calm`). Lamps fail only by omen stage.
 * See docs/dev/affliction.md.
 */

const DT = 1 / TICK_RATE;
/** Id the manifestation uses as a combat target. */
export const MANIFESTATION_ID = 'manifestation';
const REPATH = 0.5;
/** Below this much lamp light on it, it moves at its unlit speed (and may come back there). */
const UNLIT = 0.02;
/** A swing that has begun still lands on someone this much (m) beyond its reach. */
const REACH_SLACK = 0.4;
/** Height difference (m) beyond which it can't reach someone (a floor above or below). */
const REACH_HEIGHT = 2;
/** Seconds a swing takes without a body to time it. */
const STRIKE_SECONDS = 1.2;
/** Closer than this (m) it goes straight for them: leading them would overshoot. */
const LEAD_NEAR = 2.5;
/** How far (m) from its prey it aims when circling round them. */
const FLANK_RADIUS = 1.5;
/** How far round them (radians) ahead of where it is it aims when circling. */
const FLANK_ANGLE = (100 * Math.PI) / 180;
/** Seconds it stands after its ray strikes. */
const CAST_RECOVER = 0.4;
/** The ray reaches this many times its longest range (it stops at stone). */
const RAY_REACH = 1.5;
/** Height difference (m) within which two floor points count as the same level. */
const SAME_LEVEL = 0.6;
/** Furthest (m) it steps on past the end of its path, onto its goal. */
const LAST_STEP = 1.5;
/** Where it may come back, around the player it comes for: behind them first. */
const RETURN_ANGLES = [180, 150, 210, 120, 240].map((a) => (a * Math.PI) / 180);

type Tactic = 'close' | 'flank' | 'retreat';

interface Manifested {
	position: Vec3;
	state: 'gathering' | 'hunting' | 'vanished' | 'banished';
	time: number;
	/** Seconds it gathers before it hunts (summoned, or come back from vanishing). */
	gather: number;
	health: number;
	path: Vec3[];
	pathIndex: number;
	repath: number;
	statuses: Statuses;
	/** Seconds into the swing it is making, or -1 when it isn't swinging. */
	swing: number;
	/** The swing it is making has landed (or missed). */
	landed: boolean;
	/** Seconds it stands after a swing or a cast. */
	recover: number;
	/** Swings begun so far (clients animate each new one). */
	strikes: number;
	/** Seconds into the ray it is gathering, or -1. */
	cast: number;
	/** Who the ray it is gathering is for. */
	castAt: string | null;
	/** Where it aims: its prey's chest, followed until `ray.aimLock` before it fires. */
	aim: Vec3 | null;
	/** Rays begun so far (clients show each charge). */
	casts: number;
	/** Seconds before it may fire again. */
	castCooldown: number;
	/** Seconds of charge left (running its prey down); 0 when it isn't. */
	rushLeft: number;
	/** Seconds of hunting before it may charge again. */
	rushIn: number;
	/** How it is closing in, and for how much longer when not `close`. */
	tactic: Tactic;
	tacticLeft: number;
	/** Which way it circles (flank) or side-steps (retreat): 1 or -1. */
	side: number;
	/** Where it backs off to. */
	retreatTo: Vec3 | null;
	/** Seconds of hunting before it next vanishes. */
	vanishIn: number;
	/** Seconds it stays gone, once vanished. */
	gone: number;
}

/**
 * A blow the manifestation landed on a player this tick, before what they wear absorbs. Its ray
 * also snuffs their lamp for `snuff` seconds.
 */
export interface AfflictionHit {
	playerId: string;
	amount: number;
	snuff?: number;
}

/** A ray it fired: from where, to where it struck, on a player or on the stone (`player` null). */
export interface RayShot {
	from: Vec3;
	to: Vec3;
	player: string | null;
}

/** The entry of a by-party-size table for this party (the last covers any larger one). */
export function byParty(table: readonly number[], party: number): number {
	return table[Math.max(0, Math.min(table.length, party) - 1)] ?? 0;
}

export class AfflictionDirector {
	readonly def: AfflictionDef;
	/** 0..1: drives the omen stages. Nothing manifests when it fills. */
	meter = 0;
	stage = 0;
	/** Explorers who went down: how hard it hits and how much it takes (`strikeDamage`, `health`). */
	party = 1;
	/** Rays fired since the session last took them (it raises `ray` events). */
	shots: RayShot[] = [];
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
		// A training ground (Rumors): no meter, no omens, nothing to summon, from the start.
		if (this.def.training || !this.def.manifestation) this.calmed = true;
	}

	/** What the rite summons. Only read once something is out, which a calmed one never is. */
	private get spec(): ManifestationSpec {
		const m = this.def.manifestation;
		if (!m) throw new Error(`${this.def.id} has no manifestation`);
		return m;
	}

	get manifested(): boolean {
		return this.manifestation !== null;
	}

	/** Feed the meter (a reliquary opened); nothing once it is resolved. */
	raise(amount: number): void {
		if (this.calmed) return;
		this.meter = Math.max(0, Math.min(1, this.meter + amount));
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
		if (!d || d.state === 'banished' || d.state === 'vanished') return false;
		return applyStatus(d.statuses, STROBE.causes, this.spec.statuses);
	}

	/** Admin: swing now at the nearest player, in reach or not. */
	forceStrike(players: Prey[]): boolean {
		const d = this.ready();
		if (!d || !this.nearest(d, able(players))) return false;
		this.beginSwing(d);
		return true;
	}

	/** Admin: gather and fire the ray now at the nearest player, whatever the range or cooldown. */
	forceRay(players: Prey[]): boolean {
		const d = this.ready();
		const target = d && this.nearest(d, able(players));
		if (!d || !target) return false;
		this.beginCast(d, target);
		return true;
	}

	/** Admin: charge at the nearest player now, whatever the range or wait. */
	forceRush(players: Prey[]): boolean {
		const d = this.ready();
		if (!d || !this.nearest(d, able(players))) return false;
		this.beginRush(d);
		return true;
	}

	/** Admin: vanish now (it comes back as it would). */
	forceVanish(): boolean {
		const d = this.manifestation;
		if (!d || d.state === 'banished' || d.state === 'vanished') return false;
		this.vanish(d);
		return true;
	}

	/**
	 * A player turned their lamp on from off: if the manifestation is vulnerable to the strobe and
	 * this lamp lights its core, it gets what the strobe causes (stunned), unless it is immune.
	 */
	strobe(state: PlayerState): boolean {
		const d = this.manifestation;
		// Nothing out (always so in a training ground, which has no manifestation): read no spec.
		if (!d || d.state === 'banished' || d.state === 'vanished') return false;
		const m = this.spec;
		if (!m.vulnerable.includes('strobe')) return false;
		if (lampIllumination(this.world, state, this.core(d)) < STROBE.light) return false;
		return applyStatus(d.statuses, STROBE.causes, m.statuses);
	}

	/**
	 * Advance one tick: the meter, stages, the manifestation. Sets every player's
	 * gloom (the omen stage's) and returns the blows the manifestation landed.
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
		if (d) this.stepManifestation(d, players, able(players), hits);
		for (const p of players) p.state.gloom = base;
		return hits;
	}

	/** Hit capsule while it's hunting or gathering (not while it is gone). */
	hitBody(): CreatureBody | null {
		const d = this.manifestation;
		if (!d || d.state === 'banished' || d.state === 'vanished') return null;
		const m = this.spec;
		return { id: MANIFESTATION_ID, position: d.position, height: m.hitHeight, radius: m.hitRadius };
	}

	/** A weapon hit it: every hit wears it down. True when that banished it. */
	damage(amount: number): boolean {
		const d = this.manifestation;
		if (!d || d.state === 'banished' || d.state === 'vanished') return false;
		d.health -= amount;
		if (d.health > 0) return false;
		this.dissolve(d);
		return true;
	}

	/** Damage a landed strike does, for this party's size. */
	get strikeDamage(): number {
		return byParty(this.spec.strikeDamage, this.party);
	}

	/** Damage its ray does, for this party's size. */
	get rayDamage(): number {
		return byParty(this.spec.ray.damage, this.party);
	}

	/** Damage it takes to banish, for this party's size. */
	get maxHealth(): number {
		return byParty(this.spec.health, this.party);
	}

	/** Health it has left (admin readout, tests); null while it isn't out. */
	get health(): number | null {
		return this.manifestation ? Math.max(0, this.manifestation.health) : null;
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
						position: round(d.position),
						state: d.state,
						stunned: hasStatus(d.statuses, 'stunned'),
						strikes: d.strikes,
						casts: d.casts,
						charge:
							d.cast >= 0
								? Math.round(Math.min(1, d.cast / this.spec.ray.chargeSeconds) * 100) / 100
								: 0,
						aim: d.cast >= 0 && d.aim ? round(d.aim) : null,
						rushing: d.rushLeft > 0
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
					this.spec.spawnDistance
				);
			}
		}
		this.stage = stage;
		this.creatures.boldness = stages[stage - 1]?.boldness ?? 1;
	}

	private manifestFar(players: Prey[]): void {
		const m = this.spec;
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
		const m = this.spec;
		this.manifestation = {
			position: [...at],
			state: 'gathering',
			time: 0,
			gather: m.gatherSeconds,
			health: this.maxHealth,
			path: [],
			pathIndex: 0,
			repath: 0,
			statuses: {},
			swing: -1,
			landed: false,
			recover: 0,
			strikes: 0,
			cast: -1,
			castAt: null,
			aim: null,
			casts: 0,
			castCooldown: this.between(m.ray.cooldown) / 2,
			rushLeft: 0,
			rushIn: this.between(m.rush.every) / 2,
			tactic: 'close',
			tacticLeft: 0,
			side: 1,
			retreatTo: null,
			vanishIn: this.between(m.vanish.every),
			gone: 0
		};
	}

	/** Banished: it fades away, and the Affliction is resolved. */
	private dissolve(d: Manifested): void {
		d.state = 'banished';
		d.time = 0;
		d.cast = -1;
		d.rushLeft = 0;
		this.defeated = true;
		this.calm();
	}

	/** It is out and can act now (an admin tool): hunting, or made to from gathering. */
	private ready(): Manifested | null {
		const d = this.manifestation;
		if (!d || d.state === 'banished' || d.state === 'vanished') return null;
		d.state = 'hunting';
		d.swing = -1;
		d.cast = -1;
		d.recover = 0;
		d.rushLeft = 0;
		return d;
	}

	private stepManifestation(
		d: Manifested,
		players: Prey[],
		up: Prey[],
		hits: AfflictionHit[]
	): void {
		const m = this.spec;
		d.time += DT;
		if (d.state === 'banished') return;
		stepStatuses(d.statuses, m.statuses, DT);
		if (d.state === 'vanished') {
			if (d.time >= d.gone) this.comeBack(d, players, up);
			return;
		}
		if (d.state === 'gathering') {
			if (d.time >= d.gather) {
				d.state = 'hunting';
				d.time = 0;
			}
			return;
		}

		// Stunned, it stands where it is, and a swing or ray not yet loosed is lost (and a charge).
		if (hasStatus(d.statuses, 'stunned')) {
			d.swing = -1;
			d.cast = -1;
			d.recover = 0;
			d.rushLeft = 0;
			return;
		}

		// Swinging: it stands, and the blow lands partway through on whoever is still in reach.
		if (d.swing >= 0) {
			d.swing += DT;
			if (!d.landed && d.swing >= m.strikeAt) {
				d.landed = true;
				for (const p of up) {
					if (this.reaches(d, p, m.reach + REACH_SLACK)) {
						hits.push({ playerId: p.id, amount: this.strikeDamage });
					}
				}
			}
			if (d.swing >= (m.body?.strikeSeconds ?? STRIKE_SECONDS)) {
				d.swing = -1;
				d.recover = m.strikeRecover;
				// Rather than press straight in again, it may back off or side-step.
				if (this.rng.next() < m.movement.retreatChance) this.retreat(d, up);
			}
			return;
		}
		// Gathering the ray: it stands, its aim following its prey until just before it fires; then
		// the ray strikes at once along that line.
		if (d.cast >= 0) {
			d.cast += DT;
			const target = up.find((p) => p.id === d.castAt);
			if (target && d.cast < m.ray.chargeSeconds - m.ray.aimLock) d.aim = chest(target.state);
			if (d.cast >= m.ray.chargeSeconds) {
				if (d.aim) this.fire(d, d.aim, up, hits);
				d.cast = -1;
				d.castAt = null;
				d.aim = null;
				d.castCooldown = this.between(m.ray.cooldown);
				d.recover = CAST_RECOVER;
			}
			return;
		}
		if (d.recover > 0) {
			d.recover = Math.max(0, d.recover - DT);
			return;
		}

		d.vanishIn -= DT;
		if (d.vanishIn <= 0) {
			this.vanish(d);
			return;
		}
		d.castCooldown = Math.max(0, d.castCooldown - DT);
		d.rushIn = Math.max(0, d.rushIn - DT);
		d.rushLeft = Math.max(0, d.rushLeft - DT);

		// Hunt the nearest player who's still up; within reach, it begins a swing.
		const target = this.nearest(d, up);
		if (!target) return;
		// Backing off, it doesn't swing until it comes on again.
		if (d.tactic !== 'retreat' && this.reaches(d, target, m.reach)) {
			d.rushLeft = 0;
			this.beginSwing(d);
			return;
		}
		const away = flat(d.position, target.state.position);
		const clear = !segmentBlocked(this.world, this.core(d), chest(target.state));
		if (d.rushLeft <= 0) {
			// Keeping away isn't safe either: from a distance, with a clear line, it fires its ray.
			if (d.castCooldown <= 0 && away >= m.ray.range[0] && away <= m.ray.range[1] && clear) {
				this.beginCast(d, target);
				return;
			}
			// Now and then it runs them down, flat out.
			if (
				d.rushIn <= 0 &&
				d.tactic !== 'retreat' &&
				away >= m.rush.range[0] &&
				away <= m.rush.range[1] &&
				clear
			) {
				this.beginRush(d);
			}
		}

		let speed: number;
		if (d.rushLeft > 0) {
			speed = m.rush.speed;
			if (d.tactic !== 'close') this.setTactic(d, 'close', 0, d.side);
		} else {
			const light = illumination(
				this.world,
				players.map((p) => p.state),
				this.core(d)
			);
			speed = light < UNLIT ? m.unlitSpeed : m.speed;
		}
		this.move(d, this.goal(d, target, speed), target.state.position, speed * DT);
	}

	/** It charges: flat out at its prey for a moment, then hunts as before. */
	private beginRush(d: Manifested): void {
		const r = this.spec.rush;
		d.rushLeft = this.between(r.seconds);
		d.rushIn = this.between(r.every);
		d.repath = 0;
	}

	/**
	 * The ray strikes at once from its core along the line to `aim`, as far as stone or its reach,
	 * and hits the first player whose body is within `ray.width` of that line.
	 */
	private fire(d: Manifested, aim: Vec3, up: Prey[], hits: AfflictionHit[]): void {
		const r = this.spec.ray;
		const from = this.core(d);
		const dir: Vec3 = [aim[0] - from[0], aim[1] - from[1], aim[2] - from[2]];
		const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
		const reach = r.range[1] * RAY_REACH;
		let end: Vec3 = [
			from[0] + (dir[0] / len) * reach,
			from[1] + (dir[1] / len) * reach,
			from[2] + (dir[2] / len) * reach
		];
		const wall = segmentHit(this.world, from, end);
		if (wall !== null) end = lerp(from, end, wall);
		let struck: Prey | null = null;
		let best = Infinity;
		for (const p of up) {
			const { along, distance } = toBody(p.state, from, end);
			if (distance <= r.width && along < best) {
				best = along;
				struck = p;
			}
		}
		if (struck) {
			const length = Math.hypot(end[0] - from[0], end[1] - from[1], end[2] - from[2]);
			end = lerp(from, end, best / Math.max(1e-6, length));
			hits.push({ playerId: struck.id, amount: this.rayDamage, snuff: r.snuffSeconds });
		}
		this.shots.push({ from: round(from), to: round(end), player: struck?.id ?? null });
	}

	private beginSwing(d: Manifested): void {
		d.swing = 0;
		d.landed = false;
		d.strikes++;
	}

	private beginCast(d: Manifested, target: Prey): void {
		d.cast = 0;
		d.castAt = target.id;
		d.casts++;
	}

	/** It goes, for a while, to come back from somewhere else. */
	private vanish(d: Manifested): void {
		d.state = 'vanished';
		d.time = 0;
		d.gone = this.between(this.spec.vanish.seconds);
		d.swing = -1;
		d.cast = -1;
		d.recover = 0;
		d.rushLeft = 0;
		d.path = [];
		d.tactic = 'close';
	}

	/**
	 * Back from vanishing: behind whoever is alone (the player farthest from the rest), out of
	 * every lamp, with a way to them along the floor. With nowhere like that it comes back where
	 * it went. It stands a moment, then hunts.
	 */
	private comeBack(d: Manifested, players: Prey[], up: Prey[]): void {
		const v = this.spec.vanish;
		const prey = loneliest(up);
		if (prey) d.position = this.returnSpot(prey, players) ?? d.position;
		d.state = 'gathering';
		d.time = 0;
		d.gather = v.returnSeconds;
		d.vanishIn = this.between(v.every);
		d.path = [];
		d.repath = 0;
	}

	private returnSpot(prey: Prey, players: Prey[]): Vec3 | null {
		const v = this.spec.vanish;
		const s = prey.state;
		const home = nearestPoint(this.nav, s.position, 3);
		if (home < 0) return null;
		const lamps = players.map((p) => p.state);
		const [near, far] = v.distance;
		for (const angle of RETURN_ANGLES) {
			// Facing is -Z at yaw 0: the way they look, turned by `angle`.
			const yaw = s.yaw + angle;
			for (const r of [far, (near + far) / 2, near]) {
				const want: Vec3 = [
					s.position[0] - Math.sin(yaw) * r,
					s.position[1],
					s.position[2] - Math.cos(yaw) * r
				];
				const i = nearestPoint(this.nav, want, 1.5);
				if (i < 0) continue;
				const at = this.nav.points[i].position;
				if (Math.abs(at[1] - s.position[1]) > SAME_LEVEL) continue;
				const core: Vec3 = [at[0], at[1] + this.spec.hitHeight / 2, at[2]];
				if (illumination(this.world, lamps, core) >= UNLIT) continue;
				const path = findPath(this.nav, i, home, 4000);
				if (!path || pathLength(path) > r * 3) continue;
				return [...at];
			}
		}
		return null;
	}

	/** Back off and to one side of its prey, for a moment, before it comes on again. */
	private retreat(d: Manifested, up: Prey[]): void {
		const mv = this.spec.movement;
		const target = this.nearest(d, up);
		if (!target) return;
		const t = target.state.position;
		let ax = d.position[0] - t[0];
		let az = d.position[2] - t[2];
		const len = Math.hypot(ax, az) || 1;
		ax /= len;
		az /= len;
		const side = this.rng.next() < 0.5 ? 1 : -1;
		for (const s of [side, -side]) {
			// Away from them, and as far again to the side.
			const dx = ax - az * s * 0.8;
			const dz = az + ax * s * 0.8;
			const dl = Math.hypot(dx, dz);
			const want: Vec3 = [
				d.position[0] + (dx / dl) * mv.retreatDistance,
				d.position[1],
				d.position[2] + (dz / dl) * mv.retreatDistance
			];
			const to = this.snap(want, d.position[1], 2);
			if (!to) continue;
			this.setTactic(d, 'retreat', mv.retreatSeconds, s);
			d.retreatTo = to;
			return;
		}
	}

	private setTactic(d: Manifested, tactic: Tactic, seconds: number, side: number): void {
		d.tactic = tactic;
		d.tacticLeft = seconds;
		d.side = side;
		d.repath = 0;
	}

	/**
	 * Where it heads this tick. Closing in, it aims where its prey is going (`lead`), to cut them
	 * off. When the way round to them is far longer than the straight line (a table between), or
	 * now and then in flank range, it circles round them one way for a while, so running round
	 * the table doesn't keep it on the far side. Backing off, it heads for its retreat spot.
	 */
	private goal(d: Manifested, target: Prey, speed: number): Vec3 {
		const mv = this.spec.movement;
		const t = target.state.position;
		const straight = flat(d.position, t);
		if (d.tactic !== 'close') {
			d.tacticLeft -= DT;
			if (d.tacticLeft <= 0) this.setTactic(d, 'close', 0, d.side);
		}
		if (d.tactic === 'retreat' && d.retreatTo) return d.retreatTo;
		if (d.tactic === 'close' && straight >= mv.flankRange[0] && straight <= mv.flankRange[1]) {
			if (this.detour(d, t) > mv.detour * straight || this.rng.next() < mv.flankChance * DT) {
				this.setTactic(d, 'flank', mv.flankSeconds, this.rng.next() < 0.5 ? 1 : -1);
			}
		}
		if (d.tactic === 'flank') {
			// From them toward it, turned on round them: the aim keeps moving ahead of it.
			const a = Math.atan2(d.position[0] - t[0], d.position[2] - t[2]) + FLANK_ANGLE * d.side;
			const want: Vec3 = [
				t[0] + Math.sin(a) * FLANK_RADIUS,
				t[1],
				t[2] + Math.cos(a) * FLANK_RADIUS
			];
			return this.snap(want, t[1], 1) ?? t;
		}
		if (straight < LEAD_NEAR) return t;
		// Where they will be by the time it gets there (no further ahead than `lead`).
		const ahead = Math.min(mv.lead, straight / Math.max(0.1, speed));
		const v = target.state.velocity;
		const want: Vec3 = [t[0] + v[0] * ahead, t[1], t[2] + v[2] * ahead];
		return this.snap(want, t[1], 1.5) ?? t;
	}

	/**
	 * The floor point nearest want on the same level as level (within a step), or null: never
	 * one across a drop, on a ledge, or on the floor below or above.
	 */
	private snap(want: Vec3, level: number, radius: number): Vec3 | null {
		const i = nearestPoint(this.nav, want, radius);
		if (i < 0) return null;
		const at = this.nav.points[i].position;
		return Math.abs(at[1] - level) <= SAME_LEVEL ? [...at] : null;
	}

	/**
	 * How far it still has to go along its path, when that path ends near its prey (0 otherwise:
	 * a path to somewhere else says nothing about the way to them).
	 */
	private detour(d: Manifested, prey: Vec3): number {
		const end = d.path[d.path.length - 1];
		if (d.pathIndex >= d.path.length || !end || flat(end, prey) > LEAD_NEAR) return 0;
		return (
			flat(d.position, d.path[d.pathIndex]) +
			pathLength(d.path.slice(d.pathIndex)) +
			flat(end, prey)
		);
	}

	/** Is a player within this distance of it along the floor (and on its level)? */
	private reaches(d: Manifested, p: Prey, distance: number): boolean {
		const s = p.state.position;
		return flat(d.position, s) <= distance && Math.abs(s[1] - d.position[1]) < REACH_HEIGHT;
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
		return [d.position[0], d.position[1] + this.spec.hitHeight / 2, d.position[2]];
	}

	private nearest(d: Manifested, up: Prey[]): Prey | null {
		let best: Prey | null = null;
		let bestD = Infinity;
		for (const p of up) {
			const dist = this.distance(d, p);
			if (dist < bestD) {
				best = p;
				bestD = dist;
			}
		}
		return best;
	}

	/** A random time in a [min, max] range. */
	private between([lo, hi]: readonly [number, number]): number {
		return lo + this.rng.next() * (hi - lo);
	}

	/**
	 * Move toward a point along the nav grid. It is simulated as a point, not a body: no
	 * collision, through water, crawls and squeezes alike. It only ever walks the grid: with no
	 * way to goal it heads for its prey (prey) instead, and with no way to them either it
	 * stands. Off the end of its path it steps on to the goal only when that is close and level
	 * (its prey's feet), never across a gap.
	 */
	private move(d: Manifested, goal: Vec3, prey: Vec3, step: number): void {
		d.repath -= DT;
		if (d.repath <= 0 || d.pathIndex >= d.path.length) {
			d.repath = REPATH;
			const from = nearestPoint(this.nav, d.position, 4);
			d.path =
				findPath(this.nav, from, nearestPoint(this.nav, goal, 4)) ??
				findPath(this.nav, from, nearestPoint(this.nav, prey, 4)) ??
				[];
			d.pathIndex = d.path.length > 1 ? 1 : 0;
		}
		const end = d.path[d.path.length - 1] ?? d.position;
		const last =
			flat(end, goal) <= LAST_STEP && Math.abs(end[1] - goal[1]) <= SAME_LEVEL ? goal : null;
		let left = step;
		while (left > 0) {
			const w = d.pathIndex < d.path.length ? d.path[d.pathIndex] : last;
			if (!w) break;
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

/** Players it can go for: on their feet and still underground. */
function able(players: Prey[]): Prey[] {
	return players.filter((p) => !p.state.downed && !p.state.dead && !p.state.extracted);
}

/** The player farthest from the rest (alone), or the only one. */
function loneliest(up: Prey[]): Prey | null {
	if (up.length <= 1) return up[0] ?? null;
	let best: Prey | null = null;
	let bestD = -1;
	for (const p of up) {
		let nearest = Infinity;
		for (const q of up) {
			if (q !== p) nearest = Math.min(nearest, flat(p.state.position, q.state.position));
		}
		if (nearest > bestD) {
			bestD = nearest;
			best = p;
		}
	}
	return best;
}

/** Distance along the floor (ignoring height). */
function flat(a: Vec3, b: Vec3): number {
	return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

/** Where its ray aims on a player: their chest. */
function chest(s: PlayerState): Vec3 {
	return [s.position[0], s.position[1] + eyeHeight(s) * 0.75, s.position[2]];
}

/**
 * How a segment passes a player's body (the line from their feet to their eyes): how far along
 * it (m) it comes closest, and how close.
 */
function toBody(s: PlayerState, from: Vec3, to: Vec3): { along: number; distance: number } {
	const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
	const length = Math.hypot(d[0], d[1], d[2]) || 1;
	const u: Vec3 = [d[0] / length, d[1] / length, d[2] / length];
	let best = { along: 0, distance: Infinity };
	// Sample the body from feet to eyes; the closest of those to the line.
	const eye = eyeHeight(s);
	for (let k = 0; k <= 4; k++) {
		const p: Vec3 = [s.position[0], s.position[1] + (eye * k) / 4, s.position[2]];
		const w: Vec3 = [p[0] - from[0], p[1] - from[1], p[2] - from[2]];
		const along = Math.max(0, Math.min(length, w[0] * u[0] + w[1] * u[1] + w[2] * u[2]));
		const q: Vec3 = [from[0] + u[0] * along, from[1] + u[1] * along, from[2] + u[2] * along];
		const distance = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
		if (distance < best.distance) best = { along, distance };
	}
	return best;
}
function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function round(v: Vec3): Vec3 {
	return v.map((x) => Math.round(x * 1000) / 1000) as Vec3;
}
