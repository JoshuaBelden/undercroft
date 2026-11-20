import { describe, expect, it, vi } from 'vitest';
import { LOOTABLES, type LootableId } from '../../src/lib/content/lootables.ts';
import { lootableCentre } from '../../src/lib/shared/items/lootables.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import { HAND } from '../../src/lib/shared/player/types.ts';
import type { Crate } from '../crates.ts';
import type { Session } from '../session.ts';
import { useSessions, Diver, kit } from '../testing/harness.ts';
import type { Inventory } from '../../src/lib/shared/player/types.ts';

/** Opening lootables of every kind (docs/dev/lootables.md). */

const open = useSessions();

/**
 * A session (on the first of these seeds that has one) and a diver standing in front of a
 * lootable of this kind, looking at it.
 */
function atLootable(
	kind: LootableId,
	carrying?: Inventory,
	which: (crate: Crate) => boolean = () => true
): { session: Session; diver: Diver; crate: Crate; look: { yaw: number; pitch: number } } {
	for (let seed = 1; seed <= 30; seed++) {
		const session = open(seed);
		session.admin('x', { kind: 'clearCreatures' });
		const diver = new Diver(session, 'A', carrying);
		for (const { crate, fromStart } of session['crates'].list()) {
			if ((crate.kind ?? 'crate') !== kind || !Number.isFinite(fromStart) || !which(crate))
				continue;
			const yaw = Number(session.layout.crates.find((c) => c.id === crate.id)?.yaw ?? 0);
			const front: Vec3 = [
				crate.position[0] + Math.sin(yaw) * 1.3,
				crate.position[1] + 0.05,
				crate.position[2] + Math.cos(yaw) * 1.3
			];
			diver.put(session['freeSpot'](front));
			diver.hold({}, 0.3);
			const look = diver.lookAt(lootableCentre(crate));
			diver.state.yaw = look.yaw;
			diver.state.pitch = look.pitch;
			const s = diver.state;
			const cp = Math.cos(s.pitch);
			const direction: Vec3 = [-Math.sin(s.yaw) * cp, Math.sin(s.pitch), -Math.cos(s.yaw) * cp];
			if (session['crates'].lookedAt(diver.eye, direction) === crate) {
				return { session, diver, crate, look };
			}
		}
	}
	throw new Error(`No ${kind} to stand at in the first 30 maps`);
}

const events = (diver: Diver) => diver.socket.all('tick').flatMap((t) => t.events);

