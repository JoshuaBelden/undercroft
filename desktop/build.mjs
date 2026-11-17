// Builds the desktop app into dist/ (see docs/dev/desktop.md and docs/dev/hosting.md).
//
//   node build.mjs             main process and preload script (enough for `pnpm desktop:dev`)
//   node build.mjs --package   also the host process and the site, for a packaged build: needs the
//                              site built first (`pnpm build` in the repository root)
//
// Each is one file: a sandboxed preload can't load others, and the main process then needs no
// TypeScript at run time. Type checking is `pnpm -C desktop check` (tsc), not this.
//
// Build-time settings, from the environment:
//   UNDERCROFT_URL  the hosted site, for when the app is told to show it (default: the live site)
//   STEAM_APP_ID    the Steam app (default: 480, Valve's Spacewar test app)
import { build } from 'esbuild';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const root = path.resolve(here, '..');
const pkg = JSON.parse(readFileSync(path.join(here, 'package.json'), 'utf8'));
const gameUrl = process.env.UNDERCROFT_URL || 'https://undercroft.us';
const steamAppId = Number(process.env.STEAM_APP_ID) || 480;
const packaging = process.argv.includes('--package');

const define = {
	BUILD_GAME_URL: JSON.stringify(gameUrl),
	BUILD_STEAM_APP_ID: String(steamAppId),
	BUILD_VERSION: JSON.stringify(pkg.version)
};

const main = {
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node22',
	// Electron provides `electron`; steamworks.js loads a native module, so it stays a package.
	// ws's optional speed-ups aren't there, and it works without them.
	external: ['electron', 'steamworks.js', 'bufferutil', 'utf-8-validate'],
	define,
	logLevel: 'warning'
};

await build({ ...main, entryPoints: ['src/main.ts'], outfile: 'dist/main.js' });
await build({ ...main, entryPoints: ['src/preload.ts'], outfile: 'dist/preload.js' });

if (packaging) {
	const site = path.join(root, 'build');
	if (!existsSync(path.join(site, 'handler.js'))) {
		throw new Error('No site build: run `pnpm build` in the repository root first.');
	}
	const node = {
		bundle: true,
		platform: 'node',
		format: 'esm',
		target: 'node22',
		// The MongoDB driver's optional extras are never used (the desktop app has no MongoDB);
		// sharp has native parts, so it stays a package (unpacked from the archive).
		external: [
			'sharp',
			'bufferutil',
			'utf-8-validate',
			'kerberos',
			'snappy',
			'socks',
			'aws4',
			'gcp-metadata',
			'mongodb-client-encryption',
			'@mongodb-js/zstd',
			'@aws-sdk/credential-providers'
		],
		// Bundled CommonJS packages need `require`, which an ES module doesn't have.
		banner: {
			js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
		},
		define: { 'process.env.NODE_ENV': '"production"' },
		logLevel: 'warning'
	};
	// The host process: the save, the game server, and the site's server.
	await build({ ...node, entryPoints: ['src/host/entry.ts'], outfile: 'dist/host.mjs' });
	// The site, as adapter-node built it, in one file; its static files beside it, where it looks.
	await build({
		...node,
		entryPoints: [path.join(site, 'handler.js')],
		outfile: 'dist/site/handler.js'
	});
	// An ES module, as adapter-node writes it: Node has to be told, beside it.
	writeFileSync('dist/site/package.json', JSON.stringify({ type: 'module' }));
	rmSync('dist/site/client', { recursive: true, force: true });
	cpSync(path.join(site, 'client'), 'dist/site/client', { recursive: true });
	if (existsSync(path.join(site, 'prerendered'))) {
		cpSync(path.join(site, 'prerendered'), 'dist/site/prerendered', { recursive: true });
	}
}

console.log(
	`Built desktop ${pkg.version}${packaging ? ' (packaged: host and site)' : ''}: Steam app ${steamAppId}`
);
