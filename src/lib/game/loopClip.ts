import * as THREE from 'three';

/**
 * A clip cut to `start`..`end` that loops without a jump, for clips that were never made to loop
 * (the explorer's crawl, cut from a crawl that stops to look back). Over its last `blend` seconds
 * it eases from its own motion into the motion that leads up to `start`, so the last frame is the
 * first one again. Resampled at `fps`. `blend` is held to what there is before `start`, and to half
 * the loop.
 */
export function seamlessLoop(
	source: THREE.AnimationClip,
	name: string,
	start: number,
	end: number,
	blend: number,
	fps = 30
): THREE.AnimationClip {
	const length = end - start;
	const frames = Math.max(1, Math.round(length * fps));
	const fade = Math.max(0, Math.min(blend, start, length / 2));
	const tracks = source.tracks.map((track) => {
		const size = track.getValueSize();
		const quaternion = track instanceof THREE.QuaternionKeyframeTrack;
		const Interpolant = quaternion ? THREE.QuaternionLinearInterpolant : THREE.LinearInterpolant;
		const sampler = new Interpolant(track.times, track.values, size, new Float32Array(size));
		const at = (time: number, into: number[]) => {
			const result = sampler.evaluate(time);
			for (let k = 0; k < size; k++) into[k] = result[k];
		};
		const own = new Array<number>(size).fill(0);
		const lead = new Array<number>(size).fill(0);
		const mixed = new Array<number>(size).fill(0);
		const times = new Float32Array(frames + 1);
		const values = new Float32Array((frames + 1) * size);
		for (let i = 0; i <= frames; i++) {
			const t = (i / frames) * length;
			times[i] = t;
			at(start + t, own);
			const into = fade > 0 ? (t - (length - fade)) / fade : -1;
			if (into <= 0) {
				values.set(own, i * size);
				continue;
			}
			// What led up to the start, a loop earlier: at the last frame, the start itself.
			at(start + t - length, lead);
			const s = into * into * (3 - 2 * into);
			if (quaternion) THREE.Quaternion.slerpFlat(mixed, 0, own, 0, lead, 0, s);
			else for (let k = 0; k < size; k++) mixed[k] = own[k] + (lead[k] - own[k]) * s;
			values.set(mixed, i * size);
		}
		const out = track.clone();
		out.times = times;
		out.values = values;
		return out;
	});
	return new THREE.AnimationClip(name, length, tracks);
}
