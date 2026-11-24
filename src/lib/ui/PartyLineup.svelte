<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { Lineup } from '#lib/game/player/Lineup.ts';
	import type { PartyMember } from '#lib/shared/party/types.ts';
	import type { Look } from '#lib/shared/player/look.ts';

	/**
	 * The party on the Expedition page, standing about in one scene (`Lineup`): you in front in
	 * the middle, the others behind. Under each, only their gamer tag and whether they are ready.
	 * See docs/dev/expedition.md.
	 */
	interface Props {
		members: PartyMember[];
		/** Your member id: you stand in front. */
		you: string;
	}

	let { members, you }: Props = $props();

	/** You first, then everyone else as the party lists them. */
	const order = $derived([
		...members.filter((m) => m.id === you),
		...members.filter((m) => m.id !== you)
	]);

	let canvas: HTMLCanvasElement;
	let labels: Record<string, HTMLElement> = $state({});
	let lineup: Lineup | null = null;

	$effect(() => {
		const list = order.map((m) => ({ id: m.id, look: $state.snapshot(m.look) as Look }));
		lineup?.arrange(list);
	});

	onMount(() => {
		const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		const scene = new Lineup();
		lineup = scene;
		scene.arrange(order.map((m) => ({ id: m.id, look: $state.snapshot(m.look) as Look })));

		const resize = () => {
			const { clientWidth: w, clientHeight: h } = canvas;
			if (!w || !h) return;
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
			renderer.setSize(w, h, false);
			scene.camera.aspect = w / h;
			scene.camera.updateProjectionMatrix();
		};
		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		resize();

		const at = new THREE.Vector2();
		let last = performance.now();
		let frame = 0;
		const draw = (now: number) => {
			const delta = Math.min(0.1, (now - last) / 1000);
			last = now;
			scene.update(delta);
			renderer.render(scene.scene, scene.camera);
			// Each name under its explorer's feet.
			const { clientWidth: w, clientHeight: h } = canvas;
			for (const [id, label] of Object.entries(labels)) {
				if (!label || !scene.feet(id, at)) continue;
				label.style.transform = `translate(${at.x * w}px, ${at.y * h}px) translate(-50%, 8px)`;
			}
			frame = requestAnimationFrame(draw);
		};
		frame = requestAnimationFrame(draw);

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			lineup = null;
			scene.dispose();
			renderer.dispose();
		};
	});
</script>

<div class="lineup">
	<canvas bind:this={canvas} aria-hidden="true"></canvas>
	<ul class="names">
		{#each order as member (member.id)}
			<li bind:this={labels[member.id]} class:ready={member.ready} class:away={!member.connected}>
				<span class="name">{member.name}</span>
				<span class="status">
					{!member.connected
						? 'Reconnecting'
						: member.inExpedition
							? 'Underground'
							: member.ready
								? 'Ready'
								: 'Not ready'}
				</span>
			</li>
		{/each}
	</ul>
</div>

<style>
	.lineup {
		position: relative;
		flex: 1;
		min-height: 420px;
	}

	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.names {
		position: absolute;
		inset: 0;
		margin: 0;
		padding: 0;
		list-style: none;
		pointer-events: none;
	}

	/* Placed under each explorer's feet every frame (left and top 0, moved by transform). */
	li {
		position: absolute;
		left: 0;
		top: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		white-space: nowrap;
		text-shadow: 0 2px 10px rgb(0 0 0 / 0.9);
	}

	.name {
		font-family: var(--font-display);
		font-size: 1.15rem;
	}

	.status {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.ready .status {
		color: var(--accent);
	}

	.away {
		opacity: 0.55;
	}
</style>
