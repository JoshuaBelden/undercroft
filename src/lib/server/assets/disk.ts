import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { AssetDisk } from './catalog.ts';

/**
 * Reads what the Art & Assets list needs from the repository (catalog.ts): every file under
 * static/assets, the clips and files each glTF names, and the game's source. The admin app runs in
 * the repository in development, and in production in the Docker image (docs/dev/deployment.md),
 * which has src/ and server/ but no static/: there the assets are the site build's copy of it,
 * build/client/assets.
 */

/** The repository: the nearest folder up from `from` with src/lib/content and the assets. */
export function repositoryRoot(from = process.cwd()): string {
	let dir = path.resolve(from);
	for (;;) {
		if (existsSync(path.join(dir, 'src/lib/content')) && assetsDir(dir)) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) throw new Error(`No repository with built assets above ${from}`);
		dir = parent;
	}
}

/** The built assets: static/assets, or (in the Docker image) the site build's copy of it. */
export function assetsDir(root: string): string | null {
	for (const dir of ['static/assets', 'build/client/assets']) {
		if (existsSync(path.join(root, dir))) return path.join(root, dir);
	}
	return null;
}

/** Every file under `dir`, as forward-slash paths from it. */
async function walk(
	dir: string,
	skip: (relative: string) => boolean = () => false
): Promise<string[]> {
	const out: string[] = [];
	const visit = async (relative: string): Promise<void> => {
		const entries = await readdir(path.join(dir, relative), { withFileTypes: true });
		for (const entry of entries) {
			const child = relative ? `${relative}/${entry.name}` : entry.name;
			if (skip(child)) continue;
			if (entry.isDirectory()) await visit(child);
			else if (entry.isFile()) out.push(child);
		}
	};
	await visit('');
	return out;
}

/** A glTF document's JSON: from a .gltf, or the first chunk of a .glb. */
export function gltfJson(bytes: Buffer, binary: boolean): unknown {
	if (!binary) return JSON.parse(bytes.toString('utf8'));
	// GLB: 12-byte header ("glTF", version, length), then chunks of [length, type, data].
	if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF') return null;
	const length = bytes.readUInt32LE(12);
	if (bytes.toString('ascii', 16, 20) !== 'JSON') return null;
	return JSON.parse(bytes.toString('utf8', 20, 20 + length));
}

/** Its clip names, and the files it loads (resolved against where it sits; data URIs left out). */
export function gltfUses(json: unknown, file: string): { animations: string[]; uris: string[] } {
	const doc = (json ?? {}) as {
		animations?: { name?: string }[];
		buffers?: { uri?: string }[];
		images?: { uri?: string }[];
	};
	const dir = path.posix.dirname(file);
	const uris = [...(doc.buffers ?? []), ...(doc.images ?? [])]
		.map((entry) => entry.uri)
		.filter((uri): uri is string => !!uri && !uri.startsWith('data:'))
		.map((uri) => path.posix.normalize(path.posix.join(dir, decodeURIComponent(uri))));
	const animations = (doc.animations ?? []).map((a, i) => a.name ?? `animation ${i}`);
	return { animations, uris };
}

const SOURCE = /\.(ts|svelte)$/;
const NOT_SOURCE = /(\.generated\.ts|\.test\.ts)$/;

export async function readAssetDisk(root = repositoryRoot()): Promise<AssetDisk> {
	const assets = assetsDir(root);
	if (!assets) throw new Error(`No built assets in ${root}`);
	const files = new Map<string, number>();
	const gltf: AssetDisk['gltf'] = new Map();
	for (const file of await walk(assets)) {
		// The site build's compressed copies (build/client), not files of their own.
		if (/\.(br|gz)$/.test(file)) continue;
		const full = path.join(assets, file);
		files.set(file, (await stat(full)).size);
		const binary = file.endsWith('.glb');
		if (!binary && !file.endsWith('.gltf')) continue;
		try {
			gltf.set(file, gltfUses(gltfJson(await readFile(full), binary), file));
		} catch {
			// Not a readable glTF: listed as a file, with no clips or dependencies.
		}
	}
	const sources: AssetDisk['sources'] = [];
	for (const top of ['src', 'server']) {
		const dir = path.join(root, top);
		if (!existsSync(dir)) continue;
		const list = await walk(dir, (relative) => relative.split('/').includes('node_modules'));
		for (const file of list) {
			if (!SOURCE.test(file) || NOT_SOURCE.test(file)) continue;
			// This list's own code names the patterns it looks for.
			if (`${top}/${file}`.startsWith('src/lib/server/assets/')) continue;
			sources.push({ file: `${top}/${file}`, text: await readFile(path.join(dir, file), 'utf8') });
		}
	}
	return { files, gltf, sources };
}
