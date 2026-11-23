/**
 * Room tasks (docs/dev/quests.md#room-tasks): something in a named room a quest needs done. Hold
 * interact on its object for `seconds`; the whole time it is loud, heard `noise` away every
 * `every` seconds, so creatures come. When done, what it `yields` lies in front of it. A task's
 * object is only there while someone in the party has a quest open that needs it, and the map
 * always has its room then.
 */
import type { SoundId } from './audio/sounds.ts';

export interface TaskDef {
	id: string;
	/** The room (a MAP_KIT entry id) it is in. */
	room: string;
	/** The `spot-<name>` marker in that room's piece its object stands at (the room's middle, without). */
	spot: string;
	/** What the prompt says: "Hold E to <verb>". */
	verb: string;
	seconds: number;
	/** Heard this far away... */
	noise: number;
	/** ...every this many seconds while it is worked. */
	every: number;
	/** Looped while it is worked. */
	sound: SoundId;
	/** What it leaves in front of it when done, for the doer to carry out. */
	yields?: { item: string; count: number };
	/** How its object looks until it has a model: a box of this size (m) and colour. */
	placeholder: { size: [number, number, number]; color: number };
}

export const TASKS: Record<string, TaskDef> = {
	'oath-rubbing': {
		id: 'oath-rubbing',
		room: 'ossuary-hall',
		spot: 'oath',
		verb: 'take a rubbing of the oath',
		seconds: 10,
		noise: 10,
		every: 2,
		sound: 'task.scrape',
		yields: { item: 'oath-rubbing', count: 1 },
		placeholder: { size: [1.2, 0.8, 0.1], color: 0xc9bfa6 }
	},
	'carters-bell': {
		id: 'carters-bell',
		room: 'quarry-gallery',
		spot: 'bell',
		verb: "ring the carters' bell",
		seconds: 12,
		noise: 30,
		every: 3,
		sound: 'task.bell',
		placeholder: { size: [0.6, 0.7, 0.6], color: 0x6b5a3a }
	},
	'cistern-winch': {
		id: 'cistern-winch',
		room: 'cistern',
		spot: 'winch',
		verb: 'haul up the strongbox',
		seconds: 15,
		noise: 16,
		every: 2.5,
		sound: 'task.winch',
		yields: { item: 'carters-ledger', count: 1 },
		placeholder: { size: [1, 1.1, 0.8], color: 0x4a3a2a }
	},
	'bricked-niche': {
		id: 'bricked-niche',
		room: 'saints-crypt',
		spot: 'niche',
		verb: 'break open the bricked niche',
		seconds: 12,
		noise: 20,
		every: 2,
		sound: 'task.hammer',
		yields: { item: 'hand-of-glory', count: 1 },
		placeholder: { size: [1, 1.4, 0.3], color: 0x8a5a40 }
	}
};
