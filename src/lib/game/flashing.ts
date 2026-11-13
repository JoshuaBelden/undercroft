import { settings } from '#lib/settings/settings.svelte.ts';

/**
 * The "Reduce flashing" accessibility setting, for everything that flashes: lamp flicker and
 * cut-outs, muzzle flashes, the hurt vignette. Only what is drawn changes; the simulation (and
 * so what the server thinks your lamp lights) is the same either way. See docs/dev/player.md.
 */

/** Seconds a light level takes to follow a change while reducing flashing. */
const SETTLE = 0.3;

export function reduceFlashing(): boolean {
	return settings.accessibility.reduceFlashing;
}

/** How much of a flash's peak to show: a quarter while reducing flashing. */
export function flashStrength(): number {
	return reduceFlashing() ? 0.25 : 1;
}

/**
 * Follows a light level. Normally it passes the level straight through; while reducing flashing
 * it eases toward it, so flicker becomes a waver and a cut-out a slow dip, not a strobe.
 */
export class SteadyLight {
	private value: number | null = null;
	private last = 0;

	follow(target: number): number {
		const now = performance.now();
		const dt = (now - this.last) / 1000;
		this.last = now;
		if (!reduceFlashing() || this.value === null || dt > 1) {
			this.value = target;
			return target;
		}
		this.value += (target - this.value) * (1 - Math.exp(-dt / SETTLE));
		return this.value;
	}
}
