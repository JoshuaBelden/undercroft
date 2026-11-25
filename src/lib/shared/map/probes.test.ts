import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAP_PIECES } from './fixed.ts';
import { irradiance, PROBE_SIZE, readProbes, sampleProbes, type ProbeGrid } from './probes.ts';

/** A grid of 2x2x2 probes 1 m apart, each a uniform light of `level(x, y, z)` (all ways alike). */
function grid(level: (x: number, y: number, z: number) => number): ProbeGrid {
	const data = new Float32Array(8 * PROBE_SIZE);
	for (let y = 0; y < 2; y++) {
		for (let z = 0; z < 2; z++) {
			for (let x = 0; x < 2; x++) {
				const at = ((y * 2 + z) * 2 + x) * PROBE_SIZE;
				// Uniform radiance L projects onto Y00 only: L * Y00 * 4pi.
				const c0 = level(x, y, z) * 0.282095 * 4 * Math.PI;
				data.set([c0, c0, c0], at);
			}
		}
	}
	return { count: [2, 2, 2], origin: [0, 0, 0], spacing: [1, 1], data };
}

describe('light probes', () => {
	it('a uniform light of L gives an irradiance of pi L, whichever way a surface faces', () => {
		const sh = sampleProbes(
			grid(() => 2),
			[0.5, 0.5, 0.5]
		);
		for (const normal of [
			[0, 1, 0],
			[1, 0, 0],
			[0, 0, -1]
		] as [number, number, number][]) {
			expect(irradiance(sh, normal)[0]).toBeCloseTo(2 * Math.PI, 3);
		}
	});

	it('blends the eight probes round a point by how near each is, and clamps outside', () => {
		const ramp = grid((x) => x);
		const level = (p: [number, number, number]) =>
			irradiance(sampleProbes(ramp, p), [0, 1, 0])[0] / Math.PI;
		expect(level([0, 0, 0])).toBeCloseTo(0);
		expect(level([0.25, 0.5, 0.5])).toBeCloseTo(0.25);
		expect(level([1, 1, 1])).toBeCloseTo(1);
		expect(level([5, -3, 9])).toBeCloseTo(1);
	});

	it('light from above lights a surface facing up, not one facing down', () => {
		// All of it from straight up: c0 = L Y00 dw, c1 (the y term) = L Y1 dw.
		const sh = new Float32Array(PROBE_SIZE);
		sh.set([1, 1, 1], 0);
		sh.set([1.732, 1.732, 1.732], 3);
		expect(irradiance(sh, [0, 1, 0])[0]).toBeGreaterThan(1);
		expect(irradiance(sh, [0, -1, 0])[0]).toBe(0);
	});

	it('the way in ships its probes: light under the manhole, dark in the Storeroom', () => {
		const room = MAP_PIECES.sewer;
		expect(room.probes).not.toBeNull();
		const file = readFileSync(path.join(process.cwd(), 'static', room.probes!.url));
		const probes = readProbes(
			file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)
		);
		// Facing up, at chest height: on the walkway under the manhole (its ladder's foot), and in
		// the middle of the Storeroom (game axes: Blender's -y is +z).
		const ladder = room.ropes.find((r) => r.ladder)!.top;
		const lit = irradiance(sampleProbes(probes, [ladder[0], 1.2, ladder[2] + 0.5]), [0, 1, 0]);
		const dark = irradiance(sampleProbes(probes, [17.5, 1.2, 10.8]), [0, 1, 0]);
		expect(lit[0]).toBeGreaterThan(0.05);
		expect(dark[0]).toBeLessThan(lit[0] / 10);
	});
});
