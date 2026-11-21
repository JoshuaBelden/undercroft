/**
 * Where a clip loops best: the start and end times whose poses come closest (bone rotations,
 * summed), for clips that were never made to loop. Cut the loop there in the animation map
 * (`start`, `end`) and blend the rest away with `loopBlend` (src/lib/content/animations.ts).
 *
 *   pnpm exec tsx scripts/anim-loop.ts <model.glb> <clip> [from] [to] [shortest]
 *
 * Searches starts and ends between `from` and `to` seconds (default the whole clip), at least
 * `shortest` seconds apart (default 1). See docs/dev/player.md#player-model.
 */
import { NodeIO, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const [file, name, fromArg, toArg, shortestArg] = process.argv.slice(2);
if (!file || !name) {
	console.error('usage: tsx scripts/anim-loop.ts <model.glb> <clip> [from] [to] [shortest]');
	process.exit(1);
}
await MeshoptDecoder.ready;
const io = new NodeIO()
	.registerExtensions(ALL_EXTENSIONS)
	.registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(file);
const anim = doc
	.getRoot()
	.listAnimations()
	.find((a) => a.getName() === name);
if (!anim) {
	console.error(`no clip ${name}`);
	process.exit(1);
}

interface Track {
	node: string;
	times: ArrayLike<number>;
	values: ArrayLike<number>;
}
const tracks: Track[] = [];
let duration = 0;
for (const channel of anim.listChannels()) {
	const sampler = channel.getSampler();
	const input = sampler?.getInput()?.getArray();
	const output = sampler?.getOutput()?.getArray();
	if (channel.getTargetPath() !== 'rotation' || !input || !output) continue;
	duration = Math.max(duration, input[input.length - 1]);
	tracks.push({ node: (channel.getTargetNode() as Node).getName(), times: input, values: output });
}

/** A track's rotation at `time` (linear, the short way round; not normalized). */
function sample(track: Track, time: number): number[] {
	const { times, values } = track;
	let i = 0;
	while (i < times.length - 1 && times[i + 1] <= time) i++;
	const j = Math.min(i + 1, times.length - 1);
	const span = times[j] - times[i];
	const f = span > 0 ? Math.min(1, Math.max(0, (time - times[i]) / span)) : 0;
	const a = [0, 1, 2, 3].map((k) => values[i * 4 + k]);
	const b = [0, 1, 2, 3].map((k) => values[j * 4 + k]);
	const sign = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
	return a.map((v, k) => v * (1 - f) + b[k] * sign * f);
}

/** The angle (rad) between two rotations. */
function angle(p: number[], q: number[]): number {
	const dot = Math.abs(p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3]);
	return 2 * Math.acos(Math.min(1, dot / (Math.hypot(...p) * Math.hypot(...q))));
}

const from = Number(fromArg ?? 0);
const to = Math.min(duration, Number(toArg ?? duration));
const shortest = Number(shortestArg ?? 1);
const pairs: { start: number; end: number; off: number }[] = [];
for (let start = from; start <= to; start += 1 / 30) {
	const at = tracks.map((t) => sample(t, start));
	for (let end = start + shortest; end <= to; end += 1 / 60) {
		let off = 0;
		tracks.forEach((t, k) => (off += angle(at[k], sample(t, end))));
		pairs.push({ start, end, off });
	}
}
pairs.sort((a, b) => a.off - b.off);
console.log(`${name}: ${duration.toFixed(3)} s, ${tracks.length} bones`);
for (const { start, end, off } of pairs.slice(0, 8)) {
	const worst = tracks
		.map((t) => [t.node, angle(sample(t, start), sample(t, end))] as const)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3)
		.map(([n, d]) => `${n} ${d.toFixed(2)}`)
		.join(', ');
	console.log(`${start.toFixed(3)} to ${end.toFixed(3)}: ${off.toFixed(2)} rad off (${worst})`);
}
