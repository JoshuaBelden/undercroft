<script lang="ts">
	import * as THREE from 'three';
	import { onMount } from 'svelte';
	import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { MAP_KIT } from '#lib/content/map/kit.ts';
	import { PLAYER_MODEL, SHOULDER_CAMERA } from '#lib/content/player/model.ts';
	import { MOVEMENT } from '#lib/content/player/movement.ts';
	import { SANITY } from '#lib/content/player/sanity.ts';
	import { devMode } from '#lib/dev.ts';
	import { AudioManager } from '#lib/game/audio/AudioManager.ts';
	import { setGameContext } from '#lib/game/diagnostics.ts';
	import { Ambience } from '#lib/game/audio/Ambience.ts';
	import { SoundBank } from '#lib/game/audio/SoundBank.ts';
	import { CaptionFeed } from '#lib/game/audio/captions.svelte.ts';
	import type { SoundId } from '#lib/content/audio/sounds.ts';
	import { Creatures } from '#lib/game/creatures/Creatures.ts';
	import { ViewModel } from '#lib/game/items/ViewModel.ts';
	import { Underwater } from '#lib/game/Underwater.ts';
	import UnderwaterOverlay from '#lib/ui/UnderwaterOverlay.svelte';
	import { ITEMS } from '#lib/content/items.ts';
	import { carriedCount, held, shieldOf } from '#lib/shared/items/inventory.ts';
	import type { InventoryAction } from '#lib/shared/items/types.ts';
	import { aimRay } from '#lib/shared/items/weapons.ts';
	import { eyeHeight } from '#lib/shared/player/simulate.ts';
	import { DEFAULT_HEADLAMP } from '#lib/content/items/headlamps.ts';
	import { Engine, type FrameStats } from '#lib/game/Engine.ts';
	import { InputMap } from '#lib/game/input/InputMap.ts';
	import { device, promptCode } from '#lib/game/input/device.svelte.ts';
	import { rumble } from '#lib/game/input/gamepad.ts';
	import { MapRenderer } from '#lib/game/map/MapRenderer.ts';
	import { MapDebugGrid } from '#lib/game/map/MapDebugGrid.ts';
	import { mapDebugGrid, type MapDebugCounts } from '#lib/shared/map/debug.ts';
	import { connection, gameClient, me, start, subscribe } from '#lib/game/net/connection.svelte.ts';
	import { createFeatures, type Features } from '#lib/game/play/index.ts';
	import type { PanelName, PlayFeature, PlayUi, Prompt } from '#lib/game/play/feature.ts';
	import { keyPrompt } from '#lib/game/play/prompt.ts';
	import { Headlamp } from '#lib/game/player/Headlamp.ts';
	import { PlayerBody } from '#lib/game/player/PlayerBody.ts';
	import { LocalPlayer } from '#lib/game/player/LocalPlayer.ts';
	import { PlayerAudio } from '#lib/game/player/PlayerAudio.ts';
	import { RemotePlayers } from '#lib/game/player/RemotePlayers.ts';
	import { saveSettings, settings } from '#lib/settings/settings.svelte.ts';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { loadAccount } from '#lib/account/account.svelte.ts';
	import { buildCollisionWorld, segmentHit } from '#lib/shared/map/collision.ts';
	import { PIECES } from '#lib/shared/map/pieces.generated.ts';
	import { roomPoints } from '#lib/shared/map/points.ts';
	import { LEVEL_HEIGHT, cellKey, occupiedCells, worldCell } from '#lib/shared/map/grid.ts';
	import { nearExtract } from '#lib/shared/player/simulate.ts';
	import { CONDITIONS, isConditionId } from '#lib/content/player/conditions.ts';
	import { EXPEDITION } from '#lib/content/expedition.ts';
	import { bindingLabel, type Action } from '#lib/game/input/actions.ts';
	import type { MapLayout, Vec3 } from '#lib/shared/map/types.ts';
	import {
		HAND,
		type Inventory,
		type ItemStack,
		type PlayerFlags,
		type PlayerState
	} from '#lib/shared/player/types.ts';
	import type {
		AdminCommand,
		ClientMessage,
		ExpeditionSummary,
		ServerMessage
	} from '#lib/shared/protocol.ts';
	import AdminPanel from '#lib/ui/AdminPanel.svelte';
	import Captions from '#lib/ui/Captions.svelte';
	import CrateScreen from '#lib/ui/CrateScreen.svelte';
	import HelpScreen from '#lib/ui/HelpScreen.svelte';
	import GameMenu, { type MenuTab } from '#lib/ui/GameMenu.svelte';
	import MapScreen from '#lib/ui/MapScreen.svelte';
	import QuickWheel from '#lib/ui/QuickWheel.svelte';
	import MarkWheel from '#lib/ui/MarkWheel.svelte';
	import MarkLabel from '#lib/ui/MarkLabel.svelte';
	import { wheelChoice } from '#lib/ui/wheel.ts';
	import DownedScreen from '#lib/ui/DownedScreen.svelte';
	import ExpeditionResult from '#lib/ui/ExpeditionResult.svelte';
	import ExtractFade from '#lib/ui/ExtractFade.svelte';
	import DescentLoading from '#lib/ui/DescentLoading.svelte';
	import { preloadRun, type LoadProgress } from '#lib/game/preload.ts';
	import Hud from '#lib/ui/Hud.svelte';
	import RitePanel from '#lib/ui/RitePanel.svelte';
	import RoomBanner from '#lib/ui/RoomBanner.svelte';
	import ExpeditionClock from '#lib/ui/ExpeditionClock.svelte';
	import Settings from '#lib/ui/Settings.svelte';
	import SpectateBar from '#lib/ui/SpectateBar.svelte';
	import type { PartyMember } from '#lib/ui/PartyHealth.svelte';
	import StatsOverlay from '#lib/ui/StatsOverlay.svelte';
	import MapDebugPanel from '#lib/ui/MapDebugPanel.svelte';

	/*
	 * The expedition's game view. This page owns the engine, the camera, the map, the HUD, the
	 * screens and the input; each feature underground (ropes, chalk marks, crates, the rite...) is
	 * a PlayFeature in src/lib/game/play/ that it runs through hooks (docs/dev/play.md).
	 */

	/** The dev free camera: metres a second, the sprint multiple, mouse and stick turn rates. */
	const FREECAM = { speed: 8, fast: 4, mouse: 0.0022, stickTurn: 2.5, maxPitch: 1.55 };

	let canvas: HTMLCanvasElement;
	let panel = $state<PanelName | null>(null);
	/** The in-game menu's tab (GameMenu). */
	let menuTab = $state<MenuTab>('Pack');
	/** Every feature underground, by name (src/lib/game/play/index.ts); set once the engine is up. */
	let features = $state.raw<Features | null>(null);
	/** What the player carries, for the pack and crates (kept up to date while one is open). */
	let inventory = $state<Inventory | null>(null);
	const status = $derived(connection.status);
	const statusDetail = $derived(connection.detail);
	let sessionId = $state<string | null>(null);
	let playerId = $state<string | null>(null);
	/** This player's gamer tag as the server knows it (from tick snapshots), for the party HUD. */
	let selfName = '';
	let seed = $state<number | null>(null);
	let rooms = $state<string[]>([]);
	let flags = $state<PlayerFlags | null>(null);
	let stats = $state<FrameStats>({ fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, lights: 0 });
	let rtt = $state(0);
	let locked = $state(false);
	let mapView = $state(false);
	/** Dev: the map view flown through with the move keys and mouse, instead of orbited. */
	let freecam = $state(false);
	/** Dev: the cell and entrance grid drawn over the map view. */
	let gridView = $state(false);
	/** Dev: what the map is made of, for the map view's side panel. */
	let mapCounts = $state<MapDebugCounts | null>(null);
	let markers = $state(false);
	/** Dev: teammates' gamer tags drawn over the rock. */
	let tagsThroughWalls = $state(false);
	let spawned = $state(false);
	/** How far under the water the view is, 0..1 (the overlay follows the fog). */
	let underwater = $state(0);
	let hud = $state({
		battery: 1,
		volts: DEFAULT_HEADLAMP.volts,
		headlamp: 1,
		stance: 'stand',
		creep: false,
		prompt: null as string | null,
		promptKey: null as string | null,
		progress: 0,
		sanity: 1,
		hurt: 0,
		hand: null as { name: string; count: number } | null,
		ammo: null as { loaded: number; spare: number } | null,
		aiming: false,
		gloom: 0,
		party: [] as PartyMember[],
		conditions: [] as { id: string; name: string; description: string; left: number; of: number }[]
	});
	/** The quick-use wheel while its key is held: the slots, the pointer and the slot it is on. */
	let wheel = $state<{
		slots: (ItemStack | null)[];
		pointer: { x: number; y: number };
		chosen: number;
	} | null>(null);
	/** The game's input map, for the map screen's keys and sticks. */
	let gameInput = $state.raw<InputMap | null>(null);
	let playUi = (id: SoundId): void => {
		void id;
	};
	/** Set while downed: bleed-out time left (0..1), what happens next, and the hold to surrender. */
	let downed = $state<{ remaining: number; message: string; surrender: number } | null>(null);
	/** Set when this player has left the expedition (climbed out or died); shows the results. */
	let result = $state<{
		summary: ExpeditionSummary;
		/** The Affliction's name, as it was underground. */
		affliction: string;
		outcome: 'extracted' | 'died' | 'lost' | 'abandoned' | 'resolved';
		/** Set after spectating: how many of the others got out. */
		escaped: number | null;
		/** What was carried out and kept; null when it was lost. */
		carried: ItemStack[] | null;
	} | null>(null);
	/**
	 * Where the surface begins: the loadout once the result has been read (to put the haul away,
	 * or to kit out again); the dashboard when the page was opened with no expedition to show.
	 */
	let surface = $state<'/(hub)' | '/(hub)/loadout'>('/(hub)');
	/** Leaving alive: the "Extracting" fade plays over the world before the results show. */
	let extracting = $state(false);
	/** Dead and watching a teammate; `name` is who (empty while nobody can be shown). */
	let spectating = $state<{ name: string } | null>(null);
	let spectateNext = (): void => {};
	let spectateStop = (): void => {};
	/** Room banner currently showing; `key` restarts the animation for each new room. */
	let banner = $state<{ title: string; subtitle?: string; key: number } | null>(null);
	/** Down in the catacombs (between `welcome` and extracting, dying or abandoning). */
	let expedition = $state(false);
	/** The run's assets are still loading (see src/lib/game/preload.ts): the loading bar shows. */
	let loading = $state<LoadProgress | null>(null);
	let send = (message: ClientMessage): void => {
		void message;
	};

	const audio = new AudioManager({ ...settings.audio });
	const captions = new CaptionFeed();
	let applyGraphics = (): void => {};
	let setMapView = (enabled: boolean): void => {
		mapView = enabled;
	};
	let setFreecam = (enabled: boolean): void => {
		freecam = enabled;
	};
	let setGridView = (enabled: boolean): void => {
		gridView = enabled;
	};
	/** Dev, in the free camera: your body to where the camera is, and back into it. */
	let bodyToCamera = (): void => {};
	/** Dev, in the free camera: the camera back to where your body is, still flying. */
	let cameraToBody = (): void => {};
	let setMarkers = (enabled: boolean): void => {
		markers = enabled;
	};
	let sendAdmin = (command: AdminCommand): void => {
		void command;
	};

	/*
	 * This page is the expedition and nothing else: with none to show (it is over and its result
	 * has been read, or the page was opened on the surface), go back to the surface and the party.
	 */
	$effect(() => {
		if (connection.status !== 'connected' || !connection.party) return;
		if (expedition || spectating || result || connection.welcome || me()?.inExpedition) return;
		void goto(resolve(surface));
	});
	let sendInventory = (action: InventoryAction): void => {
		void action;
	};

	/** Capture the pointer again for mouse play; the controller plays without it. */
	function capture(): void {
		if (device.kind !== 'pad') void canvas.requestPointerLock();
	}

	/** Done with the loot crate: tell the server, and straight back to play. */
	function closeCrate(): void {
		features?.crates.close();
	}

	/**
	 * Back to play from the admin screen: moving does it, so you can try a change at once.
	 * A key press counts as a user gesture, so the pointer can be captured again here.
	 */
	function closeAdmin(): void {
		if (panel !== 'admin') return;
		panel = null;
		if (expedition && (!mapView || freecam)) capture();
	}

	function toggle(name: PanelName): void {
		// With a crate open, the pack and menu keys put it away and nothing more.
		if (panel === 'crate') {
			closeCrate();
			if (name === 'menu' || name === 'settings') return;
		}
		// Esc on the admin screen just closes it; Esc again opens settings. (Esc can't capture the
		// pointer: browsers don't count it as a user gesture. A click or a move key does.)
		if (panel === 'admin' && name === 'settings') {
			panel = null;
			return;
		}
		const closing = panel === name;
		// The menu and the map only open down there and on your feet: never while down or dead.
		const underground = expedition && spawned && !downed;
		if ((name === 'menu' || name === 'map') && !closing && !underground) return;
		// The menu always opens on the pack.
		if (name === 'menu' && !closing) menuTab = 'Pack';
		// No notebook, no map: the HUD says so for a moment.
		if (name === 'map' && !closing && !features?.survey.canOpen()) return;
		const wasMap = panel === 'map';
		panel = closing ? null : name;
		if (wasMap !== (panel === 'map')) playUi(wasMap ? 'map.close' : 'map.open');
		if (panel) document.exitPointerLock();
		// Putting the menu or the map away goes straight back to play.
		else if ((name === 'menu' || name === 'map') && expedition) capture();
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
		const debugGrid = new MapDebugGrid();
		engine.scene.add(debugGrid.root);

		// The player's head: where their eyes are and which way they look. It is the camera,
		// except over the shoulder, where the camera hangs back and the lamp stays on the head.
		const head = new THREE.Object3D();
		head.rotation.order = 'YXZ';
		engine.scene.add(head);
		const headlamp = new Headlamp(head);
		/** Your own body, drawn only when the camera is outside it. */
		const body = new PlayerBody();
		body.root.visible = false;
		engine.scene.add(body.root);
		const shoulderOffset = new THREE.Vector3();
		applyGraphics = () => {
			engine.applyGraphics(settings.graphics);
			headlamp.setShadows(settings.graphics.quality !== 'low', engine.shadowMapSize);
			remote.setShadows(
				settings.graphics.quality !== 'low',
				engine.shadowMapSize,
				settings.graphics.teammateShadows
			);
		};
		applyGraphics();

		/** Player being watched while spectating. */
		let watchId: string | null = null;
		/** The site-wide connection (the dashboard's too): this page only listens in on it. */
		const client = gameClient();
		const unsubscribeNet = subscribe({
			onStatus: (next) => {
				playerId = client.playerId;
				if (next !== 'connected' && (expedition || spectating)) endExpedition();
			},
			onMessage: (message: ServerMessage) => {
				switch (message.type) {
					case 'welcome':
						sessionId = message.sessionId;
						playerId = message.playerId;
						result = null;
						expedition = true;
						loadMap(message.layout, !message.resumed);
						break;
					case 'extracted':
					case 'died':
					case 'abandoned':
						result = {
							summary: {
								seconds: message.seconds,
								deepestLevel: message.deepestLevel,
								kills: message.kills,
								crates: message.crates,
								clues: message.clues
							},
							affliction: all.affliction.name,
							// Out alive after banishing what the rite summoned; or lost when time ran out.
							outcome:
								message.type === 'extracted' && all.rite.known?.resolved
									? 'resolved'
									: message.type === 'died' && message.lost
										? 'lost'
										: message.type,
							escaped: null,
							carried:
								message.type === 'died' || message.type === 'abandoned' ? null : message.carried
						};
						surface = '/(hub)/loadout';
						if (message.type === 'died') {
							if (message.spectating) startSpectating();
							else endExpedition();
						} else {
							leave();
						}
						break;
					case 'spectateEnd':
						if (!spectating) break;
						if (result) result.escaped = message.escaped;
						endExpedition();
						break;
					case 'map':
						loadMap(message.layout);
						break;
					case 'tick':
						// A tick still in flight after we left is not ours to show.
						if (!expedition && !spectating) break;
						for (const snap of message.players) {
							if (snap.id !== client.playerId) continue;
							player.onSnapshot(snap);
							selfName = snap.name;
							flags = { ...snap.state.flags };
						}
						remote.apply(message.players, client.playerId, message.serverTime);
						creatures.apply(message.creatures);
						for (const feature of list) feature.tick?.(message);
						for (const event of message.events) {
							for (const feature of list) feature.event?.(event);
						}
						return;
				}
				for (const feature of list) feature.message?.(message);
			}
		});
		const player = new LocalPlayer(input, client);
		const sounds = new SoundBank(audio);
		gameInput = input;
		playUi = (id) => sounds.play(id);
		sounds.oncaption = (cue) => {
			if (settings.accessibility.captions) captions.push(cue);
		};
		const playerAudio = new PlayerAudio(sounds, map.root);
		const ambience = new Ambience(audio, sounds);
		const creatures = new Creatures(sounds);
		engine.scene.add(creatures.root);
		const viewModel = new ViewModel(engine.viewScene, engine.viewCamera);
		const water = new Underwater(engine.scene);
		/** The low drone heard with your head under, started on first use. */
		let waterDrone: { setVolume(v: number): void; stop(): void } | null = null;
		let waterDroneStarting = false;
		setMarkers = (enabled) => {
			markers = enabled;
			creatures.setMarkers(enabled);
		};
		const lookDir = new THREE.Vector3();

		/** World cell + level -> title of the room there (titled start, major and extraction rooms). */
		let roomCells: Record<string, string> = {};
		/** World cell + level -> which titled room (its placement index), so two alike are told apart. */
		let roomIds: Record<string, number> = {};
		/** The titled room the player was last in; null in the passages between. */
		let inRoom: number | null = null;
		/** Its title, for bug reports. */
		let roomName: string | null = null;
		let bannerCheck = 0;

		/** The map cell (with its level) a position is in. */
		function cellOf(position: Vec3): string {
			const [cx, cz] = worldCell(position[0], position[2]);
			const level = Math.floor((position[1] + 0.5) / LEVEL_HEIGHT);
			return cellKey(cx, cz, level);
		}

		const ui: PlayUi = {
			get inWorld() {
				return expedition || !!spectating;
			},
			get expedition() {
				return expedition;
			},
			get downed() {
				return !!downed;
			},
			get quickWheelOpen() {
				return !!wheel;
			},
			get panel() {
				return panel;
			},
			set panel(next) {
				panel = next;
			},
			banner: (title, subtitle) => {
				banner = { title, subtitle, key: (banner?.key ?? 0) + 1 };
			},
			capture,
			roomTitleAt: (position) => roomCells[cellOf(position)]
		};
		const all = createFeatures({
			engine,
			canvas,
			input,
			audio,
			sounds,
			ambience,
			client,
			player,
			remote,
			map,
			creatures,
			viewModel,
			head,
			headlamp,
			ui
		});
		features = all;
		/** The same, in order: their hooks run in this order. */
		const list: PlayFeature[] = Object.values(all);

		/** Which map load is current: a newer one (or leaving) makes an older one's finish moot. */
		let loadId = 0;

		/**
		 * Build a map from the server's layout. Everything the run needs loads behind the loading
		 * bar first; `arrived` (just got here, not back after a reconnect) plays the descent once
		 * it is done.
		 */
		function loadMap(layout: MapLayout, arrived = false): void {
			seed = layout.seed;
			roomCells = {};
			roomIds = {};
			inRoom = null;
			layout.placements.forEach((placement, index) => {
				const title = MAP_KIT[placement.piece]?.title;
				const piece = PIECES[placement.piece];
				if (!title || !piece) return;
				for (const [x, z, level] of occupiedCells(piece, placement)) {
					roomCells[cellKey(x, z, level)] = title;
					roomIds[cellKey(x, z, level)] = index;
				}
			});
			rooms = roomPoints(layout, PIECES, MAP_KIT).map((room) => room.name);
			const id = ++loadId;
			loading = { loaded: 0, total: 0 };
			void Promise.all([
				preloadRun(layout, audio, (progress) => {
					if (id === loadId) loading = progress;
				}),
				map.build(layout)
			])
				.finally(() => {
					if (id !== loadId) return;
					loading = null;
					if (arrived) descend();
				})
				.catch((error) => console.error('Map load failed', error));
			const grid = mapDebugGrid(layout, PIECES, MAP_KIT);
			debugGrid.build(grid);
			mapCounts = grid.counts;
			const world = buildCollisionWorld(layout, PIECES);
			player.setWorld(world);
			for (const feature of list) feature.mapLoaded?.(layout, world);
			ambience.setMap(layout, world);
		}

		sendAdmin = (command) => client.send({ type: 'admin', command });
		send = (message) => client.send(message);
		sendInventory = (action) => {
			client.send({ type: 'inventory', action });
			// Something put down in a slot. (A drop is heard when it lands on the floor.)
			if (action.kind !== 'drop') sounds.play('inventory.drop');
		};
		/** The inventory last shown, as JSON: the screen only updates when it changes. */
		let shownInventory = '';

		/** Back on the surface: drop everything that belonged to the expedition. */
		function endExpedition(): void {
			expedition = false;
			if (freecam) setFreecam(false);
			loadId++;
			loading = null;
			if (panel === 'menu' || panel === 'crate' || panel === 'map') panel = null;
			water.reset();
			underwater = 0;
			spectating = null;
			watchId = null;
			remote.setHidden(null);
			for (const feature of list) feature.left?.();
			for (const feature of list) feature.clear?.();
			player.leave();
			ambience.clear();
			remote.clear();
			creatures.clear();
			banner = null;
			downed = null;
			captions.clear();
			player.closeWheel();
			wheel = null;
			document.exitPointerLock();
			// What was learned or carried out shows on the surface.
			void loadAccount();
		}

		/** Just arrived underground (not back after a reconnect): the descent stinger. */
		function descend(): void {
			void audio.unlock().then(() => sounds.play('expedition.intro'));
		}

		let leaveTimer: ReturnType<typeof setTimeout> | null = null;
		/**
		 * Out alive (climbed out, abandoned, banished, resolved): the world stays a moment under the
		 * "Extracting" fade and the outro, then the expedition is put away and the results show.
		 */
		function leave(): void {
			extracting = true;
			panel = null;
			all.crates.open = null;
			player.closeWheel();
			wheel = null;
			all.marks.wheel = null;
			document.exitPointerLock();
			sounds.play('expedition.outro');
			if (leaveTimer) clearTimeout(leaveTimer);
			leaveTimer = setTimeout(() => {
				leaveTimer = null;
				extracting = false;
				if (expedition) endExpedition();
			}, EXPEDITION.leaveFadeSeconds * 1000);
		}

		/** Dead, with others still down there: keep the world and watch through their eyes. */
		function startSpectating(): void {
			expedition = false;
			if (panel === 'menu' || panel === 'crate') panel = null;
			spectating = { name: '' };
			watchId = null;
			player.leave();
			for (const feature of list) feature.left?.();
			banner = null;
			downed = null;
			document.exitPointerLock();
		}

		/** The view of the player being watched; moves on to someone else if they are gone. */
		function watchedView(): ReturnType<RemotePlayers['view']> {
			const others = remote.list();
			const target = others.find((other) => other.id === watchId) ?? others[0];
			if (!target) {
				if (spectating?.name) spectating = { name: '' };
				return null;
			}
			if (target.id !== watchId || spectating?.name !== target.name) {
				watchId = target.id;
				remote.setHidden(target.id);
				spectating = { name: target.name };
			}
			return remote.view(target.id);
		}

		spectateNext = () => {
			const others = remote.list();
			const index = others.findIndex((other) => other.id === watchId);
			watchId = others[(index + 1) % Math.max(1, others.length)]?.id ?? null;
		};
		spectateStop = () => {
			client.send({ type: 'stopSpectating' });
			endExpedition();
		};

		/** Show a room's banner every time the player walks into it. */
		function checkRoom(position: Vec3): void {
			const key = cellOf(position);
			const room = roomIds[key] ?? null;
			if (room === inRoom) return;
			inRoom = room;
			const title = roomCells[key];
			roomName = room !== null ? (title ?? null) : null;
			if (room !== null && title) banner = { title, key: (banner?.key ?? 0) + 1 };
		}

		/** What a bug report says about the expedition (docs/dev/reports.md). */
		setGameContext(() =>
			expedition
				? {
						mode: hud.party.length > 1 ? 'coop' : 'solo',
						seed,
						room: roomName,
						stats: { ...stats, rtt }
					}
				: null
		);

		/** What is in the hand, ammo and aiming for the HUD. */
		function itemHud(state: PlayerState): Pick<typeof hud, 'hand' | 'ammo' | 'aiming'> {
			const inv = state.inventory;
			const stack = held(inv);
			const gun = stack ? ITEMS[stack.item]?.firearm : undefined;
			return {
				hand:
					stack && settings.interface.quickSlots
						? { name: ITEMS[stack.item]?.name ?? stack.item, count: stack.count }
						: null,
				ammo:
					gun && stack ? { loaded: stack.loaded ?? 0, spare: carriedCount(inv, gun.ammo) } : null,
				aiming: state.weapon.aiming
			};
		}

		/**
		 * The quick-use wheel: open while its key is held (and there is something to choose);
		 * letting go takes the slot the pointer is on in the hand.
		 */
		function updateWheel(state: PlayerState | null, active: boolean): void {
			const holding = active && !!state && !state.downed && input.isDown('quickUse');
			if (!wheel) {
				if (!holding || all.marks.wheel || !state.inventory.quick.some((slot) => slot)) return;
				player.openWheel();
			}
			const slots = state?.inventory.quick ?? [];
			const pointer = player.wheelPointer ?? { x: 0, y: 0 };
			const chosen = wheelChoice(pointer, slots);
			if (holding) {
				wheel = { slots: slots.map((slot) => (slot ? { ...slot } : null)), pointer, chosen };
				return;
			}
			player.closeWheel();
			wheel = null;
			if (state && chosen >= 0) player.take(HAND.quick + chosen);
		}

		/**
		 * What interact would take, the same rules as the server: each feature in turn, the first
		 * to claim it has it (a floor item, then a crate, a door, your own chalk mark).
		 */
		function findTargets(state: PlayerState): void {
			const world = player.collision;
			const aim =
				world && !state.downed && !state.swimming
					? { world, ...aimRay(state, eyeHeight(state)) }
					: null;
			let taken = false;
			for (const feature of list) {
				if (feature.target?.(state, aim, taken)) taken = true;
			}
		}

		/** What is worn's shield left, 0..1; null with nothing worn. */
		function shieldFill(state: PlayerState): number | null {
			const shield = shieldOf(state.inventory);
			return shield ? shield.left / shield.max : null;
		}

		/** Everyone on the expedition for the party HUD: teammates first, this player last. */
		function party(state: PlayerState): PartyMember[] {
			const member = (id: string, name: string, one: PlayerState, self: boolean) => ({
				id,
				name,
				self,
				health: one.sanity / SANITY.max,
				// Teammates' gear isn't in the snapshot: only this player's own shield shows.
				shield: self ? shieldFill(one) : null,
				stamina: one.stamina / MOVEMENT.stamina.max,
				exhausted: one.exhausted,
				underwater: one.underwater,
				downed: one.downed
			});
			return [
				...remote.players().map((one) => member(one.id, one.name, one.state, false)),
				member(playerId ?? 'self', selfName, state, true)
			];
		}

		/**
		 * The one held-action prompt to show, with its progress. The order is which wins when
		 * more than one could show: a new prompt goes where it belongs in it.
		 */
		function heldPrompt(state: PlayerState): {
			prompt: string | null;
			promptKey?: string;
			progress: number;
		} {
			const none = { prompt: null, progress: 0 };
			// The only thing a downed player can still do: climb out.
			if (state.downed) return extractPrompt(state) ?? none;
			return (
				all.survey.prompt() ??
				all.ropes.climbPrompt(state) ??
				all.vitals.prompt(state) ??
				all.rite.prompt(state) ??
				extractPrompt(state) ??
				all.crates.prompt(state) ??
				all.pack.prompt(state) ??
				all.doors.prompt(state) ??
				all.marks.prompt(state) ??
				all.ropes.gearPrompt(state) ??
				none
			);
		}

		function extractPrompt(state: PlayerState): Prompt | null {
			const world = player.collision;
			if (!world || state.swimming || !nearExtract(world, state)) return null;
			return keyPrompt('interact', 'to climb out', state.extracting / EXPEDITION.extractSeconds);
		}

		setMapView = (enabled) => {
			mapView = enabled;
			freecam = false;
			orbit.enabled = enabled;
			debugLight.visible = enabled;
			debugGrid.setVisible(enabled && gridView);
			if (enabled) {
				document.exitPointerLock();
				const eye = player.eyePosition();
				if (eye) {
					orbit.target.set(eye[0], eye[1], eye[2]);
					engine.camera.position.set(eye[0] + 8, eye[1] + 12, eye[2] + 8);
				}
			}
		};

		/** The free camera's own look, apart from the player's. */
		const fly = { yaw: 0, pitch: 0 };
		const flyMove = new THREE.Vector3();
		/**
		 * Dev: the map view flown from where you stand, with the move keys (climb and swim down for
		 * up and down, sprint for faster) and the mouse or sticks. The player stays where they were.
		 */
		setFreecam = (enabled) => {
			if (enabled && !devMode) return;
			setMapView(enabled);
			freecam = enabled;
			orbit.enabled = false;
			if (!enabled) {
				if (expedition && !panel) capture();
				return;
			}
			const eye = player.eyePosition();
			const look = player.look();
			if (eye) engine.camera.position.set(eye[0], eye[1], eye[2]);
			fly.yaw = look.yaw;
			fly.pitch = look.pitch;
			capture();
		};

		bodyToCamera = () => {
			if (!freecam) return;
			const { x, y, z } = engine.camera.position;
			sendAdmin({ kind: 'teleportTo', position: [x, y, z] });
			player.face(fly.yaw, fly.pitch);
			setFreecam(false);
		};

		cameraToBody = () => {
			if (!freecam) return;
			const eye = player.eyePosition();
			const look = player.look();
			if (eye) engine.camera.position.set(eye[0], eye[1], eye[2]);
			fly.yaw = look.yaw;
			fly.pitch = look.pitch;
		};

		setGridView = (enabled) => {
			gridView = enabled;
			debugGrid.setVisible(mapView && enabled);
		};

		function flyFreecam(delta: number): void {
			const [dx, dy] = input.consumeLook();
			if (panel) return;
			const look = input.lookStick();
			const mouse = FREECAM.mouse * settings.controls.mouseSensitivity;
			fly.yaw -= dx * mouse + look.x * FREECAM.stickTurn * delta;
			fly.pitch -=
				(dy * mouse + look.y * FREECAM.stickTurn * delta) * (settings.controls.invertY ? -1 : 1);
			fly.pitch = Math.max(-FREECAM.maxPitch, Math.min(FREECAM.maxPitch, fly.pitch));
			engine.camera.rotation.set(fly.pitch, fly.yaw, 0);
			const keys = (pos: Action, neg: Action) =>
				(input.isDown(pos) ? 1 : 0) - (input.isDown(neg) ? 1 : 0);
			const stick = input.moveStick();
			const pushed = Math.hypot(stick.x, stick.y) > 0;
			flyMove.set(
				pushed ? stick.x : keys('moveRight', 'moveLeft'),
				keys('climb', 'swimDown'),
				pushed ? stick.y : -keys('moveForward', 'moveBack')
			);
			if (flyMove.lengthSq() === 0) return;
			const speed = FREECAM.speed * (input.isDown('sprint') ? FREECAM.fast : 1);
			// Up and down stay straight up and down; the rest follows where you look.
			const vertical = flyMove.y;
			flyMove.y = 0;
			flyMove.applyQuaternion(engine.camera.quaternion);
			flyMove.y += vertical;
			engine.camera.position.addScaledVector(flyMove, speed * delta);
		}

		// Usually the expedition began while the dashboard was showing: its `welcome` is waiting.
		start();
		if (connection.welcome) {
			const { sessionId: id, playerId: self, layout } = connection.welcome;
			sessionId = id;
			playerId = self;
			expedition = true;
			loadMap(layout, !connection.welcome.resumed);
			for (const feature of list) feature.restore?.();
		}

		const onLockChange = () => (locked = document.pointerLockElement === canvas);
		document.addEventListener('pointerlockchange', onLockChange);
		const requestLock = () => {
			void audio.unlock();
			if (!panel && (!mapView || freecam) && !spectating && !extracting && !loading) {
				void canvas.requestPointerLock();
			}
		};
		canvas.addEventListener('click', requestLock);

		engine.onUpdate((delta) => {
			// A controller can't capture the pointer (browsers don't count it as a gesture): while it
			// is the device in use, the game plays without.
			// Before the player reads the mouse: in the free camera, the mouse is the camera's.
			if (freecam) flyFreecam(delta);
			const active = (locked || device.kind === 'pad') && !panel && !mapView && !extracting;
			// With the menu open the keys still walk, but the hands are on it (docs/dev/items.md).
			const reading = panel === 'menu' && !mapView && !extracting;
			updateWheel(player.state, active);
			all.marks.updateWheel(player.state, active);
			player.update(delta, active, reading);
			remote.setTags(settings.interface.gamerTags, tagsThroughWalls);
			remote.update(delta, engine.camera);
			const self = player.state;
			const lamps = self ? [self, ...remote.states()] : [...remote.states()];
			creatures.update(delta, player.collision, lamps);
			// Only on your feet: crouched, crawling or swimming, the body fills the view from
			// behind, so those are always first person.
			const upright = player.state?.stance === 'stand' && !player.state.swimming;
			const shoulder = settings.graphics.view === 'shoulder' && !mapView && !spectating && upright;
			let outside = mapView;
			if (mapView) {
				if (!freecam) orbit.update();
			} else if (spectating) {
				const view = watchedView();
				if (view) {
					engine.camera.position.set(...view.position);
					engine.camera.rotation.set(view.pitch, view.yaw, 0);
				}
			} else {
				const eye = player.eyePosition();
				const look = player.look();
				if (eye) engine.camera.position.set(eye[0], eye[1], eye[2]);
				if (eye && shoulder) {
					// Behind and to the right of the head, pulled in short of anything in the way.
					const { right, up, back, margin, hideWithin } = SHOULDER_CAMERA;
					head.rotation.set(look.pitch, look.yaw, 0);
					shoulderOffset.set(right, up, back).applyQuaternion(head.quaternion);
					const length = shoulderOffset.length();
					const world = player.collision;
					const hit = world
						? segmentHit(world, eye, [
								eye[0] + shoulderOffset.x,
								eye[1] + shoulderOffset.y,
								eye[2] + shoulderOffset.z
							])
						: null;
					const reach = hit === null ? length : Math.max(0, hit * length - margin);
					engine.camera.position.addScaledVector(shoulderOffset, reach / length);
					// Squeezed right up against the head: don't draw it from the inside.
					outside = reach > hideWithin;
				}
				const shake = all.vitals.shake;
				const amount = shake * shake * 0.05 * settings.graphics.cameraShake;
				// Downed: the view tilts, lying on the floor.
				const roll = player.state?.downed && !shoulder ? 0.35 : 0;
				engine.camera.rotation.set(
					look.pitch + (Math.random() * 2 - 1) * amount,
					look.yaw + (Math.random() * 2 - 1) * amount,
					roll
				);
				if (eye && shoulder) head.position.set(eye[0], eye[1], eye[2]);
			}
			// Everywhere but over the shoulder, the head is the camera.
			if (!shoulder) {
				head.position.copy(engine.camera.position);
				head.rotation.copy(engine.camera.rotation);
			}
			head.updateMatrixWorld();
			const state = player.state;
			const feet = player.feetPosition();
			body.root.visible = outside && !!state && !!feet;
			if (state && feet) {
				body.root.position.set(feet[0], feet[1], feet[2]);
				body.update(delta, state, player.look().yaw);
			}
			// With your body drawn, the lamp goes out in front of its head.
			headlamp.setForward(shoulder ? PLAYER_MODEL.lampForward : 0);
			headlamp.update(state);
			viewModel.update(delta, state, !mapView && !result && !shoulder);
			// Aiming down the sights narrows the view, and slows the mouse to match.
			const zoom = viewModel.zoom();
			engine.setZoom(zoom);
			player.lookScale = zoom;
			playerAudio.update(state, audio.unlocked);
			const cam = engine.camera.position;
			engine.camera.getWorldDirection(lookDir);
			audio.setListener([cam.x, cam.y, cam.z], [lookDir.x, lookDir.y, lookDir.z]);
			ambience.update(delta, [cam.x, cam.y, cam.z], state);
			underwater = water.update(
				!mapView && Underwater.below(player.collision, [cam.x, cam.y, cam.z]),
				delta
			);
			if (underwater > 0 && audio.unlocked && !waterDrone && !waterDroneStarting) {
				waterDroneStarting = true;
				void sounds.loop('underwater.drone').then((handle) => (waterDrone = handle));
			}
			waterDrone?.setVolume(underwater);
			for (const feature of list) feature.update?.(delta);
			creatures.listen(delta, [cam.x, cam.y, cam.z]);
			captions.update();
			spawned = !!state;
			if (state) {
				findTargets(state);
				for (const feature of list) feature.self?.(state, delta);
				hud = {
					battery: state.battery,
					volts: state.battery * DEFAULT_HEADLAMP.volts,
					headlamp: state.headlamp,
					stance: state.stance,
					creep: player.modes.creep,
					promptKey: null,
					...heldPrompt(state),
					sanity: state.sanity / SANITY.max,
					hurt: all.vitals.hurts,
					...itemHud(state),
					gloom: state.gloom,
					party: party(state),
					conditions: state.conditions.flatMap((c) => {
						if (!isConditionId(c.id)) return [];
						const def = CONDITIONS[c.id];
						return [
							{
								id: c.id,
								name: def.name,
								description: def.description,
								left: c.remaining,
								of: def.seconds
							}
						];
					})
				};
				if (state.downed && !downed) rumble('downed');
				downed = state.downed
					? {
							remaining: 1 - state.downedTime / SANITY.bleedOut,
							message: all.vitals.downedMessage(state),
							surrender: Math.max(0, state.surrendering) / SANITY.surrenderSeconds
						}
					: null;
				if (panel === 'menu' || panel === 'crate') {
					if (state.downed && panel === 'menu') {
						panel = null;
					} else {
						const json = JSON.stringify(state.inventory);
						if (json !== shownInventory || !inventory) {
							shownInventory = json;
							inventory = JSON.parse(json) as Inventory;
						}
					}
				}
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
				case 'inventory':
					toggle('menu');
					break;
				case 'map':
					toggle('map');
					break;
				// Walking away from a loot crate puts it away; moving also leaves the admin screen.
				case 'moveForward':
				case 'moveBack':
				case 'moveLeft':
				case 'moveRight':
				case 'climb':
				case 'stance':
					closeCrate();
					closeAdmin();
					break;
				case 'toggleView':
					settings.graphics.view = settings.graphics.view === 'shoulder' ? 'first' : 'shoulder';
					saveSettings();
					break;
				case 'toggleRitePanel':
					settings.interface.ritePanel = !settings.interface.ritePanel;
					saveSettings();
					sounds.play('ui.toggle');
					break;
				case 'toggleStats':
					settings.interface.showStats = !settings.interface.showStats;
					saveSettings();
					break;
				case 'toggleAdmin':
					if (devMode) toggle('admin');
					break;
				// In the free camera: interact moves your body here, reload brings the camera back to it.
				case 'interact':
					if (freecam && !panel) {
						bodyToCamera();
						sounds.play('ui.toggle');
					}
					break;
				case 'reload':
					if (freecam && !panel) {
						cameraToBody();
						sounds.play('ui.toggle');
					}
					break;
				case 'toggleFreecam':
					if (devMode && expedition) {
						setFreecam(!freecam);
						sounds.play('ui.toggle');
					}
					break;
			}
		});

		return () => {
			if (leaveTimer) clearTimeout(leaveTimer);
			setGameContext(null);
			unsubscribe();
			document.removeEventListener('pointerlockchange', onLockChange);
			canvas.removeEventListener('click', requestLock);
			document.exitPointerLock();
			waterDrone?.stop();
			for (const feature of list) feature.dispose?.();
			creatures.dispose();
			viewModel.dispose();
			playerAudio.dispose();
			ambience.dispose();
			player.dispose();
			headlamp.dispose();
			body.dispose();
			remote.dispose();
			orbit.dispose();
			debugGrid.dispose();
			input.dispose();
			unsubscribeNet();
			engine.dispose();
			audio.dispose();
		};
	});
