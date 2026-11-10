import { toWorld } from './grid.ts';
import type { ColliderBox, MapLayout, PieceDef, Quat, Vec3 } from './types.ts';

/**
 * World collision built from each piece's oriented collision boxes (`col-*` in Blender).
 * Pure math with no Three.js dependency so the server and client run identical code.
 * See docs/dev/player.md.
 */

export interface WorldBox {
	center: Vec3;
	half: Vec3;
	/** Unit axes of the box in world space. */
	axes: [Vec3, Vec3, Vec3];
}

export interface WorldVolume extends WorldBox {
	kind: string;
}

export interface CollisionWorld {
	boxes: WorldBox[];
	volumes: WorldVolume[];
	/** Spatial hash: bucket key -> indices into `boxes`. */
	grid: Map<string, number[]>;
}

export interface Contact {
	/** Unit normal pushing out of the box. */
	normal: Vec3;
	depth: number;
	/** Closest point on the box surface. */
	point: Vec3;
}

const BUCKET = 4;

function rotate(q: Quat, v: Vec3): Vec3 {
	const [x, y, z, w] = q;
	const [vx, vy, vz] = v;
	// v' = v + 2w(q x v) + 2 q x (q x v)
	const tx = 2 * (y * vz - z * vy);
	const ty = 2 * (z * vx - x * vz);
	const tz = 2 * (x * vy - y * vx);
	return [
		vx + w * tx + (y * tz - z * ty),
		vy + w * ty + (z * tx - x * tz),
		vz + w * tz + (x * ty - y * tx)
	];
}

function yawQuat(rotation: number): Quat {
	const half = (rotation * Math.PI) / 4;
	return [0, Math.sin(half), 0, Math.cos(half)];
}

function multiply(a: Quat, b: Quat): Quat {
	const [ax, ay, az, aw] = a;
	const [bx, by, bz, bw] = b;
	return [
		aw * bx + ax * bw + ay * bz - az * by,
		aw * by - ax * bz + ay * bw + az * bx,
		aw * bz + ax * by - ay * bx + az * bw,
		aw * bw - ax * bx - ay * by - az * bz
	];
}

function toWorldBox(box: ColliderBox, placementRotation: number, center: Vec3): WorldBox {
	const q = multiply(yawQuat(placementRotation), box.rotation);
	return {
		center,
		half: box.halfExtents,
		axes: [rotate(q, [1, 0, 0]), rotate(q, [0, 1, 0]), rotate(q, [0, 0, 1])]
	};
}

function bucketKey(x: number, y: number, z: number): string {
	return `${x},${y},${z}`;
}

function aabb(box: WorldBox): [Vec3, Vec3] {
	const ext: Vec3 = [0, 0, 0];
	for (let a = 0; a < 3; a++) {
		for (let i = 0; i < 3; i++) ext[i] += Math.abs(box.axes[a][i]) * box.half[a];
	}
	const [cx, cy, cz] = box.center;
	return [
		[cx - ext[0], cy - ext[1], cz - ext[2]],
		[cx + ext[0], cy + ext[1], cz + ext[2]]
	];
}

export function buildCollisionWorld(
	layout: MapLayout,
	pieces: Record<string, PieceDef>
): CollisionWorld {
	const world: CollisionWorld = { boxes: [], volumes: [], grid: new Map() };
	for (const placement of layout.placements) {
		const piece = pieces[placement.piece];
		if (!piece) continue;
		for (const box of piece.colliders) {
			world.boxes.push(toWorldBox(box, placement.rotation, toWorld(placement, box.center)));
		}
		for (const volume of piece.volumes) {
			world.volumes.push({
				kind: volume.kind,
				...toWorldBox(volume, placement.rotation, toWorld(placement, volume.center))
			});
		}
	}
	world.boxes.forEach((box, index) => {
		const [lo, hi] = aabb(box);
		for (let x = Math.floor(lo[0] / BUCKET); x <= Math.floor(hi[0] / BUCKET); x++) {
			for (let y = Math.floor(lo[1] / BUCKET); y <= Math.floor(hi[1] / BUCKET); y++) {
				for (let z = Math.floor(lo[2] / BUCKET); z <= Math.floor(hi[2] / BUCKET); z++) {
					const key = bucketKey(x, y, z);
					const list = world.grid.get(key);
					if (list) list.push(index);
					else world.grid.set(key, [index]);
				}
			}
		}
	});
	return world;
}

/** Boxes whose buckets overlap the given bounds. */
export function boxesNear(world: CollisionWorld, lo: Vec3, hi: Vec3): WorldBox[] {
	const seen = new Set<number>();
	const out: WorldBox[] = [];
	for (let x = Math.floor(lo[0] / BUCKET); x <= Math.floor(hi[0] / BUCKET); x++) {
		for (let y = Math.floor(lo[1] / BUCKET); y <= Math.floor(hi[1] / BUCKET); y++) {
			for (let z = Math.floor(lo[2] / BUCKET); z <= Math.floor(hi[2] / BUCKET); z++) {
				for (const index of world.grid.get(bucketKey(x, y, z)) ?? []) {
					if (seen.has(index)) continue;
					seen.add(index);
					out.push(world.boxes[index]);
				}
			}
		}
	}
	return out;
}

