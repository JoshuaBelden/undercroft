import { describe, expect, it } from 'vitest';
import {
	CELL,
	EDGE_DIR,
	OPPOSITE,
	cellKey,
	occupiedCells,
	rotateEdge,
	rotateXZ,
	toWorld,
	worldCell,
	worldSocket
} from './grid.ts';
import type { Edge, PieceDef } from './types.ts';

const EDGES: Edge[] = ['n', 'e', 's', 'w'];

describe('grid', () => {
	it('OPPOSITE is an involution and points the other way', () => {
		for (const edge of EDGES) {
			expect(OPPOSITE[OPPOSITE[edge]]).toBe(edge);
			const [x, z] = EDGE_DIR[edge];
			expect(EDGE_DIR[OPPOSITE[edge]]).toEqual([0 - x, 0 - z]);
		}
	});

	it('rotateEdge agrees with rotateXZ applied to the edge direction', () => {
		for (const edge of EDGES) {
			for (let r = 0; r < 4; r++) {
				const [x, z] = rotateXZ(EDGE_DIR[edge], r);
				expect(EDGE_DIR[rotateEdge(edge, r)]).toEqual([x + 0, z + 0]);
			}
		}
	});

	it('four quarter turns are the identity', () => {
		for (const edge of EDGES) expect(rotateEdge(edge, 4)).toBe(edge);
		expect(rotateXZ([2, 5], 4)).toEqual([2, 5]);
		expect(rotateXZ([2, 5], -1)).toEqual(rotateXZ([2, 5], 3));
	});

	it('a +90° turn takes east to north (counter-clockwise from above)', () => {
		expect(rotateEdge('e', 1)).toBe('n');
		expect(rotateXZ([1, 0], 1)).toEqual([0, -1]);
	});

	it('worldCell rounds to the nearest cell centre', () => {
		expect(worldCell(0, 0)).toEqual([0, 0]);
		expect(worldCell(CELL * 3 + 1.9, -CELL * 2 - 1.9)).toEqual([3, -2]);
		expect(cellKey(3, -2, 1)).toBe('3,-2,1');
	});

	it('toWorld rotates then translates', () => {
		expect(toWorld({ piece: 'x', position: [10, 4, 20], rotation: 1 }, [1, 2, 0])).toEqual([
			10, 6, 19
		]);
	});

	describe('a 2 x 1 two-level piece', () => {
		const piece = {
			footprint: [2, 1],
			levels: 2,
			sockets: [{ type: 'hall', cell: [1, 0], level: 1, edge: 'e' }]
		} as unknown as PieceDef;

		it('occupies every footprint cell on every level', () => {
			const cells = occupiedCells(piece, { piece: 'x', position: [0, 0, 0], rotation: 0 });
			expect(cells).toHaveLength(4);
			expect(new Set(cells.map((c) => c.join(','))).size).toBe(4);
		});

		it('turned a quarter, lies along z instead of x', () => {
			const cells = occupiedCells(piece, { piece: 'x', position: [0, 0, 0], rotation: 1 });
			expect(new Set(cells.map(([x]) => x)).size).toBe(1);
			expect(new Set(cells.map(([, z]) => z)).size).toBe(2);
		});

		it('resolves its socket into world terms', () => {
			const socket = worldSocket(
				piece,
				{ piece: 'x', position: [0, 4, 0], rotation: 1 },
				piece.sockets[0]
			);
			expect(socket.edge).toBe('n');
			expect(socket.level).toBe(2);
		});
	});
});
