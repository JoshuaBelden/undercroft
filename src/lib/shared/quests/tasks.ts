import { TASKS } from '../../content/tasks.ts';
import { segmentHit, type CollisionWorld } from '../map/collision.ts';
import type { TaskPlacement, Vec3 } from '../map/types.ts';

/**
 * Room tasks' objects (docs/dev/quests.md#room-tasks): which one a player is looking at. Shared
 * so the client prompts for exactly the one the server will work.
 */

/** How near (m, from the eye to its middle) and how directly (radians) it must be looked at. */
export const TASK_REACH = { range: 2.6, angle: 0.6 };

/** The middle of a task's object (it stands on the floor at `position`, or `lift` above it). */
export function taskCentre(task: TaskPlacement): Vec3 {
	const def = TASKS[task.id];
	const height = def?.size[1] ?? 1;
	const lift = def?.model?.lift ?? 0;
	return [task.position[0], task.position[1] + lift + height / 2, task.position[2]];
}

export function lookedAtTask(
	world: CollisionWorld,
	eye: Vec3,
	look: Vec3,
	tasks: readonly TaskPlacement[],
	done: (id: string) => boolean
): TaskPlacement | null {
	let best: TaskPlacement | null = null;
	let bestAngle = Infinity;
	for (const task of tasks) {
		if (done(task.id)) continue;
		const target = taskCentre(task);
		const to: Vec3 = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
		const d = Math.hypot(to[0], to[1], to[2]);
		if (d > TASK_REACH.range) continue;
		const along = (to[0] * look[0] + to[1] * look[1] + to[2] * look[2]) / Math.max(d, 1e-6);
		const angle = Math.acos(Math.min(1, Math.max(-1, along)));
		if (angle > TASK_REACH.angle || angle >= bestAngle) continue;
		if (segmentHit(world, eye, target) !== null) continue;
		best = task;
		bestAngle = angle;
	}
	return best;
}
