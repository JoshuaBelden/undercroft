import type { AnimationMap, UpperMap } from '../animations.ts';
import { modelUrl } from '../models.ts';

/**
 * The explorer: the body every player is drawn with. See docs/dev/player.md (Player model).
 */
export interface PlayerModelDef {
	model: string;
	/** Model faces +Z in its file; the game faces -Z at yaw 0, so it's turned by this much. */
	yawOffset: number;
	/** The model's animation map: its clip names by standard slot. */
	animations: AnimationMap;
	/** Upper-body clips (holding, firing, reloading, using), played over the legs' clip. */
	upper: UpperMap;
	/** The bone the held item hangs from (three.js drops the ':' from Mixamo's names). */
	hand: string;
	/**
	 * How far in front of the eye point (m) the headlamp sits when the body is drawn. The model's
	 * head is ahead of the eye point and leans further when it runs; a lamp left at the eye point
	 * would be behind the head and light the back of it.
	 */
	lampForward: number;
}

export const PLAYER_MODEL: PlayerModelDef = {
	model: modelUrl('shared/player/explorer.glb'),
	yawOffset: Math.PI,
	lampForward: 0.45,
	// The model has no idle, jump, ledge-climb or dodge clip (holding and using items is in
	// `upper`). Every clip in the file is used.
	animations: {
		// No idle clip yet: the walk's first frame (feet passing, nearly upright), held.
		idle: { clip: 'Walking', speed: 0 },
		walking: { clip: 'Walking' },
		running: { clip: 'Running' },
		crouch: { clip: 'Cautious_Crouch_Walk_Forward' },
		// The clip stops to look back after two seconds; loop only the crawl before it.
		crawl: { clip: 'Crawl_and_Look_Back', end: 2.1 },
		// On a rope: hanging still, and climbing (played backwards to climb down).
		rope_idle: { clip: 'Rope_Hang_Idle' },
		rope_climb: { clip: 'Climb_Up_Rope' },
		// Letting go of a rope, falling, and the landing that hurts.
		fall: { clip: 'Climb_Attempt_and_Fall_5' },
		// Stretched to the held weapon's swing.
		melee_attack: { clip: 'Heavy_Hammer_Swing' },
		// Struck (see PlayerBody's flinch): only the punch landing and the twist away from it. The
		// clip squares up in a guard first, and doubles over and recovers after.
		take_damage: { clip: 'Face_Punch_Reaction_1', start: 2.1, end: 2.5 },
		die: { clip: 'Shot_and_Slow_Fall_Backward', speed: 1.5 }
	},
	// Hand-keyed in art/blender/Explorer.blend (scripts/blender/explorer.py). Reloading is stretched
	// to the gun's reload time; the rest play at their own pace.
	upper: {
		hold_one_hand: { clip: 'Hold_One_Hand' },
		hold_two_hand: { clip: 'Hold_Two_Hand' },
		hold_item: { clip: 'Hold_Item' },
		fire_one_hand: { clip: 'Fire_One_Hand' },
		fire_two_hand: { clip: 'Fire_Two_Hand' },
		reload: { clip: 'Reload' },
		use_bandage: { clip: 'Use_Bandage' },
		use_battery: { clip: 'Use_Battery' }
	},
	hand: 'mixamorigRightHand'
};

/** Over-the-shoulder camera: where it sits from the eye, in the look frame (m). */
export const SHOULDER_CAMERA = {
	right: 0.3,
	up: 0.1,
	back: 0.55,
	/** Kept this far off whatever is behind the player. */
	margin: 0.15,
	/** Squeezed closer to the head than this, the body is not drawn (no view from inside it). */
	hideWithin: 0.3
};
