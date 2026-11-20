import { toWorld } from './grid.ts';
import type { CratePlacement, MapLayout, PieceDef, Vec3 } from './types.ts';

/**
 * A map's named spots (spot-<name> markers) in world space: where the training ground (Rumors)
 * puts things and tells its tutorial steps. See docs/dev/rumors.md.
 */
export interface WorldSpot {
	name: string;
	position: Vec3;
	yaw: number;
}

const round = (v: number): number => Math.round(v * 1000) / 1000;

export function worldSpots(layout: MapLayout, pieces: Record<string, PieceDef>): WorldSpot[] {
	const out: WorldSpot[] = [];
	for (const placement of layout.placements) {
		for (const spot of pieces[placement.piece]?.spots ?? []) {
			out.push({
				name: spot.name,
				position: toWorld(placement, spot.position).map(round) as Vec3,
				yaw: round(spot.yaw + (placement.rotation * Math.PI) / 2)
			});
		}
	}
	return out;
}

/** A training map's crates: every crate marker in the walk, in order, plain crates. */
export function trainingCrates(
	layout: MapLayout,
	pieces: Record<string, PieceDef>,
	walk: string
): CratePlacement[] {
	const crates: CratePlacement[] = [];
	for (const placement of layout.placements) {
		if (placement.piece !== walk) continue;
		for (const marker of pieces[placement.piece]?.crates ?? []) {
			crates.push({
				id: `c${crates.length + 1}`,
				position: toWorld(placement, marker.position).map(round) as Vec3,
				yaw: round(marker.yaw + (placement.rotation * Math.PI) / 2),
				tier: placement.tier,
				piece: placement.piece
			});
		}
	}
	return crates;
}
