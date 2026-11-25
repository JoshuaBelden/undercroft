import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * The room viewer's files, in `pnpm dev` only (docs/dev/room-viewer.md). Rooms are read straight
 * from Blender's exports (`art/export/rooms/<room>.glb`, a lightmap beside one as
 * `<room>.lightmap.png`, `.webp` or `.jpg`), unbuilt, so a re-export shows in seconds:
 *
 * - `GET /__rooms`: every room there is, as JSON (`RoomFile[]`, newest first).
 * - `GET /__rooms/<file>`: one export, or its lightmap.
 * - A `room:changed` event over Vite's socket (`{ name }`) when one is written again.
 */

const DIR = path.resolve(import.meta.dirname, '..', 'art', 'export', 'rooms');
const LIGHTMAPS = ['png', 'webp', 'jpg'];
const TYPES: Record<string, string> = {
	'.glb': 'model/gltf-binary',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.jpg': 'image/jpeg'
};
/** A file name we serve: no folders, nothing hidden. */
const SAFE = /^[\w-][\w.-]*$/;

/** Mirrored in `src/lib/game/rooms/files.ts`. */
interface RoomFile {
	name: string;
	url: string;
	bytes: number;
	/** When it was last written (ms): a fresh URL each time, past the browser's cache. */
	changed: number;
	lightmap: string | null;
}

/** A file's URL, changing whenever the file does. */
function urlOf(file: string): string {
	return `/__rooms/${file}?v=${statSync(path.join(DIR, file)).mtimeMs}`;
}

function lightmapOf(name: string): string | null {
	const file = LIGHTMAPS.map((ext) => `${name}.lightmap.${ext}`).find((f) =>
		existsSync(path.join(DIR, f))
	);
	return file ? urlOf(file) : null;
}

function list(): RoomFile[] {
	if (!existsSync(DIR)) return [];
	return readdirSync(DIR)
		.filter((file) => file.endsWith('.glb'))
		.map((file) => {
			const stat = statSync(path.join(DIR, file));
			const name = file.slice(0, -'.glb'.length);
			return {
				name,
				url: urlOf(file),
				bytes: stat.size,
				changed: stat.mtimeMs,
				lightmap: lightmapOf(name)
			};
		})
		.sort((a, b) => b.changed - a.changed);
}

/** Which room a changed file belongs to, if it is one of ours. */
function roomOf(file: string): string | null {
	if (path.dirname(path.resolve(file)) !== DIR) return null;
	return /^(.+?)(\.lightmap\.\w+|\.glb)$/.exec(path.basename(file))?.[1] ?? null;
}

export function roomViewer(): Plugin {
	return {
		name: 'undercroft-room-viewer',
		apply: 'serve',
		configureServer(server) {
			// Watched even before the folder exists, so the first export is seen too.
			server.watcher.add(DIR);
			const changed = (file: string) => {
				const name = roomOf(file);
				if (name) server.ws.send({ type: 'custom', event: 'room:changed', data: { name } });
			};
			server.watcher.on('add', changed);
			server.watcher.on('change', changed);

			server.middlewares.use('/__rooms', (req, res) => {
				const file = decodeURIComponent((req.url ?? '/').split('?')[0].slice(1));
				if (!file) {
					res.setHeader('Content-Type', 'application/json');
					res.setHeader('Cache-Control', 'no-store');
					res.end(JSON.stringify(list()));
					return;
				}
				const full = SAFE.test(file) ? path.join(DIR, file) : null;
				if (!full || !existsSync(full)) {
					res.statusCode = 404;
					res.end();
					return;
				}
				res.setHeader('Content-Type', TYPES[path.extname(full)] ?? 'application/octet-stream');
				// The URL changes with the file (`?v=`), so each version is cached once.
				res.setHeader('Cache-Control', 'max-age=31536000, immutable');
				createReadStream(full).pipe(res);
			});
		}
	};
}
