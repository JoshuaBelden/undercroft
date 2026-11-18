import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import { GUEST_HEADERS } from '../src/lib/server/local.ts';
import { GAME_VERSION } from '../src/lib/shared/version.ts';
import { Alerts } from './alerts.ts';
import { releaseAll } from './belongings.ts';
import { closeDb, connectDb } from './db.ts';
import { serve } from './connection.ts';
import { log } from './log.ts';
import { Parties } from './parties.ts';
import { Social } from './social.ts';
import { watchStatus } from './stats.ts';
import { watchSuspensions } from './suspensions.ts';

/**
 * Starting and stopping the game server: by server/index.ts as its own process (the hosted game),
 * and by the desktop app's host process on the player's own PC (docs/dev/hosting.md).
 */

export interface GameServerOptions {
	port: number;
	/** Listen only here (the desktop app: 127.0.0.1). Unset: every interface. */
	host?: string;
	/** Only accept WebSockets on this path. Unset: any path. */
	path?: string;
	/**
	 * The desktop app: what its tunnel sends to bring in a co-op guest (docs/dev/hosting.md).
	 * Unset: no guests (the hosted game server).
	 */
	hostKey?: string;
}

export interface GameServer {
	/** The port it listens on (the one chosen, when asked for port 0). */
	port: number;
	stop(): Promise<void>;
}

/**
 * A co-op guest's connection, from the desktop app's tunnel: the right key, and the SteamID Steam
 * says the guest is. A connection that claims to be one without the key is refused. Null for
 * everyone else (they say who they are with a ticket).
 */
export function guestOf(
	request: IncomingMessage,
	hostKey: string | undefined
): { steamId: string } | 'refused' | null {
	const key = request.headers[GUEST_HEADERS.hostKey];
	const steamId = request.headers[GUEST_HEADERS.steamId];
	if (key === undefined && steamId === undefined) return null;
	if (!hostKey || typeof key !== 'string' || key.length !== hostKey.length) return 'refused';
	if (!timingSafeEqual(Buffer.from(key), Buffer.from(hostKey))) return 'refused';
	if (typeof steamId !== 'string' || !/^7656\d{13}$/.test(steamId)) return 'refused';
	return { steamId };
}

export async function startGameServer(options: GameServerOptions): Promise<GameServer> {
	await connectDb();
	await releaseAll();

	const parties = new Parties();
	// The one place the server sends alerts from (docs/dev/alerts.md); give it to whatever needs it.
	const alerts = new Alerts(parties);
	const social = new Social(parties, alerts);
	const stopSuspensions = watchSuspensions(parties, social);
	const stopStatus = watchStatus(parties);
	/*
	 * permessage-deflate, keeping its dictionary between messages: consecutive ticks are nearly the
	 * same, so a four-player tick of about 8 KB goes out as a few hundred bytes. It costs some CPU
	 * and about 300 KB of memory per connection. Small messages (pongs) aren't worth compressing.
	 */
	const wss = new WebSocketServer({
		port: options.port,
		host: options.host,
		path: options.path,
		perMessageDeflate: { zlibDeflateOptions: { level: 3 }, threshold: 256 }
	});
	await new Promise<void>((resolve, reject) => {
		wss.once('listening', resolve);
		wss.once('error', reject);
	});

	wss.on('connection', (socket, request) => {
		const guest = guestOf(request, options.hostKey);
		if (guest === 'refused') {
			socket.close(1008, 'Not allowed');
			return;
		}
		serve(socket, parties, social, guest);
	});

	const port = (wss.address() as AddressInfo).port;
	log.info(
		`Undercroft ${GAME_VERSION} game server listening on ws://${options.host ?? 'localhost'}:${port}${options.path ?? ''}`
	);

	return {
		port,
		async stop() {
			log.info('Shutting down');
			social.stop();
			stopSuspensions();
			stopStatus();
			parties.stop();
			await new Promise<void>((resolve) => wss.close(() => resolve()));
			await closeDb();
		}
	};
}
