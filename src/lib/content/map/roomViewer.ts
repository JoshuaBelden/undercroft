import type { RoomMarkerKind } from '../../shared/map/room.ts';

/**
 * The room viewer (dev): how it flies and lights a room, and the budget each room is held to.
 * See docs/dev/room-viewer.md.
 */
export const ROOM_VIEWER = {
	/** Flying: metres a second, how much faster with sprint, and mouse and stick turning. */
	fly: { speed: 6, fast: 4, mouse: 0.0022, stickTurn: 2.5, maxPitch: 1.55 },
	/** Lit evenly, for a room with no lightmap yet: an ambient light and a sky-and-ground fill. */
	fullbright: { ambient: 0.6, sky: 0x9a9080, ground: 0x2a2622, hemisphere: 1.2 },
	/** A light on the camera, shaped like the game's headlamp at full. */
	headlamp: { intensity: 40, distance: 30, angle: 0.55, penumbra: 0.5, decay: 1.6 },
	/** How far a marker's facing line reaches, and a marker's size (m). */
	marker: { arrow: 0.6, size: 0.12 },
	/** Seconds between saves of where the camera is. */
	saveEvery: 1
} as const;

/**
 * What a room may cost. A starting point to tune while the first rooms are built: chambers of
 * 30 to 50 m across, drawn with their neighbours (docs/handoff-pivot.md#building-it-decided).
 */
export const ROOM_BUDGET = {
	triangles: 120_000,
	drawCalls: 150,
	/** GPU memory for its textures, with their mipmaps (MB). */
	textureMB: 96,
	/** Lightmap texels per metre (handoff: about 10 to 16). */
	texelsPerMetre: { min: 10, max: 16 }
} as const;

/** Each marker kind's colour in the viewer. */
export const MARKER_COLOURS: Record<RoomMarkerKind, number> = {
	socket: 0xffffff,
	spawn: 0x4caf50,
	creature: 0xe53935,
	extract: 0x00e5ff,
	rite: 0xab47bc,
	altar: 0xce93d8,
	rubble: 0x8d6e63,
	rope: 0xffca28,
	anchor: 0xffa000,
	candle: 0xfff176,
	crate: 0x42a5f5,
	lootable: 0x1e88e5,
	door: 0xff7043,
	gate: 0xbf360c,
	spot: 0x9e9e9e
};

/** Collision boxes and volumes, drawn as outlines. */
export const OVERLAY_COLOURS = { collider: 0x66ff66, volume: 0x3399ff } as const;
