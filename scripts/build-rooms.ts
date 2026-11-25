/**
 * The fixed map's rooms, from Blender's exports to what the game ships (docs/dev/fixed-map.md):
 *
 *   art/export/rooms/<room>.glb (+ <room>.lightmap.png)
 *     -> static/assets/shared/rooms/<room>.<hash>.gltf + .bin, textures/, <room>.lightmap.<hash>.webp
 *     -> src/lib/shared/map/rooms.generated.ts (ROOMS: every room's markers, colliders, volumes,
 *        sounds and file URLs; the server reads this and never a model)
 *
 * Each room is read with the room viewer's own `readRoom`: any warning (an unknown marker, a key
 * nothing holds...) fails the build. Its markers, colliders and volumes are taken out of the model.
 * Run on its own with `pnpm asset:rooms`; `pnpm asset:build` runs it too.
 */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, type Document, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as prettier from 'prettier';
import sharp from 'sharp';
import { contentHash, hashedName } from './hashed.ts';
import {
	baseName,
	markerKind,
	readRoom,
	roomPiece,
	soundOf,
	type RoomNode
} from '../src/lib/shared/map/room.ts';
import type { RoomDef, Vec3 } from '../src/lib/shared/map/types.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE = path.join(ROOT, 'art', 'export', 'rooms');
const DIR = 'shared/rooms';
const OUT = path.join(ROOT, 'static', 'assets', DIR);
const TEXTURES = 'textures';
const MANIFEST = path.join(ROOT, 'src', 'lib', 'shared', 'map', 'rooms.generated.ts');
const URL_ROOT = '/assets';
/** Map textures ship at this size (as the generator's pieces did). */
const TEXTURE_SIZE = 1024;
/** 16-bit positions keep a 50 m room to under a millimetre. */
const MESHOPT = { encoder: MeshoptEncoder, level: 'medium', quantizePosition: 16 } as const;
const EXTENSIONS: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp'
};

class RoomError extends Error {}

/** Every node under the room's root, in room space, as readRoom takes them. */
function roomNodes(root: Node): { node: Node; room: RoomNode }[] {
	const out: { node: Node; room: RoomNode }[] = [];
	const walk = (node: Node) => {
		for (const child of node.listChildren()) {
			const r = child.getWorldRotation();
			out.push({
				node: child,
				room: {
					name: child.getName(),
					position: [...child.getWorldTranslation()] as Vec3,
					rotation: [r[0], r[1], r[2], r[3]],
					scale: [...child.getWorldScale()] as Vec3,
					extras: (child.getExtras() ?? {}) as Record<string, unknown>,
					mesh: !!child.getMesh()
				}
			});
			walk(child);
		}
	};
	walk(root);
	return out;
}

function triangles(doc: Document): number {
	let count = 0;
	for (const mesh of doc.getRoot().listMeshes()) {
		for (const prim of mesh.listPrimitives()) {
			const indices = prim.getIndices();
			count +=
				(indices ? indices.getCount() : (prim.getAttribute('POSITION')?.getCount() ?? 0)) / 3;
		}
	}
	return Math.round(count);
}

/** Write the room as .gltf + .bin under content-hashed names, its textures beside it. */
async function writeRoom(
	io: NodeIO,
	doc: Document,
	name: string
): Promise<{ url: string; bytes: number }> {
	const root = doc.getRoot();
	let bytes = 0;
	mkdirSync(path.join(OUT, TEXTURES), { recursive: true });
	for (const texture of root.listTextures()) {
		const image = texture.getImage();
		if (!image) continue;
		const file = `${contentHash(image, 16)}.${EXTENSIONS[texture.getMimeType()] ?? 'bin'}`;
		const target = path.join(OUT, TEXTURES, file);
		if (!existsSync(target)) writeFileSync(target, image);
		texture.setURI(`${TEXTURES}/${file}`);
		bytes += image.byteLength;
	}
	root.listBuffers().forEach((buffer, i) => buffer.setURI(i ? `${name}-${i}.bin` : `${name}.bin`));
	const { json, resources } = await io.writeJSON(doc);
	for (const buffer of json.buffers ?? []) {
		if (!buffer.uri) continue;
		const data = resources[buffer.uri];
		const file = hashedName(buffer.uri, data);
		writeFileSync(path.join(OUT, file), data);
		buffer.uri = file;
		bytes += data.byteLength;
	}
	const gltf = JSON.stringify(json);
	const file = hashedName(`${name}.gltf`, gltf);
	writeFileSync(path.join(OUT, file), gltf);
	return { url: `${URL_ROOT}/${DIR}/${file}`, bytes: bytes + gltf.length };
}

