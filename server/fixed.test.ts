import { describe, expect, it } from 'vitest';
import { GATES } from '../src/lib/content/doors.ts';
import { CRATES } from '../src/lib/content/loot.ts';
import { carriedCount } from '../src/lib/shared/items/inventory.ts';
import { lootableOf } from '../src/lib/shared/items/lootables.ts';
import { crateCentre } from '../src/lib/shared/map/crates.ts';
import { doorBox } from '../src/lib/shared/map/doors.ts';
import { spawnPoint } from '../src/lib/shared/map/points.ts';
import type { DoorPlacement, Vec3 } from '../src/lib/shared/map/types.ts';
import type { Session } from './session.ts';
import { Diver, useSessions } from './testing/harness.ts';

/**
 * The fixed map, played on the server end to end (#142): the way in (#150). Down the ladder onto
 * the walkway, the key from the crate that holds it, the Storeroom's door opened with it, the seam
 * at the foot of the stair shut, and back up the ladder. See docs/dev/fixed-map.md.
 */

const SEED = 1;
const open = useSessions();

/** Stand in front of the lootable that holds `item` (a crate, a body), looking at it, and open it. */
function openCrateHolding(session: Session, diver: Diver, item: string): void {
	const placement = session.layout.crates.find((c) => c.holds === item)!;
	const crate = session['crates'].list().find(({ crate }) => crate.id === placement.id)!.crate;
	const front: Vec3 = [
		placement.position[0] + Math.sin(placement.yaw) * 1.3,
		placement.position[1] + 0.05,
		placement.position[2] + Math.cos(placement.yaw) * 1.3
	];
	diver.put(session.freeSpot(front));
	diver.hold({}, 0.3);
	const look = diver.lookAt(crateCentre(crate));
	diver.hold({ ...look, interact: true }, lootableOf(crate).open[0].seconds + 0.2);
	expect(diver.player.crate).toBe(crate.id);
	diver.hold(look, CRATES.revealSeconds * 9);
}

/** Take `item` out of the open crate. */
function take(session: Session, diver: Diver, item: string): void {
	const view = diver.socket.last('crate')!;
	const index = view.slots.findIndex((s) => s !== null && s !== 'hidden' && s.item === item);
	expect(index).toBeGreaterThanOrEqual(0);
	session.inventory(diver.id, { kind: 'quick', from: { area: 'stash', index } });
}

/** Stand on the room side of a door, looking at it, and hold interact. */
function tryDoor(session: Session, diver: Diver, door: DoorPlacement, seconds: number): void {
	// At yaw 0 the room side is north (-Z): stand a step out from the doorway on that side.
	const [x, y, z] = door.position;
	diver.put(
		session.freeSpot([x - Math.sin(door.yaw) * 1.2, y + 0.05, z - Math.cos(door.yaw) * 1.2])
	);
	diver.hold({}, 0.3);
	const look = diver.lookAt(doorBox(door).center);
	diver.hold({ ...look, interact: true }, seconds);
	diver.hold(look, 0.1);
}

describe('the way in, played', () => {
	it('starts on the walkway, with nothing down here but its rooms', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		diver.hold({}, 0.5);
		const spawn = spawnPoint(session.layout, session.pieces).position;
		expect(
			Math.hypot(diver.state.position[0] - spawn[0], diver.state.position[2] - spawn[2])
		).toBeLessThan(0.5);
		expect(diver.state.position[1]).toBeCloseTo(0, 1);
		expect(session['creatures'].count).toBe(0);
		expect(diver.socket.last('tick')!.creatures).toEqual([]);
		expect(diver.socket.last('tick')!.affliction.manifestation).toBeNull();
	});

	it("the Storeroom's door won't open without its key", () => {
		const session = open(SEED);
		const diver = new Diver(session);
		const door = session.layout.doors.find((d) => d.key === 'key')!;
		tryDoor(session, diver, door, GATES.keySeconds * 3);
		expect(session['doors'].isOpen(door.id)).toBe(false);
	});

	it('the key from the body by the door opens it, and is used up; the seam stays shut; the ladder gets you out', () => {
		const session = open(SEED);
		const diver = new Diver(session);

		openCrateHolding(session, diver, 'key');
		take(session, diver, 'key');
		expect(carriedCount(diver.state.inventory, 'key')).toBe(1);
		// Done with the body: put its screen away (it lies by the door, still in reach).
		session.closeCrate(diver.id);
		diver.hold({}, 0.1);

		const door = session.layout.doors.find((d) => d.key === 'key')!;
		tryDoor(session, diver, door, GATES.keySeconds + 0.5);
		expect(session['doors'].isOpen(door.id)).toBe(true);
		expect(carriedCount(diver.state.inventory, 'key')).toBe(0);

		const seam = session.layout.doors.find((d) => d.marker === 'door-1')!;
		expect(session['doors'].isBarred(seam.id)).toBe(true);
		tryDoor(session, diver, seam, 3);
		expect(session['doors'].isOpen(seam.id)).toBe(false);

		diver.climbOut();
		expect(diver.socket.last('extracted')).toBeDefined();
		expect(session.ended).toBe(true);
	});

	it('the key is on the body every time the lootables are filled again', () => {
		const session = open(SEED);
		const crateId = session.layout.crates.find((c) => c.holds === 'key')!.id;
		const crate = () => session['crates'].list().find(({ crate }) => crate.id === crateId)!.crate;
		expect(crate().lock).toBeNull();
		session['crates'].fill();
		expect(crate().slots.some((s) => s?.item === 'key')).toBe(true);
	});
});
