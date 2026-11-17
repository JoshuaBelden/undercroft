import { openDoor, type CollisionWorld } from '../src/lib/shared/map/collision.ts';
import { lookedAtDoor } from '../src/lib/shared/map/doors.ts';
import type { NavGrid } from '../src/lib/shared/map/nav.ts';
import type { DoorPlacement, Vec3 } from '../src/lib/shared/map/types.ts';

/**
 * The doors between levels in the current map. Each starts shut: solid in the collision world and
 * closing its doorway in the nav grid, so neither players nor creatures get through. Opening one
 * is for good, for everyone. See docs/dev/map-generation.md#doors.
 */
export class Doors {
	constructor(
		private world: CollisionWorld,
		private nav: NavGrid,
		readonly placements: DoorPlacement[]
	) {}

	isOpen(id: string): boolean {
		return this.world.openDoors.has(id);
	}

	/** The shut door in reach along this aim, if any. */
	lookedAt(origin: Vec3, direction: Vec3): DoorPlacement | null {
		return lookedAtDoor(this.world, origin, direction, this.placements, (id) => this.isOpen(id));
	}

	/** Open a door. False if there is no such door or it was open already. */
	open(id: string): boolean {
		if (this.isOpen(id) || !this.placements.some((door) => door.id === id)) return false;
		openDoor(this.world, id);
		this.nav.closed.delete(id);
		return true;
	}

	/** Admin: open every door. */
	openAll(): void {
		for (const door of this.placements) this.open(door.id);
	}

	/** Ids of the doors that are open, for the tick. */
	snapshot(): string[] {
		return this.placements.filter((door) => this.isOpen(door.id)).map((door) => door.id);
	}
}
