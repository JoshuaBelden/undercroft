import { buildCollisionWorld } from '#lib/shared/map/collision.ts';
import { buildNav, findPath, nearestPoint, pathLength } from '#lib/shared/map/nav.ts';
import { roomPoints, spawnPoint } from '#lib/shared/map/points.ts';
import type { MapKit, MapLayout, PieceDef, Vec3 } from '#lib/shared/map/types.ts';

/**
 * The benchmark's walk (docs/dev/diagnostics.md): from the start room's spawn through the rooms
 * in the order the map was built, along the creatures' nav grid, so the camera follows the
 * passages a player would (never through a wall). Floor-level points; `minLength` metres at least
 * when the map has that much.
 */
export function benchmarkRoute(
	layout: MapLayout,
	pieces: Record<string, PieceDef>,
	kit: MapKit,
	minLength: number
): Vec3[] {
	const world = buildCollisionWorld(layout, pieces);
	const spawn = spawnPoint(layout, pieces).position;
	const nav = buildNav(world, layout, pieces, spawn);
	// Every door open: the walk can go down a level like a party would.
	nav.closed.clear();
	let at = nearestPoint(nav, spawn);
	if (at < 0) return [spawn];
	const route: Vec3[] = [nav.points[at].position];
	for (const stop of roomPoints(layout, pieces, kit)) {
		if (pathLength(route) >= minLength) break;
		const to = nearestPoint(nav, stop.position, 4);
		if (to < 0 || to === at) continue;
		const leg = findPath(nav, at, to);
		if (!leg || leg.length < 2) continue;
		route.push(...leg.slice(1));
		at = to;
	}
	return route;
}

/**
 * Where `distance` metres along the route is, and which way it heads there. Past either end the
 * walk turns back (so a short route still serves a long stage).
 */
export function pointAlong(route: Vec3[], distance: number): { position: Vec3; heading: Vec3 } {
	const total = pathLength(route);
	if (route.length < 2 || total === 0) {
		return { position: [...(route[0] ?? [0, 0, 0])], heading: [0, 0, -1] };
	}
	const lap = ((distance % (2 * total)) + 2 * total) % (2 * total);
	const back = lap > total;
	let left = back ? 2 * total - lap : lap;
	for (let i = 1; i < route.length; i++) {
		const a = route[i - 1];
		const b = route[i];
		const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
		if (left <= length || i === route.length - 1) {
			const t = length === 0 ? 0 : Math.min(1, left / length);
			const position: Vec3 = [
				a[0] + (b[0] - a[0]) * t,
				a[1] + (b[1] - a[1]) * t,
				a[2] + (b[2] - a[2]) * t
			];
			const sign = back ? -1 : 1;
			const heading: Vec3 =
				length === 0
					? [0, 0, -1]
					: [
							((b[0] - a[0]) / length) * sign,
							((b[1] - a[1]) / length) * sign,
							((b[2] - a[2]) / length) * sign
						];
			return { position, heading };
		}
		left -= length;
	}
	return { position: [...route[route.length - 1]], heading: [0, 0, -1] };
}
