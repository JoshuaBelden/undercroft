import { TASKS } from '../../src/lib/content/tasks.ts';
import { newStack } from '../../src/lib/shared/items/inventory.ts';
import { aimRay } from '../../src/lib/shared/items/weapons.ts';
import {
	CELL,
	LEVEL_HEIGHT,
	cellKey,
	occupiedCells,
	toWorld,
	worldCell
} from '../../src/lib/shared/map/grid.ts';
import { PIECES } from '../../src/lib/shared/map/pieces.generated.ts';
import type { TaskPlacement, Vec3 } from '../../src/lib/shared/map/types.ts';
import { eyeHeight } from '../../src/lib/shared/player/simulate.ts';
import { lookedAtTask, taskCentre } from '../../src/lib/shared/quests/tasks.ts';
import { log } from '../log.ts';
import { TICK_DT, type SessionContext, type SessionSystem } from './system.ts';

/**
 * Room tasks (docs/dev/quests.md#room-tasks): something in a named room a quest needs done. Its
 * object stands there while someone in the party needs it (`want`, before the map is built).
 * Holding interact on it, standing, works it for the task's `seconds`: loud the whole time, heard
 * `noise` away every `every` seconds, so creatures come. Done, it stays done; what it yields lies
 * in front of it, and it counts for everyone down here.
 */
export class TaskSystem implements SessionSystem {
	/** Tasks the party's quests need, so their objects are put in the map. */
	private wanted: string[] = [];
	private placed: TaskPlacement[] = [];
	private done = new Set<string>();

	constructor(private ctx: SessionContext) {}

	/** Before the map is built: the tasks the party needs (the session builds it after). */
	want(tasks: string[]): void {
		this.wanted = [...new Set(tasks)].filter((id) => TASKS[id]);
	}

	get wantedRooms(): string[] {
		return [...new Set(this.wanted.map((id) => TASKS[id].room))];
	}

	mapBuilt(): void {
		this.done.clear();
		this.placed = this.wanted.flatMap((id) => {
			const at = this.place(id);
			return at ? [at] : [];
		});
		this.ctx.layout.tasks = this.placed;
	}

	/** At its spot marker in its room; without one, the dry floor nearest the room's middle. */
	private place(id: string): TaskPlacement | null {
		const task = TASKS[id];
		const placement = this.ctx.layout.placements.find((p) => p.piece === task.room);
		const piece = placement ? PIECES[placement.piece] : undefined;
		if (!placement || !piece) return null;
		const spot = piece.spots?.find((s) => s.name === task.spot);
		if (spot) {
			return {
				id,
				position: toWorld(placement, spot.position),
				yaw: spot.yaw + (placement.rotation * Math.PI) / 2
			};
		}
		const cells = occupiedCells(piece, placement);
		const middle: Vec3 = [
			(cells.reduce((sum, [x]) => sum + x, 0) / cells.length + 0.5) * CELL,
			cells[0][2] * LEVEL_HEIGHT,
			(cells.reduce((sum, [, z]) => sum + z, 0) / cells.length + 0.5) * CELL
		];
		const keys = new Set(cells.map(([x, z, level]) => cellKey(x, z, level)));
		let best: Vec3 | null = null;
		let bestD = Infinity;
		for (const point of this.ctx.nav.points) {
			if (point.water || point.clearance !== 'stand') continue;
			const [x, y, z] = point.position;
			const [cx, cz] = worldCell(x, z);
			if (!keys.has(cellKey(cx, cz, Math.floor((y + 0.5) / LEVEL_HEIGHT)))) continue;
			const d = Math.hypot(x - middle[0], y - middle[1], z - middle[2]);
			if (d < bestD) {
				best = point.position;
				bestD = d;
			}
		}
		if (!best) return null;
		return { id, position: [...best], yaw: (placement.rotation * Math.PI) / 2 };
	}

	step(): void {
		const ctx = this.ctx;
		for (const player of ctx.players.values()) {
			const s = player.state;
			const busy =
				!ctx.canUseHands(player) ||
				!player.lastInput?.interact ||
				!s.grounded ||
				s.unbarring > 0 ||
				s.performing > 0 ||
				s.crafting > 0;
			const { origin, direction } = aimRay(s, eyeHeight(s));
			// What interact takes first, as on the client: a floor item, a crate, a door.
			const before =
				busy ||
				!!ctx.items.lookedAt(s, origin, direction) ||
				!!ctx.crates.lookedAt(origin, direction) ||
				!!ctx.doors.lookedAt(origin, direction);
			const at = before
				? null
				: lookedAtTask(ctx.world, origin, direction, this.placed, (id) => this.done.has(id));
			if (!at) {
				s.tasking = 0;
				continue;
			}
			const task = TASKS[at.id];
			const was = s.tasking;
			s.tasking += TICK_DT;
			// Loud from the first moment, then every `every` seconds it is kept at.
			if (was === 0 || Math.floor(s.tasking / task.every) !== Math.floor(was / task.every)) {
				ctx.creatures.hear(taskCentre(at), task.noise, { id: player.id, state: s });
				ctx.events.push({ kind: 'taskWork', id: at.id, position: taskCentre(at) });
			}
			if (s.tasking < task.seconds) continue;
			s.tasking = 0;
			this.done.add(at.id);
			if (task.yields) {
				// On the floor in front of it, toward whoever did it.
				const [x, y, z] = at.position;
				const dx = s.position[0] - x;
				const dz = s.position[2] - z;
				const d = Math.max(Math.hypot(dx, dz), 1e-3);
				ctx.items.place(
					newStack(task.yields.item, task.yields.count),
					[x + (dx / d) * 0.6, y + 0.05, z + (dz / d) * 0.6],
					0
				);
			}
			ctx.events.push({ kind: 'taskDone', id: at.id, player: player.id, position: taskCentre(at) });
			ctx.systems.quests.happened({ kind: 'task', task: at.id });
			log.info(`${player.name} finished the task ${at.id} in ${ctx.id.slice(0, 8)}`);
		}
	}

	/** Done tasks' ids, for the tick. */
	snapshot(): string[] {
		return [...this.done];
	}

	/** Where each task's object stands (admin teleports, tests). */
	placements(): readonly TaskPlacement[] {
		return this.placed;
	}
}
