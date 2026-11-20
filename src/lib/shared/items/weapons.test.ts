import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../content/items.ts';
import { SIM_RATE } from '../constants.ts';
import { createPlayerState, idleFrame } from '../player/simulate.ts';
import { HAND, type InputFrame, type PlayerState, type SimEvent } from '../player/types.ts';
import { addItem, emptyInventory, newStack } from './inventory.ts';
import { EQUIP_TIME, THROW_DRAW as DRAW, THROW_FOLLOW, stepWeapon } from './weapons.ts';

const DT = 1 / SIM_RATE;
const EYE = 1.6;
const KNIFE = ITEMS.knife;

/** Steps in `seconds`. */
function steps(seconds: number): number {
	return Math.ceil(seconds * SIM_RATE);
}

/** Standing with these in hand, the first one drawn and ready. */
function holding(...items: string[]): PlayerState {
	const inv = emptyInventory();
	for (const item of items) addItem(inv, newStack(item));
	const s = createPlayerState([0, 0, 0], 0, inv);
	run(s, {}, steps(EQUIP_TIME) + 1);
	return s;
}

/** Run `frames` steps of the same input; what happened, in order. */
function run(s: PlayerState, input: Partial<InputFrame>, frames: number, able = true): SimEvent[] {
	const events: SimEvent[] = [];
	for (let i = 0; i < frames; i++) {
		stepWeapon(s, { ...idleFrame(i, s), ...input }, DT, able, EYE, events);
	}
	return events;
}

function kinds(events: SimEvent[]): string[] {
	return events.map((e) => e.kind);
}

describe('a knife: tap to stab, hold to throw', () => {
	it('a tap stabs when the wind-up is done, as quickly as before', () => {
		const s = holding('knife');
		const at: number[] = [];
		for (let i = 0; i < steps(1); i++) {
			const events = run(s, { attack: i < 3 }, 1);
			expect(kinds(events)).not.toContain('throw');
			if (events.length) at.push(i);
		}
		expect(at).toHaveLength(1);
		expect(Math.abs(at[0] - KNIFE.melee!.windup * SIM_RATE)).toBeLessThanOrEqual(1);
		expect(s.inventory.equipment.primary?.item).toBe('knife');
	});

	it('held, it draws back and never stabs; let go once drawn and it is thrown', () => {
		const s = holding('knife');
		const held = run(s, { attack: true }, steps(DRAW) + 30);
		expect(kinds(held)).toEqual([]);
		expect(s.weapon.action).toBe('draw');
		const thrown = run(s, {}, 1);
		expect(thrown).toMatchObject([{ kind: 'throw', item: 'knife', stack: { item: 'knife' } }]);
		expect(s.inventory.equipment.primary).toBeNull();
		expect(s.weapon.action).toBe('throw');
		run(s, {}, steps(THROW_FOLLOW) + 1);
		expect(s.weapon.action).toBe('equip');
	});

	it('let go before it is drawn and it stabs instead, at once', () => {
		const s = holding('knife');
		run(s, { attack: true }, steps(DRAW / 2));
		const events = run(s, {}, 2);
		expect(kinds(events)).toEqual(['swing']);
		expect(s.inventory.equipment.primary?.item).toBe('knife');
	});

	it('a crowbar has no throw: held, it swings again and again', () => {
		const s = holding('crowbar');
		const events = run(s, { attack: true }, steps(3));
		expect(kinds(events).filter((k) => k === 'swing').length).toBeGreaterThan(2);
		expect(kinds(events)).not.toContain('throw');
	});
});

describe('throwing', () => {
	it('a brick from the wheel is thrown, and the hand goes back to the weapon', () => {
		const s = holding('knife', 'brick');
		run(s, { select: HAND.quick }, steps(EQUIP_TIME) + 1);
		run(s, { attack: true }, steps(DRAW) + 1);
		const events = run(s, {}, 1);
		expect(events).toMatchObject([{ kind: 'throw', item: 'brick' }]);
		expect(s.inventory.quick[0]).toBeNull();
		expect(s.inventory.selected).toBe(HAND.primary);
		run(s, {}, steps(THROW_FOLLOW + EQUIP_TIME) + 2);
		expect(s.weapon.action).toBe('none');
	});

	it('aim throws nothing any more', () => {
		const s = holding('knife', 'brick');
		run(s, { select: HAND.quick }, steps(EQUIP_TIME) + 1);
		const events = run(s, { aim: true }, steps(1));
		events.push(...run(s, {}, steps(1)));
		expect(events).toEqual([]);
		expect(s.inventory.quick[0]?.item).toBe('brick');
	});

	it('opening the menu puts a drawn throw down, without a throw or a stab', () => {
		const s = holding('knife');
		run(s, { attack: true }, steps(DRAW) + 1);
		const events = run(s, { reading: true }, steps(1));
		expect(events).toEqual([]);
		expect(s.weapon.action).toBe('none');
		expect(s.inventory.equipment.primary?.item).toBe('knife');
	});

	it('taking something else in hand puts it down too', () => {
		const s = holding('knife', 'crowbar');
		run(s, { attack: true }, steps(DRAW) + 1);
		run(s, { attack: true, select: HAND.secondary }, 1);
		expect(s.weapon.action).toBe('equip');
		const events = run(s, {}, steps(1));
		expect(kinds(events)).not.toContain('throw');
		expect(s.inventory.equipment.primary?.item).toBe('knife');
	});

	it('not while unable (crawling, swimming): the draw is let go of', () => {
		const s = holding('knife');
		run(s, { attack: true }, steps(DRAW) + 1);
		const events = run(s, {}, steps(1), false);
		expect(events).toEqual([]);
		expect(s.weapon.action).toBe('none');
	});
});

describe('wear and broken weapons', () => {
	it('every shot wears the gun, and the one that breaks it still goes off', () => {
		const s = holding('revolver');
		const gun = s.inventory.equipment.primary!;
		gun.loaded = 6;
		gun.worn = ITEMS.revolver.durability!.max - 1;
		const events = run(s, { attack: true }, 1);
		expect(kinds(events)).toEqual(['broke', 'shot']);
		expect(gun.worn).toBe(ITEMS.revolver.durability!.max);
		expect(gun.loaded).toBe(5);
	});

	it('a broken gun only dry-clicks: no shot, no reload', () => {
		const s = holding('revolver', 'ammo.revolver');
		const gun = s.inventory.equipment.primary!;
		gun.loaded = 3;
		gun.worn = ITEMS.revolver.durability!.max;
		const events = [
			...run(s, { attack: true }, 1),
			...run(s, {}, 1),
			...run(s, { reload: true }, 1)
		];
		expect(kinds(events)).toEqual(['empty']);
		expect(gun.loaded).toBe(3);
		expect(s.weapon.action).toBe('none');
	});

	it('a broken blade neither swings nor is thrown', () => {
		const s = holding('knife');
		s.inventory.equipment.primary!.worn = ITEMS.knife.durability!.max;
		const events = run(s, { attack: true }, steps(DRAW) + 30);
		expect(events).toEqual([]);
		expect(s.weapon.action).toBe('none');
		expect(s.inventory.equipment.primary?.item).toBe('knife');
	});
});
