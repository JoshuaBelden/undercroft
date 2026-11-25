import { SOUNDS } from '../../content/audio/sounds.ts';
import { ITEMS } from '../../content/items.ts';
import { LOOTABLES, type LootableId } from '../../content/lootables.ts';
import type { ColliderBox, PieceDef, Quat, Vec3, VolumeBox } from './types.ts';

/**
 * Reading a hand-built room's markers, colliders and volumes from its exported nodes, the same way
 * whoever holds the model (the room viewer now; the fixed map's build later) sees them. Pure, with
 * no Three.js or glTF library, so a node list from either reads the same. See
 * docs/dev/room-viewer.md and the marker conventions in docs/dev/asset-pipeline.md#conventions-1.
 */

/** Every kind of marker, by its name's prefix (`spawn-0` is a `spawn`). */
export const ROOM_MARKER_KINDS = [
	'socket',
	'spawn',
	'creature',
	'extract',
	'rite',
	'altar',
	'rubble',
	'rope',
	'anchor',
	'candle',
	'crate',
	'lootable',
	'door',
	'gate',
	'spot',
	// sound-<id>-<n>: a sound from sounds.ts playing there (sound-sewer.drip-0).
	'sound'
] as const;

export type RoomMarkerKind = (typeof ROOM_MARKER_KINDS)[number];

/** One exported node, in room space (glTF axes: +Y up, Blender's +Y north is -Z). */
export interface RoomNode {
	name: string;
	position: Vec3;
	rotation: Quat;
	scale: Vec3;
	/** Its custom properties (glTF extras). */
	extras: Record<string, unknown>;
	/** Whether it draws something (a mesh), or is an empty. */
	mesh: boolean;
}

export interface RoomMarker {
	kind: RoomMarkerKind;
	/** Its name without Blender's `.001` suffix (`lootable-niche-3`). */
	label: string;
	position: Vec3;
	/** Turn about +Y (radians) of its local -Z (Blender's +Y): at 0 it faces north (-Z). */
	yaw: number;
	/** Custom properties that mean something for its kind: numbers (a rope's `length`)... */
	extras: Record<string, number>;
	/** ...and words: a locked door's `key`, the item a lootable always `holds`. */
	text: Record<string, string>;
}

export interface RoomManifest {
	name: string;
	markers: RoomMarker[];
	colliders: ColliderBox[];
	volumes: VolumeBox[];
	/** What a builder should look at: an empty with no known prefix, a rope with no length... */
	warnings: string[];
}

/** A node's name without the `.001` Blender adds to repeats. */
export function baseName(name: string): string {
	return name.replace(/\.\d{3}$/, '');
}

/** The kind a marker's name says it is, or null for anything else. */
export function markerKind(label: string): RoomMarkerKind | null {
	const prefix = label.split('-')[0];
	return (ROOM_MARKER_KINDS as readonly string[]).includes(prefix)
		? (prefix as RoomMarkerKind)
		: null;
}

/** Which way a turn faces: its local -Z, turned about +Y (radians, 0 = north). */
export function yawOf(rotation: Quat): number {
	const [x, y, z, w] = rotation;
	// The rotated (0, 0, -1): only its x and z matter.
	const fx = -2 * (x * z + w * y);
	const fz = -(1 - 2 * (x * x + y * y));
	return Math.atan2(-fx, -fz);
}

/** Words from a node's custom properties (`key = "key"`), numbers left to `numbers`. */
function texts(extras: Record<string, unknown>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(extras)) {
		if (typeof value === 'string' && !Number.isFinite(Number(value))) out[key] = value;
	}
	return out;
}

/** Numbers from a node's custom properties, the rest dropped. */
function numbers(extras: Record<string, unknown>): Record<string, number> {
	const out: Record<string, number> = {};
	for (const [key, value] of Object.entries(extras)) {
		const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
		if (Number.isFinite(n)) out[key] = n;
	}
	return out;
}

/** `col-*` and `vol-*` are unit cubes scaled and turned into place. */
function box(node: RoomNode): ColliderBox {
	return {
		center: [...node.position],
		halfExtents: [node.scale[0] / 2, node.scale[1] / 2, node.scale[2] / 2],
		rotation: [...node.rotation]
	};
}

export function readRoom(name: string, nodes: readonly RoomNode[]): RoomManifest {
	const manifest: RoomManifest = { name, markers: [], colliders: [], volumes: [], warnings: [] };
	for (const node of nodes) {
		const label = baseName(node.name);
		if (label === name) continue;
		if (label.startsWith('col-')) {
			manifest.colliders.push(box(node));
			continue;
		}
		if (label.startsWith('vol-')) {
			manifest.volumes.push({ kind: label.split('-')[1] ?? '', ...box(node) });
			continue;
		}
		const kind = markerKind(label);
		if (!kind) {
			if (!node.mesh) manifest.warnings.push(`Empty "${label}" has no known marker prefix`);
			continue;
		}
		const marker: RoomMarker = {
			kind,
			label,
			position: [...node.position],
			yaw: yawOf(node.rotation),
			extras: numbers(node.extras),
			text: texts(node.extras)
		};
		if (kind === 'rope' && !(marker.extras.length > 0)) {
			manifest.warnings.push(`${label} needs a length property (m)`);
		}
		if (kind === 'lootable' && !Object.hasOwn(LOOTABLES, label.split('-')[1] ?? '')) {
			manifest.warnings.push(`${label} names no lootable (${Object.keys(LOOTABLES).join(', ')})`);
		}
		if (kind === 'sound' && !Object.hasOwn(SOUNDS, soundOf(marker))) {
			manifest.warnings.push(`${label} names no sound in sounds.ts ("${soundOf(marker)}")`);
		}
		for (const prop of ['key', 'holds'] as const) {
			const item = marker.text[prop];
			if (item !== undefined && !Object.hasOwn(ITEMS, item)) {
				manifest.warnings.push(`${label}: ${prop} names no item ("${item}")`);
			}
		}
		manifest.markers.push(marker);
	}
	// A locked door's key has to be somewhere in the room (for now: one room is the whole map).
	const held = new Set(manifest.markers.map((m) => m.text.holds).filter(Boolean));
	for (const door of manifest.markers.filter((m) => m.text.key)) {
		if (!held.has(door.text.key)) {
			manifest.warnings.push(
				`${door.label} is locked with "${door.text.key}", which nothing holds`
			);
		}
	}
	return manifest;
}

