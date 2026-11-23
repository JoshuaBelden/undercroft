import * as THREE from 'three';
import { ITEMS } from '#lib/content/items.ts';
import { loadModel } from '#lib/game/assets.ts';
import { TASKS } from '#lib/content/tasks.ts';
import type { GameEvent } from '#lib/shared/items/types.ts';
import type { MapLayout, TaskPlacement } from '#lib/shared/map/types.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import { lookedAtTask } from '#lib/shared/quests/tasks.ts';
import type { Aim, PlayContext, PlayFeature, Prompt, TickMessage } from './feature.ts';
import { keyPrompt } from './prompt.ts';

/**
 * Room tasks (docs/dev/quests.md#room-tasks): their objects drawn where they stand, worked by
 * holding interact on them, heard while anyone works one. Done, an object with a `done` model
 * becomes it (the niche broken open); one without stays as it is; a placeholder box goes.
 */
export class Tasks implements PlayFeature {
	private tasks: TaskPlacement[] = [];
	private done = new Set<string>();
	private models = new Map<string, THREE.Object3D>();
	private root = new THREE.Group();
	/** Bumped on every map, so a model that arrives after its map is gone is dropped. */
	private buildId = 0;
	/** The task interact would work, if any. */
	private aimedAt: TaskPlacement | null = null;

	constructor(private ctx: PlayContext) {
		ctx.engine.scene.add(this.root);
	}

	mapLoaded(layout: MapLayout): void {
		this.removeModels();
		this.done.clear();
		this.buildId++;
		this.tasks = layout.tasks ?? [];
		for (const task of this.tasks) this.show(task);
	}

	tick(tick: TickMessage): void {
		for (const id of tick.tasks) {
			if (this.done.has(id)) continue;
			this.done.add(id);
			const task = this.tasks.find((t) => t.id === id);
			if (task) this.show(task);
		}
	}

	/** Its object as it stands now: whole, done, or (no model) a placeholder box until done. */
	private show(task: TaskPlacement): void {
		const def = TASKS[task.id];
		const done = this.done.has(task.id);
		const url = done ? def?.model?.done : def?.model?.url;
		// Done, with nothing to become: a model stays as it is; a placeholder box goes.
		if (done && !url) {
			if (!def?.model) this.drop(task.id);
			return;
		}
		if (!url) {
			this.put(task.id, placeholder(task));
			return;
		}
		const build = this.buildId;
		void loadModel(url).then((model) => {
			if (build !== this.buildId || this.done.has(task.id) !== done) return;
			model.traverse((node) => {
				if (node instanceof THREE.Mesh) {
					node.castShadow = true;
					node.receiveShadow = true;
				}
			});
			const back = def?.model?.back ?? 0;
			model.position.set(
				task.position[0] - Math.sin(task.yaw) * back,
				task.position[1] + (def?.model?.lift ?? 0),
				task.position[2] - Math.cos(task.yaw) * back
			);
			model.rotation.y = task.yaw;
			this.put(task.id, model, false);
		});
	}

	private put(id: string, model: THREE.Object3D, owned = true): void {
		this.drop(id);
		model.userData.owned = owned;
		this.models.set(id, model);
		this.root.add(model);
	}

	private drop(id: string): void {
		const model = this.models.get(id);
		if (!model) return;
		this.root.remove(model);
		this.models.delete(id);
		dispose(model);
	}

	event(event: GameEvent): void {
		const { sounds, ui } = this.ctx;
		if (event.kind === 'taskWork') {
			const task = TASKS[event.id];
			// Loud: it is meant to carry.
			if (task) sounds.playAt(task.sound, event.position, 1, task.noise / 2);
		} else if (event.kind === 'taskDone') {
			const task = TASKS[event.id];
			sounds.play('quest.done');
			const yields = task?.yields ? ITEMS[task.yields.item]?.name : undefined;
			ui.banner('Done', yields ? `${yields} lies where you worked.` : undefined);
		}
	}

	target(state: PlayerState, aim: Aim | null, taken: boolean): boolean {
		this.aimedAt =
			aim && !taken && state.grounded
				? lookedAtTask(aim.world, aim.origin, aim.direction, this.tasks, (id) => this.done.has(id))
				: null;
		return !!this.aimedAt;
	}

	prompt(state: PlayerState): Prompt | null {
		const task = this.aimedAt ? TASKS[this.aimedAt.id] : undefined;
		if (!task) return null;
		return keyPrompt('interact', `to ${task.verb}`, state.tasking / task.seconds);
	}

	clear(): void {
		this.buildId++;
		this.removeModels();
		this.tasks = [];
		this.done.clear();
		this.aimedAt = null;
	}

	dispose(): void {
		this.clear();
		this.ctx.engine.scene.remove(this.root);
	}

	private removeModels(): void {
		for (const id of [...this.models.keys()]) this.drop(id);
	}
}

/** A placeholder's own geometry and material go with it; a loaded model's are shared (cached). */
function dispose(model: THREE.Object3D): void {
	if (!model.userData.owned) return;
	model.traverse((o) => {
		if (o instanceof THREE.Mesh) {
			o.geometry.dispose();
			(o.material as THREE.Material).dispose();
		}
	});
}

/** Until it has a model: a box of the task's size and colour, standing on the floor. */
function placeholder(task: TaskPlacement): THREE.Object3D {
	const def = TASKS[task.id];
	const [w, h, d] = def?.size ?? [1, 1, 1];
	const mesh = new THREE.Mesh(
		new THREE.BoxGeometry(w, h, d),
		new THREE.MeshStandardMaterial({ color: def?.color ?? 0x6b5a3a, roughness: 0.9 })
	);
	mesh.position.set(task.position[0], task.position[1] + h / 2, task.position[2]);
	mesh.rotation.y = task.yaw;
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	return mesh;
}
