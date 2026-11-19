<script lang="ts">
	import { onMount } from 'svelte';
	import { SURVEY } from '#lib/content/map/survey.ts';
	import { device } from '#lib/game/input/device.svelte.ts';
	import type { InputMap } from '#lib/game/input/InputMap.ts';
	import { saveSettings, settings } from '#lib/settings/settings.svelte.ts';
	import type { MarkSnapshot } from '#lib/shared/items/types.ts';
	import { CELL } from '#lib/shared/map/grid.ts';
	import type { SurveyMap } from '#lib/shared/map/survey.ts';
	import type { SurveyHold } from '#lib/shared/player/types.ts';
	import ButtonHint from './ButtonHint.svelte';
	import KeyCap from './KeyCap.svelte';
	import { drawSketch, levelNumber, type SketchContent } from './mapSketch.ts';
	import type { MapView } from './mapView.svelte.ts';

	/**
	 * Your map underground, the Map tab of the in-game menu (docs/dev/map.md): what you have drawn
	 * in your notebook, a level at a time. Nothing pauses while it shows. Holding Sketch (standing
	 * still) draws what is around you; holding Show, next to a teammate with a notebook, swaps what
	 * you both know. The server counts the holds (`sketch` and `share`, 0..1, come back from it).
	 * The level buttons are in the menu's header (MapTools), sharing `view`.
	 */
	interface Props {
		view: MapView;
		map: SurveyMap;
		drawn: ReadonlySet<string>;
		self: SketchContent['self'];
		marks: readonly MarkSnapshot[];
		input: InputMap;
		/** How far along the sketch and the showing are, 0..1 (1 once done, until let go). */
		sketch: number;
		share: number;
		/** The teammate close enough to be shown your map, if any. */
		partner: string | null;
		onhold: (hold: SurveyHold) => void;
	}

	let { view, map, drawn, self, marks, input, sketch, share, partner, onhold }: Props = $props();

	let canvas = $state<HTMLCanvasElement>();
	let width = $state(0);
	let height = $state(0);

	/** What the pointer holds down on the Sketch and Show buttons. */
	let pointerHold = $state<SurveyHold>(null);
	let sent: SurveyHold = null;

	const empty = $derived(![...drawn].some((key) => map.cells.get(key)?.cell[2] === view.level));
	const usingPad = $derived(device.kind === 'pad');

	function press(hold: SurveyHold, event: PointerEvent): void {
		if (event.button !== 0) return;
		pointerHold = hold;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function release(): void {
		pointerHold = null;
	}

	/** Dragging the page moves it under the pointer. */
	let drag: { x: number; y: number } | null = null;
	function dragStart(event: PointerEvent): void {
		if (event.button !== 0) return;
		drag = { x: event.clientX, y: event.clientY };
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}
	function dragMove(event: PointerEvent): void {
		if (!drag) return;
		view.centre = {
			x: view.centre.x - (event.clientX - drag.x) / view.zoom,
			z: view.centre.z - (event.clientY - drag.y) / view.zoom
		};
		drag = { x: event.clientX, y: event.clientY };
		view.follow = false;
	}
	function dragEnd(): void {
		drag = null;
	}

	function wheel(event: WheelEvent): void {
		event.preventDefault();
		view.zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15);
	}

	onMount(() => {
		const unsubscribe = input.onPressed((action) => {
			if (action === 'mapLevelUp') view.changeLevel(-1);
			else if (action === 'mapLevelDown') view.changeLevel(1);
		});
		let frame = 0;
		let last = performance.now();
		const loop = (now: number): void => {
			const seconds = Math.min(0.1, (now - last) / 1000);
			last = now;
			tick(seconds);
			frame = requestAnimationFrame(loop);
		};
		frame = requestAnimationFrame(loop);
		return () => {
			cancelAnimationFrame(frame);
			unsubscribe();
			onhold(null);
			settings.interface.mapZoom = view.zoom;
			saveSettings();
		};
	});

	/** Each frame: the holds, zoom and the right stick, then the page. */
	function tick(seconds: number): void {
		const keys: SurveyHold = input.isDown('sketchMap', 'keyboard')
			? 'sketch'
			: input.isDown('showMap', 'keyboard')
				? 'share'
				: null;
		const hold = pointerHold ?? view.padHold ?? keys;
		if (hold !== sent) {
			sent = hold;
			onhold(hold);
		}
		if (input.isDown('mapZoomIn')) view.zoomBy(Math.exp(seconds * 1.5));
		if (input.isDown('mapZoomOut')) view.zoomBy(Math.exp(-seconds * 1.5));
		const stick = input.lookStick();
		if (stick.x || stick.y) {
			// About two cells a second at full push, whatever the zoom.
			const speed = (CELL * 2 * SURVEY.zoom.initial) / view.zoom;
			view.centre = {
				x: view.centre.x + stick.x * speed * seconds * 4,
				z: view.centre.z + stick.y * speed * seconds * 4
			};
			view.follow = false;
		}
		if (view.follow && self && self.level === view.level) view.centre = { x: self.x, z: self.z };
		draw();
	}

	function draw(): void {
		const ctx = canvas?.getContext('2d');
		if (!canvas || !ctx || !width || !height) return;
		const ratio = window.devicePixelRatio || 1;
		const w = Math.round(width * ratio);
		const h = Math.round(height * ratio);
		if (canvas.width !== w || canvas.height !== h) {
			canvas.width = w;
			canvas.height = h;
		}
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		drawSketch(
			ctx,
			width,
			height,
			{ x: view.centre.x, z: view.centre.z, zoom: view.zoom, level: view.level },
			{ map, drawn, self, marks }
		);
	}

	const sketchKey = $derived(settings.bindings.sketchMap[0] ?? '');
	const showKey = $derived(settings.bindings.showMap[0] ?? '');