/** Penetration of a sphere into a box, or null if they don't touch. */
export function sphereVsBox(center: Vec3, radius: number, box: WorldBox): Contact | null {
	const d: Vec3 = [center[0] - box.center[0], center[1] - box.center[1], center[2] - box.center[2]];
	const local = box.axes.map((a) => d[0] * a[0] + d[1] * a[1] + d[2] * a[2]);
	const clamped = local.map((v, i) => Math.max(-box.half[i], Math.min(box.half[i], v)));
	const point: Vec3 = [box.center[0], box.center[1], box.center[2]];
	for (let a = 0; a < 3; a++) {
		for (let i = 0; i < 3; i++) point[i] += box.axes[a][i] * clamped[a];
	}
	const delta: Vec3 = [center[0] - point[0], center[1] - point[1], center[2] - point[2]];
	const dist = Math.hypot(delta[0], delta[1], delta[2]);
	if (dist >= radius) return null;
	if (dist > 1e-6) {
		return {
			normal: [delta[0] / dist, delta[1] / dist, delta[2] / dist],
			depth: radius - dist,
			point
		};
	}
	// Centre inside the box: push out along the shallowest axis.
	let best = 0;
	let bestPen = Infinity;
	for (let a = 0; a < 3; a++) {
		const pen = box.half[a] - Math.abs(local[a]);
		if (pen < bestPen) {
			bestPen = pen;
			best = a;
		}
	}
	const sign = local[best] >= 0 ? 1 : -1;
	const axis = box.axes[best];
	return {
		normal: [axis[0] * sign, axis[1] * sign, axis[2] * sign],
		depth: bestPen + radius,
		point
	};
}

/** Sphere centres (relative to the feet) approximating an upright capsule. */
export function capsuleSpheres(height: number, radius: number): number[] {
	const top = Math.max(radius, height - radius);
	return [radius, (radius + top) / 2, top];
}

/** True if a capsule of `height` at `position` overlaps nothing (used before standing up). */
export function capsuleFits(
	world: CollisionWorld,
	position: Vec3,
	height: number,
	radius: number
): boolean {
	const [x, y, z] = position;
	const near = boxesNear(world, [x - radius, y, z - radius], [x + radius, y + height, z + radius]);
	// Shrink slightly so resting contacts (floor, walls) don't count.
	const r = radius - 0.02;
	return capsuleSpheres(height, radius).every((h) =>
		near.every((box) => {
			const c = sphereVsBox([x, y + h, z], r, box);
			return !c || c.depth < 0.01;
		})
	);
}

/** Gameplay volumes (e.g. water) containing a point. */
export function volumesAt(world: CollisionWorld, point: Vec3): WorldVolume[] {
	return world.volumes.filter((v) => {
		const d: Vec3 = [point[0] - v.center[0], point[1] - v.center[1], point[2] - v.center[2]];
		return v.axes.every((a, i) => Math.abs(d[0] * a[0] + d[1] * a[1] + d[2] * a[2]) <= v.half[i]);
	});
}

/** Highest point of a box in world space. */
export function boxTop(box: WorldBox): number {
	return aabb(box)[1][1];
}

/**
 * Nearest spot to `position` (same height) where a capsule fits and has a floor under it,
 * searching outward in rings.
 */
export function findFreeSpot(
	world: CollisionWorld,
	position: Vec3,
	height: number,
	radius: number
): Vec3 {
	const ok = (p: Vec3) => capsuleFits(world, p, height, radius) && hasFloor(world, p, radius);
	if (ok(position)) return position;
	for (let ring = 1; ring <= 10; ring++) {
		const dist = ring * 0.5;
		const count = ring * 8;
		for (let i = 0; i < count; i++) {
			const a = (i / count) * Math.PI * 2;
			const p: Vec3 = [
				position[0] + Math.cos(a) * dist,
				position[1],
				position[2] + Math.sin(a) * dist
			];
			if (ok(p)) return p;
		}
	}
	return position;
}

/** True if a floor (an up-facing surface) is just below the feet. */
export function hasFloor(world: CollisionWorld, position: Vec3, radius: number): boolean {
	const [x, y, z] = position;
	// Sphere bottom 0.15 below the feet: touches a floor without sinking its centre into the slab.
	const probe: Vec3 = [x, y + radius - 0.15, z];
	return boxesNear(world, [x - radius, y - 1, z - radius], [x + radius, y + 1, z + radius]).some(
		(box) => (sphereVsBox(probe, radius, box)?.normal[1] ?? 0) > 0.7
	);
}
