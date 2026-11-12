import type { AnimationMap } from '../animations.ts';

/**
 * The explorer: the body every player is drawn with. See docs/dev/player.md (Player model).
 */
export interface PlayerModelDef {
	model: string;
	/** Model faces +Z in its file; the game faces -Z at yaw 0, so it's turned by this much. */
	yawOffset: number;
	/** The model's animation map: its clip names by standard slot. */
	animations: AnimationMap;
	/**
	 * How far in front of the eye point (m) the headlamp sits when the body is drawn. The model's
	 * head is ahead of the eye point and leans further when it runs; a lamp left at the eye point
	 * would be behind the head and light the back of it.
	 */
	lampForward: number;
}

export const PLAYER_MODEL: PlayerModelDef = {
	model: '/assets/player/explorer.glb',
	yawOffset: Math.PI,
	lampForward: 0.45,
	// The model has no idle, jump, climb or gun clip. Also in the file and unused:
	// 'Gun_Hold_Left_Turn', 'Left_Jab_from_Guard' and 'Cautious_Crouch_Walk_Right_inplace'.
	animations: {
		// No idle clip yet: the walk's first frame (feet passing, nearly upright), held.
		idle: { clip: 'Walking', speed: 0 },
		walking: { clip: 'Walking' },
		running: { clip: 'Running' },
		crouch: { clip: 'Cautious_Crouch_Walk_Forward' },
		// The clip stops to look back after two seconds; loop only the crawl before it.
		crawl: { clip: 'Crawl_and_Look_Back', end: 2.1 },
		// Stretched to the held weapon's swing.
		melee_attack: { clip: 'Heavy_Hammer_Swing' },
		// Nothing plays these two yet.
		dodge: { clip: 'Block5' },
		take_damage: { clip: 'Face_Punch_Reaction_1' },
		die: { clip: 'Shot_and_Slow_Fall_Backward', speed: 1.5 }
	}
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
