/**
 * Exports every map piece from the map kit to art/export/<piece>.glb, headless in Blender. Run
 * with `pnpm asset:export`, then `pnpm asset:build`. See docs/dev/asset-pipeline.md.
 *
 * The map-piece exports are not in git: they are rebuilt from art/blender/catacomb-kit.blend and
 * the textures it links to (both in Git LFS), and come out byte-for-byte the same each time. The
 * other exports (items, props, creatures, the explorer) have no source but themselves, so they
 * are in Git LFS.
 *
 * Blender is found from the BLENDER environment variable, the usual install folders, or `blender`
 * on the PATH.
 */
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const KIT = path.join(ROOT, 'art', 'blender', 'catacomb-kit.blend');
const TEXTURES = path.join(ROOT, 'art', 'textures');
const RUNNER = path.join(ROOT, 'scripts', 'blender', 'export_map.py');

/** A file Git LFS hasn't downloaded yet is a small text pointer in its place. */
function isLfsPointer(file: string): boolean {
	if (statSync(file).size > 1024) return false;
	const head = Buffer.alloc(40);
	const fd = openSync(file, 'r');
	try {
		readSync(fd, head, 0, head.length, 0);
	} finally {
		closeSync(fd);
	}
	return head.toString('utf8').startsWith('version https://git-lfs');
}

function filesIn(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		return entry.isDirectory() ? filesIn(full) : [full];
	});
}

/** Blender's executable: $BLENDER, the newest one in the usual install folder, or the PATH. */
function findBlender(): string {
	if (process.env.BLENDER) return process.env.BLENDER;
	if (process.platform === 'win32') {
		const base = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Blender Foundation');
		const installs = existsSync(base)
			? readdirSync(base)
					.map((dir) => path.join(base, dir, 'blender.exe'))
					.filter((exe) => existsSync(exe))
					.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
			: [];
		if (installs.length) return installs[installs.length - 1];
	}
	if (process.platform === 'darwin') {
		const app = '/Applications/Blender.app/Contents/MacOS/Blender';
		if (existsSync(app)) return app;
	}
	return 'blender';
}

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

if (!existsSync(KIT)) fail(`No map kit at ${path.relative(ROOT, KIT)}. Run \`git lfs pull\`.`);
const pointers = [KIT, ...filesIn(TEXTURES)].filter(isLfsPointer);
if (pointers.length) {
	// Exporting without the real textures would quietly write pieces with none.
	fail(
		`${pointers.length} art file(s) are still Git LFS pointers, for example ` +
			`${path.relative(ROOT, pointers[0])}. Run \`git lfs pull\` first.`
	);
}

const blender = findBlender();
const result = spawnSync(
	blender,
	['--background', KIT, '--python-exit-code', '1', '--python', RUNNER],
	{ stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }
);
if (result.error) {
	fail(
		`Couldn't run Blender (${blender}): ${result.error.message}. ` +
			'Install it, or set BLENDER to its executable.'
	);
}
// Blender's own chatter (startup, the glTF exporter) is left out; the runner's lines are kept.
for (const line of result.stdout.split(/\r?\n/)) {
	if (/^( {2}art|Exported |Not in the \.blend)/.test(line)) console.log(line);
}
if (result.status !== 0) fail(`Blender failed (exit code ${result.status}).`);
