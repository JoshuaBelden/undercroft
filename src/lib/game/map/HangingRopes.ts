import * as THREE from 'three';
import { modelUrl } from '#lib/content/models.ts';
import { MOVEMENT } from '#lib/content/player/movement.ts';
import { loadModel } from '#lib/game/assets.ts';
import type { CollisionWorld, RopeLine } from '#lib/shared/map/collision.ts';
import type { Vec3 } from '#lib/shared/map/types.ts';

/**
 * Ropes hanging in the map (extraction ropes, ropes tied at anchors), drawn and swayed on the
 * client only: each is a verlet chain (points held a fixed distance apart, pulled down by
 * gravity), skinned with a tube. A climber's hands pin the point they hold, so the rope goes
 * taut above them and swings below. Climbing itself is the shared simulation's
 * (`src/lib/shared/player/climb.ts`); this is only how it looks. See docs/dev/rope.md.
 */

/** Points every this many metres along a rope. */
const SPACING = 0.25;
/** Rope thickness (m). */
export const ROPE_RADIUS = 0.018;
/** Sides of the tube. */
const SIDES = 6;
const GRAVITY = 9.8;
/** Velocity kept per step (air drag): heavy rope settles quickly. */
const DAMPING = 0.95;
/**
 * Pull back toward hanging straight, per step (0..1): it sways a little and settles, rather
 * than swinging about.
 */
const STRAIGHTEN = 0.03;
/** Constraint passes per step: more is stiffer. */
const ITERATIONS = 12;
/** Fixed simulation step (s). */
const STEP = 1 / 60;
/** Hands are this far above a climber's feet. */
const HANDS = 1.45;
/** Push (m/s) given to the rope where someone takes hold or lets go: a slight sway. */
const JOLT = 0.2;
/** A tied rope's chain hangs from this far below its lip (it has just gone over the edge). */
const LIP_DROP = 0.05;
/** How big the heap of rope at the foot is (m across). */
const HEAP_SIZE = 0.5;

/** Someone on a rope this frame: which one and where their feet are drawn. */
export interface RopeClimber {
	rope: string;
	feet: Vec3;
}

interface Chain {
	line: RopeLine;
	/** Where the chain hangs from: the rope's top, or just over the lip for a tied rope. */
	top: Vec3;
	/** A tied rope's lead: from the knot on its post, along the ledge and over the edge. */
	lead: THREE.Mesh | null;
	/** Current and previous positions, xyz per point. */
	now: Float32Array;
	before: Float32Array;
	count: number;
	mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
	heap: THREE.Object3D | null;
	/** Climbers holding on last frame (to jolt the rope when that changes). */
	held: number;
}

export class HangingRopes {
	readonly root = new THREE.Group();
	private chains = new Map<string, Chain>();
	private material = ropeMaterial();
	private accumulator = 0;
	private heapModel: Promise<THREE.Object3D | null> = loadHeap();
	private disposed = false;

	constructor() {
		this.root.name = 'hanging-ropes';
	}

	/** Match the ropes in the world: add new ones, drop removed ones (an untied rope). */
	sync(world: CollisionWorld | null): void {
		const lines = world?.ropes ?? [];
		const ids = new Set(lines.map((l) => l.id));
		for (const [id, chain] of this.chains) {
			if (!ids.has(id)) this.remove(id, chain);
		}
		for (const line of lines) {
			if (!this.chains.has(line.id)) this.add(line);
		}
	}

	private add(line: RopeLine): void {
		// A tied rope hangs from just over the lip; the rest is its lead, drawn fixed.
		const top: Vec3 = line.lip ? [line.top[0], line.lip[1] - LIP_DROP, line.top[2]] : line.top;
		const end = ropeEnd(line);
		const drop = top[1] - end;
		// Exactly the drop: a chain longer than that would be squashed against the floor and kink.
		const count = Math.max(2, Math.floor(drop / SPACING) + 1);
		const now = new Float32Array(count * 3);
		for (let i = 0; i < count; i++) {
			now[i * 3] = top[0];
			now[i * 3 + 1] = Math.max(end + ROPE_RADIUS, top[1] - i * SPACING);
			now[i * 3 + 2] = top[2];
		}
		// No shadows: a strand this thin, lit by a lamp a step away, threw one onto the stone
		// beside it that looked like a second rope.
		const mesh = new THREE.Mesh(tubeGeometry(count), this.material);
		mesh.frustumCulled = false;
		mesh.receiveShadow = true;
		this.root.add(mesh);
		const lead = line.knot && line.lip ? this.lead(line.knot, line.lip, top) : null;
		const chain: Chain = {
			line,
			top,
			lead,
			now,
			before: now.slice(),
			count,
			mesh,
			heap: null,
			held: 0
		};
		this.chains.set(line.id, chain);
		// A rope that hangs free has no coil at its foot: it ends in the air.
		if (line.hangsFree) return;
		void this.heapModel.then((model) => {
			if (!model || this.disposed || this.chains.get(line.id) !== chain) return;
			const heap = model.clone();
			heap.scale.setScalar(HEAP_SIZE / 0.5);
			heap.position.set(line.top[0] + 0.12, line.bottom, line.top[2] + 0.08);
			heap.rotation.y = (line.top[0] * 7.3 + line.top[2] * 3.1) % (Math.PI * 2);
			chain.heap = heap;
			this.root.add(heap);
		});
	}

