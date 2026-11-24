import * as THREE from 'three';
import { bodyFiles, PLAYER_MODEL, wearFile } from '#lib/content/player/model.ts';
import {
	BOOTS_HIDE_BIT,
	WEAR,
	WEAR_SLOTS,
	type TintPart,
	type WearDef
} from '#lib/content/player/wardrobe.ts';
import { loadCharacter, loadClips, warmCharacter } from '#lib/game/assets.ts';
import { tintOf, type Look } from '#lib/shared/player/look.ts';

/**
 * An explorer, dressed in a look: the body, each piece worn bound to the body's bones (so the
 * clips move them all), the face's shape key on, every material its own copy (tinted), and the
 * body under worn clothes not drawn. See docs/dev/player.md#the-look.
 */
export interface Dressed {
	scene: THREE.Object3D;
	clips: THREE.AnimationClip[];
	/**
	 * The turn from a bone into the frame the clips were made in (`boneFrames` in the clips file),
	 * by bone name: the held item's grip is in the old explorer's hand frame.
	 */
	frames: Record<string, THREE.Quaternion>;
	/** The materials made for it, to dispose with it. */
	materials: THREE.Material[];
}

export interface DressOptions {
	/**
	 * Your own body, lit from the camera as well by `fill` (a uniform's value), added as emitted
	 * light so no light in the scene changes (see PlayerBody's OWN_FILL).
	 */
	fill?: { value: number };
	/** How much of the fill lands whatever way a face turns; the rest on what faces the camera. */
	fillAmbient?: number;
}

/** The skin's material in a body file: MPFB names it `<basemesh>.body`. */
const SKIN = /\.body$/;

export async function dress(look: Look, options: DressOptions = {}): Promise<Dressed> {
	const files = bodyFiles(look.body);
	const all = WEAR_SLOTS.flatMap((slot) => {
		const id = look.wear[slot];
		return id ? [{ slot, id }] : [];
	});
	// A piece another covers whole (the shirt under the sweater) isn't drawn at all.
	const covered = new Set(
		all.flatMap((w) => ('covers' in WEAR[w.id] ? (WEAR[w.id] as WearDef).covers : undefined) ?? [])
	);
	const worn = all.filter((w) => !covered.has(w.id));
	const [body, clipSet, ...pieces] = await Promise.all([
		loadCharacter(files.body),
		loadClips(files.anims, PLAYER_MODEL.root),
		...worn.map((w) => loadCharacter(wearFile(look.body, w.id)))
	]);
	const scene = body.scene;
	const bones = new Map<string, THREE.Bone>();
	const parents = new Map<string, THREE.Object3D>();
	scene.traverse((node) => {
		if (node instanceof THREE.Bone) bones.set(node.name, node);
		else parents.set(node.name, node);
	});
	const skinParent = findSkinned(scene)?.parent ?? scene;

	const materials: THREE.Material[] = [];
	const own = (m: THREE.Material, part: TintPart | null, hidden: number | null) => {
		const copy = m.clone();
		materials.push(copy);
		const color = part ? tintOf(look, part) : null;
		if (color && 'color' in copy && copy.color instanceof THREE.Color) {
			const map = 'map' in copy ? (copy.map as THREE.Texture | null) : null;
			tint(copy.color, color, map);
		}
		patch(copy, options, hidden);
		return copy;
	};

	// The body file: the skin (tinted, with what is worn hidden), the eyes, brows, lashes, boots.
	const hidden = worn.reduce((bits, w) => bits | (1 << WEAR[w.id].hideBit), 1 << BOOTS_HIDE_BIT);
	scene.traverse((node) => {
		if (!(node instanceof THREE.Mesh)) return;
		prepare(node);
		node.material = mapMaterials(node.material, (m) =>
			SKIN.test(m.name) ? own(m, 'skin', hidden) : own(m, null, null)
		);
	});

	// Each piece, onto the body's skeleton, tinted for its slot.
	pieces.forEach((piece, i) => {
		const { slot } = worn[i];
		const meshes: THREE.SkinnedMesh[] = [];
		piece.scene.traverse((node) => {
			if (node instanceof THREE.SkinnedMesh) meshes.push(node);
		});
		for (const mesh of meshes) {
			const skeleton = new THREE.Skeleton(
				mesh.skeleton.bones.map((b) => bones.get(b.name) ?? b),
				mesh.skeleton.boneInverses
			);
			// Under the same node as in its own file (the rig), so it sits where it was fitted.
			const parent = (mesh.parent && parents.get(mesh.parent.name)) ?? skinParent;
			parent.add(mesh);
			mesh.bind(skeleton, mesh.bindMatrix);
			prepare(mesh);
			mesh.material = mapMaterials(mesh.material, (m) => own(m, slot, null));
		}
	});

	setFace(scene, look.face);
	const frames = Object.fromEntries(
		Object.entries(clipSet.frames).map(([bone, q]) => [bone, new THREE.Quaternion(...q)])
	);
	return { scene, clips: clipSet.clips, frames, materials };
}

