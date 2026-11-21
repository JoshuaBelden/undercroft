import { ITEMS } from '#lib/content/items.ts';
import { raise } from '#lib/game/alerts.svelte.ts';
import { discoveries } from '#lib/game/discoveries.svelte.ts';
import { LOOTABLES } from '#lib/content/lootables.ts';
import { Crates as CrateModels } from '#lib/game/items/Crates.ts';
import { settings } from '#lib/settings/settings.svelte.ts';
import { bestWay, flavorOf, lootableOf, wayNeeds, waysFor } from '#lib/shared/items/lootables.ts';
import { allStacks } from '#lib/shared/items/inventory.ts';
import { lookedAtCrate } from '#lib/shared/items/pickup.ts';
import type { CrateSlot, GameEvent } from '#lib/shared/items/types.ts';
import type { MapLayout } from '#lib/shared/map/types.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { ServerMessage } from '#lib/shared/protocol.ts';
import type { Aim, PlayContext, PlayFeature, Prompt, TickMessage } from './feature.ts';
import { prize } from './pack.ts';
import { keyPrompt } from './prompt.ts';

/** A lootable that is open, as the server tells it (the `crate` message). */
export interface OpenCrate {
	id: string;
	slots: CrateSlot[];
	reveal: number;
	/** What it is called (the screen's title), and its line of flavor. */
	name: string;
	flavor: string;
}

