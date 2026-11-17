import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROPE } from '../src/lib/content/rope.ts';
import { addItem, emptyInventory, newStack } from '../src/lib/shared/items/inventory.ts';
import { ropeNeeded } from '../src/lib/shared/items/rope.ts';
import { segmentHit, type Anchor } from '../src/lib/shared/map/collision.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';
import { FLOOR, worldOf } from '../src/lib/shared/testing/maps.ts';
import { HAND, type Inventory } from '../src/lib/shared/player/types.ts';
import { config } from './config.ts';
import { Ropes } from './ropes.ts';
import type { Session } from './session.ts';
import { Diver, fakeTime, newSession } from './testing/harness.ts';

const SEED = 4242;
let sessions: Session[] = [];

function open(seed = SEED): Session {
	const session = newSession(seed);
	sessions.push(session);
	return session;
}

beforeEach(() => {
	fakeTime();
	config.devMode = true;
});
afterEach(() => {
	for (const session of sessions) session.stop();
	sessions = [];
	vi.useRealTimers();
	config.devMode = false;
});

function kit(...items: string[]): Inventory {
	const inv = emptyInventory();
	for (const item of items) addItem(inv, newStack(item));
	return inv;
}

/** A heading from where the diver stands with open floor for `metres` ahead at knee height. */
function openHeading(session: Session, diver: Diver, metres: number): number {
	const p = diver.state.position;
	for (let i = 0; i < 32; i++) {
		const yaw = (i / 32) * Math.PI * 2;
		const from: Vec3 = [p[0], p[1] + 0.5, p[2]];
		const to: Vec3 = [from[0] - Math.sin(yaw) * metres, from[1], from[2] - Math.cos(yaw) * metres];
		if (segmentHit(session['world'], from, to) === null) return yaw;
	}
	throw new Error('Nowhere open to walk');
}

describe('Ropes', () => {
	it('lays a point every ROPE.spacing metres, on the floor, while the rope lasts', () => {
		const world = worldOf([FLOOR]);
		const ropes = new Ropes();
		const rope = ropes.start('a', 'A', 'rope-pack', [0, 0, 0]);
		expect(ropes.extend(world, rope, [0.3, 0, 0], 10)).toBe(0);
		const used = ropes.extend(world, rope, [2.2, 0.3, 0], 10);
		expect(used).toBeCloseTo(4 * ROPE.spacing, 6);
		expect(rope.points).toHaveLength(5);
		// Snapped onto the floor, not left at the feet's height.
		expect(rope.points.every((p) => Math.abs(p[1]) < 1e-6)).toBe(true);
		expect(ropes.takeGrowth()).toEqual([{ id: rope.id, points: rope.points.slice(1) }]);
		expect(ropes.takeGrowth()).toEqual([]);
		// Only what is left gets laid.
		expect(ropes.extend(world, rope, [10, 0, 0], 1.2)).toBeCloseTo(2 * ROPE.spacing, 6);
	});

	it('a rope stopped before it went anywhere is gone; past the most, the oldest goes', () => {
		const ropes = new Ropes();
		ropes.start('a', 'A', 'rope-pack', [0, 0, 0]);
		expect(ropes.stop('a')).toBeNull();
		expect(ropes.laidList()).toHaveLength(0);
		const world = worldOf([FLOOR]);
		for (let i = 0; i < ROPE.max + 2; i++) {
			const rope = ropes.start('a', 'A', 'rope-pack', [0, 0, i]);
			ropes.extend(world, rope, [2, 0, i], 10);
			ropes.stop('a');
		}
		expect(ropes.laidList()).toHaveLength(ROPE.max);
		expect(ropes.laidList()[0].points[0][2]).toBe(2);
	});

	it('ties one rope per anchor and gives it back untied', () => {
		const ropes = new Ropes();
		ropes.tie({ anchor: 'anchor-0', by: 'a', name: 'A', item: 'rope-bundle' });
		expect(ropes.tiedAt('anchor-0')?.item).toBe('rope-bundle');
		expect(ropes.untie('anchor-0')?.item).toBe('rope-bundle');
		expect(ropes.untie('anchor-0')).toBeNull();
	});
});

/** Everything they carry, as item ids. */
function carried(diver: Diver): string[] {
	const inv = diver.state.inventory;
	return [...inv.quick, ...inv.backpack].flatMap((stack) => (stack ? [stack.item] : []));
}

