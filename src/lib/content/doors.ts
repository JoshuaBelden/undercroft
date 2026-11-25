import { modelUrl } from './models.ts';

/**
 * The double doors: one at the top of every long stair (`stairs-deep`), just behind the
 * extraction room's gate, and the one way into the final room (`gloaming-chapel`). Shut and barred until someone holds interact on it; then it
 * swings open for everyone and stays open. Until then it is solid, and creatures can't path
 * through it either. See docs/dev/map-generation.md#doors.
 */
export const DOORS = {
	/** Its collision box: across, high, deep (m). Fills the gate up to its springline. */
	size: [3.2, 2.2, 0.2] as [number, number, number],
	/** Seconds interact is held to lift the bar and push it open. */
	openSeconds: 1.5,
	/** How far away (m, from the eyes) it can be opened. */
	reach: 2.4,
	/** Radius (m) the bar dropping and the hinges groaning can be heard. */
	noise: 14,
	/** How far each leaf swings (radians) and how long it takes (s). */
	swing: Math.PI * 0.47,
	swingSeconds: 1.6
};

/** A kind of door a door marker can name (`type = "<id>"`): its model, its size, how it opens. */
export interface DoorType {
	/** The prop the game stands in the doorway (built by scripts/blender/map/doors.py). */
	model: string;
	/** Its collision box while shut: across, high, deep (m). The doorway it fits. */
	size: [number, number, number];
	/** A bar across it the game lifts off before the leaves move (`door-bar` in the model). */
	barred: boolean;
}

/**
 * The kinds of door (docs/dev/fixed-map.md#doors). A door marker with no `type` is the double door
 * (`double`), fitted to its doorway by its `width` and `height`. Each model has its leaves as
 * `door-leaf-l` (hinged at -X) and `door-leaf-r` (at +X), swinging away from the room side.
 */
export const DOOR_TYPES = {
	/** Two painted, iron-strapped leaves and a bar across them (the long stair's, the chapel's). */
	double: { model: modelUrl('shared/props/door-double.glb'), size: DOORS.size, barred: true },
	/** A plank door in a timber frame, hung on its left, an iron thumb latch on the room side. */
	'simple-wood-door': {
		model: modelUrl('shared/props/door-simple-wood.glb'),
		size: [1.2, 2.2, 0.2],
		barred: false
	}
} satisfies Record<string, DoorType>;

export type DoorTypeId = keyof typeof DOOR_TYPES;

/**
 * Locked iron gates (gate-* markers: the Family Mausoleum's). A door that a key opens (carried,
 * used up: one is hidden in the map for every gate, as for every locked trunk), or lockpicks in the
 * hand, quietly, each lock a chance to snap one. See docs/dev/world.md#gates.
 */
export const GATES = {
	/** Its collision box: across, high, deep (m). */
	size: [2.0, 2.5, 0.12] as [number, number, number],
	/** Seconds interact is held with a key, or with lockpicks in the hand. */
	keySeconds: 1.5,
	picksSeconds: 6,
	/** Chance a pick snaps (one is used up) on each lock picked. */
	snap: 0.25,
	/** Radius (m) the gate swinging open is heard; picking it is silent. */
	noise: 8
};
