<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { SURVEY } from '#lib/content/map/survey.ts';
	import { device } from '#lib/game/input/device.svelte.ts';
	import type { InputMap } from '#lib/game/input/InputMap.ts';
	import { menu } from '#lib/game/input/menus.ts';
	import { saveSettings, settings } from '#lib/settings/settings.svelte.ts';
	import type { MarkSnapshot } from '#lib/shared/items/types.ts';
	import { CELL } from '#lib/shared/map/grid.ts';
	import type { SurveyMap } from '#lib/shared/map/survey.ts';
	import type { SurveyHold } from '#lib/shared/player/types.ts';
	import ButtonHint from './ButtonHint.svelte';
	import KeyCap from './KeyCap.svelte';
	import { drawSketch, levelNumber, type SketchContent } from './mapSketch.ts';

	/**
	 * Your map underground (docs/dev/map.md): what you have drawn in your notebook, a level at a
	 * time. Nothing pauses while it is open. Holding Sketch (standing still) draws what is around
	 * you; holding Show, next to a teammate with a notebook, swaps what you both know. The server
	 * counts the holds (`sketch` and `share`, 0..1, come back from it).
	 */
	interface Props {
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
		onpack: () => void;
		onclose: () => void;
	}

	let { map, drawn, self, marks, input, sketch, share, partner, onhold, onpack, onclose }: Props =
		$props();

	let canvas = $state<HTMLCanvasElement>();
	let width = $state(0);
	let height = $state(0);
	// Opens where you are, on your level.
	const start = untrack(() => self);
	let level = $state(start?.level ?? untrack(() => map.levels[0]) ?? 0);
	let centre = $state({ x: start?.x ?? 0, z: start?.z ?? 0 });
	/** Keep you in the middle until the page is dragged away. */
	let follow = $state(true);
	let zoom = $state(clampZoom(settings.interface.mapZoom));

	/** What each way of holding has down: the buttons with the pointer, X and Y, and the keys. */
	let pointerHold = $state<SurveyHold>(null);
	let padHold = $state<SurveyHold>(null);
	let sent: SurveyHold = null;

	const index = $derived(map.levels.indexOf(level));
	const empty = $derived(![...drawn].some((key) => map.cells.get(key)?.cell[2] === level));
	const usingPad = $derived(device.kind === 'pad');

	function clampZoom(value: number): number {
		return Math.max(SURVEY.zoom.min, Math.min(SURVEY.zoom.max, value || SURVEY.zoom.initial));
	}

	/** -1: the level above; 1: the one below. */
	function changeLevel(by: -1 | 1): void {
		const next = map.levels[index + by];
		if (next === undefined) return;
		level = next;
		follow = level === self?.level;
	}

	function zoomBy(factor: number): void {
		zoom = clampZoom(zoom * factor);
	}

	function findMe(): void {
		if (!self) return;
		level = self.level;
		follow = true;
	}

	function holding(button: 'x' | 'y', down: boolean): void {
		const hold: SurveyHold = button === 'x' ? 'sketch' : 'share';
		if (down) padHold = hold;
		else if (padHold === hold) padHold = null;
	}

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
		centre = {
			x: centre.x - (event.clientX - drag.x) / zoom,
			z: centre.z - (event.clientY - drag.y) / zoom
		};
		drag = { x: event.clientX, y: event.clientY };
		follow = false;
	}
	function dragEnd(): void {
		drag = null;
	}

	function wheel(event: WheelEvent): void {
		event.preventDefault();
		zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15);
	}

	onMount(() => {
		const unsubscribe = input.onPressed((action) => {
			if (action === 'mapLevelUp') changeLevel(-1);
			else if (action === 'mapLevelDown') changeLevel(1);
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
			settings.interface.mapZoom = zoom;
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
		const hold = pointerHold ?? padHold ?? keys;
		if (hold !== sent) {
			sent = hold;
			onhold(hold);
		}
		if (input.isDown('mapZoomIn')) zoomBy(Math.exp(seconds * 1.5));
		if (input.isDown('mapZoomOut')) zoomBy(Math.exp(-seconds * 1.5));
		const stick = input.lookStick();
		if (stick.x || stick.y) {
			// About two cells a second at full push, whatever the zoom.
			const speed = (CELL * 2 * SURVEY.zoom.initial) / zoom;
			centre = {
				x: centre.x + stick.x * speed * seconds * 4,
				z: centre.z + stick.y * speed * seconds * 4
			};
			follow = false;
		}
		if (follow && self && self.level === level) centre = { x: self.x, z: self.z };
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
			{ x: centre.x, z: centre.z, zoom, level },
			{ map, drawn, self, marks }
		);
	}

	const sketchKey = $derived(settings.bindings.sketchMap[0] ?? '');
	const showKey = $derived(settings.bindings.showMap[0] ?? '');
</script>

<div class="backdrop">
	<section
		class="panel"
		aria-labelledby="map-title"
		{@attach menu({ back: onclose, tabs: changeLevel, holding })}
	>
		<header>
			<h2 id="map-title">Map</h2>
			<div class="levels">
				<button
					type="button"
					aria-label="Level above"
					disabled={index <= 0}
					onclick={() => changeLevel(-1)}
				>
					Up <ButtonHint code="PadLB" />
				</button>
				<span class="level">Level {levelNumber(level)}</span>
				<button
					type="button"
					aria-label="Level below"
					disabled={index < 0 || index >= map.levels.length - 1}
					onclick={() => changeLevel(1)}
				>
					Down <ButtonHint code="PadRB" />
				</button>
			</div>
			<div class="bar">
				<button type="button" onclick={findMe}>Find me</button>
				<button type="button" onclick={onpack}>Pack</button>
				<button type="button" onclick={onclose}>Close</button>
			</div>
		</header>
		<div class="page" bind:clientWidth={width} bind:clientHeight={height}>
			<canvas
				bind:this={canvas}
				aria-label="Your map of level {levelNumber(level)}"
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
		<footer>
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
		</footer>
	</section>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 16px;
		background: rgb(0 0 0 / 0.5);
		z-index: 20;
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: min(1100px, 100%);
		height: min(780px, calc(100vh - 32px));
		padding: 16px 18px 18px;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: rgb(14 12 10 / 0.85);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
	}

	h2 {
		margin: 0;
	}

	.levels,
	.bar {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.level {
		min-width: 5.5em;
		text-align: center;
		font-family: var(--font-lore);
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

	footer {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	.hold {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		overflow: hidden;
		user-select: none;
		touch-action: none;
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
