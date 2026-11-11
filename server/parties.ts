import { randomInt, randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { PARTY } from '../src/lib/content/party.ts';
import { canDescend, normalizeCode, type PartyState } from '../src/lib/shared/party/types.ts';
import { encode, type ServerMessage } from '../src/lib/shared/protocol.ts';
import type { Identity } from './accounts.ts';
import { giveBack, takeKit } from './belongings.ts';
import { log } from './log.ts';
import { Progress } from './progress.ts';
import { Session } from './session.ts';

/** One signed-in player: always in exactly one party, even alone. */
export interface Member {
	id: string;
	/** Their account; an account is only ever one member. */
	account: string;
	/** The explorer they play: what progress and belongings are kept under. */
	explorer: string;
	/** Their gamer tag. */
	name: string;
	socket: WebSocket;
	ready: boolean;
	/** False while the connection is down and their place in the expedition is held. */
	connected: boolean;
	/** Runs out when a dropped member has been gone too long. */
	dropTimer: NodeJS.Timeout | null;
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
 * Solo play is a party of one.
 *
 * A member whose connection drops while underground keeps their place for
 * `PARTY.reconnectSeconds`; a new connection from the same account takes it back. On the surface
 * a drop just removes them. See docs/dev/expedition.md.
 */
export class Parties {
	private parties = new Map<string, Party>();
	/** Every member, by account: connecting again takes the same member back. */
	private byAccount = new Map<string, Member>();
	/** What players have learned about the rite on earlier expeditions. */
	private progress = new Progress();

	/**
	 * A new connection from a signed-in player. If their account is already here (a dropped
	 * connection whose place is held, or another tab), this connection becomes that member and the
	 * old one is closed. Otherwise they join the party with `code` if they can, or start their own.
	 */
	connect(socket: WebSocket, identity: Identity, code: unknown): Member {
		const back = this.byAccount.get(identity.account);
		if (back) {
			const old = back.socket;
			if (back.dropTimer) clearTimeout(back.dropTimer);
			back.dropTimer = null;
			back.socket = socket;
			back.connected = true;
			back.name = identity.gamerTag;
			if (old !== socket && old.readyState === old.OPEN) {
				old.send(encode({ type: 'reject', reason: 'You connected from somewhere else' }));
				old.close();
			}
			this.broadcast(back.party);
			if (back.playerId) back.party.session?.reattach(back.playerId, socket);
			return back;
		}
		const wanted = typeof code === 'string' ? normalizeCode(code) : '';
		const found = wanted ? this.joinable(wanted, null) : null;
		const party = found && typeof found !== 'string' ? found : this.create();
		const member: Member = {
			id: randomUUID(),
			account: identity.account,
			explorer: identity.explorer,
			name: identity.gamerTag,
			socket,
			ready: false,
			connected: true,
			dropTimer: null,
			party,
			playerId: null
		};
		this.byAccount.set(member.account, member);
		this.add(party, member);
		if (typeof found === 'string') this.send(member, { type: 'partyError', reason: found });
		return member;
	}

	/** The connection closed. Underground, their place is held for a while; otherwise they go. */
	disconnect(member: Member, socket: WebSocket): void {
		// A member who connected again has a new socket: the old one closing is not them leaving.
		if (member.socket !== socket) return;
		if (!this.expedition(member)) {
			this.remove(member);
			return;
		}
		member.connected = false;
		member.dropTimer = setTimeout(() => this.remove(member), PARTY.reconnectSeconds * 1000);
		log.info(`Party ${member.party.code}: ${member.name} dropped; holding their place`);
		this.broadcast(member.party);
	}

	/** A dead member who was watching the others goes back to the surface. */
	stopSpectating(member: Member): void {
		if (member.playerId) member.party.session?.removeSpectator(member.playerId);
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

	/** Their gamer tag changed. */
	rename(member: Member, name: string): void {
		if (name === member.name) return;
		member.name = name;
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
		/** Everyone who went down, whether or not they are still alive. */
		const descended = (): string[] =>
			party.members.filter((m) => m.playerId).map((m) => m.explorer);
		const session = new Session({
			onClues: (clues) => this.progress.record(descended(), session.afflictionId, { clues }),
			onResolved: () => this.progress.record(descended(), session.afflictionId, { resolved: true }),
			onRiteReset: () => this.progress.reset(descended(), session.afflictionId),
			onPlayerLeft: (explorer, carried) => {
				giveBack(explorer, session.id, carried);
				this.sweep(party);
				this.broadcast(party);
			},
			onEnded: () => {
				if (party.session !== session) return;
				party.session = null;
				for (const m of party.members) {
					m.ready = false;
					m.playerId = null;
				}
				this.sweep(party);
				this.broadcast(party);
			}
		});
		party.session = session;
		log.info(
			`Party ${party.code}: expedition ${session.id.slice(0, 8)} started with seed ${session.seed} (${party.members.length} players)`
		);
		for (const m of party.members) m.ready = false;
		this.broadcast(party);
		void this.begin(party, session, descended);
	}

	/**
	 * Everyone's loadout leaves the surface with them, then they appear underground. Fetching the
	 * loadouts takes a moment, so someone can have left by the time they arrive.
	 */
	private async begin(party: Party, session: Session, descended: () => string[]): Promise<void> {
		const going = [...party.members];
		const kits = await Promise.all(going.map((m) => takeKit(m.explorer, session.id)));
		going.forEach((m, i) => {
			if (party.session !== session || !party.members.includes(m)) {
				// Gone before the descent: their things stay on the surface.
				giveBack(m.explorer, session.id, kits[i]);
				return;
			}
			m.playerId = session.addPlayer(m.socket, m.name, m.explorer, kits[i]).id;
		});
		if (party.session !== session) return;
		if (session.playerCount === 0) {
			party.session = null;
			this.broadcast(party);
			return;
		}
		// What any of them learned on earlier runs, all of them know now.
		void this.progress.best(descended(), session.afflictionId).then(({ clues }) => {
			if (party.session !== session || clues <= 0) return;
			session.revealClues(clues);
			this.progress.record(descended(), session.afflictionId, { clues });
		});
		this.broadcast(party);
	}

	/** The expedition this member is down in, if any. */
	expedition(member: Member): { session: Session; playerId: string } | null {
		const session = member.party.session;
		if (!session || !member.playerId || !session.has(member.playerId)) return null;
		return { session, playerId: member.playerId };
	}

	stop(): void {
		for (const member of this.byAccount.values()) {
			if (member.dropTimer) clearTimeout(member.dropTimer);
		}
		for (const party of this.parties.values()) party.session?.stop();
	}

	/** Dropped members with no place left to hold (they died, or it ended) leave the party. */
	private sweep(party: Party): void {
		for (const member of [...party.members]) {
			if (!member.connected && !this.expedition(member)) this.remove(member);
		}
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
		if (!party.members.includes(member)) return;
		if (member.dropTimer) clearTimeout(member.dropTimer);
		member.dropTimer = null;
		party.members = party.members.filter((m) => m !== member);
		if (party.leader === member.id) party.leader = party.members[0]?.id ?? '';
		// Leaving the session last: its hooks broadcast the party without this member.
		const playerId = member.playerId;
		member.playerId = null;
		if (playerId) party.session?.removePlayer(playerId);
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
				inExpedition: !!m.playerId && !!party.session?.has(m.playerId),
				connected: m.connected
			})),
			expedition: !!party.session
		};
	}

	private broadcast(party: Party): void {
		const state = this.state(party);
		for (const m of party.members) {
			this.send(m, { type: 'party', you: m.id, party: state });
		}
	}

	private send(member: Member, message: ServerMessage): void {
		if (member.socket.readyState === member.socket.OPEN) member.socket.send(encode(message));
	}
}
