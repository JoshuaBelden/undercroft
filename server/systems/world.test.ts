import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GATES } from '../../src/lib/content/doors.ts';
import { HANDS } from '../../src/lib/content/items.ts';
import { RUBBLE_WALLS, WEBS } from '../../src/lib/content/map/walls.ts';
import { carriedCount, newStack } from '../../src/lib/shared/items/inventory.ts';
import { pitonAnchor } from '../../src/lib/shared/items/rope.ts';
import { crateCentre } from '../../src/lib/shared/map/crates.ts';
import { doorBox } from '../../src/lib/shared/map/doors.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import { wallSpots, type PrySpot } from '../../src/lib/shared/map/walls.ts';
import { hasCondition } from '../../src/lib/shared/player/conditions.ts';
import type { SimEvent } from '../../src/lib/shared/player/types.ts';
import { HAND } from '../../src/lib/shared/player/types.ts';
import { addTestItems, removeTestItems } from '../../src/lib/shared/testing/items.ts';
import type { Crate } from '../crates.ts';
import type { Session } from '../session.ts';
import { Diver, kit, useSessions } from '../testing/harness.ts';

/**
 * World mechanics (docs/dev/world.md): lootable catches, fragile and cursed loot, rubble and webs,
 * the mausoleum gate, the smuggler's stash and climbing pitons. Seed 2's map has every one.
 */

beforeAll(() => addTestItems());
afterAll(() => removeTestItems());
afterEach(() => vi.restoreAllMocks());

const SEED = 2;
// On a generated map: the fixed map has no room for what these test yet (docs/dev/fixed-map.md#tests).
const open = useSessions({ generated: true });

function quiet(): Session {
	const session = open(SEED);
	session.admin('x', { kind: 'clearCreatures' });
	return session;
}

const events = (diver: Diver) => diver.socket.all('tick').flatMap((t) => t.events);

function crateOf(session: Session, which: (crate: Crate) => boolean): Crate {
	const crate = session['crates'].list().find(({ crate }) => which(crate))?.crate;
	if (!crate) throw new Error('No such lootable in the map');
	return crate;
}

/** What reaching into a lootable does (the moment it opens). */
function reachIn(session: Session, diver: Diver, crate: Crate, first = true): void {
	session.systems.crates['reachIn'](diver.player, crate, first);
}

describe('lootable catches', () => {
	it('a rat nest bites whoever reaches in, unless they wear gloves', () => {
		const session = quiet();
		const nest = crateOf(session, (c) => c.kind === 'ratNest');
		const bare = new Diver(session, 'A');
		const gloved = new Diver(session, 'B');
		gloved.state.inventory.equipment.gear1 = newStack('test.gloves');
		const before = [bare.state.sanity, gloved.state.sanity];
		reachIn(session, bare, nest);
		reachIn(session, gloved, nest);
		expect(bare.state.sanity).toBe(before[0] - 8);
		expect(gloved.state.sanity).toBe(before[1]);
	});

	it('a cocoon poisons whoever reaches in, unless they wear gloves', () => {
		const session = quiet();
		vi.spyOn(Math, 'random').mockReturnValue(0.99);
		const cocoon = crateOf(session, (c) => c.kind === 'cocoon');
		const bare = new Diver(session, 'A');
		const gloved = new Diver(session, 'B');
		gloved.state.inventory.equipment.gear2 = newStack('test.gloves');
		reachIn(session, bare, cocoon);
		reachIn(session, gloved, cocoon);
		expect(hasCondition(bare.state, 'poisoned')).toBe(true);
		expect(hasCondition(gloved.state, 'poisoned')).toBe(false);
	});

	it('a bone pile can set off a rat swarm the first time, never after', () => {
		const session = quiet();
		const diver = new Diver(session);
		const spawn = vi.spyOn(session['creatures'], 'spawnAt');
		const pile = crateOf(session, (c) => c.kind === 'bonePile');
		vi.spyOn(Math, 'random').mockReturnValue(0);
		reachIn(session, diver, pile, true);
		expect(spawn).toHaveBeenCalledWith('rat', pile.position, 3, expect.anything());
		spawn.mockClear();
		reachIn(session, diver, pile, false);
		expect(spawn).not.toHaveBeenCalled();
	});

	it('creatures that come out are really there', () => {
		const session = quiet();
		const diver = new Diver(session);
		const pile = crateOf(session, (c) => c.kind === 'bonePile');
		const before = session['creatures'].alive('rat');
		vi.spyOn(Math, 'random').mockReturnValue(0);
		reachIn(session, diver, pile, true);
		expect(session['creatures'].alive('rat')).toBe(before + 3);
	});

	it('opening the reliquary alcove feeds the meter, once', () => {
		const session = quiet();
		const diver = new Diver(session);
		const alcove = crateOf(session, (c) => c.kind === 'alcove');
		const before = session['affliction'].meter;
		reachIn(session, diver, alcove, true);
		const after = session['affliction'].meter;
		expect(after).toBeCloseTo(before + 0.04);
		reachIn(session, diver, alcove, false);
		expect(session['affliction'].meter).toBe(after);
	});

	it('searching among the dead in the plague pit takes sanity', () => {
		const session = quiet();
		const diver = new Diver(session);
		const inPit = new Set(
			session.layout.crates.filter((p) => p.piece === 'plague-pit').map((p) => p.id)
		);
		// Whatever is there (a bone pile's rats kept out of it).
		vi.spyOn(Math, 'random').mockReturnValue(0.99);
		const crate = crateOf(session, (c) => inPit.has(c.id));
		const before = diver.state.sanity;
		reachIn(session, diver, crate, false);
		expect(diver.state.sanity).toBe(before - 4);
	});
});

