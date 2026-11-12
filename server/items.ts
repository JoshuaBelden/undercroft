import { ITEMS } from '../src/lib/content/items.ts';
import { BRICKS_PER_CELL } from '../src/lib/content/loadout.ts';
import { LOOSE_LOOT } from '../src/lib/content/loot.ts';
import { SIM_RATE, TICK_RATE } from '../src/lib/shared/constants.ts';
import { addItem, newStack } from '../src/lib/shared/items/inventory.ts';
import { rollLoose } from '../src/lib/shared/items/loot.ts';
import { lookedAtItem } from '../src/lib/shared/items/pickup.ts';
import type { ProjectileSnapshot, WorldItemSnapshot } from '../src/lib/shared/items/types.ts';
import {
	floorHeightAt,
	rayVsCapsule,
	segmentHit,
	type CollisionWorld
} from '../src/lib/shared/map/collision.ts';
import { LEVEL_HEIGHT } from '../src/lib/shared/map/grid.ts';
import { gridDistances, nearestPoint, type NavGrid } from '../src/lib/shared/map/nav.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';
import type { ItemStack, PlayerState } from '../src/lib/shared/player/types.ts';
import { Rng } from '../src/lib/shared/rng.ts';
import type { CreatureBody } from './creatures.ts';

/**
 * Items lying in the map and items in flight. Server-side: spawning (bricks), pickups, drops,
 * dropping a dead player's things, and thrown items (gravity, hitting creatures, landing).
 * See docs/dev/items.md.
 */

interface WorldItem {
	id: string;
	stack: ItemStack;
	position: Vec3;
	yaw: number;
}

interface Projectile {
	id: string;
	stack: ItemStack;
	position: Vec3;
	velocity: Vec3;
	/** Player who threw it. */
	thrower: string;
}

/** What a projectile did this tick. */
export type ProjectileResult =
	| { kind: 'hitCreature'; creature: string; damage: number; thrower: string; position: Vec3 }
	| { kind: 'land'; item: string; position: Vec3; noise: number };

const GRAVITY = 9.8;
const SUBSTEPS = Math.round(SIM_RATE / TICK_RATE);
const DT = 1 / SIM_RATE;
/** Throws start a little in front of the eye and arc upward. */
const THROW_LIFT = 1.5;

export class WorldItems {
	private items = new Map<string, WorldItem>();
	private projectiles: Projectile[] = [];
	private nextId = 1;

	constructor(private world: CollisionWorld) {}

	/** Scatter bricks on floor points by walls, away from the start (seeded by the map seed). */
	scatter(nav: NavGrid, seed: number, start: Vec3, cells: number): void {
		const rng = new Rng(seed ^ 0xb71c);
		const spots = nav.points.filter(
			(p) =>
				p.clearance === 'stand' &&
				!p.water &&
				p.neighbours.length <= 5 &&
				Math.hypot(p.position[0] - start[0], p.position[2] - start[2]) > 6
		);
		const want = Math.round(cells * BRICKS_PER_CELL);
		const placed: Vec3[] = [];
		for (let tries = 0; tries < want * 20 && placed.length < want && spots.length; tries++) {
			const { position } = rng.pick(spots);
			if (placed.some((q) => Math.hypot(q[0] - position[0], q[2] - position[2]) < 3)) continue;
			placed.push(position);
			this.place(
				newStack('brick'),
				[position[0], position[1], position[2]],
				rng.next() * Math.PI * 2
			);
		}
	}

	/**
	 * Scatter the little loot that lies loose (seeded by the map seed): by walls, away from the
	 * start, and more of it the farther in you go (see LOOSE_LOOT). Most loot is in crates.
	 */
	scatterLoot(nav: NavGrid, seed: number, start: Vec3, cells: number): void {
		const rng = new Rng(seed ^ 0x100f);
		const distance = gridDistances(nav, [nearestPoint(nav, start)]);
		const spots = nav.points
			.map((point, index) => ({ point, distance: distance[index] }))
			.filter(
				({ point, distance: d }) =>
					d !== undefined &&
					d >= LOOSE_LOOT.minDistance &&
					point.clearance === 'stand' &&
					!point.water &&
					point.neighbours.length <= 5
			);
		const far = spots.reduce((most, spot) => Math.max(most, spot.distance), 0);
		const want = Math.round(cells * LOOSE_LOOT.perCell);
		const placed: Vec3[] = [];
		for (let tries = 0; tries < want * 60 && placed.length < want && spots.length; tries++) {
			const { point, distance: d } = rng.pick(spots);
			if (rng.next() > Math.pow(d / far, LOOSE_LOOT.depthBias)) continue;
			const [x, y, z] = point.position;
			if (placed.some((q) => Math.hypot(q[0] - x, q[2] - z) < LOOSE_LOOT.spacing)) continue;
			const stack = rollLoose(d / far, rng);
			if (!stack) continue;
			placed.push(point.position);
			this.place(stack, [x, y, z], rng.next() * Math.PI * 2);
		}
	}

	clear(): void {
		this.items.clear();
		this.projectiles = [];
	}

	snapshots(): WorldItemSnapshot[] {
		return [...this.items.values()].map((i) => ({
			id: i.id,
			item: i.stack.item,
			count: i.stack.count,
			position: i.position.map(round) as Vec3,
			yaw: round(i.yaw)
		}));
	}

	projectileSnapshots(): ProjectileSnapshot[] {
		return this.projectiles.map((p) => ({
			id: p.id,
			item: p.stack.item,
			position: p.position.map(round) as Vec3
		}));
	}

