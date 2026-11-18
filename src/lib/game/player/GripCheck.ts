import * as THREE from 'three';
import { ITEMS } from '#lib/content/items.ts';
import { emptyInventory, newStack } from '#lib/shared/items/inventory.ts';
import { createPlayerState } from '#lib/shared/player/simulate.ts';
import { HAND, type PlayerState } from '#lib/shared/player/types.ts';
import { PlayerBody } from './PlayerBody.ts';

/** What the test explorer does with the item: holds it, fires, reloads, or uses it. */
export type GripPose = 'hold' | 'fire' | 'reload' | 'use';
export const GRIP_POSES: GripPose[] = ['hold', 'fire', 'reload', 'use'];

/** Every item that can be in the hand (has a `grip`), in ITEMS order. */
export const GRIP_ITEMS = Object.values(ITEMS)
	.filter((def) => def.grip)
	.map((def) => def.id);

/** How far in front of you the test explorer stands (m). */
const AHEAD = 2;
/** Seconds between shots while it fires. */
const SHOT_EVERY = 1;

/**
 * The admin Grip check (dev only, client only): an explorer standing in front of you holding an
 * item, to check where each one sits in the hand and how the arms hold, fire, reload and use
 * it. It is a `PlayerBody` fed a made-up state, so it draws exactly as a teammate would.
 * See docs/dev/player.md#admin-tools.
 */
export class GripCheck {
	readonly root = new THREE.Group();
	private body: PlayerBody | null = null;
	private state: PlayerState | null = null;
	private pose: GripPose = 'hold';
	private clock = 0;

	constructor() {
		this.root.name = 'grip-check';
	}

	/**
	 * Show `item` (null: nothing) in `pose`, standing `AHEAD` in front of the feet at `feet`,
	 * facing back toward someone looking along `yaw`.
	 */
	show(item: string | null, pose: GripPose, feet: [number, number, number], yaw: number): void {
		if (!item || !ITEMS[item]?.grip) {
			this.body?.dispose();
			this.body = null;
			this.state = null;
			return;
		}
		const at: [number, number, number] = [
			feet[0] - Math.sin(yaw) * AHEAD,
			feet[1],
			feet[2] - Math.cos(yaw) * AHEAD
		];
		const inventory = emptyInventory();
		const def = ITEMS[item];
		const stack = newStack(item, 1, def.firearm?.magazine);
		if (def.category === 'weapon') {
			inventory.equipment.primary = stack;
			inventory.selected = HAND.primary;
		} else {
			inventory.quick[0] = stack;
			inventory.selected = HAND.quick;
		}
		this.state = createPlayerState(at, yaw + Math.PI, inventory);
		this.state.grounded = true;
		this.state.headlamp = 0;
		this.pose = pose;
		this.clock = 0;
		if (!this.body) {
			this.body = new PlayerBody();
			this.root.add(this.body.root);
		}
		this.body.root.position.set(...at);
	}

	update(delta: number): void {
		const { body, state } = this;
		if (!body || !state) return;
		this.clock += delta;
		const def =
			ITEMS[state.inventory.equipment.primary?.item ?? state.inventory.quick[0]?.item ?? ''];
		const w = state.weapon;
		w.action = 'none';
		state.bandaging = 0;
		state.charging = 0;
		if (this.pose === 'fire' && def?.firearm) {
			w.action = 'shot';
			w.time = this.clock % SHOT_EVERY;
			w.shots = Math.floor(this.clock / SHOT_EVERY);
		} else if (this.pose === 'reload' && def?.firearm) {
			const cycle = def.firearm.reloadTime + 0.6;
			const t = this.clock % cycle;
			w.action = t < def.firearm.reloadTime ? 'reload' : 'none';
			w.time = t;
		} else if (this.pose === 'use' && def?.heal) {
			state.bandaging = 1 + (this.clock % def.heal.seconds);
		} else if (this.pose === 'use' && def?.charge) {
			state.charging = 1 + (this.clock % def.charge.seconds);
		} else if (this.pose === 'use' && def?.melee) {
			const swing = def.melee.windup + def.melee.recovery;
			const cycle = swing + 0.6;
			const t = this.clock % cycle;
			w.action = t < swing ? 'swing' : 'none';
			w.time = t;
		}
		body.update(delta, state, state.yaw);
	}

	dispose(): void {
		this.body?.dispose();
		this.root.removeFromParent();
	}
}