describe('fragile and cursed loot', () => {
	it('a hard fall breaks what is fragile in the pack', () => {
		const session = quiet();
		const diver = new Diver(session, 'A', kit(['test.jar', 1], ['bandage', 1]));
		const land: SimEvent[] = [{ kind: 'land', speed: 14 }];
		session['falls'](diver.player, land);
		expect(carriedCount(diver.state.inventory, 'test.jar')).toBe(0);
		expect(carriedCount(diver.state.inventory, 'bandage')).toBe(1);
		diver.hold({}, 0.1);
		expect(events(diver).some((e) => e.kind === 'shatter' && e.item === 'test.jar')).toBe(true);
	});

	it('a soft landing breaks nothing', () => {
		const session = quiet();
		const diver = new Diver(session, 'A', kit(['test.jar', 1]));
		session['falls'](diver.player, [{ kind: 'land', speed: 10 }]);
		expect(carriedCount(diver.state.inventory, 'test.jar')).toBe(1);
	});

	it('smashing something open may break what is fragile inside', () => {
		const session = quiet();
		const crate = crateOf(session, () => true);
		crate.slots[0] = newStack('test.jar');
		session.systems.crates['shatter'](crate, 1);
		expect(crate.slots[0]).toBeNull();
	});

	it('something cursed wears at whoever carries it', () => {
		const session = quiet();
		const cursed = new Diver(session, 'A', kit(['test.doll', 1]));
		const clean = new Diver(session, 'B');
		clean.put(cursed.state.position);
		cursed.hold({}, 3);
		expect(cursed.state.sanity).toBeLessThan(clean.state.sanity - 4);
	});
});

/** Stand the diver a step out from a wall spot (rubble, a web), looking at it. */
function facing(session: Session, diver: Diver, spot: PrySpot) {
	const wall = session.layout.walls!.find((w) => w.id === spot.wall)!;
	const dx = spot.position[0] - wall.position[0];
	const dz = spot.position[2] - wall.position[2];
	const len = Math.hypot(dx, dz) || 1;
	diver.put(
		session['freeSpot']([
			spot.position[0] + (dx / len) * 1.1,
			spot.position[1] - 1.3,
			spot.position[2] + (dz / len) * 1.1
		])
	);
	diver.hold({}, 0.3);
	return diver.lookAt(spot.position);
}

describe('rubble walls', () => {
	it('a pickaxe in the hand breaks through, loudly; the wall is gone for good', () => {
		const session = quiet();
		const spot = wallSpots(session.layout, 'rubble')[0];
		const diver = new Diver(session, 'A', kit(['test.pickaxe', 1]));
		const look = facing(session, diver, spot);
		diver.hold({ ...look, select: HAND.primary }, 0.3);
		const hear = vi.spyOn(session['creatures'], 'hear');
		diver.hold({ ...look, interact: true }, RUBBLE_WALLS.seconds + 0.3);
		expect(hear).toHaveBeenCalled();
		expect(session.world.openDoors.has(spot.wall!)).toBe(true);
		expect(diver.socket.last('tick')!.walls).toContain(spot.wall);
	});

	it('a crowbar does nothing to rubble', () => {
		const session = quiet();
		const spot = wallSpots(session.layout, 'rubble')[0];
		const diver = new Diver(session, 'A', kit(['crowbar', 1]));
		const look = facing(session, diver, spot);
		diver.hold({ ...look, select: HAND.primary }, 0.3);
		diver.hold({ ...look, interact: true }, RUBBLE_WALLS.seconds + 1);
		expect(session.world.openDoors.has(spot.wall!)).toBe(false);
	});
});

