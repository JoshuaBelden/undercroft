import { describe, expect, it, vi } from 'vitest';
import { FALSE_WALLS } from '../../src/lib/content/map/walls.ts';
import { MAP_KIT } from '../../src/lib/content/map/kit.ts';
import { PIECES } from '../../src/lib/shared/map/pieces.generated.ts';
import { prySpots, type PrySpot } from '../../src/lib/shared/map/walls.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import { HAND } from '../../src/lib/shared/player/types.ts';
import type { Session } from '../session.ts';
import { Diver, kit, useSessions } from '../testing/harness.ts';

const open = useSessions();

/** A session whose map has a false wall (seed 1's has three). */
function withWall(): Session {
	const session = open(1);
	expect(session.layout.walls?.length).toBeGreaterThan(0);
	return session;
}

/** Stand the diver a step out from a pry spot, looking at it. */
function facing(session: Session, diver: Diver, spot: PrySpot) {
	const wall = session.layout.walls?.find((w) => w.id === spot.wall);
	// Out from the wall: away from the opening, into the piece it seals.
	const from = wall?.position ?? spot.position;
	const dx = spot.position[0] - from[0];
	const dz = spot.position[2] - from[2];
	const len = Math.hypot(dx, dz) || 1;
	const stand: Vec3 = [
		spot.position[0] + (dx / len) * 1.1,
		spot.position[1] - 1.3,
		spot.position[2] + (dz / len) * 1.1
	];
	diver.put(session['freeSpot'](stand));
	diver.hold({}, 0.3);
	return diver.lookAt(spot.position);
}

describe('false walls', () => {
	it('a crowbar in the hand brings one down after five loud seconds, for good', () => {
		const session = withWall();
		session.admin('x', { kind: 'clearCreatures' });
		const diver = new Diver(session, 'A', kit(['crowbar', 1]));
		const spot = prySpots(session.layout, PIECES, MAP_KIT).find((s) => s.wall)!;
		const look = facing(session, diver, spot);
		diver.hold({ ...look, select: HAND.primary }, 0.3);
		const noise = vi.spyOn(session['creatures'], 'hear');
		diver.hold({ ...look, interact: true }, FALSE_WALLS.prySeconds / 2);
		expect(diver.state.prying).toBeGreaterThan(0);
		expect(diver.socket.last('tick')!.walls).toEqual([]);
		diver.hold({ ...look, interact: true }, FALSE_WALLS.prySeconds / 2 + 0.3);
		expect(noise).toHaveBeenCalled();
		expect(diver.socket.last('tick')!.walls).toEqual([spot.wall]);
		expect(session.world.openDoors.has(spot.wall!)).toBe(true);
	});

	it('nothing happens without a crowbar in the hand', () => {
		const session = withWall();
		session.admin('x', { kind: 'clearCreatures' });
		const diver = new Diver(session);
		const spots = prySpots(session.layout, PIECES, MAP_KIT);
		const wall = spots.find((s) => s.wall)!;
		const look = facing(session, diver, wall);
		diver.hold({ ...look, interact: true }, FALSE_WALLS.prySeconds + 0.3);
		expect(diver.state.prying).toBe(0);
		expect(diver.socket.last('tick')!.walls).toEqual([]);
	});

	it('an admin can bring them all down', () => {
		const session = withWall();
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'openWalls' });
		diver.hold({}, 0.1);
		expect(diver.socket.last('tick')!.walls.length).toBe(session.layout.walls!.length);
	});
});
