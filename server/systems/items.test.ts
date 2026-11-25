import { afterEach, describe, expect, it, vi } from 'vitest';
import { ITEMS } from '../../src/lib/content/items.ts';
import { TAROT } from '../../src/lib/content/tarot.ts';
import { carriedCount, newStack } from '../../src/lib/shared/items/inventory.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import { applyCondition, hasCondition } from '../../src/lib/shared/player/conditions.ts';
import { HAND } from '../../src/lib/shared/player/types.ts';
import { crosses } from '../creatures.ts';
import type { Session } from '../session.ts';
import { Diver, kit, useSessions } from '../testing/harness.ts';

/**
 * The round's items on the server (docs/dev/items.md): grave dirt, laudanum, bait, tripwire bells,
 * glow sticks, the censer, gear that wears by the second, bait spoiling, the tarot draw, the whistle
 * and the sledgehammer's stagger.
 */

afterEach(() => vi.restoreAllMocks());

const SEED = 1;
const open = useSessions();

function quiet(): Session {
	const session = open(SEED);
	session.admin('x', { kind: 'clearCreatures' });
	return session;
}

/** A creature of a kind, spawned near the diver and stood at a spot. */
function creatureAt(session: Session, diver: Diver, at: Vec3, kind = 'witch') {
	session.admin(diver.id, { kind: 'spawnCreature', creature: kind });
	const c = session['creatures']['creatures'].at(-1)!;
	c.body.position = [...at];
	return c;
}

const events = (diver: Diver) => diver.socket.all('tick').flatMap((t) => t.events);

describe('grave dirt and laudanum', () => {
	it('grave dirt: whatever was chasing you loses you', () => {
		const session = quiet();
		const diver = new Diver(session);
		diver.state.flags.godMode = true;
		const c = creatureAt(session, diver, [
			diver.state.position[0],
			diver.state.position[1],
			diver.state.position[2] - 3
		]);
		session['creatures']['chase'](c, { id: diver.id, state: diver.state });
		expect(c.target).toBe(diver.id);
		applyCondition(diver.state, 'buried');
		diver.hold({}, c.def.perception.evadeTime + 1);
		expect(c.target === diver.id && c.mode === 'agro').toBe(false);
	});

	it('laudanum: the dark costs no sanity while it lasts', () => {
		const session = quiet();
		const calm = new Diver(session, 'A');
		const other = new Diver(session, 'B');
		for (const d of [calm, other]) d.state.headlamp = 0;
		other.put(calm.state.position);
		applyCondition(calm.state, 'laudanum');
		const before = [calm.state.sanity, other.state.sanity];
		calm.hold({}, 2);
		expect(calm.state.sanity).toBe(before[0]);
		expect(other.state.sanity).toBeLessThan(before[1]);
	});
});

describe('bait, glow sticks and tripwire bells', () => {
	function land(session: Session, diver: Diver, item: string, at: Vec3): void {
		session.systems.hazards.landed({
			kind: 'land',
			item,
			position: at,
			noise: 2,
			thrower: diver.id
		});
	}

	it('bait draws rats to it, off whoever they were after', () => {
		const session = quiet();
		const diver = new Diver(session);
		diver.state.flags.godMode = true;
		const at: Vec3 = [...diver.state.position];
		const rat = creatureAt(session, diver, [at[0] + 2, at[1], at[2]], 'rat');
		session['creatures']['chase'](rat, { id: diver.id, state: diver.state });
		land(session, diver, 'bait', [at[0] + 3, at[1], at[2]]);
		diver.hold({}, 0.3);
		expect(session.systems.hazards.snapshot().baits).toHaveLength(1);
		expect(rat.target).toBeNull();
		expect(rat.alertPoint?.[0]).toBeCloseTo(at[0] + 3, 0);
	});

	it('a glow stick lights where it lands, and fades', () => {
		const session = quiet();
		const diver = new Diver(session);
		land(session, diver, 'glow-sticks', [...diver.state.position]);
		diver.hold({}, 0.2);
		const [glow] = session.systems.hazards.snapshot().glows;
		expect(glow).toBeDefined();
		expect(session['creatures'].glows).toHaveLength(1);
		session.systems.hazards['glows'][0].left = 0.1;
		diver.hold({}, 0.3);
		expect(session.systems.hazards.snapshot().glows).toHaveLength(0);
	});

	it('a tripwire rings when something crosses it, and the party is told', () => {
		const session = quiet();
		const diver = new Diver(session);
		diver.state.flags.godMode = true;
		const s = diver.state;
		session.systems.hazards.simulated(diver.player, {
			events: [
				{
					kind: 'place',
					item: 'tripwire-bell',
					origin: [s.position[0], s.position[1] + 1.6, s.position[2]],
					direction: [0, -0.2, -1]
				}
			]
		} as never);
		const [wire] = session.systems.hazards.snapshot().tripwires;
		expect(wire).toBeDefined();
		const mid: Vec3 = [(wire.a[0] + wire.b[0]) / 2, wire.a[1], (wire.a[2] + wire.b[2]) / 2];
		const across: Vec3 = [wire.b[2] - wire.a[2], 0, wire.a[0] - wire.b[0]];
		const len = Math.hypot(across[0], across[2]);
		const side = (k: number): Vec3 => [
			mid[0] + (across[0] / len) * k,
			mid[1],
			mid[2] + (across[2] / len) * k
		];
		expect(crosses(side(-0.5), side(0.5), { a: wire.a, b: wire.b })).toBe(true);
		const c = creatureAt(session, diver, side(-0.5));
		c.held = 10;
		diver.hold({}, 0.1);
		c.body.position = side(0.5);
		diver.hold({}, 0.1);
		expect(events(diver).some((e) => e.kind === 'tripwire')).toBe(true);
	});
});

