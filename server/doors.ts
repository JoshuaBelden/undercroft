import { closeDoor, openDoor, type CollisionWorld } from '../src/lib/shared/map/collision.ts';
import { lookedAtDoor } from '../src/lib/shared/map/doors.ts';
import type { NavGrid } from '../src/lib/shared/map/nav.ts';
import type { DoorPlacement, Vec3 } from '../src/lib/shared/map/types.ts';

/**
 * The doors between levels in the current map. Each starts shut: solid in the collision world and
 * closing its doorway in the nav grid, so neither players nor creatures get through. Opening one
 * is for everyone, and for good, but for the final room's: the rite slams that shut and seals it
 * until what it summoned is banished. A barred door (the stair to the Gloaming's lowest level,
 * docs/dev/quests.md#the-barred-stair) won't open by hand at all: only a charge blows it open.
 * See docs/dev/map-generation.md#doors.
 */
export class Doors {
	/** Shut and not to be opened (the final room's, during the fight). */
	private sealed = new Set<string>();
	/** Barred from the far side: holding interact only rattles it; a charge blows it open. */
	private barred = new Set<string>();

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

	isBarred(id: string): boolean {
		return this.barred.has(id);
	}

	/** Bar a shut door (it stays as it is if already open). */
	bar(id: string): void {
		if (!this.isOpen(id) && this.placements.some((door) => door.id === id)) this.barred.add(id);
	}

	/** Take the bar off: it opens by hand again. */
	unbar(id: string): void {
		this.barred.delete(id);
	}

	/** A charge went off: a barred door blown open, for good. False if it wasn't barred. */
	blowOpen(id: string): boolean {
		if (!this.barred.delete(id)) return false;
		return this.open(id);
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

	/** Open a door. False if there is no such door, it was open already, or it is sealed or barred. */
	open(id: string): boolean {
		if (
			this.isOpen(id) ||
			this.isSealed(id) ||
			this.isBarred(id) ||
			!this.placements.some((door) => door.id === id)
		) {
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

	/** Admin: open every door (sealed and barred ones too). */
	openAll(): void {
		this.sealed.clear();
		this.barred.clear();
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

	/** Ids of the barred doors, for the tick. */
	barredSnapshot(): string[] {
		return [...this.barred];
	}
}
