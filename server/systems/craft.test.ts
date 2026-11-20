import { describe, expect, it, vi } from 'vitest';
import { ITEMS } from '../../src/lib/content/items.ts';
import { CRAFT } from '../../src/lib/content/recipes.ts';
import { carriedCount, newStack } from '../../src/lib/shared/items/inventory.ts';
import type { Crate } from '../crates.ts';
import type { Session } from '../session.ts';
import { Diver, kit, useSessions } from '../testing/harness.ts';

/** Discovery, recipe fragments and field crafting in an expedition (docs/dev/crafting.md). */

const SEED = 1;
const open = useSessions();

function quiet(hooks = {}): Session {
	const session = open(SEED, hooks);
	session.admin('x', { kind: 'clearCreatures' });
	return session;
}

/** A plain crate holding these, all of it in sight, open in the diver's hands. */
function opened(session: Session, diver: Diver, ...items: string[]): Crate {
	const crate = session['crates'].list().find(({ crate }) => !crate.kind)!.crate;
	crate.slots = crate.slots.map((_, i) => (items[i] ? newStack(items[i]) : null));
	crate.hidden = new Set();
	// Right by it: a crate shuts on whoever walks off.
	diver.put(
		session['freeSpot']([crate.position[0], crate.position[1] + 0.05, crate.position[2] + 1])
	);
	crate.user = diver.id;
	diver.player.crate = crate.id;
	return crate;
}

describe('discovery', () => {
	it('what is in sight in an open lootable is discovered, once, and where is recorded', () => {
		const found = vi.fn();
		const session = quiet({ onDiscovered: found });
		const diver = new Diver(session);
		diver.player.discovered = new Set(['twine']);
		opened(session, diver, 'rags', 'twine', 'brick');
		diver.hold({}, 0.3);
		expect(found).toHaveBeenCalledWith(diver.player.owner, 'rags', 'crate');
		expect(found).toHaveBeenCalledWith(diver.player.owner, 'twine', 'crate');
		expect(found).not.toHaveBeenCalledWith(diver.player.owner, 'brick', 'crate');
		const told = diver.socket.all('discovered');
		expect(told.map((m) => m.item)).toEqual(['rags']);
		expect(told[0].recipes).toBeGreaterThan(0);
		expect(found.mock.calls.filter(([, item]) => item === 'rags')).toHaveLength(1);
	});

	it('a recipe fragment is read where it lies: it teaches an ingredient, and is gone', () => {
		const session = quiet();
		const diver = new Diver(session);
		diver.player.discovered = new Set(['wax']);
		const crate = opened(session, diver, 'recipe-fragment');
		session.systems.crates.loot(diver.player, crate, {
			kind: 'quick',
			from: { area: 'stash', index: 0 }
		});
		const read = diver.socket.last('fragment')!;
		expect(read.item).not.toBeNull();
		expect(diver.player.discovered.has(read.item!)).toBe(true);
		expect(crate.slots[0]).toBeNull();
		expect(carriedCount(diver.state.inventory, 'recipe-fragment')).toBe(0);
	});
});

describe('field crafting', () => {
	function crafter(session: Session, ...carried: [string, number?][]): Diver {
		const diver = new Diver(session, 'A', kit(...carried));
		diver.state.inventory.equipment.gear1 = newStack('crafting-kit');
		diver.state.headlamp = 2;
		diver.state.battery = 1;
		diver.player.discovered = new Set(['rags', 'metal']);
		return diver;
	}

	it('kneeling with the kit, a field recipe is made from what is carried, and the kit wears', () => {
		const session = quiet();
		const diver = crafter(session, ['rags', 4]);
		session.craft(diver.id, { recipe: 'bandage' });
		expect(diver.state.crafting).toBeGreaterThan(0);
		const hear = vi.spyOn(session['creatures'], 'hear');
		diver.hold({}, CRAFT.field.seconds + 0.3);
		expect(hear).toHaveBeenCalled();
		expect(diver.state.crafting).toBe(0);
		expect(carriedCount(diver.state.inventory, 'rags')).toBe(2);
		const bandage = [...diver.state.inventory.quick, ...diver.state.inventory.backpack].find(
			(s) => s?.item === 'bandage'
		);
		expect(bandage?.crafted).toBe(true);
		expect(diver.state.inventory.equipment.gear1?.worn).toBe(1);
		expect(diver.socket.last('crafted')).toMatchObject({ item: 'bandage', count: 1 });
	});

	it('moving or the dark stops it; nothing is used', () => {
		const session = quiet();
		const diver = crafter(session, ['rags', 4]);
		session.craft(diver.id, { recipe: 'bandage' });
		diver.hold({ moveZ: 1 }, 0.5);
		expect(diver.state.crafting).toBe(0);
		session.craft(diver.id, { recipe: 'bandage' });
		diver.state.headlamp = 0;
		diver.hold({}, CRAFT.field.seconds + 0.3);
		expect(carriedCount(diver.state.inventory, 'rags')).toBe(4);
	});

	it('without the kit, or a recipe not yet known, or a workshop recipe, nothing starts', () => {
		const session = quiet();
		const diver = crafter(session, ['rags', 8], ['twine', 4]);
		session.craft(diver.id, { recipe: 'coat' });
		expect(diver.state.crafting).toBe(0);
		session.craft(diver.id, { recipe: 'candle' });
		expect(diver.state.crafting).toBe(0);
		diver.state.inventory.equipment.gear1 = null;
		session.craft(diver.id, { recipe: 'bandage' });
		expect(diver.state.crafting).toBe(0);
	});

	it('a field repair gives back a share of one thing’s wear, for its materials', () => {
		const session = quiet();
		const diver = crafter(session, ['metal', 1]);
		const max = ITEMS.crowbar.durability!.max;
		diver.state.inventory.equipment.primary = { ...newStack('crowbar'), worn: max };
		session.craft(diver.id, { repair: { area: 'equipment', slot: 'primary' } });
		diver.hold({}, CRAFT.field.seconds + 0.3);
		expect(diver.state.inventory.equipment.primary?.worn).toBeCloseTo(
			max * (1 - CRAFT.fieldRepair)
		);
		expect(carriedCount(diver.state.inventory, 'metal')).toBe(0);
	});
});
