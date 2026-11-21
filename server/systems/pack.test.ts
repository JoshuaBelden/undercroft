import { describe, expect, it } from 'vitest';
import { THROW_DRAW } from '../../src/lib/shared/items/weapons.ts';
import { useSessions, kit, Diver } from '../testing/harness.ts';

const SEED = 1;
const open = useSessions();

describe('items on the floor', () => {
	it('dropping from the pack puts it in front, and interact picks it back up', () => {
		const session = open(SEED);
		// Something with a model of its own: it lies on the floor as itself, not in a drop box.
		const diver = new Diver(session, 'A', kit(['battery', 2]));
		const from = { area: 'quick', index: 0 } as const;
		diver.hold({ pitch: -0.9 }, 0.3);
		session.inventory(diver.id, { kind: 'drop', from, count: 2 });
		expect(diver.state.inventory.quick[0]).toBeNull();
		diver.hold({ pitch: -0.9 }, 0.2);
		const dropped = session['items'].snapshots().find((i) => i.item === 'battery')!;
		expect(dropped).toBeDefined();
		const look = diver.lookAt(dropped.position);
		diver.hold(look, 0.1);
		diver.press({ ...look, interact: true });
		expect(diver.state.inventory.quick[0]).toMatchObject({ item: 'battery', count: 2 });
		const events = diver.socket.all('tick').flatMap((t) => t.events);
		expect(events.find((e) => e.kind === 'pickup')).toMatchObject({
			player: diver.id,
			item: 'battery',
			count: 2
		});
	});

	it('a thrown knife lands on the floor, and interact picks it back up', () => {
		const session = open(SEED);
		session.admin('nobody', { kind: 'clearCreatures' });
		const diver = new Diver(session, 'A', kit(['knife']));
		// At your feet, within reach.
		diver.hold({ pitch: -1.4 }, 0.5);
		diver.hold({ pitch: -1.4, attack: true }, THROW_DRAW + 0.1);
		diver.hold({ pitch: -1.4 }, 1);
		expect(diver.state.inventory.equipment.primary).toBeNull();
		const thrown = session['items'].snapshots().find((i) => i.item === 'knife')!;
		expect(thrown).toBeDefined();
		const look = diver.lookAt(thrown.position);
		diver.hold(look, 0.1);
		diver.press({ ...look, interact: true });
		expect(diver.state.inventory.equipment.primary?.item).toBe('knife');
	});

	it('ignores pack requests from someone who is down', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['coins', 5]));
		session.admin(diver.id, { kind: 'setSanity', value: 0 });
		session.inventory(diver.id, { kind: 'drop', from: { area: 'backpack', index: 0 }, count: 5 });
		expect(diver.state.inventory.backpack[0]).not.toBeNull();
		session.inventory('nobody', {});
	});
});
