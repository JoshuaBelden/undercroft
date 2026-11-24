import * as THREE from 'three';
import { emptyInventory } from '#lib/shared/items/inventory.ts';
import { DEFAULT_LOOK, type Look } from '#lib/shared/player/look.ts';
import { createPlayerState } from '#lib/shared/player/simulate.ts';
import { PlayerBody } from './PlayerBody.ts';

/** Where each stands (x right, z away from the camera, m): the first in front, then behind. */
const SPOTS: [number, number][] = [
	[0, 0],
	[-1.2, 1.3],
	[1.2, 1.3],
	[2.3, 2.4]
];
/** How far into `waiting` a body may start (s): its clip is about this long. */
const WAIT_SPREAD = 8.6;

/** Someone standing in the lineup: who, and how they look. */
export interface LineupMember {
	id: string;
	look?: Look;
}

/**
 * The party standing about on the Expedition page (PartyLineup.svelte draws it and the names):
 * one `PlayerBody` per member, dressed in their look and playing `waiting` from its own point,
 * so nobody moves in step. The first stands in front in the middle, the rest behind: left,
 * right, further right. See docs/dev/expedition.md.
 */
export class Lineup {
	readonly scene = new THREE.Scene();
	readonly camera = new THREE.PerspectiveCamera(28, 1, 0.1, 40);
	private standing = new Map<string, { body: PlayerBody; spot: THREE.Vector3 }>();
	private state = createPlayerState([0, 0, 0], 0, emptyInventory());
	private aim = new THREE.Vector3();

	constructor() {
		this.state.grounded = true;
		this.state.headlamp = 0;
		this.scene.add(new THREE.HemisphereLight(0xfff1dd, 0x2a1f18, 1.1));
		const key = new THREE.DirectionalLight(0xffe2bf, 2.2);
		key.position.set(-2, 3, -3);
		this.scene.add(key);
		const rim = new THREE.DirectionalLight(0xbcd0ff, 1.4);
		rim.position.set(2, 2.5, 3);
		this.scene.add(rim);
	}

	/** Bodies for who is here, in this order, dressed and placed; gone for who left. */
	arrange(members: LineupMember[]): void {
		const here = new Set(members.map((m) => m.id));
		for (const [id, one] of this.standing) {
			if (here.has(id)) continue;
			one.body.dispose();
			this.standing.delete(id);
		}
		members.forEach((member, i) => {
			const look = member.look ?? DEFAULT_LOOK;
			let one = this.standing.get(member.id);
			if (!one) {
				const body = new PlayerBody(false, look);
				body.idle('waiting', Math.random() * WAIT_SPREAD);
				this.scene.add(body.root);
				one = { body, spot: new THREE.Vector3() };
				this.standing.set(member.id, one);
			}
			one.body.setLook(look);
			const [x, z] = SPOTS[Math.min(i, SPOTS.length - 1)];
			one.spot.set(x, 0, z);
			one.body.root.position.copy(one.spot);
		});
	}

	/** Animate everyone and frame them (the game faces -Z: the camera is on that side). */
	update(delta: number): void {
		let middle = 0;
		for (const one of this.standing.values()) middle += one.spot.x;
		middle = this.standing.size ? middle / this.standing.size : 0;
		this.camera.position.set(middle, 1.35, -6.2);
		this.camera.lookAt(this.aim.set(middle, 0.95, 0.9));
		for (const one of this.standing.values()) one.body.update(delta, this.state, 0, 0);
	}

	/** Where someone's feet are on screen, 0..1 from the top left; null if they aren't here. */
	feet(id: string, out: THREE.Vector2): THREE.Vector2 | null {
		const one = this.standing.get(id);
		if (!one) return null;
		const p = one.spot.clone().project(this.camera);
		return out.set((p.x + 1) / 2, (1 - p.y) / 2);
	}

	dispose(): void {
		for (const one of this.standing.values()) one.body.dispose();
		this.standing.clear();
	}
}
