<script lang="ts">
	import { tick } from 'svelte';
	import { AVATAR } from '#lib/content/account.ts';
	import { device } from '#lib/game/input/device.svelte.ts';
	import Dialog from '#lib/ui/Dialog.svelte';

	/**
	 * Framing a new avatar before it is uploaded (docs/dev/accounts.md#avatars): the picture behind
	 * a round window, moved and zoomed until the right part shows. What is in the window is drawn
	 * into a `AVATAR.uploadSize` square and handed to `onsave`.
	 *
	 * The window is a scroller: moving the picture is scrolling it, so the mouse (dragging), touch,
	 * the arrow keys (with the window focused) and the controller's right stick all move it with
	 * nothing of their own to bind. Zoom is a slider (left and right on a controller), or the wheel.
	 */
	interface Props {
		/** The picture the player chose. */
		file: File;
		onclose: () => void;
		/** The framed square. Resolves with an error to show, or null once it is saved. */
		onsave: (image: Blob) => Promise<string | null>;
	}

	let { file, onclose, onsave }: Props = $props();

	/** Pixels across the window. */
	const VIEW = 272;

	const source = $derived(URL.createObjectURL(file));
	$effect(() => {
		const url = source;
		return () => URL.revokeObjectURL(url);
	});

	let image = $state<HTMLImageElement>();
	let view = $state<HTMLElement>();
	/** The picture's own size, once it has loaded. */
	let natural = $state<{ width: number; height: number } | null>(null);
	let zoom = $state(1);
	let saving = $state(false);
	let message = $state('');

	/** Screen pixels per picture pixel: at zoom 1 the short side just fills the window. */
	const scale = $derived(natural ? (VIEW / Math.min(natural.width, natural.height)) * zoom : 1);

	async function loaded(): Promise<void> {
		if (!image) return;
		natural = { width: image.naturalWidth, height: image.naturalHeight };
		await tick();
		// Start in the middle.
		if (view) {
			view.scrollLeft = (view.scrollWidth - VIEW) / 2;
			view.scrollTop = (view.scrollHeight - VIEW) / 2;
		}
	}

	/** Zoom about the middle of the window, so what is in the middle stays there. */
	async function setZoom(next: number): Promise<void> {
		if (!view || !natural) return;
		const clamped = Math.min(AVATAR.zoomMax, Math.max(1, next));
		const before = scale;
		const middleX = (view.scrollLeft + VIEW / 2) / before;
		const middleY = (view.scrollTop + VIEW / 2) / before;
		zoom = clamped;
		await tick();
		view.scrollLeft = middleX * scale - VIEW / 2;
		view.scrollTop = middleY * scale - VIEW / 2;
	}

	/** The wheel zooms. Not passive: the page behind must not scroll as well. */
	function wheelZoom(node: HTMLElement): () => void {
		const onWheel = (event: WheelEvent): void => {
			event.preventDefault();
			void setZoom(zoom * Math.exp(-event.deltaY * 0.0015));
		};
		node.addEventListener('wheel', onWheel, { passive: false });
		return () => node.removeEventListener('wheel', onWheel);
	}

	/** Dragging with the mouse or a pen moves the picture (touch scrolls it natively). */
	let drag: { id: number; x: number; y: number; left: number; top: number } | null = null;

	function onDown(event: PointerEvent): void {
		if (!view || event.pointerType === 'touch' || event.button !== 0) return;
		drag = {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			left: view.scrollLeft,
			top: view.scrollTop
		};
		view.setPointerCapture(event.pointerId);
	}

	function onMove(event: PointerEvent): void {
		if (!view || !drag || event.pointerId !== drag.id) return;
		view.scrollLeft = drag.left - (event.clientX - drag.x);
		view.scrollTop = drag.top - (event.clientY - drag.y);
	}

	function onUp(event: PointerEvent): void {
		if (drag?.id !== event.pointerId) return;
		drag = null;
		if (view?.hasPointerCapture(event.pointerId)) view.releasePointerCapture(event.pointerId);
	}

	/** What shows in the window, as a square picture. */
	function frame(): Promise<Blob | null> {
		if (!image || !view) return Promise.resolve(null);
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = AVATAR.uploadSize;
		const context = canvas.getContext('2d');
		if (!context) return Promise.resolve(null);
		// A see-through picture gets the dark of the pane behind it.
		context.fillStyle = '#0a0908';
		context.fillRect(0, 0, AVATAR.uploadSize, AVATAR.uploadSize);
		context.imageSmoothingQuality = 'high';
		const side = VIEW / scale;
		context.drawImage(
			image,
			view.scrollLeft / scale,
			view.scrollTop / scale,
			side,
			side,
			0,
			0,
			AVATAR.uploadSize,
			AVATAR.uploadSize
		);
		return new Promise((resolve) => {
			canvas.toBlob(
				(blob) => {
					// A browser that can't write WebP gives PNG instead: JPEG is smaller.
					if (blob?.type === 'image/webp') resolve(blob);
					else canvas.toBlob(resolve, 'image/jpeg', 0.9);
				},
				'image/webp',
				0.9
			);
		});
	}

	async function save(): Promise<void> {
		if (saving) return;
		saving = true;
		message = '';
		const blob = await frame();
		const problem = blob ? await onsave(blob) : "That picture couldn't be read";
		saving = false;
		if (problem) message = problem;
	}

	function failed(): void {
		message = "That picture couldn't be opened. Try a PNG, JPEG or WebP";
	}
