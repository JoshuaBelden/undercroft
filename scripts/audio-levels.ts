/**
 * How loud every sound in the registry plays, for mixing: `pnpm asset:levels`.
 * See "Mix" in docs/dev/player.md.
 *
 * For each sound it measures the built files (EBU R128 loudness in LUFS, with silence padded on so
 * short one-shots aren't gated out, and the true peak), averages the variants and adds the
 * registry `volume` as gain: the level it plays at the source, before distance, the category
 * volume and the player's settings. Sounds that still fall back to a synthesized placeholder are
 * listed at the end.
 */
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { AUDIO_FILES } from '../src/lib/content/audio/files.generated.ts';
import { SOUNDS, type SoundDef } from '../src/lib/content/audio/sounds.ts';

if (!ffmpegPath) throw new Error('ffmpeg-static has no binary for this platform');
const ffmpeg = ffmpegPath as unknown as string;

function measure(url: string): { lufs: number; peak: number } {
	const result = spawnSync(
		ffmpeg,
		[
			'-hide_banner',
			'-nostats',
			'-i',
			`static${url}`,
			'-af',
			'apad=pad_dur=0.5,ebur128=peak=true',
			'-f',
			'null',
			'-'
		],
		{ encoding: 'utf8' }
	);
	const summary = result.stderr.slice(result.stderr.lastIndexOf('Summary:'));
	return {
		lufs: Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]),
		peak: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1])
	};
}

const measured: { line: string; level: number }[] = [];
const placeholders: string[] = [];
for (const [id, def] of Object.entries(SOUNDS) as [string, SoundDef][]) {
	const ids = Array.isArray(def.file) ? def.file : def.file ? [def.file] : [];
	const urls = ids.flatMap((file) => AUDIO_FILES[file] ?? []);
	if (!urls.length) {
		placeholders.push(`${def.category.padEnd(9)}${id}${def.synth ? ` (${def.synth.kind})` : ''}`);
		continue;
	}
	const each = urls.map(measure);
	const lufs = each.reduce((sum, m) => sum + m.lufs, 0) / each.length;
	const peak = Math.max(...each.map((m) => m.peak));
	const level = lufs + 20 * Math.log10(def.volume);
	measured.push({
		level,
		line: `${level.toFixed(1).padStart(6)}  ${def.category.padEnd(9)}${id.padEnd(24)}volume ${def.volume.toFixed(2)}  file ${lufs.toFixed(1).padStart(5)} LUFS, peak ${peak.toFixed(1)} dBFS${urls.length > 1 ? `, ${urls.length} variants` : ''}`
	});
}

console.log('Plays at (LUFS), loudest first:\n');
for (const { line } of measured.sort((a, b) => b.level - a.level)) console.log(line);
console.log(`\nStill synthesized placeholders (${placeholders.length}):\n`);
for (const line of placeholders.sort()) console.log(`        ${line}`);
