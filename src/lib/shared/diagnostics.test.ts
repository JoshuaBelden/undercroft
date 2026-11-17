import { describe, expect, it } from 'vitest';
import {
	benchmarkMarkdown,
	cleanBenchmark,
	estimateRefresh,
	summarizeFrames
} from './diagnostics.ts';
import { sampleResult } from './testing/diagnostics.ts';

describe('summarizeFrames', () => {
	it('averages, takes the 95th percentile, the worst and the 1% low', () => {
		const times = [...Array(99).fill(10), 50];
		const s = summarizeFrames(times);
		expect(s.frames).toBe(100);
		expect(s.avgMs).toBeCloseTo(10.4);
		expect(s.fps).toBeCloseTo(96.2);
		expect(s.p95Ms).toBe(10);
		expect(s.worstMs).toBe(50);
		// The slowest 1% of 100 frames is the one 50 ms frame.
		expect(s.lowFps).toBe(20);
	});

	it('ignores frames that are not times and survives none', () => {
		expect(summarizeFrames([NaN, -1, 0]).frames).toBe(0);
		expect(summarizeFrames([20, NaN]).fps).toBe(50);
	});
});

describe('estimateRefresh', () => {
	it('finds a common refresh rate from the fastest frames', () => {
		expect(estimateRefresh([...Array(50).fill(16.7), ...Array(50).fill(33.3)])).toBe(60);
		expect(estimateRefresh(Array(100).fill(8.34))).toBe(120);
	});

	it('rounds a rate that is no common one', () => {
		expect(estimateRefresh(Array(10).fill(1000 / 83))).toBe(83);
		expect(estimateRefresh([])).toBe(0);
	});
});

describe('cleanBenchmark', () => {
	it('keeps a real result as it is', () => {
		expect(cleanBenchmark(sampleResult())).toEqual(sampleResult());
	});

	it('refuses what is not one', () => {
		expect(cleanBenchmark(null)).toBeNull();
		expect(cleanBenchmark({ ...sampleResult(), stages: 'no' })).toBeNull();
		expect(cleanBenchmark({ ...sampleResult(), seed: -1 })).toBeNull();
		const bad = sampleResult();
		(bad.stages[0] as unknown as Record<string, unknown>).fps = 'fast';
		expect(cleanBenchmark(bad)).toBeNull();
	});

	it('drops what it does not know and odd format names', () => {
		const raw = {
			...sampleResult(),
			extra: 'x',
			device: { ...sampleResult().device, compressed: ['astc', '<b>', 7], memoryGb: undefined }
		};
		const clean = cleanBenchmark(raw);
		expect(clean?.device.compressed).toEqual(['astc']);
		expect(clean).not.toHaveProperty('extra');
		expect(clean?.device).not.toHaveProperty('memoryGb');
	});
});

describe('benchmarkMarkdown', () => {
	it('is a table row per stage, then the facts', () => {
		const text = benchmarkMarkdown(sampleResult());
		expect(text).toContain('| Low | 59.8 | 31 | 16.7 | 17.4 | 33.4 | 140 | 90,000 | 1 |');
		expect(text).toContain('compressed formats: astc, etc2');
		expect(text).toContain('Canvas 2732×2048 @2, screen 60 Hz');
		expect(text).not.toContain('context was lost');
		expect(benchmarkMarkdown({ ...sampleResult(), contextLost: true })).toContain(
			'context was lost'
		);
	});
});
