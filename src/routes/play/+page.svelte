<script lang="ts">
	import * as THREE from 'three';
	import { onMount } from 'svelte';
	import { PUBLIC_GAME_SERVER_URL } from '$app/env/public';
	import { devMode } from '#lib/dev.ts';
	import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { AudioManager } from '#lib/game/audio/AudioManager.ts';
	import { Engine, type FrameStats } from '#lib/game/Engine.ts';
	import { InputMap } from '#lib/game/input/InputMap.ts';
	import { MapRenderer } from '#lib/game/map/MapRenderer.ts';
	import { GameClient, type ConnectionStatus } from '#lib/game/net/GameClient.ts';
	import { saveSettings, settings } from '#lib/settings/settings.svelte.ts';
	import { toWorld } from '#lib/shared/map/grid.ts';
	import { PIECES } from '#lib/shared/map/pieces.generated.ts';
	import type { MapLayout } from '#lib/shared/map/types.ts';
	import AdminPanel from '#lib/ui/AdminPanel.svelte';
	import HelpPanel from '#lib/ui/HelpPanel.svelte';
	import SettingsMenu from '#lib/ui/SettingsMenu.svelte';
	import StatsOverlay from '#lib/ui/StatsOverlay.svelte';

	let canvas: HTMLCanvasElement;
	let panel = $state<'settings' | 'help' | 'admin' | null>(null);
	let status = $state<ConnectionStatus>('connecting');
	let statusDetail = $state('');
	let sessionId = $state<string | null>(null);
	let playerId = $state<string | null>(null);
	let seed = $state<number | null>(null);
	let stats = $state<FrameStats>({ fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, lights: 0 });
	let rtt = $state(0);

	const audio = new AudioManager({ ...settings.audio });

	function toggle(name: 'settings' | 'help' | 'admin'): void {
		panel = panel === name ? null : name;
	}

	onMount(() => {
		const engine = new Engine(canvas);
		const input = new InputMap();

		// Map preview until the first-person controller lands: orbit camera, dim ambient and a
		// lantern that follows the orbit target.
		const map = new MapRenderer();
		engine.scene.add(map.root);
		engine.scene.add(new THREE.AmbientLight(0xffffff, 0.15));
		const lantern = new THREE.PointLight(0xffd9a0, 60, 20);
		engine.scene.add(lantern);
		const orbit = new OrbitControls(engine.camera, canvas);
		orbit.enableDamping = true;
		engine.onUpdate(() => {
			orbit.update();
			lantern.position.copy(orbit.target).add(new THREE.Vector3(0, 2, 0));
		});

		function showMap(layout: MapLayout): void {
			seed = layout.seed;
			void map.build(layout);
			const start = layout.placements[0];
			const spawn = PIECES[start.piece].spawns[0] ?? [0, 0, 0];
			const [x, y, z] = toWorld(start, spawn);
			orbit.target.set(x, y + 1, z);
			engine.camera.position.set(x + 10, y + 14, z + 10);
		}

		const client = new GameClient(PUBLIC_GAME_SERVER_URL, 'Explorer', {
			onStatus: (next, detail) => {
				status = next;
				statusDetail = detail ?? '';
				playerId = client.playerId;
			},
			onMessage: (message) => {
				if (message.type === 'welcome') {
					sessionId = message.sessionId;
					if (message.layout.seed !== seed) showMap(message.layout);
				}
			}
		});
		client.connect();

		engine.onUpdate(() => {
			stats = engine.stats;
			rtt = client.rtt;
		});
		engine.start();

		const unsubscribe = input.onPressed((action) => {
			switch (action) {
				case 'toggleSettings':
					toggle('settings');
					break;
				case 'toggleHelp':
					toggle('help');
					break;
				case 'toggleStats':
					settings.interface.showStats = !settings.interface.showStats;
					saveSettings();
					break;
				case 'toggleAdmin':
					if (devMode) toggle('admin');
					break;
			}
		});

		const unlockAudio = () => void audio.unlock();
		window.addEventListener('pointerdown', unlockAudio, { once: true });

		return () => {
			unsubscribe();
			window.removeEventListener('pointerdown', unlockAudio);
			orbit.dispose();
			input.dispose();
			client.dispose();
			engine.dispose();
			audio.dispose();
		};
	});
</script>

<canvas bind:this={canvas}></canvas>

<div class="status" class:ok={status === 'connected'}>
	{status}{statusDetail ? `: ${statusDetail}` : ''}
</div>

{#if settings.interface.showStats}
	<StatsOverlay {stats} {rtt} />
{/if}

{#if panel === 'settings'}
	<SettingsMenu
		onclose={() => (panel = null)}
		onvolume={(category, value) => audio.setVolume(category, value)}
	/>
{:else if panel === 'help'}
	<HelpPanel onclose={() => (panel = null)} />
{:else if panel === 'admin'}
	<AdminPanel onclose={() => (panel = null)} {status} {sessionId} {playerId} {seed} />
{/if}

<style>
	canvas {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		display: block;
	}

	.status {
		position: fixed;
		right: 12px;
		bottom: 12px;
		font:
			12px ui-monospace,
			monospace;
		color: #ff9a70;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		z-index: 10;
	}

	.status.ok {
		color: var(--muted);
	}
</style>
