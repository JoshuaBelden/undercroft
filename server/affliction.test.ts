import { describe, expect, it } from 'vitest';
import { AFFLICTIONS } from '../src/lib/content/afflictions.ts';
import { TICK_RATE } from '../src/lib/shared/constants.ts';
import { addItem, newStack } from '../src/lib/shared/items/inventory.ts';
import { eyeHeight } from '../src/lib/shared/player/simulate.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';
import { segmentBlocked } from '../src/lib/shared/map/collision.ts';
import { nearestPoint } from '../src/lib/shared/map/nav.ts';
import { AfflictionDirector, byParty, MANIFESTATION_ID, type AfflictionHit } from './affliction.ts';
import { CreatureDirector, type Prey } from './creatures.ts';
import { mapFixture, prey } from './testing/harness.ts';

const DEF = AFFLICTIONS.gloaming;
const m = DEF.manifestation!;
const map = mapFixture(1);
const STUN = m.statuses.stunned!;

// Test-only: the Gloaming, but it always backs off after a swing.
AFFLICTIONS['test-retreat'] = {
	...DEF,
	id: 'test-retreat',
	manifestation: { ...m, movement: { ...m.movement, retreatChance: 1 } }
};

function director(id = 'gloaming') {
	const creatures = new CreatureDirector(map.world, map.nav, [], map.seed);
	const affliction = new AfflictionDirector(map.world, map.nav, creatures, map.seed, id);
	// Only what a test sets up: no ray, charge or vanishing it didn't ask for.
	const out = { creatures, affliction };
	const forceManifest = affliction.forceManifest.bind(affliction);
	affliction.forceManifest = (players) => {
		forceManifest(players);
		const d = affliction['manifestation'];
		if (d) {
			d.castCooldown = 1e9;
			d.vanishIn = 1e9;
		}
	};
	return out;
}

/** Distance along the floor. */
function flat(a: Vec3, b: Vec3): number {
	return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

/** Lamp off and standing still. */
function still(p: Prey): Prey {
	p.state.headlamp = 0;
	p.state.velocity = [0, 0, 0];
	return p;
}

/**
 * Two floor points on the start room's level, between min and max metres apart, with a clear
 * line between its core and a player's chest there (or, `blocked`, a wall between; null, either).
 */
function sightLine(min: number, max: number, blocked: boolean | null): [Vec3, Vec3] {
	// From the points nearest the start first (whatever room it opens into), the first that has one.
	const fromStart = (p: { position: Vec3 }) =>
		Math.hypot(p.position[0] - map.start[0], p.position[2] - map.start[2]);
	const froms = [...map.nav.points].sort((a, b) => fromStart(a) - fromStart(b)).slice(0, 400);
	for (const { position: from } of froms) {
		for (const point of map.nav.points) {
			const to = point.position;
			const d = Math.hypot(to[0] - from[0], to[2] - from[2]);
			if (d < min || d > max || Math.abs(to[1] - from[1]) > 0.3) continue;
			const core: Vec3 = [from[0], from[1] + m.hitHeight / 2, from[2]];
			const chest: Vec3 = [to[0], to[1] + 1.2, to[2]];
			if (blocked === null || segmentBlocked(map.world, core, chest) === blocked) {
				return [[...from], [...to]];
			}
		}
	}
	throw new Error('no such line in the fixture map');
}

/** Run ticks with these players; returns every hit. */
function run(affliction: AfflictionDirector, seconds: number, players = [prey('p', map.start)]) {
	const hits: AfflictionHit[] = [];
	for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) hits.push(...affliction.step(players));
	return hits;
}

/** The manifestation's position (it is hunting once `hunt` has run). */
function where(affliction: AfflictionDirector): Vec3 {
	return affliction.snapshot().manifestation!.position;
}

/** Bring it out far away and wait out the gathering. */
function hunt(affliction: AfflictionDirector, players = [prey('far', map.start)]) {
	affliction.forceManifest(players);
	run(affliction, m.gatherSeconds + 0.1, players);
	expect(affliction.snapshot().manifestation!.state).toBe('hunting');
}

/** Hold it in the open start room. */
function pin(affliction: AfflictionDirector): Vec3 {
	const at: Vec3 = [...map.start];
	affliction['manifestation']!.position = [...at];
	return at;
}

