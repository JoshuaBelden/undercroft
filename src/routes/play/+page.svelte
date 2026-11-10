<script lang="ts">
	import * as THREE from 'three';
	import { onMount } from 'svelte';
	import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { PUBLIC_GAME_SERVER_URL } from '$app/env/public';
	import { MAP_KIT } from '#lib/content/map/kit.ts';
	import { MOVEMENT } from '#lib/content/player/movement.ts';
	import { devMode } from '#lib/dev.ts';
	import { AudioManager } from '#lib/game/audio/AudioManager.ts';
	import { SoundBank } from '#lib/game/audio/SoundBank.ts';
	import { Engine, type FrameStats } from '#lib/game/Engine.ts';
	import { InputMap } from '#lib/game/input/InputMap.ts';
	import { MapRenderer } from '#lib/game/map/MapRenderer.ts';
	import { GameClient, type ConnectionStatus } from '#lib/game/net/GameClient.ts';
	import { Headlamp } from '#lib/game/player/Headlamp.ts';
	import { LocalPlayer } from '#lib/game/player/LocalPlayer.ts';
	import { PlayerAudio } from '#lib/game/player/PlayerAudio.ts';
	import { RemotePlayers } from '#lib/game/player/RemotePlayers.ts';
	import { saveSettings, settings } from '#lib/settings/settings.svelte.ts';
	import { buildCollisionWorld } from '#lib/shared/map/collision.ts';
	import { PIECES } from '#lib/shared/map/pieces.generated.ts';
	import { roomPoints } from '#lib/shared/map/points.ts';
	import { LEVEL_HEIGHT, cellKey, occupiedCells, worldCell } from '#lib/shared/map/grid.ts';
	import { nearExtract } from '#lib/shared/player/simulate.ts';
	import { EXPEDITION } from '#lib/content/expedition.ts';
	import { bindingLabel } from '#lib/game/input/actions.ts';
	import type { MapLayout, Vec3 } from '#lib/shared/map/types.ts';
	import type { PlayerFlags, PlayerState } from '#lib/shared/player/types.ts';
	import type { AdminCommand } from '#lib/shared/protocol.ts';
	import AdminPanel from '#lib/ui/AdminPanel.svelte';
	import HelpPanel from '#lib/ui/HelpPanel.svelte';
	import ExpeditionResult from '#lib/ui/ExpeditionResult.svelte';
	import Hud from '#lib/ui/Hud.svelte';
	import RoomBanner from '#lib/ui/RoomBanner.svelte';
	import SettingsMenu from '#lib/ui/SettingsMenu.svelte';
	import StatsOverlay from '#lib/ui/StatsOverlay.svelte';

	let canvas: HTMLCanvasElement;
	let panel = $state<'settings' | 'help' | 'admin' | null>(null);
	let status = $state<ConnectionStatus>('connecting');
	let statusDetail = $state('');
	let sessionId = $state<string | null>(null);
	let playerId = $state<string | null>(null);
	let seed = $state<number | null>(null);
	let rooms = $state<string[]>([]);
	let flags = $state<PlayerFlags | null>(null);
	let stats = $state<FrameStats>({ fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, lights: 0 });
	let rtt = $state(0);
	let locked = $state(false);
	let mapView = $state(false);
	let spawned = $state(false);
	let hud = $state({
		stamina: 1,
		exhausted: false,
		battery: 1,
		headlamp: 1,
		underwater: false,
		stance: 'stand',
		creep: false,
		prompt: null as string | null,
		progress: 0
	});
	/** Set when this player has climbed out; shows the results screen. */
	let result = $state<{ seconds: number; deepestLevel: number } | null>(null);
	/** Room banner currently showing; `key` restarts the animation for each new room. */
	let banner = $state<{ title: string; key: number } | null>(null);
	let descend = (): void => {};

	const audio = new AudioManager({ ...settings.audio });
	let applyGraphics = (): void => {};
	let setMapView = (enabled: boolean): void => {
		mapView = enabled;
	};
	let sendAdmin = (command: AdminCommand): void => {
		void command;
	};

	function toggle(name: 'settings' | 'help' | 'admin'): void {
		panel = panel === name ? null : name;
		if (panel) document.exitPointerLock();
	}

	onMount(() => {
		const engine = new Engine(canvas);
		engine.camera.rotation.order = 'YXZ';
		const input = new InputMap();

		const map = new MapRenderer();
		engine.scene.add(map.root);
		const remote = new RemotePlayers();
		engine.scene.add(remote.root);
		// Near-black: the headlamp is the light. The debug light only shows in map view.
		engine.scene.add(new THREE.AmbientLight(0xffffff, 0.012));
		const debugLight = new THREE.HemisphereLight(0xfff2e0, 0x202020, 1.6);
		debugLight.visible = false;
		engine.scene.add(debugLight);
		const orbit = new OrbitControls(engine.camera, canvas);
		orbit.enableDamping = true;
		orbit.enabled = false;

		const headlamp = new Headlamp(engine.camera);
		applyGraphics = () => {
			engine.applyGraphics(settings.graphics);
			headlamp.setShadows(settings.graphics.quality !== 'low', engine.shadowMapSize);
			remote.setShadows(settings.graphics.quality !== 'low', engine.shadowMapSize);
		};
		applyGraphics();

		const client = new GameClient(PUBLIC_GAME_SERVER_URL, 'Explorer', {
			onStatus: (next, detail) => {
				status = next;
				statusDetail = detail ?? '';
				playerId = client.playerId;
			},
			onMessage: (message) => {
				switch (message.type) {
					case 'welcome':
						sessionId = message.sessionId;
						result = null;
						loadMap(message.layout);
						break;
					case 'extracted':
						result = { seconds: message.seconds, deepestLevel: message.deepestLevel };
						player.leave();
						remote.apply([], client.playerId);
						banner = null;
						document.exitPointerLock();
						break;
					case 'map':
						loadMap(message.layout);
						break;
					case 'tick':
						for (const snap of message.players) {
							if (snap.id !== client.playerId) continue;
							player.onSnapshot(snap);
							flags = { ...snap.state.flags };
						}
						remote.apply(message.players, client.playerId);
						break;
				}
			}
		});
		const player = new LocalPlayer(input, client);
		const sounds = new SoundBank(audio);
		const playerAudio = new PlayerAudio(sounds, map.root, (amount) => audio.setMuffle(amount));

		/** World cell + level -> title of the room there (titled start and major rooms). */
		let roomCells: Record<string, string> = {};
		let seenRooms: Record<string, boolean> = {};
		let bannerCheck = 0;

		function loadMap(layout: MapLayout): void {
			seed = layout.seed;
			roomCells = {};
			seenRooms = {};
			for (const placement of layout.placements) {
				const title = MAP_KIT[placement.piece]?.title;
				const piece = PIECES[placement.piece];
				if (!title || !piece) continue;
				for (const [x, z, level] of occupiedCells(piece, placement)) {
					roomCells[cellKey(x, z, level)] = title;
				}
			}
			rooms = roomPoints(layout, PIECES, MAP_KIT).map((room) => room.name);
			void map.build(layout);
			player.setWorld(buildCollisionWorld(layout, PIECES));
		}

		sendAdmin = (command) => client.send({ type: 'admin', command });
		descend = () => client.send({ type: 'descend' });

		/** Show a room's banner the first time the player enters it this expedition. */
		function checkRoom(position: Vec3): void {
			const [cx, cz] = worldCell(position[0], position[2]);
			const level = Math.floor((position[1] + 0.5) / LEVEL_HEIGHT);
			const title = roomCells[cellKey(cx, cz, level)];
			if (!title || seenRooms[title]) return;
			seenRooms[title] = true;
			banner = { title, key: (banner?.key ?? 0) + 1 };
		}

		function extractPrompt(state: PlayerState): string | null {
			const world = player.collision;
			if (!world || state.swimming || !nearExtract(world, state)) return null;
			const key = settings.bindings.interact.map(bindingLabel).join(' / ') || 'Interact';
			return state.extracting > 0 ? 'Climbing out...' : `Hold ${key} to climb out`;
		}

		setMapView = (enabled) => {
			mapView = enabled;
			orbit.enabled = enabled;
			debugLight.visible = enabled;
			if (enabled) {
				document.exitPointerLock();
				const eye = player.eyePosition();
				if (eye) {
					orbit.target.set(eye[0], eye[1], eye[2]);
					engine.camera.position.set(eye[0] + 8, eye[1] + 12, eye[2] + 8);
				}
			}
		};

		client.connect();

		const onLockChange = () => (locked = document.pointerLockElement === canvas);
		document.addEventListener('pointerlockchange', onLockChange);
		const requestLock = () => {
			void audio.unlock();
			if (!panel && !mapView) void canvas.requestPointerLock();
		};
		canvas.addEventListener('click', requestLock);

		engine.onUpdate((delta) => {
			const active = locked && !panel && !mapView;
			player.update(delta, active);
			remote.update(delta);
			if (mapView) {
				orbit.update();
			} else {
				const eye = player.eyePosition();
				if (eye) engine.camera.position.set(eye[0], eye[1], eye[2]);
				const look = player.look();
				engine.camera.rotation.set(look.pitch, look.yaw, 0);
			}
			const state = player.state;
			headlamp.update(state);
			playerAudio.update(state, audio.unlocked);
			spawned = !!state;
			if (state) {
				hud = {
					stamina: state.stamina / MOVEMENT.stamina.max,
					exhausted: state.exhausted,
					battery: state.battery,
					headlamp: state.headlamp,
					underwater: state.underwater,
					stance: state.stance,
					creep: player.modes.creep,
					prompt: extractPrompt(state),
					progress: state.extracting / EXPEDITION.extractSeconds
				};
				bannerCheck -= delta;
				if (bannerCheck <= 0) {
					bannerCheck = 0.25;
					checkRoom(state.position);
				}
			}
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

		return () => {
			unsubscribe();
			document.removeEventListener('pointerlockchange', onLockChange);
			canvas.removeEventListener('click', requestLock);
			document.exitPointerLock();
			playerAudio.dispose();
			player.dispose();
			headlamp.dispose();
			remote.dispose();
			orbit.dispose();
			input.dispose();
			client.dispose();
			engine.dispose();
			audio.dispose();
		};
	});
</script>

<canvas bind:this={canvas}></canvas>

{#if spawned && !mapView}
	<Hud {...hud} />
{/if}

{#if banner && spawned && !mapView}
	{#key banner.key}
		<RoomBanner title={banner.title} />
	{/key}
{/if}

{#if result}
	<ExpeditionResult
		seconds={result.seconds}
		deepestLevel={result.deepestLevel}
		ondescend={() => descend()}
	/>
{/if}

{#if !locked && !panel && !mapView && !result && status === 'connected'}
	<button type="button" class="descend" onclick={() => canvas.requestPointerLock()}>
		Click to descend
	</button>
{/if}

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
		ongraphics={() => applyGraphics()}
	/>
{:else if panel === 'help'}
	<HelpPanel onclose={() => (panel = null)} />
{:else if panel === 'admin'}
	<AdminPanel
		onclose={() => (panel = null)}
		{status}
		{sessionId}
		{playerId}
		{seed}
		{rooms}
		{flags}
		{mapView}
		onadmin={(command) => sendAdmin(command)}
		onmapview={(enabled) => setMapView(enabled)}
	/>
{/if}

<style>
	canvas {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		display: block;
		cursor: crosshair;
	}

	.descend {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		padding: 14px 28px;
		font:
			14px ui-monospace,
			monospace;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: #e8dfcf;
		background: rgb(0 0 0 / 0.6);
		border: 1px solid rgb(232 223 207 / 0.3);
		cursor: pointer;
		z-index: 5;
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
