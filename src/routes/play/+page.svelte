<script lang="ts">
	import * as THREE from 'three';
	import { onMount } from 'svelte';
	import { PUBLIC_GAME_SERVER_URL } from '$app/env/public';
	import { devMode } from '#lib/dev.ts';
	import { ASSETS, loadModel } from '#lib/game/assets.ts';
	import { AudioManager } from '#lib/game/audio/AudioManager.ts';
	import { Engine, type FrameStats } from '#lib/game/Engine.ts';
	import { InputMap } from '#lib/game/input/InputMap.ts';
	import { GameClient, type ConnectionStatus } from '#lib/game/net/GameClient.ts';
	import { saveSettings, settings } from '#lib/settings/settings.svelte.ts';
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
	let stats = $state<FrameStats>({ fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, lights: 0 });
	let rtt = $state(0);

	const audio = new AudioManager({ ...settings.audio });

	function toggle(name: 'settings' | 'help' | 'admin'): void {
		panel = panel === name ? null : name;
	}

	onMount(() => {
		const engine = new Engine(canvas);
		const input = new InputMap();

		// Phase 0 test scene: a dev asset lit by a single point light.
		engine.scene.add(new THREE.AmbientLight(0xffffff, 0.05));
		const lamp = new THREE.PointLight(0xffd9a0, 30, 12);
		lamp.position.set(2, 3, 2);
		engine.scene.add(lamp);
		engine.camera.position.set(0, 1.6, 4);
		engine.camera.lookAt(0, 0.5, 0);

		void loadModel(ASSETS.devCube).then((model) => {
			model.position.y = 0.5;
			engine.scene.add(model);
			engine.onUpdate((delta) => (model.rotation.y += delta * 0.5));
		});

		const client = new GameClient(PUBLIC_GAME_SERVER_URL, 'Explorer', {
			onStatus: (next, detail) => {
				status = next;
				statusDetail = detail ?? '';
				playerId = client.playerId;
			},
			onMessage: (message) => {
				if (message.type === 'welcome') sessionId = message.sessionId;
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
	<AdminPanel onclose={() => (panel = null)} {status} {sessionId} {playerId} />
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
