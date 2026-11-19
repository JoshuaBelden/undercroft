import { describe, expect, it } from 'vitest';
import { AFFLICTIONS } from '../../src/lib/content/afflictions.ts';
import { SANITY } from '../../src/lib/content/player/sanity.ts';
import { newStack } from '../../src/lib/shared/items/inventory.ts';
import type { Session } from '../session.ts';
import { useSessions, Diver } from '../testing/harness.ts';

const SEED = 1;
const open = useSessions();

describe('the manifestation', () => {
	/** Summon it and set it hunting right beside the diver, who stands in the start room. */
	function face(session: Session, diver: Diver) {
		session.admin(diver.id, { kind: 'clearCreatures' });
		session.admin(diver.id, { kind: 'manifest' });
		const m = session['affliction']['manifestation']!;
		m.state = 'hunting';
		m.position = [diver.state.position[0] + 0.5, diver.state.position[1], diver.state.position[2]];
		return m;
	}

	it('a landed blow goes through what is worn first, and nothing else wears sanity down', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		diver.state.inventory.equipment.defense = newStack('coat');
		const m = face(session, diver);
		const blow = AFFLICTIONS.gloaming.manifestation.strikeDamage[0];
		// The first blow is all taken by the coat, which is torn apart.
		diver.hold({}, AFFLICTIONS.gloaming.manifestation.strikeAt + 0.2);
		expect(m.strikes).toBe(1);
		expect(diver.state.sanity).toBe(SANITY.max);
		expect(diver.state.inventory.equipment.defense).toBeNull();
		const events = diver.socket.all('tick').flatMap((t) => t.events);
		expect(events.some((e) => e.kind === 'break' && e.item === 'coat')).toBe(true);
		// The next lands in full, and only that.
		while (m.strikes < 2) diver.hold({}, 0.05);
		diver.hold({}, AFFLICTIONS.gloaming.manifestation.strikeAt + 0.1);
		expect(diver.state.sanity).toBe(SANITY.max - blow);
	});

	it('flicking the lamp off and on in its face stuns it', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		const m = face(session, diver);
		// 2 m ahead: the diver starts facing down the room, so there's no wall in between.
		const [x, y, z] = diver.state.position;
		const yaw = diver.state.yaw;
		m.position = [x - 2 * Math.sin(yaw), y, z - 2 * Math.cos(yaw)];
		const look = diver.lookAt([m.position[0], m.position[1] + 1.1, m.position[2]]);
		diver.hold({ ...look, headlamp: 0 }, 0.1);
		expect(m.statuses).toEqual({});
		diver.hold({ ...look, headlamp: 2 }, 0.1);
		const events = diver.socket.all('tick').flatMap((t) => t.events);
		expect(events.some((e) => e.kind === 'strobe' && e.stunned === 1)).toBe(true);
		expect(diver.socket.last('tick')!.affliction.manifestation!.stunned).toBe(true);
	});
});
