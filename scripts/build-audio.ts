/**
 * Turns raw recordings (art/sfx/*.wav) into game sounds. Run with `pnpm asset:audio`.
 * See docs/dev/asset-pipeline.md.
 *
 * For each entry in scripts/audio.config.ts:
 *  1. Reads 16-bit PCM WAV (any channel count / sample rate) and mixes it to mono.
 *  2. Low-pass filters and resamples to OUTPUT_RATE.
 *  3. Trims leading/trailing silence (unless keepSilence), or slices it into one file per hit.
 *  4. Normalizes the peak, adds short fades, and writes 16-bit mono WAV to static/assets/audio.
 *  5. Writes src/lib/content/audio/files.generated.ts: sound file id -> list of URLs.
 *
 * Pure Node, no encoder needed. Files are small mono WAVs; switch to a compressed format
 * here later if the audio library grows.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';
import { AUDIO_SOURCES, type AudioSource } from './audio.config.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'art', 'sfx');
const OUT_DIR = path.join(ROOT, 'static', 'assets', 'audio');
const MANIFEST = path.join(ROOT, 'src', 'lib', 'content', 'audio', 'files.generated.ts');
const URL_BASE = '/assets/audio';

const OUTPUT_RATE = 32000;
const PEAK = 0.89; // -1 dBFS
/** Trim threshold relative to the clip peak (-40 dB). */
const SILENCE = 0.01;
const FADE = 0.005;

interface Pcm {
	rate: number;
	samples: Float32Array;
}

function readWav(file: string): Pcm {
	const b = readFileSync(file);
	if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') {
		throw new Error(`${file}: not a WAV file`);
	}
	let offset = 12;
	let channels = 0;
	let rate = 0;
	let bits = 0;
	let format = 0;
	let data: Buffer | null = null;
	while (offset + 8 <= b.length) {
		const id = b.toString('ascii', offset, offset + 4);
		const length = b.readUInt32LE(offset + 4);
		if (id === 'fmt ') {
			format = b.readUInt16LE(offset + 8);
			channels = b.readUInt16LE(offset + 10);
			rate = b.readUInt32LE(offset + 12);
			bits = b.readUInt16LE(offset + 22);
		} else if (id === 'data') {
			data = b.subarray(offset + 8, offset + 8 + length);
		}
		offset += 8 + length + (length % 2);
	}
	if (!data || format !== 1 || bits !== 16) {
		throw new Error(`${file}: only 16-bit PCM WAV is supported (format ${format}, ${bits}-bit)`);
	}
	const frames = Math.floor(data.length / (2 * channels));
	const samples = new Float32Array(frames);
	for (let i = 0; i < frames; i++) {
		let sum = 0;
		for (let c = 0; c < channels; c++) sum += data.readInt16LE((i * channels + c) * 2);
		samples[i] = sum / channels / 32768;
	}
	return { rate, samples };
}

/** Two passes of a biquad low-pass at `cutoff` Hz (anti-aliasing before resampling). */
function lowpass(pcm: Pcm, cutoff: number): Float32Array {
	const w = (2 * Math.PI * cutoff) / pcm.rate;
	const q = Math.SQRT1_2;
	const alpha = Math.sin(w) / (2 * q);
	const cos = Math.cos(w);
	const a0 = 1 + alpha;
	const b0 = (1 - cos) / 2 / a0;
	const b1 = (1 - cos) / a0;
	const b2 = b0;
	const a1 = (-2 * cos) / a0;
	const a2 = (1 - alpha) / a0;
	let out = pcm.samples;
	for (let pass = 0; pass < 2; pass++) {
		const next = new Float32Array(out.length);
		let x1 = 0;
		let x2 = 0;
		let y1 = 0;
		let y2 = 0;
		for (let i = 0; i < out.length; i++) {
			const x = out[i];
			const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
			next[i] = y;
			x2 = x1;
			x1 = x;
			y2 = y1;
			y1 = y;
		}
		out = next;
	}
	return out;
}

function resample(pcm: Pcm, rate: number): Pcm {
	if (pcm.rate === rate) return pcm;
	const source = pcm.rate > rate ? lowpass(pcm, rate * 0.45) : pcm.samples;
	const length = Math.floor((source.length * rate) / pcm.rate);
	const out = new Float32Array(length);
	const step = pcm.rate / rate;
	for (let i = 0; i < length; i++) {
		const pos = i * step;
		const i0 = Math.floor(pos);
		const frac = pos - i0;
		out[i] = source[i0] * (1 - frac) + (source[Math.min(i0 + 1, source.length - 1)] ?? 0) * frac;
	}
	return { rate, samples: out };
}

/** RMS envelope in 10 ms windows. */
function envelope(pcm: Pcm): { window: number; values: number[] } {
	const window = Math.floor(pcm.rate * 0.01);
	const values: number[] = [];
	for (let i = 0; i + window <= pcm.samples.length; i += window) {
		let sum = 0;
		for (let j = 0; j < window; j++) sum += pcm.samples[i + j] ** 2;
		values.push(Math.sqrt(sum / window));
	}
	return { window, values };
}

function trim(pcm: Pcm): Pcm {
	const s = pcm.samples;
	let peak = 0;
	for (const v of s) peak = Math.max(peak, Math.abs(v));
	const floor = peak * SILENCE;
	let start = 0;
	let end = s.length;
	while (start < end && Math.abs(s[start]) < floor) start++;
	while (end > start && Math.abs(s[end - 1]) < floor) end--;
	const pad = Math.floor(pcm.rate * 0.01);
	return {
		rate: pcm.rate,
		samples: s.slice(Math.max(0, start - pad), Math.min(s.length, end + pad))
	};
}

