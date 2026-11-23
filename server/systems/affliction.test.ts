import { describe, expect, it } from 'vitest';
import { AFFLICTIONS } from '../../src/lib/content/afflictions.ts';
import { ITEMS } from '../../src/lib/content/items.ts';
import { SANITY } from '../../src/lib/content/player/sanity.ts';
import { isBroken } from '../../src/lib/shared/items/durability.ts';
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
		// Only its swing: no ray, charge or vanishing the test didn't ask for.
		m.castCooldown = 1e9;
		m.vanishIn = 1e9;
		m.rushIn = 1e9;
		return m;
	}

	it('a landed blow goes through what is worn first, and nothing else wears sanity down', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		const blow = AFFLICTIONS.gloaming.manifestation!.strikeDamage[0];
		// A coat with one blow's worth of shield left.
		diver.state.inventory.equipment.defense = {
			...newStack('coat'),
			worn: ITEMS.coat.defense!.shield - blow
		};
		const m = face(session, diver);
		// The first blow is all taken by the coat, which breaks: still worn, but it takes nothing now.
		diver.hold({}, AFFLICTIONS.gloaming.manifestation!.strikeAt + 0.2);
		expect(m.strikes).toBe(1);
		expect(diver.state.sanity).toBe(SANITY.max);
		expect(isBroken(diver.state.inventory.equipment.defense)).toBe(true);
		const events = diver.socket.all('tick').flatMap((t) => t.events);
		expect(events.some((e) => e.kind === 'break' && e.item === 'coat')).toBe(true);
		// The next lands in full, and only that.
		while (m.strikes < 2) diver.hold({}, 0.05);
		diver.hold({}, AFFLICTIONS.gloaming.manifestation!.strikeAt + 0.1);
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

	it('its ray puts your lamp out, and it stays out until that wears off', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		const m = face(session, diver);
		const spec = AFFLICTIONS.gloaming.manifestation!;
		// 2 m ahead, down the room: out of reach, a clear line.
		const [x, y, z] = diver.state.position;
		const yaw = diver.state.yaw;
		m.position = [x - 2 * Math.sin(yaw), y, z - 2 * Math.cos(yaw)];
		diver.hold({ headlamp: 2 }, 0.1);
		expect(diver.state.headlamp).toBe(2);
		session.admin(diver.id, { kind: 'bossRay' });
		expect(m.casts).toBe(1);
		diver.hold({ headlamp: 2 }, spec.ray.chargeSeconds + 0.3);
		const events = diver.socket.all('tick').flatMap((t) => t.events);
		expect(events.some((e) => e.kind === 'ray' && e.player === diver.id)).toBe(true);
		expect(diver.state.conditions.map((c) => c.id)).toContain('snuffed');
		// The blow, and a moment of the dark's own drain with the lamp out.
		expect(diver.state.sanity).toBeLessThanOrEqual(SANITY.max - spec.ray.damage[0]);
		expect(diver.state.sanity).toBeGreaterThan(SANITY.max - spec.ray.damage[0] - 1);
		// Banish it so nothing else happens; the lamp stays out whatever the diver asks.
		session.admin(diver.id, { kind: 'banish' });
		diver.hold({ headlamp: 2 }, 1);
		expect(diver.state.headlamp).toBe(0);
		diver.hold({ headlamp: 2 }, spec.ray.snuffSeconds);
		expect(diver.state.conditions).toEqual([]);
		expect(diver.state.headlamp).toBe(2);
	});

	it('admin: make it swing, charge and vanish on demand', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		const m = face(session, diver);
		m.position = [diver.state.position[0] + 5, diver.state.position[1], diver.state.position[2]];
		session.admin(diver.id, { kind: 'bossStrike' });
		expect(m.strikes).toBe(1);
		session.admin(diver.id, { kind: 'bossRush' });
		expect(m.rushLeft).toBeGreaterThan(0);
		session.admin(diver.id, { kind: 'bossVanish' });
		diver.hold({}, 0.1);
		expect(diver.socket.last('tick')!.affliction.manifestation!.state).toBe('vanished');
	});
});
