import { ITEMS } from '../../content/items.ts';
import type { Vec3 } from '../map/types.ts';
import type { InputFrame, PlayerState, SimEvent, WeaponState } from '../player/types.ts';
import { held, pocketCount, takePocket } from './inventory.ts';

/**
 * The held item's actions, advanced each simulation step: switching, swinging, firing,
 * reloading, throwing and dropping. Deterministic (part of `stepPlayer`), so ammo and timing are
 * predicted on the client exactly as the server runs them. What happens (a swing landing, a
 * shot) is reported as SimEvents; the server resolves hits and noise from them.
 * See docs/dev/items.md.
 */

/** Seconds to bring a newly selected item up. */
export const EQUIP_TIME = 0.35;

export function idleWeapon(): WeaponState {
	return {
		action: 'none',
		time: 0,
		done: false,
		aiming: false,
		shots: 0,
		prev: { attack: false, aim: false, reload: false, drop: false }
	};
}

/** Where shots and swings come from and where they go. */
export function aimRay(s: PlayerState, eye: number): { origin: Vec3; direction: Vec3 } {
	const cp = Math.cos(s.pitch);
	return {
		origin: [s.position[0], s.position[1] + eye, s.position[2]],
		direction: [-Math.sin(s.yaw) * cp, Math.sin(s.pitch), -Math.cos(s.yaw) * cp]
	};
}

/**
 * Advance the held item. `able` is false while the player can't use items (downed, swimming,
 * climbing, crawling, bandaging, reviving); actions in progress are then cancelled.
 */
export function stepWeapon(
	s: PlayerState,
	input: InputFrame,
	dt: number,
	able: boolean,
	eye: number,
	events?: SimEvent[]
): void {
	const w = s.weapon;
	const inv = s.inventory;
	const pressed = {
		attack: input.attack && !w.prev.attack,
		aim: input.aim && !w.prev.aim,
		reload: input.reload && !w.prev.reload,
		drop: input.drop && !w.prev.drop
	};
	w.prev = { attack: input.attack, aim: input.aim, reload: input.reload, drop: input.drop };
	const emit = (event: SimEvent) => events?.push(event);
	const ray = () => aimRay(s, eye);

	// Switching items always works (even mid-action), except while downed.
	if (
		!s.downed &&
		input.select >= 0 &&
		input.select < inv.hotbar.length &&
		input.select !== inv.selected
	) {
		inv.selected = input.select;
		start(w, 'equip');
	}

	const stack = held(inv);
	const def = stack ? ITEMS[stack.item] : undefined;
	w.aiming = able && !!def?.firearm && input.aim && w.action !== 'reload';
	if (!able) {
		if (w.action !== 'equip') start(w, 'none');
		return;
	}

	if (pressed.drop && stack) {
		const { origin, direction } = ray();
		inv.hotbar[inv.selected] = null;
		emit({ kind: 'drop', origin, direction, stack: { ...stack } });
		start(w, 'equip');
		return;
	}

	// Advance the current action.
	if (w.action !== 'none') {
		w.time += dt;
		switch (w.action) {
			case 'equip':
				if (w.time >= EQUIP_TIME) start(w, 'none');
				break;
			case 'swing': {
				const melee = def?.melee;
				if (!melee || !stack) {
					start(w, 'none');
					break;
				}
				if (!w.done && w.time >= melee.windup) {
					w.done = true;
					const { origin, direction } = ray();
					emit({ kind: 'swing', item: stack.item, origin, direction });
				}
				if (w.time >= melee.windup + melee.recovery) start(w, 'none');
				break;
			}
			case 'shot':
				if (!def?.firearm || w.time >= def.firearm.interval) start(w, 'none');
				break;
			case 'reload': {
				const gun = def?.firearm;
				if (!gun || !stack) {
					start(w, 'none');
					break;
				}
				if (w.time >= gun.reloadTime) {
					const want = gun.magazine - (stack.loaded ?? 0);
					stack.loaded = (stack.loaded ?? 0) + takePocket(inv, gun.ammo, want);
					emit({ kind: 'reloaded', item: stack.item });
					start(w, 'none');
				}
				break;
			}
			case 'throw': {
				const spec = def?.throwable;
				if (!spec || !stack) {
					start(w, 'none');
					break;
				}
				// Released partway through the motion.
				if (!w.done && w.time >= spec.duration * 0.4) {
					w.done = true;
					const { origin, direction } = ray();
					inv.hotbar[inv.selected] = null;
					emit({ kind: 'throw', item: stack.item, origin, direction, stack: { ...stack } });
				}
				if (w.time >= spec.duration) start(w, 'none');
				break;
			}
		}
	}
	if (w.action !== 'none' || !stack || !def) return;

	// Start something new.
	if (def.firearm) {
		const gun = def.firearm;
		const loaded = stack.loaded ?? 0;
		const canReload = loaded < gun.magazine && pocketCount(inv, gun.ammo) > 0;
		if (pressed.attack) {
			if (loaded > 0) {
				if (!s.flags.infiniteAmmo) stack.loaded = loaded - 1;
				w.shots++;
				const { origin, direction } = ray();
				emit({
					kind: 'shot',
					item: stack.item,
					origin,
					direction,
					seed: w.shots,
					aimed: w.aiming
				});
				start(w, 'shot');
			} else {
				emit({ kind: 'empty', item: stack.item });
				if (canReload) start(w, 'reload');
			}
		} else if (pressed.reload && canReload) {
			start(w, 'reload');
		}
		return;
	}
	if (def.throwable && pressed.aim) {
		start(w, 'throw');
		return;
	}
	if (def.melee && input.attack) start(w, 'swing');
}

function start(w: WeaponState, action: WeaponState['action']): void {
	w.action = action;
	w.time = 0;
	w.done = false;
}

/** Deterministic pellet directions for a shot: same seed, same spread on server and client. */
export function pelletDirections(
	direction: Vec3,
	spread: number,
	pellets: number,
	seed: number
): Vec3[] {
	// An orthonormal basis around the shot direction.
	const [dx, dy, dz] = direction;
	const up: Vec3 = Math.abs(dy) > 0.95 ? [1, 0, 0] : [0, 1, 0];
	const rx = up[1] * dz - up[2] * dy;
	const ry = up[2] * dx - up[0] * dz;
	const rz = up[0] * dy - up[1] * dx;
	const rl = Math.hypot(rx, ry, rz);
	const right: Vec3 = [rx / rl, ry / rl, rz / rl];
	const u: Vec3 = [
		dy * right[2] - dz * right[1],
		dz * right[0] - dx * right[2],
		dx * right[1] - dy * right[0]
	];
	const out: Vec3[] = [];
	for (let i = 0; i < pellets; i++) {
		// Uniform over the cone's disc.
		const r = Math.sqrt(hash(seed * 31 + i * 2)) * Math.tan(spread);
		const a = hash(seed * 31 + i * 2 + 1) * Math.PI * 2;
		const ox = Math.cos(a) * r;
		const oy = Math.sin(a) * r;
		const v: Vec3 = [
			dx + right[0] * ox + u[0] * oy,
			dy + right[1] * ox + u[1] * oy,
			dz + right[2] * ox + u[2] * oy
		];
		const l = Math.hypot(v[0], v[1], v[2]);
		out.push([v[0] / l, v[1] / l, v[2] / l]);
	}
	return out;
}

function hash(n: number): number {
	let x = Math.imul((n | 0) ^ 0x2c1b3c6d, 0x297a2d39);
	x ^= x >>> 15;
	x = Math.imul(x, 0x85ebca6b);
	x ^= x >>> 13;
	return (x >>> 0) / 4294967296;
}
