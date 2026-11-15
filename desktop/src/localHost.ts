import { fork, type ChildProcess } from 'node:child_process';
import path from 'node:path';

/**
 * Starting the host process (desktop/src/host/, docs/dev/hosting.md#the-local-host): the save,
 * the game server and the site on this PC. It runs as its own Node process (Electron's, with
 * `ELECTRON_RUN_AS_NODE`), so a slow tick never stalls the window and a crash in it can be
 * survived: the main process starts it again.
 */

export interface HostOptions {
	/** `pnpm desktop:dev`: the TypeScript dev host, with Vite, run by tsx from the repository. */
	dev: boolean;
	/** The app's user data folder: the save goes in `save/` there. */
	userData: string;
	steamId: string | null;
	persona: string | null;
	/** The window's cookie (kept by the main process, the same if the host starts again). */
	secret: string;
	/** What the tunnel presents to the game server for co-op guests. */
	hostKey: string;
}

export interface LocalHostProcess {
	/** The site, for the window: `http://127.0.0.1:<port>`. */
	siteUrl: string;
	/** Our own game server, for the page (and the tunnel, for guests). */
	gameUrl: string;
	/** The window's cookie: what tells the site the request is from this app. */
	secret: string;
	/** What the tunnel presents to the game server for co-op guests. */
	hostKey: string;
	/** Save and stop (the app is closing). */
	stop(): Promise<void>;
	/** It stopped when nobody asked it to. */
	onCrash(listener: () => void): void;
}

/** Where the built files are (the packaged host runs outside the asar archive). */
const unpacked = (dir: string): string =>
	dir.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

export async function startLocalHost(options: HostOptions): Promise<LocalHostProcess> {
	const { secret, hostKey } = options;
	const repo = path.resolve(__dirname, '../..');
	const script = options.dev
		? path.join(repo, 'desktop/src/host/dev.ts')
		: path.join(unpacked(__dirname), 'host.mjs');

	const child: ChildProcess = fork(script, [], {
		cwd: options.dev ? repo : unpacked(__dirname),
		execArgv: options.dev ? ['--import', 'tsx'] : [],
		stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: '1',
			UNDERCROFT_SAVE: path.join(options.userData, 'save', 'undercroft.json'),
			UNDERCROFT_SECRET: secret,
			UNDERCROFT_HOST_KEY: hostKey,
			UNDERCROFT_STEAM_ID: options.steamId ?? '',
			UNDERCROFT_PERSONA: options.persona ?? '',
			UNDERCROFT_SITE: path.join(unpacked(__dirname), 'site', 'handler.js'),
			NODE_ENV: options.dev ? 'development' : 'production'
		}
	});
	const prefix = (line: string): string => `[host] ${line}`;
	child.stdout?.on('data', (data: Buffer) =>
		process.stdout.write(data.toString().split('\n').filter(Boolean).map(prefix).join('\n') + '\n')
	);
	child.stderr?.on('data', (data: Buffer) =>
		process.stderr.write(data.toString().split('\n').filter(Boolean).map(prefix).join('\n') + '\n')
	);

	const ready = await new Promise<{ siteUrl: string; gamePort: number }>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('The game took too long to start')), 90_000);
		child.on(
			'message',
			(message: { type?: string; siteUrl?: string; gamePort?: number; error?: string }) => {
				if (message?.type !== 'ready') return;
				clearTimeout(timer);
				if (message.error || !message.siteUrl || !message.gamePort) {
					reject(new Error(message.error ?? 'The game could not start'));
				} else {
					resolve({ siteUrl: message.siteUrl, gamePort: message.gamePort });
				}
			}
		);
		child.once('exit', (code) => {
			clearTimeout(timer);
			reject(new Error(`The game stopped while starting (${code})`));
		});
	});

	let stopping = false;
	const crashListeners: (() => void)[] = [];
	child.on('exit', (code) => {
		if (stopping) return;
		console.log(`[host] stopped unexpectedly (${code})`);
		for (const listener of crashListeners) listener();
	});

	return {
		siteUrl: ready.siteUrl,
		gameUrl: `ws://127.0.0.1:${ready.gamePort}`,
		secret,
		hostKey,
		onCrash: (listener) => crashListeners.push(listener),
		stop: () =>
			new Promise<void>((resolve) => {
				stopping = true;
				if (child.exitCode !== null) return resolve();
				const kill = setTimeout(() => child.kill(), 5000);
				child.once('exit', () => {
					clearTimeout(kill);
					resolve();
				});
				child.send({ type: 'stop' });
			})
	};
}
