import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAP_KIT } from '#lib/content/map/kit.ts';
import { loadModel } from '#lib/game/assets.ts';
import { CELL, LEVEL_HEIGHT } from '#lib/shared/map/grid.ts';
import { PIECES } from '#lib/shared/map/pieces.generated.ts';
import type { MapLayout } from '#lib/shared/map/types.ts';

const MARKER_PREFIXES = ['socket-', 'spawn-', 'extract-'];

/**
 * Size (m) of the chunks the static map is merged into. Big enough that a map of ~190 pieces is a
 * few dozen meshes instead of hundreds; small enough that the camera and each lamp's shadow pass
 * still skip the chunks out of their view.
 */
const CHUNK = CELL * 3;

/** The final room's way out (`<piece>-ladder`): not there until the Affliction is resolved. */
const LADDER = '-ladder';
/** How far above its place (m) it starts, and how long (s) it takes to come down. */
const LADDER_DROP = 5;
const LADDER_SECONDS = 2.2;

/** Water surfaces (`mat-water`). */
const WATER = 'mat-water';

/**
 * Water is drawn from below as well as above. Its surface is one face looking up (single-sided,
 * like every material in the kit), so with your eyes under it you would see straight through to
 * the passage above.
 */
function waterBothSides(model: THREE.Object3D): void {
	model.traverse((node) => {
		if (!(node instanceof THREE.Mesh)) return;
		for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
			if (material.name === WATER) material.side = THREE.DoubleSide;
		}
	});
}

/**
 * Builds the visible map from a generated layout. Pieces come from the asset cache, then the
 * whole map is merged by material into spatial chunks: one draw call per material per chunk
 * rather than per piece. The final room's ladder is kept apart, hidden until `lowerLadders`.
 * See docs/dev/map-generation.md.
 */
export class MapRenderer {
	readonly root = new THREE.Group();
	private buildId = 0;
	/** Geometry made by merging: ours to dispose (the pieces' own stays in the asset cache). */
	private merged: THREE.BufferGeometry[] = [];
	/** The final room's ladders, kept out of the merge: hidden, or coming down. */
	private ladders = new THREE.Group();
	/** 0..1 of the way down; null while still hidden. */
	private lowered: number | null = null;

	constructor() {
		this.root.name = 'map';
		this.ladders.name = 'map-ladders';
	}

	async build(layout: MapLayout): Promise<void> {
		const id = ++this.buildId;
		// Up until told otherwise (a tick can say so before the pieces are in).
		this.lowered = null;
		const models = await Promise.all(
			layout.placements.map(async (placement) => {
				const def = PIECES[placement.piece];
				if (!def) throw new Error(`Unknown map piece "${placement.piece}"`);
				const model = await loadModel(def.url);
				waterBothSides(model);
				model.position.set(...placement.position);
				model.rotation.y = (placement.rotation * Math.PI) / 2;
				return { model, final: !!MAP_KIT[placement.piece]?.final };
			})
		);
		// A newer build started while this one was loading.
		if (id !== this.buildId) return;
		this.clearMeshes();
		const ladders = models.filter((m) => m.final).flatMap((m) => takeLadders(m.model));
		const { meshes, geometries } = batch(models.map((m) => m.model));
		this.merged = geometries;
		this.root.add(...meshes);
		this.ladders.add(...ladders);
		this.root.add(this.ladders);
		this.pose();
	}

	/** The Affliction is resolved: the final room's ladder comes down (`instant`: it is down). */
	lowerLadders(instant: boolean): void {
		if (instant) this.lowered = 1;
		else this.lowered ??= 0;
		this.pose();
	}

	/** Whether there is a ladder to lower, and where (world space) it stands, for its sound. */
	ladderAt(): THREE.Vector3 | null {
		const first = this.ladders.children[0];
		return first ? new THREE.Box3().setFromObject(first).getCenter(new THREE.Vector3()) : null;
	}

	update(delta: number): void {
		if (this.lowered === null || this.lowered >= 1) return;
		this.lowered = Math.min(1, this.lowered + delta / LADDER_SECONDS);
		this.pose();
	}

	private pose(): void {
		this.ladders.visible = this.lowered !== null;
		const t = this.lowered ?? 0;
		// Let down fast, then a bump as it lands.
		const fall = t < 0.85 ? 1 - (t / 0.85) ** 2 : Math.sin(((t - 0.85) / 0.15) * Math.PI) * 0.04;
		this.ladders.position.y = fall * LADDER_DROP;
	}

