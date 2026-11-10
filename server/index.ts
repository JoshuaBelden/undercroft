import { WebSocketServer } from 'ws';
import { PROTOCOL_VERSION } from '../src/lib/shared/constants.ts';
import { decodeClient, encode } from '../src/lib/shared/protocol.ts';
import { config } from './config.ts';
import { closeDb, connectDb } from './db.ts';
import { log } from './log.ts';
import { Session } from './session.ts';

await connectDb();

// Phase 0: every connection joins one shared session.
// Phase 1 replaces this with per-expedition sessions.
const session = new Session();
const wss = new WebSocketServer({ port: config.port });

wss.on('connection', (socket) => {
	let playerId: string | null = null;

	socket.on('message', (data) => {
		const message = decodeClient(data.toString());
		if (!message) return;

		switch (message.type) {
			case 'hello':
				if (message.protocol !== PROTOCOL_VERSION) {
					socket.send(encode({ type: 'reject', reason: 'Protocol version mismatch' }));
					socket.close();
					return;
				}
				if (!playerId) playerId = session.addPlayer(socket, message.name.slice(0, 24)).id;
				break;
			case 'input':
				if (playerId) session.receiveInput(playerId, message.frames);
				break;
			case 'admin':
				if (playerId && typeof message.command === 'object' && message.command !== null)
					session.admin(playerId, message.command);
				break;
			case 'ping':
				socket.send(
					encode({ type: 'pong', clientTime: message.clientTime, serverTime: Date.now() })
				);
				break;
		}
	});

	socket.on('close', () => {
		if (playerId) session.removePlayer(playerId);
	});
});

log.info(`Game server listening on ws://localhost:${config.port}`);

async function shutdown(): Promise<void> {
	log.info('Shutting down');
	session.stop();
	wss.close();
	await closeDb();
	process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