/** The sound a `sound-<id>-<n>` marker plays: `sound-sewer.drip-1` plays `sewer.drip`. */
export function soundOf(marker: RoomMarker): string {
	return marker.label.slice('sound-'.length).replace(/-\d+$/, '');
}

/** A door's depth (m) when its marker gives its width and height (`width`, `height` extras). */
const DOOR_DEPTH = 0.2;

/** The box round a room's colliders (each box's corners, turned): where its nav grid is sampled. */
export function boundsOf(colliders: readonly ColliderBox[]): [Vec3, Vec3] | undefined {
	if (colliders.length === 0) return undefined;
	const lo: Vec3 = [Infinity, Infinity, Infinity];
	const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
	for (const box of colliders) {
		for (const sx of [-1, 1]) {
			for (const sy of [-1, 1]) {
				for (const sz of [-1, 1]) {
					const corner = rotate(box.rotation, [
						sx * box.halfExtents[0],
						sy * box.halfExtents[1],
						sz * box.halfExtents[2]
					]);
					for (let a = 0; a < 3; a++) {
						lo[a] = Math.min(lo[a], box.center[a] + corner[a]);
						hi[a] = Math.max(hi[a], box.center[a] + corner[a]);
					}
				}
			}
		}
	}
	return [lo, hi];
}

/** A vector turned by a quaternion. */
function rotate([x, y, z, w]: Quat, [vx, vy, vz]: Vec3): Vec3 {
	// t = 2 q×v; v' = v + w t + q×t
	const tx = 2 * (y * vz - z * vy);
	const ty = 2 * (z * vx - x * vz);
	const tz = 2 * (x * vy - y * vx);
	return [
		vx + w * tx + (y * tz - z * ty),
		vy + w * ty + (z * tx - x * tz),
		vz + w * tz + (x * ty - y * tx)
	];
}

/**
 * The room as a map piece, to walk it with the game's own collision and movement: its colliders,
 * volumes, ropes and anchors, and every marker the piece format has. It isn't on the generator's
 * grid, so it has no footprint or sockets.
 */
export function roomPiece(manifest: RoomManifest): PieceDef {
	const of = (kind: RoomMarkerKind) => manifest.markers.filter((m) => m.kind === kind);
	const points = (kind: RoomMarkerKind) => of(kind).map((m) => m.position);
	const placed = (kind: RoomMarkerKind) =>
		of(kind).map((m) => ({ position: m.position, yaw: m.yaw }));
	return {
		name: manifest.name,
		url: '',
		bytes: 0,
		footprint: [0, 0],
		levels: 1,
		sockets: [],
		spawns: points('spawn'),
		spawnYaws: of('spawn').map((m) => m.yaw),
		bounds: boundsOf(manifest.colliders),
		creatures: points('creature'),
		extracts: points('extract'),
		rites: points('rite'),
		altars: points('altar'),
		crates: placed('crate'),
		lootables: of('lootable')
			.filter((m) => Object.hasOwn(LOOTABLES, m.label.split('-')[1] ?? ''))
			.map((m) => ({
				type: m.label.split('-')[1] as LootableId,
				position: m.position,
				yaw: m.yaw,
				...(m.text.holds && { holds: m.text.holds })
			})),
		doors: of('door').map((m) => ({
			position: m.position,
			yaw: m.yaw,
			marker: m.label,
			...(m.text.key && { key: m.text.key }),
			...(m.extras.width > 0 &&
				m.extras.height > 0 && {
					size: [m.extras.width, m.extras.height, DOOR_DEPTH] as Vec3
				})
		})),
		gates: placed('gate'),
		spots: of('spot').map((m) => ({
			name: m.label.slice('spot-'.length),
			position: m.position,
			yaw: m.yaw
		})),
		rubble: points('rubble'),
		ropes: of('rope')
			.filter((m) => m.extras.length > 0)
			.map((m) => ({
				top: m.position,
				length: m.extras.length,
				...(m.extras.exit > 0 && m.extras.exit < m.extras.length && { exit: m.extras.exit }),
				...(m.extras.ladder > 0 && { ladder: true })
			})),
		anchors: of('anchor').map((m) => ({
			position: m.position,
			yaw: m.yaw,
			...(m.extras.rope > 0 && { rope: m.extras.rope })
		})),
		candles: points('candle'),
		colliders: manifest.colliders,
		volumes: manifest.volumes,
		triangles: 0
	};
}