	clear(): void {
		this.buildId++;
		this.lowered = null;
		this.clearMeshes();
	}

	private clearMeshes(): void {
		this.root.clear();
		this.ladders.clear();
		for (const geometry of this.merged) geometry.dispose();
		this.merged = [];
	}
}

/** Take a piece's ladder meshes out of it, in world space, for drawing apart. */
function takeLadders(model: THREE.Object3D): THREE.Object3D[] {
	model.updateMatrixWorld(true);
	const found: THREE.Object3D[] = [];
	model.traverse((object) => {
		if (object.name.endsWith(LADDER) && !found.some((f) => isUnder(object, f))) found.push(object);
	});
	return found.map((object) => {
		const copy = object.clone();
		object.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
		copy.traverse((node) => {
			if (node instanceof THREE.Mesh) node.castShadow = node.receiveShadow = true;
		});
		// The model is our own clone: drawn apart from here on, not merged.
		object.removeFromParent();
		return copy;
	});
}

function isUnder(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
	for (let o = object.parent; o; o = o.parent) if (o === ancestor) return true;
	return false;
}

/** Merge the placed pieces' meshes by chunk, material and vertex layout. */
function batch(models: THREE.Object3D[]): {
	meshes: THREE.Mesh[];
	geometries: THREE.BufferGeometry[];
} {
	const groups = new Map<string, { material: THREE.Material; parts: THREE.BufferGeometry[] }>();
	const loose: THREE.Mesh[] = [];
	const origin = new THREE.Vector3();
	for (const model of models) {
		model.updateMatrixWorld(true);
		origin.copy(model.position);
		const chunk = [
			Math.floor(origin.x / CHUNK),
			Math.floor((origin.y + 0.5) / LEVEL_HEIGHT),
			Math.floor(origin.z / CHUNK)
		].join(',');
		model.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			if (MARKER_PREFIXES.some((prefix) => object.name.startsWith(prefix))) return;
			if (!object.visible) return;
			// Several materials on one mesh: rare, so it stays as it is (in world space).
			if (Array.isArray(object.material)) {
				const copy = object.clone();
				copy.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
				copy.castShadow = true;
				copy.receiveShadow = true;
				loose.push(copy);
				return;
			}
			const material = object.material as THREE.Material;
			const geometry = toWorld(object.geometry, object.matrixWorld);
			const layout = Object.keys(geometry.attributes)
				.sort()
				.map((name) => `${name}${geometry.getAttribute(name).itemSize}`)
				.join(' ');
			const key = `${chunk}|${material.uuid}|${layout}|${geometry.index ? 'i' : 'n'}`;
			const group = groups.get(key) ?? { material, parts: [] };
			group.parts.push(geometry);
			groups.set(key, group);
		});
	}
	const meshes: THREE.Mesh[] = [...loose];
	const geometries: THREE.BufferGeometry[] = [];
	for (const { material, parts } of groups.values()) {
		const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts);
		if (parts.length > 1) for (const part of parts) part.dispose();
		if (!geometry) continue;
		geometry.computeBoundingSphere();
		geometry.computeBoundingBox();
		const mesh = new THREE.Mesh(geometry, material);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		// The world doesn't move: no need to recompute the matrix every frame.
		mesh.matrixAutoUpdate = false;
		mesh.updateMatrix();
		meshes.push(mesh);
		geometries.push(geometry);
	}
	return { meshes, geometries };
}

/**
 * A copy of a mesh's geometry in world space, as plain floats. Map pieces are quantized
 * (meshopt: positions as normalized 16-bit integers scaled by the node), which can't hold world
 * coordinates, so every attribute is decoded first.
 */
function toWorld(source: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.BufferGeometry {
	const geometry = new THREE.BufferGeometry();
	for (const [name, attribute] of Object.entries(source.attributes)) {
		const { count, itemSize } = attribute;
		const array = new Float32Array(count * itemSize);
		for (let i = 0; i < count; i++) {
			for (let k = 0; k < itemSize; k++) array[i * itemSize + k] = attribute.getComponent(i, k);
		}
		geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
	}
	if (source.index) geometry.setIndex(Array.from(source.index.array));
	geometry.applyMatrix4(matrix);
	return geometry;
}
