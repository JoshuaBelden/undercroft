import { WebSocketServer } from 'ws';
import { PROTOCOL_VERSION } from '../src/lib/shared/constants.ts';
import { GAME_VERSION } from '../src/lib/shared/version.ts';
import { decodeClient, encode } from '../src/lib/shared/protocol.ts';
import { currentTag, identify } from './accounts.ts';
import { releaseAll } from './belongings.ts';
import { config } from './config.ts';
import { closeDb, connectDb } from './db.ts';
import { log } from './log.ts';
import { Parties, type Member } from './parties.ts';
import { Social } from './social.ts';

await connectDb();
await releaseAll();

const parties = new Parties();
const social = new Social(parties);
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
			const { ticket } = message;
			void identify(ticket).then((identity) => {
				identifying = false;
				if (socket.readyState !== socket.OPEN) return;
				if (!identity) {
					socket.send(encode({ type: 'reject', reason: 'Sign in to play' }));
					socket.close();
					return;
				}
				member = parties.connect(socket, identity);
				void social.connected(member);
			});
			return;
		}
		if (message.type === 'ping') {
			socket.send(encode({ type: 'pong', clientTime: message.clientTime, serverTime: Date.now() }));
			return;
		}
		if (!member) return;

		switch (message.type) {
			case 'leaveParty':
				parties.leave(member);
				break;
			case 'ready':
				void parties.setReady(member, message.ready === true);
				break;
			case 'kick':
				parties.kick(member, message.member);
				break;
			case 'affliction':
				parties.setAffliction(member, message.id);
				break;
			case 'resetAffliction':
				void parties.resetAffliction(member, message.id);
				break;
			case 'social':
				void social.act(member, message.action);
				break;
			case 'rename': {
				const renamed = member;
				void currentTag(renamed.account).then((tag) => {
					if (tag) parties.rename(renamed, tag);
				});
				break;
			}
			case 'stopSpectating':
				parties.stopSpectating(member);
				break;
			case 'abandon': {
				const e = parties.expedition(member);
				if (e) e.session.abandon(e.playerId);
				break;
			}
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
			case 'mark': {
				const e = parties.expedition(member);
				if (e) e.session.mark(e.playerId, message.symbol, message.position, message.normal);
				break;
			}
			case 'closeCrate': {
				const e = parties.expedition(member);
				if (e) e.session.closeCrate(e.playerId);
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

log.info(
	`Undercroft ${GAME_VERSION} game server listening on ws://localhost:${config.port}${config.path ?? ''}`
);

async function shutdown(): Promise<void> {
	log.info('Shutting down');
	social.stop();
	parties.stop();
	wss.close();
	await closeDb();
	process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
