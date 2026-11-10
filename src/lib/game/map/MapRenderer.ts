import * as THREE from 'three';
import { loadModel } from '#lib/game/assets.ts';
import { PIECES } from '#lib/shared/map/pieces.generated.ts';
import type { MapLayout } from '#lib/shared/map/types.ts';

const MARKER_PREFIXES = ['socket-', 'spawn-', 'extract-'];

/**
 * Builds the visible map from a generated layout. Pieces come from the asset cache, so
 * geometry and textures are shared between repeated pieces.
 */
export class MapRenderer {
	readonly root = new THREE.Group();
	private buildId = 0;

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
				prepare(model);
				return model;
			})
		);
		// A newer build started while this one was loading.
		if (id !== this.buildId) return;
		this.root.clear();
		this.root.add(...models);
	}

	clear(): void {
		this.buildId++;
		this.root.clear();
	}
}

function prepare(model: THREE.Object3D): void {
	model.traverse((object) => {
		if (MARKER_PREFIXES.some((prefix) => object.name.startsWith(prefix))) object.visible = false;
		if (object instanceof THREE.Mesh) {
			object.castShadow = true;
			object.receiveShadow = true;
		}
	});
}
