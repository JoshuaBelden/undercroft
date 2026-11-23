import { QUESTS } from '../../src/lib/content/quests.ts';
import type { GameEvent } from '../../src/lib/shared/items/types.ts';
import {
	advance,
	briefs,
	learnedRecipes,
	objectiveCount,
	openQuests,
	openTasks,
	type QuestContext
} from '../../src/lib/shared/quests/engine.ts';
import type { QuestEvent, QuestRecord } from '../../src/lib/shared/quests/types.ts';
import type { Player, SessionContext, SessionSystem } from './system.ts';

/**
 * Quests below (docs/dev/quests.md): what players do down here moves their quests on. Objectives
 * are shared: a search, a kill, a craft or a room task counts for everyone still down here. Only
 * getting out is each player's own. Each change is kept at once (`SessionHooks.onQuests`), so a
 * task done stays done even if its doer dies after; what is to be committed must still be
 * carried out. Each player is told their own quests (`quests` message) when they change.
 */

/** A player's quests while they are down here. */
export interface PlayerQuests {
	record: QuestRecord;
	/** Afflictions they had resolved when they came down. */
	resolved: string[];
}

export class QuestSystem implements SessionSystem {
	/** Each player's quests (explorers whose quests aren't kept here, co-op guests, have none). */
	private records = new Map<string, PlayerQuests>();
	/** The deepest level each player was last counted at, so reaching one counts once. */
	private reached = new Map<string, number>();

	constructor(private ctx: SessionContext) {}

	/** Before they come down: this player's quests, as kept on the surface. */
	set(player: Player, quests: PlayerQuests | null): void {
		if (quests) this.records.set(player.id, structuredClone(quests));
		else this.records.delete(player.id);
		this.tell(player);
	}

	of(player: Player): PlayerQuests | undefined {
		return this.records.get(player.id);
	}

	context(player: Player): QuestContext {
		const resolved = this.records.get(player.id)?.resolved ?? [];
		return { resolved: (affliction) => resolved.includes(affliction) };
	}

	/** Recipes quests have taught them (the quarryman's charge). */
	learned(player: Player): string[] {
		const quests = this.records.get(player.id);
		return quests ? learnedRecipes(quests.record, this.context(player)) : [];
	}

	/** Room tasks someone down here still needs done. */
	openTasks(): Set<string> {
		const tasks = new Set<string>();
		for (const player of this.present()) {
			const quests = this.records.get(player.id);
			if (quests) for (const t of openTasks(quests.record, this.context(player))) tasks.add(t);
		}
		return tasks;
	}

	/** Whether anyone down here has a flag (`gloaming.level-3-open`). */
	anyoneHas(flag: string): boolean {
		return this.present().some((p) => this.records.get(p.id)?.record.flags.includes(flag));
	}

	hasFlag(player: Player, flag: string): boolean {
		return this.records.get(player.id)?.record.flags.includes(flag) ?? false;
	}

	joined(player: Player): void {
		this.tell(player);
	}

	left(player: Player): void {
		if (player.state.extracted)
			this.happened({ kind: 'extract', affliction: this.affliction }, player);
		this.records.delete(player.id);
		this.reached.delete(player.id);
	}

	/** This tick's events (from the session's tally): searches and kills. */
	count(events: GameEvent[]): void {
		const affliction = this.affliction;
		for (const event of events) {
			if (event.kind === 'crateOpen') this.happened({ kind: 'loot', affliction });
			else if (event.kind === 'creatureDie') {
				const creature = this.ctx.creatures.kindOf(event.id);
				if (creature) this.happened({ kind: 'kill', creature, affliction });
			}
		}
		for (const player of this.present()) {
			const level = player.deepestLevel + 1;
			if ((this.reached.get(player.id) ?? 0) >= level) continue;
			this.reached.set(player.id, level);
			this.happened({ kind: 'reach', affliction, level });
		}
	}

	/**
	 * Something that moves quests on. `only`: it counts for that player alone (getting out);
	 * otherwise for everyone still down here.
	 */
	happened(event: QuestEvent, only?: Player): void {
		for (const player of only ? [only] : this.present()) {
			const quests = this.records.get(player.id);
			if (!quests) continue;
			const next = advance(quests.record, event, this.context(player));
			if (!next) continue;
			quests.record = next;
			this.ctx.hooks.onQuests?.(player.owner, next);
			this.tell(player);
		}
	}

	/** Their open quests in short form, and what they have been taught, for the HUD. */
	private tell(player: Player): void {
		const quests = this.records.get(player.id);
		if (!quests || !this.ctx.players.has(player.id)) return;
		this.ctx.send(player, {
			type: 'quests',
			quests: briefs(quests.record, this.context(player)),
			learned: this.learned(player)
		});
	}

	private get affliction(): string {
		return this.ctx.affliction.def.id;
	}

	private present(): Player[] {
		return [...this.ctx.players.values()].filter((p) => !p.state.dead && !p.state.extracted);
	}

	admin = {
		/** Finish every objective of an open quest (or the first open one). */
		questObjectives: (player: Player, command: { quest?: string }) => {
			const quests = this.records.get(player.id);
			const def = command.quest ? QUESTS[command.quest] : undefined;
			if (!quests || (command.quest && !def)) return false;
			const defs = def ? [def] : openQuests(quests.record, this.context(player));
			for (const q of defs) {
				const progress = quests.record.quests[q.id] ?? { counts: [], committed: {} };
				if (progress.done !== undefined) continue;
				quests.record = {
					...quests.record,
					quests: {
						...quests.record.quests,
						[q.id]: { ...progress, counts: q.objectives.map(objectiveCount) }
					}
				};
			}
			this.ctx.hooks.onQuests?.(player.owner, quests.record);
			this.tell(player);
		},
		/** Set a flag on every player down here (`gloaming.level-3-open`). */
		questFlag: (_player: Player, command: { flag: string }) => {
			if (typeof command.flag !== 'string' || !command.flag) return false;
			this.happened({ kind: 'flag', flag: command.flag });
		}
	} satisfies SessionSystem['admin'];
}
