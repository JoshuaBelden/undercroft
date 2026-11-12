/** How far from the centre (0..1) the pointer has to be before it chooses anything. */
const DEAD_ZONE = 0.35;

/**
 * Which slot of a wheel (quick use, chalk marks) the pointer is on: the filled slot nearest
 * its direction (the first slot is at the top and they go clockwise), or -1 near the centre or
 * with nothing to choose. `pointer` is from the centre, each axis -1..1, y down.
 */
export function wheelChoice<T>(
	pointer: { x: number; y: number },
	slots: readonly (T | null)[]
): number {
	if (Math.hypot(pointer.x, pointer.y) < DEAD_ZONE) return -1;
	const angle = Math.atan2(pointer.x, -pointer.y);
	let best = -1;
	let nearest = Infinity;
	slots.forEach((stack, index) => {
		if (!stack) return;
		const at = (index / slots.length) * Math.PI * 2;
		const apart = Math.abs(Math.atan2(Math.sin(angle - at), Math.cos(angle - at)));
		if (apart < nearest) {
			nearest = apart;
			best = index;
		}
	});
	return best;
}
