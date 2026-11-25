/**
 * Turns raw Blender exports (art/export/*.glb) into shippable map pieces.
 * Run with `pnpm asset:build`. See docs/dev/asset-pipeline.md.
 *
 * Creature models (art/export/creatures), the explorer (art/export/player), item models
 * (art/export/items) and props (art/export/props) get their own lighter passes into
 * static/assets/shared/<kind>. Creatures in art/export/afflictions/<id>/creatures belong to that
 * Affliction and go to static/assets/afflictions/<id>/creatures.
 *
 * For each piece:
 *  1. Validates the root empty, footprint, sockets, markers and triangle budget.
 *  2. Strips collision meshes, then dedups, welds, prunes and re-encodes textures as WebP
 *     at 1024 px (or the root's `max_texture` property), and compresses the meshes (meshopt).
 *     Writes <piece>.<hash>.gltf + <piece>.<hash>.bin to static/assets/shared/map, or to
 *     static/assets/afflictions/<id>/map for a piece its kit entry gives to an Affliction.
 *     Textures go to static/assets/shared/textures/<content-hash>.webp, so a texture shared by
 *     many pieces is stored (and downloaded) once.
 *  3. Writes src/lib/shared/map/pieces.generated.ts with sockets, markers, colliders and volumes,
 *     so the server never needs to parse .glb files.
 *
 * Every file name carries a hash of its contents, so it can be cached forever. The other models
 * are listed in src/lib/content/models.generated.ts (path without the hash -> URL and size),
 * which `modelUrl()` reads.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NodeIO, getBounds, type Document, type Node, type Texture } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import * as prettier from 'prettier';
import sharp from 'sharp';
import { dropAnimations, mergeClips, skeletonMismatch, skeletonOnly } from './clips.ts';
import { boneFrames, CLIP_DONORS, LIMB_ALIGNMENT, retargetClips } from './retarget.ts';
import { buildRooms } from './build-rooms.ts';
import { contentHash, hashedName } from './hashed.ts';
import { ITEM_FRAMES, type Axis, type ItemFrame } from './items.config.ts';
import { LOOTABLES, type LootableId } from '../src/lib/content/lootables.ts';
import { MAP_KIT } from '../src/lib/content/map/kit.ts';
import { CELL, LEVEL_HEIGHT } from '../src/lib/shared/map/grid.ts';
import type {
	ColliderBox,
	CrateMarker,
	Edge,
	LootableMarker,
	PieceDef,
	PieceSocket,
	RopeMarker,
	AnchorMarker,
	Vec3,
	VolumeBox,
	SpotMarker
} from '../src/lib/shared/map/types.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'art', 'export');
const ASSET_DIR = path.join(ROOT, 'static', 'assets');
/** Built files in static/assets are served from here. */
const URL_ROOT = '/assets';
/** Shared, content-addressed map textures (static/assets/shared/textures). */
const TEXTURE_DIR = 'shared/textures';
/** Rigged, animated creature models: art/export/creatures -> static/assets/shared/creatures. */
const CREATURE_SOURCE = path.join(SOURCE_DIR, 'creatures');
const CREATURE_TEXTURE = 1024;
/** The explorer (every player's body), rigged and animated: art/export/player. */
const PLAYER_SOURCE = path.join(SOURCE_DIR, 'player');
/** Clips made apart from a rigged model, merged into it: `<name>-clips.glb` beside `<name>.glb`. */
const CLIPS_SUFFIX = '-clips.glb';
/** Item models (weapons, ammo, consumables): art/export/items. */
const ITEM_SOURCE = path.join(SOURCE_DIR, 'items');
const ITEM_TEXTURE = 512;
/** Items over this many triangles (sculpted or generated models) are simplified down to it. */
const ITEM_TRIS = 6000;
/** Props (the loot crate): art/export/props. */
const PROP_SOURCE = path.join(SOURCE_DIR, 'props');
const PROP_TEXTURE = 512;
/** Assets owned by one Affliction: art/export/afflictions/<id>/<kind>. */
const AFFLICTION_SOURCE = path.join(SOURCE_DIR, 'afflictions');
/** Folders from before assets were split into shared/ and afflictions/: removed on build. */
const LEGACY_DIRS = ['map', 'creatures', 'player', 'items', 'props'];
/**
 * Props made elsewhere (scanned or generated: heavy, sitting anywhere): stood on the floor,
 * centred on the origin, scaled by `scale` (to life size) and simplified to `tris`. Props built
 * by scripts/blender/props.py are already in their frame and need no entry.
 */
