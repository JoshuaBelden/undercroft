import { describe, expect, it, vi } from 'vitest';
import { AFFLICTIONS } from '../../src/lib/content/afflictions.ts';
import { MAP_KIT } from '../../src/lib/content/map/kit.ts';
import { floorHeightAt, unsealExtracts } from '../../src/lib/shared/map/collision.ts';
import { PIECES } from '../../src/lib/shared/map/pieces.generated.ts';
import { pitonAnchor } from '../../src/lib/shared/items/rope.ts';
import { worldSpots } from '../../src/lib/shared/map/spots.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import type { Session } from '../session.ts';
import { Diver, kit, useSessions } from '../testing/harness.ts';

/** Rumors, the training ground (docs/dev/rumors.md): its map, dummies, tutorial and rules. */

// On a generated map: the fixed map has no room for what these test yet (docs/dev/fixed-map.md#tests).

const open = useSessions({ generated: true });
const SPEC = AFFLICTIONS.rumors.training!;

function rumors(hooks = {}): Session {
	return open(1, hooks, 'rumors');
}

describe('the Rumors map', () => {
	it('is the start, the walk and the vault, every other opening a dead end; a web and rubble off the vault', () => {
		for (const seed of [1, 2, 3, 4, 5]) {
			const layout = open(seed, {}, 'rumors').layout;
			const roles = layout.placements.map((p) => MAP_KIT[p.piece]?.role);
			expect(roles[0]).toBe('start');
			const pieces = layout.placements.map((p) => p.piece);
			expect(pieces.filter((p) => p === SPEC.walk)).toHaveLength(1);
			expect(pieces.filter((p) => p === SPEC.vault)).toHaveLength(1);
			// Nothing else to get lost in: no other room, no stairs, no doors.
			expect(roles.filter((r) => r === 'major' || r === 'extraction' || r === 'descent')).toEqual([
				'major'
			]);
			expect(layout.doors).toEqual([]);
			expect((layout.walls ?? []).map((w) => w.kind).sort()).toEqual(['rubble', 'web']);
			expect(layout.crates).toHaveLength(SPEC.crates.length);
		}
	});
});

describe('the training vault', () => {
	it('has its dummies at their spots, and no other creature, nothing drawn to noise or light', () => {
		const session = rumors();
		const diver = new Diver(session);
		const creatures = session['creatures']['creatures'];
		expect(creatures.map((c) => c.def.id)).toEqual(SPEC.dummies.map(() => 'dummy'));
		session['creatures'].attraction.fill('noise');
		diver.state.headlamp = 2;
		diver.hold({}, 5);
		expect(session['creatures']['creatures'].every((c) => c.def.id === 'dummy')).toBe(true);
	});

	it('a dummy never dies: each hit is told, and taking all of it, it is whole again', () => {
		const session = rumors();
		const diver = new Diver(session);
		const dummy = session['creatures']['creatures'][0];
		session['creatures'].damage(dummy.id, 30, { id: diver.id, state: diver.state });
		expect(dummy.wounds).toBe(30);
		session['creatures'].damage(dummy.id, 500, { id: diver.id, state: diver.state });
		expect(dummy.mode).not.toBe('dead');
		expect(dummy.wounds).toBe(0);
		diver.hold({}, 0.1);
		const events = diver.socket.all('tick').flatMap((t) => t.events);
		expect(
			events.filter((e) => e.kind === 'dummyHit').map((e) => e.kind === 'dummyHit' && e.amount)
		).toEqual([30, 500]);
		expect(events.some((e) => e.kind === 'dummyReset')).toBe(true);
	});

	it('the one on the track runs side to side', () => {
		const session = rumors();
		const diver = new Diver(session);
		const track = worldSpots(session.layout, PIECES).find((s) => s.name === 'track')!;
		const runner = session['creatures']['creatures'].find(
			(c) =>
				Math.hypot(c.body.position[0] - track.position[0], c.body.position[2] - track.position[2]) <
				0.1
		)!;
		const before = [...runner.body.position];
		diver.hold({}, 1.5);
		expect(
			Math.hypot(runner.body.position[0] - before[0], runner.body.position[2] - before[2])
		).toBeGreaterThan(1);
	});
});

