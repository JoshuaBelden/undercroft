import {
	Material,
	Mesh,
	SkinnedMesh,
	Texture,
	VectorKeyframeTrack,
	type AnimationClip,
	type Object3D
} from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Loads glTF models exported from Blender (see docs/dev/asset-pipeline.md).
 * Each file loads once; callers receive a fresh clone they own.
 *
 * Map pieces reference shared, content-hashed texture files. The browser fetches each file
 * once, and `shareTextures` makes every model that uses the same file share one GPU texture.
 */

const loader = new GLTFLoader();
const cache = new Map<string, Promise<Object3D>>();
const textures = new Map<string, Texture>();

const TEXTURE_SLOTS = [
	'map',
	'normalMap',
	'roughnessMap',
	'metalnessMap',
	'aoMap',
	'emissiveMap',
	'alphaMap'
] as const;

export async function loadModel(url: string): Promise<Object3D> {
	let pending = cache.get(url);
	if (!pending) {
		pending = loader.loadAsync(url).then((gltf) => {
			shareTextures(gltf, url);
			return gltf.scene;
		});
		cache.set(url, pending);
	}
	const scene = await pending;
	return scene.clone(true);
}

export interface CreatureModel {
	scene: Object3D;
	clips: AnimationClip[];
}

const creatureCache = new Map<string, Promise<{ scene: Object3D; clips: AnimationClip[] }>>();

/**
 * A skinned, animated model (creatures). Cloned with SkeletonUtils so each copy has its own
 * skeleton. Clips are shared between copies, with horizontal root motion removed: the server
 * moves the creature, the clip only animates it in place.
 */
export async function loadCreature(url: string): Promise<CreatureModel> {
	let pending = creatureCache.get(url);
	if (!pending) {
		pending = loader.loadAsync(url).then((gltf) => {
			const clips = gltf.animations.map((clip) => stripRootMotion(clip, rootBone(gltf.scene)));
			return { scene: gltf.scene, clips };
		});
		creatureCache.set(url, pending);
	}
	const { scene, clips } = await pending;
	return { scene: cloneSkinned(scene), clips };
}

function rootBone(scene: Object3D): string | null {
	let name: string | null = null;
	scene.traverse((node) => {
		if (!name && node instanceof SkinnedMesh) name = node.skeleton.bones[0]?.name ?? null;
	});
	return name;
}

/** Pin the root bone's x/z to its first keyframe (keeps the vertical bob). */
function stripRootMotion(clip: AnimationClip, bone: string | null): AnimationClip {
	if (!bone) return clip;
	for (const track of clip.tracks) {
		if (!(track instanceof VectorKeyframeTrack) || track.name !== `${bone}.position`) continue;
		const v = track.values;
		for (let i = 0; i < v.length; i += 3) {
			v[i] = v[0];
			v[i + 2] = v[2];
		}
	}
	return clip;
}

/** Swap each texture for the first one loaded from the same image file. */
function shareTextures(gltf: GLTF, url: string): void {
	const json = gltf.parser.json as {
		textures?: { source?: number; extensions?: Record<string, { source?: number }> }[];
		images?: { uri?: string }[];
	};
	// WebP textures name their image in the EXT_texture_webp extension.
	const imageOf = (index: number) => {
		const def = json.textures?.[index];
		return def?.source ?? def?.extensions?.EXT_texture_webp?.source;
	};
	const base = new URL(url, window.location.href);
	const swap = new Map<Texture, Texture>();
	for (const [object, ref] of gltf.parser.associations) {
		if (!(object instanceof Texture) || ref.textures === undefined) continue;
		const source = imageOf(ref.textures);
		const uri = source === undefined ? undefined : json.images?.[source]?.uri;
		if (!uri || uri.startsWith('data:')) continue;
		const key = `${new URL(uri, base).href}|${object.colorSpace}`;
		const shared = textures.get(key);
		if (!shared) textures.set(key, object);
		else if (shared !== object) swap.set(object, shared);
	}
	if (swap.size === 0) return;
	gltf.scene.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		const materials: Material[] = Array.isArray(node.material) ? node.material : [node.material];
		for (const material of materials) {
			const slots = material as unknown as Record<string, unknown>;
			for (const slot of TEXTURE_SLOTS) {
				const current = slots[slot];
				if (current instanceof Texture && swap.has(current)) slots[slot] = swap.get(current);
			}
		}
	});
	for (const unused of swap.keys()) unused.dispose();
}

export const ASSETS = {
	devCube: '/assets/dev/dev-cube.glb'
} as const;
