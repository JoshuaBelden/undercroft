/**
 * Room tasks (docs/dev/quests.md#room-tasks): something in a named room a quest needs done. Hold
 * interact on its object for `seconds`; the whole time it is loud, heard `noise` away every
 * `every` seconds, so creatures come. When done, what it `yields` lies in front of it. A task's
 * object is only there while someone in the party has a quest open that needs it, and the map
 * always has its room then.
 */
import type { SoundId } from './audio/sounds.ts';
import { modelUrl } from './models.ts';

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
	/**
	 * Its object's size (m: across, high, deep), standing at the spot: where it is looked at (its
	 * middle) and, without a model, the box drawn in its `color`.
	 */
	size: [number, number, number];
	color: number;
	/**
	 * Its object (`shared/props`, front to the room), and `done`, what stands there once it's
	 * done (without one it stays as it is). `lift` raises it off the floor (a bell hung on the
	 * wall); `back` moves it that far toward the wall, or out into the room if negative, to sit
	 * against it.
	 */
	model?: { url: string; done?: string; lift?: number; back?: number };
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
		// The tablet at eye height, on the wall of bone.
		size: [1, 1, 0.05],
		color: 0xc9bfa6,
		model: { url: modelUrl('shared/props/oath_carving.glb'), lift: 0.6, back: 0.12 }
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
		// Hung from a beam run out from the wall, its top 2 m up.
		size: [0.5, 1, 0.66],
		color: 0x6b5a3a,
		model: { url: modelUrl('shared/props/carters_bell.glb'), lift: 1, back: 0.05 }
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
		size: [0.95, 0.7, 0.91],
		color: 0x4a3a2a,
		model: { url: modelUrl('shared/props/cistern_winch.glb'), back: -0.06 }
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
		size: [1.04, 1.4, 0.43],
		color: 0x8a5a40,
		model: {
			url: modelUrl('shared/props/bricked-niche.glb'),
			done: modelUrl('shared/props/bricked-niche-open.glb'),
			back: -0.07
		}
	}
};
