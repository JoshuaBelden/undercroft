import type { CreatureAnim } from '../../content/creatures.ts';
import type { Vec3 } from '../map/types.ts';

/** A creature's state as broadcast in each server tick. See docs/dev/creatures.md. */
export interface CreatureSnapshot {
	id: string;
	/** Key into CREATURES (e.g. 'witch'). */
	kind: string;
	position: Vec3;
	yaw: number;
	anim: CreatureAnim;
	/** Seconds into the current animation state (keeps one-shot clips in sync). */
	animTime: number;
}
