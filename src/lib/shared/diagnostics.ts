/**
 * Run Diagnostics results: what the benchmark measured on a player's machine, sent with a
 * diagnostics report (src/lib/shared/reports.ts), checked by the server and filed on GitHub as a
 * table. See docs/dev/diagnostics.md.
 */

/** One quality preset, measured. Frame times in milliseconds. */
export interface BenchmarkStageResult {
	id: string;
	label: string;
	frames: number;
	/** Average frames per second. */
	fps: number;
	avgMs: number;
	/** 95th percentile frame time. */
	p95Ms: number;
	worstMs: number;
	/** "1% low": the frame rate of the slowest 1% of frames. */
	lowFps: number;
	/** Averages per frame, shadow passes included. */
	drawCalls: number;
	triangles: number;
	lights: number;
}

/** What the browser and GPU can do. */
export interface DeviceInfo {
	webgl2: boolean;
	maxTextureSize: number;
	/** Compressed texture families the GPU takes (astc, etc, s3tc, bptc...): what KTX2 can transcode to. */
	compressed: string[];
	/** Logical CPU cores, when the browser says. */
	cores?: number;
	/** Device memory in GB, when the browser says (Chrome only, rounded down). */
	memoryGb?: number;
	/** The pixel ratio at High, and the canvas size it rendered, `2732×2048`. */
	pixelRatio: number;
	canvas: string;
	/** Screen refresh rate as measured (Hz): frame rates at this number are capped by it. */
	refreshHz: number;
}

export interface BenchmarkResult {
	/** The map measured (BENCHMARK.seed): results only compare on the same one. */
	seed: number;
	/** Milliseconds to load the map and models. */
	loadMs: number;
	/** GPU textures in the scene, and their estimated memory (MB, with mipmaps, uncompressed). */
	textures: number;
	textureMb: number;
	geometries: number;
	device: DeviceInfo;
	stages: BenchmarkStageResult[];
	/** The WebGL context was lost during the run (the GPU ran out of memory or reset). */
	contextLost: boolean;
}

export interface FrameSummary {
	frames: number;
	fps: number;
	avgMs: number;
	p95Ms: number;
	worstMs: number;
	lowFps: number;
}

const round = (value: number, places = 1): number => {
	const f = 10 ** places;
	return Math.round(value * f) / f;
};

/** Frame-time statistics from a list of frame times (ms). */
export function summarizeFrames(times: number[]): FrameSummary {
	const valid = times.filter((t) => Number.isFinite(t) && t > 0);
	if (valid.length === 0) return { frames: 0, fps: 0, avgMs: 0, p95Ms: 0, worstMs: 0, lowFps: 0 };
	const sorted = [...valid].sort((a, b) => a - b);
	const total = sorted.reduce((sum, t) => sum + t, 0);
	const avg = total / sorted.length;
	const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
	const slowest = sorted.slice(-Math.max(1, Math.floor(sorted.length / 100)));
	const slowAvg = slowest.reduce((sum, t) => sum + t, 0) / slowest.length;
	return {
		frames: sorted.length,
		fps: round(1000 / avg),
		avgMs: round(avg, 2),
		p95Ms: round(p95, 2),
		worstMs: round(sorted[sorted.length - 1], 2),
		lowFps: round(1000 / slowAvg)
	};
}

/**
 * The screen's refresh rate from frame times: the fastest frames are one refresh apart (the
 * median of the quickest tenth, so one early frame can't skew it), as a common rate (Hz).
 */
export function estimateRefresh(times: number[]): number {
	const sorted = times.filter((t) => Number.isFinite(t) && t > 0).sort((a, b) => a - b);
	if (sorted.length === 0) return 0;
	const fastest = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 10)));
	const hz = 1000 / fastest[Math.floor(fastest.length / 2)];
	const common = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
	const near = common.reduce((best, rate) =>
		Math.abs(rate - hz) < Math.abs(best - hz) ? rate : best
	);
	return Math.abs(near - hz) / near < 0.06 ? near : Math.round(hz);
}