</script>

<div class="map">
	<div class="page" bind:clientWidth={width} bind:clientHeight={height}>
		<canvas
			bind:this={canvas}
			aria-label="Your map of level {levelNumber(view.level)}"
			onpointerdown={dragStart}
			onpointermove={dragMove}
			onpointerup={dragEnd}
			onpointercancel={dragEnd}
			onwheel={wheel}
		></canvas>
		{#if empty}
			<p class="empty">
				Nothing drawn here yet. Stand still and hold Sketch to draw what is around you.
			</p>
		{/if}
	</div>
	<div class="holds">
		<button
			type="button"
			class="hold"
			class:done={sketch >= 1}
			onpointerdown={(event) => press('sketch', event)}
			onpointerup={release}
			onpointercancel={release}
			onlostpointercapture={release}
		>
			<span class="fill" style:width="{Math.min(1, sketch) * 100}%"></span>
			<span class="label">{sketch >= 1 ? 'Sketched' : 'Sketch (hold)'}</span>
			{#if usingPad}<ButtonHint code="PadX" />{:else if sketchKey}<KeyCap code={sketchKey} />{/if}
		</button>
		<button
			type="button"
			class="hold"
			class:done={share >= 1}
			disabled={!partner}
			onpointerdown={(event) => press('share', event)}
			onpointerup={release}
			onpointercancel={release}
			onlostpointercapture={release}
		>
			<span class="fill" style:width="{Math.min(1, share) * 100}%"></span>
			<span class="label">
				{partner
					? share >= 1
						? 'Shown'
						: `Show ${partner} your map (hold)`
					: 'Nobody close to show'}
			</span>
			{#if partner}
				{#if usingPad}<ButtonHint code="PadY" />{:else if showKey}<KeyCap code={showKey} />{/if}
			{/if}
		</button>
	</div>
</div>

<style>
	.map {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: min(1100px, calc(100vw - 72px));
		height: min(680px, calc(100vh - 180px));
	}

	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		border-radius: 10px;
		overflow: hidden;
		box-shadow: inset 0 0 40px rgb(80 60 30 / 0.45);
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
		cursor: grab;
		touch-action: none;
	}

	.empty {
		position: absolute;
		inset: auto 0 24px;
		margin: 0 auto;
		max-width: 32em;
		text-align: center;
		color: #3b2f24;
		font-style: italic;
		pointer-events: none;
	}

	.holds {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	/* Pills, like the menu's tabs and buttons. */
	.hold {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		overflow: hidden;
		padding: 6px 16px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: none;
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		white-space: nowrap;
		user-select: none;
		touch-action: none;
	}

	.hold:disabled {
		opacity: 0.5;
	}

	.hold .fill {
		position: absolute;
		inset: 0 auto 0 0;
		background: rgb(255 255 255 / 0.18);
		pointer-events: none;
	}

	.hold.done .fill {
		background: rgb(0 129 157 / 0.4);
	}

	.hold .label {
		position: relative;
	}
</style>