const PROP_FIT: Record<string, { tris: number; scale?: number; turn?: number }> = {
	// The scan came in at about 1.7x life size: 0.6 matches the living explorer.
	corpse: { tris: 12000, scale: 0.6 },
	// The locked trunk (docs/dev/items.md#locked-trunks): 1.9 m wide as generated; 0.47 makes it
	// 0.9 m wide, 0.73 m high and 0.67 m deep (LOOTABLES.trunk.size), its front to +Z like the crate's.
	trunk: { tris: 6000, scale: 0.47 },
	// The drop box (LOOTABLES.dropBox): 1.9 m wide as generated; 0.26 makes it 0.5 m wide, 0.37 m
	// high with its handle and 0.36 m deep, its hasp to +Z like the crate's front.
	drop_box: { tris: 4000, scale: 0.26 },
	// Room tasks' objects (docs/dev/quests.md#room-tasks), generated about 1.9 m tall, front to +Z.
	// The Carters' bell under its beam, rope and all: 0.52 makes it 1 m tall, and a quarter turn
	// (`turn`, degrees about the vertical) runs the 0.66 m beam out from the wall like a bracket.
	carters_bell: { tris: 8000, scale: 0.52, turn: 90 },
	// The cistern winch: 0.5 makes it 0.95 m wide, 0.7 m high and 0.9 m deep with its chain.
	cistern_winch: { tris: 10000, scale: 0.5 },
	// The oath on its tablet (the rubbing's model): 0.53 makes it 1 m square, 5 cm thick.
	oath_carving: { tris: 6000, scale: 0.53 },
	// The bone pile (LOOTABLES.bonePile): 1.9 m across as generated; 0.5 makes it 0.91 m wide (simplified),
	// 0.21 m high and 0.88 m deep, about the spot its markers were placed for (1 x 0.8).
	bone_pile: { tris: 6000, scale: 0.5 }
};
/**
 * Props whose texture needs more than PROP_TEXTURE: the spider web's strands are a pixel or two
 * wide, and vanish at 512.
 */
const PROP_TEXTURE_SIZE: Record<string, number> = { 'spider-web': 2048 };
const MANIFEST = path.join(ROOT, 'src', 'lib', 'shared', 'map', 'pieces.generated.ts');
const MODEL_MANIFEST = path.join(ROOT, 'src', 'lib', 'content', 'models.generated.ts');
/**
 * Mesh compression (EXT_meshopt_compression). Map pieces keep 16-bit positions (about 0.5 mm
 * over a 30 m room) so seams between neighbouring pieces stay closed.
 */
const PIECE_MESHOPT = { encoder: MeshoptEncoder, level: 'medium', quantizePosition: 16 } as const;
const MODEL_MESHOPT = { encoder: MeshoptEncoder, level: 'medium' } as const;
const EXTENSIONS: Record<string, string> = {
	'image/webp': 'webp',
	'image/png': 'png',
	'image/jpeg': 'jpg'
};

const DEFAULT_TEXTURE = 1024;
const TRI_BUDGET = { connector: 5000, room: 40000 };
const EPS = 0.01;
const FLOOR_SLACK = 0.3;
const MARKER_PREFIXES = [
	'socket-',
	'spawn-',
	'creature-',
	'extract-',
	'rite-',
	'altar-',
	'crate-',
	'lootable-',
	'door-',
	'gate-',
	'spot-',
	'rubble-',
	'rope-',
	'anchor-',
	'candle-',
	'col-',
	'vol-'
];

class PieceError extends Error {}

/** An export that isn't a map piece (e.g. a character model): skipped, not an error. */
class NotAPiece extends Error {}

/** Blender appends .001 etc. to duplicate names across collections; strip it. */
function baseName(node: Node): string {
	return node.getName().replace(/\.\d{3}$/, '');
}

function round(n: number): number {
	return Math.round(n * 1000) / 1000 || 0;
}

function vec(v: ArrayLike<number>): Vec3 {
	return [round(v[0]), round(v[1]), round(v[2])];
}

function socketFromPosition(
	piece: string,
	name: string,
	[x, y, z]: Vec3,
	w: number,
	d: number
): PieceSocket {
	const type = name.split('-')[1];
	const level = Math.round(y / LEVEL_HEIGHT);
	if (Math.abs(y - level * LEVEL_HEIGHT) > EPS) {
		throw new PieceError(`${piece}: ${name} floor height ${y} is not on a level`);
	}
	if (w === 0 && d === 0) {
		// Caps: the opening is at the origin and the piece faces north.
		if (Math.abs(x) > EPS || Math.abs(z) > EPS) {
			throw new PieceError(`${piece}: cap socket ${name} must sit at the origin`);
		}
		return { type, cell: [0, 0], level, edge: 'n' };
	}
	const hx = (w * CELL) / 2;
	const hz = (d * CELL) / 2;
	let edge: Edge;
	let along: number;
	let span: number;
	if (Math.abs(z + hz) < EPS) [edge, along, span] = ['n', x + hx, w];
	else if (Math.abs(z - hz) < EPS) [edge, along, span] = ['s', x + hx, w];
	else if (Math.abs(x - hx) < EPS) [edge, along, span] = ['e', z + hz, d];
	else if (Math.abs(x + hx) < EPS) [edge, along, span] = ['w', z + hz, d];
	else throw new PieceError(`${piece}: ${name} at (${x}, ${z}) is not on the footprint boundary`);

	const index = (along - CELL / 2) / CELL;
	if (Math.abs(index - Math.round(index)) > EPS / CELL || index < -EPS || index > span - 1 + EPS) {
		throw new PieceError(`${piece}: ${name} is not centred on a cell edge`);
	}
	const i = Math.round(index);
	const cell: [number, number] =
		edge === 'n' ? [i, 0] : edge === 's' ? [i, d - 1] : edge === 'e' ? [w - 1, i] : [0, i];
	return { type, cell, level, edge };
}

/** Collision and volume boxes are unit cubes scaled and rotated into place. */
function boxFromNode(node: Node): ColliderBox {
	const s = node.getScale();
	const r = node.getRotation();
	return {
		center: vec(node.getTranslation()),
		halfExtents: [round(s[0] / 2), round(s[1] / 2), round(s[2] / 2)],
		rotation: [round(r[0]), round(r[1]), round(r[2]), round(r[3])]
	};
}

/**
 * A crate-<n> empty: where a loot crate may stand, and which way it faces. The empty's local +Y
 * in Blender (-Z here) points at the wall behind the crate; `yaw` is its turn about +Y.
 */
