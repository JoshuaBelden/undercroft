import { achievementsForRite } from '../../src/lib/content/achievements.ts';
import { removeItem } from '../../src/lib/shared/items/inventory.ts';
import { test } from '../../src/lib/shared/quests/engine.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import { log } from '../log.ts';
import { TICK_DT, type Player, type SessionContext, type SessionSystem } from './system.ts';

/**
 * The rite (docs/dev/rite.md): hints read where they lie, and the rite itself. Whoever carries
 * everything it needs, in its room, holds interact; when it is done it summons the manifestation
 * there (AfflictionSystem.summon). A rite with `begin` (docs/dev/quests.md#the-rite) can only be
 * begun by those it holds for; one with `laid` is resolved by laying what the manifestation left
 * where the rite was performed, and only for those who could have begun it.
 */
export class RiteSystem implements SessionSystem {
	/** Hints known when an admin replaced the map, to know again in the new one. */
	private kept = 0;

	constructor(private ctx: SessionContext) {}

	step(): void {
		const ctx = this.ctx;
		const seconds = ctx.affliction.def.rite.seconds;
		for (const player of ctx.players.values()) {
			const s = player.state;
			const able = !s.downed && !s.dead && !s.extracted && !!player.lastInput?.interact;
			const laying = able && ctx.rite.canLay(s);
			if (!laying && (!able || !ctx.rite.canPerform(s) || !this.mayBegin(player))) {
				s.performing = 0;
				continue;
			}
			s.performing += TICK_DT;
			if (laying) {
				const laid = ctx.affliction.def.rite.laid!;
				if (s.performing < laid.seconds) continue;
				s.performing = 0;
				removeItem(s.inventory, laid.item, 1);
				log.info(`${player.name} laid ${laid.item} to rest in ${ctx.id.slice(0, 8)}`);
				ctx.systems.affliction.resolve(this.eligible());
				continue;
			}
			if (s.performing < seconds || ctx.rite.performed) continue;
			s.performing = 0;
			ctx.rite.take(s);
			ctx.rite.performed = true;
			ctx.events.push({ kind: 'rite', player: player.id, position: [...s.position] });
			ctx.awardEveryoneDown(achievementsForRite());
			log.info(`${player.name} performed the rite in ${ctx.id.slice(0, 8)}`);
			ctx.systems.affliction.summon(s.position);
		}
	}

	/** Whether this player may begin the rite (RiteSpec.begin, from their quests). */
	mayBegin(player: Player): boolean {
		const begin = this.ctx.affliction.def.rite.begin;
		if (!begin) return true;
		const quests = this.ctx.systems.quests.of(player);
		return !!quests && test(begin, quests.record, this.ctx.systems.quests.context(player));
	}

	/** Those down here who may begin it: who it is resolved for. */
	eligible(): Player[] {
		return [...this.ctx.players.values()].filter(
			(p) => !p.state.dead && !p.state.extracted && this.mayBegin(p)
		);
	}

	/**
	 * A hint was read (on a wall, on furniture, in a crate): the next hint is learned, whichever
	 * copy it was. Returns false if there was nothing left to learn (the copy is left alone).
	 */
	readClue(player: Player, position: Vec3): boolean {
		const ctx = this.ctx;
		const found = ctx.rite.find();
		if (!found) return false;
		if (ctx.rite.complete) this.clearHints();
		ctx.events.push({ kind: 'clue', player: player.id, position: [...position], ...found });
		ctx.hooks.onClues?.(ctx.rite.clues);
		log.info(`${player.name} found a hint (${ctx.rite.clues}) in ${ctx.id.slice(0, 8)}`);
		return true;
	}

	/** Start from this many hints (found on earlier runs). */
	reveal(clues: number): void {
		this.ctx.rite.reveal(clues);
		if (this.ctx.rite.complete) this.clearHints();
	}

	/** Every hint is known: the copies left in the map are taken away. */
	private clearHints(): void {
		this.ctx.items.removeAll('clue');
		this.ctx.crates.removeItem('clue');
	}

	regenerating(): void {
		this.kept = this.ctx.rite.clues;
	}

	regenerated(): void {
		this.reveal(this.kept);
	}

	admin = {
		revealClues: () => {
			this.reveal(Infinity);
			this.ctx.hooks.onClues?.(this.ctx.rite.clues);
		},
		resetRite: () => {
			this.ctx.rite.reset();
			this.ctx.doors.release();
			this.ctx.hooks.onRiteReset?.();
		}
	} satisfies SessionSystem['admin'];
}
