import * as THREE from 'three';

/**
 * What the benchmark asks the browser and GPU (docs/dev/diagnostics.md): WebGL's limits, the
 * compressed texture families it takes (what a KTX2 texture would be transcoded to), and the
 * texture memory the scene holds.
 */

/** WebGL extension -> the compressed family it brings. */
const COMPRESSED: Record<string, string> = {
	WEBGL_compressed_texture_astc: 'astc',
	WEBGL_compressed_texture_etc: 'etc2',
	WEBGL_compressed_texture_etc1: 'etc1',
	WEBGL_compressed_texture_s3tc: 's3tc',
	WEBGL_compressed_texture_s3tc_srgb: 's3tc_srgb',
	EXT_texture_compression_bptc: 'bptc',
	EXT_texture_compression_rgtc: 'rgtc',
	WEBGL_compressed_texture_pvrtc: 'pvrtc',
	WEBKIT_WEBGL_compressed_texture_pvrtc: 'pvrtc'
};

export function gpuCapabilities(renderer: THREE.WebGLRenderer): {
	webgl2: boolean;
	maxTextureSize: number;
	compressed: string[];
	cores?: number;
	memoryGb?: number;
} {
	const gl = renderer.getContext();
	const supported = new Set(gl.getSupportedExtensions() ?? []);
	const compressed = [
		...new Set(
			Object.entries(COMPRESSED)
				.filter(([extension]) => supported.has(extension))
				.map(([, family]) => family)
		)
	];
	const out: ReturnType<typeof gpuCapabilities> = {
		webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
		maxTextureSize: renderer.capabilities.maxTextureSize,
		compressed
	};
	if (navigator.hardwareConcurrency) out.cores = navigator.hardwareConcurrency;
	// Chrome only, and not in the standard types.
	const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
	if (typeof memory === 'number') out.memoryGb = memory;
	return out;
}

const SLOTS = [
	'map',
	'normalMap',
	'roughnessMap',
	'metalnessMap',
	'aoMap',
	'emissiveMap',
	'alphaMap'
] as const;

/**
 * The scene's textures and what they take on the GPU: each image once (textures sharing an
 * image share its upload), RGBA8 with a full mip chain (a third more). An estimate: the driver
 * may pad or keep its own copies.
 */
export function textureMemory(...roots: THREE.Object3D[]): { textures: number; mb: number } {
	const sources = new Set<{ data: unknown }>();
	for (const root of roots) {
		root.traverse((node) => {
			if (!(node instanceof THREE.Mesh)) return;
			const materials: THREE.Material[] = Array.isArray(node.material)
				? node.material
				: [node.material];
			for (const material of materials) {
				const slots = material as unknown as Record<string, unknown>;
				for (const slot of SLOTS) {
					const texture = slots[slot];
					if (texture instanceof THREE.Texture) sources.add(texture.source);
				}
			}
		});
	}
	let bytes = 0;
	for (const source of sources) {
		const image = source.data as { width?: number; height?: number } | null;
		if (!image?.width || !image.height) continue;
		bytes += (image.width * image.height * 4 * 4) / 3;
	}
	return { textures: sources.size, mb: Math.round((bytes / 2 ** 20) * 10) / 10 };
}
