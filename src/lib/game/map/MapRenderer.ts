import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

/**
 * Builds the visible map from a generated layout. Pieces come from the asset cache, then the
 * whole map is merged by material into spatial chunks: one draw call per material per chunk
 * rather than per piece. See docs/dev/map-generation.md.
 */
export class MapRenderer {
	readonly root = new THREE.Group();
	private buildId = 0;
	/** Geometry made by merging: ours to dispose (the pieces' own stays in the asset cache). */
	private merged: THREE.BufferGeometry[] = [];

	constructor() {
		this.root.name = 'map';
	}

	async build(layout: MapLayout): Promise<void> {
		const id = ++this.buildId;
		const models = await Promise.all(
			layout.placements.map(async (placement) => {
				const def = PIECES[placement.piece];
				if (!def) throw new Error(`Unknown map piece "${placement.piece}"`);
				const model = await loadModel(def.url);
				model.position.set(...placement.position);
				model.rotation.y = (placement.rotation * Math.PI) / 2;
				return model;
			})
		);
		// A newer build started while this one was loading.
		if (id !== this.buildId) return;
		this.clearMeshes();
		const { meshes, geometries } = batch(models);
		this.merged = geometries;
		this.root.add(...meshes);
	}

	clear(): void {
		this.buildId++;
		this.clearMeshes();
	}

	private clearMeshes(): void {
		this.root.clear();
		for (const geometry of this.merged) geometry.dispose();
		this.merged = [];
	}
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