/** The face's shape key on, every other face's off, on every mesh that has them (hair too). */
function setFace(scene: THREE.Object3D, face: number): void {
	scene.traverse((node) => {
		if (!(node instanceof THREE.Mesh) || !node.morphTargetDictionary || !node.morphTargetInfluences)
			return;
		for (const [name, index] of Object.entries(node.morphTargetDictionary)) {
			if (name.startsWith('face-'))
				node.morphTargetInfluences[index] = name === `face-${face}` ? 1 : 0;
		}
	});
}

function prepare(mesh: THREE.Mesh): void {
	// The headlamp sits inside the head: a body that cast shadows would block its own lamp
	// (shadow passes draw back faces), and layers can't exempt a single light.
	mesh.castShadow = false;
	mesh.frustumCulled = false;
}

function findSkinned(scene: THREE.Object3D): THREE.SkinnedMesh | null {
	let found: THREE.SkinnedMesh | null = null;
	scene.traverse((node) => {
		if (!found && node instanceof THREE.SkinnedMesh) found = node;
	});
	return found;
}

function mapMaterials(
	material: THREE.Material | THREE.Material[],
	fn: (m: THREE.Material) => THREE.Material
): THREE.Material | THREE.Material[] {
	return Array.isArray(material) ? material.map(fn) : fn(material);
}

/**
 * Tint a textured material to `css`: its colour (which the texture is multiplied by) is set so
 * the texture's average comes out as the tint, channel by channel. The texture's own light and
 * dark, and its hue shifts (lips, a stitch), stay.
 */
function tint(target: THREE.Color, css: string, map: THREE.Texture | null): void {
	const want = new THREE.Color(css);
	const mean = map ? meanColor(map) : null;
	if (!mean) {
		target.copy(want);
		return;
	}
	target.setRGB(
		want.r / Math.max(mean.r, 0.02),
		want.g / Math.max(mean.g, 0.02),
		want.b / Math.max(mean.b, 0.02)
	);
}

const means = new WeakMap<THREE.Texture, THREE.Color | null>();
const SAMPLE = 16;

/** A texture's average colour (linear), weighted by its alpha; null if it can't be read. */
function meanColor(texture: THREE.Texture): THREE.Color | null {
	if (means.has(texture)) return means.get(texture) ?? null;
	let mean: THREE.Color | null = null;
	const image = texture.image as CanvasImageSource | undefined;
	if (image && typeof document !== 'undefined') {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = SAMPLE;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (ctx) {
			ctx.drawImage(image, 0, 0, SAMPLE, SAMPLE);
			const px = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
			let r = 0;
			let g = 0;
			let b = 0;
			let w = 0;
			for (let i = 0; i < px.length; i += 4) {
				const a = px[i + 3] / 255;
				r += px[i] * a;
				g += px[i + 1] * a;
				b += px[i + 2] * a;
				w += a;
			}
			if (w > 0) {
				mean = new THREE.Color().setRGB(
					r / w / 255,
					g / w / 255,
					b / w / 255,
					THREE.SRGBColorSpace
				);
			}
		}
	}
	means.set(texture, mean);
	return mean;
}

/**
 * One shader patch for what a body's material needs: the camera fill on your own body, and on
 * the skin, the vertices under worn clothes (`_HIDE`, a bit per piece covering them) not drawn.
 */
function patch(material: THREE.Material, options: DressOptions, hidden: number | null): void {
	const fill = options.fill;
	if (!fill && hidden === null) return;
	const ambient = options.fillAmbient ?? 0.35;
	material.onBeforeCompile = (shader) => {
		if (hidden !== null) {
			shader.uniforms.uHidden = { value: hidden };
			shader.vertexShader = shader.vertexShader
				.replace(
					'#include <common>',
					'#include <common>\nattribute float _hide;\nuniform int uHidden;\nvarying float vHidden;'
				)
				.replace(
					'#include <begin_vertex>',
					'#include <begin_vertex>\nvHidden = (int(_hide + 0.5) & uHidden) != 0 ? 1.0 : 0.0;'
				);
			shader.fragmentShader = shader.fragmentShader
				.replace('#include <common>', '#include <common>\nvarying float vHidden;')
				.replace(
					'#include <clipping_planes_fragment>',
					'#include <clipping_planes_fragment>\nif (vHidden > 0.5) discard;'
				);
		}
		if (fill) {
			shader.uniforms.uOwnFill = fill;
			shader.fragmentShader = shader.fragmentShader
				.replace('#include <common>', '#include <common>\nuniform float uOwnFill;')
				.replace(
					'#include <emissivemap_fragment>',
					`#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * uOwnFill * (${ambient.toFixed(2)} + ${(1 - ambient).toFixed(2)} * max(normal.z, 0.0));`
				);
		}
	};
	// The hidden bits are a uniform, so every look shares one program per kind of patch.
	material.customProgramCacheKey = () =>
		`explorer:${fill ? 'own' : ''}:${hidden === null ? '' : 'hide'}`;
}

/** Load a look's files into the caches without dressing anything (preloading). */
export async function warmLook(look: Look): Promise<void> {
	const files = bodyFiles(look.body);
	await Promise.all([
		warmCharacter(files.body),
		loadClips(files.anims, PLAYER_MODEL.root),
		...WEAR_SLOTS.flatMap((slot) => {
			const id = look.wear[slot];
			return id ? [warmCharacter(wearFile(look.body, id))] : [];
		})
	]);
}
