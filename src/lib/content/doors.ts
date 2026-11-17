/**
 * The double doors between levels: one at the top of every long stair (`stairs-deep`), just
 * behind the extraction room's gate. Shut and barred until someone holds interact on it; then it
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
