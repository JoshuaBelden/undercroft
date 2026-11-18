import type { Document, Node } from '@gltf-transform/core';

/**
 * Clips made apart from a rigged model, merged into it by bone name: the explorer's hand-keyed
 * upper-body clips (art/export/player/explorer-clips.glb, from scripts/blender/explorer.py) into
 * the explorer. See docs/dev/asset-pipeline.md#the-explorer.
 *
 * Blender exports every bone of every clip, still ones at rest included (left out, it would
 * also drop a channel that holds still off rest: curled fingers, an arm that doesn't move). Only
 * rotation channels that move a bone off its rest pose are kept, so an arm a clip leaves alone
 * follows whatever else is playing. The two files must share their skeleton (the same rest
 * pose): a bone whose rest differs is an error.
 */

/** Quaternions this close (|dot| above it, within about half a degree) are the same rotation. */
const SAME = 1 - 1e-5;
/** The two files' rest poses may differ by float noise, no more (about 1.6 degrees). */
const SAME_REST = 1 - 1e-4;

export function mergeClips(doc: Document, clips: Document): string[] {
	const root = doc.getRoot();
	const buffer = root.listBuffers()[0] ?? doc.createBuffer();
	const bones = new Map<string, Node>(root.listNodes().map((n) => [n.getName(), n]));
	const taken = new Set(root.listAnimations().map((a) => a.getName()));
	const merged: string[] = [];
	for (const clip of clips.getRoot().listAnimations()) {
		const name = clip.getName();
		if (taken.has(name)) throw new Error(`clip ${name} is already in the model`);
		const out = doc.createAnimation(name);
		for (const channel of clip.listChannels()) {
			const source = channel.getTargetNode();
			const sampler = channel.getSampler();
			if (channel.getTargetPath() !== 'rotation' || !source || !sampler) continue;
			const bone = bones.get(source.getName());
			if (!bone) continue;
			if (!sameRotation(source.getRotation(), bone.getRotation(), SAME_REST)) {
				throw new Error(`${source.getName()} rests differently in the clips and the model`);
			}
			const times = sampler.getInput()?.getArray();
			const values = sampler.getOutput()?.getArray();
			if (!times || !values || atRest(values, bone.getRotation())) continue;
			const input = doc
				.createAccessor()
				.setType('SCALAR')
				.setArray(new Float32Array(times))
				.setBuffer(buffer);
			const output = doc
				.createAccessor()
				.setType('VEC4')
				.setArray(new Float32Array(values))
				.setBuffer(buffer);
			const copy = doc
				.createAnimationSampler()
				.setInput(input)
				.setOutput(output)
				.setInterpolation(sampler.getInterpolation());
			out
				.addSampler(copy)
				.addChannel(
					doc
						.createAnimationChannel()
						.setTargetNode(bone)
						.setTargetPath('rotation')
						.setSampler(copy)
				);
		}
		merged.push(name);
	}
	return merged;
}

function sameRotation(a: ArrayLike<number>, b: ArrayLike<number>, within = SAME): boolean {
	return Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) > within;
}

/** Every key of a rotation channel is the bone's rest rotation. */
function atRest(values: ArrayLike<number>, rest: ArrayLike<number>): boolean {
	for (let i = 0; i + 3 < values.length; i += 4) {
		const key = [values[i], values[i + 1], values[i + 2], values[i + 3]];
		if (!sameRotation(key, rest)) return false;
	}
	return true;
}
