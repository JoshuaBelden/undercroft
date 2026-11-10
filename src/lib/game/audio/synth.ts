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

export function synthesize(ctx: BaseAudioContext, spec: SynthSpec): AudioBuffer {
	switch (spec.kind) {
		case 'footstep':
			return footstep(ctx, spec.cutoff, spec.decay, spec.thump);
		case 'breath':
			return breath(ctx, spec.period);
		case 'click':
			return click(ctx);
	}
}
