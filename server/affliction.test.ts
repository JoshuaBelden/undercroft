import { describe, expect, it } from 'vitest';
import { AFFLICTIONS } from '../src/lib/content/afflictions.ts';
import { TICK_RATE } from '../src/lib/shared/constants.ts';
import { addItem, newStack } from '../src/lib/shared/items/inventory.ts';
import { eyeHeight } from '../src/lib/shared/player/simulate.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';
import { AfflictionDirector, MANIFESTATION_ID } from './affliction.ts';
import { CreatureDirector } from './creatures.ts';
import { mapFixture, prey } from './testing/harness.ts';

const DEF = AFFLICTIONS.gloaming;
const m = DEF.manifestation;
const map = mapFixture(1);

function director() {
	const creatures = new CreatureDirector(map.world, map.nav, [], map.seed);
	const affliction = new AfflictionDirector(map.world, map.nav, creatures, map.seed, 'gloaming');
	return { creatures, affliction };
}

/** Run ticks with these players; returns every hit. */
function run(affliction: AfflictionDirector, seconds: number, players = [prey('p', map.start)]) {
	const hits = [];
	for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) hits.push(...affliction.step(players));
	return hits;
}

/** The manifestation's position (it is hunting once `hunt` has run). */
function where(affliction: AfflictionDirector): Vec3 {
	return affliction.snapshot().manifestation!.position;
}

/** Manifest it and wait out the gathering. */
function hunt(affliction: AfflictionDirector, players = [prey('far', map.start)]) {
	affliction.setMeter(1);
	run(affliction, m.gatherSeconds + 0.1, players);
	expect(affliction.snapshot().manifestation!.state).toBe('hunting');
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

	it('manifests at a full meter, far from everyone, and gathers before it hunts', () => {
		const { affliction } = director();
		expect(affliction.hitBody()).toBeNull();
		hunt(affliction);
		const at = where(affliction);
		expect(Math.hypot(at[0] - map.start[0], at[2] - map.start[2])).toBeGreaterThan(5);
		expect(affliction.hitBody()!.id).toBe(MANIFESTATION_ID);
	});

	it('comes for the nearest player, draining and striking them up close', () => {
		const { affliction } = director();
		hunt(affliction);
		// Stand right on top of it, lamp off.
		const at = where(affliction);
		const victim = prey('v', [at[0], at[1], at[2]]);
		victim.state.headlamp = 0;
		const hits = run(affliction, 2, [victim]);
		expect(hits.some((h) => !h.touch && h.playerId === 'v')).toBe(true);
		expect(hits.some((h) => h.touch)).toBe(true);
		expect(affliction.snapshot().manifestation!.strikes).toBeGreaterThan(0);
	});

	it('moves along the grid toward a player far away', () => {
		const { affliction } = director();
		hunt(affliction);
		const from = where(affliction);
		const target = prey('t', map.start);
		target.state.headlamp = 0;
		run(affliction, 3, [target]);
		const to = where(affliction);
		const before = Math.hypot(from[0] - map.start[0], from[2] - map.start[2]);
		const after = Math.hypot(to[0] - map.start[0], to[2] - map.start[2]);
		expect(after).toBeLessThan(before);
	});

	it('unlit, a hit only slows it; exposed, hits wear it down until it is banished', () => {
		const { affliction } = director();
		hunt(affliction);
		expect(affliction.exposed).toBe(false);
		expect(affliction.damage(m.health)).toBe(false);
		expect(affliction.banished).toBe(false);
		// Hold it in the open start room, and hold a lamp on its core from a metre away.
		const at: Vec3 = [...map.start];
		const core: Vec3 = [at[0], at[1] + m.hitHeight / 2, at[2]];
		const spot: Vec3 = [at[0] + 1, at[1], at[2]];
		const lamp = prey('lamp', spot);
		lamp.state.headlamp = 2;
		lamp.state.yaw = Math.atan2(-(core[0] - spot[0]), -(core[2] - spot[2]));
		lamp.state.pitch = Math.atan2(core[1] - spot[1] - eyeHeight(lamp.state), 1);
		for (let t = 0; t < TICK_RATE && !affliction.exposed; t++) {
			affliction['manifestation']!.position = [...at];
			affliction.step([lamp]);
		}
		expect(affliction.exposed).toBe(true);
		expect(affliction.damage(m.health / 2)).toBe(false);
		expect(affliction.damage(m.health)).toBe(true);
		expect(affliction.banished).toBe(true);
		expect(affliction.hitBody()).toBeNull();
		expect(affliction.damage(1)).toBe(false);
	});

	it('admin banish ends it at once', () => {
		const { affliction } = director();
		hunt(affliction);
		affliction.banish();
		expect(affliction.banished).toBe(true);
		expect(affliction.snapshot().manifestation!.state).toBe('banished');
	});

	it('the rite calms it: no meter, no omens, and a manifestation fades without banishing', () => {
		const { creatures, affliction } = director();
		hunt(affliction);
		affliction.calm();
		affliction.calm();
		expect(affliction.stage).toBe(0);
		expect(creatures.boldness).toBe(1);
		expect(affliction.banished).toBe(false);
		const player = prey('p', map.start);
		player.state.gloom = 0.5;
		const meter = affliction.meter;
		expect(run(affliction, 1, [player])).toEqual([]);
		expect(player.state.gloom).toBe(0);
		expect(affliction.meter).toBe(meter);
		expect(affliction.snapshot().calmed).toBe(true);
	});
});
