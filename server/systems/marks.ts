import { ITEMS } from '../../src/lib/content/items.ts';
import { MARKS } from '../../src/lib/content/marks.ts';
import { held, wearChalk } from '../../src/lib/shared/items/inventory.ts';
import { lookedAtMark } from '../../src/lib/shared/items/pickup.ts';
import { aimRay, reequip } from '../../src/lib/shared/items/weapons.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import { eyeHeight } from '../../src/lib/shared/player/simulate.ts';
import { Marks } from '../marks.ts';
import { TICK_DT, type Player, type SessionContext, type SessionSystem } from './system.ts';

/**
 * Chalk marks on the walls (docs/dev/marks.md): drawn with chalk in the hand, rubbed out by
 * holding interact on your own. Everyone is sent every mark whenever one changes.
 */
export class MarkSystem implements SessionSystem {
	readonly marks = new Marks();

	constructor(private ctx: SessionContext) {}

	/**
	 * Draw a chalk mark with the chalk in the hand, where the client says their view meets the
	 * stone. Refused unless they can use items and the place checks out (see Marks.check).
	 */
	draw(player: Player, symbol: unknown, position: unknown, normal: unknown): void {
		const ctx = this.ctx;
		const s = player.state;
		const stack = held(s.inventory);
		if (!stack || !ITEMS[stack.item]?.chalk || !ctx.canUseHands(player)) return;
		const { origin, direction } = aimRay(s, eyeHeight(s));
		const flat = Math.hypot(direction[0], direction[2]) || 1;
		const facing: Vec3 = [direction[0] / flat, 0, direction[2] / flat];
		const mark = this.marks.check(
			ctx.world,
			origin,
			facing,
			player.markWheel,
			symbol,
			position,
			normal
		);
		if (!mark) return;
		const added = this.marks.add({ ...mark, by: player.id, name: player.name });
		const inHand = held(s.inventory);
		wearChalk(s.inventory);
		if (held(s.inventory) !== inHand) reequip(s.weapon);
		ctx.events.push({ kind: 'mark', player: player.id, position: added.position });
		ctx.creatures.hear(added.position, MARKS.noise, player);
		this.changed();
	}

	/**
	 * Holding interact on your own mark (when no floor item or crate is what interact would take)
	 * rubs it out after MARKS.eraseSeconds.
	 */
	step(): void {
		const ctx = this.ctx;
		for (const player of ctx.players.values()) {
			const s = player.state;
			const { origin, direction } = aimRay(s, eyeHeight(s));
			const mark =
				ctx.canUseHands(player) &&
				player.lastInput?.interact &&
				!ctx.items.lookedAt(s, origin, direction) &&
				!ctx.crates.lookedAt(origin, direction)
					? lookedAtMark(ctx.world, origin, direction, this.marks.all(), (m) => m.by === player.id)
					: null;
			if (!mark) {
				s.erasing = 0;
				continue;
			}
			s.erasing += TICK_DT;
			if (s.erasing < MARKS.eraseSeconds) continue;
			s.erasing = 0;
			this.marks.remove(mark.id);
			ctx.events.push({ kind: 'rub', player: player.id, position: mark.position });
			this.changed();
		}
	}

	private changed(): void {
		this.ctx.broadcast({ type: 'marks', marks: this.marks.snapshot() });
	}

	joined(player: Player): void {
		this.ctx.send(player, { type: 'marks', marks: this.marks.snapshot() });
	}

	regenerated(): void {
		this.marks.clear();
		this.changed();
	}

	admin = {
		clearMarks: () => {
			this.marks.clear();
			this.changed();
		}
	} satisfies SessionSystem['admin'];
}
