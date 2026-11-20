import { ITEMS } from '../../content/items.ts';
import { MOVEMENT } from '../../content/player/movement.ts';
import type { Vec3 } from '../map/types.ts';
import type { InputFrame, PlayerState, SimEvent, WeaponState } from '../player/types.ts';
import { addWear, isBroken } from './durability.ts';
import { carriedCount, handRef, held, removeItem, spendHeld } from './inventory.ts';

/**
 * The held item's actions, advanced each simulation step: switching, swinging, firing,
 * reloading and throwing. (Applying a healing item is in `stepPlayer`.) Deterministic (part of `stepPlayer`), so ammo and timing are
 * predicted on the client exactly as the server runs them. What happens (a swing landing, a
 * shot) is reported as SimEvents; the server resolves hits and noise from them.
 * See docs/dev/items.md.
 */

/** Seconds to bring a newly selected item up. */
export const EQUIP_TIME = 0.35;

/** Seconds attack is held to draw a throwable back; let go sooner and a melee item swings instead. */
export const THROW_DRAW = 1;

/** Seconds the arm takes to come through after a throw, before the next thing comes up. */
export const THROW_FOLLOW = 0.3;

export function idleWeapon(): WeaponState {
	return {
		action: 'none',
		time: 0,
		done: false,
		aiming: false,
		shots: 0,
		prev: { attack: false, reload: false },
		snag: 0,
		putDown: false
	};
}

/** What's in the hand changed (the inventory screen): bring the new item up. */
export function reequip(w: WeaponState): void {
	start(w, 'equip');
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
		reload: input.reload && !w.prev.reload
	};
	w.prev = { attack: input.attack, reload: input.reload };
	const emit = (event: SimEvent) => events?.push(event);
	const ray = () => aimRay(s, eye);

	// Switching items always works (even mid-action), except while downed.
	if (!s.downed && input.select !== inv.selected && handRef(inv, input.select)) {
		inv.selected = input.select;
		start(w, 'equip');
	}

	const stack = held(inv);
	const def = stack ? ITEMS[stack.item] : undefined;
	w.snag = Math.max(0, (w.snag ?? 0) - dt);
	if (!input.attack) w.putDown = false;
	w.aiming = able && !!def?.firearm && input.aim && w.action !== 'reload';
	if (!able) {
		if (w.action !== 'equip') start(w, 'none');
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
					stack.loaded = (stack.loaded ?? 0) + removeItem(inv, gun.ammo, want);
					emit({ kind: 'reloaded', item: stack.item });
					start(w, 'none');
				}
				break;
			}
			case 'draw': {
				const spec = def?.throwable;
				// Opening the menu, or aim, puts it down: neither a swing nor a throw, and nothing
				// more until attack is let go.
				if (!spec || !stack || input.reading || input.aim) {
					start(w, 'none');
					w.putDown = true;
					break;
				}
				if (input.attack) break;
				if (w.time >= THROW_DRAW) {
					const { origin, direction } = ray();
					// One leaves the hand; when it was the last, the hand goes back to the weapon.
					spendHeld(inv);
					emit({
						kind: 'throw',
						item: stack.item,
						origin,
						direction,
						stack: { ...stack, count: 1 }
					});
					start(w, 'throw');
				} else if (def.melee && payStamina(s, def.melee.stamina ?? 0, true, stack.item, emit)) {
					// Let go early: a swing, already as far into its wind-up as the draw got.
					const time = Math.min(w.time, def.melee.windup);
					start(w, 'swing');
					w.time = time;
				} else {
					start(w, 'none');
				}
				break;
			}
			case 'throw':
				// Whatever is in the hand now (the next one, or the weapon) comes up after.
				if (w.time >= THROW_FOLLOW) start(w, 'equip');
				break;
			case 'place': {
				const spec = def?.place;
				// Let go, moved, or the menu opened: it isn't set down.
				if (!spec || !stack || !input.attack || input.reading || moving(input)) {
					start(w, 'none');
					break;
				}
				if (w.time >= spec.seconds) {
					const { origin, direction } = ray();
					spendHeld(inv);
					emit({ kind: 'place', item: stack.item, origin, direction });
					// Whatever is in the hand now comes up; a fresh press for the next.
					start(w, 'equip');
					w.prev.attack = true;
				}
				break;
			}
		}
	}
	if (w.action !== 'none' || !stack || !def || w.putDown) return;

	// Start something new. Broken, it is in the hand but does nothing: a gun only dry-clicks.
	if (isBroken(stack)) {
		if (def.firearm && pressed.attack) emit({ kind: 'empty', item: stack.item });
		return;
	}
	if (def.firearm) {
		const gun = def.firearm;
		const loaded = stack.loaded ?? 0;
		const canReload = loaded < gun.magazine && carriedCount(inv, gun.ammo) > 0;
		if (pressed.attack) {
			if (loaded > 0) {
				if (!s.flags.infiniteAmmo) stack.loaded = loaded - 1;
				// Every shot wears the gun; the one that breaks it still goes off.
				if (addWear(stack) === 'broke') emit({ kind: 'broke', item: stack.item });
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
	// Held, something to set down is set down, standing still.
	if (def.place && pressed.attack && !moving(input)) {
		start(w, 'place');
		return;
	}
	// Held, a throwable draws back; held, anything else swings again and again.
	if (def.throwable && input.attack) start(w, 'draw');
	else if (def.melee && input.attack) {
		// Snagged: it won't come free yet.
		if (w.snag > 0) return;
		if (payStamina(s, def.melee.stamina ?? 0, pressed.attack, stack.item, emit)) start(w, 'swing');
	}
}

/**
 * Pay a swing's stamina. With too little left (or worn out), no swing: a gasp instead, once a
 * press (`gasp`). Returns whether it swings.
 */
function payStamina(
	s: PlayerState,
	cost: number,
	gasp: boolean,
	item: string,
	emit: (event: SimEvent) => void
): boolean {
	if (cost <= 0 || s.flags.infiniteStamina) return true;
	if (s.stamina < cost || s.exhausted) {
		if (gasp) emit({ kind: 'winded', item });
		return false;
	}
	s.stamina -= cost;
	s.staminaDelay = MOVEMENT.stamina.regenDelay;
	return true;
}

/** Walking (any movement input): setting something down needs standing still. */
function moving(input: InputFrame): boolean {
	return Math.abs(input.moveX) > 0.01 || Math.abs(input.moveZ) > 0.01;
}

/**
 * Whether the held item can be used in this state at all: most things need room (not crawling or
 * in a squeeze) and being on your feet; `cramped` items work crawling and squeezed, `downed`
 * ones while down. `roomy` is the rest of what using anything needs (not swimming, mantling...).
 */
export function canUseHeld(s: PlayerState, roomy: boolean, cramped: boolean): boolean {
	const def = ITEMS[held(s.inventory)?.item ?? ''];
	if (s.downed) return !!def?.downed;
	if (!roomy) return false;
	return !cramped || !!def?.cramped;
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
