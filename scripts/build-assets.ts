/**
 * Turns raw Blender exports (art/export/*.glb) into shippable map pieces.
 * Run with `pnpm asset:build`. See docs/dev/asset-pipeline.md.
 *
 * Creature models (art/export/creatures), item models (art/export/items) and props
 * (art/export/props) get their own lighter passes into static/assets/creatures,
 * static/assets/items and static/assets/props.
 *
 * For each piece:
 *  1. Validates the root empty, footprint, sockets, markers and triangle budget.
 *  2. Strips collision meshes, then dedups, welds, prunes and re-encodes textures as WebP
 *     at 1024 px (or the root's `max_texture` property). Writes static/assets/map/<piece>.gltf
 *     + <piece>.bin; textures go to static/assets/map/textures/<content-hash>.webp, so a texture
 *     shared by many pieces is stored (and downloaded) once.
 *  3. Writes src/lib/shared/map/pieces.generated.ts with sockets, markers, colliders and volumes,
 *     so the server never needs to parse .glb files.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NodeIO, getBounds, type Document, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import * as prettier from 'prettier';
import sharp from 'sharp';
import { ITEM_FRAMES, type Axis, type ItemFrame } from './items.config.ts';
import { CELL, LEVEL_HEIGHT } from '../src/lib/shared/map/grid.ts';
import type {
	ColliderBox,
	CrateMarker,
	Edge,
	PieceDef,
	PieceSocket,
	Vec3,
	VolumeBox
} from '../src/lib/shared/map/types.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'art', 'export');
const OUT_DIR = path.join(ROOT, 'static', 'assets', 'map');
/** Rigged, animated creature models: art/export/creatures -> static/assets/creatures. */
const CREATURE_SOURCE = path.join(SOURCE_DIR, 'creatures');
const CREATURE_OUT = path.join(ROOT, 'static', 'assets', 'creatures');
const CREATURE_TEXTURE = 1024;
/** The explorer (every player's body), rigged and animated: art/export/player -> static/assets/player. */
const PLAYER_SOURCE = path.join(SOURCE_DIR, 'player');
const PLAYER_OUT = path.join(ROOT, 'static', 'assets', 'player');
/** Item models (weapons, ammo, consumables): art/export/items -> static/assets/items. */
const ITEM_SOURCE = path.join(SOURCE_DIR, 'items');
const ITEM_OUT = path.join(ROOT, 'static', 'assets', 'items');
const ITEM_TEXTURE = 512;
/** Items over this many triangles (sculpted or generated models) are simplified down to it. */
const ITEM_TRIS = 6000;
/** Props (the loot crate): art/export/props -> static/assets/props. */
const PROP_SOURCE = path.join(SOURCE_DIR, 'props');
const PROP_OUT = path.join(ROOT, 'static', 'assets', 'props');
const PROP_TEXTURE = 512;
const MANIFEST = path.join(ROOT, 'src', 'lib', 'shared', 'map', 'pieces.generated.ts');
const URL_BASE = '/assets/map';
const TEXTURE_DIR = 'textures';
const EXTENSIONS: Record<string, string> = {
	'image/webp': 'webp',
	'image/png': 'png',
	'image/jpeg': 'jpg'
};

