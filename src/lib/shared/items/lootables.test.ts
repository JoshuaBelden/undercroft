import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../content/items.ts';
import { LOOTABLES, type LootableId } from '../../content/lootables.ts';
import { MAP_KIT } from '../../content/map/kit.ts';
import { PIECES } from '../map/pieces.generated.ts';
import { HAND } from '../player/types.ts';
import { wreck } from './durability.ts';
import { emptyInventory, newStack } from './inventory.ts';
import {
	bestWay,
	canUse,
	flavorOf,
	hasTool,
	lootableCentre,
	openable,
	wayNeeds,
	waysFor
} from './lootables.ts';

describe('the lootable data and the kit', () => {
	it('every room mix names lootables, on a piece with crate markers to put them on', () => {
		for (const [piece, entry] of Object.entries(MAP_KIT)) {
			if (!entry.lootables) continue;
			expect(PIECES[piece]?.crates.length, piece).toBeGreaterThan(0);
			for (const type of Object.keys(entry.lootables)) {
				expect(Object.hasOwn(LOOTABLES, type), `${piece}: ${type}`).toBe(true);
			}
		}
	});

	it('knows which kinds nothing in the game can open yet', () => {
		expect(openable(LOOTABLES.crate)).toBe(true);
		expect(openable(LOOTABLES.trunk)).toBe(true);
		expect(openable(LOOTABLES.sarcophagus)).toBe(true);
		// Lockpicks and sledgehammers come later.
		const picks = Object.values(ITEMS).some((def) => def.picks || def.smash);
		expect(openable(LOOTABLES.offeringBox)).toBe(picks);
	});
});

describe('opening', () => {
	const inv = () => emptyInventory();

	it('bare hands open what opens by hand', () => {
		const way = bestWay(LOOTABLES.niche.open, inv(), 'niche');
		expect(way?.tool).toBeUndefined();
	});

	it('a tool only counts in the hand, and not broken', () => {
		const pry = LOOTABLES.sarcophagus.open[0];
		const hands = inv();
		expect(canUse(pry, hands, 'sarcophagus')).toBe(false);
		hands.equipment.primary = newStack('crowbar');
		hands.selected = HAND.primary;
		expect(canUse(pry, hands, 'sarcophagus')).toBe(true);
		wreck(hands.equipment.primary);
		expect(canUse(pry, hands, 'sarcophagus')).toBe(false);
		hands.equipment.primary = newStack('crowbar');
		hands.equipment.secondary = newStack('knife');
		hands.selected = HAND.secondary;
		expect(canUse(pry, hands, 'sarcophagus')).toBe(false);
	});

	it('the fastest way that can be used is the one used', () => {
		const withKnife = inv();
		withKnife.equipment.primary = newStack('knife');
		const [slow, fast] = LOOTABLES.cocoon.open;
		expect(bestWay(LOOTABLES.cocoon.open, withKnife, 'cocoon')).toBe(fast);
		expect(bestWay(LOOTABLES.cocoon.open, inv(), 'cocoon')).toBe(slow);
		// The knife cuts cocoons, not anything else.
		expect(hasTool(ITEMS.knife, 'cut', 'cocoon')).toBe(true);
		expect(hasTool(ITEMS.knife, 'cut', 'crate' as LootableId)).toBe(false);
	});

	it('a key anywhere in the pack unlocks; nothing else for a trunk without picks or a hammer', () => {
		const ways = waysFor(LOOTABLES.trunk, true);
		const keyed = inv();
		keyed.backpack[3] = newStack('key');
		expect(bestWay(ways, keyed, 'trunk')?.key).toBe(true);
		expect(bestWay(ways, inv(), 'trunk')).toBeNull();
		// Not sealed (unlocked already): searched by hand.
		expect(bestWay(waysFor(LOOTABLES.trunk, false), inv(), 'trunk')?.tool).toBeUndefined();
	});

	it('says what a way takes', () => {
		expect(wayNeeds(LOOTABLES.sarcophagus.open[0])).toBe('a crowbar');
		expect(wayNeeds(LOOTABLES.trunk.sealed!.open[0])).toBe('a key');
		expect(wayNeeds(LOOTABLES.niche.open[0])).toBe('');
	});
});

describe('looking at one', () => {
	it('is looked at by its own middle', () => {
		const at = lootableCentre({ position: [1, 2, 3], kind: 'locker' });
		expect(at).toEqual([1, 2 + LOOTABLES.locker.lookHeight!, 3]);
		expect(lootableCentre({ position: [0, 0, 0] })[1]).toBe(LOOTABLES.crate.size[1] / 2);
	});

	it('has the same flavor line for everyone, by its id', () => {
		const def = LOOTABLES.niche;
		expect(flavorOf(def, 'c12')).toBe(flavorOf(def, 'c12'));
		expect(def.flavor).toContain(flavorOf(def, 'c7'));
	});
});
