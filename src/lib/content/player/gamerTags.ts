/**
 * Teammates' gamer tags, drawn above their explorers underground (docs/dev/player.md#gamer-tags).
 * Rock hides a tag like it hides the explorer, and it fades out with distance, so the dark still
 * keeps people apart.
 */
export const GAMER_TAGS = {
	/** Height of the tag's bottom edge above the explorer's eyes (m). */
	above: 0.3,
	/** Fully shown up to this distance from the camera (m). */
	fullUntil: 8,
	/** Gone from this distance (m); fades between. */
	goneAt: 20,
	/** Opacity at its fullest: a little see-through, so it sits in the scene. */
	opacity: 0.85,
	/**
	 * Size of the lettering on screen, as a fraction of the view's height (at a 75° field of view):
	 * it stays the same size whatever the distance, so a far tag is readable while it lasts.
	 */
	screenHeight: 0.026,
	/** Canvas font size (px) the tag is drawn at; only the texture's sharpness. */
	fontPx: 64,
	font: '600 {px}px "Barlow Semi Condensed", "Barlow", system-ui, sans-serif',
	/** Bone-white lettering with a dark edge, readable on lit stone and in the black. */
	color: '#e9e4d8',
	outline: 'rgba(8, 6, 4, 0.9)'
} as const;
