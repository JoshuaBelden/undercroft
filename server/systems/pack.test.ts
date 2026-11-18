import { describe, expect, it } from 'vitest';
import { useSessions, kit, Diver } from '../testing/harness.ts';

const SEED = 1;
const open = useSessions();

describe('items on the floor', () => {
	it('dropping from the pack puts it in front, and interact picks it back up', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['coins', 5]));
		diver.hold({ pitch: -0.9 }, 0.3);
		session.inventory(diver.id, { kind: 'drop', from: { area: 'backpack', index: 0 }, count: 5 });
		expect(diver.state.inventory.backpack[0]).toBeNull();
		diver.hold({ pitch: -0.9 }, 0.2);
		const dropped = session['items'].snapshots().find((i) => i.item === 'coins')!;
		expect(dropped).toBeDefined();
		const look = diver.lookAt(dropped.position);
		diver.hold(look, 0.1);
		diver.press({ ...look, interact: true });
		expect(diver.state.inventory.backpack[0]).toMatchObject({ item: 'coins', count: 5 });
		const events = diver.socket.all('tick').flatMap((t) => t.events);
		expect(events.find((e) => e.kind === 'pickup')).toMatchObject({
			player: diver.id,
			item: 'coins',
			count: 5
		});
	});

	it('the drop button throws what is in the hand on the floor', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['knife']));
		diver.hold({}, 0.5);
		diver.press({ drop: true });
		expect(diver.state.inventory.equipment.primary).toBeNull();
		expect(session['items'].snapshots().some((i) => i.item === 'knife')).toBe(true);
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
