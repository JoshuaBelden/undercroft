import { describe, expect, it, vi } from 'vitest';
import { ITEMS, rarityOf } from '../../src/lib/content/items.ts';
import { CRATES } from '../../src/lib/content/loot.ts';
import { LOOTABLES } from '../../src/lib/content/lootables.ts';
import { crateCentre } from '../../src/lib/shared/map/crates.ts';
import { PIECES } from '../../src/lib/shared/map/pieces.generated.ts';
import { spawnPoint } from '../../src/lib/shared/map/points.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import type { Crate } from '../crates.ts';
import type { Session } from '../session.ts';
import { carriedCount } from '../../src/lib/shared/items/inventory.ts';
import { HAND } from '../../src/lib/shared/player/types.ts';
import { useSessions, Diver, kit } from '../testing/harness.ts';

const SEED = 1;
// On a generated map: the fixed map has no room for what these test yet (docs/dev/fixed-map.md#tests).
const open = useSessions({ generated: true });
const OPEN_SECONDS = LOOTABLES.crate.open[0].seconds;
const PRY_SECONDS = LOOTABLES.crate.sealed!.open[0].seconds;

/**
 * Stand a diver in front of a crate they can open, looking at it: by default a plain crate (not a
 * corpse, trunk or jammed one).
 */
function atCrate(
	session: Session,
	diver: Diver,
	which: (crate: Crate) => boolean = (crate) => !crate.kind && crate.lock === null
) {
	for (const { crate } of session['crates'].list()) {
		if (!which(crate)) continue;
		const yaw = Number(session.layout.crates.find((c) => c.id === crate.id)?.yaw ?? 0);
		const front: Vec3 = [
			crate.position[0] + Math.sin(yaw) * 1.3,
			crate.position[1] + 0.05,
			crate.position[2] + Math.cos(yaw) * 1.3
		];
		diver.put(session['freeSpot'](front));
		diver.hold({}, 0.3);
		const look = diver.lookAt(crateCentre(crate));
		diver.state.yaw = look.yaw;
		diver.state.pitch = look.pitch;
		const ray = diverRay(diver);
		if (session['crates'].lookedAt(ray.origin, ray.direction) === crate) return { crate, look };
	}
	throw new Error('No crate to stand at');
}

function diverRay(diver: Diver): { origin: Vec3; direction: Vec3 } {
	const s = diver.state;
	const cp = Math.cos(s.pitch);
	return {
		origin: diver.eye,
		direction: [-Math.sin(s.yaw) * cp, Math.sin(s.pitch), -Math.cos(s.yaw) * cp]
	};
}

