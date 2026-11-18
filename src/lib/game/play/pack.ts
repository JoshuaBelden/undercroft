import { ITEMS } from '#lib/content/items.ts';
import { raise } from '#lib/game/alerts.svelte.ts';
import { WorldItems } from '#lib/game/items/WorldItems.ts';
import { settings } from '#lib/settings/settings.svelte.ts';
import { canTake } from '#lib/shared/items/inventory.ts';
import { lookedAtItem } from '#lib/shared/items/pickup.ts';
import type { GameEvent } from '#lib/shared/items/types.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { Aim, PlayContext, PlayFeature, Prompt, TickMessage } from './feature.ts';
import { keyPrompt } from './prompt.ts';

/** Worth the happy cue when found: epic, legendary, or a quest item. */
export function prize(item: string): boolean {
	const def = ITEMS[item];
	return !!def && (def.quest === true || def.rarity === 'epic' || def.rarity === 'legendary');
}

/**
 * Items on the floor and in flight (docs/dev/items.md): drawn from the tick, the one interact
 * would pick up highlighted, picking up and dropping heard.
 */
export class Pack implements PlayFeature {
	private items = new WorldItems();
	/** The floor item the player would pick up, if any. */
	private aimedAt: { id: string; item: string } | null = null;

	constructor(private ctx: PlayContext) {
		ctx.engine.scene.add(this.items.root);
	}

	tick(tick: TickMessage): void {
		this.items.apply(tick.items, tick.projectiles);
	}

	event(event: GameEvent): void {
		const { sounds, client } = this.ctx;
		if (event.kind === 'pickup') {
			sounds.playAt('item.pickup', event.position, 1, 2);
			if (event.player === client.playerId) {
				if (prize(event.item)) sounds.play('loot.found');
				raise({ kind: 'item', item: event.item, count: event.count, source: 'pickup' });
			}
		} else if (event.kind === 'drop') {
			sounds.playAt('item.drop', event.position, 1, 2);
		}
	}

	/** A floor item comes before anything else interact could take. */
	target(state: PlayerState, aim: Aim | null): boolean {
		const item = aim
			? lookedAtItem(aim.world, state.position, aim.origin, aim.direction, this.items.snapshots)
			: null;
		this.aimedAt = item ? { id: item.id, item: item.item } : null;
		this.items.highlight(this.aimedAt?.id ?? null);
		return !!this.aimedAt;
	}

	prompt(state: PlayerState): Prompt | null {
		if (!this.aimedAt || !settings.interface.itemPrompts) return null;
		const { item } = this.aimedAt;
		const name = ITEMS[item]?.name ?? item;
		if (ITEMS[item]?.kind === 'clue') {
			return keyPrompt('interact', `to read the ${name.toLowerCase()}`);
		}
		const fit = canTake(state.inventory, { item, count: 1 });
		if (fit === 'heavy') return { prompt: name + ': too heavy to carry', progress: 0 };
		if (fit === 'full') return { prompt: name + ': no room for it', progress: 0 };
		return keyPrompt('interact', `to pick up ${name}`);
	}

	update(delta: number): void {
		this.items.update(delta);
	}

	clear(): void {
		this.items.clear();
	}

	dispose(): void {
		this.items.dispose();
	}
}
