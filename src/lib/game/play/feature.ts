import type * as THREE from 'three';
import type { AudioManager } from '#lib/game/audio/AudioManager.ts';
import type { Ambience } from '#lib/game/audio/Ambience.ts';
import type { SoundBank } from '#lib/game/audio/SoundBank.ts';
import type { Creatures } from '#lib/game/creatures/Creatures.ts';
import type { Engine } from '#lib/game/Engine.ts';
import type { InputMap } from '#lib/game/input/InputMap.ts';
import type { MapRenderer } from '#lib/game/map/MapRenderer.ts';
import type { GameClient } from '#lib/game/net/GameClient.ts';
import type { Headlamp } from '#lib/game/player/Headlamp.ts';
import type { PlayerBody } from '#lib/game/player/PlayerBody.ts';
import type { LocalPlayer } from '#lib/game/player/LocalPlayer.ts';
import type { RemotePlayers } from '#lib/game/player/RemotePlayers.ts';
import type { GameEvent } from '#lib/shared/items/types.ts';
import type { CollisionWorld } from '#lib/shared/map/collision.ts';
import type { MapLayout, Vec3 } from '#lib/shared/map/types.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { ServerMessage } from '#lib/shared/protocol.ts';

/**
 * The play page's plug-in seam (docs/dev/play.md). The page (src/routes/play/+page.svelte) owns
 * the engine, the camera, the map, the HUD, the panels and the input; what each feature shows
 * and plays underground (ropes, chalk marks, crates, the rite...) is a `PlayFeature` in this
 * folder, registered in `index.ts`. The client mirror of server/systems/.
 */

/** The screens that can be open over the game. */
export type PanelName = 'settings' | 'help' | 'admin' | 'menu' | 'crate';

export type TickMessage = Extract<ServerMessage, { type: 'tick' }>;

/** A held-action prompt for the HUD: the text, the key's keycap, and how full the pill is (0..1). */
export interface Prompt {
	prompt: string;
	promptKey?: string;
	progress: number;
	/** It can't be done yet (no key for the lock, no crowbar in the hand): shown in red. */
	blocked?: boolean;
	/** Words after the key ("(crate stuck)"). */
	after?: string;
}

/** Where the player is looking, for working out what interact would take. */
export interface Aim {
	world: CollisionWorld;
	origin: Vec3;
	direction: Vec3;
}

/** The page's own state that features read, and the few things they ask of it. */
export interface PlayUi {
	/** Down in the catacombs or watching: what the server sends about the world is ours to show. */
	readonly inWorld: boolean;
	/** Down in the catacombs, playing (not watching, not on the surface). */
	readonly expedition: boolean;
	/** This player is down. */
	readonly downed: boolean;
	/** The quick-use wheel is open. */
	readonly quickWheelOpen: boolean;
	/** The screen open over the game, if any. */
	panel: PanelName | null;
	/** Show a banner across the screen (a room, a hint, the rite). */
	banner(title: string, subtitle?: string): void;
	/** Capture the pointer again for mouse play. */
	capture(): void;
	/** The title of the room at a position (titled rooms only). */
	roomTitleAt(position: Vec3): string | undefined;
}

/** What every feature gets: the engine, audio, the players and the page. */
export interface PlayContext {
	engine: Engine;
	canvas: HTMLCanvasElement;
	input: InputMap;
	audio: AudioManager;
	sounds: SoundBank;
	ambience: Ambience;
	client: GameClient;
	player: LocalPlayer;
	remote: RemotePlayers;
	map: MapRenderer;
	creatures: Creatures;
	/** Your own body, drawn over the shoulder (`root.visible` while it is). */
	body: PlayerBody;
	/** The player's head: where their eyes are and which way they look. */
	head: THREE.Object3D;
	headlamp: Headlamp;
	ui: PlayUi;
}

/**
 * A feature's part in the play page. Every hook is optional; they run in the order features are
 * listed in `index.ts`.
 */
export interface PlayFeature {
	/** A map was built from the server's layout (`welcome` or an admin's `map`). */
	mapLoaded?(layout: MapLayout, world: CollisionWorld): void;
	/** The page opened on an expedition already under way: catch up from `connection`. */
	restore?(): void;
	/** Any message from the server but `tick` (check `ui.inWorld` before showing the world). */
	message?(message: ServerMessage): void;
	/** A tick, while in the world, before its events. */
	tick?(tick: TickMessage): void;
	/** One of a tick's events. */
	event?(event: GameEvent): void;
	/**
	 * Whether interact would take what this feature has in front of the player. `taken` is true
	 * when a feature listed earlier already claimed it; `aim` is null when nothing can be taken
	 * (down, swimming). Return true to claim it.
	 */
	target?(state: PlayerState, aim: Aim | null, taken: boolean): boolean;
	/** Every frame with the player's own state, before the HUD is put together. */
	self?(state: PlayerState, delta: number): void;
	/** Every frame, once the camera is placed. */
	update?(delta: number): void;
	/** This player's part is over (dead and watching, or back on the surface). */
	left?(): void;
	/** Back on the surface: drop everything that belonged to the expedition. */
	clear?(): void;
	dispose?(): void;
}