describe('the piton ledge', () => {
	it('has nothing to tie to, a piton goes in at its edge, and the pitons and a rope lie on it', () => {
		const session = rumors();
		new Diver(session);
		const spots = worldSpots(session.layout, PIECES);
		const on = spots.find((s) => s.name === 'pitons')!;
		const foot = spots.find((s) => s.name === 'step-piton')!;
		// From the foot of the steps toward the pitons is the way to the ledge's far edge.
		const out: Vec3 = [on.position[0] - foot.position[0], 0, on.position[2] - foot.position[2]];
		const length = Math.hypot(out[0], out[2]);
		const way: Vec3 = [out[0] / length, 0, out[2] / length];
		expect(on.position[1]).toBeGreaterThan(2);
		// Standing on the ledge, facing back the way the steps came: no drop there, no piton.
		expect(pitonAnchor(session.world, on.position, [-way[0], 0, -way[2]], 'piton-0')).toBeNull();
		// A step from the edge, facing over it: a piton goes in, over a drop of 2 m or more.
		const feet: Vec3 = [
			on.position[0] + way[0] * 0.6,
			on.position[1],
			on.position[2] + way[2] * 0.6
		];
		const piton = pitonAnchor(session.world, feet, way, 'piton-0');
		expect(piton).not.toBeNull();
		expect(piton!.position[1] - piton!.bottom).toBeGreaterThanOrEqual(2);
		// The rope hangs clear of the ledge, from its very edge, even hammered in from further back.
		const clear = (anchor: typeof piton) =>
			floorHeightAt(
				session.world,
				anchor!.top[0],
				anchor!.top[2],
				anchor!.position[1] + 0.4,
				anchor!.position[1] - 0.4
			);
		expect(clear(piton)).toBeNull();
		const back = pitonAnchor(session.world, on.position, way, 'piton-1');
		expect(back).not.toBeNull();
		expect(clear(back)).toBeNull();
		expect(
			Math.hypot(back!.position[0] - piton!.position[0], back!.position[2] - piton!.position[2])
		).toBeLessThan(0.1);
		const items = session['items'].snapshots().map((s) => s.item);
		expect(items).toEqual(expect.arrayContaining(['pitons', 'rope-bundle']));
	});
});

describe('the tutorial', () => {
	it('the first time, its crates and things hold what it teaches with', () => {
		const session = rumors();
		const crates = session['crates'].list().map(({ crate }) => crate);
		expect(crates.map((c) => c.slots.filter(Boolean).map((s) => s!.item))).toEqual(
			SPEC.crates.map((holds) => holds.map((h) => h.item))
		);
		const floor = session['items'].snapshots().map((s) => s.item);
		expect(floor).toContain('crafting-kit');
		expect(floor).toContain('chalk');
	});

	it('after that, they are empty (the bricks are always there)', () => {
		const session = rumors();
		session.tutorial(false);
		const crates = session['crates'].list().map(({ crate }) => crate);
		expect(crates.every((c) => c.slots.every((s) => s === null))).toBe(true);
		const floor = session['items'].snapshots().map((s) => s.item);
		expect(floor).not.toContain('crafting-kit');
		expect(floor).toContain('brick');
	});
});

describe('the rules', () => {
	it('things hurt, but nobody goes down', () => {
		const session = rumors();
		const diver = new Diver(session);
		session.hurt(diver.player, 10_000);
		expect(diver.state.downed).toBe(false);
		expect(diver.state.sanity).toBe(1);
	});

	it('getting out is what counts: it is told, for what it unlocks', () => {
		const trained = vi.fn();
		const session = rumors({ onTrained: trained });
		const diver = new Diver(session, 'A', kit(['bandage', 1]));
		const owner = diver.player.owner;
		unsealExtracts(session.world);
		const point = session.world.extracts[0];
		diver.put(session['freeSpot']([point[0], point[1] - 0.3, point[2]]));
		diver.hold({}, 0.5);
		diver.hold({ interact: true }, 4);
		expect(diver.socket.last('extracted')).toBeDefined();
		expect(trained).toHaveBeenCalledWith(owner);
	});

	it('the Gloaming requires it', () => {
		expect(AFFLICTIONS.gloaming.requires).toBe('rumors');
		expect(AFFLICTIONS.rumors.requires).toBeUndefined();
	});
});
