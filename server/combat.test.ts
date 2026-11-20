import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { GameEvent } from '../src/lib/shared/items/types.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';
import { createPlayerState } from '../src/lib/shared/player/simulate.ts';
import type { SimEvent } from '../src/lib/shared/player/types.ts';
import { addTestItems, removeTestItems } from '../src/lib/shared/testing/items.ts';
import { FLOOR, box, worldOf } from '../src/lib/shared/testing/maps.ts';
import type { AfflictionDirector } from './affliction.ts';
import { resolve, type CombatContext } from './combat.ts';
import type { CreatureBody, CreatureDirector, Prey } from './creatures.ts';
import { WorldItems } from './items.ts';

/** Resolving swings and shots: sweeps, piercing rounds, silent and slow ones, wounds and snags. */

beforeAll(() => addTestItems());
afterAll(() => removeTestItems());

// A floor, and a wall across the way 20 m north.
const world = worldOf([FLOOR, box([0, 1.5, -20], [10, 3, 0.4])]);

function body(id: string, x: number, z: number): CreatureBody {
	return { id, position: [x, 0, z], height: 1.8, radius: 0.35 };
}

/** A combat context with these creatures, recording what is done to them. */
function arena(bodies: CreatureBody[]) {
	const damage: { id: string; amount: number }[] = [];
	const bleeds: string[] = [];
	const creatures = {
		hitBodies: () => bodies.map((b) => ({ ...b })),
		damage: (id: string, amount: number) => {
			damage.push({ id, amount });
			return false;
		},
		bleed: (id: string) => {
			bleeds.push(id);
			return true;
		},
		hear: vi.fn()
	};
	const affliction = { hitBody: () => null, damage: () => false };
	const out: GameEvent[] = [];
	const ctx: CombatContext = {
		world,
		creatures: creatures as unknown as CreatureDirector,
		affliction: affliction as unknown as AfflictionDirector,
		items: new WorldItems(world),
		out
	};
	return { ctx, damage, bleeds, creatures, out };
}

const player: Prey = { id: 'p', state: createPlayerState([0, 0, 0], 0) };
const EYE: Vec3 = [0, 1.6, 0];
const NORTH: Vec3 = [0, 0, -1];

const swing = (item: string): SimEvent => ({ kind: 'swing', item, origin: EYE, direction: NORTH });
const shot = (item: string): SimEvent => ({
	kind: 'shot',
	item,
	origin: EYE,
	direction: NORTH,
	seed: 1,
	aimed: true
});

describe('swings', () => {
	it('a swing hits only the nearest; a sweep hits everything in its arc', () => {
		const two = () => [body('a', -0.5, -1.2), body('b', 0.5, -1.4)];
		const one = arena(two());
		resolve(one.ctx, player, [swing('knife')]);
		expect(one.damage.map((d) => d.id)).toEqual(['a']);
		const both = arena(two());
		resolve(both.ctx, player, [swing('test.spade')]);
		expect(both.damage.map((d) => d.id).sort()).toEqual(['a', 'b']);
	});

	it('a wound that bleeds sets the creature bleeding; a snag holds the weapon', () => {
		const a = arena([body('a', 0, -1.2)]);
		const p: Prey = { id: 'p', state: createPlayerState([0, 0, 0], 0) };
		resolve(a.ctx, p, [swing('test.club')]);
		expect(a.bleeds).toEqual(['a']);
		expect(a.out.some((e) => e.kind === 'bleed')).toBe(true);
		// Its snag chance is 1 in the test club.
		expect(p.state.weapon.snag).toBeGreaterThan(0);
		expect(a.out.some((e) => e.kind === 'snag')).toBe(true);
	});
});

describe('shots', () => {
	it('a round stops at the first creature; a piercing one goes through every one in line', () => {
		const line = () => [body('a', 0, -3), body('b', 0, -6)];
		const plain = arena(line());
		resolve(plain.ctx, player, [shot('revolver')]);
		expect(plain.damage.map((d) => d.id)).toEqual(['a']);
		const pierce = arena(line());
		resolve(pierce.ctx, player, [shot('test.rifle')]);
		expect(pierce.damage.map((d) => d.id)).toEqual(['a', 'b']);
	});

	it('a silent weapon is heard by nothing', () => {
		const loud = arena([]);
		resolve(loud.ctx, player, [shot('revolver')]);
		expect(loud.creatures.hear).toHaveBeenCalled();
		const quiet = arena([]);
		resolve(quiet.ctx, player, [shot('test.crossbow')]);
		expect(quiet.creatures.hear).not.toHaveBeenCalled();
	});

	it('a slow round flies, hits what is in its way, and drops to be picked up', () => {
		const a = arena([body('a', 0, -8)]);
		resolve(a.ctx, player, [shot('test.crossbow')]);
		// Nothing is hit at once: it is in flight.
		expect(a.damage).toEqual([]);
		expect(a.ctx.items.projectileSnapshots()).toHaveLength(1);
		const results = [];
		for (let i = 0; i < 60 && a.ctx.items.projectileSnapshots().length; i++) {
			results.push(...a.ctx.items.stepProjectiles(a.creatures.hitBodies()));
		}
		expect(results.some((r) => r.kind === 'hitCreature' && r.creature === 'a')).toBe(true);
		expect(a.ctx.items.snapshots().map((i) => i.item)).toEqual(['test.bolt']);
	});
});
