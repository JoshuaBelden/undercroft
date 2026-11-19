/**
 * Attraction (data): how the party's noise and light draw something in. Two meters fill with
 * what everyone does; when one reaches its threshold, a creature of `kind` comes to look, a few
 * metres from whoever did the most, and that meter starts again from nothing. See
 * docs/dev/creatures.md#attraction.
 */

/** How someone is moving, for the noise it makes (server/creatures.ts, `movementNoise`). */
export type Movement =
	'still' | 'creep' | 'crouch' | 'crawl' | 'walk' | 'sprint' | 'swim' | 'climb';

export interface AttractionDef {
	/** The kind drawn in. */
	kind: string;
	/** Light meter, per second per explorer, by lamp: bright fills it, low holds it, off drains it. */
	light: { bright: number; low: number; off: number; threshold: number };
	/**
	 * Noise meter, per second per explorer by how they move (keeping still or sneaking drains it),
	 * plus `perNoise` × each noise's radius (m) as it happens: a gunshot about 35, a crate 6.
	 */
	noise: { move: Record<Movement, number>; perNoise: number; threshold: number };
	/**
	 * The thresholds × this, by how many explorers are down here (the first for one, the last for
	 * any more). A bigger party fills them faster, so they're higher, but not by as many times.
	 */
	party: number[];
	/** At most this many of `kind` alive at once, by party size; at the cap, one goes to look. */
	cap: number[];
	/** How far (m, along the grid) from the one who drew it a new one appears. */
	distance: [number, number];
	/** Seconds before trying again when there was nowhere for it to appear. */
	retry: number;
}

export const ATTRACTION: AttractionDef = {
	kind: 'witch',
	// A minute of bright lamp alone draws one; off, it drains twice as fast.
	light: { bright: 1, low: 0, off: -2, threshold: 60 },
	noise: {
		// Walking alone draws one in a little under two minutes; sprinting in 25 s.
		move: { still: -2, creep: -2, crouch: 0, crawl: 0, walk: 1, sprint: 4, swim: 2, climb: 1 },
		perNoise: 1,
		// Three gunshots, but not one crate.
		threshold: 100
	},
	party: [1, 1.5, 1.9, 2.2],
	// One witch at a time alone is plenty.
	cap: [1, 2, 3, 4],
	distance: [5, 10],
	retry: 5
};

/** A party-size table's entry: the first for one explorer, the last for any more. */
export function byParty(table: number[], party: number): number {
	return table[Math.max(0, Math.min(table.length, party) - 1)] ?? 0;
}