describe('crates', () => {
	it('holding interact opens a crate, its slots are revealed one at a time and can be taken', () => {
		const session = open(SEED);
		session.admin('x', { kind: 'clearCreatures' });
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'clearCreatures' });
		const { crate, look } = atCrate(session, diver);
		diver.hold({ ...look, interact: true }, OPEN_SECONDS + 0.2);
		expect(diver.player.crate).toBe(crate.id);
		const opened = diver.socket.last('crate')!;
		expect(opened.id).toBe(crate.id);
		expect(opened.slots.filter((s) => s === 'hidden').length).toBeGreaterThan(0);
		diver.hold(look, CRATES.revealSeconds * 9);
		const view = diver.socket.last('crate')!;
		expect(view.slots.every((s) => s !== 'hidden')).toBe(true);
		const index = view.slots.findIndex((s) => s !== null && s !== 'hidden' && s.item !== 'clue');
		// Taking it is heard: the party's noise goes up.
		const quiet = session['creatures'].attraction;
		const heard = vi.spyOn(quiet, 'heard');
		session.inventory(diver.id, { kind: 'quick', from: { area: 'stash', index } });
		expect(crate.slots[index]).toBeNull();
		expect(heard).toHaveBeenCalledWith(LOOTABLES.crate.lootNoise, crate.position, diver.id);
		expect(diver.player.stats.crates).toBe(1);
		expect(diver.socket.last('tick')!.crates.open).toContain(crate.id);
		session.closeCrate(diver.id);
		expect(diver.player.crate).toBeNull();
		expect(diver.socket.last('crate')!.id).toBeNull();
		// Answered even when nothing is open.
		session.closeCrate(diver.id);
		expect(diver.socket.last('crate')!.id).toBeNull();
	});

	it('walking away shuts the crate', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'clearCreatures' });
		const { look } = atCrate(session, diver);
		diver.hold({ ...look, interact: true }, OPEN_SECONDS + 0.2);
		expect(diver.player.crate).not.toBeNull();
		diver.put(spawnPoint(session.layout, PIECES).position);
		diver.hold({}, 0.2);
		expect(diver.player.crate).toBeNull();
	});

	it('keeps rare and better for the crates on the third level', () => {
		// A map with a few plain crates on its third level (rooms hold their own kinds now).
		let session = open(SEED);
		for (let seed = SEED; seed < SEED + 20; seed++) {
			session = open(seed);
			if (session.layout.crates.filter((c) => !c.kind && c.tier === 2).length >= 4) break;
		}
		// Plain crates: other lootables have their own rarities by level (a sarcophagus, a stash).
		const tierOf = new Map(session.layout.crates.filter((c) => !c.kind).map((c) => [c.id, c.tier]));
		const found = { upper: new Set<string>(), deepest: new Set<string>() };
		for (let fill = 0; fill < 20; fill++) {
			for (const { crate } of session['crates'].list()) {
				if (!tierOf.has(crate.id)) continue;
				for (const stack of crate.slots) {
					const kind = stack && ITEMS[stack.item]?.kind;
					// Hints, the rite's own items and the trunks' keys are put in on top of the roll, anywhere.
					if (!stack || kind === 'clue' || kind === 'rite' || ITEMS[stack.item]?.unlocks) continue;
					found[tierOf.get(crate.id) === 2 ? 'deepest' : 'upper'].add(rarityOf(stack.item));
				}
			}
			session['crates'].fill();
		}
		expect([...found.upper].every((r) => r === 'common' || r === 'uncommon')).toBe(true);
		expect(found.deepest.has('rare')).toBe(true);
	});

	it('admin reset fills every crate again, shut', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'clearCreatures' });
		const { look } = atCrate(session, diver);
		diver.hold({ ...look, interact: true }, OPEN_SECONDS + 0.2);
		session.admin(diver.id, { kind: 'resetCrates' });
		expect(diver.player.crate).toBeNull();
		expect(session['crates'].snapshot().open).toEqual([]);
	});

	it('a jammed crate is found stuck; then it takes a crowbar in the hand and ten loud seconds', () => {
		const session = open(SEED);
		session.admin('x', { kind: 'clearCreatures' });
		const diver = new Diver(session, 'A', kit(['crowbar', 1]));
		const { crate, look } = atCrate(session, diver);
		// A crate stuck fast (few maps have one in reach of a test: make this one).
		crate.lock = 'jammed';
		diver.hold({ ...look, interact: true }, OPEN_SECONDS + 0.2);
		expect(diver.player.crate).toBeNull();
		expect(crate.jamFound).toBe(true);
		expect(diver.socket.last('tick')!.crates.jammed).toContain(crate.id);
		// Holding on does nothing more: the press was spent finding the jam.
		diver.hold({ ...look, interact: true }, 1);
		expect(diver.state.opening).toBe(0);
		// The crowbar in the hand, a fresh hold: prying.
		const slot = HAND.primary;
		diver.hold({ ...look, select: slot }, 1);
		const noise = vi.spyOn(session['creatures'], 'hear');
		diver.hold({ ...look, interact: true }, PRY_SECONDS / 2);
		expect(diver.player.crate).toBeNull();
		expect(noise).toHaveBeenCalled();
		diver.hold({ ...look, interact: true }, PRY_SECONDS / 2 + 0.3);
		expect(crate.lock).toBeNull();
		expect(diver.player.crate).toBe(crate.id);
	});

	it('a jammed crate does not give without something to pry it with', () => {
		const session = open(SEED);
		session.admin('x', { kind: 'clearCreatures' });
		const diver = new Diver(session);
		const { crate, look } = atCrate(session, diver);
		// A crate stuck fast (few maps have one in reach of a test: make this one).
		crate.lock = 'jammed';
		crate.jamFound = true;
		diver.hold({ ...look, interact: true }, PRY_SECONDS + 1);
		expect(crate.lock).toBe('jammed');
		expect(diver.player.crate).toBeNull();
	});

	it('a locked trunk takes a key, used up by one press; then it is searched like a crate', () => {
		const session = openWithTrunk();
		const diver = new Diver(session, 'A', kit(['key', 2]));
		const { crate, look } = atCrate(session, diver, (c) => c.kind === 'trunk');
		expect(crate.lock).toBe('locked');
		diver.hold({ ...look, interact: true }, OPEN_SECONDS + 0.5);
		expect(crate.lock).toBeNull();
		expect(carriedCount(diver.state.inventory, 'key')).toBe(1);
		// The press turned the key: no opening until it is let go and held again.
		expect(diver.player.crate).toBeNull();
		diver.hold(look, 0.1);
		diver.hold({ ...look, interact: true }, OPEN_SECONDS + 0.2);
		expect(diver.player.crate).toBe(crate.id);
		// Something epic or legendary in it, among the rest.
		const rarities = crate.slots.flatMap((s) => (s ? [rarityOf(s.item)] : []));
		expect(rarities.some((r) => r === 'epic' || r === 'legendary')).toBe(true);
	});

	it('without a key a trunk stays locked', () => {
		const session = openWithTrunk();
		const diver = new Diver(session);
		const { crate, look } = atCrate(session, diver, (c) => c.kind === 'trunk');
		diver.hold({ ...look, interact: true }, OPEN_SECONDS * 3);
		expect(crate.lock).toBe('locked');
		expect(diver.player.crate).toBeNull();
		expect(diver.socket.last('tick')!.crates.locked).toContain(crate.id);
	});

	it('every trunk and gate has its key in a crate that is neither locked nor jammed', () => {
		for (const seed of [1, 2, 3]) {
			const session = open(seed);
			const crates = session['crates'].list().map(({ crate }) => crate);
			const trunks = crates.filter((c) => c.kind === 'trunk');
			const keys = crates.flatMap((c) => c.slots.filter((s) => s?.item === 'key').map(() => c));
			const gates = session.layout.doors.filter((d) => d.kind === 'gate').length;
			expect(keys.length, `seed ${seed}`).toBe(trunks.length + gates);
			for (const c of keys) expect(c.lock).toBeNull();
		}
	});

	/** Seed 4's map has a locked trunk (seeds 1 to 3 have none). */
	function openWithTrunk(): Session {
		const session = open(4);
		session.admin('x', { kind: 'clearCreatures' });
		expect(session['crates'].trunks().length).toBeGreaterThan(0);
		return session;
	}
});
