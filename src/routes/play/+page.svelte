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
	import { Ambience } from '#lib/game/audio/Ambience.ts';
	import { SoundBank } from '#lib/game/audio/SoundBank.ts';
	import { CaptionFeed } from '#lib/game/audio/captions.svelte.ts';
	import type { SoundHandle } from '#lib/game/audio/AudioManager.ts';
	import { Creatures } from '#lib/game/creatures/Creatures.ts';
	import { Manifestation } from '#lib/game/affliction/Manifestation.ts';
	import { AFFLICTIONS } from '#lib/content/afflictions.ts';
	import { Effects } from '#lib/game/items/Effects.ts';
	import { ViewModel } from '#lib/game/items/ViewModel.ts';
	import { Crates } from '#lib/game/items/Crates.ts';
	import { Marks } from '#lib/game/items/Marks.ts';
	import { MARKS, markWheel } from '#lib/content/marks.ts';
	import { WorldItems } from '#lib/game/items/WorldItems.ts';
	import { ITEMS } from '#lib/content/items.ts';
	import { DISTANT_SHOT } from '#lib/content/audio/sounds.ts';
	import { CRATES } from '#lib/content/loot.ts';
	import { canTake, carriedCount, held, quickWith, shieldOf } from '#lib/shared/items/inventory.ts';
	import { carriesAll } from '#lib/shared/affliction/rite.ts';
	import type { RiteSnapshot } from '#lib/shared/affliction/types.ts';
	import { lookedAtCrate, lookedAtItem, lookedAtMark } from '#lib/shared/items/pickup.ts';
	import type { CrateSlot, GameEvent, InventoryAction } from '#lib/shared/items/types.ts';
	import { aimRay } from '#lib/shared/items/weapons.ts';
	import { charging, eyeHeight, healing } from '#lib/shared/player/simulate.ts';
	import { DEFAULT_HEADLAMP } from '#lib/content/items/headlamps.ts';
	import { Engine, type FrameStats } from '#lib/game/Engine.ts';
	import { InputMap } from '#lib/game/input/InputMap.ts';
	import { MapRenderer } from '#lib/game/map/MapRenderer.ts';
	import { connection, gameClient, me, start, subscribe } from '#lib/game/net/connection.svelte.ts';
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
	import HelpPanel from '#lib/ui/HelpPanel.svelte';
	import InventoryScreen from '#lib/ui/InventoryScreen.svelte';
	import QuickWheel from '#lib/ui/QuickWheel.svelte';
	import MarkWheel from '#lib/ui/MarkWheel.svelte';
	import MarkLabel from '#lib/ui/MarkLabel.svelte';
	import { wheelChoice } from '#lib/ui/wheel.ts';
	import DownedScreen from '#lib/ui/DownedScreen.svelte';
	import ExpeditionResult from '#lib/ui/ExpeditionResult.svelte';
	import ExtractFade from '#lib/ui/ExtractFade.svelte';
	import Hud from '#lib/ui/Hud.svelte';
	import RiteOverlay from '#lib/ui/RiteOverlay.svelte';
	import RoomBanner from '#lib/ui/RoomBanner.svelte';
	import ExpeditionClock from '#lib/ui/ExpeditionClock.svelte';
	import Settings from '#lib/ui/Settings.svelte';
	import SpectateBar from '#lib/ui/SpectateBar.svelte';
	import type { PartyMember } from '#lib/ui/PartyHealth.svelte';
	import StatsOverlay from '#lib/ui/StatsOverlay.svelte';

	let canvas: HTMLCanvasElement;
	type PanelName = 'settings' | 'help' | 'admin' | 'inventory' | 'crate';
	let panel = $state<PanelName | null>(null);
	/**
	 * The loot crate (or corpse) that is open, as the server tells it (see the `crate` message).
	 */
	let crate = $state<{
		id: string;
		slots: CrateSlot[];
		reveal: number;
		corpse: boolean;
	} | null>(null);
	/** The rite as known so far, and (while its overlay shows) who carries each requirement. */
	let rite = $state<RiteSnapshot | null>(null);
	/** The rite overlay is wanted: it shows over play whenever there is a rite to show. */
	let riteCarriers = $state<{ name: string; count: number; self: boolean }[][]>([]);
	let afflictionName = $state('');
	/** What the player carries, for the inventory screen (kept up to date while it is open). */
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
	let markers = $state(false);
	let spawned = $state(false);
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
		party: [] as PartyMember[]
	});
	/** The quick-use wheel while its key is held: the slots, the pointer and the slot it is on. */
	let wheel = $state<{
		slots: (ItemStack | null)[];
		pointer: { x: number; y: number };
		chosen: number;
	} | null>(null);
	/** The chalk wheel while attack is held with chalk in the hand: the pointer and the symbol. */
	let chalkWheel = $state<{ pointer: { x: number; y: number }; chosen: number } | null>(null);
	/** Who drew the chalk mark you are close to, and where it is on the screen. */
	let markLabel = $state<{ name: string; x: number; y: number } | null>(null);
	let meter = $state<number | null>(null);
	let omen = $state(0);
	/** Seconds left before anyone still underground is lost. */
	let deadline = $state<number | null>(null);
	/** The rite was performed: the Affliction is calmed (no arrival bar). */
	let calmed = $state(false);
	/** It has manifested: the arrival bar has nothing left to count. */
	let manifested = $state(false);
	/** Set while downed: bleed-out time left (0..1), what happens next, and the hold to surrender. */
	let downed = $state<{ remaining: number; message: string; surrender: number } | null>(null);
	/** Set when this player has left the expedition (climbed out or died); shows the results. */
	let result = $state<{
		summary: ExpeditionSummary;
		/** The Affliction's name, as it was underground. */
		affliction: string;
		outcome: 'extracted' | 'died' | 'lost' | 'abandoned' | 'banished' | 'resolved';
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
	/** Down in the catacombs (between `welcome` and extracting, dying or being banished out). */
	let expedition = $state(false);
	let send = (message: ClientMessage): void => {
		void message;
	};

	const audio = new AudioManager({ ...settings.audio });
	const captions = new CaptionFeed();
	let applyGraphics = (): void => {};
	let setMapView = (enabled: boolean): void => {
		mapView = enabled;
	};
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

	/**
	 * We shut the crate and the server hasn't answered yet: what it still sends about the crate
	 * until then is old news, and must not open the screen again.
	 */
	let leavingCrate = false;

	/** Worth the happy cue when found: epic, legendary, or a quest item. */
	function prize(item: string): boolean {
		const def = ITEMS[item];
		return !!def && (def.quest === true || def.rarity === 'epic' || def.rarity === 'legendary');
	}

	/** Done with the loot crate: tell the server, and straight back to play. */
	function closeCrate(): void {
		if (panel !== 'crate') return;
		panel = null;
		crate = null;
		leavingCrate = true;
		send({ type: 'closeCrate' });
		if (expedition) void canvas.requestPointerLock();
	}

	/**
	 * Back to play from the admin screen: moving does it, so you can try a change at once.
	 * A key press counts as a user gesture, so the pointer can be captured again here.
	 */
	function closeAdmin(): void {
		if (panel !== 'admin') return;
		panel = null;
		if (expedition && !mapView) void canvas.requestPointerLock();
	}

	function toggle(name: PanelName): void {
		// With a crate open, the pack and menu keys put it away and nothing more.
		if (panel === 'crate') {
			closeCrate();
			if (name === 'inventory' || name === 'settings') return;
		}
		// Esc on the admin screen just closes it; Esc again opens settings. (Esc can't capture the
		// pointer: browsers don't count it as a user gesture. A click or a move key does.)
		if (panel === 'admin' && name === 'settings') {
			panel = null;
			return;
		}
		const closing = panel === name;
		// The pack can only be opened while you are down there and not on the floor.
		if (name === 'inventory' && !closing && (!expedition || !spawned || downed)) return;
		panel = closing ? null : name;
		if (panel) document.exitPointerLock();
		// Putting the pack away goes straight back to play.
		else if (name === 'inventory' && expedition) void canvas.requestPointerLock();
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
			remote.setShadows(settings.graphics.quality !== 'low', engine.shadowMapSize);
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
						loadMap(message.layout);
						if (!message.resumed) descend();
						break;
					case 'extracted':
					case 'died':
					case 'abandoned':
					case 'banished':
						result = {
							summary: {
								seconds: message.seconds,
								deepestLevel: message.deepestLevel,
								kills: message.kills,
								crates: message.crates,
								clues: message.clues
							},
							affliction: afflictionName,
							// Out alive after performing the rite; or lost when time ran out.
							outcome:
								message.type === 'extracted' && rite?.resolved
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
					case 'marks':
						if (expedition || spectating) marks.apply(message.marks);
						break;
					case 'crate':
						if (message.id === null) {
							// The server shut it (walked away, went down), or agreed that we did.
							leavingCrate = false;
							if (panel === 'crate') {
								panel = null;
								if (expedition && !downed) void canvas.requestPointerLock();
							}
							crate = null;
						} else if (expedition && !leavingCrate) {
							// Sent every tick while it is open: only what changed is worth redrawing.
							const next = {
								id: message.id,
								slots: message.slots,
								reveal: message.reveal,
								corpse: crates.kind(message.id) === 'corpse'
							};
							// Something special just revealed (not one seen before the crate was opened).
							const before = crate?.id === next.id ? crate.slots : null;
							if (
								before &&
								next.slots.some(
									(slot, i) =>
										before[i] === 'hidden' && slot && slot !== 'hidden' && prize(slot.item)
								)
							) {
								sounds.play('loot.found');
							}
							if (JSON.stringify(next) !== JSON.stringify(crate)) crate = next;
							if (panel !== 'crate') {
								panel = 'crate';
								document.exitPointerLock();
							}
						}
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
						worldItems.apply(message.items, message.projectiles);
						crates.apply(message.crates);
						for (const event of message.events) onGameEvent(event);
						manifestation.apply(
							message.affliction.manifestation,
							AFFLICTIONS[message.affliction.id]?.manifestation
						);
						if (JSON.stringify(message.affliction.rite) !== JSON.stringify(rite)) {
							rite = message.affliction.rite;
						}
						afflictionName = AFFLICTIONS[message.affliction.id]?.name ?? '';
						omen = message.affliction.omen;
						meter = message.affliction.meter;
						deadline = message.affliction.deadline;
						calmed = message.affliction.calmed;
						manifested = message.affliction.manifestation !== null;
						ambience.setOmen(
							AFFLICTIONS[message.affliction.id]?.stages[omen - 1]?.ambience ?? null
						);
						break;
				}
			}
		});
		const player = new LocalPlayer(input, client);
		const sounds = new SoundBank(audio);
		sounds.oncaption = (cue) => {
			if (settings.accessibility.captions) captions.push(cue);
		};
		const playerAudio = new PlayerAudio(sounds, map.root);
		const ambience = new Ambience(audio, sounds);
		const creatures = new Creatures(sounds);
		engine.scene.add(creatures.root);
		const manifestation = new Manifestation(sounds);
		engine.scene.add(manifestation.root);
		const viewModel = new ViewModel(engine.viewScene, engine.viewCamera);
		const worldItems = new WorldItems();
		engine.scene.add(worldItems.root);
		const crates = new Crates();
		engine.scene.add(crates.root);
		const marks = new Marks(map.root);
		engine.scene.add(marks.root);
		const chalkRay = new THREE.Raycaster();
		chalkRay.far = MARKS.reach;
		const effects = new Effects();
		engine.scene.add(effects.root);
		const muzzle = new THREE.Vector3();
		/** The held item's action last frame (to start reload and swing sounds). */
		let lastAction = 'none';
		/** The floor item the player would pick up, if any. */
		let pickupTarget: { id: string; item: string } | null = null;
		/** The loot crate the player would open, if any (a floor item comes first). */
		let crateTarget: string | null = null;
		/** Your own chalk mark that interact would erase, if any (floor items and crates first). */
		let markTarget: string | null = null;
		setMarkers = (enabled) => {
			markers = enabled;
			creatures.setMarkers(enabled);
		};
		/** Sanity effects: heartbeat loop, hurt reaction, camera shake, whispers. */
		let heartbeat: SoundHandle | null = null;
		let heartbeatStarting = false;
		let lastSanity: number | null = null;
		/** Shield points left on what is worn, last frame (a drop is a blow it took). */
		let lastShield: number | null = null;
		/** Headlamp charge last frame (a jump up is a battery going in). */
		let lastBattery: number | null = null;
		/** Seconds to the next low-battery beep while the lamp is low; null while it isn't. */
		let lowBatteryIn: number | null = null;
		/** Bandaging last frame (starting plays the sound), and when it last played (ms). */
		let wasBandaging = false;
		let bandageSoundAt = 0;
		let shake = 0;
		let whisperIn = 8;
		const lookDir = new THREE.Vector3();

		/** World cell + level -> title of the room there (titled start, major and extraction rooms). */
		let roomCells: Record<string, string> = {};
		/** World cell + level -> which titled room (its placement index), so two alike are told apart. */
		let roomIds: Record<string, number> = {};
		/** The titled room the player was last in; null in the passages between. */
		let inRoom: number | null = null;
		let bannerCheck = 0;

		function loadMap(layout: MapLayout): void {
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
			void map.build(layout);
			crates.build(layout.crates);
			const world = buildCollisionWorld(layout, PIECES);
			player.setWorld(world);
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
		/** Whether the rite was being performed last frame (to ring its bell once). */
		let performing = false;

		/** Back on the surface: drop everything that belonged to the expedition. */
		function endExpedition(): void {
			expedition = false;
			if (panel === 'inventory' || panel === 'crate') panel = null;
			crate = null;
			leavingCrate = false;
			crates.clear();
			marks.clear();
			markLabel = null;
			chalkWheel = null;
			rite = null;
			deadline = null;
			calmed = false;
			manifested = false;
			performing = false;
			spectating = null;
			watchId = null;
			remote.setHidden(null);
			heartbeat?.setVolume(0);
			lastSanity = null;
			lastShield = null;
			lastBattery = null;
			lowBatteryIn = null;
			wasBandaging = false;
			manifestation.clear();
			ambience.setOmen(null);
			player.leave();
			ambience.clear();
			remote.clear();
			creatures.clear();
			worldItems.clear();
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
			crate = null;
			player.closeWheel();
			wheel = null;
			chalkWheel = null;
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
			if (panel === 'inventory' || panel === 'crate') panel = null;
			crate = null;
			spectating = { name: '' };
			watchId = null;
			player.leave();
			heartbeat?.setVolume(0);
			lastSanity = null;
			lastShield = null;
			lastBattery = null;
			lowBatteryIn = null;
			wasBandaging = false;
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
			const [cx, cz] = worldCell(position[0], position[2]);
			const level = Math.floor((position[1] + 0.5) / LEVEL_HEIGHT);
			const key = cellKey(cx, cz, level);
			const room = roomIds[key] ?? null;
			if (room === inRoom) return;
			inRoom = room;
			const title = roomCells[key];
			if (room !== null && title) banner = { title, key: (banner?.key ?? 0) + 1 };
		}

		/** Standing in the room the rite is held in (once a clue has told where that is). */
		function inRiteRoom(position: Vec3): boolean {
			const title = rite?.room ? MAP_KIT[rite.room]?.title : undefined;
			if (!title) return false;
			const [cx, cz] = worldCell(position[0], position[2]);
			const level = Math.floor((position[1] + 0.5) / LEVEL_HEIGHT);
			return roomCells[cellKey(cx, cz, level)] === title;
		}

		/** Who carries each thing the rite needs, for the rite overlay. */
		function carriers(
			state: PlayerState | null
		): { name: string; count: number; self: boolean }[][] {
			const everyone = [
				...(state ? [{ name: 'you', state, self: true }] : []),
				...remote.players().map((one) => ({ ...one, self: false }))
			];
			return (rite?.requirements ?? []).map((requirement) =>
				requirement
					? everyone
							.map((one) => ({
								name: one.name,
								self: one.self,
								count: carriedCount(one.state.inventory, requirement.item)
							}))
							.filter((carrier) => carrier.count > 0)
					: []
			);
		}

		/** A downed teammate within reach, if any. */
		function downedNearby(state: PlayerState): PlayerState | null {
			for (const other of remote.states()) {
				if (!other.downed || other.dead) continue;
				const d = Math.hypot(
					other.position[0] - state.position[0],
					other.position[1] - state.position[1],
					other.position[2] - state.position[2]
				);
				if (d <= SANITY.reviveRange) return other;
			}
			return null;
		}

		/** Instant feedback for what the local (predicted) simulation did. */
		function onLocalEvents(state: PlayerState): void {
			for (const event of player.drainEvents()) {
				if (event.kind === 'shot') {
					const gun = ITEMS[event.item]?.firearm;
					if (gun) sounds.play(gun.sound);
					// The kick throws your aim up and a little aside: you bring it back down yourself.
					if (gun) player.kick(gun.recoil.pitch, (Math.random() * 2 - 1) * gun.recoil.yaw);
					const heavy = (gun?.pellets ?? 1) > 1;
					// First person, the flare is on the gun in your hands; otherwise in the world.
					const drawn = viewModel.flash(heavy);
					effects.shot(ViewModel.muzzle(head, muzzle), event.direction, {
						flare: !drawn,
						own: true,
						heavy
					});
					headlamp.flash();
				} else if (event.kind === 'empty') {
					sounds.play('gun.empty');
				} else if (event.kind === 'throw') {
					sounds.play('brick.throw');
				}
			}
			const action = state.weapon.action;
			if (action !== lastAction) {
				if (action === 'reload') {
					const gun = ITEMS[held(state.inventory)?.item ?? '']?.firearm;
					if (gun) sounds.play(gun.reloadSound);
				}
				if (action === 'swing') sounds.play('melee.swing');
				lastAction = action;
			}
		}

		/** What happened on the server this tick: other players' actions, hits, landings. */
		function onGameEvent(event: GameEvent): void {
			const self = client.playerId;
			switch (event.kind) {
				case 'shot': {
					if (event.player !== self) {
						const gun = ITEMS[event.item]?.firearm;
						const distance = Math.hypot(
							event.origin[0] - head.position.x,
							event.origin[1] - head.position.y,
							event.origin[2] - head.position.z
						);
						// Close, the gun itself; far off, the rolling distant report; between, both.
						const far = Math.min(
							1,
							Math.max(0, (distance - DISTANT_SHOT.from) / DISTANT_SHOT.span)
						);
						if (gun && far < 1) sounds.playAt(gun.sound, event.origin, 1 - far, 10);
						if (far > 0) sounds.playAt('gun.distant', event.origin, far, DISTANT_SHOT.refDistance);
						const toward: [number, number, number] = [
							event.end[0] - event.origin[0],
							event.end[1] - event.origin[1],
							event.end[2] - event.origin[2]
						];
						// Out in front of their eyes, near where their gun is.
						const length = Math.hypot(...toward) || 1;
						const at = event.origin.map((v, i) => v + (toward[i] / length) * 0.6) as Vec3;
						effects.shot(at, toward, { flare: true, own: false, heavy: (gun?.pellets ?? 1) > 1 });
						remote.flash(event.player);
					}
					effects.impact(event.end, event.creature);
					if (!event.creature) sounds.playAt('bullet.impact', event.end, 1, 2);
					break;
				}
				case 'swing':
					if (event.hit === 'creature') sounds.playAt('melee.hit.creature', event.origin, 1, 3);
					else if (event.hit === 'wall') sounds.playAt('melee.hit', event.origin, 1, 3);
					else if (event.player !== self) sounds.playAt('melee.swing', event.origin, 1, 3);
					break;
				case 'throw':
					if (event.player !== self) sounds.playAt('brick.throw', event.origin, 1, 3);
					break;
				case 'land':
					sounds.playAt('brick.land', event.position, 1, 4);
					break;
				case 'break':
					// A coat torn through, or a brick or crowbar worn out.
					if (ITEMS[event.item]?.defense) sounds.playAt('defense.torn', event.position, 1, 3);
					else sounds.playAt('brick.break', event.position, 1, 3);
					break;
				case 'reload': {
					const gun = ITEMS[event.item]?.firearm;
					if (gun && event.player !== self) sounds.playAt(gun.reloadSound, event.position, 1, 3);
					break;
				}
				case 'empty':
					if (event.player !== self) sounds.playAt('gun.empty', event.position, 1, 2);
					break;
				case 'pickup':
					sounds.playAt('item.pickup', event.position, 1, 2);
					if (event.player === self && prize(event.item)) sounds.play('loot.found');
					break;
				case 'drop':
					sounds.playAt('item.drop', event.position, 1, 2);
					break;
				case 'mark':
					sounds.playAt('chalk.draw', event.position, 1, 2);
					break;
				case 'rub':
					sounds.playAt('chalk.rub', event.position, 1, 2);
					break;
				case 'crateOpen':
					if (crates.kind(event.id) === 'corpse')
						sounds.playAt('corpse.search', event.position, 1, 3);
					else sounds.playAt('crate.open', event.position, 1, 4);
					break;
				case 'rummage':
					// Your own hands are right there; someone else's are heard from where they are.
					if (event.player === self) sounds.play('inventory.rummage');
					else sounds.playAt('inventory.rummage', event.position, 1, 3);
					break;
				case 'clue': {
					// Everyone learns it at once, wherever they are.
					sounds.play('clue.sting');
					const learned = event.requirements.map((item) => ITEMS[item]?.name ?? item);
					if (event.room) learned.push(MAP_KIT[event.room]?.title ?? event.room);
					banner = {
						title: learned.length ? 'A hint: ' + learned.join(' · ') : 'A hint',
						subtitle: event.text || undefined,
						key: (banner?.key ?? 0) + 1
					};
					break;
				}
				case 'rite':
					sounds.play('rite.resolve');
					banner = {
						title: 'The rite is done',
						subtitle: `${afflictionName || 'The Affliction'} is resolved. Now get out.`,
						key: (banner?.key ?? 0) + 1
					};
					break;
				case 'deadline':
					banner = { title: 'Lost in the dark', key: (banner?.key ?? 0) + 1 };
					break;
				case 'creatureHit':
					if (event.id === 'manifestation') {
						manifestation.hit();
						break;
					}
					creatures.hit(event.id);
					sounds.playAt('creature.hurt', event.position, 1, 4);
					break;
				case 'manifest':
					// Heard everywhere: something has arrived.
					sounds.play('manifest.signal');
					break;
				case 'creatureDie':
					if (event.id !== 'manifestation') sounds.playAt('creature.die', event.position, 1, 5);
					break;
			}
		}

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
				if (!holding || chalkWheel || !state.inventory.quick.some((slot) => slot)) return;
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

		/** The chalk in the hand, if that is what is held. */
		function holdingChalk(state: PlayerState): boolean {
			return !!ITEMS[held(state.inventory)?.item ?? '']?.chalk;
		}

		/**
		 * Where a chalk mark would go: the visible stone where your view meets it, within reach, and
		 * which way it faces (world space). Null when there is none in reach.
		 */
		function chalkSpot(state: PlayerState): { position: Vec3; normal: Vec3 } | null {
			const { origin, direction } = aimRay(state, eyeHeight(state));
			chalkRay.set(new THREE.Vector3(...origin), new THREE.Vector3(...direction));
			const hit = chalkRay.intersectObject(map.root, true)[0];
			if (!hit || !(hit.object instanceof THREE.Mesh)) return null;
			const local = hit.normal ?? hit.face?.normal;
			if (!local) return null;
			const normal = local
				.clone()
				.applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
				.normalize();
			// Toward the one drawing, whichever way the face was modelled.
			if (normal.dot(chalkRay.ray.direction) > 0) normal.negate();
			return { position: hit.point.toArray(), normal: normal.toArray() };
		}

		/**
		 * The chalk wheel: holding attack with chalk in the hand, facing stone in reach, opens it;
		 * letting go draws the symbol the pointer is on where you are looking.
		 */
		function updateChalkWheel(state: PlayerState | null, active: boolean): void {
			const holding =
				active && !!state && !state.downed && holdingChalk(state) && input.isDown('attack');
			if (!chalkWheel) {
				if (!holding || wheel || !chalkSpot(state)) return;
				player.openWheel();
			}
			const pointer = player.wheelPointer ?? { x: 0, y: 0 };
			const chosen = wheelChoice(pointer, markWheel());
			if (holding) {
				chalkWheel = { pointer, chosen };
				return;
			}
			player.closeWheel();
			chalkWheel = null;
			const symbol = markWheel()[chosen];
			const spot = state && symbol ? chalkSpot(state) : null;
			if (spot && symbol) client.send({ type: 'mark', symbol, ...spot });
		}

		/** Who drew the mark you are close to, placed on the screen just under it. */
		function updateMarkLabel(state: PlayerState): void {
			const world = player.collision;
			let near: ReturnType<Marks['nearest']> = null;
			if (world && !state.downed && !chalkWheel && !wheel) {
				const { origin, direction } = aimRay(state, eyeHeight(state));
				near = marks.nearest(world, origin, direction);
			}
			if (!near) {
				if (markLabel) markLabel = null;
				return;
			}
			const screen = new THREE.Vector3(...near.position).project(engine.camera);
			const x = ((screen.x + 1) / 2) * canvas.clientWidth;
			const y = ((1 - screen.y) / 2) * canvas.clientHeight + 40;
			const name = near.by === client.playerId ? 'You' : near.name;
			const moved =
				!markLabel || Math.abs(markLabel.x - x) > 0.5 || Math.abs(markLabel.y - y) > 0.5;
			if (moved || markLabel?.name !== name) markLabel = { name, x, y };
		}

		/**
		 * The floor item in reach that interact would pick up, or failing that the loot crate it
		 * would open (same rules as the server).
		 */
		function findPickup(state: PlayerState): void {
			const world = player.collision;
			pickupTarget = null;
			crateTarget = null;
			markTarget = null;
			if (world && !state.downed && !state.swimming) {
				const { origin, direction } = aimRay(state, eyeHeight(state));
				const item = lookedAtItem(world, state.position, origin, direction, worldItems.snapshots);
				if (item) pickupTarget = { id: item.id, item: item.item };
				else crateTarget = lookedAtCrate(world, origin, direction, crates.placements)?.id ?? null;
				if (!pickupTarget && !crateTarget) {
					const self = client.playerId;
					const mine = lookedAtMark(world, origin, direction, marks.list, (m) => m.by === self);
					markTarget = mine?.id ?? null;
				}
			}
			worldItems.highlight(pickupTarget?.id ?? null);
			crates.highlight(crateTarget);
		}

		/** The one held-action prompt to show, with its progress. */
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

		function heldPrompt(state: PlayerState): {
			prompt: string | null;
			promptKey?: string;
			progress: number;
		} {
			if (state.downed) {
				// The only thing a downed player can still do: climb out.
				return extractPrompt(state) ?? { prompt: null, progress: 0 };
			}
			const heal = healing(state);
			if (heal && state.bandaging > 0) {
				return { prompt: 'Bandaging...', progress: state.bandaging / heal.seconds };
			}
			const charge = charging(state);
			if (charge && state.charging > 0) {
				return { prompt: 'Changing the battery...', progress: state.charging / charge.seconds };
			}
			if (downedNearby(state)) {
				if (quickWith(state.inventory, 'revive') < 0) {
					return { prompt: 'No smelling salts to hand', progress: 0 };
				}
				return keyPrompt('interact', 'to revive', state.reviving / SANITY.reviveSeconds);
			}
			if (
				rite &&
				!rite.resolved &&
				inRiteRoom(state.position) &&
				carriesAll(state.inventory, rite.requirements)
			) {
				return keyPrompt('interact', 'to perform the rite', state.performing / rite.seconds);
			}
			const extract = extractPrompt(state);
			if (extract) return extract;
			if (crateTarget && settings.interface.itemPrompts) {
				if (crates.inUse(crateTarget))
					return { prompt: 'Someone is going through it', progress: 0 };
				// Crates and bodies alike.
				return keyPrompt('interact', 'to search', state.opening / CRATES.openSeconds);
			}
			if (pickupTarget && settings.interface.itemPrompts) {
				const name = ITEMS[pickupTarget.item]?.name ?? pickupTarget.item;
				if (ITEMS[pickupTarget.item]?.kind === 'clue') {
					return keyPrompt('interact', `to read the ${name.toLowerCase()}`);
				}
				const fit = canTake(state.inventory, { item: pickupTarget.item, count: 1 });
				if (fit === 'heavy') return { prompt: name + ': too heavy to carry', progress: 0 };
				if (fit === 'full') return { prompt: name + ': no room for it', progress: 0 };
				return keyPrompt('interact', `to pick up ${name}`);
			}
			if (markTarget && settings.interface.itemPrompts) {
				return keyPrompt('interact', 'to erase your mark', state.erasing / MARKS.eraseSeconds);
			}
			if (
				holdingChalk(state) &&
				!chalkWheel &&
				settings.interface.itemPrompts &&
				chalkSpot(state)
			) {
				return keyPrompt('attack', 'to draw a mark');
			}
			return { prompt: null, progress: 0 };
		}

		function downedMessage(state: PlayerState): string {
			const helpers = [...remote.states()].some((other) => !other.downed && !other.dead);
			if (helpers) return 'Waiting for help...';
			if (quickWith(state.inventory, 'revive') >= 0) return 'Reaching for your smelling salts...';
			return 'No one is coming';
		}

		/**
		 * The headlamp and bandages: a battery going in, the low-battery beep (on crossing under
		 * `lowAlert.volts`, then every `lowAlert.seconds` while the lamp is on), and binding a wound.
		 */
		function lampSounds(state: PlayerState, delta: number): void {
			if (lastBattery !== null && state.battery > lastBattery + 0.05)
				sounds.play('battery.charged');
			lastBattery = state.battery;
			const { lowAlert, volts } = DEFAULT_HEADLAMP;
			const charge = state.battery * volts;
			if (state.headlamp > 0 && charge > 0 && charge < lowAlert.volts && !state.downed) {
				lowBatteryIn = (lowBatteryIn ?? 0) - delta;
				if (lowBatteryIn <= 0) {
					sounds.play('battery.low');
					lowBatteryIn = lowAlert.seconds;
				}
			} else if (charge >= lowAlert.volts || charge <= 0) {
				// Switching the lamp off and on again doesn't restart the minute; charging it does.
				lowBatteryIn = null;
			}
			const bandaging = state.bandaging > 0;
			// One play at a time: the clip runs most of a bandage, and isn't cut short.
			if (bandaging && !wasBandaging && performance.now() - bandageSoundAt > 2500) {
				sounds.play('bandage');
				bandageSoundAt = performance.now();
			}
			wasBandaging = bandaging;
		}

		/** Heartbeat, hurt flash and shake, and whispers, from the current sanity. */
		function sanityEffects(state: PlayerState, delta: number): void {
			const sanity = state.sanity / SANITY.max;
			if (lastSanity !== null && state.sanity < lastSanity - 3) {
				shake = Math.min(1, shake + (lastSanity - state.sanity) / 30);
				hud.hurt++;
				sounds.play('player.hurt');
			}
			lastSanity = state.sanity;
			const shield = shieldOf(state.inventory)?.left ?? null;
			if (lastShield !== null && shield !== null && shield < lastShield - 1) {
				shake = Math.min(1, shake + (lastShield - shield) / 60);
				sounds.play('player.shielded');
			}
			lastShield = shield;
			shake = Math.max(0, shake - delta * 2.5);
			if (audio.unlocked && !heartbeat && !heartbeatStarting) {
				heartbeatStarting = true;
				void sounds.loop('heartbeat').then((handle) => (heartbeat = handle));
			}
			const fear = state.downed ? 1 : Math.max(0, (0.4 - sanity) / 0.4);
			heartbeat?.setVolume(fear);
			heartbeat?.setRate(1 + fear * 0.45);
			if (sanity < 0.2 && !state.downed) {
				whisperIn -= delta;
				if (whisperIn <= 0) {
					whisperIn = 6 + Math.random() * 8;
					const angle = Math.random() * Math.PI * 2;
					const [x, y, z] = state.position;
					sounds.playAt('whisper', [x + Math.sin(angle) * 1.5, y + 1.5, z + Math.cos(angle) * 1.5]);
				}
			}
		}

		function extractPrompt(
			state: PlayerState
		): { prompt: string; promptKey?: string; progress: number } | null {
			const world = player.collision;
			if (!world || state.swimming || !nearExtract(world, state)) return null;
			return keyPrompt('interact', 'to climb out', state.extracting / EXPEDITION.extractSeconds);
		}

		/**
		 * A prompt for `action`'s key: the key as a keycap, then `text` ("to climb out"), the pill
		 * filling with `progress` while it is held. With the action unbound, its name in words.
		 */
		function keyPrompt(
			action: Action,
			text: string,
			progress = 0
		): { prompt: string; promptKey?: string; progress: number } {
			const cap = bindingLabel(settings.bindings[action][0] ?? '');
			if (cap) return { prompt: text, promptKey: cap, progress };
			return { prompt: `${action[0].toUpperCase()}${action.slice(1)} ${text}`, progress };
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

		// Usually the expedition began while the dashboard was showing: its `welcome` is waiting.
		start();
		if (connection.welcome) {
			const { sessionId: id, playerId: self, layout } = connection.welcome;
			sessionId = id;
			playerId = self;
			expedition = true;
			loadMap(layout);
			marks.apply(connection.marks);
			if (!connection.welcome.resumed) descend();
		}

		const onLockChange = () => (locked = document.pointerLockElement === canvas);
		document.addEventListener('pointerlockchange', onLockChange);
		const requestLock = () => {
			void audio.unlock();
			if (!panel && !mapView && !spectating && !extracting) void canvas.requestPointerLock();
		};
		canvas.addEventListener('click', requestLock);

		engine.onUpdate((delta) => {
			const active = locked && !panel && !mapView && !extracting;
			updateWheel(player.state, active);
			updateChalkWheel(player.state, active);
			player.update(delta, active);
			remote.update(delta);
			const self = player.state;
			const lamps = self ? [self, ...remote.states()] : [...remote.states()];
			creatures.update(delta, player.collision, lamps);
			worldItems.update(delta);
			crates.update(delta);
			marks.update(delta);
			effects.update(delta, engine.camera);
			// Only on your feet: crouched, crawling or swimming, the body fills the view from
			// behind, so those are always first person.
			const upright = player.state?.stance === 'stand' && !player.state.swimming;
			const shoulder = settings.graphics.view === 'shoulder' && !mapView && !spectating && upright;
			let outside = mapView;
			if (mapView) {
				orbit.update();
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
			manifestation.update(delta, [cam.x, cam.y, cam.z]);
			creatures.listen(delta, [cam.x, cam.y, cam.z]);
			captions.update();
			spawned = !!state;
			if (state) {
				sanityEffects(state, delta);
				lampSounds(state, delta);
				onLocalEvents(state);
				findPickup(state);
				updateMarkLabel(state);
				hud = {
					battery: state.battery,
					volts: state.battery * DEFAULT_HEADLAMP.volts,
					headlamp: state.headlamp,
					stance: state.stance,
					creep: player.modes.creep,
					promptKey: null,
					...heldPrompt(state),
					sanity: state.sanity / SANITY.max,
					hurt: hud.hurt,
					...itemHud(state),
					gloom: state.gloom,
					party: party(state)
				};
				downed = state.downed
					? {
							remaining: 1 - state.downedTime / SANITY.bleedOut,
							message: downedMessage(state),
							surrender: Math.max(0, state.surrendering) / SANITY.surrenderSeconds
						}
					: null;
				if (state.performing > 0 && !performing) sounds.play('rite.begin');
				performing = state.performing > 0;
				if (panel === 'inventory' || panel === 'crate') {
					if (state.downed && panel === 'inventory') {
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
			if (rite) {
				const now = carriers(state);
				if (JSON.stringify(now) !== JSON.stringify(riteCarriers)) riteCarriers = now;
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
					toggle('inventory');
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
			if (leaveTimer) clearTimeout(leaveTimer);
			unsubscribe();
			document.removeEventListener('pointerlockchange', onLockChange);
			canvas.removeEventListener('click', requestLock);
			document.exitPointerLock();
			heartbeat?.stop();
			creatures.dispose();
			viewModel.dispose();
			manifestation.dispose();
			worldItems.dispose();
			crates.dispose();
			marks.dispose();
			effects.dispose();
			playerAudio.dispose();
			ambience.dispose();
			player.dispose();
			headlamp.dispose();
			body.dispose();
			remote.dispose();
			orbit.dispose();
			input.dispose();
			unsubscribeNet();
			engine.dispose();
			audio.dispose();
		};
	});
</script>

<canvas bind:this={canvas}></canvas>

{#if spawned && !mapView && !result}
	<Hud {...hud} lampKey={bindingLabel(settings.bindings.headlamp[0] ?? '')} />
{/if}

{#if wheel && spawned && !mapView && !result}
	<QuickWheel slots={wheel.slots} pointer={wheel.pointer} chosen={wheel.chosen} />
{/if}

{#if chalkWheel && spawned && !mapView && !result}
	<MarkWheel symbols={markWheel()} pointer={chalkWheel.pointer} chosen={chalkWheel.chosen} />
{/if}

{#if markLabel && spawned && !panel && !mapView && !result}
	<MarkLabel name={markLabel.name} x={markLabel.x} y={markLabel.y} />
{/if}

{#if settings.accessibility.captions && spawned && !mapView && !result}
	<Captions captions={captions.list} size={settings.accessibility.captionSize} />
{/if}

{#if downed && spawned && !mapView && !result}
	<DownedScreen
		remaining={downed.remaining}
		message={downed.message}
		surrender={downed.surrender}
		surrenderKey={bindingLabel(settings.bindings.climb[0] ?? '')}
	/>
{/if}

{#if rite && !panel && !mapView && !result}
	<RiteOverlay
		affliction={afflictionName}
		{rite}
		carriers={riteCarriers}
		interactKey={bindingLabel(settings.bindings.interact[0] ?? '')}
	/>
	{#if deadline !== null}
		<ExpeditionClock seconds={deadline} arrival={calmed || manifested ? null : (meter ?? 0)} />
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

{#if !locked && !panel && !mapView && !result && expedition && status === 'connected'}
	<button type="button" class="descend" onclick={() => canvas.requestPointerLock()}>
		Take Control
	</button>
{/if}

{#if status === 'disconnected' || status === 'connecting'}
	<div class="reconnect" role="status">
		{status === 'disconnected' ? 'Connection lost. Reconnecting...' : 'Connecting...'}
	</div>
{/if}

<div class="status" class:ok={status === 'connected'}>
	{status}{statusDetail ? `: ${statusDetail}` : ''}
</div>

{#if settings.interface.showStats}
	<StatsOverlay {stats} {rtt} />
{/if}

{#if panel === 'settings'}
	<Settings
		dim
		onclose={() => (panel = null)}
		onvolume={(category, value) => audio.setVolume(category, value)}
		ongraphics={() => applyGraphics()}
		onaccount={() => send({ type: 'rename' })}
		onabandon={expedition
			? () => {
					panel = null;
					send({ type: 'abandon' });
				}
			: undefined}
	/>
{:else if panel === 'help'}
	<HelpPanel onclose={() => (panel = null)} />
{:else if panel === 'inventory' && inventory}
	<InventoryScreen
		{inventory}
		onaction={(action) => sendInventory(action)}
		onclose={() => toggle('inventory')}
	/>
{:else if panel === 'crate' && inventory && crate}
	<CrateScreen
		{inventory}
		title={crate.corpse ? 'Corpse' : 'Crate'}
		slots={crate.slots}
		reveal={crate.reveal}
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
		{markers}
		{meter}
		{omen}
		onadmin={(command) => sendAdmin(command)}
		onmapview={(enabled) => setMapView(enabled)}
		onmarkers={(enabled) => setMarkers(enabled)}
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
