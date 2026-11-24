<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { PlayerBody } from '#lib/game/player/PlayerBody.ts';
	import { emptyInventory } from '#lib/shared/items/inventory.ts';
	import type { Look } from '#lib/shared/player/look.ts';
	import { createPlayerState } from '#lib/shared/player/simulate.ts';

	/**
	 * The explorer in a look, standing and turnable: drag it round, or turn it with the buttons
	 * below (left and right on a controller). It is a `PlayerBody`, so it is drawn just as
	 * teammates see it underground. See docs/dev/player.md#the-look.
	 */
	interface Props {
		look: Look;
	}

	let { look }: Props = $props();

	/** How far one press of a turn button turns it (rad). */
	const STEP = Math.PI / 4;
	/** How fast it turns to where it is headed (1/s, eased). */
	const EASE = 8;
	/** Radians of turn per pixel dragged. */
	const DRAG = 0.01;

	let canvas: HTMLCanvasElement;
	let body: PlayerBody | null = null;
	/** Where it is turned to, and where it is headed. */
	let turn = 0;
	let target = 0;

	$effect(() => {
		// Read the look first: behind `body?.`, nothing would be read before the body exists, and
		// the effect would never run again.
		const next = $state.snapshot(look) as Look;
		body?.setLook(next);
	});

	onMount(() => {
		const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
		// The game faces -Z at yaw 0: looking from -Z sees the face.
		camera.position.set(0, 1.05, -4.2);
		camera.lookAt(0, 0.9, 0);
		scene.add(new THREE.HemisphereLight(0xfff1dd, 0x2a1f18, 1.2));
		const key = new THREE.DirectionalLight(0xffe2bf, 2.2);
		key.position.set(-1.5, 2.5, -2.5);
		scene.add(key);
		const rim = new THREE.DirectionalLight(0xbcd0ff, 1.4);
		rim.position.set(1.5, 2, 2.5);
		scene.add(rim);

		const turntable = new THREE.Group();
		scene.add(turntable);
		const explorer = new PlayerBody(false, $state.snapshot(look) as Look);
		turntable.add(explorer.root);
		body = explorer;
		const state = createPlayerState([0, 0, 0], 0, emptyInventory());
		state.grounded = true;
		state.headlamp = 0;

		const resize = () => {
			const { clientWidth: w, clientHeight: h } = canvas;
			if (!w || !h) return;
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
			renderer.setSize(w, h, false);
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
		};
		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		resize();

		let last = performance.now();
		let frame = 0;
		const draw = (now: number) => {
			const delta = Math.min(0.1, (now - last) / 1000);
			last = now;
			turn += (target - turn) * Math.min(1, delta * EASE);
			turntable.rotation.y = turn;
			explorer.update(delta, state, 0, 0);
			renderer.render(scene, camera);
			frame = requestAnimationFrame(draw);
		};
		frame = requestAnimationFrame(draw);

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			body = null;
			explorer.dispose();
			renderer.dispose();
		};
	});

	let dragging: number | null = null;

	function down(event: PointerEvent): void {
		dragging = event.clientX;
		canvas.setPointerCapture(event.pointerId);
	}

	function move(event: PointerEvent): void {
		if (dragging === null) return;
		target += (event.clientX - dragging) * DRAG;
		turn = target;
		dragging = event.clientX;
	}

	function up(): void {
		dragging = null;
	}
</script>

<div class="preview">
	<canvas
		bind:this={canvas}
		aria-label="Your explorer"
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
	></canvas>
	<div class="turn" data-pad-stepper>
		<button type="button" aria-label="Turn left" onclick={() => (target -= STEP)}>◀</button>
		<span>Turn</span>
		<button type="button" aria-label="Turn right" onclick={() => (target += STEP)}>▶</button>
	</div>
</div>

<style>
	.preview {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		min-height: 0;
		height: 100%;
	}

	canvas {
		flex: 1;
		width: 100%;
		min-height: 0;
		cursor: grab;
		touch-action: none;
	}

	canvas:active {
		cursor: grabbing;
	}

	.turn {
		display: flex;
		align-items: center;
		gap: 12px;
		color: var(--muted);
	}
</style>
