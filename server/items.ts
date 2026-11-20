import { ITEMS } from '../src/lib/content/items.ts';
import { BRICKS } from '../src/lib/content/loadout.ts';
import { LOOSE_LOOT } from '../src/lib/content/loot.ts';
import { SIM_RATE, TICK_RATE } from '../src/lib/shared/constants.ts';
import { addItem, newStack } from '../src/lib/shared/items/inventory.ts';
import { rollLoose } from '../src/lib/shared/items/loot.ts';
import { lookedAtItem } from '../src/lib/shared/items/pickup.ts';
import {
	FLIGHT,
	flightStep,
	launch as launchFrom,
	restingAt
} from '../src/lib/shared/items/projectile.ts';
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
	/** Hung on a wall, facing out along this (a hint): drawn upright against it, not lying. */
	normal?: Vec3;
}

/** How something in flight behaves: a throw's own numbers, or a round's (a bolt, a pebble). */
export interface Flight {
	speed: number;
	/** Extra upward speed: a throw is lobbed; a shot isn't. */
	lift: number;
	damage: number;
	/** Radius (m) its landing is heard. */
	landNoise: number;
	/** Chance it breaks when it hits a creature (gone, not dropped). */
	breakChance: number;
	/** Gone when it lands or hits (a fuse goes off, a bottle bursts): nothing is left to pick up. */
	usedUp: boolean;
}

interface Projectile {
	id: string;
	stack: ItemStack;
	position: Vec3;
	velocity: Vec3;
	/** Player who threw (or shot) it. */
	thrower: string;
	flight: Flight;
}

/** What a projectile did this tick. */
export type ProjectileResult =
	| {
			kind: 'hitCreature';
			creature: string;
			damage: number;
			thrower: string;
			position: Vec3;
			item: string;
	  }
	| { kind: 'land'; item: string; position: Vec3; noise: number; thrower: string };

const SUBSTEPS = Math.round(SIM_RATE / TICK_RATE);
const DT = 1 / SIM_RATE;

/** How a thrown item flies, from its `throwable`. */
export function thrownFlight(item: string): Flight {
	const spec = ITEMS[item]?.throwable;
	return {
		speed: spec?.speed ?? 10,
		lift: FLIGHT.lift,
		damage: spec?.damage ?? 0,
		landNoise: spec?.landNoise ?? 0,
		breakChance: 0,
		usedUp: !!spec?.fuse || !!spec?.fire
	};
}

export class WorldItems {
	private items = new Map<string, WorldItem>();
	private projectiles: Projectile[] = [];
	private nextId = 1;

	constructor(private world: CollisionWorld) {}

	/**
	 * Lay a few bricks by each collapsed wall (`rubble`: the rubble-* markers in world space), away
	 * from the start. Nowhere else. Seeded by the map seed.
	 */
	scatter(nav: NavGrid, seed: number, start: Vec3, rubble: Vec3[]): void {
		const rng = new Rng(seed ^ 0xb71c);
		for (const site of rubble) {
			const want = rng.int(BRICKS.perRubble[0], BRICKS.perRubble[1]);
			if (Math.hypot(site[0] - start[0], site[2] - start[2]) <= 6) continue;
			const spots = nav.points.filter(
				(p) =>
					p.clearance === 'stand' &&
					!p.water &&
					Math.abs(p.position[1] - site[1]) < 1 &&
					Math.hypot(p.position[0] - site[0], p.position[2] - site[2]) <= BRICKS.radius
			);
			const placed: Vec3[] = [];
			for (let tries = 0; tries < want * 10 && placed.length < want && spots.length; tries++) {
				const { position } = rng.pick(spots);
				if (placed.some((q) => Math.hypot(q[0] - position[0], q[2] - position[2]) < 0.5)) continue;
				placed.push(position);
				this.place(
					newStack('brick'),
					[position[0], position[1], position[2]],
					rng.next() * Math.PI * 2
				);
			}
		}
	}

	/**
	 * Scatter the little loot that lies loose (seeded by the map seed): by walls, away from the
	 * start, and more of it the farther in you go (see LOOSE_LOOT). Most loot is in crates.
	 */
	scatterLoot(nav: NavGrid, seed: number, start: Vec3, cells: number): void {
		const rng = new Rng(seed ^ 0x100f);
		const distance = gridDistances(nav, [nearestPoint(nav, start)], true);
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
			yaw: round(i.yaw),
			...(i.normal ? { normal: i.normal.map(round) as Vec3 } : {})
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

	/** Hang a stack on a wall: it stays where it is put, facing out along `normal`. */
	mount(stack: ItemStack, position: Vec3, normal: Vec3): void {
		const id = `i${this.nextId++}`;
		this.items.set(id, {
			id,
			stack: { ...stack },
			position: [...position],
			yaw: Math.atan2(-normal[0], -normal[2]),
			normal: [...normal]
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

	/** Drop in front of a player (from their eye and look direction): out of the pack. */
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

	/** Pick up an item into a player's inventory. Returns the item id and how many were taken, or null. */
	pickUp(state: PlayerState, item: WorldItem): { item: string; count: number } | null {
		const before = item.stack.count;
		const left = addItem(state.inventory, item.stack);
		if (left === before) return null;
		if (left > 0) item.stack = { ...item.stack, count: left };
		else this.items.delete(item.id);
		return { item: item.stack.item, count: before - left };
	}

	/** Launch something: a thrown item (its own `throwable`), or a round with its `flight`. */
	launch(
		stack: ItemStack,
		origin: Vec3,
		direction: Vec3,
		thrower: string,
		flight: Flight = thrownFlight(stack.item)
	): void {
		const start = launchFrom(origin, direction, flight.speed, flight.lift);
		this.projectiles.push({
			id: `p${this.nextId++}`,
			stack: { ...stack },
			position: start.position,
			velocity: start.velocity,
			thrower,
			flight
		});
	}

	/** Advance thrown items one tick: hit a creature, or land on the world. */
	stepProjectiles(creatures: CreatureBody[]): ProjectileResult[] {
		const results: ProjectileResult[] = [];
		const flying: Projectile[] = [];
		for (const p of this.projectiles) {
			const f = p.flight;
			let alive = true;
			for (let i = 0; i < SUBSTEPS && alive; i++) {
				const { next, hit: t } = flightStep(this.world, p.position, p.velocity, DT);
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
						damage: f.damage,
						thrower: p.thrower,
						position: [...p.position],
						item: p.stack.item
					});
					// It drops at the creature's feet, unless it broke (or is used up).
					const broke = f.breakChance > 0 && Math.random() < f.breakChance;
					if (!broke && !f.usedUp)
						this.place(p.stack, [p.position[0], p.position[1], p.position[2]], 0);
					results.push({
						kind: 'land',
						item: p.stack.item,
						position: [...p.position],
						noise: f.landNoise,
						thrower: p.thrower
					});
					alive = false;
					break;
				}
				if (!alive) break;
				if (t !== null) {
					// Back off the surface a little, then settle on the floor below.
					const at = restingAt(p.position, next, t);
					if (!f.usedUp) this.place(p.stack, at, Math.atan2(-p.velocity[0], -p.velocity[2]));
					results.push({
						kind: 'land',
						item: p.stack.item,
						position: at,
						noise: f.landNoise,
						thrower: p.thrower
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
