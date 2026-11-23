/**
 * The quest engine's vocabulary (docs/dev/quests.md). Quests and NPCs are data
 * (src/lib/content/quests.ts, npcs.ts) written in these kinds; the engine (engine.ts) reads them.
 * A new quest is data only. A new kind is added here once, handled in the engine, and fed by the
 * game server, and every quest can use it from then on.
 */

/** A line of text someone says or writes. The id stays put, so a voice can be added later. */
export interface Line {
	id: string;
	text: string;
}

/** Something true or not of one explorer. */
export type Condition =
	/** A quest is done (reported to its NPC: objectives met, everything committed). */
	| { kind: 'done'; quest: string }
	/** A quest is open: offered, and not yet done. */
	| { kind: 'open'; quest: string }
	/** A flag is set on the explorer (`gloaming.level-3-open`). */
	| { kind: 'flag'; flag: string }
	/** An Affliction is resolved for the explorer. */
	| { kind: 'resolved'; affliction: string }
	/** All of these. */
	| { kind: 'all'; of: Condition[] }
	/** Any of these. */
	| { kind: 'any'; of: Condition[] }
	/** Not this. */
	| { kind: 'not'; of: Condition };

/** What a quest asks to be done below. Each counts up to `count` (1 when left out). */
export type Objective =
	/** Get out of an expedition into this Affliction alive. */
	| { kind: 'extract'; affliction: string; text: Line }
	/** Reach this level (1 is the top) of an expedition into this Affliction. */
	| { kind: 'reach'; affliction: string; level: number; text: Line }
	/** Search this many lootables for the first time (in this Affliction, or anywhere). */
	| { kind: 'loot'; affliction?: string; count: number; text: Line }
	/** Make this many of a recipe below, with the field kit. */
	| { kind: 'craft'; recipe: string; count: number; text: Line }
	/** Put down this many creatures of a kind (in this Affliction, or anywhere). */
	| { kind: 'kill'; creature: string; affliction?: string; count: number; text: Line }
	/** Do a room task (src/lib/content/tasks.ts): hold on its object until it's done. */
	| { kind: 'task'; task: string; text: Line }
	/** Resolve an Affliction's rite. */
	| { kind: 'resolve'; affliction: string; text: Line };

export type ObjectiveKind = Objective['kind'];

/** What a quest gives when it is done. */
export interface Reward {
	coins?: number;
	xp?: number;
	items?: { item: string; count: number }[];
}

export interface QuestDef {
	id: string;
	/** The NPC who gives it. */
	npc: string;
	title: string;
	/** What it teaches, for the list: Basics, Rummaging, Crafting, Combat... */
	teaches: string;
	/** It is offered once this holds (always, when left out). */
	requires?: Condition;
	/** What the NPC says when offering it. */
	offer: Line[];
	objectives: Objective[];
	/** What must be brought back and committed (from the stash) before it can be reported. */
	commit: { item: string; count: number }[];
	/** The casebook page it earns: what the NPC learned. Must stand on its own. */
	page: Line[];
	reward?: Reward;
	/** Recipes it teaches while open and after (field recipes kept out of the Library). */
	teachesRecipes?: string[];
	/** Flags set on the explorer when it is done. */
	sets?: string[];
}

export interface NpcSale {
	item: string;
	price: number;
	/** Only sold once this holds. */
	when?: Condition;
}

export interface NpcDef {
	id: string;
	name: string;
	/** A line under the name: who they are. */
	role: string;
	/** Picture in static/assets/ui/images (no extension). */
	portrait: string;
	/** What they say when you come by. */
	greeting: Line[];
	/** Their quests, in the order listed. */
	quests: string[];
	sells: NpcSale[];
}

/** One quest's progress for one explorer. */
export interface QuestProgress {
	/** Per objective, how far it has got (capped at the objective's count). */
	counts: number[];
	/** Committed so far, by item. */
	committed: Record<string, number>;
	/** When it was reported done (ms since the epoch); left out while open. */
	done?: number;
}

/** Everything one explorer has to do with quests. Kept on the explorer. */
export interface QuestRecord {
	quests: Record<string, QuestProgress>;
	flags: string[];
}

/** An event from below that can move quests on, as the game server reports it. */
export type QuestEvent =
	| { kind: 'extract'; affliction: string }
	| { kind: 'reach'; affliction: string; level: number }
	| { kind: 'loot'; affliction: string }
	| { kind: 'craft'; recipe: string }
	| { kind: 'kill'; creature: string; affliction: string }
	| { kind: 'task'; task: string }
	| { kind: 'resolve'; affliction: string }
	/** A flag set by something done below (the barred stair blown open). */
	| { kind: 'flag'; flag: string };

/** How a quest stands, for showing it. Locked quests are never shown. */
export type QuestStatus = 'open' | 'ready' | 'done';

/** A quest as the HUD shows it: short, with each objective's progress. */
export interface QuestBrief {
	id: string;
	title: string;
	status: QuestStatus;
	objectives: { text: string; count: number; of: number }[];
	/** What is still to bring back: item and how many. */
	bring: { item: string; count: number }[];
}
