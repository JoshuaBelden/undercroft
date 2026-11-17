import { CRATES } from '#lib/content/loot.ts';
import { Crates as CrateModels } from '#lib/game/items/Crates.ts';
import { settings } from '#lib/settings/settings.svelte.ts';
import { lookedAtCrate } from '#lib/shared/items/pickup.ts';
import type { CrateSlot, GameEvent } from '#lib/shared/items/types.ts';
import type { MapLayout } from '#lib/shared/map/types.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { ServerMessage } from '#lib/shared/protocol.ts';
import type { Aim, PlayContext, PlayFeature, Prompt, TickMessage } from './feature.ts';
import { prize } from './pack.ts';
import { keyPrompt } from './prompt.ts';

/** A loot crate (or corpse) that is open, as the server tells it (the `crate` message). */
export interface OpenCrate {
	id: string;
	slots: CrateSlot[];
	reveal: number;
	corpse: boolean;
}

/**
 * Loot crates and corpses (docs/dev/items.md#loot-crates): drawn where the layout puts them,
 * searched by holding interact, and the crate screen while one is open.
 */
export class Crates implements PlayFeature {
	/** The crate that is open; the page shows the crate screen for it. */
	open = $state<OpenCrate | null>(null);
	private models = new CrateModels();
	/** The loot crate the player would open, if any (a floor item comes first). */
	private aimedAt: string | null = null;
	/**
	 * We shut the crate and the server hasn't answered yet: what it still sends about the crate
	 * until then is old news, and must not open the screen again.
	 */
	private leaving = false;

	constructor(private ctx: PlayContext) {
		ctx.engine.scene.add(this.models.root);
	}

	mapLoaded(layout: MapLayout): void {
		this.models.build(layout.crates);
	}

	tick(tick: TickMessage): void {
		this.models.apply(tick.crates);
	}

	message(message: ServerMessage): void {
		if (message.type !== 'crate') return;
		const { ui } = this.ctx;
		if (message.id === null) {
			// The server shut it (walked away, went down), or agreed that we did.
			this.leaving = false;
			if (ui.panel === 'crate') {
				ui.panel = null;
				if (ui.expedition && !ui.downed) ui.capture();
			}
			this.open = null;
		} else if (ui.expedition && !this.leaving) {
			// Sent every tick while it is open: only what changed is worth redrawing.
			const next = {
				id: message.id,
				slots: message.slots,
				reveal: message.reveal,
				corpse: this.models.kind(message.id) === 'corpse'
			};
			// Something special just revealed (not one seen before the crate was opened).
			const before = this.open?.id === next.id ? this.open.slots : null;
			if (
				before &&
				next.slots.some(
					(slot, i) => before[i] === 'hidden' && slot && slot !== 'hidden' && prize(slot.item)
				)
			) {
				this.ctx.sounds.play('loot.found');
			}
			if (JSON.stringify(next) !== JSON.stringify(this.open)) this.open = next;
			if (ui.panel !== 'crate') {
				ui.panel = 'crate';
				document.exitPointerLock();
			}
		}
	}

	/** Done with the loot crate: tell the server, and straight back to play. */
	close(): void {
		const { ui } = this.ctx;
		if (ui.panel !== 'crate') return;
		ui.panel = null;
		this.open = null;
		this.leaving = true;
		this.ctx.client.send({ type: 'closeCrate' });
		if (ui.expedition) ui.capture();
	}

	event(event: GameEvent): void {
		const { sounds, client } = this.ctx;
		if (event.kind === 'crateOpen') {
			if (this.models.kind(event.id) === 'corpse') {
				sounds.playAt('corpse.search', event.position, 1, 3);
			} else sounds.playAt('crate.open', event.position, 1, 4);
		} else if (event.kind === 'rummage') {
			// Your own hands are right there; someone else's are heard from where they are.
			if (event.player === client.playerId) sounds.play('inventory.rummage');
			else sounds.playAt('inventory.rummage', event.position, 1, 3);
		}
	}

	target(_state: PlayerState, aim: Aim | null, taken: boolean): boolean {
		this.aimedAt =
			aim && !taken
				? (lookedAtCrate(aim.world, aim.origin, aim.direction, this.models.placements)?.id ?? null)
				: null;
		this.models.highlight(this.aimedAt);
		return !!this.aimedAt;
	}

	prompt(state: PlayerState): Prompt | null {
		if (!this.aimedAt || !settings.interface.itemPrompts) return null;
		if (this.models.inUse(this.aimedAt))
			return { prompt: 'Someone is going through it', progress: 0 };
		// Crates and bodies alike.
		return keyPrompt('interact', 'to search', state.opening / CRATES.openSeconds);
	}

	update(delta: number): void {
		this.models.update(delta);
	}

	left(): void {
		this.open = null;
	}

	clear(): void {
		this.open = null;
		this.leaving = false;
		this.models.clear();
	}

	dispose(): void {
		this.models.dispose();
	}
}
