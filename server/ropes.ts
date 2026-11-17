import { randomUUID } from 'node:crypto';
import { ROPE } from '../src/lib/content/rope.ts';
import { floorHeightAt, type CollisionWorld } from '../src/lib/shared/map/collision.ts';
import { LEVEL_HEIGHT } from '../src/lib/shared/map/grid.ts';
import type { LaidRopeSnapshot, TiedRopeSnapshot } from '../src/lib/shared/items/types.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';

/**
 * The ropes of one expedition: laid along the floor as players walk (anyone can gather one up),
 * and tied at anchors down drops (untied only at the anchor). They last the whole run. The
 * session decides who may do what (server/session.ts `stepRopes`); this keeps the lists.
 * See docs/dev/rope.md.
 */
export class Ropes {
	private laid: LaidRopeSnapshot[] = [];
	private tied: TiedRopeSnapshot[] = [];
	/** Rope id each player is paying out, by player id. */
	private laying = new Map<string, string>();
	/** Points added since the last `takeGrowth`, by rope id. */
	private grown = new Map<string, Vec3[]>();

	laidList(): readonly LaidRopeSnapshot[] {
		return this.laid;
	}

	tiedList(): readonly TiedRopeSnapshot[] {
		return this.tied;
	}

	/** Everything, as sent to clients. */
	snapshot(): { laid: LaidRopeSnapshot[]; tied: TiedRopeSnapshot[] } {
		return {
			laid: this.laid.map((r) => ({ ...r, points: r.points.map((p): Vec3 => [...p]) })),
			tied: this.tied.map((t) => ({ ...t }))
		};
	}

	/**
	 * Start paying out a rope at `feet`, from the rope `item` (given back when it is gathered
	 * up). Past ROPE.max ropes, the oldest is gone.
	 */
	start(player: string, name: string, item: string, feet: Vec3): LaidRopeSnapshot {
		this.stop(player);
		const rope: LaidRopeSnapshot = {
			id: randomUUID(),
			by: player,
			name,
			points: [[...feet]],
			laying: true,
			item
		};
		this.laid.push(rope);
		this.laying.set(player, rope.id);
		while (this.laid.length > ROPE.max) {
			const old = this.laid.shift();
			if (old) this.forget(old.id);
		}
		return rope;
	}

	/** The rope this player is paying out, if any. */
	layingBy(player: string): LaidRopeSnapshot | null {
		const id = this.laying.get(player);
		return (id && this.laid.find((r) => r.id === id)) || null;
	}

	/**
	 * Stop paying out: the free end stays where it lies. Returns the rope, or null if none was
	 * being laid or it never got past its start (then it is gone, as if never begun).
	 */
	stop(player: string): LaidRopeSnapshot | null {
		const rope = this.layingBy(player);
		this.laying.delete(player);
		if (!rope) return null;
		rope.laying = false;
		if (rope.points.length >= 2) return rope;
		this.removeLaid(rope.id);
		return null;
	}

	/**
	 * Lay rope from its last point toward `feet`, a point every ROPE.spacing metres (each on the
	 * floor there), no more than `metres` of it. Returns the metres laid.
	 */
	extend(world: CollisionWorld, rope: LaidRopeSnapshot, feet: Vec3, metres: number): number {
		let used = 0;
		for (;;) {
			const last = rope.points[rope.points.length - 1];
			const dx = feet[0] - last[0];
			const dz = feet[2] - last[2];
			const d = Math.hypot(dx, dz);
			if (d < ROPE.spacing || metres - used < ROPE.spacing) break;
			const x = last[0] + (dx / d) * ROPE.spacing;
			const z = last[2] + (dz / d) * ROPE.spacing;
			const y = floorHeightAt(world, x, z, feet[1] + 0.5, feet[1] - LEVEL_HEIGHT) ?? feet[1];
			const point: Vec3 = [x, y, z];
			rope.points.push(point);
			const grown = this.grown.get(rope.id);
			if (grown) grown.push(point);
			else this.grown.set(rope.id, [point]);
			used += ROPE.spacing;
		}
		return used;
	}

	/** Points laid since last asked, for the clients: a rope grows a little each tick. */
	takeGrowth(): { id: string; points: Vec3[] }[] {
		const out = [...this.grown].map(([id, points]) => ({ id, points }));
		this.grown.clear();
		return out;
	}

	removeLaid(id: string): LaidRopeSnapshot | null {
		const index = this.laid.findIndex((r) => r.id === id);
		if (index < 0) return null;
		this.forget(id);
		return this.laid.splice(index, 1)[0];
	}

	private forget(id: string): void {
		this.grown.delete(id);
		for (const [player, rope] of this.laying) if (rope === id) this.laying.delete(player);
	}

	tiedAt(anchor: string): TiedRopeSnapshot | null {
		return this.tied.find((t) => t.anchor === anchor) ?? null;
	}

	tie(rope: TiedRopeSnapshot): void {
		this.untie(rope.anchor);
		this.tied.push({ ...rope });
	}

	untie(anchor: string): TiedRopeSnapshot | null {
		const index = this.tied.findIndex((t) => t.anchor === anchor);
		return index < 0 ? null : this.tied.splice(index, 1)[0];
	}

	clear(): void {
		this.laid = [];
		this.tied = [];
		this.laying.clear();
		this.grown.clear();
	}
}
