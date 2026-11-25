import { describe, expect, it } from 'vitest';
import { DOORS } from '../../src/lib/content/doors.ts';
import { MAP_KIT } from '../../src/lib/content/map/kit.ts';
import { segmentHit } from '../../src/lib/shared/map/collision.ts';
import { doorBox } from '../../src/lib/shared/map/doors.ts';
import { PIECES } from '../../src/lib/shared/map/pieces.generated.ts';
import { roomPoints } from '../../src/lib/shared/map/points.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import type { Session } from '../session.ts';
import { useSessions, Diver } from '../testing/harness.ts';

const SEED = 1;
// On a generated map: the fixed map has no room for what these test yet (docs/dev/fixed-map.md#tests).
const open = useSessions({ generated: true });

describe('doors between levels', () => {
	/** Stand a diver on the room side of the first door, a little back, looking at it. */
	function atDoor(session: Session, diver: Diver) {
		const door = session.layout.doors[0];
		// The room side is the door's local north (-Z) turned by its yaw.
		const out: Vec3 = [-Math.sin(door.yaw), 0, -Math.cos(door.yaw)];
		const front: Vec3 = [
			door.position[0] + out[0] * 1.3,
			door.position[1] + 0.05,
			door.position[2] + out[2] * 1.3
		];
		diver.put(session['freeSpot'](front));
		diver.hold({}, 0.3);
		const look = diver.lookAt(doorBox(door).center);
		diver.state.yaw = look.yaw;
		diver.state.pitch = look.pitch;
		return { door, look, out };
	}

	it('every level but the deepest ends at a shut door, and so does the way into the final room', () => {
		const session = open(SEED);
		expect(session.layout.doors.map((d) => d.tier)).toEqual([1, 2, 2]);
		const diver = new Diver(session);
		diver.hold({}, 0.1);
		expect(diver.socket.last('tick')!.doors).toEqual([]);
	});

	it('is solid until held open; then it stays open for everyone, and creatures can follow', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		const other = new Diver(session, 'B');
		session.admin(diver.id, { kind: 'clearCreatures' });
		const { door, look, out } = atDoor(session, diver);
		const through: Vec3 = [
			door.position[0] - out[0] * 1.5,
			door.position[1] + 1,
			door.position[2] - out[2] * 1.5
		];
		expect(segmentHit(session['world'], diver.eye, through)).not.toBeNull();
		expect(session['nav'].closed.has(door.id)).toBe(true);
		// Walking into it: still on the room side.
		diver.hold({ ...look, moveZ: 1 }, 2);
		const side = (p: Vec3) =>
			(p[0] - door.position[0]) * out[0] + (p[2] - door.position[2]) * out[2];
		expect(side(diver.state.position)).toBeGreaterThan(0);
		// Letting go too soon does nothing.
		atDoor(session, diver);
		diver.hold({ ...look, interact: true }, DOORS.openSeconds / 2);
		expect(diver.state.unbarring).toBeGreaterThan(0);
		diver.hold(look, 0.1);
		expect(diver.state.unbarring).toBe(0);
		expect(diver.socket.last('tick')!.doors).toEqual([]);
		diver.hold({ ...look, interact: true }, DOORS.openSeconds + 0.2);
		expect(other.socket.last('tick')!.doors).toEqual([door.id]);
		expect(other.socket.all('tick').some((t) => t.events.some((e) => e.kind === 'doorOpen'))).toBe(
			true
		);
		expect(segmentHit(session['world'], diver.eye, through)).toBeNull();
		expect(session['nav'].closed.has(door.id)).toBe(false);
		// And through it, down the stair.
		diver.hold({ moveZ: 1, yaw: look.yaw, pitch: 0 }, 2);
		expect(side(diver.state.position)).toBeLessThan(0);
	});

	it('admin can open them all, and the deepest level reached counts levels of the map', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'clearCreatures' });
		session.admin(diver.id, { kind: 'openDoors' });
		expect(session['doors'].snapshot()).toEqual(session.layout.doors.map((d) => d.id));
		const chapel = roomPoints(session.layout, PIECES, MAP_KIT).find(
			(r) => r.name === 'gloaming-chapel'
		)!;
		session.admin(diver.id, { kind: 'teleport', room: chapel.name });
		diver.hold({}, 0.2);
		expect(diver.player.deepestLevel).toBe(2);
	});
});