/**
 * Lootables (docs/dev/lootables.md): drawn where the layout puts them, opened by holding interact
 * (the prompt says how, with the same rule as the server: `bestWay`), and the loot screen while
 * one is open.
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
		this.models.syncBoxes(tick.crates.boxes);
		this.noticed = tick.crates.noticed;
		this.dry = tick.crates.dry;
	}

	/** Hidden lootables (a smuggler's stash) someone has noticed: the rest can't be opened. */
	private noticed: string[] = [];
	/** Fonts run dry (from the tick). */
	private dry: string[] = [];

	message(message: ServerMessage): void {
		if (message.type === 'discovered') {
			discoveries.add(message.item);
			// The same sting as finding something epic.
			this.ctx.sounds.play('loot.found');
			raise({ kind: 'discovery', item: message.item, recipes: message.recipes });
			return;
		}
		if (message.type === 'crafted') {
			if (message.count > 0) {
				raise({ kind: 'item', item: message.item, count: message.count, source: 'craft' });
			} else {
				const name = ITEMS[message.item]?.name ?? message.item;
				raise({
					kind: 'note',
					title: `Mended: ${name.toLowerCase()}`,
					line: 'Some of the wear is gone.'
				});
			}
			return;
		}
		if (message.type === 'fragment') {
			const name = message.item ? ITEMS[message.item]?.name.toLowerCase() : null;
			raise({
				kind: 'note',
				title: 'A recipe fragment',
				line: name ? `It mentions ${name}.` : 'Notes on things you already know.'
			});
			return;
		}
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
			const def = LOOTABLES[this.models.kind(message.id) ?? 'crate'];
			const next = {
				id: message.id,
				slots: message.slots,
				reveal: message.reveal,
				name: this.title(message.id, def.name),
				flavor: flavorOf(def, message.id)
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

	/**
	 * What a lootable is called: its name, or for a drop box whose it is ("Your drop box",
	 * "Wanderer's drop box").
	 */
	private title(id: string, name: string): string {
		const box = this.models.boxes.get(id);
		if (!box) return name;
		if (box.owner === this.ctx.client.playerId) return `Your ${name.toLowerCase()}`;
		const owner = this.ctx.remote.list().find((player) => player.id === box.owner);
		return owner ? `${owner.name}'s ${name.toLowerCase()}` : name;
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
			const def = LOOTABLES[this.models.kind(event.id) ?? 'crate'];
			sounds.playAt(def.sound, event.position, 1, Math.max(3, def.noise / 2));
		} else if (event.kind === 'boxed') {
			// Put down in a drop box.
			if (event.player === client.playerId) sounds.play('inventory.drop');
			else sounds.playAt('inventory.drop', event.position, 1, 3);
		} else if (event.kind === 'filled') {
			sounds.playAt('lootable.font', event.position, 1, 3);
		} else if (event.kind === 'noticed') {
			// Only the one who saw it knows what they saw.
			if (event.player === client.playerId) sounds.play('stash.notice');
		} else if (event.kind === 'crateStuck') {
			sounds.playAt('crate.stuck', event.position, 1, 4);
		} else if (event.kind === 'crateUnlock') {
			sounds.playAt('key.unlock', event.position, 1, 4);
		} else if (event.kind === 'pry' && event.target === 'crate') {
			sounds.playAt('crowbar.pry', event.position, 1, 10);
		} else if (event.kind === 'rummage') {
			// Your own hands are right there; someone else's are heard from where they are.
			if (event.player === client.playerId) sounds.play('inventory.rummage');
			else sounds.playAt('inventory.rummage', event.position, 1, 3);
		}
	}

	target(_state: PlayerState, aim: Aim | null, taken: boolean): boolean {
		const known = this.models
			.all()
			.filter((p) => !LOOTABLES[p.kind ?? 'crate'].hidden || this.noticed.includes(p.id));
		this.aimedAt =
			aim && !taken
				? (lookedAtCrate(aim.world, aim.origin, aim.direction, known)?.id ?? null)
				: null;
		this.models.highlight(this.aimedAt);
		return !!this.aimedAt;
	}

	prompt(state: PlayerState): Prompt | null {
		if (!this.aimedAt || !settings.interface.itemPrompts) return null;
		if (this.models.inUse(this.aimedAt))
			return { prompt: 'Someone is going through it', progress: 0 };
		const id = this.aimedAt;
		const def = lootableOf({ kind: this.models.kind(id) });
		if (def.fill) {
			// A font: filled from, with what it fills in the pack, until it runs dry.
			const fill = def.fill;
			if (this.dry.includes(id))
				return { ...keyPrompt('interact', fill.verb), after: '(dry)', blocked: true };
			const has = allStacks(state.inventory).some((stack) => stack.item === fill.needs);
			if (!has) {
				const needs = ITEMS[fill.needs]?.name.toLowerCase() ?? fill.needs;
				return { ...keyPrompt('interact', fill.verb), after: `(needs a ${needs})`, blocked: true };
			}
			return keyPrompt('interact', fill.verb, state.opening / fill.seconds);
		}
		// Sealed and known (locked, or a jam someone found): only its sealed ways.
		const sealed = this.models.isLocked(id) || this.models.isJammed(id);
		const ways = waysFor(def, sealed);
		const after = sealed && def.sealed ? `(${def.sealed.note})` : undefined;
		const way = bestWay(ways, state.inventory, def.id);
		if (!way) {
			// Nothing to open it with: say how it would be opened, in red, and what that takes.
			const first = ways[0];
			if (!first) return null;
			// Two at it (a stone lid): the server says how far along, though this side can't see the help.
			const together = ways.find((w) => w.together);
			if (together && state.opening > 0) {
				return keyPrompt('interact', together.verb, state.opening / together.seconds);
			}
			const needs = wayNeeds(first);
			return {
				...keyPrompt('interact', first.verb),
				after: [after, needs ? `(needs ${needs})` : ''].filter(Boolean).join(' ') || undefined,
				blocked: true
			};
		}
		const progress = way.seconds > 0 ? state.opening / way.seconds : 0;
		// A drop box says whose it is: "to open Wanderer's drop box".
		const verb = this.models.boxes.has(id)
			? `${way.verb} ${this.title(id, def.name).replace(/^Your/, 'your')}`
			: way.verb;
		return { ...keyPrompt('interact', verb, progress), after };
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
