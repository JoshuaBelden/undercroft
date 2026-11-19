import { describe, expect, it } from 'vitest';
import { ATTRACTION, type Movement } from '../src/lib/content/attraction.ts';
import { CREATURES } from '../src/lib/content/creatures.ts';
import { TICK_RATE } from '../src/lib/shared/constants.ts';
import { gridDistances, nearestPoint, reachFilter } from '../src/lib/shared/map/nav.ts';
import { PIECES } from '../src/lib/shared/map/pieces.generated.ts';
import { creatureSpawns } from '../src/lib/shared/map/points.ts';
import type { HeadlampMode } from '../src/lib/shared/player/types.ts';
import { Attraction, type Contributor } from './attraction.ts';
import { CreatureDirector, type Prey } from './creatures.ts';
import { mapFixture, prey } from './testing/harness.ts';

const map = mapFixture(1);

function explorer(id: string, lamp: HeadlampMode, movement: Movement): Contributor {
	const { state } = prey(id, map.start);
	state.headlamp = lamp;
	return { id, state, movement };
}

/** Step the meters for some seconds; every draw made along the way. */
function run(attraction: Attraction, seconds: number, explorers: Contributor[], boldness = 1) {
	const draws = [];
	for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
		draws.push(...attraction.step(explorers, boldness));
	}
	return draws;
}

describe('Attraction', () => {
	it('a bright lamp fills the light meter, low holds it, and off drains it', () => {
		const a = new Attraction();
		const lamp = explorer('p', 2, 'still');
		run(a, 10, [lamp]);
		expect(a.levels.light).toBeCloseTo(10 * ATTRACTION.light.bright, 0);
		lamp.state.headlamp = 1;
		run(a, 10, [lamp]);
		expect(a.levels.light).toBeCloseTo(10, 0);
		lamp.state.headlamp = 0;
		run(a, 3, [lamp]);
		expect(a.levels.light).toBeCloseTo(10 + 3 * ATTRACTION.light.off, 0);
		run(a, 30, [lamp]);
		expect(a.levels.light).toBe(0);
		// A flat battery is a lamp off.
		lamp.state.headlamp = 2;
		lamp.state.battery = 0;
		run(a, 5, [lamp]);
		expect(a.levels.light).toBe(0);
	});

	it('sprinting fills the noise meter faster than walking; keeping still drains it', () => {
		const walk = new Attraction();
		const sprint = new Attraction();
		run(walk, 10, [explorer('p', 1, 'walk')]);
		run(sprint, 10, [explorer('p', 1, 'sprint')]);
		expect(sprint.levels.noise).toBeGreaterThan(walk.levels.noise * 2);
		run(sprint, 10, [explorer('p', 1, 'still')]);
		expect(sprint.levels.noise).toBeLessThan(40 - 15);
		// Crouching holds it.
		const held = sprint.levels.noise;
		run(sprint, 10, [explorer('p', 1, 'crouch')]);
		expect(sprint.levels.noise).toBeCloseTo(held, 5);
	});

	it('one crate opening is not enough, but a few gunshots are', () => {
		const a = new Attraction();
		const p = explorer('p', 1, 'crouch');
		a.heard(6, map.start, null);
		expect(a.step([p])).toEqual([]);
		for (let i = 0; i < 3; i++) a.heard(35, map.start, 'p');
		expect(a.step([p])).toEqual([{ meter: 'noise', player: 'p' }]);
		// Once answered, it starts again from nothing.
		a.reset('noise');
		expect(a.levels.noise).toBe(0);
	});

	it('one explorer fills it alone; a bigger party needs more, but fills it faster', () => {
		const solo = new Attraction();
		const draws = run(solo, ATTRACTION.light.threshold + 1, [explorer('p', 2, 'crouch')]);
		expect(draws[0]).toEqual({ meter: 'light', player: 'p' });
		const party = new Attraction();
		const four = ['a', 'b', 'c', 'd'].map((id) => explorer(id, 2, 'crouch'));
		run(party, 1, four);
		expect(party.threshold('light')).toBeGreaterThan(solo.threshold('light'));
		const seconds = party.threshold('light') / 4;
		expect(seconds).toBeLessThan(ATTRACTION.light.threshold);
	});

	it('draws to whoever added the most', () => {
		const a = new Attraction();
		const quiet = explorer('quiet', 1, 'walk');
		const loud = explorer('loud', 1, 'sprint');
		const draws = run(a, 30, [quiet, loud]);
		expect(draws[0]).toEqual({ meter: 'noise', player: 'loud' });
	});

	it('omens make what fills it fill faster', () => {
		const calm = new Attraction();
		const bold = new Attraction();
		run(calm, 10, [explorer('p', 2, 'walk')]);
		run(bold, 10, [explorer('p', 2, 'walk')], 1.5);
		expect(bold.levels.light).toBeCloseTo(calm.levels.light * 1.5, 1);
		expect(bold.levels.noise).toBeCloseTo(calm.levels.noise * 1.5, 1);
	});

	it('a draw that found nowhere stays full and waits before trying again', () => {
		const a = new Attraction();
		a.fill('light');
		const p = explorer('p', 0, 'still');
		expect(run(a, 0.05, [p])).toHaveLength(1);
		a.hold('light');
		// Held full, even with the lamp off.
		expect(run(a, ATTRACTION.retry - 0.5, [p])).toEqual([]);
		expect(a.fraction('light')).toBe(1);
		expect(run(a, 1, [p]).length).toBeGreaterThan(0);
	});
});

