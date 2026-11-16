import { describe, expect, it } from 'vitest';
import { AFFLICTIONS } from '../src/lib/content/afflictions.ts';
import { TICK_RATE } from '../src/lib/shared/constants.ts';
import { addItem, newStack } from '../src/lib/shared/items/inventory.ts';
import { eyeHeight } from '../src/lib/shared/player/simulate.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';
import { AfflictionDirector, MANIFESTATION_ID, type AfflictionHit } from './affliction.ts';
import { CreatureDirector, type Prey } from './creatures.ts';
import { mapFixture, prey } from './testing/harness.ts';

const DEF = AFFLICTIONS.gloaming;
const m = DEF.manifestation;
const map = mapFixture(1);
const STUN = m.statuses.stunned!;

function director() {
	const creatures = new CreatureDirector(map.world, map.nav, [], map.seed);
	const affliction = new AfflictionDirector(map.world, map.nav, creatures, map.seed, 'gloaming');
	return { creatures, affliction };
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

	it('unlit, a hit only slows it; exposed, hits wear it down until it is banished and resolved', () => {
		const { creatures, affliction } = director();
		hunt(affliction);
		expect(affliction.exposed).toBe(false);
		expect(affliction.damage(m.health)).toBe(false);
		expect(affliction.defeated).toBe(false);
		const at = pin(affliction);
		const lamp = lampOn(at);
		let charged = 0;
		for (let t = 0; t < TICK_RATE && !affliction.exposed; t++) {
			pin(affliction);
			affliction.step([lamp]);
			charged = Math.max(charged, affliction.snapshot().manifestation!.charge);
		}
		// The light built up on it before it was exposed.
		expect(charged).toBe(1);
		expect(affliction.exposed).toBe(true);
		expect(affliction.damage(m.health / 2)).toBe(false);
		expect(affliction.damage(m.health)).toBe(true);
		expect(affliction.defeated).toBe(true);
		expect(affliction.calmed).toBe(true);
		expect(creatures.boldness).toBe(1);
		expect(affliction.stage).toBe(0);
		expect(affliction.hitBody()).toBeNull();
		expect(affliction.damage(1)).toBe(false);
		expect(affliction.snapshot().manifestation!.state).toBe('banished');
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
});