</script>

<canvas bind:this={canvas} class:pad={device.kind === 'pad'}></canvas>

{#if spawned && !mapView && !result}
	<Hud {...hud} lampKey={promptCode('headlamp')} />
{/if}

{#if wheel && spawned && !mapView && !result}
	<QuickWheel slots={wheel.slots} pointer={wheel.pointer} chosen={wheel.chosen} />
{/if}

{#if features?.marks.wheel && spawned && !mapView && !result}
	<MarkWheel
		symbols={features.marks.symbols}
		pointer={features.marks.wheel.pointer}
		chosen={features.marks.wheel.chosen}
	/>
{/if}

{#if features?.marks.label && spawned && !panel && !mapView && !result}
	<MarkLabel
		name={features.marks.label.name}
		x={features.marks.label.x}
		y={features.marks.label.y}
	/>
{/if}

{#if settings.accessibility.captions && spawned && !mapView && !result}
	<Captions captions={captions.list} size={settings.accessibility.captionSize} />
{/if}

{#if underwater > 0 && !mapView && !result}
	<UnderwaterOverlay amount={underwater} />
{/if}

{#if downed && spawned && !mapView && !result}
	<DownedScreen
		remaining={downed.remaining}
		message={downed.message}
		surrender={downed.surrender}
		surrenderKey={promptCode('climb')}
	/>
{/if}

{#if features?.rite.known && !panel && !mapView && !result}
	<div class="rite-hud">
		<RitePanel
			affliction={features.affliction.name}
			rite={features.rite.known}
			carriers={features.rite.carriers}
			interactKey={promptCode('interact')}
			open={settings.interface.ritePanel}
			toggleKey={promptCode('toggleRitePanel')}
		/>
	</div>
	{#if features.affliction.deadline !== null}
		<ExpeditionClock seconds={features.affliction.deadline} />
	{/if}
{/if}

{#if banner && spawned && !mapView && !result}
	{#key banner.key}
		<RoomBanner title={banner.title} subtitle={banner.subtitle} />
	{/key}
{/if}

{#if spectating}
	{#if !panel}
		<SpectateBar
			name={spectating.name}
			onnext={() => spectateNext()}
			onleave={() => spectateStop()}
		/>
	{/if}
{:else if extracting}
	<ExtractFade seconds={EXPEDITION.leaveFadeSeconds} />
{:else if result}
	<ExpeditionResult
		summary={result.summary}
		affliction={result.affliction}
		outcome={result.outcome}
		escaped={result.escaped}
		carried={result.carried}
		oncontinue={() => {
			result = null;
			void loadAccount();
		}}
	/>
{/if}

{#if loading}
	<DescentLoading progress={loading} />
{/if}

{#if !locked && device.kind !== 'pad' && !panel && !mapView && !result && expedition && !loading && status === 'connected'}
	<button type="button" class="descend" onclick={() => canvas.requestPointerLock()}>
		Take Control
	</button>
{/if}

{#if device.lost && expedition}
	<div class="pad-lost" role="status">Controller disconnected</div>
{/if}

{#if status === 'disconnected' || status === 'connecting'}
	<div class="reconnect" role="status">
		{status === 'disconnected' ? 'Connection lost. Reconnecting...' : 'Connecting...'}
	</div>
{/if}

<div class="status" class:ok={status === 'connected'}>
	{status}{statusDetail ? `: ${statusDetail}` : ''}
</div>

{#if devMode && mapView && mapCounts}
	<MapDebugPanel counts={mapCounts} {seed} {freecam} />
{/if}

{#if settings.interface.showStats}
	<StatsOverlay {stats} {rtt} />
{/if}

{#if panel === 'settings'}
	<Settings
		dim
		onclose={() => (panel = null)}
		onvolume={(category, value) => audio.setVolume(category, value)}
		ongraphics={() => applyGraphics()}
	/>
{:else if panel === 'help'}
	<HelpScreen dim onclose={() => (panel = null)} />
{:else if panel === 'menu' && inventory && features}
	<GameMenu
		bind:tab={menuTab}
		{inventory}
		affliction={features.affliction.name}
		rite={features.rite.known}
		carriers={features.rite.carriers}
		interactKey={promptCode('interact')}
		onaction={(action) => sendInventory(action)}
		onabandon={() => {
			panel = null;
			send({ type: 'abandon' });
		}}
		onmap={() => toggle('map')}
		onclose={() => toggle('menu')}
	/>
{:else if panel === 'map' && features?.survey.map && gameInput}
	<MapScreen
		map={features.survey.map}
		drawn={features.survey.drawn}
		self={features.survey.view.self}
		marks={features.marks.all}
		input={gameInput}
		sketch={features.survey.view.sketch}
		share={features.survey.view.share}
		partner={features.survey.view.partner}
		onhold={(hold) => features?.survey.hold(hold)}
		onpack={() => toggle('menu')}
		onclose={() => toggle('map')}
	/>
{:else if panel === 'crate' && inventory && features?.crates.open}
	<CrateScreen
		{inventory}
		title={features.crates.open.corpse ? 'Corpse' : 'Crate'}
		slots={features.crates.open.slots}
		reveal={features.crates.open.reveal}
		moveKeys={(['moveForward', 'moveLeft', 'moveBack', 'moveRight'] as const)
			.map((action) => bindingLabel(settings.bindings[action][0] ?? ''))
			.filter((label) => label)
			.join(' / ')}
		onaction={(action) => sendInventory(action)}
		onclose={() => closeCrate()}
	/>
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
		{freecam}
		{gridView}
		{markers}
		{tagsThroughWalls}
		meter={features?.affliction.meter ?? null}
		omen={features?.affliction.omen ?? 0}
		onadmin={(command) => sendAdmin(command)}
		onmapview={(enabled) => setMapView(enabled)}
		onfreecam={(enabled) => {
			panel = null;
			setFreecam(enabled);
		}}
		ongridview={(enabled) => setGridView(enabled)}
		onbodytocamera={() => {
			panel = null;
			bodyToCamera();
		}}
		oncameratobody={() => {
			panel = null;
			cameraToBody();
			capture();
		}}
		onmarkers={(enabled) => setMarkers(enabled)}
		ontagsthroughwalls={(enabled) => (tagsThroughWalls = enabled)}
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

	/* Playing with a controller: no cursor over the game. */
	canvas.pad {
		cursor: none;
	}

	/* The rite (RitePanel) at the middle of the left edge: it takes no clicks, play goes on under it. */
	.rite-hud {
		position: fixed;
		left: 16px;
		top: 50%;
		transform: translateY(-50%);
		width: min(280px, calc(100vw - 32px));
		pointer-events: none;
		z-index: 6;
	}

	.descend {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		padding: 14px 28px;
		font: 14px var(--font-ui);
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--text);
		background: rgb(0 0 0 / 0.6);
		border: 1px solid rgb(226 220 204 / 0.3);
		cursor: pointer;
		z-index: 5;
	}

	.reconnect {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		padding: 14px 28px;
		font: 13px var(--font-ui);
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--text);
		background: rgb(0 0 0 / 0.7);
		border: 1px solid rgb(226 220 204 / 0.2);
		z-index: 16;
	}

	/* Above "Take Control", which shows once the controller is gone. */
	.pad-lost {
		position: fixed;
		left: 50%;
		top: 38%;
		transform: translate(-50%, -50%);
		padding: 14px 28px;
		font: 13px var(--font-ui);
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--text);
		background: rgb(0 0 0 / 0.7);
		border: 1px solid rgb(226 220 204 / 0.2);
		z-index: 16;
	}

	.status {
		position: fixed;
		right: 12px;
		bottom: 12px;
		font: 12px var(--font-ui);
		color: #ff9a70;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		z-index: 10;
	}

	.status.ok {
		color: var(--muted);
	}
</style>