function crateFromNode(
	piece: string,
	label: string,
	node: Node,
	w: number,
	d: number
): CrateMarker {
	const position = vec(node.getTranslation());
	const [x, , z] = position;
	if (Math.abs(x) > (w * CELL) / 2 + EPS || Math.abs(z) > (d * CELL) / 2 + EPS) {
		throw new PieceError(`${piece}: ${label} at (${x}, ${z}) is outside the footprint`);
	}
	const r = node.getRotation();
	if (Math.abs(r[0]) > EPS || Math.abs(r[2]) > EPS) {
		throw new PieceError(`${piece}: ${label} must only be turned about the vertical axis`);
	}
	return { position, yaw: round(2 * Math.atan2(r[1], r[3])) };
}

/**
 * A rope-<n> empty: the top of a rope hanging straight down, `length` m long (a custom property).
 * `exit`, on an extraction rope: how far up from its foot a climber gets out.
 */
function ropeFromNode(piece: string, label: string, node: Node): RopeMarker {
	const extras = node.getExtras() as Record<string, unknown>;
	const length = Number(extras.length);
	if (!(length > 0)) throw new PieceError(`${piece}: ${label} needs a length property (m)`);
	const rope: RopeMarker = { top: vec(node.getTranslation()), length: round(length) };
	if (extras.exit !== undefined) {
		const exit = Number(extras.exit);
		if (!(exit > 0 && exit < length)) {
			throw new PieceError(`${piece}: ${label} exit must be between 0 and its length`);
		}
		rope.exit = round(exit);
	}
	return rope;
}

/** Vertical extent of an oriented box (its 8 corners, rotated). */
function boxYRange(box: ColliderBox): [number, number] {
	const [x, y, z, w] = box.rotation;
	// Y row of the rotation matrix
	const r = [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)];
	const ext = r.reduce((sum, v, i) => sum + Math.abs(v) * box.halfExtents[i], 0);
	return [box.center[1] - ext, box.center[1] + ext];
}

function triangleCount(doc: Document): number {
	let tris = 0;
	for (const mesh of doc.getRoot().listMeshes()) {
		for (const prim of mesh.listPrimitives()) {
			const indices = prim.getIndices();
			const count = indices ? indices.getCount() : (prim.getAttribute('POSITION')?.getCount() ?? 0);
			tris += count / 3;
		}
	}
	return tris;
}

