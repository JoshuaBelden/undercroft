import { describe, expect, it } from 'vitest';
import { CREATURES, creatureHealth, type CreatureDef } from '../src/lib/content/creatures.ts';
import { TICK_RATE } from '../src/lib/shared/constants.ts';
import { gridDistances, nearestPoint, reachFilter } from '../src/lib/shared/map/nav.ts';
import { PIECES } from '../src/lib/shared/map/pieces.generated.ts';
import { creatureSpawns } from '../src/lib/shared/map/points.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';
import { CreatureDirector, type Prey } from './creatures.ts';
import { mapFixture, prey } from './testing/harness.ts';

const WITCH = CREATURES.witch;
const map = mapFixture(1);

/** Run with a test-only kind in CREATURES. */
function withKind(def: CreatureDef, test: () => void): void {
	CREATURES[def.id] = def;
	try {
		test();
	} finally {
		delete CREATURES[def.id];
	}
}

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
	it('scatters a kind in groups far from the start; none are drawn in at the start', () => {
		withKind(
			{
				...WITCH,
				id: 'crowd',
				spawn: {
					kind: 'scatter',
					groups: [3, 3],
					size: [2, 2],
					spread: 4,
					minDistance: 25,
					where: 'corner'
				}
			},
			() => {
				const creatures = director();
				creatures.populate(map.start);
				// Witches come only when drawn in (server/attraction.ts).
				expect(creatures.alive('witch')).toBe(0);
				expect(creatures.alive('crowd')).toBe(6);
				const distance = gridDistances(map.nav, [nearestPoint(map.nav, map.start)], true);
				const bodies = creatures.bodies();
				for (const { position } of bodies) {
					expect(distance[nearestPoint(map.nav, position)]).toBeGreaterThanOrEqual(25 - 5);
				}
				// Each one has a partner close by.
				for (const a of bodies) {
					const near = bodies.filter(
						(b) =>
							b !== a &&
							Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]) < 5
					);
					expect(near.length).toBeGreaterThan(0);
				}
				expect(creatures.snapshots().every((c) => c.state === 'patrol')).toBe(true);
			}
		);
	});

	it('a kind with no chance never appears', () => {
		withKind(
			{
				...WITCH,
				id: 'never',
				spawn: {
					kind: 'scatter',
					groups: [3, 3],
					size: [1, 1],
					spread: 4,
					minDistance: 0,
					chance: 0,
					where: 'anywhere'
				}
			},
			() => {
				const creatures = director();
				creatures.populate(map.start);
				expect(creatures.count).toBe(0);
			}
		);
	});

	it('an unknown kind spawns nothing', () => {
		const creatures = director();
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

	it("a hit carries its kind's condition", () => {
		withKind(
			{ ...WITCH, id: 'venomous', attack: { ...WITCH.attack, condition: { id: 'hobble' } } },
			() => {
				const creatures = director();
				const player = prey('p', map.start, 0);
				creatures.spawnNear(player.state, 'venomous');
				const hits = run(creatures, 6, [player]);
				expect(hits[0]?.condition).toEqual({ id: 'hobble' });
			}
		);
	});

	it('never follows someone into a crawl, a squeeze or water', () => {
		const allow = reachFilter(WITCH.reach);
		expect(allow).toBeDefined();
		const low = map.nav.points.findIndex((p) => p.clearance === 'crawl' && !p.water);
		expect(low).toBeGreaterThanOrEqual(0);
		const creatures = director();
		// Someone lying in the crawl, and the witch close by outside it, set on them.
		const player = prey('p', map.nav.points[low].position, 0);
		player.state.headlamp = 2;
		const outside = nearestPoint(map.nav, player.state.position, 8, allow);
		expect(outside).toBeGreaterThanOrEqual(0);
		creatures.spawnNear(prey('x', map.nav.points[outside].position, 0).state);
		creatures.damage(creatures.hitBodies()[0].id, 1, player);
		for (let i = 0; i < 8 * TICK_RATE; i++) {
			creatures.step([player]);
			const at = nearestPoint(map.nav, creatures.bodies()[0].position, 0.5);
			if (at >= 0) expect(allow?.(map.nav.points[at])).toBe(true);
		}
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
		// Hunting them: chasing, or already striking if it spawned close enough.
		expect(['agro', 'attack']).toContain(mode(creatures));
		// They vanish from where it can sense them.
		run(creatures, WITCH.perception.evadeTime + 1, []);
		expect(mode(creatures)).toBe('patrol');
	});

	it('a hard hit staggers it; enough damage kills it, and it never comes back', () => {
		const { creatures, player } = faceOff();
		const [body] = creatures.hitBodies();
		expect(creatures.damage(body.id, WITCH.stagger.threshold, player)).toBe(false);
		expect(creatures.snapshots()[0].state).toBe('agro');
		expect(creatures.damage('nobody', 10, null)).toBe(false);
		expect(creatures.damage(body.id, WITCH.health[0], player)).toBe(true);
		expect(creatures.damage(body.id, 10, player)).toBe(false);
		expect(creatures.kills).toBe(1);
		expect(creatures.hitBodies()).toHaveLength(0);
		// The corpse stays a while, then goes.
		run(creatures, WITCH.corpseTime + 0.5, [player]);
		expect(creatures.count).toBe(0);
		run(creatures, 400, [player]);
		expect(creatures.count).toBe(0);
	});

	it('a strobe stuns one vulnerable to it (by its own reaction), and not the others', () => {
		// A test-only kind: no creature in the game is vulnerable to strobe yet.
		CREATURES.dazzled = {
			...WITCH,
			id: 'dazzled',
			vulnerable: ['strobe'],
			statuses: { stunned: { seconds: 1, immunity: 3 } }
		};
		try {
			const creatures = director();
			const player = prey('p', map.start, 0);
			player.state.headlamp = 2;
			creatures.spawnNear(player.state, 'dazzled');
			creatures.spawnNear(player.state);
			const [dazzled, witch] = creatures.hitBodies();
			expect(creatures.strobe(player.state)).toBe(1);
			expect(creatures.stunned(dazzled.id)).toBe(true);
			expect(creatures.stunned(witch.id)).toBe(false);
			// It stands where it is, reeling, while stunned.
			const at = [...creatures.bodies()[0].position];
			run(creatures, 0.9, [player]);
			const still = creatures.bodies()[0].position;
			expect(Math.hypot(still[0] - at[0], still[2] - at[2])).toBeLessThan(0.05);
			expect(creatures.snapshots()[0].anim).toBe('take_damage');
			run(creatures, 0.2, [player]);
			expect(creatures.stunned(dazzled.id)).toBe(false);
			// Immune for its own while after.
			expect(creatures.strobe(player.state)).toBe(0);
			run(creatures, 3.1, []);
			// Patrolling meanwhile, it may have walked out of the beam (that depends on the map): put
			// it back where it was, so only the immunity is tested.
			creatures.bodies()[0].position.splice(0, 3, ...at);
			expect(creatures.strobe(player.state)).toBe(1);
			// A lamp turned away from it lights nothing.
			run(creatures, 4.2, []);
			player.state.yaw = Math.PI;
			expect(creatures.strobe(player.state)).toBe(0);
		} finally {
			delete CREATURES.dazzled;
		}
	});

	it('takes more killing the bigger the party: 240 solo, 290 for two, 340 for three or more', () => {
		expect([1, 2, 3, 4, 0].map((n) => creatureHealth(WITCH, n))).toEqual([240, 290, 340, 340, 240]);
		const { creatures, player } = faceOff();
		const [body] = creatures.hitBodies();
		expect(creatures.damage(body.id, 230, player)).toBe(false);
		// Someone else arrived after it spawned: it is as tough as a party of two makes it.
		creatures.party = 2;
		expect(creatures.damage(body.id, 30, player)).toBe(false);
		expect(creatures.damage(body.id, 25, player)).toBe(false);
		expect(creatures.damage(body.id, 5, player)).toBe(true);
	});

	it('admin can kill or clear them all', () => {
		const creatures = director();
		creatures.spawnNear(prey('p', map.start, 0).state);
		creatures.spawnNear(prey('p', map.start, Math.PI).state);
		creatures.killAll();
		expect(creatures.hitBodies()).toHaveLength(0);
		expect(creatures.kills).toBeGreaterThan(0);
		creatures.clear();
		expect(creatures.count).toBe(0);
	});

	it('patrols on its own, wandering around', () => {
		const creatures = director();
		creatures.spawnNear(prey('p', map.start, 0).state);
		const before: Vec3[] = creatures.bodies().map((b) => [...b.position]);
		run(creatures, 10);
		const after = creatures.bodies().map((b) => b.position);
		const moved = after.some((p, i) => Math.hypot(p[0] - before[i][0], p[2] - before[i][2]) > 1);
		expect(moved).toBe(true);
	});
});
