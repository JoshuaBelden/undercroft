/**
 * Svelte action for an element with the `backdrop-art` class: its picture drifts away from the
 * cursor, as if it were far behind the page. It only reports where the cursor is, as
 * `--parallax-x` and `--parallax-y` (-1..1 from the centre of the window); `app.css` does the
 * moving. Does nothing for people who ask for reduced motion.
 */
export function parallax(node: HTMLElement): { destroy: () => void } {
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return { destroy: () => {} };

	let frame = 0;
	let x = 0;
	let y = 0;

	const apply = (): void => {
		frame = 0;
		node.style.setProperty('--parallax-x', x.toFixed(3));
		node.style.setProperty('--parallax-y', y.toFixed(3));
	};

	const onMove = (event: PointerEvent): void => {
		x = Math.max(-1, Math.min(1, (event.clientX / window.innerWidth) * 2 - 1));
		y = Math.max(-1, Math.min(1, (event.clientY / window.innerHeight) * 2 - 1));
		// At most one update per frame, however fast the pointer reports.
		if (!frame) frame = requestAnimationFrame(apply);
	};

	window.addEventListener('pointermove', onMove, { passive: true });
	return {
		destroy: () => {
			window.removeEventListener('pointermove', onMove);
			if (frame) cancelAnimationFrame(frame);
		}
	};
}
