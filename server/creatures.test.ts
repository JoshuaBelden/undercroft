import { describe, expect, it } from 'vitest';
import { CREATURES } from '../src/lib/content/creatures.ts';
import { TICK_RATE } from '../src/lib/shared/constants.ts';
import { gridDistances, nearestPoint } from '../src/lib/shared/map/nav.ts';
import { PIECES } from '../src/lib/shared/map/pieces.generated.ts';
import { creatureSpawns } from '../src/lib/shared/map/points.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';
import { CreatureDirector, type Prey } from './creatures.ts';
import { mapFixture, prey } from './testing/harness.ts';

const WITCH = CREATURES.witch;
const map = mapFixture(1);

function director(): CreatureDirector {
	return new CreatureDirector(map.world, map.nav, creatureSpawns(map.layout, PIECES), map.seed);
}

function run(creatures: CreatureDirector, seconds: number, players: Prey[] = []) {
	const hits = [];
	for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) hits.push(...creatures.step(players));
	return hits;
}

const mode = (creatures: CreatureDirector) => creatures.snapshots()[0]?.state;

/** One creature a few metres in front of a player standing at the start, facing it. */
function faceOff() {
	const creatures = director();
	const player = prey('p', map.start, 0);
	creatures.spawnNear(player.state);
	expect(creatures.count).toBe(1);
	return { creatures, player };
}

describe('CreatureDirector', () => {
	it('populates the map far from the start, spread out', () => {
		const creatures = director();
		creatures.populate(map.start);
		expect(creatures.count).toBeGreaterThanOrEqual(WITCH.spawn.count[0]);
		expect(creatures.count).toBeLessThanOrEqual(WITCH.spawn.count[1]);
		const distance = gridDistances(map.nav, [nearestPoint(map.nav, map.start)]);
		for (const { position } of creatures.bodies()) {
			expect(distance[nearestPoint(map.nav, position)]).toBeGreaterThanOrEqual(
				WITCH.spawn.minDistance - 1
			);
		}
		expect(creatures.snapshots().every((c) => c.state === 'patrol')).toBe(true);
	});

	it('an unknown kind spawns nothing', () => {
		const creatures = director();
		creatures.populate(map.start, 'no-such');
		creatures.spawnNear(prey('p', map.start).state, 'no-such');
		expect(creatures.spawnFar([map.start], 10, 'no-such')).toBe(false);
		expect(creatures.count).toBe(0);
	});

	it('chases a lit player in front of it and attacks when in reach', () => {
		const { creatures, player } = faceOff();
		const hits = run(creatures, 6, [player]);
		expect(hits.length).toBeGreaterThan(0);
		expect(hits[0]).toEqual({ playerId: 'p', damage: WITCH.attack.damage });
	});

	it('leaves the downed and the dead alone', () => {
		const { creatures, player } = faceOff();
		player.state.downed = true;
		expect(run(creatures, 4, [player])).toEqual([]);
	});

	it('a noise alerts it; it goes to look, lingers, then patrols again', () => {
		const creatures = director();
		const player = prey('p', map.start);
		creatures.spawnNear(player.state);
		const body = creatures.bodies()[0].position;
		run(creatures, 0.1);
		creatures.hear([body[0] + 2, body[1], body[2]], 10, null);
		expect(mode(creatures)).toBe('alert');
		// Hearing it again while waiting keeps it waiting.
		creatures.hear([body[0] + 2, body[1], body[2]], 10, null);
		run(creatures, WITCH.alert.maxWait);
		expect(mode(creatures)).toBe('investigate');
		run(creatures, WITCH.alert.linger + 6);
		expect(mode(creatures)).toBe('patrol');
	});

	it('a noise from a player close by sets it on them', () => {
		const creatures = director();
		const player = prey('p', map.start, Math.PI);
		player.state.headlamp = 0;
		creatures.spawnNear(prey('x', map.start, 0).state);
		creatures.hear(map.start, 30, player);
		expect(mode(creatures)).toBe('agro');
		// Too far or on another floor: not heard.
		const far = director();
		far.spawnNear(prey('x', map.start, 0).state);
		far.hear([map.start[0], map.start[1] + 20, map.start[2]], 30, player);
		expect(mode(far)).not.toBe('agro');
	});

	it('loses a player who gets away, and goes back to patrolling', () => {
		const { creatures, player } = faceOff();
		run(creatures, 0.5, [player]);
		expect(mode(creatures)).toBe('agro');
		// They vanish from where it can sense them.
		run(creatures, WITCH.perception.evadeTime + 1, []);
		expect(mode(creatures)).toBe('patrol');
	});

	it('a hard hit staggers it; enough damage kills it, and it comes back later far away', () => {
		const { creatures, player } = faceOff();
		const [body] = creatures.hitBodies();
		expect(creatures.damage(body.id, WITCH.stagger.threshold, player)).toBe(false);
		expect(creatures.snapshots()[0].state).toBe('agro');
		expect(creatures.damage('nobody', 10, null)).toBe(false);
		expect(creatures.damage(body.id, WITCH.health, player)).toBe(true);
		expect(creatures.damage(body.id, 10, player)).toBe(false);
		expect(creatures.kills).toBe(1);
		expect(creatures.hitBodies()).toHaveLength(0);
		// The corpse stays a while, then goes.
		run(creatures, WITCH.corpseTime + 0.5, [player]);
		expect(creatures.count).toBe(0);
		creatures['respawns'][0].left = 0.01;
		run(creatures, 0.1, [player]);
		expect(creatures.count).toBe(1);
		const back = creatures.bodies()[0].position;
		expect(Math.hypot(back[0] - map.start[0], back[2] - map.start[2])).toBeGreaterThan(5);
	});

	it('admin can kill or clear them all', () => {
		const creatures = director();
		creatures.populate(map.start);
		creatures.killAll();
		expect(creatures.hitBodies()).toHaveLength(0);
		expect(creatures.kills).toBeGreaterThan(0);
		creatures.clear();
		expect(creatures.count).toBe(0);
	});

	it('patrols on its own, wandering around', () => {
		const creatures = director();
		creatures.populate(map.start);
		const before: Vec3[] = creatures.bodies().map((b) => [...b.position]);
		run(creatures, 10);
		const after = creatures.bodies().map((b) => b.position);
		const moved = after.some((p, i) => Math.hypot(p[0] - before[i][0], p[2] - before[i][2]) > 1);
		expect(moved).toBe(true);
	});
});
