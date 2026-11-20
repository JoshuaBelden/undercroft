import { ITEMS } from '../../src/lib/content/items.ts';
import { addWear, works } from '../../src/lib/shared/items/durability.ts';
import { held, workingGear } from '../../src/lib/shared/items/inventory.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import type { ItemStack } from '../../src/lib/shared/player/types.ts';
import { movementNoise, type Repel } from '../creatures.ts';
import { TICK_DT, type Player, type SessionContext, type SessionSystem } from './system.ts';

/**
 * Worn and held things that work by the second (docs/dev/items.md#gear): kneepads wear while
 * their wearer crawls, felt overshoes while they walk, and an incense censer while it is held,
 * keeping the creatures its smoke repels away and making a little noise as it swings. Breaking,
 * each stops working (and is heard breaking).
 */
export class GearSystem implements SessionSystem {
	/** Seconds since each censer-holder's censer was last heard. */
	private swung = new Map<string, number>();

	constructor(private ctx: SessionContext) {}

	step(): void {
		const ctx = this.ctx;
		const repels: Repel[] = [];
		for (const player of ctx.players.values()) {
			const s = player.state;
			if (s.dead || s.extracted) continue;
			const moving = movementNoise(s);
			for (const stack of workingGear(s.inventory)) {
				const def = ITEMS[stack.item];
				if (def?.durability?.per !== 'second') continue;
				const crawling = moving === 'crawl';
				const walking =
					moving === 'walk' || moving === 'sprint' || moving === 'crouch' || moving === 'creep';
				if ((def.crawl && crawling) || (def.steps && walking)) this.wear(player, stack);
			}
			// A censer in the hand: its smoke, its noise, and its burning down.
			const hand = held(s.inventory);
			const censer = hand && works(hand) ? ITEMS[hand.item]?.censer : undefined;
			if (!censer || !hand || s.downed) {
				this.swung.delete(player.id);
				continue;
			}
			const at: Vec3 = [...s.position];
			repels.push({ kinds: censer.repels, position: at, radius: censer.radius });
			const since = (this.swung.get(player.id) ?? Infinity) + TICK_DT;
			if (since >= CENSER_EVERY) {
				ctx.creatures.hear(at, censer.noise, { id: player.id, state: s });
				this.swung.set(player.id, 0);
			} else {
				this.swung.set(player.id, since);
			}
			this.wear(player, hand);
		}
		ctx.creatures.repels = repels;
	}

	/** A tick's wear; at the last of it, it breaks, heard. */
	private wear(player: Player, stack: ItemStack): void {
		if (addWear(stack, TICK_DT) !== 'broke') return;
		this.ctx.events.push({ kind: 'break', item: stack.item, position: [...player.state.position] });
	}

	regenerating(): void {
		this.swung.clear();
		this.ctx.creatures.repels = [];
	}
}

/** A censer swinging is heard this often (s). */
const CENSER_EVERY = 2;
