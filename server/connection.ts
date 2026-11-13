import type { RawData, WebSocket } from 'ws';
import { PROTOCOL_VERSION } from '../src/lib/shared/constants.ts';
import { decodeClient, encode } from '../src/lib/shared/protocol.ts';
import { currentTag, identify } from './accounts.ts';
import { crashMessage, serverCrash } from './errors.ts';
import type { Parties, Member } from './parties.ts';
import type { Social } from './social.ts';

/**
 * One player's connection: who they are (from `hello`), and every message they send routed to
 * their party, their social lists or their expedition. Set up by server/index.ts for each new
 * WebSocket.
 */
export function serve(socket: WebSocket, parties: Parties, social: Social): void {
	/** Set by `hello`; every other message needs it. */
	let member: Member | null = null;
	/** Looking up who they are (a `hello` is being checked). */
	let identifying = false;

	/** One message from this player. Anything that throws is caught below. */
	const handle = (data: RawData): void => {
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
	};

	/*
	 * A message that throws doesn't take the server down: the error is recorded and this player is
	 * asked whether to report it (docs/dev/reports.md#crashes).
	 */
	socket.on('message', (data: RawData) => {
		try {
			handle(data);
		} catch (error) {
			const where = member ? `Message from ${member.name}` : 'Message';
			void serverCrash(error, where).then((id) => {
				if (socket.readyState !== socket.OPEN) return;
				socket.send(encode({ type: 'serverError', id, message: crashMessage(error) }));
			});
		}
	});

	socket.on('close', () => {
		if (member) parties.disconnect(member, socket);
	});
}
