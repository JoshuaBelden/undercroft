import * as THREE from 'three';

/**
 * A room's baked light (docs/dev/room-viewer.md#lightmaps), the same in the game and the room
 * viewer: the lightmap on the model's second UV, multiplied into every surface's colour.
 */

/**
 * Blender's diffuse bake (light only, no colour) is what a surface's colour is multiplied by.
 * Three.js treats a lightmap as irradiance, which its Lambert shading divides by pi, so it is
 * scaled back up by pi to match.
 */
export const LIGHTMAP_INTENSITY = Math.PI;

const loader = new THREE.TextureLoader();
const cache = new Map<string, Promise<THREE.Texture>>();

/** Ready a texture to be a lightmap: glTF's UV convention, the second UV set, sRGB. */
export function asLightmap(texture: THREE.Texture): THREE.Texture {
	texture.flipY = false;
	texture.channel = 1;
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

/** A lightmap by URL (content-hashed: each loads once and is shared). */
export function loadLightmap(url: string): Promise<THREE.Texture> {
	let pending = cache.get(url);
	if (!pending) {
		pending = loader.loadAsync(url).then(asLightmap);
		cache.set(url, pending);
	}
	return pending;
}

/** Light a model with a lightmap, or take it off (null). Only meshes with a second UV take it. */
export function applyLightmap(model: THREE.Object3D, lightmap: THREE.Texture | null): void {
	model.traverse((object) => {
		if (!(object instanceof THREE.Mesh) || !object.geometry.getAttribute('uv1')) return;
		const materials = Array.isArray(object.material) ? object.material : [object.material];
		for (const material of materials) {
			if (!(material instanceof THREE.MeshStandardMaterial)) continue;
			if (material.lightMap === lightmap) continue;
			material.lightMap = lightmap;
			material.lightMapIntensity = LIGHTMAP_INTENSITY;
			material.needsUpdate = true;
		}
	});
}
