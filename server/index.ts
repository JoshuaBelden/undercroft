import { WebSocketServer } from 'ws';
import { PROTOCOL_VERSION } from '../src/lib/shared/constants.ts';
import { decodeClient, encode } from '../src/lib/shared/protocol.ts';
import { config } from './config.ts';
import { closeDb, connectDb } from './db.ts';
import { Expeditions } from './expeditions.ts';
import { log } from './log.ts';
import type { Session } from './session.ts';

await connectDb();

const expeditions = new Expeditions();
const wss = new WebSocketServer({ port: config.port });

wss.on('connection', (socket) => {
	let name = 'Explorer';
	/** The expedition this connection is in; null after extracting until it descends again. */
	let membership: { session: Session; playerId: string } | null = null;
	const inExpedition = () =>
		membership && membership.session.has(membership.playerId) ? membership : null;

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
				name = String(message.name).slice(0, 24);
				if (!membership) membership = expeditions.join(socket, name);
				break;
			case 'descend':
				if (!inExpedition()) membership = expeditions.join(socket, name);
				break;
			case 'input': {
				const m = inExpedition();
				if (m) m.session.receiveInput(m.playerId, message.frames);
				break;
			}
			case 'admin': {
				const m = inExpedition();
				if (m && typeof message.command === 'object' && message.command !== null)
					m.session.admin(m.playerId, message.command);
				break;
			}
			case 'ping':
				socket.send(
					encode({ type: 'pong', clientTime: message.clientTime, serverTime: Date.now() })
				);
				break;
		}
	});

	socket.on('close', () => {
		const m = inExpedition();
		if (m) m.session.removePlayer(m.playerId);
	});
});

log.info(`Game server listening on ws://localhost:${config.port}`);

async function shutdown(): Promise<void> {
	log.info('Shutting down');
	expeditions.stop();
	wss.close();
	await closeDb();
	process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