	/** The fixed part of a tied rope: knot on the post, down to the ledge, over the edge. */
	private lead(knot: Vec3, lip: Vec3, top: Vec3): THREE.Mesh {
		const [kx, ky, kz] = knot;
		const [lx, ly, lz] = lip;
		const r = ROPE_RADIUS;
		// Down the post a little, then along the floor to the edge, then over it.
		const points = [
			new THREE.Vector3(kx, ky, kz),
			new THREE.Vector3(kx + (lx - kx) * 0.25, ly + r + 0.05, kz + (lz - kz) * 0.25),
			new THREE.Vector3(kx + (lx - kx) * 0.75, ly + r, kz + (lz - kz) * 0.75),
			new THREE.Vector3(lx, ly + r, lz),
			new THREE.Vector3(top[0], top[1], top[2])
		];
		const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
		const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, r, SIDES, false), this.material);
		mesh.receiveShadow = true;
		this.root.add(mesh);
		return mesh;
	}

	private remove(id: string, chain: Chain): void {
		chain.mesh.geometry.dispose();
		chain.mesh.removeFromParent();
		chain.lead?.geometry.dispose();
		chain.lead?.removeFromParent();
		chain.heap?.removeFromParent();
		this.chains.delete(id);
	}

	update(delta: number, climbers: readonly RopeClimber[]): void {
		this.accumulator = Math.min(this.accumulator + delta, STEP * 6);
		while (this.accumulator >= STEP) {
			this.accumulator -= STEP;
			for (const chain of this.chains.values()) {
				step(
					chain,
					climbers.filter((c) => c.rope === chain.line.id)
				);
			}
		}
		for (const chain of this.chains.values()) skin(chain);
	}

	clear(): void {
		for (const [id, chain] of this.chains) this.remove(id, chain);
	}

	dispose(): void {
		this.disposed = true;
		this.clear();
		this.material.dispose();
		this.root.removeFromParent();
	}
}

function step(chain: Chain, climbers: readonly RopeClimber[]): void {
	const { now, before, count, line, top } = chain;
	const floor = ropeEnd(line) + ROPE_RADIUS;
	const dt2 = STEP * STEP;
	// Verlet: carry on as last step, plus gravity, drawn gently back under the top.
	for (let i = 1; i < count; i++) {
		const k = i * 3;
		for (let a = 0; a < 3; a++) {
			const v = (now[k + a] - before[k + a]) * DAMPING;
			before[k + a] = now[k + a];
			now[k + a] += v + (a === 1 ? -GRAVITY * dt2 : 0);
		}
		now[k] += (top[0] - now[k]) * STRAIGHTEN;
		now[k + 2] += (top[2] - now[k + 2]) * STRAIGHTEN;
	}
	// Someone took hold or let go: the rope jolts where they are.
	if (climbers.length !== chain.held) {
		const sign = climbers.length > chain.held ? 1 : -1;
		const i = Math.min(count - 1, Math.max(1, Math.round(count * 0.6)));
		before[i * 3] -= sign * JOLT * STEP;
		before[i * 3 + 2] -= sign * JOLT * 0.6 * STEP;
		chain.held = climbers.length;
	}
	// A climber holds the point nearest their hands, where it hangs at rest: pinning it anywhere
	// else would squash or stretch the chain either side of it.
	const pins = climbers.map((c) => {
		const index = Math.round((top[1] - c.feet[1] - HANDS) / SPACING);
		return { index, y: top[1] - index * SPACING };
	});
	for (let pass = 0; pass < ITERATIONS; pass++) {
		// The top is tied; a climber's hands hold the rope on its line.
		now[0] = top[0];
		now[1] = top[1];
		now[2] = top[2];
		for (const pin of pins) {
			if (pin.index <= 0 || pin.index >= count) continue;
			const k = pin.index * 3;
			now[k] = top[0];
			now[k + 1] = pin.y;
			now[k + 2] = top[2];
		}
		for (let i = 0; i < count - 1; i++) {
			const a = i * 3;
			const b = a + 3;
			const dx = now[b] - now[a];
			const dy = now[b + 1] - now[a + 1];
			const dz = now[b + 2] - now[a + 2];
			const length = Math.hypot(dx, dy, dz) || 1e-6;
			const push = (length - SPACING) / length / 2;
			const first = i === 0 ? 0 : 1;
			const total = first + 1;
			// The tied top doesn't move: its neighbour takes the whole correction.
			const share = (2 * push) / total;
			if (first) {
				now[a] += dx * share;
				now[a + 1] += dy * share;
				now[a + 2] += dz * share;
			}
			now[b] -= dx * share;
			now[b + 1] -= dy * share;
			now[b + 2] -= dz * share;
		}
		// Rope lies on the floor, it doesn't go through it.
		for (let i = 1; i < count; i++) {
			const k = i * 3 + 1;
			if (now[k] < floor) {
				now[k] = floor;
				before[k] = floor;
			}
		}
	}
}