async function buildPiece(io: NodeIO, file: string): Promise<PieceDef> {
	const name = path.basename(file, '.glb');
	const doc = await io.read(file);
	const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
	const root = scene?.listChildren().find((n) => baseName(n) === name);
	if (!root) throw new NotAPiece(name);
	const t = root.getTranslation();
	if (t.some((v) => Math.abs(v) > EPS)) throw new PieceError(`${name}: root must be at the origin`);

	const extras = root.getExtras() as Record<string, unknown>;
	const w = Number(extras.footprint_w);
	const d = Number(extras.footprint_d);
	const levels = Number(extras.levels ?? 1);
	// Metres a piece may rise over its top level: only for one nothing is ever built over (the
	// start room's dome; the map grows down from it).
	const headroom = Number(extras.headroom ?? 0);
	if (!Number.isInteger(w) || !Number.isInteger(d)) {
		throw new PieceError(`${name}: root needs integer footprint_w / footprint_d properties`);
	}
	const maxTexture = Number(extras.max_texture ?? DEFAULT_TEXTURE);

	const sockets: PieceSocket[] = [];
	const spawns: Vec3[] = [];
	const creatures: Vec3[] = [];
	const extracts: Vec3[] = [];
	const rites: Vec3[] = [];
	const altars: Vec3[] = [];
	const crates: CrateMarker[] = [];
	const lootables: LootableMarker[] = [];
	const doors: CrateMarker[] = [];
	const gates: CrateMarker[] = [];
	const spots: SpotMarker[] = [];
	const rubble: Vec3[] = [];
	const ropes: RopeMarker[] = [];
	const anchors: AnchorMarker[] = [];
	const candles: Vec3[] = [];
	const colliders: ColliderBox[] = [];
	const volumes: VolumeBox[] = [];
	const stripped: Node[] = [];

	for (const node of root.listChildren()) {
		const label = baseName(node);
		const position = vec(node.getTranslation());
		if (label.startsWith('socket-')) {
			sockets.push(socketFromPosition(name, label, position, w, d));
		} else if (label.startsWith('spawn-')) {
			spawns.push(position);
		} else if (label.startsWith('creature-')) {
			creatures.push(position);
		} else if (label.startsWith('extract-')) {
			extracts.push(position);
		} else if (label.startsWith('rite-')) {
			rites.push(position);
		} else if (label.startsWith('altar-')) {
			altars.push(position);
		} else if (label.startsWith('rubble-')) {
			rubble.push(position);
		} else if (label.startsWith('rope-')) {
			ropes.push(ropeFromNode(name, label, node));
		} else if (label.startsWith('anchor-')) {
			// The empty's local +Y in Blender (-Z here) points out over the drop.
			const { position, yaw } = crateFromNode(name, label, node, w, d);
			// `rope` (m): a rope tied there for good (the start room's way down).
			const rope = Number((node.getExtras() as Record<string, unknown>).rope ?? 0);
			anchors.push(rope > 0 ? { position, yaw, rope: round(rope) } : { position, yaw });
		} else if (label.startsWith('candle-')) {
			candles.push(position);
		} else if (label.startsWith('crate-')) {
			crates.push(crateFromNode(name, label, node, w, d));
		} else if (label.startsWith('lootable-')) {
			// lootable-<type>-<n>: a crate marker for one kind (docs/dev/lootables.md), at its centre.
			const type = label.split('-')[1];
			if (!Object.hasOwn(LOOTABLES, type)) {
				throw new PieceError(
					`${name}: ${label} names no lootable (${Object.keys(LOOTABLES).join(', ')})`
				);
			}
			lootables.push({ type: type as LootableId, ...crateFromNode(name, label, node, w, d) });
		} else if (label.startsWith('door-')) {
			doors.push(crateFromNode(name, label, node, w, d));
		} else if (label.startsWith('gate-')) {
			gates.push(crateFromNode(name, label, node, w, d));
		} else if (label.startsWith('spot-')) {
			// spot-<name>: a named place in the piece (Rumors' tutorial stops and dummies).
			spots.push({ name: label.slice('spot-'.length), ...crateFromNode(name, label, node, w, d) });
		} else if (label.startsWith('col-')) {
			colliders.push(boxFromNode(node));
			stripped.push(node);
		} else if (label.startsWith('vol-')) {
			// vol-<kind>-<n>, e.g. vol-water-0
			volumes.push({ kind: label.split('-')[1], ...boxFromNode(node) });
			stripped.push(node);
		} else if (!node.getMesh() && MARKER_PREFIXES.every((p) => !label.startsWith(p))) {
			console.warn(`  ${name}: empty "${label}" has no known marker prefix`);
		}
	}
	if (sockets.length === 0) throw new PieceError(`${name}: no socket-* markers`);

	for (const node of stripped) {
		node.getMesh()?.dispose();
		node.dispose();
	}

	// Blender scene custom properties (addon state etc.) are not game data.
	for (const s of doc.getRoot().listScenes()) s.setExtras({});

	// The generator reserves `levels` grid levels; geometry outside them would intrude on other pieces.
	const bounds = getBounds(root);
	const ceiling = levels * LEVEL_HEIGHT + headroom;
	for (const box of [...colliders, ...volumes]) {
		const [lo, hi] = boxYRange(box);
		bounds.min[1] = Math.min(bounds.min[1], lo);
		bounds.max[1] = Math.max(bounds.max[1], hi);
	}
	// Floor colliders may sit up to FLOOR_SLACK below the origin (they are slabs under the floor).
	if (bounds.max[1] > ceiling + EPS || bounds.min[1] < -FLOOR_SLACK) {
		throw new PieceError(
			`${name}: geometry spans y ${round(bounds.min[1])}..${round(bounds.max[1])} but levels=${levels}${headroom ? ` (headroom ${headroom})` : ''} allows 0..${ceiling}; raise the root's levels property`
		);
	}

	const triangles = triangleCount(doc);
	const budget = w * d <= 1 ? TRI_BUDGET.connector : TRI_BUDGET.room;
	if (triangles > budget) {
		throw new PieceError(`${name}: ${triangles} triangles exceeds the budget of ${budget}`);
	}

	await doc.transform(
		dedup(),
		weld(),
		textureCompress({
			encoder: sharp,
			targetFormat: 'webp',
			resize: [maxTexture, maxTexture],
			quality: 85
		}),
		prune(),
		meshopt(PIECE_MESHOPT)
	);

	const affliction = MAP_KIT[name]?.affliction;
	const { url, bytes, own } = await writePiece(io, doc, name, `${ownerDir(affliction)}/map`);
	const raw = (statSync(file).size / 1e6).toFixed(1);
	console.log(
		`  ${name}${affliction ? ` (${affliction})` : ''}: ${triangles} tris, ${raw} MB -> ${(own / 1e3).toFixed(0)} KB + shared textures`
	);

	return {
		name,
		url,
		bytes,
		footprint: [w, d],
		levels,
		sockets,
		spawns,
		creatures,
		extracts,
		rites,
		altars,
		crates,
		...(lootables.length ? { lootables } : {}),
		doors,
		...(gates.length ? { gates } : {}),
		...(spots.length ? { spots } : {}),
		rubble,
		ropes,
		anchors,
		candles,
		colliders,
		volumes,
		triangles
	};
}

/** Where an owner's assets live in static/assets: shared/, or afflictions/<id>/. */
function ownerDir(affliction: string | undefined): string {
	return affliction ? `afflictions/${affliction}` : 'shared';
}

/** Built models other than map pieces: path without hash (`shared/items/knife.glb`) -> file. */
const models: Record<string, { url: string; bytes: number }> = {};

/**
 * Remove previous build output so deleted models and unused textures do not linger. Clears the
 * kinds this script builds, in shared/ and in every afflictions/<id>/, and the old flat folders.
 */
function cleanOutput(): void {
	const kinds = ['map', 'textures', 'creatures', 'player', 'items', 'props'];
	for (const kind of kinds)
		rmSync(path.join(ASSET_DIR, 'shared', kind), { recursive: true, force: true });
	const afflictions = path.join(ASSET_DIR, 'afflictions');
	if (existsSync(afflictions)) {
		for (const id of readdirSync(afflictions)) {
			for (const kind of kinds)
				rmSync(path.join(afflictions, id, kind), { recursive: true, force: true });
		}
	}
	for (const dir of LEGACY_DIRS)
		rmSync(path.join(ASSET_DIR, dir), { recursive: true, force: true });
	mkdirSync(path.join(ASSET_DIR, TEXTURE_DIR), { recursive: true });
}

