import type { GraphicsQuality } from '../settings/settings.svelte.ts';
import { DEFAULT_AFFLICTION } from './afflictions.ts';

/**
 * Run Diagnostics (the account menu): a benchmark that walks a camera through the same map on
 * every machine and measures each quality preset, so numbers from different devices compare.
 * See docs/dev/diagnostics.md.
 */

export interface BenchmarkStageDef {
	id: string;
	label: string;
	quality: GraphicsQuality;
	/** Explorers with their lamps lit: 1 is you alone; more walk behind you with shadow-casting lamps. */
	party: number;
}

export interface BenchmarkDef {
	/** The map every run measures. Changing it makes results incomparable with older ones. */
	seed: number;
	affliction: string;
	/** Seconds each stage settles (shaders compiling, shadow maps resizing) before it is measured. */
	warmup: number;
	/** Seconds each stage is measured for. */
	seconds: number;
	/** Walking pace along the route (m/s). Every stage walks the same stretch from the start. */
	speed: number;
	/** Metres between explorers walking in a party. */
	spacing: number;
	/** Creatures standing on the route, metres from its start, facing back along it. */
	creatures: number[];
	stages: BenchmarkStageDef[];
}

export const BENCHMARK: BenchmarkDef = {
	seed: 1337,
	affliction: DEFAULT_AFFLICTION.id,
	warmup: 1.5,
	seconds: 8,
	speed: 3,
	spacing: 2,
	creatures: [14, 22],
	stages: [
		{ id: 'low', label: 'Low', quality: 'low', party: 1 },
		{ id: 'medium', label: 'Medium', quality: 'medium', party: 1 },
		{ id: 'high', label: 'High', quality: 'high', party: 1 },
		// The party stages split the cost of a full party: Low has no shadows, Medium fewer pixels.
		{ id: 'low-party', label: 'Low, party of four', quality: 'low', party: 4 },
		{ id: 'medium-party', label: 'Medium, party of four', quality: 'medium', party: 4 },
		{ id: 'high-party', label: 'High, party of four', quality: 'high', party: 4 }
	]
};

/** How long the whole benchmark takes, in seconds (loading aside). */
export const BENCHMARK_SECONDS = BENCHMARK.stages.length * (BENCHMARK.warmup + BENCHMARK.seconds);