</script>

<Dialog title="Your avatar" {onclose}>
	<div class="editor" style:--view="{VIEW}px">
		<!-- A scroller must take focus for its arrow keys, and no interactive ARIA role means "pan". -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			class="window"
			bind:this={view}
			tabindex="0"
			role="region"
			aria-label="The part of the picture that will be your avatar. Drag or use the arrow keys to move it"
			data-pad-scroll
			{@attach wheelZoom}
			onpointerdown={onDown}
			onpointermove={onMove}
			onpointerup={onUp}
			onpointercancel={onUp}
		>
			<img
				bind:this={image}
				src={source}
				alt=""
				draggable="false"
				style:width={natural ? `${natural.width * scale}px` : undefined}
				style:height={natural ? `${natural.height * scale}px` : undefined}
				onload={() => void loaded()}
				onerror={failed}
			/>
		</div>
		<div class="ring" aria-hidden="true"></div>

		<label class="zoom">
			<span>Zoom</span>
			<input
				type="range"
				min="1"
				max={AVATAR.zoomMax}
				step="0.05"
				value={zoom}
				disabled={!natural}
				oninput={(event) => void setZoom(Number(event.currentTarget.value))}
			/>
		</label>

		<p class="hint" role="status">
			{#if message}
				{message}
			{:else if device.kind === 'pad'}
				Move the picture with the right stick, and zoom with left and right on Zoom.
			{:else}
				Drag the picture to move it. Zoom with the wheel or the slider.
			{/if}
		</p>
	</div>

	{#snippet footer()}
		<button type="button" onclick={onclose}>Cancel</button>
		<button type="button" class="primary" disabled={!natural || saving} onclick={() => void save()}>
			{saving ? 'Saving...' : 'Save'}
		</button>
	{/snippet}
</Dialog>

<style>
	.editor {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
	}

	/* The picture scrolls inside a square; the ring over it shows the circle that will be kept. */
	.window {
		width: var(--view);
		height: var(--view);
		overflow: auto;
		scrollbar-width: none;
		overscroll-behavior: contain;
		cursor: grab;
		background: #0a0908;
		border-radius: 4px;
	}

	.window:active {
		cursor: grabbing;
	}

	.window:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}

	.window::-webkit-scrollbar {
		display: none;
	}

	.window img {
		display: block;
		max-width: none;
		user-select: none;
	}

	.ring {
		position: absolute;
		top: 0;
		left: 50%;
		width: var(--view);
		height: var(--view);
		translate: -50% 0;
		border-radius: 4px;
		pointer-events: none;
		/* Dims the corners outside the circle. */
		background: radial-gradient(circle closest-side, transparent 99%, rgb(10 9 8 / 0.6) 100%);
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.15);
	}

	.zoom {
		display: flex;
		align-items: center;
		gap: 12px;
		width: var(--view);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		font-size: 0.8rem;
	}

	.zoom input {
		flex: 1;
		accent-color: #00819d;
	}

	.hint {
		min-height: 3em;
		text-align: center;
		font-size: 0.9rem;
	}
</style>