/** The results as a Markdown table, for the GitHub issue and the admin app. */
export function benchmarkMarkdown(result: BenchmarkResult): string {
	const d = result.device;
	const rows = result.stages.map(
		(s) =>
			`| ${s.label} | ${s.fps} | ${s.lowFps} | ${s.avgMs} | ${s.p95Ms} | ${s.worstMs} | ${s.drawCalls} | ${s.triangles.toLocaleString('en-US')} | ${s.lights} |`
	);
	const facts = [
		`- Map seed ${result.seed}, loaded in ${(result.loadMs / 1000).toFixed(1)} s`,
		`- Textures: ${result.textures} (~${result.textureMb} MB uncompressed), geometries: ${result.geometries}`,
		`- WebGL ${d.webgl2 ? '2' : '1'}, max texture ${d.maxTextureSize}, compressed formats: ${d.compressed.join(', ') || 'none'}`,
		`- Canvas ${d.canvas} @${d.pixelRatio}, screen ${d.refreshHz} Hz`,
		d.cores !== undefined && `- CPU cores: ${d.cores}`,
		d.memoryGb !== undefined && `- Device memory: ${d.memoryGb} GB`,
		result.contextLost && '- **The WebGL context was lost during the run**'
	].filter(Boolean);
	return [
		'| Stage | FPS | 1% low | Avg ms | p95 ms | Worst ms | Draws | Triangles | Lights |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
		...rows,
		'',
		...facts
	].join('\n');
}

const num = (value: unknown, max = 1e9): number | null =>
	typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;

const str = (value: unknown, max: number): string | null =>
	typeof value === 'string' && value.length > 0 ? value.slice(0, max) : null;

/** A benchmark result as sent, checked; null if it isn't one. */
export function cleanBenchmark(raw: unknown): BenchmarkResult | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as Record<string, unknown>;
	const device = (typeof r.device === 'object' && r.device !== null ? r.device : {}) as Record<
		string,
		unknown
	>;
	if (!Array.isArray(r.stages)) return null;
	const stages: BenchmarkStageResult[] = [];
	for (const rawStage of r.stages.slice(0, 10)) {
		if (typeof rawStage !== 'object' || rawStage === null) return null;
		const s = rawStage as Record<string, unknown>;
		const id = str(s.id, 40);
		const label = str(s.label, 60);
		const fields = [
			'frames',
			'fps',
			'avgMs',
			'p95Ms',
			'worstMs',
			'lowFps',
			'drawCalls',
			'triangles',
			'lights'
		] as const;
		const values = fields.map((field) => num(s[field]));
		if (!id || !label || values.some((v) => v === null)) return null;
		const [frames, fps, avgMs, p95Ms, worstMs, lowFps, drawCalls, triangles, lights] =
			values as number[];
		stages.push({
			id,
			label,
			frames,
			fps,
			avgMs,
			p95Ms,
			worstMs,
			lowFps,
			drawCalls,
			triangles,
			lights
		});
	}
	const seed = num(r.seed, 2 ** 32);
	const loadMs = num(r.loadMs);
	const textures = num(r.textures);
	const textureMb = num(r.textureMb);
	const geometries = num(r.geometries);
	const maxTextureSize = num(device.maxTextureSize);
	const pixelRatio = num(device.pixelRatio, 10);
	const refreshHz = num(device.refreshHz, 1000);
	const canvas = str(device.canvas, 20);
	if (
		seed === null ||
		loadMs === null ||
		textures === null ||
		textureMb === null ||
		geometries === null ||
		maxTextureSize === null ||
		pixelRatio === null ||
		refreshHz === null ||
		!canvas
	) {
		return null;
	}
	const out: DeviceInfo = {
		webgl2: device.webgl2 === true,
		maxTextureSize,
		compressed: Array.isArray(device.compressed)
			? device.compressed
					.filter(
						(name): name is string => typeof name === 'string' && /^[a-z0-9_]{1,20}$/.test(name)
					)
					.slice(0, 12)
			: [],
		pixelRatio,
		canvas,
		refreshHz
	};
	const cores = num(device.cores, 1024);
	if (cores !== null) out.cores = cores;
	const memoryGb = num(device.memoryGb, 1024);
	if (memoryGb !== null) out.memoryGb = memoryGb;
	return {
		seed,
		loadMs,
		textures,
		textureMb,
		geometries,
		device: out,
		stages,
		contextLost: r.contextLost === true
	};
}
