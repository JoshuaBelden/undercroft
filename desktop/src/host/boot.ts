import { LocalDb } from '../../../src/lib/server/localdb/LocalDb.ts';
import { registerLocalHost } from '../../../src/lib/server/local.ts';
import { startGameServer, type GameServer } from '../../../server/start.ts';

/**
 * The desktop app's host process (docs/dev/hosting.md#the-local-host): the player's save, the
 * game server and the site, on this PC only. The main process starts it (desktop/src/localHost.ts)
 * and passes everything through the environment; this is what both ways of running it share
 * (entry.ts, the packaged build; dev.ts, `pnpm desktop:dev`).
 */

export interface HostSettings {
	/** The save file (in the app's user data folder). */
	save: string;
	/** The window's `undercroft.local` cookie. */
	secret: string;
	/** What the tunnel presents for co-op guests. */
	hostKey: string;
	steamId: string | null;
	persona: string;
}

/** What the main process tells this one. */
export function settingsFromEnv(env: NodeJS.ProcessEnv): HostSettings {
	const need = (name: string): string => {
		const value = env[name];
		if (!value) throw new Error(`${name} is not set (the desktop app sets it)`);
		return value;
	};
	return {
		save: need('UNDERCROFT_SAVE'),
		secret: need('UNDERCROFT_SECRET'),
		hostKey: need('UNDERCROFT_HOST_KEY'),
		steamId: env.UNDERCROFT_STEAM_ID || null,
		persona: env.UNDERCROFT_PERSONA || 'Explorer'
	};
}

export interface Host {
	db: LocalDb;
	game: GameServer;
}

/** Open the save and start the game server. The site is started next, by the caller. */
export async function boot(settings: HostSettings): Promise<Host> {
	const db = new LocalDb({ file: settings.save });
	registerLocalHost({
		db: db.asDb(),
		secret: settings.secret,
		hostKey: settings.hostKey,
		player: { steamId: settings.steamId, persona: settings.persona }
	});
	const game = await startGameServer({ port: 0, host: '127.0.0.1', hostKey: settings.hostKey });
	return { db, game };
}

/** Tell the main process we are up (or why not), and stop cleanly when it asks. */
export function report(
	ready: { siteUrl: string; gamePort: number } | { error: string },
	stop: () => Promise<void>
): void {
	process.send?.({ type: 'ready', ...ready });
	const finish = (): void => {
		void stop().finally(() => process.exit(0));
	};
	process.on('message', (message: { type?: string }) => {
		if (message?.type === 'stop') finish();
	});
	// The main process went away without asking (it crashed): save and stop anyway.
	process.on('disconnect', finish);
}

export async function shutdown(host: Host, closeSite: () => Promise<void>): Promise<void> {
	await closeSite().catch(() => {});
	await host.game.stop().catch(() => {});
	host.db.close();
}
