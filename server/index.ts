import { WebSocketServer } from 'ws';
import { PROTOCOL_VERSION } from '../src/lib/shared/constants.ts';
import { decodeClient, encode } from '../src/lib/shared/protocol.ts';
import { currentTag, identify } from './accounts.ts';
import { config } from './config.ts';
import { closeDb, connectDb } from './db.ts';
import { log } from './log.ts';
import { Parties, type Member } from './parties.ts';

await connectDb();

const parties = new Parties();
const wss = new WebSocketServer({ port: config.port });

wss.on('connection', (socket) => {
	/** Set by `hello`; every other message needs it. */
	let member: Member | null = null;
	/** Looking up who they are (a `hello` is being checked). */
	let identifying = false;

	socket.on('message', (data) => {
		const message = decodeClient(data.toString());
		if (!message) return;

		if (message.type === 'hello') {
			if (message.protocol !== PROTOCOL_VERSION) {
				socket.send(encode({ type: 'reject', reason: 'Protocol version mismatch' }));
				socket.close();
				return;
			}
			if (member || identifying) return;
			identifying = true;
			const { ticket, code } = message;
			void identify(ticket).then((identity) => {
				identifying = false;
				if (socket.readyState !== socket.OPEN) return;
				if (!identity) {
					socket.send(encode({ type: 'reject', reason: 'Sign in to play' }));
					socket.close();
					return;
				}
				member = parties.connect(socket, identity, code);
			});
			return;
		}
		if (message.type === 'ping') {
			socket.send(encode({ type: 'pong', clientTime: message.clientTime, serverTime: Date.now() }));
			return;
		}
		if (!member) return;

		switch (message.type) {
			case 'joinParty':
				parties.join(member, message.code);
				break;
			case 'leaveParty':
				parties.leave(member);
				break;
			case 'ready':
				parties.setReady(member, message.ready === true);
				break;
			case 'rename': {
				const renamed = member;
				void currentTag(renamed.account).then((tag) => {
					if (tag) parties.rename(renamed, tag);
				});
				break;
			}
			case 'descend':
				parties.descend(member);
				break;
			case 'stopSpectating':
				parties.stopSpectating(member);
				break;
			case 'input': {
				const e = parties.expedition(member);
				if (e) e.session.receiveInput(e.playerId, message.frames);
				break;
			}
			case 'inventory': {
				const e = parties.expedition(member);
				if (e) e.session.inventory(e.playerId, message.action);
				break;
			}
			case 'admin': {
				const e = parties.expedition(member);
				if (e && typeof message.command === 'object' && message.command !== null)
					e.session.admin(e.playerId, message.command);
				break;
			}
		}
	});

	socket.on('close', () => {
		if (member) parties.disconnect(member, socket);
	});
});

log.info(`Game server listening on ws://localhost:${config.port}`);

async function shutdown(): Promise<void> {
	log.info('Shutting down');
	parties.stop();
	wss.close();
	await closeDb();
	process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
