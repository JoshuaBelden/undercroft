import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Loads .glb models exported from Blender (see docs/dev/asset-pipeline.md).
 * Each file loads once; callers receive a fresh clone they own.
 */

const loader = new GLTFLoader();
const cache = new Map<string, Promise<Object3D>>();

export async function loadModel(url: string): Promise<Object3D> {
	let pending = cache.get(url);
	if (!pending) {
		pending = loader.loadAsync(url).then((gltf) => gltf.scene);
		cache.set(url, pending);
	}
	const scene = await pending;
	return scene.clone(true);
}

export const ASSETS = {
	devCube: '/assets/dev/dev-cube.glb'
} as const;
