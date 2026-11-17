import { DOORS } from '#lib/content/doors.ts';
import { Doors as DoorModels } from '#lib/game/map/Doors.ts';
import type { GameEvent } from '#lib/shared/items/types.ts';
import type { CollisionWorld } from '#lib/shared/map/collision.ts';
import { lookedAtDoor } from '#lib/shared/map/doors.ts';
import type { MapLayout } from '#lib/shared/map/types.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { Aim, PlayContext, PlayFeature, Prompt, TickMessage } from './feature.ts';
import { keyPrompt } from './prompt.ts';

/**
 * Doors between levels (docs/dev/map-generation.md): drawn barred until the tick says one is
 * open, unbarred by holding interact on it.
 */
export class Doors implements PlayFeature {
	private models = new DoorModels();
	/** The shut door interact would open, if any (floor items and crates first). */
	private aimedAt: string | null = null;

	constructor(private ctx: PlayContext) {
		ctx.engine.scene.add(this.models.root);
	}

	mapLoaded(layout: MapLayout, world: CollisionWorld): void {
		this.models.build(layout.doors, world);
	}

	tick(tick: TickMessage): void {
		this.models.apply(tick.doors);
	}

	event(event: GameEvent): void {
		if (event.kind !== 'doorOpen') return;
		// Heard far down the stair and back across the level.
		this.ctx.sounds.playAt('door.unbar', event.position, 1, 6);
		this.ctx.sounds.playAt('door.open', event.position, 1, 10);
	}

	target(_state: PlayerState, aim: Aim | null, taken: boolean): boolean {
		const door =
			aim && !taken
				? lookedAtDoor(aim.world, aim.origin, aim.direction, this.models.placements, (id) =>
						this.models.isOpen(id)
					)
				: null;
		this.aimedAt = door?.id ?? null;
		return !!this.aimedAt;
	}

	prompt(state: PlayerState): Prompt | null {
		if (!this.aimedAt) return null;
		return keyPrompt('interact', 'to open the door', state.unbarring / DOORS.openSeconds);
	}

	update(delta: number): void {
		this.models.update(delta);
	}

	clear(): void {
		this.models.clear();
	}

	dispose(): void {
		this.models.dispose();
	}
}
