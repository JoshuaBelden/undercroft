/**
 * Animation maps. Every rigged model (creatures, the explorer) names its clips differently, so
 * each maps them onto one standard set of slots, and game code only ever names a slot.
 * See docs/dev/creatures.md (Animation maps).
 */

/** The standard animation slots. A model needn't fill them all: see ANIM_FALLBACKS. */
export const ANIM_SLOTS = [
	'idle',
	'walking',
	'running',
	'jumping',
	'melee_attack',
	'weapon_attack',
	'spell_attack',
	'dodge',
	'climb',
	'crouch',
	'crawl',
	'take_damage',
	'die'
] as const;
export type AnimSlot = (typeof ANIM_SLOTS)[number];

/** One slot of a model's animation map. */
export interface AnimClip {
	/** Clip name in the model file. */
	clip: string;
	/** Playback speed (default 1). 0 holds the first frame: a pose. */
	speed?: number;
	/** Use only part of the clip: seconds in to start from (default 0), to skip a lead-in. */
	start?: number;
	/** Seconds in to stop at (default: the end), to cut a tail off. */
	end?: number;
}

/** A model's animation map: clip per slot. Slots the model has no clip for are left out. */
export type AnimationMap = Partial<Record<AnimSlot, AnimClip>>;

/** Slots that repeat; the rest play once and hold their last frame. */
export const LOOPING_ANIMS: ReadonlySet<AnimSlot> = new Set([
	'idle',
	'walking',
	'running',
	'climb',
	'crouch',
	'crawl'
]);

/**
 * What to play when a model has no clip for a slot, in order of preference. A slot with nothing
 * usable is skipped: whatever was playing carries on.
 */
export const ANIM_FALLBACKS: Record<AnimSlot, AnimSlot[]> = {
	idle: [],
	walking: ['running', 'crouch'],
	running: ['walking'],
	jumping: ['running', 'walking'],
	melee_attack: ['weapon_attack', 'spell_attack'],
	weapon_attack: ['melee_attack', 'spell_attack'],
	spell_attack: ['melee_attack', 'weapon_attack'],
	dodge: [],
	climb: ['walking'],
	crouch: ['walking'],
	crawl: ['crouch', 'walking'],
	take_damage: [],
	die: []
};

/** The slot a model will actually play for `anim`: itself, or its first mapped fallback. */
export function resolveAnim(map: AnimationMap, anim: AnimSlot): AnimSlot | null {
	if (map[anim]) return anim;
	return ANIM_FALLBACKS[anim].find((other) => map[other]) ?? null;
}
