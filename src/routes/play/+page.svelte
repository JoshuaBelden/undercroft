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
	import { Darkness } from '#lib/game/affliction/Darkness.ts';
	import { AFFLICTIONS } from '#lib/content/afflictions.ts';
	import { Effects } from '#lib/game/items/Effects.ts';
	import { ViewModel } from '#lib/game/items/ViewModel.ts';
	import { Crates } from '#lib/game/items/Crates.ts';
	import { WorldItems } from '#lib/game/items/WorldItems.ts';
	import { ITEMS } from '#lib/content/items.ts';
	import { CRATES } from '#lib/content/loot.ts';
	import { canTake, carriedCount, held, quickWith } from '#lib/shared/items/inventory.ts';
	import { carriesAll } from '#lib/shared/affliction/rite.ts';
	import type { RiteSnapshot } from '#lib/shared/affliction/types.ts';
	import { lookedAtCrate, lookedAtItem } from '#lib/shared/items/pickup.ts';
	import type { CrateSlot, GameEvent, InventoryAction } from '#lib/shared/items/types.ts';
	import { aimRay } from '#lib/shared/items/weapons.ts';
	import { eyeHeight, healing } from '#lib/shared/player/simulate.ts';
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
	import { bindingLabel } from '#lib/game/input/actions.ts';
	import type { MapLayout, Vec3 } from '#lib/shared/map/types.ts';
	import {
		HAND,
		type Inventory,
		type ItemStack,
		type PlayerFlags,
		type PlayerState
	} from '#lib/shared/player/types.ts';
	import type { AdminCommand, ClientMessage, ServerMessage } from '#lib/shared/protocol.ts';
	import AdminPanel from '#lib/ui/AdminPanel.svelte';
	import Captions from '#lib/ui/Captions.svelte';
	import CrateScreen from '#lib/ui/CrateScreen.svelte';
	import HelpPanel from '#lib/ui/HelpPanel.svelte';
	import InventoryScreen from '#lib/ui/InventoryScreen.svelte';
	import QuickWheel from '#lib/ui/QuickWheel.svelte';
	import { wheelChoice } from '#lib/ui/wheel.ts';
	import DownedScreen from '#lib/ui/DownedScreen.svelte';
	import ExpeditionResult from '#lib/ui/ExpeditionResult.svelte';
	import Hud from '#lib/ui/Hud.svelte';
	import RiteOverlay from '#lib/ui/RiteOverlay.svelte';
	import RoomBanner from '#lib/ui/RoomBanner.svelte';
	import Settings from '#lib/ui/Settings.svelte';
	import SpectateBar from '#lib/ui/SpectateBar.svelte';
	import StatsOverlay from '#lib/ui/StatsOverlay.svelte';

	let canvas: HTMLCanvasElement;
	type PanelName = 'settings' | 'help' | 'admin' | 'inventory' | 'crate';
	let panel = $state<PanelName | null>(null);
	/** The loot crate that is open, as the server tells it (see the `crate` message). */
	let crate = $state<{ id: string; slots: CrateSlot[]; reveal: number } | null>(null);
	/** The rite as known so far, and (while its overlay shows) who carries each requirement. */
	let rite = $state<RiteSnapshot | null>(null);
	/** The rite overlay is wanted: it shows over play whenever there is a rite to show. */
	let riteShown = $state(false);
	let riteCarriers = $state<{ name: string; count: number }[][]>([]);
	let afflictionName = $state('');
	/** What the player carries, for the inventory screen (kept up to date while it is open). */
	let inventory = $state<Inventory | null>(null);
	const status = $derived(connection.status);
	const statusDetail = $derived(connection.detail);
	let sessionId = $state<string | null>(null);
	let playerId = $state<string | null>(null);
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
		stamina: 1,
		exhausted: false,
		battery: 1,
		headlamp: 1,
		underwater: false,
		stance: 'stand',
		creep: false,
		prompt: null as string | null,
		progress: 0,
		sanity: 1,
		hurt: 0,
		hand: null as { name: string; count: number } | null,
		ammo: null as { loaded: number; spare: number } | null,
		aiming: false,
		gloom: 0
	});
	/** The quick-use wheel while its key is held: the slots, the pointer and the slot it is on. */
	let wheel = $state<{
		slots: (ItemStack | null)[];
		pointer: { x: number; y: number };
		chosen: number;
	} | null>(null);
	let meter = $state<number | null>(null);
	let omen = $state(0);
	/** Set while downed: bleed-out time left (0..1), what happens next, and the hold to surrender. */
	let downed = $state<{ remaining: number; message: string; surrender: number } | null>(null);
	/** Set when this player has left the expedition (climbed out or died); shows the results. */
	let result = $state<{
		seconds: number;
		deepestLevel: number;
		outcome: 'extracted' | 'died' | 'abandoned' | 'banished' | 'resolved';
		/** Set after spectating: how many of the others got out. */
		escaped: number | null;
		/** What was carried out and kept; null when it was lost. */
		carried: ItemStack[] | null;
	} | null>(null);
	/**
	 * Where the surface begins once the result has been read: the loadout, for whoever came out
	 * with what they carried (there is loot to put away); the dashboard otherwise.
	 */
	let surface = $state<'/(hub)' | '/(hub)/loadout'>('/(hub)');
	/** Dead and watching a teammate; `name` is who (empty while nobody can be shown). */
	let spectating = $state<{ name: string } | null>(null);
	let spectateNext = (): void => {};
	let spectateStop = (): void => {};
	/** Room banner currently showing; `key` restarts the animation for each new room. */
	let banner = $state<{ title: string; key: number } | null>(null);
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

	/** Done with the loot crate: tell the server, and straight back to play. */
	function closeCrate(): void {
		if (panel !== 'crate') return;
		panel = null;
		crate = null;
		leavingCrate = true;
		send({ type: 'closeCrate' });
		if (expedition) void canvas.requestPointerLock();
	}

	function toggle(name: PanelName): void {
		// With a crate open, the pack and menu keys put it away and nothing more.
		if (panel === 'crate') {
			closeCrate();
			if (name === 'inventory' || name === 'settings') return;
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
						break;
					case 'extracted':
					case 'died':
					case 'abandoned':
					case 'banished':
					case 'resolved':
						result = {
							seconds: message.seconds,
							deepestLevel: message.deepestLevel,
							outcome: message.type,
							escaped: null,
							carried:
								message.type === 'died' || message.type === 'abandoned' ? null : message.carried
						};
						surface = result.carried ? '/(hub)/loadout' : '/(hub)';
						if (message.type === 'resolved') sounds.play('rite.resolve');
						if (message.type === 'died' && message.spectating) startSpectating();
						else endExpedition();
						break;
					case 'spectateEnd':
						if (!spectating) break;
						if (result) result.escaped = message.escaped;
						endExpedition();
						break;
					case 'map':
						loadMap(message.layout);
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
							const next = { id: message.id, slots: message.slots, reveal: message.reveal };
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
							flags = { ...snap.state.flags };
						}
						remote.apply(message.players, client.playerId, message.serverTime);
						creatures.apply(message.creatures);
						worldItems.apply(message.items, message.projectiles);
						crates.apply(message.crates);
						for (const event of message.events) onGameEvent(event);
						darkness.apply(message.affliction.manifestation);
						if (JSON.stringify(message.affliction.rite) !== JSON.stringify(rite)) {
							rite = message.affliction.rite;
						}
						afflictionName = AFFLICTIONS[message.affliction.id]?.name ?? '';
						omen = message.affliction.omen;
						meter = message.affliction.meter ?? null;
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
		const darkness = new Darkness(sounds);
		engine.scene.add(darkness.root);
		const viewModel = new ViewModel(engine.viewScene, engine.viewCamera);
		const worldItems = new WorldItems();
		engine.scene.add(worldItems.root);
		const crates = new Crates();
		engine.scene.add(crates.root);
		const effects = new Effects();
		engine.scene.add(effects.root);
		const muzzle = new THREE.Vector3();
		/** The held item's action last frame (to start reload and swing sounds). */
		let lastAction = 'none';
		/** The floor item the player would pick up, if any. */
		let pickupTarget: { id: string; item: string } | null = null;
		/** The loot crate the player would open, if any (a floor item comes first). */
		let crateTarget: string | null = null;
		setMarkers = (enabled) => {
			markers = enabled;
			creatures.setMarkers(enabled);
		};
		/** Sanity effects: heartbeat loop, hurt reaction, camera shake, whispers. */
		let heartbeat: SoundHandle | null = null;
		let heartbeatStarting = false;
		let lastSanity: number | null = null;
		let shake = 0;
		let whisperIn = 8;
		const lookDir = new THREE.Vector3();

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
			rite = null;
			performing = false;
			spectating = null;
			watchId = null;
			remote.setHidden(null);
			heartbeat?.setVolume(0);
			lastSanity = null;
			darkness.clear();
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

		/** Show a room's banner the first time the player enters it this expedition. */
		function checkRoom(position: Vec3): void {
			const [cx, cz] = worldCell(position[0], position[2]);
			const level = Math.floor((position[1] + 0.5) / LEVEL_HEIGHT);
			const title = roomCells[cellKey(cx, cz, level)];
			if (!title || seenRooms[title]) return;
			seenRooms[title] = true;
			banner = { title, key: (banner?.key ?? 0) + 1 };
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
		function carriers(state: PlayerState | null): { name: string; count: number }[][] {
			const everyone = [...(state ? [{ name: 'you', state }] : []), ...remote.players()];
			return (rite?.requirements ?? []).map((requirement) =>
				requirement
					? everyone
							.map((one) => ({
								name: one.name,
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
					const sound = ITEMS[event.item]?.firearm?.sound;
					if (sound) sounds.play(sound);
					effects.muzzleFlash(ViewModel.muzzle(head, muzzle));
				} else if (event.kind === 'empty') {
					sounds.play('gun.empty');
				} else if (event.kind === 'throw') {
					sounds.play('brick.throw');
				}
			}
			const action = state.weapon.action;
			if (action !== lastAction) {
				if (action === 'reload') sounds.play('gun.reload');
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
						const sound = ITEMS[event.item]?.firearm?.sound;
						if (sound) sounds.playAt(sound, event.origin, 1, 10);
						effects.muzzleFlash(event.origin);
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
					sounds.playAt('brick.break', event.position, 1, 3);
					break;
				case 'reload':
					if (event.player !== self) sounds.playAt('gun.reload', event.position, 1, 3);
					break;
				case 'empty':
					if (event.player !== self) sounds.playAt('gun.empty', event.position, 1, 2);
					break;
				case 'pickup':
					sounds.playAt('item.pickup', event.position, 1, 2);
					break;
				case 'drop':
					sounds.playAt('item.drop', event.position, 1, 2);
					break;
				case 'crateOpen':
					sounds.playAt('crate.open', event.position, 1, 4);
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
					banner = { title: 'A clue: ' + learned.join(' · '), key: (banner?.key ?? 0) + 1 };
					break;
				}
				case 'creatureHit':
					if (event.id === 'manifestation') {
						darkness.hit();
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
				if (!holding || !state.inventory.quick.some((slot) => slot)) return;
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
		 * The floor item in reach that interact would pick up, or failing that the loot crate it
		 * would open (same rules as the server).
		 */
		function findPickup(state: PlayerState): void {
			const world = player.collision;
			pickupTarget = null;
			crateTarget = null;
			if (world && !state.downed && !state.swimming) {
				const { origin, direction } = aimRay(state, eyeHeight(state));
				const item = lookedAtItem(world, state.position, origin, direction, worldItems.snapshots);
				if (item) pickupTarget = { id: item.id, item: item.item };
				else crateTarget = lookedAtCrate(world, origin, direction, crates.placements)?.id ?? null;
			}
			worldItems.highlight(pickupTarget?.id ?? null);
			crates.highlight(crateTarget);
		}

		/** The one held-action prompt to show, with its progress. */
		function heldPrompt(state: PlayerState): { prompt: string | null; progress: number } {
			if (state.downed) return { prompt: null, progress: 0 };
			const heal = healing(state);
			if (heal && state.bandaging > 0) {
				return { prompt: 'Bandaging...', progress: state.bandaging / heal.seconds };
			}
			if (downedNearby(state)) {
				if (quickWith(state.inventory, 'revive') < 0) {
					return { prompt: 'No smelling salts to hand', progress: 0 };
				}
				const key = settings.bindings.interact.map(bindingLabel).join(' / ') || 'Interact';
				return {
					prompt: state.reviving > 0 ? 'Reviving...' : `Hold ${key} to revive`,
					progress: state.reviving / SANITY.reviveSeconds
				};
			}
			if (rite && inRiteRoom(state.position) && carriesAll(state.inventory, rite.requirements)) {
				const key = settings.bindings.interact.map(bindingLabel).join(' / ') || 'Interact';
				return {
					prompt:
						state.performing > 0 ? 'Performing the rite...' : `Hold ${key} to perform the rite`,
					progress: state.performing / rite.seconds
				};
			}
			const extract = extractPrompt(state);
			if (extract)
				return { prompt: extract, progress: state.extracting / EXPEDITION.extractSeconds };
			if (crateTarget && settings.interface.itemPrompts) {
				if (crates.inUse(crateTarget))
					return { prompt: 'Someone is going through it', progress: 0 };
				const key = settings.bindings.interact.map(bindingLabel).join(' / ') || 'Interact';
				return {
					prompt: state.opening > 0 ? 'Opening...' : `Hold ${key} to open the crate`,
					progress: state.opening / CRATES.openSeconds
				};
			}
			if (pickupTarget && settings.interface.itemPrompts) {
				const key = settings.bindings.interact.map(bindingLabel).join(' / ') || 'Interact';
				const name = ITEMS[pickupTarget.item]?.name ?? pickupTarget.item;
				if (ITEMS[pickupTarget.item]?.kind === 'clue') {
					return { prompt: `Press ${key} to read the ${name.toLowerCase()}`, progress: 0 };
				}
				const fit = canTake(state.inventory, { item: pickupTarget.item, count: 1 });
				if (fit === 'heavy') return { prompt: name + ': too heavy to carry', progress: 0 };
				if (fit === 'full') return { prompt: name + ': no room for it', progress: 0 };
				return { prompt: `Press ${key} to pick up ${name}`, progress: 0 };
			}
			return { prompt: null, progress: 0 };
		}

		function downedMessage(state: PlayerState): string {
			const helpers = [...remote.states()].some((other) => !other.downed && !other.dead);
			if (helpers) return 'Waiting for help...';
			if (quickWith(state.inventory, 'revive') >= 0) return 'Reaching for your smelling salts...';
			return 'No one is coming';
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

		// Usually the expedition began while the dashboard was showing: its `welcome` is waiting.
		start();
		if (connection.welcome) {
			const { sessionId: id, playerId: self, layout } = connection.welcome;
			sessionId = id;
			playerId = self;
			expedition = true;
			loadMap(layout);
		}

		const onLockChange = () => (locked = document.pointerLockElement === canvas);
		document.addEventListener('pointerlockchange', onLockChange);
		const requestLock = () => {
			void audio.unlock();
			if (!panel && !mapView && !spectating) void canvas.requestPointerLock();
		};
		canvas.addEventListener('click', requestLock);

		engine.onUpdate((delta) => {
			const active = locked && !panel && !mapView;
			updateWheel(player.state, active);
			player.update(delta, active);
			remote.update(delta);
			const self = player.state;
			const lamps = self ? [self, ...remote.states()] : [...remote.states()];
			creatures.update(delta, player.collision, lamps);
			worldItems.update(delta);
			crates.update(delta);
			effects.update(delta);
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
			playerAudio.update(state, audio.unlocked);
			const cam = engine.camera.position;
			engine.camera.getWorldDirection(lookDir);
			audio.setListener([cam.x, cam.y, cam.z], [lookDir.x, lookDir.y, lookDir.z]);
			ambience.update(delta, [cam.x, cam.y, cam.z], state);
			darkness.update(delta, [cam.x, cam.y, cam.z]);
			captions.update();
			spawned = !!state;
			if (state) {
				sanityEffects(state, delta);
				onLocalEvents(state);
				findPickup(state);
				hud = {
					stamina: state.stamina / MOVEMENT.stamina.max,
					exhausted: state.exhausted,
					battery: state.battery,
					headlamp: state.headlamp,
					underwater: state.underwater,
					stance: state.stance,
					creep: player.modes.creep,
					...heldPrompt(state),
					sanity: state.sanity / SANITY.max,
					hurt: hud.hurt,
					...itemHud(state),
					gloom: state.gloom
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
			if (riteShown && rite) {
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
				// Walking away from a loot crate puts it away.
				case 'moveForward':
				case 'moveBack':
				case 'moveLeft':
				case 'moveRight':
				case 'climb':
				case 'stance':
					closeCrate();
					break;
				case 'ritePanel':
					// An overlay, not a menu: play goes on under it.
					riteShown = !riteShown;
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
			unsubscribe();
			document.removeEventListener('pointerlockchange', onLockChange);
			canvas.removeEventListener('click', requestLock);
			document.exitPointerLock();
			heartbeat?.stop();
			creatures.dispose();
			viewModel.dispose();
			darkness.dispose();
			worldItems.dispose();
			crates.dispose();
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

{#if spawned && !mapView}
	<Hud {...hud} />
{/if}

{#if wheel && spawned && !mapView && !result}
	<QuickWheel slots={wheel.slots} pointer={wheel.pointer} chosen={wheel.chosen} />
{/if}

{#if settings.accessibility.captions && spawned && !mapView && !result}
	<Captions captions={captions.list} size={settings.accessibility.captionSize} />
{/if}

{#if downed && spawned && !mapView && !result}
	<DownedScreen
		remaining={downed.remaining}
		message={downed.message}
		surrender={downed.surrender}
		surrenderKey={settings.bindings.climb.map(bindingLabel).join(' / ') || 'Climb'}
	/>
{/if}

{#if riteShown && rite && !panel && !mapView && !result}
	<RiteOverlay
		affliction={afflictionName}
		{rite}
		carriers={riteCarriers}
		interactKey={settings.bindings.interact.map(bindingLabel).join(' / ') || 'Interact'}
		toggleKey={settings.bindings.ritePanel.map(bindingLabel).join(' / ')}
	/>
{/if}

{#if banner && spawned && !mapView}
	{#key banner.key}
		<RoomBanner title={banner.title} />
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
{:else if result}
	<ExpeditionResult
		seconds={result.seconds}
		deepestLevel={result.deepestLevel}
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
