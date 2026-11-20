import type { RawData, WebSocket } from 'ws';
import { PROTOCOL_VERSION } from '../src/lib/shared/constants.ts';
import { decodeClient, encode } from '../src/lib/shared/protocol.ts';
import { cleanTag } from '../src/lib/content/account.ts';
import { currentProfile, identify, type Identity } from './accounts.ts';
import { crashMessage, serverCrash } from './errors.ts';
import { attachGuest, guestExplorer, vaultAnswer } from './guests.ts';
import type { Parties, Member } from './parties.ts';
import type { Social } from './social.ts';

/**
 * One player's connection: who they are (from `hello`), and every message they send routed to
 * their party, their social lists or their expedition. Set up by server/start.ts for each new
 * WebSocket. `guest`: this connection came through a desktop game's tunnel for a co-op guest,
 * who is that SteamID (docs/dev/hosting.md); they join the host's party and nothing else.
 */
export function serve(
	socket: WebSocket,
	parties: Parties,
	social: Social,
	guest: { steamId: string } | null = null
): void {
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
			if (guest) {
				const explorer = guestExplorer(guest.steamId);
				const identity: Identity = {
					account: explorer,
					explorer,
					gamerTag: cleanTag(message.name) ?? 'Guest',
					avatar: null,
					remote: true
				};
				attachGuest(explorer, socket);
				const arrived = parties.connect(socket, identity);
				const problem = parties.joinHost(arrived);
				if (problem) parties.expel(arrived.account, problem);
				else member = arrived;
				return;
			}
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
				void parties.setAffliction(member, message.id);
				break;
			case 'resetAffliction':
				void parties.resetAffliction(member, message.id);
				break;
			case 'social':
				// A guest's friends are on Steam, not here.
				if (!member.remote) void social.act(member, message.action);
				break;
			case 'vault':
				if (member.remote) vaultAnswer(member.explorer, message);
				break;
			case 'profile': {
				if (member.remote) break;
				const changed = member;
				void currentProfile(changed.account).then((profile) => {
					if (profile) parties.updateProfile(changed, profile);
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
			case 'craft': {
				const e = parties.expedition(member);
				if (e) e.session.craft(e.playerId, message);
				break;
			}
			case 'stopCraft': {
				const e = parties.expedition(member);
				if (e) e.session.stopCraft(e.playerId);
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
