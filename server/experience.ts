import { CREATURES } from '../src/lib/content/creatures.ts';
import { XP } from '../src/lib/content/progression.ts';
import type { Recipe } from '../src/lib/content/recipes.ts';
import { lootableOf } from '../src/lib/shared/items/lootables.ts';
import type { GameEvent } from '../src/lib/shared/items/types.ts';
import type { Progression } from '../src/lib/shared/progression/progression.ts';
import type { RunOutcome } from '../src/lib/server/store/runs.ts';
import type { Crate } from './crates.ts';
import type { Player, SessionContext } from './systems/system.ts';

/**
 * Experience earned down there (docs/dev/progression.md#earning): looting, crafting, killing,
 * hints and the rite, and getting out. Each award goes to the player at once (`experience`,
 * shown under the clock) and is kept when the run ends, however it ends.
 */

export type XpSource =
	'loot' | 'discovery' | 'craft' | 'kill' | 'banish' | 'clue' | 'rite' | 'extract';

/** One player's experience this run. */
export interface PlayerExperience {
	/** Experience they had coming down. */
	before: number;
	earned: number;
	bySource: Partial<Record<XpSource, number>>;
	/** Firsts paid, ever: what they came down with and what they have added. */
	firsts: Set<string>;
	/** Firsts paid this run, to keep. */
	added: string[];
	/** How often each recipe was made below this run. */
	crafted: Map<string, number>;
	/** Earned and not yet told (sent once a tick). */
	pending: number;
	/** The run's end was paid (`finish`). */
	finished: boolean;
}

export function playerExperience(progression: Progression | null | undefined): PlayerExperience {
	return {
		before: progression?.xp ?? 0,
		earned: 0,
		bySource: {},
		firsts: new Set(progression?.firsts ?? []),
		added: [],
		crafted: new Map(),
		pending: 0,
		finished: false
	};
}

export class Experience {
	constructor(private ctx: SessionContext) {}

	/** A training ground (Rumors) pays its firsts and nothing else, so the safe map can't be farmed. */
	private get training(): boolean {
		return !!this.ctx.affliction.def.training;
	}

	/**
	 * Pay `amount` for something, and `bonus` on top if `first` (a key, see `Progression.firsts`)
	 * hasn't been paid to them before.
	 */
	award(player: Player, source: XpSource, amount: number, first?: string, bonus = 0): number {
		const e = player.experience;
		let total = this.training ? 0 : Math.max(0, Math.round(amount));
		if (first && !e.firsts.has(first)) {
			e.firsts.add(first);
			e.added.push(first);
			total += bonus;
		}
		if (total <= 0) return 0;
		e.earned += total;
		e.bySource[source] = (e.bySource[source] ?? 0) + total;
		e.pending += total;
		return total;
	}

	/** This tick's events not yet counted: lootables opened, kills, hints, the rite, a banishing. */
	count(events: GameEvent[]): void {
		const ctx = this.ctx;
		for (const event of events) {
			if (event.kind === 'crateOpen') {
				const player = ctx.players.get(event.player);
				const crate = ctx.crates.get(event.id);
				if (player && crate) this.looted(player, crate);
			} else if (event.kind === 'creatureDie') {
				this.killed(event.id, event.by, event.position);
			} else if (event.kind === 'clue') {
				const hint = `hint:${ctx.affliction.def.id}:${ctx.rite.clues}`;
				// Everyone on the expedition learns it; it pays the first time each explorer does.
				for (const player of ctx.players.values()) this.award(player, 'clue', 0, hint, XP.clue);
			} else if (event.kind === 'rite') {
				for (const player of this.present()) {
					this.award(player, 'rite', XP.rite, `rite:${ctx.affliction.def.id}`, XP.firstRite);
				}
			} else if (event.kind === 'resolved') {
				for (const player of this.present()) this.award(player, 'banish', XP.banish);
			}
		}
	}

	/** Down here and still in it: not dead, not out. */
	private present(): Player[] {
		return [...this.ctx.players.values()].filter((p) => !p.state.dead && !p.state.extracted);
	}

	/**
	 * The first to open a lootable: `XP.lootable`, whatever it is. A training ground pays only
	 * firsts, so there it is the first of each kind, ever.
	 */
	private looted(player: Player, crate: Crate): void {
		const def = lootableOf(crate);
		if (def.dropped) return;
		this.award(player, 'loot', XP.lootable, `loot:${def.id}`, this.training ? XP.lootable : 0);
	}

	/** To the killer; teammates near get a share (a first kill pays only the killer its bonus). */
	private killed(id: string, by: string | null, position: readonly number[]): void {
		const ctx = this.ctx;
		const kind = ctx.creatures.kindOf(id);
		const def = kind ? CREATURES[kind] : undefined;
		const killer = by ? ctx.players.get(by) : undefined;
		if (!def || !killer) return;
		this.award(killer, 'kill', def.xp, `kill:${def.id}`, XP.firstKill);
		if (def.xp <= 0) return;
		const range2 = XP.shareRange * XP.shareRange;
		for (const other of this.present()) {
			if (other === killer) continue;
			const [x, , z] = other.state.position;
			const d2 = (x - position[0]) ** 2 + (z - position[2]) ** 2;
			if (d2 <= range2) this.award(other, 'kill', def.xp * XP.killShare);
		}
	}

	/** Something seen for the first time (as discovery works). */
	discovered(player: Player, item: string): void {
		this.award(player, 'discovery', 0, `item:${item}`, XP.discovery);
	}

	/** Made below: the same recipe more than `XP.recipeRepeats` times a run pays nothing. */
	crafted(player: Player, recipe: Recipe): void {
		const made = (player.experience.crafted.get(recipe.id) ?? 0) + 1;
		player.experience.crafted.set(recipe.id, made);
		const amount = made <= XP.recipeRepeats ? recipe.xp : 0;
		this.award(player, 'craft', amount, `recipe:${recipe.id}`, XP.firstRecipe);
	}

	/** The run is over for them: getting out (or not) pays by how deep they got. Once. */
	finish(player: Player, outcome: RunOutcome): void {
		const e = player.experience;
		if (e.finished) return;
		e.finished = true;
		const level = Math.min(player.deepestLevel, XP.extract.length - 1);
		const full = XP.extract[level];
		if (outcome === 'extracted') {
			this.award(player, 'extract', full, `extract:${level + 1}`, XP.firstExtract);
		} else if (outcome === 'died' || outcome === 'lost') {
			this.award(player, 'extract', full * XP.died);
		}
	}

	/** Tell each player what they earned this tick, in one message. */
	flush(): void {
		for (const player of this.ctx.players.values()) this.tell(player);
	}

	tell(player: Player): void {
		const e = player.experience;
		if (e.pending <= 0) return;
		this.ctx.send(player, { type: 'experience', amount: e.pending });
		e.pending = 0;
	}
}