describe('webs', () => {
	/** A swing at a web from a step away. */
	function swing(session: Session, diver: Diver, web: PrySpot, item: string): void {
		const wall = session.layout.walls!.find((w) => w.id === web.wall)!;
		const dx = web.position[0] - wall.position[0];
		const dz = web.position[2] - wall.position[2];
		const len = Math.hypot(dx, dz) || 1;
		const origin: Vec3 = [
			web.position[0] + (dx / len) * 1,
			web.position[1],
			web.position[2] + (dz / len) * 1
		];
		const direction: Vec3 = [-dx / len, 0, -dz / len];
		session.systems.walls.simulated(diver.player, {
			events: [{ kind: 'swing', item, origin, direction }]
		});
	}

	it('tears after a few blows of anything', () => {
		const session = quiet();
		const diver = new Diver(session);
		const web = wallSpots(session.layout, 'web')[0];
		for (let i = 1; i < WEBS.hits; i++) swing(session, diver, web, 'test.spear');
		expect(session.world.openDoors.has(web.wall!)).toBe(false);
		swing(session, diver, web, 'test.spear');
		expect(session.world.openDoors.has(web.wall!)).toBe(true);
	});

	it('bare hands tear it too, blow by blow', () => {
		const session = quiet();
		const diver = new Diver(session);
		const web = wallSpots(session.layout, 'web')[0];
		for (let i = 1; i < WEBS.hits; i++) swing(session, diver, web, HANDS.id);
		expect(session.world.openDoors.has(web.wall!)).toBe(false);
		swing(session, diver, web, HANDS.id);
		expect(session.world.openDoors.has(web.wall!)).toBe(true);
	});

	it('a blade that cuts webs goes through in one', () => {
		const session = quiet();
		const diver = new Diver(session);
		const web = wallSpots(session.layout, 'web')[0];
		swing(session, diver, web, 'test.hatchet');
		expect(session.world.openDoors.has(web.wall!)).toBe(true);
	});

	it('burns away in a fire near it', () => {
		const session = quiet();
		const [web, other] = wallSpots(session.layout, 'web');
		session.systems.walls.burn(web.position, 1);
		expect(session.world.openDoors.has(web.wall!)).toBe(true);
		expect(session.world.openDoors.has(other.wall!)).toBe(false);
	});
});

describe('the mausoleum gate', () => {
	function atGate(session: Session, diver: Diver) {
		const gate = session.layout.doors.find((d) => d.kind === 'gate')!;
		// The antechamber side: the leaves swing into it (the gate's local +Z).
		const out: Vec3 = [Math.sin(gate.yaw), 0, Math.cos(gate.yaw)];
		diver.put(
			session['freeSpot']([
				gate.position[0] + out[0] * 1.2,
				gate.position[1] + 0.05,
				gate.position[2] + out[2] * 1.2
			])
		);
		diver.hold({}, 0.3);
		return { gate, look: diver.lookAt(doorBox(gate).center) };
	}

	it('is locked: nothing opens it without a key or lockpicks', () => {
		const session = quiet();
		const diver = new Diver(session);
		const { gate, look } = atGate(session, diver);
		diver.hold({ ...look, interact: true }, GATES.picksSeconds + 1);
		expect(session['doors'].isOpen(gate.id)).toBe(false);
	});

	it('a key opens it, and is used up', () => {
		const session = quiet();
		const diver = new Diver(session, 'A', kit(['key', 1]));
		const { gate, look } = atGate(session, diver);
		diver.hold({ ...look, interact: true }, GATES.keySeconds + 0.3);
		expect(session['doors'].isOpen(gate.id)).toBe(true);
		expect(carriedCount(diver.state.inventory, 'key')).toBe(0);
	});

	it('lockpicks in the hand open it more slowly; a pick may snap', () => {
		const session = quiet();
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const diver = new Diver(session, 'A', kit(['test.picks', 3]));
		const { gate, look } = atGate(session, diver);
		diver.hold({ ...look, select: HAND.quick }, 0.3);
		diver.hold({ ...look, interact: true }, GATES.picksSeconds + 0.3);
		expect(session['doors'].isOpen(gate.id)).toBe(true);
		expect(carriedCount(diver.state.inventory, 'test.picks')).toBe(2);
	});

	it('every gate has a key hidden for it, like every trunk', () => {
		const session = quiet();
		const gates = session.layout.doors.filter((d) => d.kind === 'gate').length;
		const keys = session['crates']
			.list()
			.reduce((n, { crate }) => n + crate.slots.filter((s) => s?.item === 'key').length, 0);
		expect(keys).toBe(session['crates'].trunks().length + gates);
	});
});