/** The lightmap as WebP: near-lossless, so its gradients don't band. */
async function writeLightmap(name: string): Promise<RoomDef['lightmap']> {
	const source = path.join(SOURCE, `${name}.lightmap.png`);
	if (!existsSync(source)) return null;
	const data = await sharp(readFileSync(source))
		.webp({ nearLossless: true, quality: 90 })
		.toBuffer();
	const file = hashedName(`${name}.lightmap.webp`, data);
	writeFileSync(path.join(OUT, file), data);
	return { url: `${URL_ROOT}/${DIR}/${file}`, bytes: data.byteLength };
}

async function buildRoom(io: NodeIO, file: string): Promise<RoomDef> {
	const name = path.basename(file, '.glb');
	const doc = await io.read(file);
	const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
	const root = scene?.listChildren().find((n) => baseName(n.getName()) === name);
	if (!root) throw new RoomError(`${name}: no root empty named "${name}"`);
	const nodes = roomNodes(root);
	const manifest = readRoom(
		name,
		nodes.map((n) => n.room)
	);
	if (manifest.warnings.length) {
		throw new RoomError(`${name}:\n    ${manifest.warnings.join('\n    ')}`);
	}
	// What only the game reads: colliders, volumes, markers. The model keeps what is seen.
	for (const { node, room } of nodes) {
		const label = baseName(room.name);
		if (label.startsWith('col-') || label.startsWith('vol-') || markerKind(label)) {
			node.getMesh()?.dispose();
			node.dispose();
		}
	}
	for (const s of doc.getRoot().listScenes()) s.setExtras({});
	const tris = triangles(doc);
	await doc.transform(
		dedup(),
		weld(),
		textureCompress({
			encoder: sharp,
			targetFormat: 'webp',
			resize: [TEXTURE_SIZE, TEXTURE_SIZE],
			quality: 85
		}),
		prune(),
		meshopt(MESHOPT)
	);
	const { url, bytes } = await writeRoom(io, doc, name);
	const lightmap = await writeLightmap(name);
	const raw = (statSync(file).size / 1e6).toFixed(1);
	console.log(
		`  ${name}: ${tris} tris, ${manifest.markers.length} markers, ${manifest.colliders.length} colliders, ${raw} MB -> ${(bytes / 1e6).toFixed(1)} MB${lightmap ? ` + lightmap ${(lightmap.bytes / 1e3).toFixed(0)} KB` : ''}`
	);
	return {
		...roomPiece(manifest),
		url,
		bytes: bytes + (lightmap?.bytes ?? 0),
		triangles: tris,
		lightmap,
		sounds: manifest.markers
			.filter((m) => m.kind === 'sound')
			.map((m) => ({ id: soundOf(m), position: m.position }))
	};
}

/** Numbers to a tenth of a millimetre: enough, and no float noise (1.0000000000000002). */
function rounded(_key: string, value: unknown): unknown {
	return typeof value === 'number' ? Math.round(value * 1e4) / 1e4 : value;
}

async function writeManifest(rooms: RoomDef[]): Promise<void> {
	const record = Object.fromEntries(rooms.map((r) => [r.name, r]));
	const source = `// Generated by \`pnpm asset:rooms\` from art/export/rooms/*.glb. Do not edit by hand.
import type { RoomDef } from './types.ts';

export const ROOMS: Record<string, RoomDef> = ${JSON.stringify(record, rounded)};
`;
	const config = await prettier.resolveConfig(MANIFEST);
	writeFileSync(MANIFEST, await prettier.format(source, { ...config, filepath: MANIFEST }));
}

/** Build every room in art/export/rooms; the output folder is cleared first. */
export async function buildRooms(): Promise<void> {
	if (!existsSync(SOURCE)) {
		console.warn(`  No rooms in ${path.relative(ROOT, SOURCE)}: none built`);
		return;
	}
	await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
	rmSync(OUT, { recursive: true, force: true });
	mkdirSync(OUT, { recursive: true });
	const io = new NodeIO()
		.registerExtensions(ALL_EXTENSIONS)
		.registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
	const rooms: RoomDef[] = [];
	let failed = false;
	for (const file of readdirSync(SOURCE)
		.filter((f) => f.endsWith('.glb'))
		.sort()) {
		try {
			rooms.push(await buildRoom(io, path.join(SOURCE, file)));
		} catch (error) {
			if (!(error instanceof RoomError)) throw error;
			console.error(`  ✗ ${error.message}`);
			failed = true;
		}
	}
	if (failed) process.exit(1);
	await writeManifest(rooms);
	console.log(`Built ${rooms.length} room(s) -> ${path.relative(ROOT, OUT)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	await buildRooms();
}
