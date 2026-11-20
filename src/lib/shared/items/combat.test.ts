import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ITEMS } from '../../content/items.ts';
import { SIM_RATE } from '../constants.ts';
import { createPlayerState, idleFrame, stepPlayer } from '../player/simulate.ts';
import { HAND, type InputFrame, type PlayerState, type SimEvent } from '../player/types.ts';
import { FLOOR, box, worldOf } from '../testing/maps.ts';
import { addTestItems, removeTestItems } from '../testing/items.ts';
import { addItem, emptyInventory, newStack } from './inventory.ts';
import { flightPath } from './projectile.ts';
import { EQUIP_TIME, THROW_DRAW, canUseHeld, stepWeapon } from './weapons.ts';

/** The combat mechanics of the shared simulation (docs/dev/combat.md). */

beforeAll(() => addTestItems());
afterAll(() => removeTestItems());

const DT = 1 / SIM_RATE;
const steps = (seconds: number) => Math.ceil(seconds * SIM_RATE);

function holding(...items: string[]): PlayerState {
	const inv = emptyInventory();
	for (const item of items) addItem(inv, newStack(item, 1, 6));
	const s = createPlayerState([0, 0, 0], 0, inv);
	run(s, {}, steps(EQUIP_TIME) + 1);
	return s;
}

function run(s: PlayerState, input: Partial<InputFrame>, frames: number, able = true): SimEvent[] {
	const events: SimEvent[] = [];
	for (let i = 0; i < frames; i++)
		stepWeapon(s, { ...idleFrame(i, s), ...input }, DT, able, 1.6, events);
	return events;
}

const kinds = (events: SimEvent[]) => events.map((e) => e.kind);

describe('stamina per swing', () => {
	it('each swing costs its stamina', () => {
		const s = holding('crowbar');
		const before = s.stamina;
		run(s, { attack: true }, 1);
		expect(s.weapon.action).toBe('swing');
		expect(s.stamina).toBe(before - ITEMS.crowbar.melee!.stamina!);
	});

	it('a tap with a knife (drawn back, let go early) pays for its swing too', () => {
		const s = holding('knife');
		const before = s.stamina;
		run(s, { attack: true }, 3);
		run(s, {}, 1);
		expect(s.weapon.action).toBe('swing');
		expect(s.stamina).toBe(before - ITEMS.knife.melee!.stamina!);
	});

	it('with too little left it gasps instead, once a press', () => {
		const s = holding('test.sledge');
		s.stamina = 15;
		const events = run(s, { attack: true }, 10);
		expect(kinds(events)).toEqual(['winded']);
		expect(s.weapon.action).toBe('none');
		expect(s.stamina).toBe(15);
	});

	it('five sledge swings empty a full bar', () => {
		const s = holding('test.sledge');
		let swings = 0;
		for (let i = 0; i < 10; i++) {
			const events = run(s, { attack: true }, 1);
			if (s.weapon.action === 'swing') swings++;
			run(s, {}, steps(1));
			if (kinds(events).includes('winded')) break;
		}
		// Stamina comes back between swings a little; never more than a few blows.
		expect(swings).toBeGreaterThanOrEqual(5);
		expect(swings).toBeLessThan(10);
	});

	it('infinite stamina (admin) never runs out', () => {
		const s = holding('test.sledge');
		s.flags.infiniteStamina = true;
		s.stamina = 0;
		run(s, { attack: true }, 1);
		expect(s.weapon.action).toBe('swing');
	});
});

describe('a snag', () => {
	it('while snagged, the weapon will not swing; then it does', () => {
		const s = holding('test.club');
		s.weapon.snag = 0.5;
		run(s, { attack: true }, steps(0.3));
		expect(s.weapon.action).toBe('none');
		run(s, { attack: true }, steps(0.4));
		expect(['swing', 'none']).toContain(s.weapon.action);
		expect(s.weapon.snag).toBe(0);
	});
});

