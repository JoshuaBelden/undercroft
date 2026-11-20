import { describe, expect, it, vi } from 'vitest';
import { AFFLICTIONS } from '../../src/lib/content/afflictions.ts';
import { MAP_KIT } from '../../src/lib/content/map/kit.ts';
import { unsealExtracts } from '../../src/lib/shared/map/collision.ts';
import { PIECES } from '../../src/lib/shared/map/pieces.generated.ts';
import { worldSpots } from '../../src/lib/shared/map/spots.ts';
import type { Session } from '../session.ts';
import { Diver, kit, useSessions } from '../testing/harness.ts';

/** Rumors, the training ground (docs/dev/rumors.md): its map, dummies, tutorial and rules. */

const open = useSessions();
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
