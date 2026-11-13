import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/lib/content/items.ts';
import { newStack } from '../src/lib/shared/items/inventory.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';
import { FLOOR, box, worldOf } from '../src/lib/shared/testing/maps.ts';
import { createPlayerState } from '../src/lib/shared/player/simulate.ts';
import { WorldItems } from './items.ts';

// A floor with a wall across it 2 m north of the origin.
const world = worldOf([FLOOR, box([0, 1.5, -2], [8, 3, 0.4])]);

function fly(items: WorldItems, creatures = [] as Parameters<WorldItems['stepProjectiles']>[0]) {
	const results = [];
	for (let i = 0; i < 100 && items.projectileSnapshots().length; i++) {
		results.push(...items.stepProjectiles(creatures));
	}
	return results;
}

describe('WorldItems', () => {
	it('places items on the floor below the point', () => {
		const items = new WorldItems(world);
		items.place(newStack('coins', 3), [1, 1.2, 1]);
		const [coins] = items.snapshots();
		expect(coins.position[1]).toBeCloseTo(0);
		expect(coins.count).toBe(3);
	});

	it('a drop lands in front, but never through a wall', () => {
		const items = new WorldItems(world);
		items.drop(newStack('knife'), [0, 1.5, 0], [1, 0, 0]);
		expect(items.snapshots()[0].position[0]).toBeCloseTo(0.7);
		items.drop(newStack('knife'), [0, 1.5, -1.6], [0, 0, -1]);
		expect(items.snapshots()[1].position[2]).toBeGreaterThan(-1.8);
	});

	it('dropping everything scatters it round the point', () => {
		const items = new WorldItems(world);
		items.dropAll([newStack('coins'), newStack('knife'), newStack('rosary')], [0, 0, 0]);
		const spots = items.snapshots().map((i) => `${i.position[0]},${i.position[2]}`);
		expect(new Set(spots).size).toBe(3);
	});

	it('picking up takes what fits and leaves the rest', () => {
		const items = new WorldItems(world);
		const big = ITEMS.coins.maxStack * 30;
		items.place(newStack('coins', big), [0, 0, 0]);
		const state = createPlayerState([0, 0, 0], 0);
		const item = items.lookedAt(state, [0, 1.6, 0.5], [0, -0.95, -0.3]);
		expect(item).not.toBeNull();
		expect(items.pickUp(state, item!)).toBe('coins');
		expect(items.snapshots()[0].count).toBeLessThan(big);
		expect(items.snapshots()[0].count).toBeGreaterThan(0);
	});

	it('a thrown brick lands with a noise', () => {
		const items = new WorldItems(world);
		items.launch(newStack('brick'), [0, 1.5, 0], [0.8, -0.6, 0], 'p');
		expect(items.projectileSnapshots()).toHaveLength(1);
		const results = fly(items);
		const land = results.find((r) => r.kind === 'land');
		expect(land).toMatchObject({ item: 'brick', noise: ITEMS.brick.throwable!.landNoise });
		expect(items.snapshots().some((i) => i.item === 'brick')).toBe(true);
	});

	it('a thrown brick hits a creature in its way, and drops at its feet', () => {
		const items = new WorldItems(world);
		items.launch(newStack('brick'), [0, 1.5, 0], [1, 0, 0], 'p');
		const creature = { id: 'c1', position: [1.5, 0, 0] as Vec3, height: 1.8, radius: 0.4 };
		const results = fly(items, [creature]);
		expect(results[0]).toMatchObject({ kind: 'hitCreature', creature: 'c1', thrower: 'p' });
		expect(results[0].kind === 'hitCreature' && results[0].damage).toBe(
			ITEMS.brick.throwable!.damage
		);
	});

	it('hangs a hint on a wall, facing out', () => {
		const items = new WorldItems(world);
		items.mount(newStack('clue'), [0, 1.5, -1.79], [0, 0, 1]);
		const [hint] = items.snapshots();
		expect(hint.normal).toEqual([0, 0, 1]);
		items.removeAll('clue');
		expect(items.snapshots()).toEqual([]);
		items.place(newStack('coins'), [0, 0, 0]);
		items.clear();
		expect(items.snapshots()).toEqual([]);
	});
});
