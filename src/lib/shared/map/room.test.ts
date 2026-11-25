import { describe, expect, it } from 'vitest';
import { buildCollisionWorld } from './collision.ts';
import { baseName, markerKind, readRoom, roomPiece, yawOf, type RoomNode } from './room.ts';
import type { Quat } from './types.ts';

/** A turn of `angle` radians about +Y. */
function aboutY(angle: number): Quat {
	return [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
}

function node(name: string, over: Partial<RoomNode> = {}): RoomNode {
	return {
		name,
		position: [0, 0, 0],
		rotation: [0, 0, 0, 1],
		scale: [1, 1, 1],
		extras: {},
		mesh: false,
		...over
	};
}

describe('room markers', () => {
	it('drops the suffix Blender gives repeated names', () => {
		expect(baseName('col-floor.001')).toBe('col-floor');
		expect(baseName('crate-100')).toBe('crate-100');
	});

	it('knows a marker by its prefix', () => {
		expect(markerKind('lootable-niche-2')).toBe('lootable');
		expect(markerKind('spawn-0')).toBe('spawn');
		expect(markerKind('wall-north')).toBeNull();
	});

	it('reads which way a marker faces', () => {
		expect(yawOf([0, 0, 0, 1])).toBeCloseTo(0);
		// A quarter turn counter-clockwise (seen from above) faces west, -X.
		expect(yawOf(aboutY(Math.PI / 2))).toBeCloseTo(Math.PI / 2);
		expect(Math.abs(yawOf(aboutY(Math.PI)))).toBeCloseTo(Math.PI);
	});

	it('sorts nodes into markers, colliders and volumes', () => {
		const room = readRoom('storeroom', [
			node('storeroom'),
			node('spawn-0', { position: [1, 0, 2], rotation: aboutY(Math.PI / 2) }),
			node('rope-0', { position: [0, 4, 0], extras: { length: 3.5, exit: '2' } }),
			node('col-floor.001', { position: [0, -0.1, 0], scale: [10, 0.2, 8], mesh: true }),
			node('vol-water-0', { scale: [2, 1, 2], mesh: true }),
			node('shelf', { mesh: true })
		]);
		expect(room.markers.map((m) => m.label)).toEqual(['spawn-0', 'rope-0']);
		expect(room.markers[0]).toMatchObject({ kind: 'spawn', position: [1, 0, 2] });
		expect(room.markers[0].yaw).toBeCloseTo(Math.PI / 2);
		expect(room.markers[1].extras).toEqual({ length: 3.5, exit: 2 });
		expect(room.colliders).toEqual([
			{ center: [0, -0.1, 0], halfExtents: [5, 0.1, 4], rotation: [0, 0, 0, 1] }
		]);
		expect(room.volumes).toMatchObject([{ kind: 'water', halfExtents: [1, 0.5, 1] }]);
		expect(room.warnings).toEqual([]);
	});

	it('warns about what the game would not understand', () => {
		const room = readRoom('vault', [
			node('lamp-target'),
			node('rope-1'),
			node('lootable-chest-0'),
			node('pillar', { mesh: true })
		]);
		expect(room.warnings).toHaveLength(3);
		expect(room.warnings[0]).toContain('lamp-target');
		expect(room.warnings[1]).toContain('length');
		expect(room.warnings[2]).toContain('names no lootable');
	});
});

describe('a room as a piece', () => {
	it('can be walked: its colliders, ropes and spawns are in the collision world', () => {
		const room = readRoom('cellar', [
			node('spawn-0', { position: [0, 0, 0] }),
			node('extract-0', { position: [3, 0, 0] }),
			node('rope-0', { position: [0, 5, -2], extras: { length: 5, exit: 4 } }),
			node('lootable-niche-0'),
			node('col-floor', { position: [0, -0.1, 0], scale: [10, 0.2, 10], mesh: true })
		]);
		const piece = roomPiece(room);
		expect(piece.spawns).toEqual([[0, 0, 0]]);
		expect(piece.lootables).toMatchObject([{ type: 'niche' }]);
		expect(piece.ropes).toEqual([{ top: [0, 5, -2], length: 5, exit: 4 }]);

		const world = buildCollisionWorld(
			{
				seed: 0,
				affliction: null,
				placements: [{ piece: 'cellar', position: [0, 0, 0], rotation: 0, tier: 0 }],
				crates: [],
				doors: []
			},
			{ cellar: piece }
		);
		expect(world.boxes).toHaveLength(1);
		expect(world.extracts).toEqual([[3, 0, 0]]);
		expect(world.ropes).toHaveLength(1);
	});
});
