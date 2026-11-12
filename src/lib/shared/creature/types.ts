import type { CreatureAnim } from '../../content/creatures.ts';
import type { Vec3 } from '../map/types.ts';

/** What a creature is doing (its AI state). See docs/dev/creatures.md. */
export type CreatureState = 'patrol' | 'alert' | 'investigate' | 'agro' | 'attack' | 'dead';

/** A creature's state as broadcast in each server tick. See docs/dev/creatures.md. */
export interface CreatureSnapshot {
	id: string;
	/** Key into CREATURES (e.g. 'witch'). */
	kind: string;
	/** Its AI state (the admin markers are coloured by it). */
	state: CreatureState;
	position: Vec3;
	yaw: number;
	anim: CreatureAnim;
	/** Seconds into the current animation state (keeps one-shot clips in sync). */
	animTime: number;
}
