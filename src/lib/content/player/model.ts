import type { AnimationMap, UpperMap } from '../animations.ts';
import { modelUrl, type ModelPath } from '../models.ts';
import { BODIES, WEAR, type BodyId, type WearId } from './wardrobe.ts';

/**
 * The explorer: the body every player is drawn with. See docs/dev/player.md (Player model).
 */
export interface PlayerModelDef {
	/** The skeleton's root bone: the clips' horizontal motion on it is removed. */
	root: string;
	/** Model faces +Z in its file; the game faces -Z at yaw 0, so it's turned by this much. */
	yawOffset: number;
	/** The model's animation map: its clip names by standard slot. */
	animations: AnimationMap;
	/** Upper-body clips (holding, firing, reloading, using), played over the legs' clip. */
	upper: UpperMap;
	/** The bone the held item hangs from (three.js drops the ':' from Mixamo's names). */
	hand: string;
	/** The bones that turn to look where the player looks, the neck taking a share of it. */
	head: string;
	neck: string;
	/**
	 * How far in front of the eye point (m) the headlamp sits when the body is drawn. The model's
	 * head is ahead of the eye point and leans further when it runs; a lamp left at the eye point
	 * would be behind the head and light the back of it.
	 */
	lampForward: number;
}

export const PLAYER_MODEL: PlayerModelDef = {
	root: 'mixamorigHips',
	yawOffset: Math.PI,
	lampForward: 0.45,
	// The model has no idle, jump, ledge-climb or dodge clip (holding and using items is in
	// `upper`). Every clip in the file is used.
	animations: {
		// No idle clip yet: the walk's first frame (feet passing, nearly upright), held.
		idle: { clip: 'Walking', speed: 0 },
		// Shifting about, looking round (Mixamo's Bored, art/export/player/animations): the Expedition
		// page's lineup, which picks from WAITING_CLIPS instead.
		waiting: { clip: 'Bored' },
		walking: { clip: 'Walking' },
		running: { clip: 'Running' },
		crouch: { clip: 'Cautious_Crouch_Walk_Forward' },
		// The clip stops to look back after two seconds; loop only the crawl before it. No two
		// frames of it match, so the loop is cut where they come closest (scripts/anim-loop.ts)
		// and blended round.
		crawl: { clip: 'Crawl_and_Look_Back', start: 0.367, end: 2.033, loopBlend: 0.35 },
		// On a rope: hanging still, and climbing (played backwards to climb down).
		rope_idle: { clip: 'Rope_Hang_Idle' },
		rope_climb: { clip: 'Climb_Up_Rope' },
		// Letting go of a rope, falling, and the landing that hurts.
		fall: { clip: 'Climb_Attempt_and_Fall_5' },
		// Stretched to the held weapon's swing.
		melee_attack: { clip: 'Heavy_Hammer_Swing' },
		// Down on the right knee, working at a medkit on the floor in front (hand-keyed, like `upper`).
		kneel: { clip: 'Kneel_Medkit' },
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
	hand: 'mixamorigRightHand',
	head: 'mixamorigHead',
	neck: 'mixamorigNeck'
};

/**
 * The built files of a body (scripts/blender/wardrobe.py, built by `pnpm asset:build`): its mesh,
 * its clips (the explorer's, retargeted onto its skeleton) and each wardrobe piece fitted to it.
 * Every combination is checked to exist by model.test.ts.
 */
export function bodyPaths(body: BodyId): { body: ModelPath; anims: ModelPath } {
	return {
		body: `shared/player/${body}/body.glb` as ModelPath,
		anims: `shared/player/${body}/anims.glb` as ModelPath
	};
}

export function wearPath(body: BodyId, wear: WearId): ModelPath {
	return `shared/player/${body}/${wear}.glb` as ModelPath;
}

export function bodyFiles(body: BodyId): { body: string; anims: string } {
	const paths = bodyPaths(body);
	return { body: modelUrl(paths.body), anims: modelUrl(paths.anims) };
}

export function wearFile(body: BodyId, wear: WearId): string {
	return modelUrl(wearPath(body, wear));
}

/** Every file any explorer can be drawn with: each body's mesh and pieces, and its clips. */
export function explorerFiles(): { models: string[]; clips: string[] } {
	const bodies = Object.keys(BODIES) as BodyId[];
	return {
		models: bodies.flatMap((b) => [
			bodyFiles(b).body,
			...(Object.keys(WEAR) as WearId[]).map((w) => wearFile(b, w))
		]),
		clips: bodies.map((b) => bodyFiles(b).anims)
	};
}

/**
 * What explorers do standing about on the Expedition page: each plays one, picked at random
 * (Mixamo clips in art/export/player/animations; see docs/dev/asset-pipeline.md#the-explorer).
 */
export const WAITING_CLIPS = ['Bored', 'Arm_Stretching', 'Pointing', 'Warrior_Idle'];

/** Over-the-shoulder camera: where it sits from the eye, in the look frame (m). */
export const SHOULDER_CAMERA = {
	right: 0.45,
	up: 0.1,
	back: 0.55,
	/**
	 * Crouched and crawling, where it sits instead: the body is lower and leans into the view, so
	 * further aside, and forward over it (crawling, the body lies out behind the eye, and the
	 * camera rides over the shoulders). Crawling, kept low, under a crawlspace's roof.
	 */
	crouch: { right: 0.65, up: 0.15, back: 0.5 },
	crawl: { right: 0.6, up: 0.2, back: 0.15 },
	/** Kept this far off whatever is behind the player. */
	margin: 0.15,
	/** Squeezed closer to the head than this, the body is not drawn (no view from inside it). */
	hideWithin: 0.3
};
