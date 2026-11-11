import { randomInt, randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { PARTY } from '../src/lib/content/party.ts';
import { canDescend, normalizeCode, type PartyState } from '../src/lib/shared/party/types.ts';
import { encode, type ServerMessage } from '../src/lib/shared/protocol.ts';
import { log } from './log.ts';
import { Session } from './session.ts';

/** One connection: always in exactly one party, even alone. */
export interface Member {
	id: string;
	name: string;
	socket: WebSocket;
	ready: boolean;
	party: Party;
	/** Their player id in the party's expedition; null on the surface. */
	playerId: string | null;
}

interface Party {
	code: string;
	/** Member id. */
	leader: string;
	members: Member[];
	/** The running expedition; null on the surface. */
	session: Session | null;
}

/**
 * Parties and their expeditions. Every connection is in a party from the moment it says hello: a
 * new one of its own, or the one whose invite code it gave. The leader starts the descent once
 * everyone else is ready; that creates a `Session` (new seed and map) with every member in it.
 * Solo play is a party of one. See docs/dev/expedition.md.
 */
export class Parties {
	private parties = new Map<string, Party>();

	/** A new connection: joins the party with `code` if it can, otherwise starts its own. */
	connect(socket: WebSocket, name: unknown, code: unknown): Member {
		const wanted = typeof code === 'string' ? normalizeCode(code) : '';
		const found = wanted ? this.joinable(wanted, null) : null;
		const party = found && typeof found !== 'string' ? found : this.create();
		const member: Member = {
			id: randomUUID(),
			name: cleanName(name),
			socket,
			ready: false,
			party,
			playerId: null
		};
		this.add(party, member);
		if (typeof found === 'string') this.send(member, { type: 'partyError', reason: found });
		return member;
	}

	/** The connection closed. */
	disconnect(member: Member): void {
		this.remove(member);
	}

	/** Move to the party with this invite code. */
	join(member: Member, code: unknown): void {
		const found = this.joinable(typeof code === 'string' ? normalizeCode(code) : '', member.party);
		if (typeof found === 'string') {
			this.send(member, { type: 'partyError', reason: found });
			return;
		}
		this.remove(member);
		this.add(found, member);
	}

	/** Leave the current party for a new one of your own. */
	leave(member: Member): void {
		if (member.party.members.length === 1) return;
		this.remove(member);
		this.add(this.create(), member);
	}

	setReady(member: Member, ready: boolean): void {
		if (member.ready === ready || this.expedition(member)) return;
		member.ready = ready;
		this.broadcast(member.party);
	}

	rename(member: Member, name: unknown): void {
		const cleaned = cleanName(name);
		if (cleaned === member.name) return;
		member.name = cleaned;
		this.broadcast(member.party);
	}

	/** The leader starts the expedition for the whole party. */
	descend(member: Member): void {
		const party = member.party;
		const state = this.state(party);
		let problem: string | null = null;
		if (party.session) problem = 'An expedition is already under way';
		else if (party.leader !== member.id) problem = 'Only the party leader can start the descent';
		else if (!canDescend(state)) problem = 'Not everyone is ready';
		if (problem) {
			this.send(member, { type: 'partyError', reason: problem });
			return;
		}
		const session = new Session({
			onPlayerLeft: () => this.broadcast(party),
			onEnded: () => {
				if (party.session !== session) return;
				party.session = null;
				for (const m of party.members) {
					m.ready = false;
					m.playerId = null;
				}
				this.broadcast(party);
			}
		});
		party.session = session;
		log.info(
			`Party ${party.code}: expedition ${session.id.slice(0, 8)} started with seed ${session.seed} (${party.members.length} players)`
		);
		for (const m of party.members) {
			m.ready = false;
			m.playerId = session.addPlayer(m.socket, m.name).id;
		}
		this.broadcast(party);
	}

	/** The expedition this member is down in, if any. */
	expedition(member: Member): { session: Session; playerId: string } | null {
		const session = member.party.session;
		if (!session || !member.playerId || !session.has(member.playerId)) return null;
		return { session, playerId: member.playerId };
	}

	stop(): void {
		for (const party of this.parties.values()) party.session?.stop();
	}

	private create(): Party {
		let code: string;
		do {
			code = Array.from(
				{ length: PARTY.codeLength },
				() => PARTY.codeAlphabet[randomInt(PARTY.codeAlphabet.length)]
			).join('');
		} while (this.parties.has(code));
		const party: Party = { code, leader: '', members: [], session: null };
		this.parties.set(code, party);
		return party;
	}

	/** The party with `code` if `from`'s member may join it, or the reason they can't. */
	private joinable(code: string, from: Party | null): Party | string {
		const party = this.parties.get(code);
		if (!party) return 'No party has that code';
		if (party === from) return "You're already in that party";
		if (party.members.length >= PARTY.maxSize) return 'That party is full';
		return party;
	}

	private add(party: Party, member: Member): void {
		member.party = party;
		member.ready = false;
		member.playerId = null;
		party.members.push(member);
		if (!party.leader) party.leader = member.id;
		this.broadcast(party);
	}

	/** Take a member out of their party (and its expedition); an empty party is gone. */
	private remove(member: Member): void {
		const party = member.party;
		party.members = party.members.filter((m) => m !== member);
		if (party.leader === member.id) party.leader = party.members[0]?.id ?? '';
		// Leaving the session last: its hooks broadcast the party without this member.
		if (member.playerId) party.session?.removePlayer(member.playerId);
		member.playerId = null;
		if (party.members.length === 0) {
			party.session?.stop();
			this.parties.delete(party.code);
			return;
		}
		this.broadcast(party);
	}

	private state(party: Party): PartyState {
		return {
			code: party.code,
			leader: party.leader,
			members: party.members.map((m) => ({
				id: m.id,
				name: m.name,
				ready: m.ready,
				inExpedition: !!m.playerId && !!party.session?.has(m.playerId)
			})),
			expedition: !!party.session
		};
	}

	private broadcast(party: Party): void {
		const state = this.state(party);
		for (const m of party.members) this.send(m, { type: 'party', you: m.id, party: state });
	}

	private send(member: Member, message: ServerMessage): void {
		if (member.socket.readyState === member.socket.OPEN) member.socket.send(encode(message));
	}
}

function cleanName(name: unknown): string {
	const cleaned = typeof name === 'string' ? name.trim().slice(0, PARTY.nameLength) : '';
	return cleaned || PARTY.defaultName;
}
