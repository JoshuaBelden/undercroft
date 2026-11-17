import type { BenchmarkResult } from '../diagnostics.ts';

/** A benchmark result as Run Diagnostics sends one (only imported by *.test.ts files). */
export function sampleResult(): BenchmarkResult {
	return {
		seed: 1337,
		loadMs: 2400,
		textures: 40,
		textureMb: 180.5,
		geometries: 120,
		device: {
			webgl2: true,
			maxTextureSize: 16384,
			compressed: ['astc', 'etc2'],
			cores: 8,
			pixelRatio: 2,
			canvas: '2732×2048',
			refreshHz: 60
		},
		stages: [
			{
				id: 'low',
				label: 'Low',
				frames: 480,
				fps: 59.8,
				avgMs: 16.7,
				p95Ms: 17.4,
				worstMs: 33.4,
				lowFps: 31,
				drawCalls: 140,
				triangles: 90000,
				lights: 1
			}
		],
		contextLost: false
	};
}
