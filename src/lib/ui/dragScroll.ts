/**
 * Svelte action for a sideways scroller: holding the mouse button and dragging scrolls it, like
 * pushing a strip of paper. Touch and the scrollbar keep working as the browser does them. While
 * dragging the element has the `dragging` class, and the click that would end a drag is dropped
 * so nothing under the cursor is pressed by accident.
 */
export function dragScroll(node: HTMLElement): { destroy: () => void } {
	/** Pixels the cursor must travel before a press becomes a drag. */
	const THRESHOLD = 5;

	let pointer: number | null = null;
	let dragging = false;
	let startX = 0;
	let startScroll = 0;

	const swallowClick = (event: MouseEvent): void => {
		event.preventDefault();
		event.stopPropagation();
	};

	const onDown = (event: PointerEvent): void => {
		if (event.pointerType !== 'mouse' || event.button !== 0) return;
		pointer = event.pointerId;
		startX = event.clientX;
		startScroll = node.scrollLeft;
	};

	const onMove = (event: PointerEvent): void => {
		if (event.pointerId !== pointer) return;
		const moved = event.clientX - startX;
		if (!dragging) {
			if (Math.abs(moved) < THRESHOLD) return;
			dragging = true;
			// Keeps the drag going when the cursor leaves the scroller.
			node.setPointerCapture(event.pointerId);
			node.classList.add('dragging');
		}
		node.scrollLeft = startScroll - moved;
	};

	const onEnd = (event: PointerEvent): void => {
		if (event.pointerId !== pointer) return;
		pointer = null;
		if (!dragging) return;
		dragging = false;
		node.classList.remove('dragging');
		if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
		// The click (if any) follows the release at once: drop it, then stop listening.
		node.addEventListener('click', swallowClick, { capture: true, once: true });
		setTimeout(() => node.removeEventListener('click', swallowClick, { capture: true }));
	};

	node.addEventListener('pointerdown', onDown);
	node.addEventListener('pointermove', onMove);
	node.addEventListener('pointerup', onEnd);
	node.addEventListener('pointercancel', onEnd);
	return {
		destroy: () => {
			node.removeEventListener('pointerdown', onDown);
			node.removeEventListener('pointermove', onMove);
			node.removeEventListener('pointerup', onEnd);
			node.removeEventListener('pointercancel', onEnd);
		}
	};
}
