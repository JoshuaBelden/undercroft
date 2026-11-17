import type { SurveyMap } from '../src/lib/shared/map/survey.ts';

/**
 * What each player has drawn in their map this expedition: the cells (by `cellKey`) they sketched
 * or were shown. A map is its owner's alone; showing it to a teammate copies it across, both
 * ways. See docs/dev/map.md.
 */
export class Surveys {
	private drawn = new Map<string, Set<string>>();

	constructor(private map: SurveyMap) {}

	/** Add cells to a player's map. Returns how many were new. */
	draw(player: string, cells: Iterable<string>): number {
		const mine = this.of(player);
		const before = mine.size;
		for (const cell of cells) if (this.map.cells.has(cell)) mine.add(cell);
		return mine.size - before;
	}

	/** Two players show each other their maps: each now has both. Returns whether either grew. */
	share(a: string, b: string): boolean {
		const grewA = this.draw(a, this.of(b));
		const grewB = this.draw(b, this.of(a));
		return grewA + grewB > 0;
	}

	/** Everything the map can show, in one player's map (admin). */
	revealAll(player: string): void {
		this.draw(player, this.map.cells.keys());
	}

	clear(player: string): void {
		this.drawn.delete(player);
	}

	/** A player's map as sent to their client: [x, z, level] per cell. */
	snapshot(player: string): [number, number, number][] {
		return [...this.of(player)].map((key) => this.map.cells.get(key)!.cell);
	}

	private of(player: string): Set<string> {
		let mine = this.drawn.get(player);
		if (!mine) {
			mine = new Set();
			this.drawn.set(player, mine);
		}
		return mine;
	}
}