/**
 * Write a piece as <name>.<hash>.gltf + <name>.<hash>.bin in `dir` (relative to static/assets),
 * with its textures in the shared, content-addressed texture folder. Returns its URL, the bytes a
 * client downloads for it (with textures, counting shared ones too) and the piece's own bytes.
 */
async function writePiece(
	io: NodeIO,
	doc: Document,
	name: string,
	dir: string
): Promise<{ url: string; bytes: number; own: number }> {
	const out = path.join(ASSET_DIR, dir);
	mkdirSync(out, { recursive: true });
	const root = doc.getRoot();
	let textureBytes = 0;
	for (const texture of root.listTextures()) {
		const image = texture.getImage();
		if (!image) continue;
		const ext = EXTENSIONS[texture.getMimeType()] ?? 'bin';
		const file = `${contentHash(image, 16)}.${ext}`;
		const target = path.join(ASSET_DIR, TEXTURE_DIR, file);
		if (!existsSync(target)) writeFileSync(target, image);
		const uri = `${path.posix.relative(dir, TEXTURE_DIR)}/${file}`;
		texture.setURI(uri);
		textureBytes += image.byteLength;
	}
	root.listBuffers().forEach((buffer, i) => buffer.setURI(i ? `${name}-${i}.bin` : `${name}.bin`));

	const { json, resources } = await io.writeJSON(doc);
	let own = 0;
	for (const buffer of json.buffers ?? []) {
		if (!buffer.uri) continue;
		const data = resources[buffer.uri];
		const file = hashedName(buffer.uri, data);
		writeFileSync(path.join(out, file), data);
		buffer.uri = file;
		own += data.byteLength;
	}
	const gltf = JSON.stringify(json);
	const file = hashedName(`${name}.gltf`, gltf);
	writeFileSync(path.join(out, file), gltf);
	own += gltf.length;
	return { url: `${URL_ROOT}/${dir}/${file}`, bytes: own + textureBytes, own };
}

/** Write a self-contained .glb under a content-hashed name and list it in the model manifest. */
async function writeModel(io: NodeIO, doc: Document, dir: string, name: string): Promise<number> {
	const out = path.join(ASSET_DIR, dir);
	mkdirSync(out, { recursive: true });
	const glb = await io.writeBinary(doc);
	const file = hashedName(`${name}.glb`, glb);
	writeFileSync(path.join(out, file), glb);
	models[`${dir}/${name}.glb`] = { url: `${URL_ROOT}/${dir}/${file}`, bytes: glb.byteLength };
	return glb.byteLength;
}

/**
 * Rigged models (creatures, the explorer) keep their skin and animations; textures are
 * re-encoded to WebP and the file is written as a single self-contained .glb. A
 * `<name>-clips.glb` beside `<name>.glb` holds more clips for it, made apart (the explorer's,
 * from scripts/blender/explorer.py): they are merged in by bone name (`mergeClips`). A model in
 * `CLIP_DONORS` also borrows clips from another rig, retargeted (`retargetClips`).
 */
async function buildCharacters(
	io: NodeIO,
	label: string,
	source: string,
	dir: string
): Promise<void> {
	if (!existsSync(source)) return;
	for (const f of readdirSync(source)
		.filter((name) => name.endsWith('.glb') && !name.endsWith(CLIPS_SUFFIX))
		.sort()) {
		const file = path.join(source, f);
		const doc = await io.read(file);
		for (const s of doc.getRoot().listScenes()) s.setExtras({});
		const clips = path.join(source, path.basename(f, '.glb') + CLIPS_SUFFIX);
		if (existsSync(clips)) mergeClips(doc, await io.read(clips));
		// Clips borrowed from another model with the same bones (scripts/retarget.ts).
		const donor = CLIP_DONORS[path.basename(f, '.glb')];
		if (donor) retargetClips(doc, await io.read(path.join(SOURCE_DIR, donor.from)), donor.clips);
		const animations = doc
			.getRoot()
			.listAnimations()
			.map((a) => a.getName());
		await doc.transform(
			dedup(),
			textureCompress({
				encoder: sharp,
				targetFormat: 'webp',
				resize: [CREATURE_TEXTURE, CREATURE_TEXTURE],
				quality: 85
			}),
			prune(),
			meshopt(MODEL_MESHOPT)
		);
		const mb = ((await writeModel(io, doc, dir, path.basename(f, '.glb'))) / 1e6).toFixed(2);
		const raw = (statSync(file).size / 1e6).toFixed(1);
		console.log(
			`  ${label} ${path.basename(f, '.glb')}: ${raw} MB -> ${mb} MB, animations: ${animations.join(', ')}`
		);
	}
}

const AXES: Record<Axis, Vec3> = {
	'+x': [1, 0, 0],
	'-x': [-1, 0, 0],
	'+y': [0, 1, 0],
	'-y': [0, -1, 0],
	'+z': [0, 0, 1],
	'-z': [0, 0, -1]
};

/**
 * Stand a raw item model up in the game's item frame (see scripts/items.config.ts): turned to
 * point down -Z with its top up, scaled to its real length, with the grip at the origin.
 */
