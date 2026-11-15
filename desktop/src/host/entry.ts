import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { boot, report, settingsFromEnv, shutdown } from './boot.ts';

/**
 * The packaged desktop app's host process: the game server, and the site as SvelteKit's
 * adapter-node built it (`pnpm build`, bundled by desktop/build.mjs into `UNDERCROFT_SITE`),
 * served on this PC only.
 */

type Handler = (request: IncomingMessage, response: ServerResponse, next?: () => void) => void;

try {
	const settings = settingsFromEnv(process.env);
	const site = process.env.UNDERCROFT_SITE;
	if (!site) throw new Error('UNDERCROFT_SITE is not set (the desktop app sets it)');
	const host = await boot(settings);
	const server = createServer();
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	/*
	 * adapter-node works out each request's origin from its headers, taking it to be https unless
	 * a protocol header says otherwise. This site is plain http, on this PC only, so without this
	 * its own posts would look cross-site and be refused. Read when the site loads: set first.
	 */
	process.env.PROTOCOL_HEADER = 'x-forwarded-proto';
	const { handler } = (await import(pathToFileURL(site).href)) as { handler: Handler };
	server.on('request', (request, response) => {
		// Set here, never taken from the request: only this server says what it is.
		request.headers['x-forwarded-proto'] = 'http';
		handler(request, response, () => {
			response.statusCode = 404;
			response.end('Not found');
		});
	});
	console.log(`Desktop host: site ${origin}, game server ${host.game.port}`);
	report({ siteUrl: origin, gamePort: host.game.port }, () =>
		shutdown(host, () => new Promise((resolve) => server.close(() => resolve())))
	);
} catch (error) {
	console.error(error);
	report({ error: error instanceof Error ? error.message : String(error) }, async () => {});
	process.exit(1);
}
