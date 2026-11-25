import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * The room viewer's files, in `pnpm dev` only (docs/dev/room-viewer.md). Rooms are read straight
 * from Blender's exports, unbuilt, so a re-export shows in seconds:
 *
 * - `GET /__rooms`: every room there is, as JSON (`RoomFile[]`, newest first).
 * - `GET /__rooms/<group>/<file>`: one export, or its lightmap.
 * - A `room:changed` event over Vite's socket (`{ group, name }`) when one is written again.
 *
 * `rooms` are the fixed map's rooms (`art/export/rooms/<room>.glb`, a lightmap beside one as
 * `<room>.lightmap.png`, `.webp` or `.jpg`); `kit` is the old generator's pieces
 * (`art/export/<piece>.glb`), kept for reference.
 */

const EXPORT = path.resolve(import.meta.dirname, '..', 'art', 'export');
const DIRS = { rooms: path.join(EXPORT, 'rooms'), kit: EXPORT } as const;
type Group = keyof typeof DIRS;
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
	group: Group;
	url: string;
	bytes: number;
	/** When it was last written (ms): a fresh URL each time, past the browser's cache. */
	changed: number;
	lightmap: string | null;
}

function lightmapOf(group: Group, name: string): string | null {
	for (const ext of LIGHTMAPS) {
		const file = `${name}.lightmap.${ext}`;
		const full = path.join(DIRS[group], file);
		if (existsSync(full)) return `/__rooms/${group}/${file}?v=${statSync(full).mtimeMs}`;
	}
	return null;
}

function list(): RoomFile[] {
	const rooms: RoomFile[] = [];
	for (const group of Object.keys(DIRS) as Group[]) {
		if (!existsSync(DIRS[group])) continue;
		for (const file of readdirSync(DIRS[group])) {
			if (!file.endsWith('.glb')) continue;
			const stat = statSync(path.join(DIRS[group], file));
			const name = file.slice(0, -'.glb'.length);
			rooms.push({
				name,
				group,
				url: `/__rooms/${group}/${file}?v=${stat.mtimeMs}`,
				bytes: stat.size,
				changed: stat.mtimeMs,
				lightmap: group === 'rooms' ? lightmapOf(group, name) : null
			});
		}
	}
	return rooms.sort((a, b) => b.changed - a.changed);
}

/** Which room a changed file belongs to, if it is one of ours. */
function roomOf(file: string): { group: Group; name: string } | null {
	const dir = path.dirname(path.resolve(file));
	const base = path.basename(file);
	const group = (Object.keys(DIRS) as Group[]).find((g) => DIRS[g] === dir);
	if (!group) return null;
	const match = /^(.+?)(\.lightmap\.\w+|\.glb)$/.exec(base);
	return match ? { group, name: match[1] } : null;
}

export function roomViewer(): Plugin {
	return {
		name: 'undercroft-room-viewer',
		apply: 'serve',
		configureServer(server) {
			for (const dir of Object.values(DIRS)) if (existsSync(dir)) server.watcher.add(dir);
			const changed = (file: string) => {
				const room = roomOf(file);
				if (room) server.ws.send({ type: 'custom', event: 'room:changed', data: room });
			};
			server.watcher.on('add', changed);
			server.watcher.on('change', changed);

			server.middlewares.use('/__rooms', (req, res) => {
				const [group, file] = (req.url ?? '/').split('?')[0].split('/').filter(Boolean);
				if (!group) {
					res.setHeader('Content-Type', 'application/json');
					res.setHeader('Cache-Control', 'no-store');
					res.end(JSON.stringify(list()));
					return;
				}
				const full =
					Object.hasOwn(DIRS, group) && SAFE.test(file ?? '')
						? path.join(DIRS[group as Group], file)
						: null;
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
