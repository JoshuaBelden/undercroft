import { describe, expect, it, vi } from 'vitest';
import { TASKS } from '../../src/lib/content/tasks.ts';
import { doorBox } from '../../src/lib/shared/map/doors.ts';
import { inFront } from '../../src/lib/shared/map/points.ts';
import type { TaskPlacement, Vec3 } from '../../src/lib/shared/map/types.ts';
import { taskCentre } from '../../src/lib/shared/quests/tasks.ts';
import type { QuestRecord } from '../../src/lib/shared/quests/types.ts';
import { upTo } from '../../src/lib/shared/testing/quests.ts';
import type { Session } from '../session.ts';
import { Diver, useSessions } from '../testing/harness.ts';

/** Room tasks, the barred stair and the charge (docs/dev/quests.md). */

// On a generated map: the fixed map has no room for what these test yet (docs/dev/fixed-map.md#tests).

const open = useSessions({ generated: true });

function quiet(): Session {
	const session = open(1);
	session.admin('x', { kind: 'clearCreatures' });
	return session;
}

function questing(session: Session, name: string, record: QuestRecord | null): Diver {
	const diver = new Diver(session, name);
	session.systems.quests.set(diver.player, record ? { record, resolved: [] } : null);
	return diver;
}

/** Stand a step from a task's object, looking at it. */
function facing(
	session: Session,
	diver: Diver,
	task: TaskPlacement
): { yaw: number; pitch: number } {
	diver.put(session['freeSpot'](inFront(task)));
	diver.hold({}, 0.3);
	const look = diver.lookAt(taskCentre(task));
	diver.state.yaw = look.yaw;
	diver.state.pitch = look.pitch;
	return look;
}

describe('room tasks', () => {
	it("the party's tasks put their rooms and objects in the map, even a rare room", () => {
		const session = quiet();
		session.questTasks(['bricked-niche', 'carters-bell']);
		const placed = session.layout.tasks!.map((t) => t.id).sort();
		expect(placed).toEqual(['bricked-niche', 'carters-bell']);
		expect(session.layout.placements.some((p) => p.piece === 'saints-crypt')).toBe(true);
	});

	it('held on, it is loud the whole time; done, it yields its thing and counts for everyone', () => {
		const session = quiet();
		session.questTasks(['cistern-winch']);
		const a = questing(session, 'A', upTo('sunken-box'));
		const b = questing(session, 'B', upTo('sunken-box'));
		const task = session.layout.tasks![0];
		const look = facing(session, a, task);
		const hear = vi.spyOn(session['creatures'], 'hear');
		a.hold({ ...look, interact: true }, TASKS['cistern-winch'].seconds / 2);
		expect(a.state.tasking).toBeGreaterThan(0);
		expect(hear.mock.calls.length).toBeGreaterThanOrEqual(3);
		// Letting go starts it over.
		a.hold(look, 0.1);
		expect(a.state.tasking).toBe(0);
		a.hold({ ...look, interact: true }, TASKS['cistern-winch'].seconds + 0.3);
		expect(a.socket.all('tick').some((t) => t.tasks.includes('cistern-winch'))).toBe(true);
		for (const diver of [a, b]) {
			expect(session.systems.quests.of(diver.player)!.record.quests['sunken-box'].counts).toEqual([
				1
			]);
		}
		expect(session['items'].snapshots().some((i) => i.item === 'carters-ledger')).toBe(true);
		// Done is done: holding on again does nothing.
		a.hold({ ...look, interact: true }, 1);
		expect(a.state.tasking).toBe(0);
	});
});

describe('the barred stair', () => {
	function barredDoor(session: Session) {
		return session.layout.doors.find((d) => d.piece === 'stairs-deep' && d.tier === 2)!;
	}

	/** On the near side of a door, a little back, looking at it. */
	function atDoor(session: Session, diver: Diver, door = barredDoor(session)) {
		const out: Vec3 = [-Math.sin(door.yaw), 0, -Math.cos(door.yaw)];
		diver.put(
			session['freeSpot']([
				door.position[0] + out[0] * 1.3,
				door.position[1] + 0.05,
				door.position[2] + out[2] * 1.3
			])
		);
		diver.hold({}, 0.3);
		const look = diver.lookAt(doorBox(door).center);
		diver.state.yaw = look.yaw;
		diver.state.pitch = look.pitch;
		return look;
	}

	it('rattles and stays shut by hand; a charge blows it open, and those there keep it open', () => {
		const kept = vi.fn();
		const session = open(1, { onQuests: kept });
		session.admin('x', { kind: 'clearCreatures' });
		const diver = questing(session, 'A', upTo('what-they-took'));
		const door = barredDoor(session);
		expect(diver.socket.last('tick')?.barred ?? session['doors'].barredSnapshot()).toContain(
			door.id
		);
		const look = atDoor(session, diver, door);
		diver.hold({ ...look, interact: true }, 3);
		expect(session['doors'].isOpen(door.id)).toBe(false);
		const rattles = diver.socket
			.all('tick')
			.flatMap((t) => t.events)
			.filter((e) => e.kind === 'doorRattle');
		expect(rattles).toHaveLength(1);
		session.systems.hazards.simulated(diver.player, {
			events: [
				{
					kind: 'place',
					item: 'quarrymans-charge',
					origin: diver.eye,
					direction: [-Math.sin(look.yaw), 0, -Math.cos(look.yaw)]
				}
			]
		});
		diver.hold({}, 8.3);
		expect(session['doors'].isOpen(door.id)).toBe(true);
		const blast = diver.socket
			.all('tick')
			.flatMap((t) => t.events)
			.find((e) => e.kind === 'blast');
		expect(blast).toMatchObject({ door: door.id });
		expect(session.systems.quests.hasFlag(diver.player, 'gloaming.level-3-open')).toBe(true);
		expect(kept).toHaveBeenCalled();
	});

	it("isn't barred for a party with someone who has blown it before", () => {
		const session = quiet();
		const record = upTo('what-they-took');
		record.flags.push('gloaming.level-3-open');
		const diver = new Diver(session);
		session.systems.quests.set(diver.player, { record, resolved: [] });
		session.systems.doors.joined(diver.player);
		const door = barredDoor(session);
		expect(session['doors'].isBarred(door.id)).toBe(false);
		const look = atDoor(session, diver, door);
		diver.hold({ ...look, interact: true }, 2);
		expect(session['doors'].isOpen(door.id)).toBe(true);
	});
});
