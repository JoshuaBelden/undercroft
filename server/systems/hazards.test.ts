import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import { addTestItems, removeTestItems } from '../../src/lib/shared/testing/items.ts';
import { crosses } from '../creatures.ts';
import type { Session } from '../session.ts';
import { useSessions, Diver } from '../testing/harness.ts';

/** Fuses, fires, snares and lines of salt (server/systems/hazards.ts, docs/dev/combat.md). */

beforeAll(() => addTestItems());
afterAll(() => removeTestItems());

const SEED = 1;
const open = useSessions();

const events = (diver: Diver) => diver.socket.all('tick').flatMap((t) => t.events);

function quiet(session: Session) {
	session.admin('x', { kind: 'clearCreatures' });
}

/** A creature standing at a spot on the floor (spawned near the diver, then moved there). */
function creatureAt(session: Session, diver: Diver, at: Vec3) {
	session.admin(diver.id, { kind: 'spawnCreature' });
	const c = session['creatures']['creatures'].at(-1)!;
	c.body.position = [...at];
	return c;
}

describe('fuses', () => {
	it('a fuse lands hissing, and goes off its seconds later, heard far', () => {
		const session = open(SEED);
		quiet(session);
		const diver = new Diver(session);
		const at: Vec3 = [...diver.state.position];
		const hear = vi.spyOn(session['creatures'], 'hear');
		session.systems.hazards.landed({
			kind: 'land',
			item: 'test.firecracker',
			position: at,
			noise: 2,
			thrower: diver.id
		});
		diver.hold({}, 1);
		expect(events(diver).some((e) => e.kind === 'fuseLit')).toBe(true);
		expect(events(diver).some((e) => e.kind === 'fuseBang')).toBe(false);
		diver.hold({}, 1.5);
		expect(events(diver).some((e) => e.kind === 'fuseBang')).toBe(true);
		expect(hear).toHaveBeenCalledWith(at, 20, null);
	});
});

describe('fires', () => {
	it('burns an explorer standing in it, and goes out', () => {
		const session = open(SEED);
		quiet(session);
		const diver = new Diver(session);
		const before = diver.state.sanity;
		session.systems.hazards.landed({
			kind: 'land',
			item: 'test.oil',
			position: [...diver.state.position],
			noise: 2,
			thrower: diver.id
		});
		diver.hold({}, 1);
		expect(diver.state.sanity).toBeLessThan(before - 5);
		expect(diver.socket.last('tick')!.hazards.fires).toHaveLength(1);
		diver.hold({}, 3);
		expect(diver.socket.last('tick')!.hazards.fires).toHaveLength(0);
	});

	it('burns a creature in it, the kill the thrower’s', () => {
		const session = open(SEED);
		quiet(session);
		const diver = new Diver(session);
		diver.state.flags.godMode = true;
		const spot: Vec3 = [...diver.state.position];
		const c = creatureAt(session, diver, spot);
		const wounds = c.wounds;
		session.systems.hazards.landed({
			kind: 'land',
			item: 'test.oil',
			position: spot,
			noise: 2,
			thrower: diver.id
		});
		diver.hold({}, 0.5);
		expect(c.wounds).toBeGreaterThan(wounds);
	});
});

describe('placed things', () => {
	it('a snare holds the first creature through it, and is spent', () => {
		const session = open(SEED);
		quiet(session);
		const diver = new Diver(session);
		diver.state.flags.godMode = true;
		const s = diver.state;
		session.systems.hazards.simulated(diver.player, {
			events: [
				{
					kind: 'place',
					item: 'test.snare',
					origin: [s.position[0], s.position[1] + 1.6, s.position[2]],
					direction: [0, -0.2, -1]
				}
			]
		} as never);
		const snapshot = () => session.systems.hazards.snapshot();
		expect(snapshot().snares).toHaveLength(1);
		const c = creatureAt(session, diver, snapshot().snares[0].position);
		diver.hold({}, 0.2);
		expect(snapshot().snares).toHaveLength(0);
		expect(c.held).toBeGreaterThan(0);
		expect(events(diver).some((e) => e.kind === 'snared')).toBe(true);
	});

	it('salt laid across the way: creatures won’t cross its line while it lasts', () => {
		const session = open(SEED);
		quiet(session);
		const diver = new Diver(session);
		const s = diver.state;
		session.systems.hazards.simulated(diver.player, {
			events: [
				{
					kind: 'place',
					item: 'test.salt',
					origin: [s.position[0], s.position[1] + 1.6, s.position[2]],
					direction: [0, -0.2, -1]
				}
			]
		} as never);
		diver.hold({}, 0.1);
		const [ward] = session['creatures'].wards;
		expect(ward).toBeDefined();
		const mid: Vec3 = [(ward.a[0] + ward.b[0]) / 2, ward.a[1], (ward.a[2] + ward.b[2]) / 2];
		// Across the middle of the line, and alongside it.
		const across: Vec3 = [ward.b[2] - ward.a[2], 0, ward.a[0] - ward.b[0]];
		const len = Math.hypot(across[0], across[2]);
		const step = (k: number): Vec3 => [
			mid[0] + (across[0] / len) * k,
			mid[1],
			mid[2] + (across[2] / len) * k
		];
		expect(crosses(step(-0.3), step(0.3), ward)).toBe(true);
		expect(crosses(step(-0.6), step(-0.3), ward)).toBe(false);
	});
});

describe('bleeding', () => {
	it('a bleeding creature takes its wound’s damage over time, and stops', () => {
		const session = open(SEED);
		quiet(session);
		const diver = new Diver(session);
		diver.state.flags.godMode = true;
		const c = creatureAt(session, diver, [...diver.state.position]);
		expect(session['creatures'].bleed(c.id, 4, 1, null)).toBe(true);
		const before = c.wounds;
		diver.hold({}, 1.5);
		expect(c.wounds).toBeGreaterThan(before + 3);
		expect(c.wounds).toBeLessThan(before + 5);
		expect(c.bleed).toBeNull();
	});
});
