import type { Vec3 } from './types.ts';

/**
 * A room's light probes (docs/dev/fixed-map.md#light-probes): its baked light, on a grid through
 * it, for what moves. Each probe is the light reaching it from every way, as order-1 spherical
 * harmonics of radiance (four coefficients, red, green and blue each: Three.js's light probe
 * coefficients, the first four of nine). Baked by scripts/blender/map/probes.py; sampled where a
 * thing stands, and turned into the light falling on each side of it (`irradiance`).
 */

/** Numbers per probe: four coefficients of red, green and blue. */
export const PROBE_SIZE = 12;
/** Numbers before the probes in the file: the grid's size, origin, spacing and a spare. */
const HEADER = 9;

export interface ProbeGrid {
	/** Probes along x, up y, along z. */
	count: [number, number, number];
	/** Where the first probe is (room space, game axes). */
	origin: Vec3;
	/** Metres between probes: across (x and z), and up (y). */
	spacing: [number, number];
	/** The probes, PROBE_SIZE numbers each: x fastest, then z, then y. */
	data: Float32Array;
}

/** A probe file as written by the bake (little-endian float32: the header, then the probes). */
export function readProbes(buffer: ArrayBuffer): ProbeGrid {
	const all = new Float32Array(buffer);
	const [nx, ny, nz, ox, oy, oz, across, up] = all;
	const count: [number, number, number] = [Math.round(nx), Math.round(ny), Math.round(nz)];
	const data = all.subarray(HEADER);
	if (data.length !== count[0] * count[1] * count[2] * PROBE_SIZE) {
		throw new Error(`A probe file of ${count.join('x')} probes holds ${data.length} numbers`);
	}
	return { count, origin: [ox, oy, oz], spacing: [across, up], data };
}

/**
 * The light at `position` (room space): the eight probes round it, blended by how near each is.
 * Outside the grid, the nearest edge's. Written into `out` (PROBE_SIZE numbers), which it returns.
 */
export function sampleProbes(
	grid: ProbeGrid,
	position: Vec3,
	out: Float32Array = new Float32Array(PROBE_SIZE)
): Float32Array {
	const [nx, ny, nz] = grid.count;
	const step: Vec3 = [grid.spacing[0], grid.spacing[1], grid.spacing[0]];
	const size: Vec3 = [nx, ny, nz];
	const base: number[] = [];
	const frac: number[] = [];
	for (let a = 0; a < 3; a++) {
		const t = Math.min(size[a] - 1, Math.max(0, (position[a] - grid.origin[a]) / step[a]));
		const i = Math.min(size[a] - 2, Math.floor(t));
		base.push(Math.max(0, i));
		frac.push(size[a] > 1 ? t - Math.max(0, i) : 0);
	}
	out.fill(0);
	for (let corner = 0; corner < 8; corner++) {
		const dx = corner & 1;
		const dy = (corner >> 1) & 1;
		const dz = (corner >> 2) & 1;
		const w =
			(dx ? frac[0] : 1 - frac[0]) * (dy ? frac[1] : 1 - frac[1]) * (dz ? frac[2] : 1 - frac[2]);
		if (w === 0) continue;
		const x = Math.min(nx - 1, base[0] + dx);
		const y = Math.min(ny - 1, base[1] + dy);
		const z = Math.min(nz - 1, base[2] + dz);
		const at = ((y * nz + z) * nx + x) * PROBE_SIZE;
		for (let k = 0; k < PROBE_SIZE; k++) out[k] += grid.data[at + k] * w;
	}
	return out;
}

/** pi * Y00, and 2pi/3 * Y1: the irradiance of order-1 harmonics, as Three.js's shGetIrradianceAt. */
const E0 = 0.886227;
const E1 = 1.023328;

/**
 * The light falling on a surface facing `normal` (unit, game axes) from probe coefficients `sh`:
 * irradiance, as a lit surface takes it (its colour over pi times this). The shader does the same
 * sum (src/lib/game/rooms/probeLight.ts).
 */
export function irradiance(sh: ArrayLike<number>, [x, y, z]: Vec3): Vec3 {
	const out: Vec3 = [0, 0, 0];
	for (let k = 0; k < 3; k++) {
		out[k] = Math.max(0, E0 * sh[k] + E1 * (sh[3 + k] * y + sh[6 + k] * z + sh[9 + k] * x));
	}
	return out;
}
