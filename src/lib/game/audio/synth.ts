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

function buffer(
	ctx: BaseAudioContext,
	seconds: number,
	fill: (t: number, i: number) => number
): AudioBuffer {
	const rate = ctx.sampleRate;
	const n = Math.floor(rate * seconds);
	const out = ctx.createBuffer(1, n, rate);
	const data = out.getChannelData(0);
	for (let i = 0; i < n; i++) data[i] = fill(i / rate, i);
	return out;
}

/** Add decaying echoes (delay in seconds, feedback 0..1) to a mono buffer in place. */
function echo(b: AudioBuffer, delay: number, feedback: number, taps: number): AudioBuffer {
	const data = b.getChannelData(0);
	const step = Math.floor(delay * b.sampleRate);
	for (let tap = 1; tap <= taps; tap++) {
		const gain = Math.pow(feedback, tap);
		for (let i = data.length - 1; i >= step * tap; i--) data[i] += data[i - step * tap] * gain;
	}
	return b;
}

function drip(ctx: BaseAudioContext): AudioBuffer {
	let phase = 0;
	return buffer(ctx, 0.25, (t) => {
		// Fast downward chirp: the "plink" of a drop hitting water.
		const freq = 900 + 1400 * Math.exp(-t / 0.012);
		phase += (2 * Math.PI * freq) / ctx.sampleRate;
		return Math.sin(phase) * Math.exp(-t / 0.04) * 0.8;
	});
}

function knock(ctx: BaseAudioContext): AudioBuffer {
	const rand = noise(41);
	const a = lowpass(400, ctx.sampleRate);
	let y = 0;
	const b = buffer(ctx, 2.2, (t) => {
		y += a * (rand() - y);
		const hit = t < 0.35 ? Math.exp(-t / 0.06) : 0;
		return (Math.sin(2 * Math.PI * 70 * t) * 0.7 + y * 2) * hit;
	});
	return echo(b, 0.31, 0.45, 4);
}

function rockfall(ctx: BaseAudioContext): AudioBuffer {
	const rand = noise(53);
	const a = lowpass(1600, ctx.sampleRate);
	let y = 0;
	// Stones landing at irregular times, thinning out.
	const hits = [0, 0.11, 0.19, 0.34, 0.41, 0.6, 0.77, 1.02, 1.3];
	const b = buffer(ctx, 2.6, (t) => {
		y += a * (rand() - y);
		let env = 0;
		for (const h of hits) if (t >= h) env += Math.exp(-(t - h) / 0.05) * (1 - h / 1.6);
		return y * env * 1.4;
	});
	return echo(b, 0.27, 0.35, 3);
}

function groan(ctx: BaseAudioContext): AudioBuffer {
	const rand = noise(67);
	const a = lowpass(180, ctx.sampleRate);
	let y = 0;
	let phase = 0;
	return buffer(ctx, 3.5, (t) => {
		y += a * (rand() - y);
		const freq = 48 + 10 * Math.sin(t * 1.3);
		phase += (2 * Math.PI * freq) / ctx.sampleRate;
		const swell = Math.sin((t / 3.5) * Math.PI);
		return (Math.sin(phase) * 0.5 + y * 3) * swell * 0.8;
	});
}

function lap(ctx: BaseAudioContext): AudioBuffer {
	const rand = noise(79);
	const a = lowpass(700, ctx.sampleRate);
	let y = 0;
	const seconds = 4;
	return buffer(ctx, seconds, (t) => {
		y += a * (rand() - y);
		// Two slow overlapping laps per loop; starts and ends quiet so it loops cleanly.
		const env = Math.pow(Math.sin((t / seconds) * Math.PI * 2), 2);
		return y * env * 1.6;
	});
}

function shuffle(ctx: BaseAudioContext): AudioBuffer {
	const rand = noise(83);
	const a = lowpass(900, ctx.sampleRate);
	let y = 0;
	// A slow drag that scuffs at the end.
	return buffer(ctx, 0.45, (t) => {
		y += a * (rand() - y);
		const drag = Math.sin(Math.min(1, t / 0.3) * Math.PI) * 0.6;
		const scuff = t > 0.28 ? Math.exp(-(t - 0.28) / 0.04) : 0;
		return y * (drag + scuff * 1.5) * 1.6;
	});
}

function rush(ctx: BaseAudioContext): AudioBuffer {
	const rand = noise(89);
	const a = lowpass(2400, ctx.sampleRate);
	let y = 0;
	return buffer(ctx, 0.7, (t) => {
		y += a * (rand() - y);
		// Fast swell and drop, with quick footfalls through it.
		const swell = Math.sin(Math.min(1, t / 0.7) * Math.PI);
		const steps = Math.exp(-((t * 9) % 1) / 0.12);
		return y * swell * (0.5 + steps) * 1.3;
	});
}

function snarl(ctx: BaseAudioContext): AudioBuffer {
	const rand = noise(97);
	const a = lowpass(1400, ctx.sampleRate);
	let y = 0;
	let phase = 0;
	return buffer(ctx, 0.9, (t) => {
		y += a * (rand() - y);
		// Rasping voice: noise modulated by a low, wavering buzz.
		const freq = 95 + 25 * Math.sin(t * 17);
		phase += (2 * Math.PI * freq) / ctx.sampleRate;
		const env = Math.min(1, t / 0.06) * Math.exp(-t / 0.45);
		const strike = t > 0.35 ? Math.exp(-(t - 0.35) / 0.03) * 1.5 : 0;
		return (y * (1 + Math.sin(phase)) * env + y * strike) * 1.4;
	});
}

function hurt(ctx: BaseAudioContext): AudioBuffer {
	const rand = noise(101);
	const a = lowpass(1100, ctx.sampleRate);
	let y = 0;
	return buffer(ctx, 0.5, (t) => {
		y += a * (rand() - y);
		return y * Math.min(1, t / 0.02) * Math.exp(-t / 0.15) * 2.2;
	});
}

function heartbeat(ctx: BaseAudioContext, period: number): AudioBuffer {
	const beat = (t: number) => (t >= 0 ? Math.sin(2 * Math.PI * 48 * t) * Math.exp(-t / 0.05) : 0);
	return buffer(ctx, period, (t) => beat(t) + beat(t - 0.24) * 0.7);
}

function whisper(ctx: BaseAudioContext): AudioBuffer {
	const rand = noise(103);
	const a = lowpass(5000, ctx.sampleRate);
	const b = lowpass(1800, ctx.sampleRate);
	let y = 0;
	let z = 0;
	return buffer(ctx, 1.8, (t) => {
		y += a * (rand() - y);
		z += b * (y - z);
		// Breathy syllables: high-passed noise gated in uneven bursts.
		const syllable = Math.max(0, Math.sin(t * 11 + Math.sin(t * 3) * 2));
		const env = Math.sin((t / 1.8) * Math.PI);
		return (y - z) * syllable * env * 2.5;
	});
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
		case 'drip':
			return drip(ctx);
		case 'knock':
			return knock(ctx);
		case 'rockfall':
			return rockfall(ctx);
		case 'groan':
			return groan(ctx);
		case 'lap':
			return lap(ctx);
		case 'shuffle':
			return shuffle(ctx);
		case 'rush':
			return rush(ctx);
		case 'snarl':
			return snarl(ctx);
		case 'hurt':
			return hurt(ctx);
		case 'heartbeat':
			return heartbeat(ctx, spec.period);
		case 'whisper':
			return whisper(ctx);
	}
}