	/** Put a stack on the floor at (or below) a point. */
	place(stack: ItemStack, position: Vec3, yaw = 0): void {
		const floor = floorHeightAt(
			this.world,
			position[0],
			position[2],
			position[1] + 0.5,
			position[1] - LEVEL_HEIGHT
		);
		const id = `i${this.nextId++}`;
		this.items.set(id, {
			id,
			stack: { ...stack },
			position: [position[0], floor ?? position[1], position[2]],
			yaw
		});
	}

	/** Take an item out of the map without anyone getting it (a clue that was read). */
	remove(id: string): void {
		this.items.delete(id);
	}

	/** Take every item of a kind out of the map. */
	removeAll(item: string): void {
		for (const [id, entry] of this.items) if (entry.stack.item === item) this.items.delete(id);
	}

	/** Drop in front of a player (from a drop event's origin and look direction). */
	drop(stack: ItemStack, origin: Vec3, direction: Vec3): void {
		const ahead: Vec3 = [origin[0] + direction[0] * 0.7, origin[1], origin[2] + direction[2] * 0.7];
		// Don't drop through a wall.
		const blocked = segmentHit(this.world, origin, ahead);
		const at: Vec3 = blocked === null ? ahead : [origin[0], origin[1], origin[2]];
		this.place(stack, at, Math.atan2(-direction[0], -direction[2]));
	}

	/** Scatter a list of stacks around a point (a player who died). */
	dropAll(stacks: ItemStack[], position: Vec3): void {
		stacks.forEach((stack, i) => {
			const a = (i / Math.max(1, stacks.length)) * Math.PI * 2;
			this.place(
				stack,
				[position[0] + Math.sin(a) * 0.4, position[1] + 0.3, position[2] + Math.cos(a) * 0.4],
				a
			);
		});
	}

	/** The item a player is looking at within reach, or null (see lookedAtItem). */
	lookedAt(state: PlayerState, eye: Vec3, look: Vec3): WorldItem | null {
		return lookedAtItem(this.world, state.position, eye, look, this.items.values());
	}

	/** Pick up an item into a player's inventory. Returns the item id taken, or null. */
	pickUp(state: PlayerState, item: WorldItem): string | null {
		const left = addItem(state.inventory, item.stack);
		if (left === item.stack.count) return null;
		if (left > 0) item.stack = { ...item.stack, count: left };
		else this.items.delete(item.id);
		return item.stack.item;
	}

	/** Launch a thrown item. */
	launch(stack: ItemStack, origin: Vec3, direction: Vec3, thrower: string): void {
		const speed = ITEMS[stack.item]?.throwable?.speed ?? 10;
		this.projectiles.push({
			id: `p${this.nextId++}`,
			stack: { ...stack },
			position: [
				origin[0] + direction[0] * 0.3,
				origin[1] + direction[1] * 0.3,
				origin[2] + direction[2] * 0.3
			],
			velocity: [direction[0] * speed, direction[1] * speed + THROW_LIFT, direction[2] * speed],
			thrower
		});
	}

	/** Advance thrown items one tick: hit a creature, or land on the world. */
	stepProjectiles(creatures: CreatureBody[]): ProjectileResult[] {
		const results: ProjectileResult[] = [];
		const flying: Projectile[] = [];
		for (const p of this.projectiles) {
			const spec = ITEMS[p.stack.item]?.throwable;
			let alive = true;
			for (let i = 0; i < SUBSTEPS && alive; i++) {
				p.velocity[1] -= GRAVITY * DT;
				const next: Vec3 = [
					p.position[0] + p.velocity[0] * DT,
					p.position[1] + p.velocity[1] * DT,
					p.position[2] + p.velocity[2] * DT
				];
				const step = Math.hypot(
					next[0] - p.position[0],
					next[1] - p.position[1],
					next[2] - p.position[2]
				);
				const dir: Vec3 = [
					(next[0] - p.position[0]) / step,
					(next[1] - p.position[1]) / step,
					(next[2] - p.position[2]) / step
				];
				for (const c of creatures) {
					if (rayVsCapsule(p.position, dir, step, c.position, c.height, c.radius) === null)
						continue;
					results.push({
						kind: 'hitCreature',
						creature: c.id,
						damage: spec?.damage ?? 0,
						thrower: p.thrower,
						position: [...p.position]
					});
					// It drops at the creature's feet.
					this.place(p.stack, [p.position[0], p.position[1], p.position[2]], 0);
					results.push({
						kind: 'land',
						item: p.stack.item,
						position: [...p.position],
						noise: spec?.landNoise ?? 0
					});
					alive = false;
					break;
				}
				if (!alive) break;
				const t = segmentHit(this.world, p.position, next);
				if (t !== null) {
					// Back off the surface a little, then settle on the floor below.
					const at: Vec3 = [
						p.position[0] + (next[0] - p.position[0]) * Math.max(0, t - 0.05),
						p.position[1] + (next[1] - p.position[1]) * Math.max(0, t - 0.05),
						p.position[2] + (next[2] - p.position[2]) * Math.max(0, t - 0.05)
					];
					this.place(p.stack, at, Math.atan2(-p.velocity[0], -p.velocity[2]));
					results.push({
						kind: 'land',
						item: p.stack.item,
						position: at,
						noise: spec?.landNoise ?? 0
					});
					alive = false;
					break;
				}
				p.position = next;
				// Fell out of the world: drop it where it is.
				if (p.position[1] < -200) alive = false;
			}
			if (alive) flying.push(p);
		}
		this.projectiles = flying;
		return results;
	}
}

function round(v: number): number {
	return Math.round(v * 1000) / 1000;
}
