import { ITEMS } from '../../src/lib/content/items.ts';
import { applyAction, held, sanitizeAction } from '../../src/lib/shared/items/inventory.ts';
import { aimRay, reequip } from '../../src/lib/shared/items/weapons.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import { eyeHeight } from '../../src/lib/shared/player/simulate.ts';
import type { ItemStack } from '../../src/lib/shared/player/types.ts';
import { hurt as hurtCreature, targets } from '../combat.ts';
import type { Player, SessionContext, SessionSystem, SimulatedFrame } from './system.ts';

/**
 * What players carry and what lies about (docs/dev/items.md): the pack screen's requests,
 * picking up what you look at, and thrown items in flight.
 */
export class PackSystem implements SessionSystem {
	constructor(private ctx: SessionContext) {}

	/** A request from the pack screen: move, equip or split something, or drop it on the floor. */
	request(player: Player, raw: unknown): void {
		const s = player.state;
		if (s.downed || s.dead || s.extracted) return;
		const crate = player.crate ? this.ctx.crates.get(player.crate) : null;
		if (crate) {
			this.ctx.systems.crates.loot(player, crate, raw);
			return;
		}
		const action = sanitizeAction(raw);
		if (!action) return;
		const inHand = held(s.inventory);
		const { dropped } = applyAction({ inventory: s.inventory }, action);
		this.afterRequest(player, inHand, dropped);
	}

	/** After a request was carried out: what came out lands on the floor, the hand is checked. */
	afterRequest(player: Player, inHand: ItemStack | null, dropped?: ItemStack): void {
		const s = player.state;
		if (dropped) {
			const { origin, direction } = aimRay(s, eyeHeight(s));
			this.ctx.items.drop(dropped, origin, direction);
			this.ctx.events.push({
				kind: 'drop',
				player: player.id,
				item: dropped.item,
				position: origin
			});
		}
		// What's in the hand changed: whatever it was doing stops and the new item comes up.
		if (held(s.inventory) !== inHand) reequip(s.weapon);
	}

	/**
	 * Interact pressed: pick up the item the player is looking at. A press that took hold of a rope
	 * did only that.
	 */
	simulated(player: Player, { pressedInteract }: SimulatedFrame): void {
		const s = player.state;
		if (!pressedInteract || s.climbing || s.downed || s.dead || s.swimming) return;
		const { origin, direction } = aimRay(s, eyeHeight(s));
		const item = this.ctx.items.lookedAt(s, origin, direction);
		if (!item) return;
		const position: Vec3 = [...item.position];
		if (ITEMS[item.stack.item]?.kind === 'clue') {
			if (this.ctx.systems.rite.readClue(player, position)) this.ctx.items.remove(item.id);
			return;
		}
		const taken = this.ctx.items.pickUp(s, item);
		if (taken) this.ctx.events.push({ kind: 'pickup', player: player.id, item: taken, position });
	}

	/** Thrown items: hit creatures, land, make noise. */
	step(): void {
		const ctx = this.ctx.combat();
		for (const result of this.ctx.items.stepProjectiles(targets(ctx))) {
			if (result.kind === 'hitCreature') {
				const thrower = this.ctx.players.get(result.thrower);
				hurtCreature(ctx, result.creature, result.damage, thrower ?? null);
			} else {
				this.ctx.events.push({ kind: 'land', item: result.item, position: result.position });
				// No source: creatures go and look where it landed (a lure).
				this.ctx.creatures.hear(result.position, result.noise, null);
			}
		}
	}
}