function frameItem(doc: Document, frame: ItemFrame): void {
	const f = AXES[frame.forward];
	const u = AXES[frame.up];
	const r: Vec3 = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
	if (Math.hypot(...r) < 0.5) throw new Error('forward and up must be different axes');
	const scene = doc.getRoot().listScenes()[0];
	const holder = doc.createNode('item');
	// A model that lies askew in its file is first turned square (`tilt`), about one of its axes.
	const inner = frame.tilt ? doc.createNode('tilt') : holder;
	for (const child of scene.listChildren()) inner.addChild(child);
	if (frame.tilt) {
		const [x, y, z] = AXES[frame.tilt.axis];
		const half = (frame.tilt.degrees * Math.PI) / 360;
		const sin = Math.sin(half);
		inner.setRotation([x * sin, y * sin, z * sin, Math.cos(half)]);
		holder.addChild(inner);
	}
	scene.addChild(holder);
	// Rows are where each game axis comes from: right, up, and back (-forward).
	const turn = (s: number, t: Vec3): number[] => [
		...[r[0] * s, u[0] * s, -f[0] * s, 0],
		...[r[1] * s, u[1] * s, -f[1] * s, 0],
		...[r[2] * s, u[2] * s, -f[2] * s, 0],
		...[t[0], t[1], t[2], 1]
	];
	holder.setMatrix(turn(1, [0, 0, 0]) as Parameters<Node['setMatrix']>[0]);
	const turned = getBounds(scene);
	const s = frame.length / (turned.max[2] - turned.min[2]);
	const [back, up] = frame.grip;
	const grip: Vec3 = [
		(turned.min[0] + turned.max[0]) / 2,
		turned.min[1] + (turned.max[1] - turned.min[1]) * up,
		turned.max[2] - (turned.max[2] - turned.min[2]) * back
	];
	holder.setMatrix(
		turn(s, [-grip[0] * s, -grip[1] * s, -grip[2] * s]) as Parameters<Node['setMatrix']>[0]
	);
}

/**
 * Item models. Ones built in the kit .blend are tiny and already in the item frame: they're
 * just deduplicated, welded and pruned. Ones listed in scripts/items.config.ts are also turned,
 * scaled and re-centred. Heavy meshes are simplified and textures re-encoded to WebP.
 */
async function buildItems(io: NodeIO): Promise<void> {
	await MeshoptSimplifier.ready;
	if (!existsSync(ITEM_SOURCE)) return;
	const built: string[] = [];
	for (const f of readdirSync(ITEM_SOURCE)
		.filter((name) => name.endsWith('.glb'))
		.sort()) {
		const id = path.basename(f, '.glb');
		const file = path.join(ITEM_SOURCE, f);
		const doc = await io.read(file);
		for (const scene of doc.getRoot().listScenes()) scene.setExtras({});
		const frame = ITEM_FRAMES[id];
		if (frame) frameItem(doc, frame);
		const tris = triangleCount(doc);
		await doc.transform(dedup(), weld());
		if (tris > ITEM_TRIS) {
			await doc.transform(
				simplify({ simplifier: MeshoptSimplifier, ratio: ITEM_TRIS / tris, error: 0.02 })
			);
		}
		if (doc.getRoot().listTextures().length) {
			await doc.transform(
				textureCompress({
					encoder: sharp,
					targetFormat: 'webp',
					resize: [ITEM_TEXTURE, ITEM_TEXTURE],
					quality: 85
				})
			);
		}
		await doc.transform(prune(), meshopt(MODEL_MESHOPT));
		const size = await writeModel(io, doc, 'shared/items', id);
		const raw = statSync(file).size;
		if (raw > 1e6) {
			const kb = Math.round(size / 1e3);
			console.log(
				`  item ${id}: ${tris} -> ${triangleCount(doc)} tris, ${(raw / 1e6).toFixed(1)} MB -> ${kb} KB${frame ? '' : ' (no entry in items.config.ts: left as exported)'}`
			);
		}
		built.push(id);
	}
	console.log(`  items: ${built.join(', ')}`);
}

/** Scale a prop, then put its lowest point on the floor (y = 0) and its middle over the origin. */
function standOnFloor(doc: Document, name: string, scale = 1, turn = 0): void {
	const scene = doc.getRoot().listScenes()[0];
	const holder = doc.createNode(name);
	for (const child of scene.listChildren()) holder.addChild(child);
	scene.addChild(holder);
	holder.setScale([scale, scale, scale]);
	const half = (turn * Math.PI) / 360;
	if (turn) holder.setRotation([0, Math.sin(half), 0, Math.cos(half)]);
	const b = getBounds(scene);
	holder.setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]);
}

/**
 * Props: textures re-encoded to WebP, one self-contained .glb each. Nodes keep their names and
 * are not merged: the game moves some of them (the crate's lid). Ones in PROP_FIT are also stood
 * on the floor and simplified. No meshopt: its quantization rewrites mesh node transforms, which
 * the game animates.
 */
async function buildProps(io: NodeIO): Promise<void> {
	await MeshoptSimplifier.ready;
	if (!existsSync(PROP_SOURCE)) return;
	for (const f of readdirSync(PROP_SOURCE)
		.filter((name) => name.endsWith('.glb'))
		.sort()) {
		const file = path.join(PROP_SOURCE, f);
		const doc = await io.read(file);
		for (const scene of doc.getRoot().listScenes()) scene.setExtras({});
		const id = path.basename(f, '.glb');
		const fit = PROP_FIT[id];
		const tris = triangleCount(doc);
		if (fit) standOnFloor(doc, id, fit.scale, fit.turn);
		await doc.transform(dedup(), weld());
		if (fit && tris > fit.tris) {
			await doc.transform(
				simplify({ simplifier: MeshoptSimplifier, ratio: fit.tris / tris, error: 0.02 })
			);
		}
		await doc.transform(
			textureCompress({
				encoder: sharp,
				targetFormat: 'webp',
				resize: [PROP_TEXTURE_SIZE[id] ?? PROP_TEXTURE, PROP_TEXTURE_SIZE[id] ?? PROP_TEXTURE],
				quality: 85
			}),
			prune()
		);
		const bytes = await writeModel(io, doc, 'shared/props', id);
		const raw = (statSync(file).size / 1e6).toFixed(1);
		const size = fit ? `, ${tris} -> ${triangleCount(doc)} tris` : '';
		console.log(`  prop ${id}: ${raw} MB -> ${(bytes / 1e3).toFixed(0)} KB${size}`);
	}
}