const DEFAULT_TEXTURE = 1024;
const TRI_BUDGET = { connector: 5000, room: 40000 };
const EPS = 0.01;
const FLOOR_SLACK = 0.3;
const MARKER_PREFIXES = ['socket-', 'spawn-', 'extract-', 'rite-', 'crate-', 'col-', 'vol-'];

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
	if (!Number.isInteger(w) || !Number.isInteger(d)) {
		throw new PieceError(`${name}: root needs integer footprint_w / footprint_d properties`);
	}
	const maxTexture = Number(extras.max_texture ?? DEFAULT_TEXTURE);

	const sockets: PieceSocket[] = [];
	const spawns: Vec3[] = [];
	const extracts: Vec3[] = [];
	const rites: Vec3[] = [];
	const crates: CrateMarker[] = [];
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
		} else if (label.startsWith('extract-')) {
			extracts.push(position);
		} else if (label.startsWith('rite-')) {
			rites.push(position);
		} else if (label.startsWith('crate-')) {
			crates.push(crateFromNode(name, label, node, w, d));
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
	const ceiling = levels * LEVEL_HEIGHT;
	for (const box of [...colliders, ...volumes]) {
		const [lo, hi] = boxYRange(box);
		bounds.min[1] = Math.min(bounds.min[1], lo);
		bounds.max[1] = Math.max(bounds.max[1], hi);
	}
	// Floor colliders may sit up to FLOOR_SLACK below the origin (they are slabs under the floor).
	if (bounds.max[1] > ceiling + EPS || bounds.min[1] < -FLOOR_SLACK) {
		throw new PieceError(
			`${name}: geometry spans y ${round(bounds.min[1])}..${round(bounds.max[1])} but levels=${levels} allows 0..${ceiling}; raise the root's levels property`
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
		prune()
	);

	const bytes = await writePiece(io, doc, name);
	const raw = (statSync(file).size / 1e6).toFixed(1);
	console.log(
		`  ${name}: ${triangles} tris, ${raw} MB -> ${(bytes / 1e3).toFixed(0)} KB + shared textures`
	);

	return {
		name,
		url: `${URL_BASE}/${name}.gltf`,
		footprint: [w, d],
		levels,
		sockets,
		spawns,
		extracts,
		rites,
		crates,
		colliders,
		volumes,
		triangles
	};
}

/** Remove previous build output so deleted pieces and unused textures do not linger. */
function cleanOutput(): void {
	mkdirSync(OUT_DIR, { recursive: true });
	for (const f of readdirSync(OUT_DIR)) {
		if (/\.(glb|gltf|bin)$/.test(f)) rmSync(path.join(OUT_DIR, f));
	}
	rmSync(path.join(OUT_DIR, TEXTURE_DIR), { recursive: true, force: true });
	mkdirSync(path.join(OUT_DIR, TEXTURE_DIR));
}

/**
 * Write a piece as <name>.gltf + <name>.bin with its textures in the shared, content-addressed
 * texture folder. Returns the bytes written for the piece itself (excluding textures).
 */
async function writePiece(io: NodeIO, doc: Document, name: string): Promise<number> {
	const root = doc.getRoot();
	for (const texture of root.listTextures()) {
		const image = texture.getImage();
		if (!image) continue;
		const ext = EXTENSIONS[texture.getMimeType()] ?? 'bin';
		const hash = createHash('sha256').update(image).digest('hex').slice(0, 16);
		const uri = `${TEXTURE_DIR}/${hash}.${ext}`;
		const file = path.join(OUT_DIR, uri);
		if (!existsSync(file)) writeFileSync(file, image);
		texture.setURI(uri);
	}
	root.listBuffers().forEach((buffer, i) => buffer.setURI(i ? `${name}-${i}.bin` : `${name}.bin`));

	const { json, resources } = await io.writeJSON(doc);
	const gltf = JSON.stringify(json);
	writeFileSync(path.join(OUT_DIR, `${name}.gltf`), gltf);
	let bytes = gltf.length;
	for (const [uri, data] of Object.entries(resources)) {
		if (uri.startsWith(`${TEXTURE_DIR}/`)) continue;
		writeFileSync(path.join(OUT_DIR, uri), data);
		bytes += data.byteLength;
	}
	return bytes;
}

/**
 * Rigged models (creatures, the explorer) keep their skin and animations; textures are
 * re-encoded to WebP and the file is written as a single self-contained .glb.
 */
async function buildCharacters(
	io: NodeIO,
	label: string,
	source: string,
	target: string
): Promise<void> {
	if (!existsSync(source)) return;
	mkdirSync(target, { recursive: true });
	for (const f of readdirSync(target)) if (f.endsWith('.glb')) rmSync(path.join(target, f));
	for (const f of readdirSync(source)
		.filter((name) => name.endsWith('.glb'))
		.sort()) {
		const file = path.join(source, f);
		const doc = await io.read(file);
		for (const s of doc.getRoot().listScenes()) s.setExtras({});
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
			prune()
		);
		const out = path.join(target, f);
		await io.write(out, doc);
		const mb = (statSync(out).size / 1e6).toFixed(2);
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
	for (const child of scene.listChildren()) holder.addChild(child);
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
	mkdirSync(ITEM_OUT, { recursive: true });
	for (const f of readdirSync(ITEM_OUT)) if (f.endsWith('.glb')) rmSync(path.join(ITEM_OUT, f));
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
		await doc.transform(prune());
		const out = path.join(ITEM_OUT, f);
		await io.write(out, doc);
		const raw = statSync(file).size;
		if (raw > 1e6) {
			const kb = Math.round(statSync(out).size / 1e3);
			console.log(
				`  item ${id}: ${tris} -> ${triangleCount(doc)} tris, ${(raw / 1e6).toFixed(1)} MB -> ${kb} KB${frame ? '' : ' (no entry in items.config.ts: left as exported)'}`
			);
		}
		built.push(id);
	}
	console.log(`  items: ${built.join(', ')}`);
}