describe('laying rope in an expedition', () => {
	it('holding attack lays it as you walk; letting go uses up the pack; gathering it gives it back', () => {
		const session = open();
		const diver = new Diver(session, 'A', kit('rope-pack'));
		session.admin(diver.id, { kind: 'clearCreatures' });
		diver.hold({ select: HAND.quick }, 0.5);
		const yaw = openHeading(session, diver, 5);
		diver.hold({ select: HAND.quick, yaw, attack: true }, 0.1);
		expect(diver.socket.last('ropes')!.laid[0].laying).toBe(true);
		diver.hold({ select: HAND.quick, yaw, attack: true, moveZ: 1 }, 1.6);
		expect(diver.socket.all('ropeGrow').length).toBeGreaterThan(0);
		// Still in hand while it lays.
		expect(carried(diver)).toEqual(['rope-pack']);
		diver.hold({ yaw }, 0.1);
		const laid = diver.socket.last('ropes')!.laid;
		expect(laid).toHaveLength(1);
		expect(laid[0]).toMatchObject({ laying: false, item: 'rope-pack' });
		expect(laid[0].points.length).toBeGreaterThan(4);
		// A few metres of a hundred, and the whole pack is gone.
		expect(carried(diver)).toEqual([]);
		expect(diver.state.inventory.selected).toBe(HAND.primary);

		diver.hold({ yaw, interact: true }, ROPE.pickupSeconds + 0.3);
		expect(diver.socket.last('ropes')!.laid).toEqual([]);
		expect(carried(diver)).toEqual(['rope-pack']);
	});

	it('letting go before any was laid keeps the rope', () => {
		const session = open();
		const diver = new Diver(session, 'A', kit('rope-bundle'));
		session.admin(diver.id, { kind: 'clearCreatures' });
		diver.hold({ select: HAND.quick }, 0.5);
		diver.press({ select: HAND.quick, attack: true });
		expect(diver.socket.last('ropes')!.laid).toEqual([]);
		expect(carried(diver)).toEqual(['rope-bundle']);
	});

	it('putting the rope away stops it where it lies, used up', () => {
		const session = open();
		const diver = new Diver(session, 'A', kit('rope-pack'));
		session.admin(diver.id, { kind: 'clearCreatures' });
		diver.hold({ select: HAND.quick }, 0.5);
		const yaw = openHeading(session, diver, 3);
		diver.hold({ select: HAND.quick, yaw, attack: true, moveZ: 1 }, 1);
		diver.hold({ select: HAND.primary, yaw, attack: true }, 0.2);
		expect(diver.socket.last('ropes')!.laid[0]?.laying).toBe(false);
		expect(carried(diver)).toEqual([]);
	});
});

describe('tying rope at an anchor', () => {
	/** An anchor where the diver stands, over a drop `depth` deep (a stand-in for a drop room). */
	function anchorHere(session: Session, diver: Diver, depth: number): Anchor {
		const [x, y, z] = diver.state.position;
		const anchor: Anchor = {
			id: 'anchor-0',
			position: [x, y, z],
			top: [x + 0.45, y + 0.9, z],
			landing: [x - 0.15, y, z],
			knot: [x, y + 0.7, z - 0.4],
			lip: [x + 0.08, y, z],
			bottom: y - depth
		};
		session['world'].anchors.push(anchor);
		return anchor;
	}

	it('needs rope long enough; tying uses up the whole of it; untying gives it back', () => {
		const session = open();
		// A bundle (40 m) is too short for this drop; a pack (100 m) is long enough.
		const diver = new Diver(session, 'A', kit('rope-bundle', 'rope-pack'));
		const other = new Diver(session, 'B');
		session.admin(diver.id, { kind: 'clearCreatures' });
		const anchor = anchorHere(session, diver, 50);
		expect(ropeNeeded(anchor)).toBeGreaterThan(40);
		const bundle = diver.state.inventory.quick.findIndex((s) => s?.item === 'rope-bundle');
		const pack = diver.state.inventory.quick.findIndex((s) => s?.item === 'rope-pack');

		diver.hold({ select: HAND.quick + bundle }, 0.3);
		diver.hold({ select: HAND.quick + bundle, interact: true }, ROPE.tieSeconds + 0.3);
		expect(diver.socket.last('ropes')?.tied ?? []).toEqual([]);

		diver.hold({ select: HAND.quick + pack }, 0.3);
		diver.hold({ select: HAND.quick + pack, interact: true }, ROPE.tieSeconds + 0.3);
		expect(diver.socket.last('ropes')!.tied).toEqual([
			{ anchor: 'anchor-0', by: diver.id, name: 'A', item: 'rope-pack' }
		]);
		expect(other.socket.last('ropes')!.tied).toHaveLength(1);
		expect(session['world'].ropes.some((r) => r.id === 'tied-anchor-0')).toBe(true);
		expect(carried(diver)).toEqual(['rope-bundle']);

		// Someone on it: it won't come untied.
		other.state.climbing = { rope: 'tied-anchor-0', side: [1, 0] };
		diver.hold({ interact: true }, ROPE.tieSeconds + 0.3);
		expect(diver.socket.last('ropes')!.tied).toHaveLength(1);
		other.state.climbing = null;

		diver.hold({ interact: true }, ROPE.tieSeconds + 0.3);
		expect(diver.socket.last('ropes')!.tied).toEqual([]);
		expect(session['world'].ropes.some((r) => r.id === 'tied-anchor-0')).toBe(false);
		expect(carried(diver).sort()).toEqual(['rope-bundle', 'rope-pack']);
	});

	it('a late joiner is told the ropes', () => {
		const session = open();
		const diver = new Diver(session, 'A', kit('rope-pack'));
		session.admin(diver.id, { kind: 'clearCreatures' });
		diver.hold({ select: HAND.quick }, 0.5);
		const yaw = openHeading(session, diver, 3);
		diver.hold({ select: HAND.quick, yaw, attack: true, moveZ: 1 }, 1);
		const late = new Diver(session, 'B');
		expect(late.socket.last('ropes')!.laid).toHaveLength(1);
		session.admin(diver.id, { kind: 'clearRopes' });
		expect(late.socket.last('ropes')).toEqual({ type: 'ropes', laid: [], tied: [] });
	});
});
