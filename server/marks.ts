import { randomUUID } from 'node:crypto';
import { MARKS, MARK_SYMBOLS, markWheel } from '../src/lib/content/marks.ts';
import { segmentHit, type CollisionWorld } from '../src/lib/shared/map/collision.ts';
import type { MarkSnapshot } from '../src/lib/shared/items/types.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';

/**
 * The chalk marks of one expedition: drawn by players, seen by everyone, rubbed out only by
 * whoever drew them. They last the whole run. See docs/dev/marks.md.
 */
export class Marks {
	private list: MarkSnapshot[] = [];

	all(): readonly MarkSnapshot[] {
		return this.list;
	}

	/** Everything, as sent to clients. */
	snapshot(): MarkSnapshot[] {
		return this.list.map((mark) => ({ ...mark }));
	}

	/**
	 * Check a request to draw `symbol` at `position` (on the stone, `normal` out of it) from `eye`,
	 * looking `facing` (horizontal). Returns the mark, or null if it can't be drawn there: a symbol
	 * not on the wheel, too far, no stone there, something in the way, facing away, or too near
	 * another mark.
	 */
	check(
		world: CollisionWorld,
		eye: Vec3,
		facing: Vec3,
		symbol: unknown,
		position: unknown,
		normal: unknown
	): Omit<MarkSnapshot, 'id' | 'by' | 'name'> | null {
		if (typeof symbol !== 'string' || !MARK_SYMBOLS[symbol] || !markWheel().includes(symbol))
			return null;
		if (!isVec3(position) || !isVec3(normal)) return null;
		const length = Math.hypot(normal[0], normal[1], normal[2]);
		if (length < 0.5) return null;
		const n: Vec3 = [normal[0] / length, normal[1] / length, normal[2] / length];
		const to: Vec3 = [position[0] - eye[0], position[1] - eye[1], position[2] - eye[2]];
		const d = Math.hypot(to[0], to[1], to[2]);
		if (d < 0.05 || d > MARKS.reach + 0.1) return null;
		const dir: Vec3 = [to[0] / d, to[1] / d, to[2] / d];
		// The stone faces the one drawing on it.
		if (dot(dir, n) > -0.15) return null;
		// A collider has to be there: hit going on past the point, but not well before it.
		const far = d + MARKS.tolerance;
		const end: Vec3 = [eye[0] + dir[0] * far, eye[1] + dir[1] * far, eye[2] + dir[2] * far];
		const t = segmentHit(world, eye, end);
		if (t === null || t * far < d - MARKS.tolerance) return null;
		for (const other of this.list) {
			if (distance(other.position, position) < MARKS.minSpacing) return null;
		}
		return { symbol, position: [...position], normal: n, up: markUp(n, facing) };
	}

	/** Keep a mark; past `MARKS.max` the oldest goes. */
	add(mark: Omit<MarkSnapshot, 'id'>): MarkSnapshot {
		const added = { id: randomUUID(), ...mark };
		this.list.push(added);
		if (this.list.length > MARKS.max) this.list.splice(0, this.list.length - MARKS.max);
		return added;
	}

	remove(id: string): MarkSnapshot | null {
		const index = this.list.findIndex((mark) => mark.id === id);
		if (index < 0) return null;
		return this.list.splice(index, 1)[0];
	}

	clear(): void {
		this.list = [];
	}
}

/**
 * Which way is up for a symbol on a surface: world up laid flat on a wall; on a floor or ceiling,
 * the way the drawer was facing (so an arrow on the floor points where they looked).
 */
function markUp(normal: Vec3, facing: Vec3): Vec3 {
	const steep = Math.abs(normal[1]) > 0.7;
	const want: Vec3 = steep ? facing : [0, 1, 0];
	const along = dot(want, normal);
	const up: Vec3 = [
		want[0] - normal[0] * along,
		want[1] - normal[1] * along,
		want[2] - normal[2] * along
	];
	const length = Math.hypot(up[0], up[1], up[2]);
	if (length < 1e-4) return Math.abs(normal[2]) < 0.9 ? [0, 0, -1] : [1, 0, 0];
	return [up[0] / length, up[1] / length, up[2] / length];
}

function isVec3(value: unknown): value is Vec3 {
	return (
		Array.isArray(value) &&
		value.length === 3 &&
		value.every((v) => typeof v === 'number' && Number.isFinite(v))
	);
}

function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function distance(a: Vec3, b: Vec3): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
