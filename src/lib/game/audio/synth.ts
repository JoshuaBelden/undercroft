import type { SynthSpec } from '#lib/content/audio/sounds.ts';

/**
 * Placeholder sounds generated in code, so the game has audio before real recordings exist.
 * Deterministic (seeded noise) so every session sounds the same.
 */

function noise(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return (s / 4294967296) * 2 - 1;
	};
}

/** One-pole low-pass coefficient for a cutoff frequency. */
function lowpass(cutoff: number, rate: number): number {
	return 1 - Math.exp((-2 * Math.PI * cutoff) / rate);
}

function footstep(
	ctx: BaseAudioContext,
	cutoff: number,
	decay: number,
	thump: number
): AudioBuffer {
	const rate = ctx.sampleRate;
	const length = Math.floor(rate * (decay * 4 + 0.05));
	const buffer = ctx.createBuffer(1, length, rate);
	const data = buffer.getChannelData(0);
	const rand = noise(Math.floor(cutoff));
	const a = lowpass(cutoff, rate);
	let y = 0;
	for (let i = 0; i < length; i++) {
		const t = i / rate;
		y += a * (rand() - y);
		const scrape = y * Math.exp(-t / decay);
		const body = Math.sin(2 * Math.PI * 75 * t) * Math.exp(-t / 0.03) * thump;
		data[i] = (scrape * 1.6 + body) * 0.7;
	}
	return buffer;
}

function breath(ctx: BaseAudioContext, period: number): AudioBuffer {
	const rate = ctx.sampleRate;
	const length = Math.floor(rate * period);
	const buffer = ctx.createBuffer(1, length, rate);
	const data = buffer.getChannelData(0);
	const rand = noise(7);
	const lo = lowpass(1800, rate);
	const hi = lowpass(250, rate);
	let low = 0;
	let high = 0;
	for (let i = 0; i < length; i++) {
		const phase = i / length;
		low += lo * (rand() - low);
		high += hi * (low - high);
		const band = low - high; // ~250-1800 Hz
		// Inhale (0-0.4), short pause, exhale (0.5-0.95); exhale is softer and lower.
		let env = 0;
		if (phase < 0.4) env = Math.sin((phase / 0.4) * Math.PI) * 0.8;
		else if (phase > 0.5 && phase < 0.95) env = Math.sin(((phase - 0.5) / 0.45) * Math.PI) * 0.55;
		data[i] = band * env * 2.2;
	}
	return buffer;
}

function click(ctx: BaseAudioContext): AudioBuffer {
	const rate = ctx.sampleRate;
	const length = Math.floor(rate * 0.06);
	const buffer = ctx.createBuffer(1, length, rate);
	const data = buffer.getChannelData(0);
	const rand = noise(3);
	for (let i = 0; i < length; i++) {
		const t = i / rate;
		const tick = (t < 0.004 ? 1 : 0) + (t > 0.022 && t < 0.025 ? 0.6 : 0);
		data[i] = rand() * tick * Math.exp(-((t % 0.022) / 0.003)) * 0.8;
	}
	return buffer;
}

function splash(ctx: BaseAudioContext, length: number, cutoff: number): AudioBuffer {
	const rate = ctx.sampleRate;
	const n = Math.floor(rate * length);
	const buffer = ctx.createBuffer(1, n, rate);
	const data = buffer.getChannelData(0);
	const rand = noise(Math.floor(cutoff * 7));
	const a = lowpass(cutoff, rate);
	let y = 0;
	for (let i = 0; i < n; i++) {
		const t = i / rate;
		y += a * (rand() - y);
		// Bubbly amplitude wobble over a fast attack and long tail.
		const wobble = 0.6 + 0.4 * Math.sin(2 * Math.PI * (14 + 9 * Math.sin(t * 7)) * t);
		const env = Math.min(1, t / 0.01) * Math.exp(-t / (length * 0.35));
		data[i] = y * env * wobble * 2.4;
	}
	return buffer;
}

function scrape(ctx: BaseAudioContext): AudioBuffer {
	const rate = ctx.sampleRate;
	const n = Math.floor(rate * 0.55);
	const buffer = ctx.createBuffer(1, n, rate);
	const data = buffer.getChannelData(0);
	const rand = noise(11);
	const a = lowpass(2200, rate);
	let y = 0;
	for (let i = 0; i < n; i++) {
		const t = i / rate;
		y += a * (rand() - y);
		const grit = y * Math.sin((t / 0.55) * Math.PI) * 1.6;
		// Short voiced grunt near the start.
		const grunt =
			t < 0.18 ? Math.sin(2 * Math.PI * 120 * t) * Math.sin((t / 0.18) * Math.PI) * 0.35 : 0;
		data[i] = grit + grunt;
	}
	return buffer;
}

function gasp(ctx: BaseAudioContext): AudioBuffer {
	const rate = ctx.sampleRate;
	const n = Math.floor(rate * 0.7);
	const buffer = ctx.createBuffer(1, n, rate);
	const data = buffer.getChannelData(0);
	const rand = noise(23);
	const lo = lowpass(3000, rate);
	const hi = lowpass(500, rate);
	let low = 0;
	let high = 0;
	for (let i = 0; i < n; i++) {
		const t = i / rate;
		low += lo * (rand() - low);
		high += hi * (low - high);
		const env = Math.min(1, t / 0.04) * Math.exp(-t / 0.25);
		data[i] = (low - high) * env * 3;
	}
	return buffer;
}

export function synthesize(ctx: BaseAudioContext, spec: SynthSpec): AudioBuffer {
	switch (spec.kind) {
		case 'footstep':
			return footstep(ctx, spec.cutoff, spec.decay, spec.thump);
		case 'breath':
			return breath(ctx, spec.period);
		case 'click':
			return click(ctx);
		case 'splash':
			return splash(ctx, spec.length, spec.cutoff);
		case 'scrape':
			return scrape(ctx);
		case 'gasp':
			return gasp(ctx);
	}
}