/** A player a metre from it with a bright lamp held on its core. */
function lampOn(at: Vec3): Prey {
	const core: Vec3 = [at[0], at[1] + m.hitHeight / 2, at[2]];
	const spot: Vec3 = [at[0] + 1, at[1], at[2]];
	const lamp = prey('lamp', spot);
	lamp.state.headlamp = 2;
	lamp.state.yaw = Math.atan2(-(core[0] - spot[0]), -(core[2] - spot[2]));
	lamp.state.pitch = Math.atan2(core[1] - spot[1] - eyeHeight(lamp.state), 1);
	return lamp;
}

/** Someone standing right where it is, lamp off. */
function victim(at: Vec3, id = 'v'): Prey {
	const v = prey(id, [at[0] + 0.3, at[1], at[2]]);
	v.state.headlamp = 0;
	return v;
}

describe('AfflictionDirector', () => {
	it('falls back to the default Affliction for an unknown id', () => {
		const { creatures } = director();
		expect(new AfflictionDirector(map.world, map.nav, creatures, 1, 'no-such').def.id).toBe(
			'gloaming'
		);
	});

	it('the meter fills with time, and faster with kills and loot carried', () => {
		const slow = director().affliction;
		run(slow, 10);
		expect(slow.meter).toBeCloseTo(10 / DEF.meter.seconds, 4);
		const fast = director();
		fast.creatures.kills = 2;
		const rich = prey('p', map.start);
		addItem(rich.state.inventory, newStack('relic'));
		run(fast.affliction, 10, [rich]);
		expect(fast.affliction.meter).toBeGreaterThan(slow.meter + 2 * DEF.meter.perKill - 1e-9);
	});

	it('omen stages follow the meter, make creatures bolder and bring more of them', () => {
		const { creatures, affliction } = director();
		affliction.setMeter(0.8);
		run(affliction, 0.05);
		expect(affliction.stage).toBe(3);
		expect(creatures.boldness).toBe(DEF.stages[2].boldness);
		const spawned = DEF.stages.slice(0, 3).reduce((n, s) => n + s.spawn, 0);
		expect(creatures.count).toBe(spawned);
		const players = [prey('p', map.start)];
		affliction.step(players);
		expect(players[0].state.gloom).toBe(DEF.stages[2].gloom);
	});

	it('a full meter brings the last omens, but nothing manifests', () => {
		const { affliction } = director();
		affliction.setMeter(1);
		run(affliction, 1);
		expect(affliction.stage).toBe(DEF.stages.length);
		expect(affliction.manifested).toBe(false);
		expect(affliction.snapshot().manifestation).toBeNull();
	});

	it('the rite summons it in its room, at the far end from where it was performed', () => {
		const { affliction } = director();
		const near = (p: Vec3) => Math.hypot(p[0] - map.start[0], p[2] - map.start[2]) < 6;
		const players = [prey('p', map.start)];
		affliction.summon(near, map.start, players);
		const at = where(affliction);
		expect(near(at)).toBe(true);
		const farthest = Math.max(
			...map.nav.points
				.filter((p) => near(p.position))
				.map((p) => Math.hypot(p.position[0] - map.start[0], p.position[2] - map.start[2]))
		);
		expect(Math.hypot(at[0] - map.start[0], at[2] - map.start[2])).toBeCloseTo(farthest, 3);
		// It gathers a moment, then hunts.
		expect(affliction.snapshot().manifestation!.state).toBe('gathering');
		run(affliction, m.gatherSeconds + 0.1, [prey('far', [at[0] + 50, at[1], at[2]])]);
		expect(affliction.snapshot().manifestation!.state).toBe('hunting');
		expect(affliction.hitBody()!.id).toBe(MANIFESTATION_ID);
		// Only once.
		affliction.summon(() => true, at, players);
		expect(where(affliction)).not.toEqual(map.start);
	});

	it('with no floor in the room, the rite summons it far away instead', () => {
		const { affliction } = director();
		affliction.summon(() => false, map.start, [prey('p', map.start)]);
		const at = where(affliction);
		expect(Math.hypot(at[0] - map.start[0], at[2] - map.start[2])).toBeGreaterThan(5);
	});

	it('winds up first, and the blow lands partway through the swing', () => {
		const { affliction } = director();
		hunt(affliction);
		const at = pin(affliction);
		const v = victim(at);
		expect(run(affliction, 1 / TICK_RATE, [v])).toEqual([]);
		expect(affliction.snapshot().manifestation!.strikes).toBe(1);
		// Nothing until strikeAt.
		expect(run(affliction, m.strikeAt - 0.15, [v])).toEqual([]);
		const hits = run(affliction, 0.25, [v]);
		expect(hits).toEqual([{ playerId: 'v', amount: m.strikeDamage[0] }]);
	});

	it('a blow only lands on someone still in reach', () => {
		const { affliction } = director();
		hunt(affliction);
		const at = pin(affliction);
		const v = victim(at);
		run(affliction, 1 / TICK_RATE, [v]);
		expect(affliction.snapshot().manifestation!.strikes).toBe(1);
		// Step back out of reach before it lands.
		v.state.position = [at[0] + m.reach + 1, at[1], at[2]];
		expect(run(affliction, m.strikeAt, [v])).toEqual([]);
	});

	it('nothing hurts between blows: no touch, no drain', () => {
		const { affliction } = director();
		hunt(affliction);
		const at = pin(affliction);
		const v = victim(at);
		const hits: AfflictionHit[] = [];
		for (let t = 0; t < 4 * TICK_RATE; t++) {
			pin(affliction);
			hits.push(...affliction.step([v]));
		}
		const strikes = affliction.snapshot().manifestation!.strikes;
		expect(strikes).toBeGreaterThan(1);
		// One hit per landed swing, each the full blow; nothing else.
		expect(hits.length).toBeGreaterThanOrEqual(strikes - 1);
		expect(hits.length).toBeLessThanOrEqual(strikes);
		expect(hits.every((h) => h.amount === m.strikeDamage[0])).toBe(true);
	});

	it('hits harder the bigger the party: 40 solo, 50 for two, 60 for three or more', () => {
		expect(m.strikeDamage).toEqual([40, 50, 60]);
		const { affliction } = director();
		const by = (party: number) => {
			affliction.party = party;
			return affliction.strikeDamage;
		};
		expect([by(1), by(2), by(3), by(4), by(0)]).toEqual([40, 50, 60, 60, 40]);
	});

	it('a strobe in its face stuns it: it stands still, loses its swing, then is immune a while', () => {
		const { affliction } = director();
		hunt(affliction);
		const at = pin(affliction);
		const lamp = lampOn(at);
		const v = victim(at);
		// It begins a swing at the victim; the strobe catches it before the blow lands.
		run(affliction, 1 / TICK_RATE, [v]);
		expect(affliction.strobe(lamp.state)).toBe(true);
		expect(affliction.snapshot().manifestation!.stunned).toBe(true);
		const far = prey('far', [at[0] + 6, at[1], at[2]]);
		far.state.headlamp = 0;
		expect(run(affliction, STUN.seconds - 0.1, [v, far])).toEqual([]);
		expect(where(affliction)).toEqual(at);
		run(affliction, 0.2, [far]);
		expect(affliction.snapshot().manifestation!.stunned).toBe(false);
		// Immune for a while after.
		pin(affliction);
		expect(affliction.strobe(lamp.state)).toBe(false);
		run(affliction, STUN.immunity + 0.1, [prey('none', [at[0] + 80, at[1], at[2]])]);
		pin(affliction);
		expect(affliction.strobe(lamp.state)).toBe(true);
	});

	it('a strobe that does not light it does nothing', () => {
		const { affliction } = director();
		hunt(affliction);
		const at = pin(affliction);
		const lamp = lampOn(at);
		lamp.state.yaw += Math.PI;
		expect(affliction.strobe(lamp.state)).toBe(false);
		expect(affliction.stun()).toBe(true);
		expect(affliction.snapshot().manifestation!.stunned).toBe(true);
	});

	it('every hit wears it down, lamp or no lamp, until it is banished and resolved', () => {
		const { creatures, affliction } = director();
		hunt(affliction);
		pin(affliction);
		// Nobody's lamp is on it.
		run(affliction, 0.5, [victim(where(affliction))]);
		expect(affliction.health).toBe(m.health[0]);
		expect(affliction.damage(m.health[0] / 2)).toBe(false);
		expect(affliction.health).toBe(m.health[0] / 2);
		expect(affliction.damage(m.health[0])).toBe(true);
		expect(affliction.defeated).toBe(true);
		expect(affliction.calmed).toBe(true);
		expect(creatures.boldness).toBe(1);
		expect(affliction.stage).toBe(0);
		expect(affliction.hitBody()).toBeNull();
		expect(affliction.damage(1)).toBe(false);
		expect(affliction.snapshot().manifestation!.state).toBe('banished');
	});

	it('takes more to banish the bigger the party', () => {
		expect(m.health[0]).toBeGreaterThanOrEqual(300);
		const { affliction } = director();
		affliction.party = 3;
		affliction.forceManifest([prey('far', map.start)]);
		expect(affliction.health).toBe(byParty(m.health, 3));
		expect(byParty(m.health, 3)).toBeGreaterThan(byParty(m.health, 1));
		expect(byParty(m.health, 9)).toBe(m.health[m.health.length - 1]);
	});

	describe('its ray', () => {
		it('from a distance, with a clear line, it gathers the ray, then it strikes at once', () => {
			const { affliction } = director();
			hunt(affliction);
			const [from, to] = sightLine(7, 12, false);
			affliction['manifestation']!.position = [...from];
			affliction['manifestation']!.castCooldown = 0;
			const target = still(prey('t', to));
			run(affliction, 1 / TICK_RATE, [target]);
			expect(affliction.snapshot().manifestation!.casts).toBe(1);
			// It stands while it gathers it, the charge building and its aim on its prey.
			const hits = run(affliction, m.ray.chargeSeconds - 0.15, [target]);
			expect(hits).toEqual([]);
			expect(where(affliction)).toEqual(from);
			const snap = affliction.snapshot().manifestation!;
			expect(snap.charge).toBeGreaterThan(0.8);
			expect(snap.aim).not.toBeNull();
			expect(affliction.shots).toEqual([]);
			// Then it strikes, the same tick it fires: no flight.
			const struck = run(affliction, 0.2, [target]);
			expect(struck).toContainEqual({
				playerId: 't',
				amount: m.ray.damage[0],
				snuff: m.ray.snuffSeconds
			});
			expect(affliction.shots).toHaveLength(1);
			expect(affliction.shots[0].player).toBe('t');
			expect(affliction.snapshot().manifestation!.charge).toBe(0);
		});

		it('its aim stops following just before it fires: stepping aside then dodges it', () => {
			const { affliction } = director();
			hunt(affliction);
			const [from, to] = sightLine(6, 12, false);
			affliction['manifestation']!.position = [...from];
			const target = still(prey('t', to));
			expect(affliction.forceRay([target])).toBe(true);
			// Into the last moment, when its aim is set.
			run(affliction, m.ray.chargeSeconds - m.ray.aimLock + 0.1, [target]);
			// Out of the line (straight up out of it, wherever the line runs).
			target.state.position = [to[0], to[1] + 30, to[2]];
			const hits = run(affliction, m.ray.aimLock + 0.1, [target]);
			expect(hits.filter((h) => h.snuff)).toEqual([]);
			expect(affliction.shots).toHaveLength(1);
			expect(affliction.shots[0].player).toBeNull();
		});

		it('stone stops it: it strikes the wall, not whoever is behind it', () => {
			const { affliction } = director();
			hunt(affliction);
			const [from, to] = sightLine(4, 10, true);
			affliction['manifestation']!.position = [...from];
			const target = still(prey('t', to));
			affliction.forceRay([target]);
			const hits = run(affliction, m.ray.chargeSeconds + 0.2, [target]);
			expect(hits.filter((h) => h.snuff)).toEqual([]);
			const shot = affliction.shots[0];
			expect(shot.player).toBeNull();
			// It stopped short of them.
			const reach = Math.hypot(shot.to[0] - shot.from[0], shot.to[2] - shot.from[2]);
			expect(reach).toBeLessThan(Math.hypot(to[0] - from[0], to[2] - from[2]));
		});

		it('a strobe while it gathers the ray loses it', () => {
			const { affliction } = director();
			hunt(affliction);
			const at = pin(affliction);
			const lamp = lampOn(at);
			affliction.forceRay([lamp]);
			run(affliction, 0.2, [lamp]);
			expect(affliction.strobe(lamp.state)).toBe(true);
			run(affliction, m.ray.chargeSeconds, [lamp]);
			expect(affliction.shots).toEqual([]);
		});
	});

	describe('running its prey down', () => {
		it('in range with a clear line it charges, flat out, then walks again', () => {
			const { affliction } = director();
			hunt(affliction);
			const [from, to] = sightLine(7, 12, false);
			const d = affliction['manifestation']!;
			d.position = [...from];
			d.rushIn = 0;
			const target = still(prey('t', to));
			target.state.headlamp = 2; // Lit: it would only walk at `speed`.
			const start = flat(where(affliction), to);
			run(affliction, 0.5, [target]);
			expect(affliction.snapshot().manifestation!.rushing).toBe(true);
			const covered = start - flat(where(affliction), to);
			// Far faster than its lit walk (allowing for the way round along the floor).
			expect(covered).toBeGreaterThan(m.speed * 0.5 * 1.5);
			run(affliction, m.rush.seconds[1] + 0.1, [prey('gone', [to[0] + 200, to[1], to[2]])]);
			expect(affliction.snapshot().manifestation!.rushing).toBe(false);
		});

		it('admin: charge on demand; a strobe stops a charge', () => {
			const { affliction } = director();
			hunt(affliction);
			const at = pin(affliction);
			const lamp = lampOn(at);
			lamp.state.position = [at[0] + 6, at[1], at[2]];
			expect(affliction.forceRush([lamp])).toBe(true);
			expect(affliction.snapshot().manifestation!.rushing).toBe(true);
			affliction.stun();
			run(affliction, 1 / TICK_RATE, [lamp]);
			expect(affliction.snapshot().manifestation!.rushing).toBe(false);
		});
	});

	describe('vanishing', () => {
		it('goes, can not be hurt or stunned while gone, and comes back behind whoever is alone', () => {
			const { affliction } = director();
			hunt(affliction);
			const at = pin(affliction);
			const lamp = lampOn(at);
			expect(affliction.forceVanish()).toBe(true);
			expect(affliction.snapshot().manifestation!.state).toBe('vanished');
			expect(affliction.hitBody()).toBeNull();
			expect(affliction.damage(10)).toBe(false);
			expect(affliction.health).toBe(m.health[0]);
			expect(affliction.strobe(lamp.state)).toBe(false);
			expect(affliction.forceVanish()).toBe(false);
			// Two together, one off on their own: it comes for the one alone.
			const pair = [
				prey('a', map.start),
				prey('b', [map.start[0] + 0.5, map.start[1], map.start[2]])
			];
			const [, far] = sightLine(10, 30, null);
			const alone = prey('alone', far);
			const players = [...pair, alone];
			for (const p of players) p.state.headlamp = 0;
			for (let t = 0; t < (m.vanish.seconds[1] + 0.1) * TICK_RATE; t++) {
				affliction.step(players);
				if (affliction.snapshot().manifestation!.state !== 'vanished') break;
			}
			const back = affliction.snapshot().manifestation!;
			expect(back.state).toBe('gathering');
			const d = (p: Prey) =>
				Math.hypot(back.position[0] - p.state.position[0], back.position[2] - p.state.position[2]);
			expect(d(alone)).toBeLessThan(d(pair[0]));
			run(affliction, m.vanish.returnSeconds + 0.1, players);
			expect(affliction.snapshot().manifestation!.state).toBe('hunting');
		});

		it('vanishes on its own now and then while it hunts', () => {
			const { affliction } = director();
			hunt(affliction);
			affliction['manifestation']!.vanishIn = m.vanish.every[1];
			const target = prey('far', [map.start[0] + 200, map.start[1], map.start[2]]);
			let vanished = false;
			for (let t = 0; t < (m.vanish.every[1] + 1) * TICK_RATE && !vanished; t++) {
				affliction.step([target]);
				vanished = affliction.snapshot().manifestation!.state === 'vanished';
			}
			expect(vanished).toBe(true);
		});
	});

	describe('how it closes in', () => {
		it('aims where you are heading, to cut you off', () => {
			const { affliction } = director();
			hunt(affliction);
			const [from, to] = sightLine(5, 9, false);
			const d = affliction['manifestation']!;
			d.position = [...from];
			d.path = [];
			const runner = prey('r', to);
			// Walking across its line, whichever way there is floor to walk on.
			const dx = to[0] - from[0];
			const dz = to[2] - from[2];
			const len = Math.hypot(dx, dz);
			const leads = [1, -1].map((s) => {
				runner.state.velocity = [(-dz / len) * s, 0, (dx / len) * s];
				d.tactic = 'close';
				const goal = affliction['goal'](d, runner, m.speed);
				return (
					(goal[0] - to[0]) * runner.state.velocity[0] +
					(goal[2] - to[2]) * runner.state.velocity[2]
				);
			});
			expect(Math.max(...leads)).toBeGreaterThan(0.5);
		});

		it('when the way round to you is far longer than the straight line, it circles to flank', () => {
			const { affliction } = director();
			hunt(affliction);
			const [from, to] = sightLine(4, 8, false);
			const d = affliction['manifestation']!;
			d.position = [...from];
			// A path that goes the long way round (a table between).
			d.path = [from, [from[0] + 20, from[1], from[2]], to];
			d.pathIndex = 1;
			affliction['goal'](d, prey('t', to), m.speed);
			expect(d.tactic).toBe('flank');
			// It keeps circling one way for a while, then closes in again.
			const side = d.side;
			d.path = [];
			for (let t = 0; t < (m.movement.flankSeconds - 0.2) * TICK_RATE; t++) {
				affliction['goal'](d, prey('t', to), m.speed);
			}
			expect(d.tactic).toBe('flank');
			expect(d.side).toBe(side);
			for (let t = 0; t < 0.4 * TICK_RATE; t++) affliction['goal'](d, prey('t', to), m.speed);
			expect(d.tactic).toBe('close');
		});

		it('never leaves the floor, even for a goal it has no way to (a ledge, across a drop)', () => {
			const { affliction } = director();
			hunt(affliction);
			const at = pin(affliction);
			const d = affliction['manifestation']!;
			// In the air above and beyond it: no floor there, no path.
			const goal: Vec3 = [at[0] + 6, at[1] + 4, at[2]];
			const onFloor = () => {
				const i = nearestPoint(map.nav, d.position, 0.6);
				return i >= 0 && Math.abs(map.nav.points[i].position[1] - d.position[1]) < 0.3;
			};
			for (let t = 0; t < 3 * TICK_RATE; t++) {
				affliction['move'](d, goal, map.start, m.unlitSpeed / TICK_RATE);
				expect(onFloor()).toBe(true);
			}
			// Where it aims is floor on its prey's level: never the floor under a drop or over a ledge.
			expect(affliction['snap'](at, at[1] + 4, 1.5)).toBeNull();
			expect(affliction['snap'](at, at[1], 1.5)![1]).toBeCloseTo(at[1], 0);
		});

		it('after a swing it may back off instead of pressing in', () => {
			const { affliction } = director('test-retreat');
			hunt(affliction);
			const at = pin(affliction);
			const v = still(victim(at));
			run(affliction, (m.body?.strikeSeconds ?? 1.2) + 0.05, [v]);
			const d = affliction['manifestation']!;
			expect(d.tactic).toBe('retreat');
			d.castCooldown = 1e9;
			run(affliction, m.strikeRecover + m.movement.retreatSeconds * 0.8, [v]);
			const gone = where(affliction);
			expect(Math.hypot(gone[0] - at[0], gone[2] - at[2])).toBeGreaterThan(1.5);
		});
	});
	it('admin banish resolves it at once', () => {
		const { affliction } = director();
		hunt(affliction);
		affliction.banish();
		expect(affliction.defeated).toBe(true);
		expect(affliction.snapshot().manifestation!.state).toBe('banished');
		expect(affliction.stun()).toBe(false);
	});

	it('once resolved: no meter, no omens, no gloom, and nothing more is summoned', () => {
		const { creatures, affliction } = director();
		hunt(affliction);
		affliction.setMeter(0.8);
		run(affliction, 0.05);
		affliction.banish();
		affliction.calm();
		expect(affliction.stage).toBe(0);
		expect(creatures.boldness).toBe(1);
		const player = prey('p', map.start);
		player.state.gloom = 0.5;
		const meter = affliction.meter;
		expect(run(affliction, 1, [player])).toEqual([]);
		expect(player.state.gloom).toBe(0);
		expect(affliction.meter).toBe(meter);
		expect(affliction.snapshot().calmed).toBe(true);
	});

	it('a training ground (no manifestation) takes a strobe and admin calls without throwing', () => {
		const { affliction } = director('rumors');
		expect(AFFLICTIONS.rumors.manifestation).toBeUndefined();
		const lamp = lampOn(map.start);
		expect(affliction.strobe(lamp.state)).toBe(false);
		expect(affliction.stun()).toBe(false);
		expect(affliction.hitBody()).toBeNull();
		expect(affliction.damage(10)).toBe(false);
		affliction.forceManifest([lamp]);
		expect(affliction.manifested).toBe(false);
		expect(run(affliction, 1, [lamp])).toEqual([]);
	});
});
