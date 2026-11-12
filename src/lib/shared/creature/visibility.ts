import { DEFAULT_HEADLAMP } from '../../content/items/headlamps.ts';
import { segmentBlocked, type CollisionWorld } from '../map/collision.ts';
import type { Vec3 } from '../map/types.ts';
import { headlampOutput } from '../player/headlamp.ts';
import { eyeHeight } from '../player/simulate.ts';
import type { PlayerState } from '../player/types.ts';

/**
 * Creature visibility. Creatures are seen only when the light on them is within their band
 * (`visibleBand`): darkness always hides them, and a creature with a finite upper bound hides in
 * full light too (half-light). Deterministic from player state, so the server ("seeing it" drains
 * sanity) and every client (whether to draw it) agree. See docs/dev/creatures.md.
 */

/** Illumination is measured against the starter lamp's bright mode at point blank (= 1). */
const REFERENCE_INTENSITY = DEFAULT_HEADLAMP.modes[2].intensity;
/** Fraction of the cone angle that is fully lit; it fades to nothing at PENUMBRA x the angle. */
const CORE = 0.8;
const PENUMBRA = 1.2;

/** Where the lamp sits and where it points, from a player's state. */
export function lampRay(state: PlayerState): { origin: Vec3; direction: Vec3 } {
	const [x, y, z] = state.position;
	const cp = Math.cos(state.pitch);
	return {
		origin: [x, y + eyeHeight(state), z],
		direction: [-Math.sin(state.yaw) * cp, Math.sin(state.pitch), -Math.cos(state.yaw) * cp]
	};
}

/** Light one player's lamp puts on a point (0..~1, lamp units). */
export function lampIllumination(
	world: CollisionWorld | null,
	state: PlayerState,
	point: Vec3
): number {
	const out = headlampOutput(state);
	if (!out.on || out.intensity <= 0) return 0;
	const { origin, direction } = lampRay(state);
	const d: Vec3 = [point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]];
	const dist = Math.hypot(d[0], d[1], d[2]);
	if (dist >= out.range) return 0;
	const along =
		dist > 1e-6 ? (d[0] * direction[0] + d[1] * direction[1] + d[2] * direction[2]) / dist : 1;
	const angle = Math.acos(Math.min(1, Math.max(-1, along)));
	const inner = out.angle * CORE;
	const outer = out.angle * PENUMBRA;
	if (angle >= outer) return 0;
	const cone = angle <= inner ? 1 : 1 - (angle - inner) / (outer - inner);
	const falloff = (1 - dist / out.range) ** 2;
	const light = (out.intensity / REFERENCE_INTENSITY) * cone * falloff;
	if (light <= 0) return 0;
	if (world && segmentBlocked(world, origin, point)) return 0;
	return light;
}

/** Total lamp light on a point from every player. */
export function illumination(
	world: CollisionWorld | null,
	players: Iterable<PlayerState>,
	point: Vec3
): number {
	let total = 0;
	for (const state of players) {
		if (state.dead || state.extracted) continue;
		total += lampIllumination(world, state, point);
	}
	return total;
}

/** Sample points up a creature's body (feet are often hidden by the floor, the head by beams). */
export function bodySamples(position: Vec3, height: number): Vec3[] {
	return [0.35, 0.65, 0.9].map((f) => [position[0], position[1] + height * f, position[2]] as Vec3);
}

/** How much light is on a creature's body: the brightest of its sample points. */
export function creatureLight(
	world: CollisionWorld | null,
	players: Iterable<PlayerState>,
	position: Vec3,
	height: number
): number {
	const list = [...players];
	return Math.max(...bodySamples(position, height).map((p) => illumination(world, list, p)));
}

/** Visible: enough light on it, and (for a finite upper bound) not too much. */
export function halfLightVisible(light: number, band: [number, number]): boolean {
	return light >= band[0] && light <= band[1];
}
