import { describe, expect, it, vi } from 'vitest';
import { ITEMS, rarityOf } from '../../src/lib/content/items.ts';
import { CRATES } from '../../src/lib/content/loot.ts';
import { crateCentre } from '../../src/lib/shared/map/crates.ts';
import { PIECES } from '../../src/lib/shared/map/pieces.generated.ts';
import { spawnPoint } from '../../src/lib/shared/map/points.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import type { Session } from '../session.ts';
import { useSessions, Diver } from '../testing/harness.ts';

const SEED = 1;
const open = useSessions();

/** Stand a diver in front of a crate (not a corpse) they can open, looking at it. */
function atCrate(session: Session, diver: Diver) {
	for (const { crate } of session['crates'].list()) {
		if (crate.kind) continue;
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
		diver.hold({ ...look, interact: true }, CRATES.openSeconds + 0.2);
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
		expect(heard).toHaveBeenCalledWith(CRATES.lootNoise, crate.position, diver.id);
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
		diver.hold({ ...look, interact: true }, CRATES.openSeconds + 0.2);
		expect(diver.player.crate).not.toBeNull();
		diver.put(spawnPoint(session.layout, PIECES).position);
		diver.hold({}, 0.2);
		expect(diver.player.crate).toBeNull();
	});

	it('keeps rare and better for the crates on the third level', () => {
		const session = open(SEED);
		const tierOf = new Map(session.layout.crates.map((c) => [c.id, c.tier]));
		const found = { upper: new Set<string>(), deepest: new Set<string>() };
		for (let fill = 0; fill < 10; fill++) {
			for (const { crate } of session['crates'].list()) {
				for (const stack of crate.slots) {
					const kind = stack && ITEMS[stack.item]?.kind;
					// Hints and the rite's own items are put in on top of the roll, anywhere.
					if (!stack || kind === 'clue' || kind === 'rite') continue;
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
		diver.hold({ ...look, interact: true }, CRATES.openSeconds + 0.2);
		session.admin(diver.id, { kind: 'resetCrates' });
		expect(diver.player.crate).toBeNull();
		expect(session['crates'].snapshot().open).toEqual([]);
	});
});
