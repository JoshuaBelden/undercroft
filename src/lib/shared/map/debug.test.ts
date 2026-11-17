import { describe, expect, it } from 'vitest';
import { MAP_KIT } from '../../content/map/kit.ts';
import { realMap } from '../testing/maps.ts';
import { mapDebugGrid } from './debug.ts';
import { occupiedCells } from './grid.ts';
import { PIECES } from './pieces.generated.ts';
import type { MapLayout } from './types.ts';

const hallLayout = (placements: MapLayout['placements']): MapLayout => ({
	seed: 0,
	affliction: null,
	placements,
	crates: [],
	doors: []
});

describe('mapDebugGrid', () => {
	it('lists every occupied cell once, caps excluded', () => {
		const layout = realMap(1234);
		const grid = mapDebugGrid(layout, PIECES, MAP_KIT);
		const expected = new Set(
			layout.placements
				.filter((p) => MAP_KIT[p.piece]?.role !== 'cap')
				.flatMap((p) => occupiedCells(PIECES[p.piece], p).map((cell) => cell.join(',')))
		);
		expect(grid.cells.map((cell) => cell.join(','))).toHaveLength(expected.size);
		expect(new Set(grid.cells.map((cell) => cell.join(',')))).toEqual(expected);
	});

	it('marks one blocked entrance per cap and per dead end, the rest connected', () => {
		for (const seed of [1, 42, 9001]) {
			const layout = realMap(seed);
			const grid = mapDebugGrid(layout, PIECES, MAP_KIT);
			const count = (role: string) =>
				layout.placements.filter((p) => MAP_KIT[p.piece]?.role === role).length;
			const blocked = grid.entrances.filter((e) => e.state === 'blocked');
			expect(blocked).toHaveLength(count('cap') + count('end'));
			expect(grid.entrances.some((e) => e.state === 'connected')).toBe(true);
		}
	});

	it('counts rooms, tunnels, dead ends and caps, every placement once', () => {
		const layout = realMap(77);
		const { counts, roomCells } = mapDebugGrid(layout, PIECES, MAP_KIT);
		const of = (test: (name: string) => boolean) =>
			layout.placements.filter((p) => test(p.piece)).length;
		const role = (r: string) => (name: string) => MAP_KIT[name]?.role === r;
		expect(counts.rooms.start).toBe(1);
		expect(counts.rooms.major).toBe(of(role('major')));
		expect(counts.rooms.extraction).toBe(of(role('extraction')));
		expect(counts.rooms.minor).toBe(of((name) => !!MAP_KIT[name]?.room));
		expect(counts.rooms.total).toBe(
			counts.rooms.start + counts.rooms.major + counts.rooms.extraction + counts.rooms.minor
		);
		expect(counts.tiers).toHaveLength(3);
		expect(counts.tiers.reduce((sum, t) => sum + t.rooms, 0)).toBe(counts.rooms.total);
		expect(counts.rooms.total + counts.tunnels + counts.deadEnds + counts.caps).toBe(
			layout.placements.length
		);
		expect(counts.pieces.reduce((sum, p) => sum + p.count, 0)).toBe(
			counts.rooms.total + counts.tunnels
		);
		expect(counts.entrances.blocked).toBe(counts.caps + counts.deadEnds);
		// Every room cell is an occupied cell; a map always has more than its rooms.
		const cells = new Set(mapDebugGrid(layout, PIECES, MAP_KIT).cells.map((c) => c.join(',')));
		expect(roomCells.every((c) => cells.has(c.join(',')))).toBe(true);
		expect(roomCells.length).toBeLessThan(counts.cells);
		expect(counts.levels).toBeGreaterThan(1);
	});

	it('connects two facing halls and blocks an opening left with nothing across', () => {
		const straight = Object.values(PIECES).find(
			(piece) =>
				MAP_KIT[piece.name]?.role === 'connector' &&
				piece.footprint[0] === 1 &&
				piece.footprint[1] === 1 &&
				piece.levels === 1 &&
				piece.sockets.length === 2 &&
				piece.sockets.some((s) => s.edge === 'n') &&
				piece.sockets.some((s) => s.edge === 's')
		);
		if (!straight) throw new Error('No north-south straight hall in the kit');
		const grid = mapDebugGrid(
			hallLayout([
				{ piece: straight.name, position: [0, 0, 0], rotation: 0, tier: 0 },
				{ piece: straight.name, position: [0, 0, 4], rotation: 0, tier: 0 }
			]),
			PIECES,
			MAP_KIT
		);
		expect(grid.cells).toHaveLength(2);
		expect(grid.entrances.map((e) => e.state).sort()).toEqual(['blocked', 'blocked', 'connected']);
	});

	it('blocks an opening sealed by a cap', () => {
		const straight = Object.values(PIECES).find(
			(piece) =>
				MAP_KIT[piece.name]?.role === 'connector' &&
				piece.footprint.join() === '1,1' &&
				piece.levels === 1 &&
				piece.sockets.length === 2 &&
				piece.sockets.some((s) => s.edge === 'n')
		);
		if (!straight) throw new Error('No straight hall in the kit');
		// The cap on the north edge of cell [0, 0], facing north.
		const grid = mapDebugGrid(
			hallLayout([
				{ piece: straight.name, position: [0, 0, 0], rotation: 0, tier: 0 },
				{ piece: 'cap-hall', position: [0, 0, -2], rotation: 0, tier: 0 }
			]),
			PIECES,
			MAP_KIT
		);
		const north = grid.entrances.find((e) => e.edge === 'n');
		expect(north?.state).toBe('blocked');
		expect(grid.entrances).toHaveLength(2);
	});
});