async function writeManifest(pieces: PieceDef[]): Promise<void> {
	const record = Object.fromEntries(pieces.map((p) => [p.name, p]));
	const source = `// Generated by \`pnpm asset:build\` from art/export/*.glb. Do not edit by hand.
import type { PieceDef } from './types.ts';

export const PIECES: Record<string, PieceDef> = ${JSON.stringify(record)};
`;
	await writeFormatted(MANIFEST, source);
}

/** src/lib/content/models.generated.ts: every model but the map pieces, for `modelUrl()`. */
async function writeModelManifest(): Promise<void> {
	const sorted = Object.fromEntries(Object.entries(models).sort(([a], [b]) => a.localeCompare(b)));
	const source = `// Generated by \`pnpm asset:build\` from art/export. Do not edit by hand.

/** Built models: path in static/assets without the content hash -> URL and size in bytes. */
export const MODELS = ${JSON.stringify(sorted)} as const;
`;
	await writeFormatted(MODEL_MANIFEST, source);
}

async function writeFormatted(file: string, source: string): Promise<void> {
	const config = await prettier.resolveConfig(file);
	writeFileSync(file, await prettier.format(source, { ...config, filepath: file }));
}

/**
 * The explorer, dressed (scripts/blender/wardrobe.py): per body, its mesh
 * (`body-<body>.glb`), each wardrobe piece fitted to it (`<body>/<piece>.glb`), and the clips,
 * retargeted onto its skeleton. The clips come from the old explorer: its Mixamo clips
 * (`explorer.glb`, whose mesh no longer ships) and the hand-keyed ones (`explorer-clips.glb`).
 * Written to shared/player/<body>/: `body.glb`, `anims.glb` (skeleton and clips only) and one
 * file per piece. See docs/dev/asset-pipeline.md#the-explorer.
 */
async function buildExplorer(io: NodeIO): Promise<void> {
	const library = path.join(PLAYER_SOURCE, 'explorer.glb');
	if (!existsSync(library)) return;
	const clips = await io.read(library);
	mergeClips(clips, await io.read(path.join(PLAYER_SOURCE, 'explorer' + CLIPS_SUFFIX)));
	const names = clips
		.getRoot()
		.listAnimations()
		.map((a) => a.getName());
	const extraDir = path.join(PLAYER_SOURCE, 'animations');
	const extraClips = existsSync(extraDir)
		? await Promise.all(
				readdirSync(extraDir)
					.filter((f) => f.endsWith('.glb'))
					.sort()
					.map((f) => io.read(path.join(extraDir, f)))
			)
		: [];
	const bodies = readdirSync(PLAYER_SOURCE)
		.filter((f) => /^body-.+\.glb$/.test(f))
		.map((f) => f.slice('body-'.length, -'.glb'.length))
		.sort();
	for (const body of bodies) {
		const dir = `shared/player/${body}`;
		const file = path.join(PLAYER_SOURCE, `body-${body}.glb`);
		// The clips, on this body's skeleton.
		const anims = await io.read(file);
		dropAnimations(anims);
		retargetClips(anims, clips, Object.fromEntries(names.map((n) => [n, n])), {
			align: LIMB_ALIGNMENT,
			keyedOnly: true
		});
		// Clips from elsewhere (Mixamo), one per file in animations/ (scripts/blender/animations.py).
		for (const donor of extraClips) {
			const names = donor
				.getRoot()
				.listAnimations()
				.map((a) => a.getName());
			retargetClips(anims, donor, Object.fromEntries(names.map((n) => [n, n])), {
				align: LIMB_ALIGNMENT,
				keyedOnly: true
			});
		}
		// Where the old explorer's hand frame is on this body's hand: the items' grips are in it.
		const frames = boneFrames(anims, clips, LIMB_ALIGNMENT, ['RightHand']);
		skeletonOnly(anims);
		for (const scene of anims.getRoot().listScenes()) scene.setExtras({ boneFrames: frames });
		await anims.transform(prune(), meshopt(MODEL_MESHOPT));
		const animsKb = (await writeModel(io, anims, dir, 'anims')) / 1e3;
		// The body, then each piece fitted to it.
		const skeleton = await io.read(file);
		const bodyKb = (await writeExplorerModel(io, await io.read(file), dir, 'body')) / 1e3;
		const clipCount = anims.getRoot().listAnimations().length;
		console.log(
			`  explorer ${body}: body ${bodyKb.toFixed(0)} KB, ${clipCount} clips ${animsKb.toFixed(0)} KB`
		);
		const pieceDir = path.join(PLAYER_SOURCE, body);
		if (!existsSync(pieceDir)) continue;
		for (const f of readdirSync(pieceDir)
			.filter((n) => n.endsWith('.glb'))
			.sort()) {
			const piece = await io.read(path.join(pieceDir, f));
			const wrong = skeletonMismatch(skeleton, piece);
			if (wrong.length) throw new Error(`${body}/${f} doesn't fit the body: ${wrong.join('; ')}`);
			const kb = (await writeExplorerModel(io, piece, dir, path.basename(f, '.glb'))) / 1e3;
			console.log(`    ${path.basename(f, '.glb')}: ${kb.toFixed(0)} KB`);
		}
	}
}

