import { WebSocketServer } from 'ws';
import { GAME_VERSION } from '../src/lib/shared/version.ts';
import { releaseAll } from './belongings.ts';
import { config } from './config.ts';
import { closeDb, connectDb } from './db.ts';
import { serve } from './connection.ts';
import { serverCrash } from './errors.ts';
import { log } from './log.ts';
import { Parties } from './parties.ts';
import { Social } from './social.ts';
import { watchStatus } from './stats.ts';
import { watchSuspensions } from './suspensions.ts';

await connectDb();
await releaseAll();

const parties = new Parties();
const social = new Social(parties);
const stopSuspensions = watchSuspensions(parties, social);
const stopStatus = watchStatus(parties);
/*
 * permessage-deflate, keeping its dictionary between messages: consecutive ticks are nearly the
 * same, so a four-player tick of about 8 KB goes out as a few hundred bytes. It costs some CPU
 * and about 300 KB of memory per connection. Small messages (pongs) aren't worth compressing.
 */
const wss = new WebSocketServer({
	port: config.port,
	path: config.path,
	perMessageDeflate: { zlibDeflateOptions: { level: 3 }, threshold: 256 }
});

wss.on('connection', (socket) => serve(socket, parties, social));

log.info(
	`Undercroft ${GAME_VERSION} game server listening on ws://localhost:${config.port}${config.path ?? ''}`
);

async function shutdown(): Promise<void> {
	log.info('Shutting down');
	social.stop();
	stopSuspensions();
	stopStatus();
	parties.stop();
	wss.close();
	await closeDb();
	process.exit(0);
}

/*
 * Anything else that throws: recorded, then the process exits and Docker starts it again (a
 * state nobody expected is not one to keep running in). A rejected promise is only recorded.
 */
process.on('uncaughtException', (error) => {
	void serverCrash(error, 'Uncaught').finally(() => process.exit(1));
});
process.on('unhandledRejection', (reason) => {
	void serverCrash(reason, 'Unhandled rejection');
});
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