describe('lootables', () => {
	it('a wall niche opens by hand in its own time, and is heard as far as it says', () => {
		const { session, diver, crate, look } = atLootable('niche', undefined, (c) => !c.lock);
		const heard = vi.spyOn(session['creatures'], 'hear');
		const seconds = LOOTABLES.niche.open[0].seconds;
		diver.hold({ ...look, interact: true }, seconds - 0.3);
		expect(diver.player.crate).toBeNull();
		diver.hold({ ...look, interact: true }, 0.5);
		expect(diver.player.crate).toBe(crate.id);
		expect(heard).toHaveBeenCalledWith(crate.position, LOOTABLES.niche.noise, null);
		expect(diver.socket.last('crate')!.slots).toHaveLength(LOOTABLES.niche.slots);
	});

	it('a bone pile takes longer to go through', () => {
		const { diver, crate, look } = atLootable('bonePile');
		diver.hold({ ...look, interact: true }, LOOTABLES.crate.open[0].seconds + 0.3);
		expect(diver.player.crate).toBeNull();
		diver.hold({ ...look, interact: true }, LOOTABLES.bonePile.open[0].seconds);
		expect(diver.player.crate).toBe(crate.id);
	});

	it('a sarcophagus only rattles without a crowbar; with one in the hand the lid goes', () => {
		const bare = atLootable('sarcophagus');
		bare.diver.hold({ ...bare.look, interact: true }, 8);
		expect(bare.diver.player.crate).toBeNull();
		expect(events(bare.diver).some((e) => e.kind === 'crateStuck')).toBe(true);

		const { diver, crate, look } = atLootable('sarcophagus', kit(['crowbar']));
		diver.hold({ ...look, select: HAND.primary }, 0.5);
		const way = LOOTABLES.sarcophagus.open[0];
		diver.hold({ ...look, interact: true }, way.seconds + 0.3);
		expect(diver.player.crate).toBe(crate.id);
		expect(events(diver).some((e) => e.kind === 'pry')).toBe(true);
	});

	it('a cocoon is cut open by hand, and faster with a blade in the hand', () => {
		const [slow, fast] = LOOTABLES.cocoon.open;
		const knife = atLootable('cocoon', kit(['knife']));
		knife.diver.hold({ ...knife.look, select: HAND.primary }, 0.5);
		knife.diver.hold({ ...knife.look, interact: true }, fast.seconds + 0.3);
		expect(knife.diver.player.crate).toBe(knife.crate.id);

		const bare = atLootable('cocoon');
		bare.diver.hold({ ...bare.look, interact: true }, fast.seconds + 0.3);
		expect(bare.diver.player.crate).toBeNull();
		bare.diver.hold({ ...bare.look, interact: true }, slow.seconds);
		expect(bare.diver.player.crate).toBe(bare.crate.id);
	});

	it('a sealed niche needs a crowbar, and opens once it gives', () => {
		// Bare-handed: it only rattles, however long interact is held.
		const bare = atLootable('niche');
		bare.crate.lock = 'locked';
		bare.diver.hold({ ...bare.look, interact: true }, 6);
		expect(bare.crate.lock).toBe('locked');
		expect(bare.diver.player.crate).toBeNull();

		const { diver, crate, look } = atLootable('niche', kit(['crowbar']));
		crate.lock = 'locked';
		diver.hold({ ...look, select: HAND.primary }, 0.5);
		diver.hold({ ...look, interact: true }, LOOTABLES.niche.sealed!.open[0].seconds + 0.3);
		expect(crate.lock).toBeNull();
		expect(diver.player.crate).toBe(crate.id);
	});

	it('the loot screen is sent for any kind, with its own number of slots', () => {
		const { diver, look } = atLootable('corpse');
		diver.hold({ ...look, interact: true }, LOOTABLES.corpse.open[0].seconds + 0.3);
		expect(diver.socket.last('crate')!.slots).toHaveLength(LOOTABLES.corpse.slots);
	});
});

describe('keys and the budget', () => {
	it('hides one key for every lock a key opens, never behind a lock or a tool', () => {
		for (const seed of [1, 2, 3, 4]) {
			const session = open(seed);
			const crates = session['crates'];
			const gates = session.layout.doors.filter((d) => d.kind === 'gate').length;
			const locks = crates.trunks().length + gates;
			const holding = crates
				.list()
				.filter(({ crate }) => crate.slots.some((s) => s?.item === 'key'))
				.map(({ crate }) => crate);
			expect(holding.reduce((n, c) => n + c.slots.filter((s) => s?.item === 'key').length, 0)).toBe(
				locks
			);
			for (const crate of holding) {
				expect(crate.lock).not.toBe('locked');
				expect(LOOTABLES[crate.kind ?? 'crate'].open.some((w) => !w.tool && !w.key)).toBe(true);
			}
		}
	});

	it("keeps each level's treasure within its budget", async () => {
		const { LOOT_BUDGET } = await import('../../src/lib/content/lootables.ts');
		const { treasureValue } = await import('../../src/lib/shared/items/loot.ts');
		for (const seed of [1, 2, 3, 5, 8]) {
			const session = open(seed);
			const byTier = new Map<number, number>();
			for (const placement of session.layout.crates) {
				const crate = session['crates'].get(placement.id)!;
				byTier.set(placement.tier, (byTier.get(placement.tier) ?? 0) + treasureValue(crate.slots));
			}
			for (const [tier, value] of byTier) {
				expect(value, `seed ${seed} level ${tier + 1}`).toBeLessThanOrEqual(LOOT_BUDGET[tier]);
			}
		}
	});
});

describe('hints', () => {
	it('only ever go where bare hands can get at them', async () => {
		const { crateSpots } = await import('../hints.ts');
		for (const seed of [1, 2, 3]) {
			const session = open(seed);
			const crates = session['crates'];
			for (const spot of crateSpots(crates, () => true)) {
				if (spot.kind !== 'crate' && spot.kind !== 'corpse') continue;
				const crate = crates.get(spot.crate)!;
				expect(crate.lock).toBeNull();
				expect(LOOTABLES[crate.kind ?? 'crate'].open.some((w) => !w.tool && !w.key)).toBe(true);
			}
		}
	});
});
