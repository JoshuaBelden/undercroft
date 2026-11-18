import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { UpperBody, upperTracks } from './UpperBody.ts';

/** A turn of `angle` about Y, as quaternion values. */
function turn(angle: number): number[] {
	return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle).toArray();
}

/** A skeleton of two bones, `Arm` and `Leg`, and a clip that holds `Arm` turned 90 degrees. */
function rig() {
	const scene = new THREE.Group();
	const arm = new THREE.Bone();
	arm.name = 'Arm';
	const leg = new THREE.Bone();
	leg.name = 'Leg';
	scene.add(arm, leg);
	const hold = new THREE.AnimationClip('Hold', 1, [
		new THREE.QuaternionKeyframeTrack(
			'Arm.quaternion',
			[0, 1],
			[...turn(Math.PI / 2), ...turn(Math.PI / 2)]
		),
		new THREE.VectorKeyframeTrack('Arm.position', [0], [0, 1, 0])
	]);
	return { scene, arm, leg, hold };
}

const angle = (bone: THREE.Object3D) => 2 * Math.acos(Math.min(1, Math.abs(bone.quaternion.w)));

describe('upperTracks', () => {
	it('keeps only rotation tracks, by bone', () => {
		const { hold } = rig();
		const clip = upperTracks(hold);
		expect(clip.tracks.map((t) => t.bone)).toEqual(['Arm']);
		expect(clip.duration).toBe(1);
	});
});

describe('UpperBody', () => {
	it('blends the bones a clip turns toward it, over the fade, and leaves the rest alone', () => {
		const { scene, arm, leg, hold } = rig();
		const upper = new UpperBody(scene, [hold], { hold_item: { clip: 'Hold' } });
		expect(upper.has('hold_item')).toBe(true);
		expect(upper.has('reload')).toBe(false);
		upper.play({ slot: 'hold_item', at: 0 });
		upper.apply(0.1);
		// Half way through the fade.
		expect(angle(arm)).toBeCloseTo(Math.PI / 4, 2);
		arm.quaternion.identity();
		upper.apply(0.2);
		expect(angle(arm)).toBeCloseTo(Math.PI / 2, 2);
		expect(angle(leg)).toBe(0);
	});

	it('letting go fades back to whatever the full-body clip set', () => {
		const { scene, arm, hold } = rig();
		const upper = new UpperBody(scene, [hold], { hold_item: { clip: 'Hold' } });
		upper.play({ slot: 'hold_item', at: 0 });
		upper.apply(0.5);
		upper.play(null);
		arm.quaternion.identity();
		upper.apply(0.1);
		expect(angle(arm)).toBeCloseTo(Math.PI / 4, 2);
		arm.quaternion.identity();
		upper.apply(0.2);
		expect(angle(arm)).toBe(0);
	});

	it('a slot the model has no clip for leaves the arms alone', () => {
		const { scene, arm, hold } = rig();
		const upper = new UpperBody(scene, [hold], {});
		upper.play({ slot: 'hold_item', at: 0 });
		upper.apply(0.5);
		expect(angle(arm)).toBe(0);
	});
});
