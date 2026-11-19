import {
	ATTRACTION,
	byParty,
	type AttractionDef,
	type Movement
} from '../src/lib/content/attraction.ts';
import { TICK_RATE } from '../src/lib/shared/constants.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';
import type { PlayerState } from '../src/lib/shared/player/types.ts';

/**
 * The party's noise and light, as two meters that draw something in. Everyone's lamp and
 * movement add to them (or drain them) each tick, and every noise (`heard`) adds its radius. A
 * meter that reaches its threshold (higher for a bigger party) is a draw: the director brings a
 * creature to whoever added the most to it, and the meter starts again (`reset`). See
 * docs/dev/creatures.md#attraction.
 */

export type Meter = 'noise' | 'light';

/** An explorer as the meters see them. */
export interface Contributor {
	id: string;
	state: PlayerState;
	/** How they're moving (`movementNoise` in server/creatures.ts). */
	movement: Movement;
}

/** A meter reached its threshold: bring something to this player. */
export interface Draw {
	meter: Meter;
	player: string;
}

const TICK_DT = 1 / TICK_RATE;
const METERS: Meter[] = ['noise', 'light'];
/** Seconds a meter that brought something shows full on the admin bars. */
const FLASH = 1.5;

export class Attraction {
	readonly levels: Record<Meter, number> = { noise: 0, light: 0 };
	/** How much each explorer has added to each meter since it last started again. */
	private by: Record<Meter, Map<string, number>> = { noise: new Map(), light: new Map() };
	/** Noises since the last tick, to add with the movement. */
	private noises: { amount: number; position: Vec3; source: string | null }[] = [];
	/** Seconds before a full meter tries again (there was nowhere for one to appear). */
	private wait: Record<Meter, number> = { noise: 0, light: 0 };
	/** Meters that filled: they hold there (nothing drains them) until a draw is answered. */
	private full = new Set<Meter>();
	/** Seconds a meter that just brought something shows full (the admin bars), though it's empty. */
	private flash: Record<Meter, number> = { noise: 0, light: 0 };
	/** Explorers down here at the last tick (the thresholds scale with it). */
	party = 1;

	constructor(private def: AttractionDef = ATTRACTION) {}

	/** A noise (its radius, m) at a position: from a player, or from where nobody is (a crate). */
	heard(radius: number, position: Vec3, source: string | null): void {
		this.noises.push({ amount: radius * this.def.noise.perNoise, position: [...position], source });
	}

	/** The threshold a meter fills to, for the party down here. */
	threshold(meter: Meter): number {
		return this.def[meter].threshold * byParty(this.def.party, this.party);
	}

	/** How full a meter is, 0..1 (the admin bars). */
	fraction(meter: Meter): number {
		if (this.full.has(meter) || this.flash[meter] > 0) return 1;
		return Math.min(1, this.levels[meter] / this.threshold(meter));
	}

	/**
	 * One tick: add what everyone did, scaled by `boldness` (the omens: what fills, fills faster).
	 * Returns the meters that reached their threshold, each with who added the most.
	 */
	step(explorers: Contributor[], boldness = 1): Draw[] {
		const noises = this.noises;
		this.noises = [];
		if (!explorers.length) return [];
		this.party = explorers.length;
		const { light, noise } = this.def;
		for (const e of explorers) {
			const s = e.state;
			const lamp = s.battery <= 0 ? 0 : s.headlamp;
			const glow = lamp === 2 ? light.bright : lamp === 1 ? light.low : light.off;
			this.add('light', e.id, glow * TICK_DT, boldness);
			this.add('noise', e.id, noise.move[e.movement] * TICK_DT, boldness);
		}
		for (const n of noises) {
			// A noise nobody made (a crate, a door) is put down to whoever's nearest it.
			const who = n.source ?? nearest(explorers, n.position);
			if (who) this.add('noise', who, n.amount, boldness);
		}
		const draws: Draw[] = [];
		for (const meter of METERS) {
			this.wait[meter] = Math.max(0, this.wait[meter] - TICK_DT);
			this.flash[meter] = Math.max(0, this.flash[meter] - TICK_DT);
			if (this.levels[meter] >= this.threshold(meter)) this.full.add(meter);
			if (this.wait[meter] > 0 || !this.full.has(meter)) continue;
			const player = this.top(meter, explorers);
			if (player) draws.push({ meter, player });
		}
		return draws;
	}

	/** A draw was answered: the meter starts again from nothing. */
	reset(meter: Meter): void {
		this.levels[meter] = 0;
		this.by[meter].clear();
		this.wait[meter] = 0;
		this.full.delete(meter);
	}

	/**
	 * A draw was answered (something came): the meter starts again, but the admin bars show it
	 * full for a moment so it's clear what brought it.
	 */
	answered(meter: Meter): void {
		this.reset(meter);
		this.flash[meter] = FLASH;
	}

	/** A draw couldn't be answered just now: stay full and try again a little later. */
	hold(meter: Meter): void {
		this.wait[meter] = this.def.retry;
	}

	/** Admin: fill a meter to its threshold. */
	fill(meter: Meter): void {
		this.levels[meter] = this.threshold(meter);
		this.full.add(meter);
		this.wait[meter] = 0;
	}

	private add(meter: Meter, id: string, amount: number, boldness: number): void {
		// Only what fills it is made bolder; draining isn't.
		const change = amount > 0 ? amount * boldness : amount;
		if (change > 0) this.by[meter].set(id, (this.by[meter].get(id) ?? 0) + change);
		// Full, it holds until answered.
		if (this.full.has(meter)) return;
		this.levels[meter] = Math.max(0, Math.min(this.threshold(meter), this.levels[meter] + change));
	}

	/** Who added the most to a meter, among those still down here (or the first of them). */
	private top(meter: Meter, explorers: Contributor[]): string | null {
		let best: string | null = explorers[0]?.id ?? null;
		let most = -Infinity;
		for (const e of explorers) {
			const amount = this.by[meter].get(e.id) ?? 0;
			if (amount > most) {
				most = amount;
				best = e.id;
			}
		}
		return best;
	}
}

function nearest(explorers: Contributor[], position: Vec3): string | null {
	let best: string | null = null;
	let bestD = Infinity;
	for (const e of explorers) {
		const p = e.state.position;
		const d = Math.hypot(p[0] - position[0], p[1] - position[1], p[2] - position[2]);
		if (d < bestD) {
			bestD = d;
			best = e.id;
		}
	}
	return best;
}
