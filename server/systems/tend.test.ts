import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../src/lib/content/items.ts';
import { SANITY } from '../../src/lib/content/player/sanity.ts';
import { bodyHeight } from '../../src/lib/shared/player/simulate.ts';
import { HAND } from '../../src/lib/shared/player/types.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import { Diver, kit, useSessions } from '../testing/harness.ts';

const SEED = 1;
const open = useSessions();
const BANDAGE = ITEMS.bandage.heal!;
const BATTERY = ITEMS.battery.charge!;

/** Two players: `helper` with `item` in hand, `patient` a metre in front, looked at. */
function pair(item: string) {
	const session = open(SEED);
	const helper = new Diver(session, 'A', kit([item, 2]));
	const patient = new Diver(session, 'B');
	const [x, y, z] = helper.state.position;
	helper.put([x, y, z], 0);
	// Yaw 0 looks toward -Z.
	patient.put([x, y, z - 1]);
	helper.hold({ select: HAND.quick }, 0.5);
	const chest: Vec3 = [x, y + bodyHeight(patient.state) * 0.6, z - 1];
	return { session, helper, patient, look: helper.lookAt(chest) };
}

describe('using the item in the hand on a teammate', () => {
	it('holding aim with a bandage on a hurt teammate heals them, and spends one', () => {
		const { session, helper, patient, look } = pair('bandage');
		session.admin(patient.id, { kind: 'setSanity', value: 40 });
		helper.hold({ ...look, aim: true }, BANDAGE.seconds + 0.3);
		expect(patient.state.sanity).toBe(40 + BANDAGE.amount);
		expect(helper.state.inventory.quick[0]?.count).toBe(1);
		// Your own sanity is no part of it.
		expect(helper.state.sanity).toBe(SANITY.max);
	});

	it('a battery goes into their lamp', () => {
		const { helper, patient, look } = pair('battery');
		patient.state.battery = 0.1;
		helper.hold({ ...look, aim: true }, BATTERY.seconds + 0.3);
		expect(patient.state.battery).toBeGreaterThan(0.5);
		expect(helper.state.inventory.quick[0]?.count).toBe(1);
	});

	it('nothing happens for a teammate who needs nothing, or one you are not looking at', () => {
		const { session, helper, patient, look } = pair('bandage');
		helper.hold({ ...look, aim: true }, BANDAGE.seconds + 0.3);
		expect(helper.state.inventory.quick[0]?.count).toBe(2);
		session.admin(patient.id, { kind: 'setSanity', value: 40 });
		helper.hold({ yaw: look.yaw + Math.PI, pitch: 0, aim: true }, BANDAGE.seconds + 0.3);
		expect(patient.state.sanity).toBe(40);
		expect(helper.state.inventory.quick[0]?.count).toBe(2);
	});

	it('letting go part-way starts it over', () => {
		const { session, helper, patient, look } = pair('bandage');
		session.admin(patient.id, { kind: 'setSanity', value: 40 });
		helper.hold({ ...look, aim: true }, BANDAGE.seconds * 0.6);
		helper.hold({ ...look, aim: false }, 0.2);
		helper.hold({ ...look, aim: true }, BANDAGE.seconds * 0.6);
		expect(patient.state.sanity).toBe(40);
	});

	it('a teammate who went down before it finished gets nothing, and the bandage comes back', () => {
		const { session, helper, patient, look } = pair('bandage');
		session.admin(patient.id, { kind: 'setSanity', value: 40 });
		// Down, they're no longer someone a bandage can help: it never finishes.
		helper.hold({ ...look, aim: true }, BANDAGE.seconds * 0.5);
		session.admin(patient.id, { kind: 'setSanity', value: 0 });
		helper.hold({ ...look, aim: true }, BANDAGE.seconds);
		expect(patient.state.downed).toBe(true);
		expect(helper.state.inventory.quick[0]?.count).toBe(2);
	});

	it('the server gives the item back if the teammate is gone when it finishes', () => {
		const { session, helper, patient } = pair('bandage');
		const tend = session['systems'].tend;
		patient.state.position = [
			patient.state.position[0] + 10,
			...patient.state.position.slice(1)
		] as Vec3;
		helper.state.inventory.quick[0]!.count = 1;
		tend.simulated(helper.player, {
			frame: helper.player.lastInput!,
			pressedInteract: false,
			pressedAttack: false,
			wasLit: true,
			events: [{ kind: 'tend', patient: patient.id, item: 'bandage' }]
		});
		expect(helper.state.inventory.quick[0]?.count).toBe(2);
		expect(patient.state.sanity).toBe(SANITY.max);
	});

	it('emits a tend event for everyone to hear', () => {
		const { session, helper, patient, look } = pair('bandage');
		session.admin(patient.id, { kind: 'setSanity', value: 40 });
		helper.hold({ ...look, aim: true }, BANDAGE.seconds + 0.3);
		const events = helper.socket.all('tick').flatMap((t) => t.events);
		expect(events).toContainEqual(
			expect.objectContaining({
				kind: 'tend',
				player: helper.id,
				patient: patient.id,
				item: 'bandage'
			})
		);
	});
});
