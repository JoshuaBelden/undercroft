import { DOORS } from '#lib/content/doors.ts';
import { gateSeconds } from '#lib/shared/items/lootables.ts';
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
 * open, unbarred by holding interact on it. The final room's slams shut at the rite and can't be
 * opened until what it summoned is banished. A barred one (docs/dev/quests.md#the-barred-stair)
 * only rattles: a charge blows it open.
 */
export class Doors implements PlayFeature {
	private models = new DoorModels();
	/** The shut door interact would open, if any (floor items and crates first). */
	private aimedAt: string | null = null;
	/** Whether that is a locked gate. */
	private gate = false;
	/** Doors barred from the far side, as the tick last said. */
	private barred = new Set<string>();

	constructor(private ctx: PlayContext) {
		ctx.engine.scene.add(this.models.root);
	}

	mapLoaded(layout: MapLayout, world: CollisionWorld): void {
		this.models.build(layout.doors, world);
	}

	tick(tick: TickMessage): void {
		this.models.apply(tick.doors, tick.sealed);
		this.barred = new Set(tick.barred);
	}

	event(event: GameEvent): void {
		const { sounds } = this.ctx;
		if (event.kind === 'doorSeal') {
			if (event.open) sounds.playAt('door.slam', event.position, 1, 12);
			sounds.playAt('door.seal', event.position, 1, 8);
			return;
		}
		if (event.kind === 'doorRattle') {
			sounds.playAt('door.rattle', event.position, 1, 8);
			return;
		}
		if (event.kind === 'blast') {
			// The barred door blown in: it swings open (the blast itself is the hazards').
			if (event.door) sounds.playAt('door.open', event.position, 1, 10);
			return;
		}
		if (event.kind !== 'doorOpen' && event.kind !== 'doorRelease') return;
		// A locked gate (the Family Mausoleum's) has its own iron swing.
		const gate = this.models.placements.find((door) => door.id === event.id)?.kind === 'gate';
		if (gate) {
			sounds.playAt('gate.mausoleum', event.position, 1, 10);
			return;
		}
		// Heard far down the stair and back across the level.
		sounds.playAt('door.unbar', event.position, 1, 6);
		sounds.playAt('door.open', event.position, 1, 10);
	}

	target(_state: PlayerState, aim: Aim | null, taken: boolean): boolean {
		const door =
			aim && !taken
				? lookedAtDoor(
						aim.world,
						aim.origin,
						aim.direction,
						this.models.placements,
						(id) => this.models.isOpen(id) || this.models.isSealed(id)
					)
				: null;
		this.aimedAt = door?.id ?? null;
		this.gate = door?.kind === 'gate';
		return !!this.aimedAt;
	}

	prompt(state: PlayerState): Prompt | null {
		if (!this.aimedAt) return null;
		if (this.barred.has(this.aimedAt)) {
			return {
				...keyPrompt('interact', 'to try the door'),
				after: '(barred from the far side)',
				blocked: true
			};
		}
		if (this.gate) {
			const seconds = gateSeconds(state.inventory);
			if (seconds === null) {
				return {
					...keyPrompt('interact', 'to unlock the gate'),
					after: '(needs a key or lockpicks)',
					blocked: true
				};
			}
			return keyPrompt('interact', 'to unlock the gate', state.unbarring / seconds);
		}
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
