import { describe, expect, it, vi } from 'vitest';
import { CRAFT } from '../../src/lib/content/recipes.ts';
import { carriedCount, newStack } from '../../src/lib/shared/items/inventory.ts';
import { emptyRecord } from '../../src/lib/shared/quests/engine.ts';
import type { QuestRecord } from '../../src/lib/shared/quests/types.ts';
import { upTo } from '../../src/lib/shared/testing/quests.ts';
import type { Session } from '../session.ts';
import { Diver, kit, useSessions } from '../testing/harness.ts';

/** Quests below (docs/dev/quests.md): what is done down here moves them on, and is kept at once. */

const open = useSessions();

function quiet(hooks = {}, affliction = 'gloaming'): Session {
	const session = open(1, hooks, affliction);
	session.admin('x', { kind: 'clearCreatures' });
	return session;
}

function questing(session: Session, name: string, record: QuestRecord | null, inventory = kit()) {
	const diver = new Diver(session, name, inventory);
	session.systems.quests.set(diver.player, record ? { record, resolved: [] } : null);
	return diver;
}

describe('quests below', () => {
	it('a search counts for everyone down here, and each change is kept at once', () => {
		const kept = vi.fn();
		const session = quiet({ onQuests: kept });
		const a = questing(session, 'A', upTo('moved-dead'));
		const b = questing(session, 'B', upTo('moved-dead'));
		const crate = session['crates'].list()[0].crate;
		session.systems.quests.count([
			{ kind: 'crateOpen', id: crate.id, player: a.id, position: crate.position }
		]);
		for (const diver of [a, b]) {
			expect(session.systems.quests.of(diver.player)!.record.quests['moved-dead'].counts).toEqual([
				1
			]);
			const told = diver.socket.last('quests')!;
			expect(told.quests.find((q) => q.id === 'moved-dead')!.objectives[0].count).toBe(1);
		}
		expect(kept).toHaveBeenCalledWith(a.player.owner, expect.anything());
		expect(kept).toHaveBeenCalledWith(b.player.owner, expect.anything());
	});

	it('getting out counts only for whoever got out', () => {
		const kept = vi.fn();
		const session = quiet({ onQuests: kept }, 'rumors');
		const a = questing(session, 'A', emptyRecord());
		questing(session, 'B', emptyRecord());
		const owner = a.player.owner;
		a.state.extracted = true;
		session['leaving']();
		const record = kept.mock.calls.find(([o]) => o === owner)![1] as QuestRecord;
		expect(record.quests.fontaine.counts).toEqual([1]);
		expect(kept.mock.calls.some(([o]) => o !== owner)).toBe(false);
	});

	it('reaching a level counts once', () => {
		const kept = vi.fn();
		const session = quiet({ onQuests: kept });
		const a = questing(session, 'A', upTo('carters-road'));
		a.player.deepestLevel = 1;
		session.systems.quests.count([]);
		session.systems.quests.count([]);
		expect(session.systems.quests.of(a.player)!.record.quests['carters-road'].counts).toEqual([
			1, 0
		]);
		expect(kept).toHaveBeenCalledTimes(1);
	});

	it('the charge is made below only by those a quest has taught, and counts', () => {
		const session = quiet();
		const materials: [string, number][] = [
			['powder-flask', 1],
			['firecrackers', 1],
			['lamp-oil', 1],
			['twine', 1]
		];
		const crafter = (name: string, record: QuestRecord) => {
			const diver = questing(session, name, record, kit(...materials));
			diver.state.inventory.equipment.gear1 = newStack('crafting-kit');
			diver.state.headlamp = 2;
			diver.state.battery = 1;
			return diver;
		};
		const untaught = crafter('U', emptyRecord());
		session.craft(untaught.id, { recipe: 'quarrymans-charge' });
		expect(untaught.state.crafting).toBe(0);
		const taught = crafter('T', upTo('what-they-took'));
		session.craft(taught.id, { recipe: 'quarrymans-charge' });
		expect(taught.state.crafting).toBeGreaterThan(0);
		taught.hold({}, CRAFT.field.seconds + 0.3);
		expect(carriedCount(taught.state.inventory, 'quarrymans-charge')).toBe(1);
		expect(carriedCount(taught.state.inventory, 'powder-flask')).toBe(0);
		expect(
			session.systems.quests.of(taught.player)!.record.quests['what-they-took'].counts
		).toEqual([1, 0, 0]);
		expect(taught.socket.last('quests')!.learned).toEqual(['quarrymans-charge']);
	});

	it('admin finishes the objectives of open quests', () => {
		const session = quiet();
		const a = questing(session, 'A', emptyRecord());
		session.admin(a.id, { kind: 'questObjectives' });
		expect(a.socket.last('quests')!.quests[0]).toMatchObject({ id: 'fontaine', status: 'ready' });
	});
});
