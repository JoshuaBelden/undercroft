import { describe, expect, it } from 'vitest';
import { segmentBlocked } from '../../src/lib/shared/map/collision.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import type { Session } from '../session.ts';
import { Diver, kit, useSessions } from '../testing/harness.ts';

const SEED = 1;
const open = useSessions();

/** The surveyor: there is always exactly one. */
function surveyor(session: Session) {
	const all = session['creatures'].friendlies();
	expect(all).toHaveLength(1);
	return all[0];
}

/** Stand the diver a couple of metres from him, in clear sight, looking at his chest. */
function faceHim(session: Session, diver: Diver) {
	const him = surveyor(session);
	const p = him.position;
	const spot = session['nav'].points.find((n) => {
		const q = n.position;
		const d = Math.hypot(q[0] - p[0], q[2] - p[2]);
		return (
			d > 1.4 &&
			d < 2 &&
			Math.abs(q[1] - p[1]) < 0.3 &&
			n.clearance === 'stand' &&
			!segmentBlocked(session['world'], [q[0], q[1] + 1.4, q[2]], [p[0], p[1] + 1, p[2]])
		);
	});
	expect(spot).toBeDefined();
	diver.put(spot!.position);
	const chest: Vec3 = [p[0], p[1] + 1, p[2]];
	return diver.lookAt(chest);
}

describe('the surveyor', () => {
	it('shares where he has been with whoever holds interact on him, once', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['notebook']));
		diver.state.flags.godMode = true;
		diver.descend();
		const look = faceHim(session, diver);
		// He stops and turns to them; give him a moment.
		diver.hold(look, 0.5);
		const before = diver.socket.all('survey').at(-1)?.cells.length ?? 0;
		diver.hold({ ...faceHim(session, diver), interact: true }, 2);
		const events = () => diver.socket.all('tick').flatMap((t) => t.events);
		const shared = events().filter((e) => e.kind === 'surveyorMap');
		expect(shared).toHaveLength(1);
		expect(shared[0].kind === 'surveyorMap' && shared[0].cells).toBeGreaterThan(5);
		expect(diver.socket.all('survey').at(-1)!.cells.length).toBeGreaterThan(before + 5);
		// Once only.
		diver.hold({ interact: false }, 0.2);
		diver.hold({ ...faceHim(session, diver), interact: true }, 2);
		expect(events().filter((e) => e.kind === 'surveyorMap')).toHaveLength(1);
		expect(diver.state.consulting).toBe(0);
	});

	it("can't be hurt: no hit body, and damage does nothing", () => {
		const session = open(SEED);
		const him = surveyor(session);
		const creatures = session['creatures'];
		expect(creatures.hitBodies().some((b) => b.id === him.id)).toBe(false);
		expect(creatures.damage(him.id, 1000, null)).toBe(false);
		creatures.killAll();
		expect(creatures.friendlies()).toHaveLength(1);
	});
});