const tangent = new THREE.Vector3();
const normal = new THREE.Vector3();
const binormal = new THREE.Vector3();
const up = new THREE.Vector3();

/** Rewrite the tube around the chain's points. */
function skin(chain: Chain): void {
	const { now, count, mesh } = chain;
	const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
	const normals = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
	for (let i = 0; i < count; i++) {
		const a = Math.max(0, i - 1) * 3;
		const b = Math.min(count - 1, i + 1) * 3;
		tangent.set(now[b] - now[a], now[b + 1] - now[a + 1], now[b + 2] - now[a + 2]).normalize();
		up.set(Math.abs(tangent.y) > 0.9 ? 1 : 0, Math.abs(tangent.y) > 0.9 ? 0 : 1, 0);
		normal.crossVectors(tangent, up).normalize();
		binormal.crossVectors(tangent, normal);
		for (let j = 0; j < SIDES; j++) {
			const angle = (j / SIDES) * Math.PI * 2;
			const c = Math.cos(angle);
			const s = Math.sin(angle);
			const nx = normal.x * c + binormal.x * s;
			const ny = normal.y * c + binormal.y * s;
			const nz = normal.z * c + binormal.z * s;
			const v = i * SIDES + j;
			position.setXYZ(
				v,
				now[i * 3] + nx * ROPE_RADIUS,
				now[i * 3 + 1] + ny * ROPE_RADIUS,
				now[i * 3 + 2] + nz * ROPE_RADIUS
			);
			normals.setXYZ(v, nx, ny, nz);
		}
	}
	position.needsUpdate = true;
	normals.needsUpdate = true;
}

/** A tube of `count` rings: fixed index and uv buffers, positions rewritten every frame. */
export function tubeGeometry(count: number): THREE.BufferGeometry {
	const geometry = new THREE.BufferGeometry();
	const position = new THREE.BufferAttribute(new Float32Array(count * SIDES * 3), 3);
	position.setUsage(THREE.DynamicDrawUsage);
	const normals = new THREE.BufferAttribute(new Float32Array(count * SIDES * 3), 3);
	normals.setUsage(THREE.DynamicDrawUsage);
	const uv = new Float32Array(count * SIDES * 2);
	for (let i = 0; i < count; i++) {
		for (let j = 0; j < SIDES; j++) {
			const v = (i * SIDES + j) * 2;
			uv[v] = j / SIDES;
			// The braid repeats every 10 cm.
			uv[v + 1] = (i * SPACING) / 0.1;
		}
	}
	const index: number[] = [];
	for (let i = 0; i < count - 1; i++) {
		for (let j = 0; j < SIDES; j++) {
			const a = i * SIDES + j;
			const b = i * SIDES + ((j + 1) % SIDES);
			const c = a + SIDES;
			const d = b + SIDES;
			index.push(a, c, b, b, c, d);
		}
	}
	geometry.setAttribute('position', position);
	geometry.setAttribute('normal', normals);
	geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
	geometry.setIndex(index);
	return geometry;
}

/**
 * Where a rope's end is drawn: its foot on the floor, or for one that hangs free (the start
 * room's), the hands of a climber at its lowest, well out of reach of anyone below.
 */
function ropeEnd(line: RopeLine): number {
	return line.hangsFree ? line.bottom + MOVEMENT.stances.stand.height : line.bottom;
}

/**
 * The rope heap (the rope bundle's model), standing on its base: the item's own origin is its
 * middle, where it is held, which would sink half of it into the floor.
 */
export async function loadHeap(): Promise<THREE.Object3D | null> {
	try {
		const model = await loadModel(modelUrl('shared/items/rope_bundle.glb'));
		const base = new THREE.Box3().setFromObject(model).min.y;
		const heap = new THREE.Group();
		model.position.y -= base;
		heap.add(model);
		return heap;
	} catch {
		return null;
	}
}

/** Hemp: the colour of the old modelled rope (mat-rope), with a twisted-strand stripe. */
export function ropeMaterial(): THREE.MeshStandardMaterial {
	const texture = braidTexture();
	return new THREE.MeshStandardMaterial({
		map: texture,
		bumpMap: texture,
		bumpScale: 0.6,
		roughness: 0.95,
		metalness: 0
	});
}

let braid: THREE.Texture | null = null;

/** Diagonal strands, drawn once on a canvas and shared by every rope. */
function braidTexture(): THREE.Texture {
	if (braid) return braid;
	const size = 64;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const g = canvas.getContext('2d');
	if (g) {
		g.fillStyle = '#7a5f3f';
		g.fillRect(0, 0, size, size);
		g.strokeStyle = '#4c3a24';
		g.lineWidth = 7;
		for (let k = -2; k < 3; k++) {
			g.beginPath();
			g.moveTo(k * (size / 2), size);
			g.lineTo(k * (size / 2) + size, 0);
			g.stroke();
		}
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.colorSpace = THREE.SRGBColorSpace;
	braid = texture;
	return texture;
}