describe("the smuggler's stash", () => {
	it('is hidden until someone has looked at its sign, near, for a moment', () => {
		const session = quiet();
		const diver = new Diver(session);
		const crates = session['crates'];
		for (const stash of crates.unseen()) {
			const yaw = Number(session.layout.crates.find((c) => c.id === stash.id)?.yaw ?? 0);
			diver.put(
				session['freeSpot']([
					stash.position[0] + Math.sin(yaw) * 1.3,
					stash.position[1] + 0.05,
					stash.position[2] + Math.cos(yaw) * 1.3
				])
			);
			diver.hold({}, 0.3);
			const look = diver.lookAt(crateCentre(stash));
			diver.hold(look, 0.1);
			// Unseen: not something to open, even looked straight at.
			expect(crates.lookedAt(diver.eye, aim(diver))).not.toBe(stash);
			diver.hold(look, 1.5);
			if (stash.unseen) continue;
			expect(diver.socket.last('tick')!.crates.noticed).toContain(stash.id);
			expect(events(diver).some((e) => e.kind === 'noticed' && e.crate === stash.id)).toBe(true);
			return;
		}
		throw new Error('No stash could be noticed');
	});
});

function aim(diver: Diver): Vec3 {
	const s = diver.state;
	const cp = Math.cos(s.pitch);
	return [-Math.sin(s.yaw) * cp, Math.sin(s.pitch), -Math.cos(s.yaw) * cp];
}

describe('climbing pitons', () => {
	it('go in at the edge of a drop, an anchor like any other; not on flat floor', () => {
		const session = quiet();
		const anchor = session.world.anchors[0];
		expect(anchor).toBeDefined();
		const out: Vec3 = [
			anchor.position[0] - anchor.landing[0],
			0,
			anchor.position[2] - anchor.landing[2]
		];
		// Not right by an anchor already there.
		expect(pitonAnchor(session.world, anchor.landing, out, 'piton-0')).toBeNull();
		const bare = { ...session.world, anchors: [] };
		const piton = pitonAnchor(bare, anchor.landing, out, 'piton-0');
		expect(piton).not.toBeNull();
		expect(piton!.bottom).toBeCloseTo(anchor.bottom, 0);
		// Turned the other way, back from the edge: no drop in front.
		const back: Vec3 = [-out[0], 0, -out[2]];
		expect(pitonAnchor(bare, anchor.landing, back, 'piton-0')).toBeNull();
	});

	it('set down at an edge, everyone can tie a rope there; nowhere to go, it is kept', () => {
		const session = quiet();
		const anchor = session.world.anchors[0];
		const out: Vec3 = [
			anchor.position[0] - anchor.landing[0],
			0,
			anchor.position[2] - anchor.landing[2]
		];
		const diver = new Diver(session, 'A', kit(['test.piton', 1]));
		const place = (direction: Vec3) =>
			session.systems.ropes.simulated(diver.player, {
				events: [{ kind: 'place', item: 'test.piton', origin: diver.eye, direction }],
				pressedAttack: false
			} as never);
		// At the map's anchor with it taken away: an anchor of the player's own.
		session.world.anchors = session.world.anchors.filter((a) => a !== anchor);
		diver.state.position = [...anchor.landing];
		// Facing back from the edge: no anchor, and the piton comes back.
		place([-out[0], 0, -out[2]]);
		expect(carriedCount(diver.state.inventory, 'test.piton')).toBe(2);
		place(out);
		expect(session.world.anchors.some((a) => a.id === 'piton-0')).toBe(true);
		diver.hold({}, 0.1);
		expect(diver.socket.last('ropes')!.pitons).toHaveLength(1);
	});
});

describe('admin', () => {
	it('bringing down the walls takes rubble and webs too; unlocking finds every stash', () => {
		const session = quiet();
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'openWalls' });
		for (const wall of session.layout.walls ?? []) {
			expect(session.world.openDoors.has(wall.id), wall.kind ?? 'false').toBe(true);
		}
		expect(session['crates'].unseen().length).toBeGreaterThan(0);
		session.admin(diver.id, { kind: 'unlockCrates' });
		expect(session['crates'].unseen()).toEqual([]);
	});
});
