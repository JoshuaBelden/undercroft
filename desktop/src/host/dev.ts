import { createServer as createNetServer, type AddressInfo } from 'node:net';
import path from 'node:path';
import { createServer } from 'vite';
import { boot, report, settingsFromEnv, shutdown } from './boot.ts';

/**
 * `pnpm desktop:dev`'s host process: the game server, and the site through Vite's dev server in
 * this same process, so hot reload works and both see one save (src/lib/server/local.ts lives on
 * `globalThis`). Run with tsx by desktop/src/localHost.ts.
 */

const root = path.resolve(import.meta.dirname, '../../..');

/** A port nobody is using right now. */
function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = createNetServer();
		probe.once('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const port = (probe.address() as AddressInfo).port;
			probe.close(() => resolve(port));
		});
	});
}

try {
	const host = await boot(settingsFromEnv(process.env));
	const port = await freePort();
	const vite = await createServer({
		root,
		configFile: path.join(root, 'vite.config.ts'),
		server: { host: '127.0.0.1', port, strictPort: true },
		logLevel: 'warn'
	});
	await vite.listen();
	console.log(`Desktop dev host: site http://127.0.0.1:${port}, game server ${host.game.port}`);
	report({ siteUrl: `http://127.0.0.1:${port}`, gamePort: host.game.port }, () =>
		shutdown(host, () => vite.close())
	);
} catch (error) {
	console.error(error);
	report({ error: error instanceof Error ? error.message : String(error) }, async () => {});
	process.exit(1);
}
