import { describe, expect, it } from 'vitest';
import { PIECES } from '../../src/lib/shared/map/pieces.generated.ts';
import { testPoints } from '../../src/lib/shared/map/points.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import { Diver, useSessions } from '../testing/harness.ts';

const open = useSessions();

function flat(a: Vec3, b: Vec3): number {
	return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

describe('admin teleports to things to try out', () => {
	it('lands by the ledge hall, each false wall, a locked trunk, a stuck crate and the Pendant', () => {
		// Seed 4's map has a trunk, a ledge hall and false walls.
		const session = open(4);
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'clearCreatures' });
		const points = testPoints(session.layout, PIECES);
		const names = points.map((p) => p.name);
		expect(names).toContain('locked-trunk');
		expect(names).toContain('false-wall-1');
		for (const { name, position } of points) {
			session.admin(diver.id, { kind: 'teleport', room: name });
			expect(flat(diver.state.position, position), name).toBeLessThan(1.5);
		}

		session.admin(diver.id, { kind: 'teleport', room: 'stuck-crate' });
		const jammed = session['crates'].list().find(({ crate }) => crate.lock === 'jammed')!.crate;
		expect(flat(diver.state.position, jammed.position)).toBeLessThan(2.5);

		// The Pendant lies on the chapel's altar: in front of it, where the rite is performed.
		session.admin(diver.id, { kind: 'teleport', room: 'pendant' });
		const pendant = session['items'].snapshots().find((i) => i.item === 'pendant')!;
		expect(flat(diver.state.position, pendant.position)).toBeLessThan(2.5);
		expect(pendant.position[1] - diver.state.position[1]).toBeGreaterThan(1);
	});
});
