import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { seamlessLoop } from './loopClip.ts';

/** A clip that never comes back where it started: x runs 0..3 over 3 s, a turn grows with it. */
function drifting(): THREE.AnimationClip {
	const times = [0, 1, 2, 3];
	const turn = (t: number) =>
		new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t);
	return new THREE.AnimationClip('drift', 3, [
		new THREE.VectorKeyframeTrack(
			'a.position',
			times,
			times.flatMap((t) => [t, 0, 0])
		),
		new THREE.QuaternionKeyframeTrack(
			'a.quaternion',
			times,
			times.flatMap((t) => turn(t).toArray())
		)
	]);
}

describe('seamlessLoop', () => {
	it('ends on the frame it starts with, and plays its own motion before the blend', () => {
		const clip = seamlessLoop(drifting(), 'loop', 1, 2.5, 0.5);
		expect(clip.duration).toBeCloseTo(1.5);
		for (const track of clip.tracks) {
			const size = track.getValueSize();
			const first = Array.from(track.values.slice(0, size));
			const last = Array.from(track.values.slice(-size));
			last.forEach((v, k) => expect(v).toBeCloseTo(first[k], 5));
		}
		// Halfway, well before the blend: the clip as it was (x = start + t).
		const position = clip.tracks[0];
		const half = position.times.findIndex((t) => t >= 0.5);
		expect(position.values[half * 3]).toBeCloseTo(1 + position.times[half], 5);
	});

	it('blends no longer than there is before the start', () => {
		const clip = seamlessLoop(drifting(), 'loop', 0.2, 2, 1);
		const position = clip.tracks[0];
		// Untouched until the last 0.2 s.
		const i = position.times.findIndex((t) => t >= 1.5);
		expect(position.values[i * 3]).toBeCloseTo(0.2 + position.times[i], 5);
		expect(position.values[position.values.length - 3]).toBeCloseTo(0.2, 5);
	});
});