/** Split a recording of several hits into one clip per hit (onset detection on the envelope). */
function slice(pcm: Pcm, options: NonNullable<AudioSource['slice']>): Pcm[] {
	const { window, values } = envelope(pcm);
	const max = Math.max(...values);
	const threshold = max * (options.threshold ?? 0.25);
	const rearm = threshold * 0.5;
	const minGap = Math.round(options.minGap / 0.01);
	const onsets: number[] = [];
	let armed = true;
	for (let i = 0; i < values.length; i++) {
		if (
			armed &&
			values[i] >= threshold &&
			(!onsets.length || i - onsets[onsets.length - 1] >= minGap)
		) {
			// Back up to where this hit starts rising.
			let start = i;
			while (start > 0 && values[start - 1] > rearm * 0.5 && values[start - 1] < values[start])
				start--;
			onsets.push(start);
			armed = false;
		} else if (values[i] < rearm) {
			armed = true;
		}
	}
	return onsets.map((onset, k) => {
		const from = Math.max(0, onset * window - Math.floor(pcm.rate * 0.005));
		const next = k + 1 < onsets.length ? onsets[k + 1] * window : pcm.samples.length;
		const to = Math.min(next, from + Math.floor(options.maxLength * pcm.rate));
		return { rate: pcm.rate, samples: pcm.samples.slice(from, to) };
	});
}

function finish(pcm: Pcm, fadeOut = FADE): Pcm {
	const s = pcm.samples.slice();
	let peak = 0;
	for (const v of s) peak = Math.max(peak, Math.abs(v));
	const gain = peak > 0 ? PEAK / peak : 1;
	const fadeIn = Math.floor(pcm.rate * FADE);
	const fadeOutLength = Math.floor(pcm.rate * fadeOut);
	for (let i = 0; i < s.length; i++) {
		let g = gain;
		if (i < fadeIn) g *= i / fadeIn;
		if (i >= s.length - fadeOutLength) g *= (s.length - i) / fadeOutLength;
		s[i] *= g;
	}
	return { rate: pcm.rate, samples: s };
}

function writeWav(file: string, pcm: Pcm): number {
	const data = Buffer.alloc(pcm.samples.length * 2);
	for (let i = 0; i < pcm.samples.length; i++) {
		const v = Math.max(-1, Math.min(1, pcm.samples[i]));
		data.writeInt16LE(Math.round(v * 32767), i * 2);
	}
	const header = Buffer.alloc(44);
	header.write('RIFF', 0, 'ascii');
	header.writeUInt32LE(36 + data.length, 4);
	header.write('WAVE', 8, 'ascii');
	header.write('fmt ', 12, 'ascii');
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(1, 20); // PCM
	header.writeUInt16LE(1, 22); // mono
	header.writeUInt32LE(pcm.rate, 24);
	header.writeUInt32LE(pcm.rate * 2, 28);
	header.writeUInt16LE(2, 32);
	header.writeUInt16LE(16, 34);
	header.write('data', 36, 'ascii');
	header.writeUInt32LE(data.length, 40);
	writeFileSync(file, Buffer.concat([header, data]));
	return header.length + data.length;
}

async function main(): Promise<void> {
	if (!existsSync(SOURCE_DIR)) {
		console.error(`No raw audio found. Put recordings in ${SOURCE_DIR}`);
		process.exit(1);
	}
	mkdirSync(OUT_DIR, { recursive: true });
	// Clear previous output so removed sounds don't linger.
	for (const f of readdirSync(OUT_DIR)) if (f.endsWith('.wav')) rmSync(path.join(OUT_DIR, f));

	const files: Record<string, string[]> = {};
	let total = 0;
	for (const source of AUDIO_SOURCES) {
		const input = path.join(SOURCE_DIR, source.file);
		if (!existsSync(input)) {
			console.error(`  ✗ ${source.id}: missing ${path.relative(ROOT, input)}`);
			process.exit(1);
		}
		const pcm = resample(readWav(input), OUTPUT_RATE);
		const clips = source.slice
			? slice(pcm, source.slice).map((clip) => finish(clip, 0.03))
			: [finish(source.keepSilence ? pcm : trim(pcm))];
		files[source.id] = clips.map((clip, i) => {
			const name = clips.length > 1 ? `${source.id}-${i + 1}.wav` : `${source.id}.wav`;
			total += writeWav(path.join(OUT_DIR, name), clip);
			return `${URL_BASE}/${name}`;
		});
		const seconds = clips.reduce((sum, c) => sum + c.samples.length, 0) / OUTPUT_RATE;
		console.log(`  ${source.id}: ${clips.length} clip(s), ${seconds.toFixed(2)} s`);
	}

	const source = `// Generated by \`pnpm asset:audio\` from art/sfx. Do not edit by hand.

/** Built sound files: file id -> variant URLs (one is picked at random each play). */
export const AUDIO_FILES: Record<string, string[]> = ${JSON.stringify(files)};
`;
	const config = await prettier.resolveConfig(MANIFEST);
	writeFileSync(MANIFEST, await prettier.format(source, { ...config, filepath: MANIFEST }));
	console.log(
		`Built ${Object.keys(files).length} sounds (${(total / 1e3).toFixed(0)} KB) -> ${path.relative(ROOT, OUT_DIR)}`
	);
}

await main();