describe('setting something down', () => {
	const place = () => {
		const s = holding('test.snare');
		s.inventory.selected = HAND.quick;
		run(s, {}, steps(EQUIP_TIME) + 1);
		return s;
	};

	it('held still for its seconds, it is set down and one is spent', () => {
		const s = place();
		const events = run(s, { attack: true }, steps(ITEMS['test.snare'].place!.seconds) + 2);
		expect(kinds(events)).toEqual(['place']);
		expect(s.inventory.quick[0]).toBeNull();
	});

	it('moving, or letting go, and it is not', () => {
		const s = place();
		expect(kinds(run(s, { attack: true }, 10))).toEqual([]);
		expect(kinds(run(s, { attack: true, moveZ: 1 }, steps(2)))).toEqual([]);
		expect(kinds(run(s, {}, steps(2)))).toEqual([]);
		expect(s.inventory.quick[0]).not.toBeNull();
	});
});

describe('a throw put down', () => {
	it('aim, while it is drawn back, puts it down: no throw, no swing', () => {
		const s = holding('knife');
		run(s, { attack: true }, steps(THROW_DRAW) + 2);
		expect(s.weapon.action).toBe('draw');
		const events = run(s, { attack: true, aim: true }, 1);
		expect(events).toEqual([]);
		expect(s.weapon.action).toBe('none');
		expect(kinds(run(s, {}, steps(1)))).toEqual([]);
		expect(s.inventory.equipment.primary?.item).toBe('knife');
	});
});

describe('what works crawling, squeezed or down', () => {
	it('most things need room; cramped ones work crawling and squeezed', () => {
		const knife = holding('knife');
		expect(canUseHeld(knife, true, false)).toBe(true);
		expect(canUseHeld(knife, true, true)).toBe(false);
		const spear = holding('test.spear');
		expect(canUseHeld(spear, true, true)).toBe(true);
		// Swimming, mantling or busy: nothing.
		expect(canUseHeld(spear, false, true)).toBe(false);
	});

	it('down, only something made for it', () => {
		const knife = holding('knife');
		knife.downed = true;
		expect(canUseHeld(knife, true, false)).toBe(false);
		const derringer = holding('test.derringer');
		derringer.downed = true;
		expect(canUseHeld(derringer, false, false)).toBe(true);
	});
});

describe('too heavy to sprint with', () => {
	const world = worldOf([FLOOR]);
	const sprint = (item: string) => {
		const s = holding(item);
		for (let i = 0; i < steps(1); i++) {
			stepPlayer(s, { ...idleFrame(i, s), moveZ: 1, sprint: true }, world, DT);
		}
		return Math.hypot(s.velocity[0], s.velocity[2]);
	};

	it('a sledgehammer in the hand keeps you to a walk', () => {
		expect(sprint('test.sledge')).toBeLessThan(sprint('knife') - 0.5);
	});
});

describe('flight', () => {
	// A floor, and a wall across the way 8 m north.
	const world = worldOf([FLOOR, box([0, 1.5, -8], [10, 3, 0.4])]);

	it('a lobbed throw comes down on the floor in front', () => {
		const { points, landing } = flightPath(world, [0, 1.6, 0], [0, 0, -1], 6, 1.5);
		expect(landing).not.toBeNull();
		expect(landing![1]).toBeLessThan(0.2);
		expect(landing![2]).toBeLessThan(-1);
		expect(landing![2]).toBeGreaterThan(-8);
		expect(points.length).toBeGreaterThan(3);
	});

	it('a hard one stops at the wall', () => {
		const { landing } = flightPath(world, [0, 1.6, 0], [0, 0.1, -1], 30, 0);
		expect(landing![2]).toBeGreaterThan(-8);
		expect(landing![2]).toBeLessThan(-7.5);
	});

	it('aimed at the sky with no ceiling, it comes down in the end or never (no landing)', () => {
		const open = worldOf([]);
		expect(flightPath(open, [0, 1.6, 0], [0, 1, 0], 5, 0).landing).toBeNull();
	});
});
