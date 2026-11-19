import { CREATURES } from '#lib/content/creatures.ts';
import { lookedAtFriendly, type Friendly } from '#lib/shared/creature/talk.ts';
import type { GameEvent } from '#lib/shared/items/types.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { Aim, PlayContext, PlayFeature, Prompt, TickMessage } from './feature.ts';
import { keyPrompt } from './prompt.ts';

/**
 * The surveyor (docs/dev/creatures.md#the-surveyor): look at him close up and hold interact to
 * take his map. The server draws it into yours; the prompt goes once he has shared it with you.
 */
export class Surveyor implements PlayFeature {
	/** Friendly creatures in the last tick. */
	private friendlies: Friendly[] = [];
	/** The ones who have shared their map with you. */
	private shared = new Set<string>();
	/** The one interact would talk to, if any. */
	private aimedAt: Friendly | null = null;

	constructor(private ctx: PlayContext) {}

	tick(tick: TickMessage): void {
		this.friendlies = tick.creatures
			.filter((c) => CREATURES[c.kind]?.friendly && c.state !== 'dead')
			.map((c) => ({ id: c.id, kind: c.kind, position: c.position }));
	}

	event(event: GameEvent): void {
		if (event.kind !== 'surveyorMap') return;
		this.ctx.sounds.playAt('surveyor.share', event.position, 1, 4);
		if (event.player !== this.ctx.client.playerId) return;
		this.shared.add(event.creature);
		this.ctx.ui.banner(
			event.cells > 0 ? 'He marks your map' : 'Nothing new',
			event.cells > 0 ? 'Where he has been is in your map now.' : 'You had been everywhere he has.'
		);
	}

	target(_state: PlayerState, aim: Aim | null, taken: boolean): boolean {
		const looked =
			aim && !taken
				? lookedAtFriendly(aim.world, aim.origin, aim.direction, this.friendlies)
				: null;
		this.aimedAt = looked && !this.shared.has(looked.id) ? looked : null;
		return !!this.aimedAt;
	}

	prompt(state: PlayerState): Prompt | null {
		if (!this.aimedAt) return null;
		const seconds = CREATURES[this.aimedAt.kind]?.friendly?.seconds ?? 1;
		return keyPrompt('interact', 'to look at his map', state.consulting / seconds);
	}

	clear(): void {
		this.friendlies = [];
		this.shared.clear();
		this.aimedAt = null;
	}
}