describe('Attraction in the CreatureDirector', () => {
	const WITCH = CREATURES.witch;

	function director(): CreatureDirector {
		return new CreatureDirector(map.world, map.nav, creatureSpawns(map.layout, PIECES), map.seed);
	}

	function step(creatures: CreatureDirector, seconds: number, players: Prey[]) {
		for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) creatures.step(players);
	}

	it('a full meter brings a witch a few metres off, coming to look; the meter starts again', () => {
		const creatures = director();
		const player = prey('p', map.start, 0);
		player.state.headlamp = 0;
		creatures.attraction.fill('noise');
		step(creatures, 0.05, [player]);
		expect(creatures.alive('witch')).toBe(1);
		expect(creatures.snapshots()[0].state).toBe('investigate');
		expect(creatures.attraction.levels.noise).toBe(0);
		const allow = reachFilter(WITCH.reach);
		const from = nearestPoint(map.nav, map.start, 2, allow);
		const distance = gridDistances(map.nav, [from], false, allow);
		const at = nearestPoint(map.nav, creatures.bodies()[0].position, 1);
		expect(distance[at]).toBeGreaterThanOrEqual(ATTRACTION.distance[0] - 0.5);
		expect(distance[at]).toBeLessThanOrEqual(ATTRACTION.distance[1] + 0.5);
	});

	it('no more than the cap: at it, the nearest one goes to look, and the meter still resets', () => {
		const creatures = director();
		const player = prey('p', map.start, 0);
		player.state.headlamp = 0;
		creatures.attraction.fill('noise');
		step(creatures, 0.05, [player]);
		// Solo: one at a time.
		creatures.attraction.fill('light');
		step(creatures, 0.05, [player]);
		expect(creatures.alive('witch')).toBe(1);
		expect(creatures.attraction.levels.light).toBe(0);
		// A second explorer: room for another.
		const other = prey('q', map.start, 0);
		other.state.headlamp = 0;
		creatures.attraction.fill('light');
		step(creatures, 0.05, [player, other]);
		expect(creatures.alive('witch')).toBe(2);
	});

	it('nothing is drawn in while the party is quiet and dark', () => {
		const creatures = director();
		const player = prey('p', map.start, 0);
		player.state.headlamp = 1;
		step(creatures, 120, [player]);
		expect(creatures.alive('witch')).toBe(0);
	});
});
