import { describe, expect, it } from 'vitest';
import { DEFAULT_MARK_WHEEL } from '../../src/lib/content/marks.ts';
import { segmentHit } from '../../src/lib/shared/map/collision.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import { HAND } from '../../src/lib/shared/player/types.ts';
import type { Session } from '../session.ts';
import { useSessions, kit, Diver } from '../testing/harness.ts';

const SEED = 1;
const SYMBOL = DEFAULT_MARK_WHEEL[0];
const open = useSessions();

/** A stone surface within chalk reach, straight ahead at eye level on some heading. */
function wallInReach(session: Session, diver: Diver): { yaw: number; point: Vec3; normal: Vec3 } {
	const world = session['world'];
	for (let i = 0; i < 32; i++) {
		const yaw = (i / 32) * Math.PI * 2;
		const dir: Vec3 = [-Math.sin(yaw), 0, -Math.cos(yaw)];
		const eye = diver.eye;
		const far: Vec3 = [eye[0] + dir[0] * 1.8, eye[1], eye[2] + dir[2] * 1.8];
		const t = segmentHit(world, eye, far);
		if (t === null || t * 1.8 < 0.6) continue;
		const d = t * 1.8 + 0.02;
		return {
			yaw,
			point: [eye[0] + dir[0] * d, eye[1], eye[2] + dir[2] * d],
			normal: [-dir[0], 0, -dir[2]]
		};
	}
	throw new Error('No wall near');
}

describe('chalk marks', () => {
	it('draws a mark on the wall in front, and holding interact rubs it out', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['chalk', 2]));
		session.admin(diver.id, { kind: 'clearCreatures' });
		diver.hold({ select: HAND.quick }, 0.5);
		const wall = wallInReach(session, diver);
		diver.hold({ select: HAND.quick, yaw: wall.yaw, pitch: 0 }, 0.1);
		session.mark(diver.id, SYMBOL, wall.point, wall.normal);
		const marks = diver.socket.last('marks')!.marks;
		expect(marks).toHaveLength(1);
		expect(marks[0]).toMatchObject({ symbol: SYMBOL, by: diver.id, name: 'A' });
		// Not on top of the first one, and not with nothing in the hand.
		session.mark(diver.id, SYMBOL, wall.point, wall.normal);
		expect(diver.socket.last('marks')!.marks).toHaveLength(1);
		diver.hold({ select: HAND.quick, yaw: wall.yaw, pitch: 0, interact: true }, 1.5);
		expect(diver.socket.last('marks')!.marks).toEqual([]);
	});

	it('refuses a symbol that is not on the wheel, and a mark with no chalk', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['chalk']));
		diver.hold({ select: HAND.quick }, 0.5);
		const wall = wallInReach(session, diver);
		diver.hold({ select: HAND.quick, yaw: wall.yaw, pitch: 0 }, 0.1);
		session.mark(diver.id, 'no-such-symbol', wall.point, wall.normal);
		session.mark(diver.id, SYMBOL, 'here', wall.normal);
		expect(diver.socket.all('marks')).toHaveLength(1);
		const bare = new Diver(session, 'B');
		session.mark(bare.id, SYMBOL, wall.point, wall.normal);
		expect(bare.socket.all('marks')).toHaveLength(1);
	});

	it("follows the player's own wheel: told in welcome, and nothing off it is drawn", () => {
		const session = open(SEED);
		const wheel = ['loot', 'trap', 'water', 'exit', 'stairs', 'wait', 'meet', 'help'];
		const diver = new Diver(session, 'A', kit(['chalk', 2]), wheel);
		const { socket } = diver;
		expect(socket.last('welcome')!.markWheel).toEqual(wheel);
		session.admin(diver.id, { kind: 'clearCreatures' });
		diver.hold({ select: HAND.quick }, 0.5);
		const wall = wallInReach(session, diver);
		diver.hold({ select: HAND.quick, yaw: wall.yaw, pitch: 0 }, 0.1);
		// A default symbol they left off their wheel is refused.
		expect(wheel).not.toContain(SYMBOL);
		session.mark(diver.id, SYMBOL, wall.point, wall.normal);
		expect(socket.all('marks')).toHaveLength(1);
		session.mark(diver.id, 'loot', wall.point, wall.normal);
		expect(socket.last('marks')!.marks).toMatchObject([{ symbol: 'loot', by: diver.id }]);
	});
});
