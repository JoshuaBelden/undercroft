import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { UNDER_PARISH } from '../../content/map/under-parish.ts';
import { addItem, emptyInventory } from '../items/inventory.ts';
import { doorSeconds } from '../items/lootables.ts';
import { buildCollisionWorld } from './collision.ts';
import { doorSize } from './doors.ts';
import { fixedLayout, MAP_PIECES, sealedDoors } from './fixed.ts';
import { buildNav } from './nav.ts';
import { spawnPoint } from './points.ts';

/** The way in (#150), as built from art/export/rooms into rooms.generated.ts. */
describe('the fixed map', () => {
	const layout = fixedLayout(1);

	it('lays out every room the map names, one placement each', () => {
		expect(layout.placements.map((p) => p.piece)).toEqual(UNDER_PARISH.rooms.map((r) => r.room));
	});

	it('puts a lootable at every marker, and the key in the crate that holds it', () => {
		const sewer = MAP_PIECES.sewer;
		const markers = (sewer.crates.length ?? 0) + (sewer.lootables?.length ?? 0);
		expect(layout.crates).toHaveLength(markers);
		expect(layout.crates.filter((c) => c.holds === 'key')).toHaveLength(1);
	});

	it('locks the Storeroom door with the key, a plank door fitted to its doorway, and seals the seam', () => {
		const keyed = layout.doors.filter((d) => d.key === 'key');
		expect(keyed).toHaveLength(1);
		// A plank door of its own, fitted to its doorway.
		expect(keyed[0].type).toBe('simple-wood-door');
		expect(doorSize(keyed[0])[0]).toBeCloseTo(1.2);
		const sealed = sealedDoors(layout);
		expect(sealed).toHaveLength(1);
		expect(layout.doors.find((d) => d.id === sealed[0])?.marker).toBe('door-1');
	});

	it('opens the locked door only for someone carrying its key', () => {
		const door = layout.doors.find((d) => d.key)!;
		const inv = emptyInventory();
		expect(doorSeconds(door, inv)).toBeNull();
		addItem(inv, { item: 'key', count: 1 });
		expect(doorSeconds(door, inv)).toBeGreaterThan(0);
	});

	it('ships each lit room with the UV set its lightmap goes on', () => {
		for (const room of Object.values(MAP_PIECES)) {
			if (!room.lightmap) continue;
			const file = path.join(process.cwd(), 'static', room.url);
			const gltf = JSON.parse(readFileSync(file, 'utf8')) as {
				meshes: { primitives: { attributes: Record<string, number> }[] }[];
			};
			const uv1 = gltf.meshes.some((mesh) =>
				mesh.primitives.some((primitive) => 'TEXCOORD_1' in primitive.attributes)
			);
			expect(uv1, `${room.name} has a lightmap but no TEXCOORD_1`).toBe(true);
		}
	});

	it('has the ladder out as a climbable rope with an exit, drawn by the room', () => {
		const world = buildCollisionWorld(layout, MAP_PIECES);
		const ladder = world.ropes.find((r) => r.exitY !== undefined);
		expect(ladder?.ladder).toBe(true);
		expect(ladder!.exitY! - ladder!.bottom).toBeCloseTo(6);
	});

	it('starts players on the walkway, facing their spawn marker', () => {
		const spawn = spawnPoint(layout, MAP_PIECES);
		expect(spawn.position[1]).toBeCloseTo(0.05);
		expect(spawn.yaw).toBeCloseTo(MAP_PIECES.sewer.spawnYaws![0]);
	});

	it('has a nav grid from the spawn to the Storeroom and down the stair to its last door', () => {
		const world = buildCollisionWorld(layout, MAP_PIECES);
		const nav = buildNav(world, layout, MAP_PIECES, spawnPoint(layout, MAP_PIECES).position);
		const lowest = Math.min(...nav.points.map((p) => p.position[1]));
		// The walkway is at 0, the channel 0.35 below it, the stair's foot 4 m down.
		expect(nav.points.length).toBeGreaterThan(500);
		expect(lowest).toBeLessThan(-3.9);
		// Not out on top of anything: no point higher than the walkway's lip.
		expect(Math.max(...nav.points.map((p) => p.position[1]))).toBeLessThan(0.5);
	});
});
