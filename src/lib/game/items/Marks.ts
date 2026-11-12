import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { MARKS, MARK_SYMBOLS } from '#lib/content/marks.ts';
import { markInSight } from '#lib/shared/items/pickup.ts';
import type { MarkSnapshot } from '#lib/shared/items/types.ts';
import type { CollisionWorld } from '#lib/shared/map/collision.ts';
import type { Vec3 } from '#lib/shared/map/types.ts';

/** How deep (m) a decal reaches into and out of the stone, so it wraps over bumps. */
const DEPTH = 0.3;
/** Seconds to keep looking for the stone under a mark (the map may still be loading). */
const PLACE_PATIENCE = 4;
/** Marks placed per frame at most: a long list arriving at once doesn't stall a frame. */
const PER_FRAME = 8;
const TEXTURE_SIZE = 256;

interface Shown {
	mark: MarkSnapshot;
	mesh: THREE.Mesh | null;
	/** Seconds spent failing to find stone under it. */
	waited: number;
}

/**
 * Chalk marks on the walls: every mark of the expedition, as the server lists them. Each is a
 * decal projected onto the stone under it (a flat square where none is found), chalk-white and
 * lit only by lamps. See docs/dev/marks.md.
 */
export class Marks {
	readonly root = new THREE.Group();
	private shown = new Map<string, Shown>();
	private materials = new Map<string, THREE.MeshStandardMaterial>();
	private ray = new THREE.Raycaster();

	/** `map`: the visible map, which the marks are projected onto. */
	constructor(private map: THREE.Object3D) {
		this.root.name = 'marks';
		this.ray.far = DEPTH * 2;
	}

	/** Every mark there is now (from the server's `marks` message). */
	apply(marks: MarkSnapshot[]): void {
		const ids = new Set(marks.map((mark) => mark.id));
		for (const [id, shown] of this.shown) {
			if (ids.has(id)) continue;
			this.removeMesh(shown);
			this.shown.delete(id);
		}
		for (const mark of marks) {
			if (!this.shown.has(mark.id)) this.shown.set(mark.id, { mark, mesh: null, waited: 0 });
		}
	}

	/** The marks, for the erase and label rules. */
	get list(): MarkSnapshot[] {
		return [...this.shown.values()].map((shown) => shown.mark);
	}

	/** Place marks that aren't drawn yet, once the stone under them is there. */
	update(delta: number): void {
		let placed = 0;
		for (const shown of this.shown.values()) {
			if (shown.mesh) continue;
			if (placed >= PER_FRAME) break;
			// Nothing to project onto until the map has loaded.
			if (this.map.children.length === 0) return;
			const mesh = this.place(shown.mark);
			if (mesh) {
				shown.mesh = mesh;
				placed++;
				continue;
			}
			shown.waited += delta;
			if (shown.waited >= PLACE_PATIENCE) {
				shown.mesh = this.flat(shown.mark);
				placed++;
			}
		}
	}

	/**
	 * The nearest mark within `MARKS.labelRange` that is in front of the eye and in sight: the one
	 * whose drawer is named.
	 */
	nearest(world: CollisionWorld, eye: Vec3, look: Vec3): MarkSnapshot | null {
		let best: MarkSnapshot | null = null;
		let bestDistance = Infinity;
		for (const { mark } of this.shown.values()) {
			const to: Vec3 = [
				mark.position[0] - eye[0],
				mark.position[1] - eye[1],
				mark.position[2] - eye[2]
			];
			const d = Math.hypot(to[0], to[1], to[2]);
			if (d > MARKS.labelRange || d >= bestDistance) continue;
			// In front of you, and its face toward you.
			if (to[0] * look[0] + to[1] * look[1] + to[2] * look[2] < d * 0.5) continue;
			const facing = to[0] * mark.normal[0] + to[1] * mark.normal[1] + to[2] * mark.normal[2];
			if (facing > 0) continue;
			if (!markInSight(world, eye, mark.position)) continue;
			best = mark;
			bestDistance = d;
		}
		return best;
	}

	clear(): void {
		for (const shown of this.shown.values()) this.removeMesh(shown);
		this.shown.clear();
	}

	dispose(): void {
		this.clear();
		for (const material of this.materials.values()) {
			material.map?.dispose();
			material.dispose();
		}
		this.materials.clear();
	}