/**
 * A body or a wardrobe piece: no clips, textures to WebP.
 */
async function writeExplorerModel(
	io: NodeIO,
	model: Document,
	dir: string,
	name: string
): Promise<number> {
	dropAnimations(model);
	for (const s of model.getRoot().listScenes()) s.setExtras({});
	// How each material is drawn, as wardrobe.py tagged it (MPFB makes every one alpha-blended).
	for (const material of model.getRoot().listMaterials()) {
		const extras = material.getExtras() as { alpha?: string; double_sided?: boolean };
		if (extras.alpha === 'MASK') material.setAlphaMode('MASK').setAlphaCutoff(0.5);
		else if (extras.alpha === 'OPAQUE') material.setAlphaMode('OPAQUE');
		if (extras.double_sided !== undefined) material.setDoubleSided(extras.double_sided);
		material.setExtras({});
		const texture = material.getBaseColorTexture();
		if (material.getAlphaMode() === 'OPAQUE' && texture) await fillHoles(texture);
	}
	await model.transform(
		dedup(),
		textureCompress({
			encoder: sharp,
			targetFormat: 'webp',
			resize: [CREATURE_TEXTURE, CREATURE_TEXTURE],
			quality: 85
		}),
		prune(),
		// _HIDE (bit values over 1) is out of quantize's range and is left as floats.
		meshopt(MODEL_MESHOPT)
	);
	return writeModel(io, model, dir, name);
}

/**
 * An opaque material's texture with see-through parts (the worn holes at the polo's hem) drawn
 * opaque would show them black: fill them with the texture's own average colour, and drop the
 * alpha. A texture with none is left as it is.
 */
async function fillHoles(texture: Texture): Promise<void> {
	const image = texture.getImage();
	if (!image) return;
	const { data, info } = await sharp(image)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	let r = 0;
	let g = 0;
	let b = 0;
	let w = 0;
	let holes = 0;
	for (let i = 0; i < data.length; i += 4) {
		const a = data[i + 3] / 255;
		if (a < 1) holes++;
		r += data[i] * a;
		g += data[i + 1] * a;
		b += data[i + 2] * a;
		w += a;
	}
	if (!holes || !w) return;
	const background = { r: Math.round(r / w), g: Math.round(g / w), b: Math.round(b / w) };
	const filled = await sharp(data, { raw: info }).flatten({ background }).png().toBuffer();
	texture.setImage(new Uint8Array(filled)).setMimeType('image/png');
}

/** Rigged creatures: the shared ones, then each Affliction's own. */
async function buildCreatures(io: NodeIO): Promise<void> {
	await buildCharacters(io, 'creature', CREATURE_SOURCE, 'shared/creatures');
	if (!existsSync(AFFLICTION_SOURCE)) return;
	for (const id of readdirSync(AFFLICTION_SOURCE).sort()) {
		const source = path.join(AFFLICTION_SOURCE, id, 'creatures');
		await buildCharacters(io, `${id} creature`, source, `${ownerDir(id)}/creatures`);
	}
}

async function main(): Promise<void> {
	if (!existsSync(SOURCE_DIR)) {
		console.error(`No raw exports found. Export pieces from Blender into ${SOURCE_DIR}`);
		process.exit(1);
	}
	await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
	cleanOutput();
	const io = new NodeIO()
		.registerExtensions(ALL_EXTENSIONS)
		.registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
	const files = readdirSync(SOURCE_DIR)
		.filter((f) => f.endsWith('.glb'))
		.sort();

	const pieces: PieceDef[] = [];
	let failed = false;
	for (const f of files) {
		// Retired pieces (still in the .blend and art/export) ship only while MAP_KIT uses them.
		if (!MAP_KIT[path.basename(f, '.glb')]) {
			console.warn(`  - ${path.basename(f, '.glb')}: not in MAP_KIT, skipped`);
			continue;
		}
		try {
			pieces.push(await buildPiece(io, path.join(SOURCE_DIR, f)));
		} catch (error) {
			if (error instanceof NotAPiece) {
				console.warn(
					`  - ${error.message}: skipped (no root empty named after the file, so not a map piece)`
				);
			} else if (error instanceof PieceError) {
				console.error(`  ✗ ${error.message}`);
				failed = true;
			} else {
				throw error;
			}
		}
	}
	if (failed) process.exit(1);
	await writeManifest(pieces);
	await buildCreatures(io);
	await buildExplorer(io);
	await buildItems(io);
	await buildProps(io);
	await writeModelManifest();
	// The fixed map's rooms (scripts/build-rooms.ts, also `pnpm asset:rooms` on its own).
	await buildRooms();
	const textureDir = path.join(ASSET_DIR, TEXTURE_DIR);
	const textures = readdirSync(textureDir);
	const textureBytes = textures.reduce(
		(sum, f) => sum + statSync(path.join(textureDir, f)).size,
		0
	);
	console.log(
		`Built ${pieces.length} pieces + ${textures.length} shared textures (${(textureBytes / 1e6).toFixed(1)} MB) and ${Object.keys(models).length} models -> ${path.relative(ROOT, ASSET_DIR)}`
	);
}

await main();
