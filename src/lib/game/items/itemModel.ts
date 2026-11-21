import * as THREE from 'three';
import type { ItemDef } from '#lib/content/items.ts';
import { loadModel } from '#lib/game/assets.ts';

/**
 * An item's model for drawing in a hand (on an explorer's body): its
 * `.glb`, or a grey box while it has none or it fails to load. It casts no shadow, so the lamp
 * in the head isn't blocked by what the hand holds, and isn't culled (a skinned hand moves it).
 */
export async function itemModel(def: ItemDef): Promise<THREE.Object3D> {
	let model: THREE.Object3D;
	try {
		model = def.model ? await loadModel(def.model) : placeholder();
	} catch {
		model = placeholder();
	}
	model.traverse((node) => {
		if (node instanceof THREE.Mesh) {
			node.castShadow = false;
			node.receiveShadow = false;
			node.frustumCulled = false;
		}
	});
	return model;
}

function placeholder(): THREE.Object3D {
	return new THREE.Mesh(
		new THREE.BoxGeometry(0.04, 0.04, 0.2),
		new THREE.MeshStandardMaterial({ color: 0x555555 })
	);
}