	/** A decal on the map mesh under the mark, or null if no stone is found there. */
	private place(mark: MarkSnapshot): THREE.Mesh | null {
		const normal = new THREE.Vector3(...mark.normal);
		const origin = new THREE.Vector3(...mark.position).addScaledVector(normal, DEPTH);
		this.ray.set(origin, normal.clone().negate());
		const hit = this.ray.intersectObject(this.map, true)[0];
		if (!(hit?.object instanceof THREE.Mesh)) return null;
		const geometry = new DecalGeometry(
			hit.object,
			new THREE.Vector3(...mark.position),
			orientation(mark),
			new THREE.Vector3(MARKS.size, MARKS.size, DEPTH * 2)
		);
		if (!geometry.getAttribute('position')?.count) {
			geometry.dispose();
			return null;
		}
		return this.add(geometry, mark);
	}

	/** Where no stone was found: a flat square standing just off the surface. */
	private flat(mark: MarkSnapshot): THREE.Mesh {
		const mesh = this.add(new THREE.PlaneGeometry(MARKS.size, MARKS.size), mark);
		mesh.position.set(...mark.position).addScaledVector(new THREE.Vector3(...mark.normal), 0.01);
		mesh.rotation.copy(orientation(mark));
		return mesh;
	}

	private add(geometry: THREE.BufferGeometry, mark: MarkSnapshot): THREE.Mesh {
		const mesh = new THREE.Mesh(geometry, this.material(mark.symbol));
		mesh.receiveShadow = true;
		mesh.renderOrder = 1;
		this.root.add(mesh);
		return mesh;
	}

	private removeMesh(shown: Shown): void {
		if (!shown.mesh) return;
		this.root.remove(shown.mesh);
		shown.mesh.geometry.dispose();
		shown.mesh = null;
	}

	/** One material per symbol: chalk white, its strokes drawn into the alpha. */
	private material(symbol: string): THREE.MeshStandardMaterial {
		let material = this.materials.get(symbol);
		if (material) return material;
		const texture = new THREE.CanvasTexture(chalkCanvas(symbol));
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.anisotropy = 4;
		material = new THREE.MeshStandardMaterial({
			map: texture,
			color: 0xe9e4d8,
			roughness: 1,
			metalness: 0,
			transparent: true,
			depthWrite: false,
			polygonOffset: true,
			polygonOffsetFactor: -4
		});
		this.materials.set(symbol, material);
		return material;
	}
}

/** The rotation that lays a symbol on the surface: its top along `up`, facing out along `normal`. */
function orientation(mark: MarkSnapshot): THREE.Euler {
	const normal = new THREE.Vector3(...mark.normal);
	const up = new THREE.Vector3(...mark.up);
	const right = new THREE.Vector3().crossVectors(up, normal).normalize();
	const basis = new THREE.Matrix4().makeBasis(right, up, normal);
	return new THREE.Euler().setFromRotationMatrix(basis);
}

/**
 * A symbol drawn in chalk: its strokes in white, broken up by grain the way chalk catches on rough
 * stone. Seeded by the symbol, so it looks the same for everyone.
 */
function chalkCanvas(symbol: string): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = TEXTURE_SIZE;
	canvas.height = TEXTURE_SIZE;
	const ctx = canvas.getContext('2d');
	const def = MARK_SYMBOLS[symbol];
	if (!ctx || !def) return canvas;
	let seed = [...symbol].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
	const random = () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 2 ** 32;
	};
	ctx.strokeStyle = '#fff';
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	// A few passes, each a little off the last, like a hand going over it.
	for (let pass = 0; pass < 3; pass++) {
		ctx.globalAlpha = 0.75;
		for (const stroke of def.strokes) {
			ctx.lineWidth = TEXTURE_SIZE * (isDot(stroke) ? 0.07 : 0.05 - pass * 0.01);
			ctx.beginPath();
			stroke.forEach(([x, y], i) => {
				const jx = (random() - 0.5) * 0.015;
				const jy = (random() - 0.5) * 0.015;
				const px = (x + jx) * TEXTURE_SIZE;
				const py = (y + jy) * TEXTURE_SIZE;
				if (i === 0) ctx.moveTo(px, py);
				else ctx.lineTo(px, py);
			});
			ctx.stroke();
		}
	}
	// Grain: chalk skips over the pits in the stone.
	const image = ctx.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
	const data = image.data;
	for (let i = 0; i < data.length; i += 4) {
		const keep = random();
		data[i + 3] = Math.round(data[i + 3] * (keep < 0.18 ? keep * 2 : 0.55 + keep * 0.45));
	}
	ctx.putImageData(image, 0, 0);
	return canvas;
}

function isDot(stroke: [number, number][]): boolean {
	const [a, b] = [stroke[0], stroke[stroke.length - 1]];
	return Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.06;
}
