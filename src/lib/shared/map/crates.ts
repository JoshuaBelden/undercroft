import { CRATES } from '../../content/loot.ts';
import { Rng } from '../rng.ts';
import { toWorld } from './grid.ts';
import { spawnPoint } from './points.ts';
import type { CratePlacement, MapLayout, PieceDef, Vec3 } from './types.ts';

/**
 * Which of the map's crate markers (`crate-*` empties in the pieces) have a loot crate. Seeded by
 * the map seed. The server calls this once the layout is generated and puts the result in
 * `layout.crates`; from there crates are part of the collision world on both sides.
 *
 * Markers in the start room are left empty, except with `debug` (the server's dev mode): then each
 * has a crate, to try the loot screen without walking for it.
 * See docs/dev/items.md.
 */
export function placeCrates(
	layout: MapLayout,
	pieces: Record<string, PieceDef>,
	seed: number,
	debug = false
): CratePlacement[] {
	const rng = new Rng(seed ^ 0xc4a7e);
	const start = spawnPoint(layout, pieces).position;
	const crates: CratePlacement[] = [];
	for (const placement of layout.placements) {
		for (const marker of pieces[placement.piece]?.crates ?? []) {
			// Roll for every marker, so one crate more or less doesn't reshuffle the rest.
			const filled = rng.next() < CRATES.fill;
			const position = toWorld(placement, marker.position);
			const away = Math.hypot(position[0] - start[0], position[2] - start[2]);
			const atStart = placement === layout.placements[0];
			if (atStart ? !debug : !filled || away < CRATES.minDistance) continue;
			crates.push({
				id: `c${crates.length + 1}`,
				position: position.map((v) => Math.round(v * 1000) / 1000) as Vec3,
				yaw: Math.round((marker.yaw + (placement.rotation * Math.PI) / 2) * 1000) / 1000,
				...(atStart ? { debug: true } : {})
			});
		}
	}
	return crates;
}

/** The middle of a crate: what is looked at to open it. */
export function crateCentre(crate: { position: Vec3 }): Vec3 {
	return [crate.position[0], crate.position[1] + CRATES.size[1] / 2, crate.position[2]];
}
