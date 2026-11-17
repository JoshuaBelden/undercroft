import * as THREE from 'three';
import { ROPE_RADIUS, loadHeap, ropeMaterial } from '#lib/game/map/HangingRopes.ts';
import type { LaidRopeSnapshot } from '#lib/shared/items/types.ts';
import type { Vec3 } from '#lib/shared/map/types.ts';

/**
 * Ropes laid along the floor: a tube through each one's points, lying on the stone, with a heap
 * of rope at its ends. No physics: it crosses and bunches over itself as it was walked. A rope
 * is drawn in pieces of CHUNK points, so as it grows only its last piece is rebuilt. Lit like the
 * stone, so it only shows in lamplight. See docs/dev/rope.md.
 */

/** Points per piece of tube. */
const CHUNK = 40;
/** Tube segments between two points (the curve is smoothed through them). */
const SMOOTH = 3;
/** How far a point may wander sideways (m), so it never looks ruled. */
const WOBBLE = 0.06;
const SIDES = 5;
/** Size of the heap at each end (m across), as a fraction of the built model (0.5 m). */
const END_SCALE = 0.45;

interface Drawn {
	rope: LaidRopeSnapshot;
	/** The points as drawn (wobbled, lifted onto the floor). */
	points: THREE.Vector3[];
	chunks: THREE.Mesh[];
	start: THREE.Object3D | null;
	end: THREE.Object3D | null;
}

export class LaidRopes {
	readonly root = new THREE.Group();
	private drawn = new Map<string, Drawn>();
	private material = ropeMaterial();
	private heap: Promise<THREE.Object3D | null> = loadHeap();
	private disposed = false;

	constructor() {
		this.root.name = 'laid-ropes';
	}

	/** The whole list from the server: add, rebuild and drop to match. */
	apply(list: readonly LaidRopeSnapshot[]): void {
		const ids = new Set(list.map((r) => r.id));
		for (const [id, drawn] of this.drawn) if (!ids.has(id)) this.remove(id, drawn);
		for (const rope of list) {
			const drawn = this.drawn.get(rope.id);
			if (!drawn) this.add(rope);
			else if (
				drawn.rope.points.length !== rope.points.length ||
				drawn.rope.laying !== rope.laying
			) {
				this.remove(rope.id, drawn);
				this.add(rope);
			}
		}
	}

	/** Points added to a rope being laid. */
	grow(id: string, points: readonly Vec3[]): void {
		const drawn = this.drawn.get(id);
		if (!drawn || points.length === 0) return;
		const first = drawn.points.length;
		drawn.rope = { ...drawn.rope, points: [...drawn.rope.points, ...points] };
		for (const p of points) drawn.points.push(lay(drawn.rope.id, drawn.points.length, p));
		// Rebuild from the piece the new points start in.
		const from = Math.max(0, Math.floor(Math.max(0, first - 1) / (CHUNK - 1)));
		for (const mesh of drawn.chunks.splice(from)) {
			mesh.geometry.dispose();
			mesh.removeFromParent();
		}
		this.build(drawn, from);
		this.placeEnds(drawn);
	}

	private add(rope: LaidRopeSnapshot): void {
		const drawn: Drawn = {
			rope,
			points: rope.points.map((p, i) => lay(rope.id, i, p)),
			chunks: [],
			start: null,
			end: null
		};
		this.drawn.set(rope.id, drawn);
		this.build(drawn, 0);
		void this.heap.then((model) => {
			if (!model || this.disposed || this.drawn.get(rope.id) !== drawn) return;
			drawn.start = model.clone();
			drawn.end = model.clone();
			drawn.start.scale.setScalar(END_SCALE);
			drawn.end.scale.setScalar(END_SCALE * 0.8);
			this.root.add(drawn.start, drawn.end);
			this.placeEnds(drawn);
		});
	}

	/** Tube pieces from chunk `from` on. Each shares its first point with the last one's end. */
	private build(drawn: Drawn, from: number): void {
		const step = CHUNK - 1;
		for (let i = from * step; i < drawn.points.length - 1; i += step) {
			const slice = drawn.points.slice(i, i + CHUNK);
			if (slice.length < 2) break;
			const curve = new THREE.CatmullRomCurve3(slice, false, 'centripetal');
			const geometry = new THREE.TubeGeometry(
				curve,
				(slice.length - 1) * SMOOTH,
				ROPE_RADIUS,
				SIDES,
				false
			);
			const mesh = new THREE.Mesh(geometry, this.material);
			mesh.receiveShadow = true;
			mesh.matrixAutoUpdate = false;
			drawn.chunks.push(mesh);
			this.root.add(mesh);
		}
	}

	/** A heap where it starts, and one at its free end. */
	private placeEnds(drawn: Drawn): void {
		const first = drawn.points[0];
		const last = drawn.points[drawn.points.length - 1];
		if (drawn.start && first) drawn.start.position.set(first.x, first.y - ROPE_RADIUS, first.z);
		if (drawn.end && last) {
			drawn.end.position.set(last.x, last.y - ROPE_RADIUS, last.z);
			drawn.end.visible = drawn.points.length > 1;
		}
	}

	private remove(id: string, drawn: Drawn): void {
		for (const mesh of drawn.chunks) {
			mesh.geometry.dispose();
			mesh.removeFromParent();
		}
		drawn.start?.removeFromParent();
		drawn.end?.removeFromParent();
		this.drawn.delete(id);
	}

	clear(): void {
		for (const [id, drawn] of this.drawn) this.remove(id, drawn);
	}

	dispose(): void {
		this.disposed = true;
		this.clear();
		this.material.dispose();
		this.root.removeFromParent();
	}
}

/**
 * Where a laid point is drawn: on the floor (lifted by the rope's thickness), nudged sideways by
 * an amount seeded from the rope and the point, so everyone sees the same rope.
 */
function lay(id: string, index: number, [x, y, z]: Vec3): THREE.Vector3 {
	let h = index * 374761393;
	for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 2654435761);
	const a = ((h >>> 0) / 4294967296) * Math.PI * 2;
	const r = (((h >>> 8) & 0xff) / 255) * WOBBLE;
	return new THREE.Vector3(x + Math.cos(a) * r, y + ROPE_RADIUS, z + Math.sin(a) * r);
}