/**
 * Props: textures re-encoded to WebP, one self-contained .glb each. Nodes keep their names and
 * are not merged: the game moves some of them (the crate's lid).
 */
async function buildProps(io: NodeIO): Promise<void> {
	if (!existsSync(PROP_SOURCE)) return;
	mkdirSync(PROP_OUT, { recursive: true });
	for (const f of readdirSync(PROP_OUT)) if (f.endsWith('.glb')) rmSync(path.join(PROP_OUT, f));
	for (const f of readdirSync(PROP_SOURCE)
		.filter((name) => name.endsWith('.glb'))
		.sort()) {
		const file = path.join(PROP_SOURCE, f);
		const doc = await io.read(file);
		for (const scene of doc.getRoot().listScenes()) scene.setExtras({});
		await doc.transform(
			dedup(),
			weld(),
			textureCompress({
				encoder: sharp,
				targetFormat: 'webp',
				resize: [PROP_TEXTURE, PROP_TEXTURE],
				quality: 85
			}),
			prune()
		);
		const out = path.join(PROP_OUT, f);
		await io.write(out, doc);
		const raw = (statSync(file).size / 1e6).toFixed(1);
		console.log(
			`  prop ${path.basename(f, '.glb')}: ${raw} MB -> ${(statSync(out).size / 1e3).toFixed(0)} KB`
		);
	}
}

async function writeManifest(pieces: PieceDef[]): Promise<void> {
	const record = Object.fromEntries(pieces.map((p) => [p.name, p]));
	const source = `// Generated by \`pnpm asset:build\` from art/export/*.glb. Do not edit by hand.
import type { PieceDef } from './types.ts';

export const PIECES: Record<string, PieceDef> = ${JSON.stringify(record)};
`;
	const config = await prettier.resolveConfig(MANIFEST);
	writeFileSync(MANIFEST, await prettier.format(source, { ...config, filepath: MANIFEST }));
}

async function main(): Promise<void> {
	if (!existsSync(SOURCE_DIR)) {
		console.error(`No raw exports found. Export pieces from Blender into ${SOURCE_DIR}`);
		process.exit(1);
	}
	cleanOutput();
	const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
	const files = readdirSync(SOURCE_DIR)
		.filter((f) => f.endsWith('.glb'))
		.sort();

	const pieces: PieceDef[] = [];
	let failed = false;
	for (const f of files) {
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
	await buildCharacters(io, 'creature', CREATURE_SOURCE, CREATURE_OUT);
	await buildCharacters(io, 'player', PLAYER_SOURCE, PLAYER_OUT);
	await buildItems(io);
	await buildProps(io);
	const textures = readdirSync(path.join(OUT_DIR, TEXTURE_DIR));
	const textureBytes = textures.reduce(
		(sum, f) => sum + statSync(path.join(OUT_DIR, TEXTURE_DIR, f)).size,
		0
	);
	console.log(
		`Built ${pieces.length} pieces + ${textures.length} shared textures (${(textureBytes / 1e6).toFixed(1)} MB) -> ${path.relative(ROOT, OUT_DIR)}`
	);
}

await main();