describe('the censer', () => {
	it('held, rats won’t come into its smoke; it burns down while held', () => {
		const session = quiet();
		const diver = new Diver(session, 'A', kit(['censer', 1]));
		diver.hold({ select: HAND.quick }, 0.5);
		diver.hold({ select: HAND.quick }, 0.2);
		const [smoke] = session['creatures'].repels;
		expect(smoke?.kinds).toContain('rat');
		expect(smoke.radius).toBe(ITEMS.censer.censer!.radius);
		const censer = diver.state.inventory.quick.find((q) => q?.item === 'censer')!;
		expect(censer.worn ?? 0).toBeGreaterThan(0);
	});
});

describe('gear by the second', () => {
	it('kneepads wear while their wearer crawls, not while they stand', () => {
		const session = quiet();
		const diver = new Diver(session);
		diver.state.inventory.equipment.gear1 = newStack('kneepads');
		diver.hold({ moveZ: 1 }, 1);
		expect(diver.state.inventory.equipment.gear1?.worn ?? 0).toBe(0);
		diver.hold({ stance: 'crawl' }, 0.5);
		diver.hold({ stance: 'crawl', moveZ: 1 }, 2);
		expect(diver.state.inventory.equipment.gear1?.worn ?? 0).toBeGreaterThan(0.5);
	});
});

describe('the end of a run', () => {
	it('bait doesn’t keep: gone once you are out', () => {
		const session = quiet();
		const diver = new Diver(session, 'A', kit(['bait', 2], ['coins', 3]));
		diver.climbOut();
		const out = diver.socket.last('extracted')!;
		expect(out.carried).toEqual([{ item: 'coins', count: 3 }]);
	});
});

describe('the tarot', () => {
	it('carried down, a card is drawn once, and does what it says', () => {
		const session = quiet();
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const diver = new Diver(session, 'A', kit(['tarot', 1]));
		diver.state.battery = 0.5;
		diver.hold({}, 0.1);
		const drawn = events(diver).filter((e) => e.kind === 'tarot');
		expect(drawn).toHaveLength(1);
		const card = TAROT[0];
		expect(drawn[0].kind === 'tarot' && drawn[0].card).toBe(card.id);
		expect(carriedCount(diver.state.inventory, 'tarot')).toBe(1);
	});

	it('every card does something', () => {
		for (const card of TAROT) expect(Object.keys(card.effect).length, card.id).toBeGreaterThan(0);
	});

	it('a curse that hobbles, hobbles', () => {
		const session = quiet();
		const diver = new Diver(session);
		const tower = TAROT.find((c) => c.effect.condition?.id === 'hobble')!;
		session.systems.tarot.apply(diver.player, tower);
		expect(hasCondition(diver.state, 'hobble')).toBe(true);
	});
});

describe('the whistle and the sledgehammer', () => {
	it('a whistle is heard far, and the party is shown where', () => {
		const session = quiet();
		const diver = new Diver(session, 'A', kit(['whistle', 1]));
		diver.hold({ select: HAND.quick }, 0.5);
		const hear = vi.spyOn(session['creatures'], 'hear');
		diver.hold({ select: HAND.quick, attack: true }, 0.1);
		expect(hear).toHaveBeenCalledWith(
			expect.anything(),
			ITEMS.whistle.whistle!.noise,
			expect.anything()
		);
		expect(events(diver).some((e) => e.kind === 'whistle')).toBe(true);
	});

	it('a sledgehammer’s blow staggers long', () => {
		const session = quiet();
		const diver = new Diver(session);
		const c = creatureAt(session, diver, [...diver.state.position]);
		session['creatures'].stagger(c.id, ITEMS.sledgehammer.melee!.stagger!);
		expect(c.staggered).toBe(ITEMS.sledgehammer.melee!.stagger);
	});
});
