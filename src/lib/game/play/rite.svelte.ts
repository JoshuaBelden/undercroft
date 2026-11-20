import { ITEMS } from '#lib/content/items.ts';
import { MAP_KIT } from '#lib/content/map/kit.ts';
import { carriesAll, riteCount } from '#lib/shared/affliction/rite.ts';
import type { RiteSnapshot } from '#lib/shared/affliction/types.ts';
import type { GameEvent } from '#lib/shared/items/types.ts';
import { unsealExtracts, type CollisionWorld } from '#lib/shared/map/collision.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { PlayContext, PlayFeature, Prompt, TickMessage } from './feature.ts';
import { keyPrompt } from './prompt.ts';

/** Someone carrying a thing the rite needs. */
export interface RiteCarrier {
	name: string;
	count: number;
	self: boolean;
}

/**
 * The rite (docs/dev/rite.md): what is known of it so far and who carries each requirement (the
 * rite panel and the menu's Rite tab), performing it, and the banners of hints, the rite and
 * banishing. Once it is banished the final room's ladder comes down and is a way out.
 */
export class Rite implements PlayFeature {
	/** The rite as known so far; null on the surface. */
	known = $state<RiteSnapshot | null>(null);
	/** Who carries each requirement, in the order of `known.requirements`. */
	carriers = $state<RiteCarrier[][]>([]);
	/** Whether the rite was being performed last frame (to ring its bell once). */
	private performing = false;
	/** The player's collision world, to let the final room's way out in once it is resolved. */
	private world: CollisionWorld | null = null;
	/** The ladder has been let down (or was down when we got here). */
	private lowered = false;

	constructor(
		private ctx: PlayContext,
		/** The Affliction's name, for the banners. */
		private afflictionName: () => string
	) {}

	mapLoaded(_layout: unknown, world: CollisionWorld): void {
		this.world = world;
		this.lowered = false;
	}

	tick(tick: TickMessage): void {
		if (JSON.stringify(tick.affliction.rite) !== JSON.stringify(this.known)) {
			this.known = tick.affliction.rite;
		}
		// Resolved before we got here (or before the map was in): already down. The resolving tick
		// itself lets it down in its event, below.
		const now = tick.events.some((e) => e.kind === 'resolved');
		if (tick.affliction.rite.resolved && !now) this.lower(true);
	}

	/** The final room's way out comes down, and counts. */
	private lower(instant: boolean): void {
		if (this.lowered || !this.world) return;
		this.lowered = true;
		unsealExtracts(this.world);
		this.ctx.map.lowerLadders(instant);
		const at = this.ctx.map.ladderAt();
		if (!instant && at) this.ctx.sounds.playAt('ladder.lower', [at.x, at.y, at.z], 1, 10);
	}

	event(event: GameEvent): void {
		const { sounds, ui } = this.ctx;
		const name = this.afflictionName();
		if (event.kind === 'clue') {
			// Everyone learns it at once, wherever they are.
			sounds.play('clue.sting');
			const learned = event.requirements.map((item) => ITEMS[item]?.name ?? item);
			if (event.room) learned.push(MAP_KIT[event.room]?.title ?? event.room);
			ui.banner(
				learned.length ? 'A hint: ' + learned.join(' · ') : 'A hint',
				event.text || undefined
			);
		} else if (event.kind === 'rite') {
			sounds.play('rite.perform');
			ui.banner('The rite is done', `Something answers it. Banish ${name || 'the Affliction'}.`);
		} else if (event.kind === 'resolved') {
			sounds.play('rite.resolve');
			ui.banner(
				'Banished',
				`${name || 'The Affliction'} is resolved. The ladder is down: get out.`
			);
			this.lower(false);
		}
	}

	/** In its room, carrying all it needs: hold interact to perform it. */
	prompt(state: PlayerState): Prompt | null {
		const rite = this.known;
		if (
			!rite ||
			rite.performed ||
			!this.inRoom(state) ||
			!carriesAll(state.inventory, rite.requirements)
		) {
			return null;
		}
		return keyPrompt('interact', 'to perform the rite', state.performing / rite.seconds);
	}

	/** Standing in the room the rite is held in (once a clue has told where that is). */
	private inRoom(state: PlayerState): boolean {
		const title = this.known?.room ? MAP_KIT[this.known.room]?.title : undefined;
		return !!title && this.ctx.ui.roomTitleAt(state.position) === title;
	}

	self(state: PlayerState): void {
		if (state.performing > 0 && !this.performing) this.ctx.sounds.play('rite.begin');
		this.performing = state.performing > 0;
	}

	update(delta: number): void {
		this.ctx.map.update(delta);
		if (!this.known) return;
		const now = this.whoCarries(this.ctx.player.state);
		if (JSON.stringify(now) !== JSON.stringify(this.carriers)) this.carriers = now;
	}

	/** Who carries each thing the rite needs, for the rite overlay. */
	private whoCarries(state: PlayerState | null): RiteCarrier[][] {
		const everyone = [
			...(state ? [{ name: 'you', state, self: true }] : []),
			...this.ctx.remote.players().map((one) => ({ ...one, self: false }))
		];
		return (this.known?.requirements ?? []).map((requirement) =>
			requirement
				? everyone
						.map((one) => ({
							name: one.name,
							self: one.self,
							count: riteCount(one.state.inventory, requirement.item)
						}))
						.filter((carrier) => carrier.count > 0)
				: []
		);
	}

	clear(): void {
		this.known = null;
		this.performing = false;
		this.world = null;
		this.lowered = false;
	}
}
