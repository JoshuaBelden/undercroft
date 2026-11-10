/**
 * Deterministic seeded PRNG (mulberry32). Server and clients produce identical sequences
 * from the same seed, which is what keeps generated maps in sync.
 */
export class Rng {
	private state: number;

	constructor(seed: number) {
		this.state = seed >>> 0;
	}

	/** Float in [0, 1). */
	next(): number {
		this.state = (this.state + 0x6d2b79f5) >>> 0;
		let t = this.state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	/** Integer in [min, max] inclusive. */
	int(min: number, max: number): number {
		return min + Math.floor(this.next() * (max - min + 1));
	}

	pick<T>(items: readonly T[]): T {
		return items[Math.floor(this.next() * items.length)];
	}

	/** Pick by relative weight. */
	weighted<T>(items: readonly T[], weight: (item: T) => number): T {
		const total = items.reduce((sum, item) => sum + weight(item), 0);
		let roll = this.next() * total;
		for (const item of items) {
			roll -= weight(item);
			if (roll < 0) return item;
		}
		return items[items.length - 1];
	}

	/** New shuffled copy. */
	shuffle<T>(items: readonly T[]): T[] {
		const out = [...items];
		for (let i = out.length - 1; i > 0; i--) {
			const j = Math.floor(this.next() * (i + 1));
			[out[i], out[j]] = [out[j], out[i]];
		}
		return out;
	}
}

/** Random 32-bit seed for a new expedition. */
export function randomSeed(): number {
	return Math.floor(Math.random() * 4294967296) >>> 0;
}
