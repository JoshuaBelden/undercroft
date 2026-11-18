import * as THREE from 'three';
import { UPPER_ONCE, UPPER_SLOTS, type UpperMap, type UpperSlot } from '#lib/content/animations.ts';

/** Seconds to blend a pose in or out. */
const FADE = 0.2;
/** A shot or a reload comes in quicker, so the kick isn't lost in the blend. */
const FADE_ONCE = 0.05;

/** One upper-body clip's rotation tracks, by the bone each turns. */
export interface UpperClip {
	duration: number;
	tracks: { bone: string; track: THREE.KeyframeTrack }[];
}

/**
 * The rotation tracks of a clip, by bone name (`<bone>.quaternion`). Upper-body clips only turn
 * bones: anything else in them is ignored.
 */
export function upperTracks(clip: THREE.AnimationClip): UpperClip {
	const tracks = clip.tracks
		.filter((t) => t.name.endsWith('.quaternion'))
		.map((track) => ({ bone: track.name.slice(0, -'.quaternion'.length), track }));
	return { duration: clip.duration, tracks };
}

/** What the arms should be doing: a slot, how far into it, and how long it should take. */
export interface UpperPose {
	slot: UpperSlot;
	/** Seconds into it (a clip that plays once starts here, to stay with the server). */
	at: number;
	/** Stretch (or squeeze) it to last this long (a reload, to the gun's reload time). */
	seconds?: number;
}

interface Layer {
	slot: UpperSlot;
	clip: UpperClip;
	interpolants: { bone: THREE.Object3D; sample: THREE.Interpolant }[];
	/** Clip time. */
	time: number;
	speed: number;
	weight: number;
	/** Seconds it fades in over. */
	fade: number;
	/** Fading out, to be dropped at 0. */
	leaving: boolean;
}

const sampled = new THREE.Quaternion();

/** Samples a rotation track: slerps between keys (a held key is two equal ones). */
function interpolant(track: THREE.KeyframeTrack): THREE.Interpolant {
	return new THREE.QuaternionLinearInterpolant(track.times, track.values, 4, new Float32Array(4));
}

/**
 * Upper-body clips played over a rigged model's full-body animation (the explorer holding,
 * firing, reloading and using things while the legs walk, run or crouch). Call `apply` each
 * frame after the full-body clip has posed the bones: each bone a clip turns is blended from
 * that pose toward the clip's, so legs, hips and anything else the clip leaves alone keep
 * moving. Poses fade in and out over FADE (a shot or reload comes in over FADE_ONCE).
 * See docs/dev/player.md#player-model.
 */
export class UpperBody {
	private clips = new Map<UpperSlot, UpperClip>();
	private layers: Layer[] = [];

	constructor(
		private scene: THREE.Object3D,
		clips: THREE.AnimationClip[],
		map: UpperMap
	) {
		for (const slot of UPPER_SLOTS) {
			const spec = map[slot];
			const clip = spec && clips.find((c) => c.name === spec.clip);
			if (clip) this.clips.set(slot, upperTracks(clip));
		}
	}

	/** Whether the model has a clip for this slot. */
	has(slot: UpperSlot): boolean {
		return this.clips.has(slot);
	}

	/**
	 * Hold this pose (null: the arms go back to the full-body clip). Asking for the pose already
	 * playing does nothing unless `restart` is set (another shot).
	 */
	play(pose: UpperPose | null, restart = false): void {
		const top = this.layers[this.layers.length - 1];
		const same = top && !top.leaving && pose && top.slot === pose.slot;
		if (same && !restart) {
			if (pose.seconds) top.speed = top.clip.duration / pose.seconds;
			return;
		}
		for (const layer of this.layers) layer.leaving = true;
		const clip = pose ? this.clips.get(pose.slot) : undefined;
		if (!pose || !clip) return;
		const speed = pose.seconds ? clip.duration / pose.seconds : 1;
		const interpolants = clip.tracks.flatMap(({ bone, track }) => {
			const node = this.scene.getObjectByName(bone);
			return node ? [{ bone: node, sample: interpolant(track) }] : [];
		});
		this.layers.push({
			slot: pose.slot,
			clip,
			interpolants,
			time: Math.min(pose.at * speed, clip.duration),
			speed,
			// Another shot takes over where the last one is.
			weight: same ? top.weight : 0,
			fade: UPPER_ONCE.has(pose.slot) ? FADE_ONCE : FADE,
			leaving: false
		});
	}

	/** Advance and blend over the pose the full-body clip just set. */
	apply(delta: number): void {
		for (const layer of this.layers) {
			const step = delta / (layer.leaving ? FADE : layer.fade);
			layer.weight = Math.max(0, Math.min(1, layer.weight + (layer.leaving ? -step : step)));
			layer.time += delta * layer.speed;
			const { duration } = layer.clip;
			layer.time = UPPER_ONCE.has(layer.slot)
				? Math.min(layer.time, duration)
				: duration > 0
					? layer.time % duration
					: 0;
		}
		this.layers = this.layers.filter((l) => !(l.leaving && l.weight <= 0));
		for (const layer of this.layers) {
			for (const { bone, sample } of layer.interpolants) {
				const v = sample.evaluate(layer.time);
				sampled.set(v[0], v[1], v[2], v[3]);
				bone.quaternion.slerp(sampled, layer.weight);
			}
		}
	}
}
