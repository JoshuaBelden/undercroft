import { closeDoor, openDoor, type CollisionWorld } from '../src/lib/shared/map/collision.ts';
import { lookedAtDoor } from '../src/lib/shared/map/doors.ts';
import type { NavGrid } from '../src/lib/shared/map/nav.ts';
import type { DoorPlacement, Vec3 } from '../src/lib/shared/map/types.ts';

/**
 * The doors between levels in the current map. Each starts shut: solid in the collision world and
 * closing its doorway in the nav grid, so neither players nor creatures get through. Opening one
 * is for everyone, and for good, but for the final room's: the rite slams that shut and seals it
 * until what it summoned is banished. See docs/dev/map-generation.md#doors.
 */
export class Doors {
	/** Shut and not to be opened (the final room's, during the fight). */
	private sealed = new Set<string>();

	constructor(
		private world: CollisionWorld,
		private nav: NavGrid,
		readonly placements: DoorPlacement[]
	) {}

	isOpen(id: string): boolean {
		return this.world.openDoors.has(id);
	}

	isSealed(id: string): boolean {
		return this.sealed.has(id);
	}

	/** The shut door in reach along this aim, if any (a sealed one can't be opened: it isn't). */
	lookedAt(origin: Vec3, direction: Vec3): DoorPlacement | null {
		return lookedAtDoor(
			this.world,
			origin,
			direction,
			this.placements,
			(id) => this.isOpen(id) || this.isSealed(id)
		);
	}

	/** Open a door. False if there is no such door, it was open already, or it is sealed. */
	open(id: string): boolean {
		if (this.isOpen(id) || this.isSealed(id) || !this.placements.some((door) => door.id === id)) {
			return false;
		}
		openDoor(this.world, id);
		this.nav.closed.delete(id);
		return true;
	}

	/**
	 * Slam the doors of a room (piece id) shut, and seal them. Returns the ones that were open,
	 * now shut.
	 */
	seal(piece: string): DoorPlacement[] {
		const shut: DoorPlacement[] = [];
		for (const door of this.placements) {
			if (door.piece !== piece) continue;
			this.sealed.add(door.id);
			if (!this.isOpen(door.id)) continue;
			closeDoor(this.world, door.id);
			this.nav.closed.add(door.id);
			shut.push(door);
		}
		return shut;
	}

	/** Unseal every sealed door and open it. Returns the doors opened. */
	release(): DoorPlacement[] {
		const ids = [...this.sealed];
		this.sealed.clear();
		return this.placements.filter((door) => ids.includes(door.id) && this.open(door.id));
	}

	/** Admin: open every door (sealed ones too). */
	openAll(): void {
		this.sealed.clear();
		for (const door of this.placements) this.open(door.id);
	}

	/** Ids of the doors that are open, for the tick. */
	snapshot(): string[] {
		return this.placements.filter((door) => this.isOpen(door.id)).map((door) => door.id);
	}

	/** Ids of the sealed doors, for the tick. */
	sealedSnapshot(): string[] {
		return [...this.sealed];
	}
}
