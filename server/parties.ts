import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { AFFLICTIONS } from '../src/lib/content/afflictions.ts';
import { PARTY } from '../src/lib/content/party.ts';
import { ITEMS } from '../src/lib/content/items.ts';
import { allStacks } from '../src/lib/shared/items/inventory.ts';
import { allReady, type PartyState } from '../src/lib/shared/party/types.ts';
import { encode, type ServerMessage } from '../src/lib/shared/protocol.ts';
import type { FriendStatus } from '../src/lib/shared/social/types.ts';
import type { Identity, Profile } from './accounts.ts';
import { giveBack, lockKit, owned, takeKit } from './belongings.ts';
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
	/** Their avatar's URL, or null. */
	avatar: string | null;
	socket: WebSocket;
	/** Their loadout is confirmed and locked, and they are waiting to descend. */
	ready: boolean;
	/** What they last asked for; `ready` follows once their loadout is locked. */
	wantReady: boolean;
	/** False while the connection is down and their place is held. */
	connected: boolean;
	/** Runs out when a dropped member has been gone too long. */
	dropTimer: NodeJS.Timeout | null;
	party: Party;
	/** Their player id in the party's expedition; null on the surface. */
	playerId: string | null;
}

interface Party {
	id: string;
	/** Member id of the host, who chooses the Affliction. */
	leader: string;
	members: Member[];
	/** The Affliction the host chose (key into AFFLICTIONS); null until they choose. */
	affliction: string | null;
	/** The running expedition; null on the surface. */
	session: Session | null;
	/** When the descent starts, while everyone is ready and it is counting down. */
	launchAt: number | null;
	launchTimer: NodeJS.Timeout | null;
	/** The host's progress on the chosen Affliction, and whose and which it is (see `hostProgress`). */
	progress: { key: string; clues: number; resolved: boolean } | null;
}

/**
 * Parties and their expeditions. Every connection is in a party from the moment it says hello:
 * one of its own, until it accepts a friend's invite (server/social.ts). The host chooses the
 * Affliction; each member readies up, which locks their loadout; once everyone is ready the
 * descent counts down and starts. That creates a `Session` (new seed and map) with every member
 * in it. Solo play is a party of one.
 *
 * A member whose connection drops keeps their place for a while (`PARTY.reconnectSeconds`
 * underground, `PARTY.lobbyGraceSeconds` on the surface: long enough to reload the page); a new
 * connection from the same account takes it back. See docs/dev/expedition.md.
 */
export class Parties {
	/**
	 * Called when what these accounts are doing may have changed (joined, left, dropped, went
	 * down, came back), so their friends can be told.
	 */
	onPresence: (accounts: string[]) => void = () => {};
	private parties = new Map<string, Party>();
	/** Every member, by account: connecting again takes the same member back. */
	private byAccount = new Map<string, Member>();
	/** What players have learned about the rite on earlier expeditions. */
	private progress = new Progress();

	/**
	 * A new connection from a signed-in player. If their account is already here (a dropped
	 * connection whose place is held, or another tab), this connection becomes that member and the
	 * old one is closed. Otherwise they start a party of their own.
	 */
	connect(socket: WebSocket, identity: Identity): Member {
		const back = this.find(identity.account);
		if (back) {
			const old = back.socket;
			if (back.dropTimer) clearTimeout(back.dropTimer);
			back.dropTimer = null;
			back.socket = socket;
			back.connected = true;
			back.name = identity.gamerTag;
			back.avatar = identity.avatar;
			if (old !== socket && old.readyState === old.OPEN) {
				old.send(encode({ type: 'reject', reason: 'You connected from somewhere else' }));
				old.close();
			}
			this.changed(back.party);
			if (back.playerId) back.party.session?.reattach(back.playerId, socket);
			return back;
		}
		const member: Member = {
			id: randomUUID(),
			account: identity.account,
			explorer: identity.explorer,
			name: identity.gamerTag,
			avatar: identity.avatar,
			socket,
			ready: false,
			wantReady: false,
			connected: true,
			dropTimer: null,
			party: this.create(),
			playerId: null
		};
		this.add(member.party, member);
		return member;
	}

	/** The connection closed. Their place is held for a while: longer underground. */
	disconnect(member: Member, socket: WebSocket): void {
		// A member who connected again has a new socket: the old one closing is not them leaving.
		if (member.socket !== socket || !member.party.members.includes(member)) return;
		const seconds = this.expedition(member) ? PARTY.reconnectSeconds : PARTY.lobbyGraceSeconds;
		member.connected = false;
		// Whoever comes back confirms their loadout again.
		this.unready(member);
		member.dropTimer = setTimeout(() => this.remove(member), seconds * 1000);
		log.info(`Party ${tag(member.party)}: ${member.name} dropped; holding their place`);
		this.changed(member.party);
	}

	/** A dead member who was watching the others goes back to the surface. */
	stopSpectating(member: Member): void {
		if (member.playerId) member.party.session?.removeSpectator(member.playerId);
	}

	/** Move `member` to `host`'s party (they accepted an invite). Returns why not, if they can't. */
	join(member: Member, host: Member): string | null {
		const party = host.party;
		if (!party.members.includes(host)) return 'That party is gone';
		if (party === member.party) return "You're already in that party";
		if (this.expedition(member)) return "You can't join a party while you're underground";
		if (party.session) return 'That party is underground';
		if (party.members.length >= PARTY.maxSize) return 'That party is full';
		this.remove(member, true);
		this.add(party, member);
		return null;
	}

	/** Leave the current party for a new one of your own. */
	leave(member: Member): void {
		if (member.party.members.length === 1 || this.expedition(member)) return;
		this.remove(member, true);
		this.add(this.create(), member);
	}

	/** The host puts someone out of the party: they are on their own again. */
	kick(member: Member, id: unknown): void {
		const party = member.party;
		const target = party.members.find((m) => m.id === id);
		let problem: string | null = null;
		if (party.leader !== member.id) problem = 'Only the host can remove someone from the party';
		else if (!target || target === member) problem = 'They are not in your party';
		else if (party.session) problem = "You can't remove anyone during an expedition";
		if (problem !== null || !target) {
			this.send(member, { type: 'partyError', reason: problem ?? 'They are not in your party' });
			return;
		}
		this.remove(target, true);
		// Still connected (or with their place held): a party of their own, as when they arrived.
		this.add(this.create(), target);
		this.send(target, { type: 'partyError', reason: `${member.name} removed you from the party` });
		log.info(`Party ${tag(party)}: ${member.name} removed ${target.name}`);
	}

	/**
	 * A member forgets what they know of an Affliction: no hints, unresolved. Not while an
	 * expedition is under way. They are told when it is done, so they can reload their account.
	 */
	async resetAffliction(member: Member, id: unknown): Promise<void> {
		if (typeof id !== 'string' || !Object.hasOwn(AFFLICTIONS, id)) {
			this.send(member, { type: 'partyError', reason: 'No such Affliction' });
			return;
		}
		if (member.party.session) {
			this.send(member, { type: 'partyError', reason: 'An expedition is under way' });
			return;
		}
		await this.progress.reset([member.explorer], id);
		const party = member.party;
		if (party.leader === member.id && party.affliction === id) {
			// What the party plays at is the host's: look it up again.
			party.progress = null;
			this.changed(party);
		}
		this.send(member, { type: 'afflictionReset', id });
		log.info(`${member.name} reset their progress on ${id}`);
	}

	/** The host chooses what the expedition is against. Everyone confirms again after a change. */
	setAffliction(member: Member, id: unknown): void {
		const party = member.party;
		let problem: string | null = null;
		if (party.leader !== member.id) problem = 'Only the host chooses the Affliction';
		else if (party.session) problem = 'An expedition is already under way';
		else if (typeof id !== 'string' || !Object.hasOwn(AFFLICTIONS, id)) {
			problem = 'No such Affliction';
		}
		if (problem !== null || typeof id !== 'string') {
			this.send(member, { type: 'partyError', reason: problem ?? 'No such Affliction' });
			return;
		}
		if (party.affliction === id) return;
		party.affliction = id;
		for (const m of party.members) this.unready(m);
		this.changed(party);
	}

	/**
	 * Ready to descend, or not after all. Becoming ready first locks their loadout (the hub
	 * refuses changes to it), so what they confirmed is what goes down; only then do the others
	 * see them as ready.
	 */
	async setReady(member: Member, ready: boolean): Promise<void> {
		const party = member.party;
		if (!ready) {
			if (!member.ready && !member.wantReady) return;
			this.unready(member);
			this.changed(party);
			return;
		}
		if (member.wantReady || this.expedition(member)) return;
		let problem: string | null = null;
		if (party.session) problem = 'An expedition is already under way';
		else if (!party.affliction) problem = 'No Affliction has been chosen yet';
		if (problem) {
			this.send(member, { type: 'partyError', reason: problem });
			return;
		}
		member.wantReady = true;
		await lockKit(member.explorer, true);
		// They changed their mind, left or dropped meanwhile: `unready` has unlocked it again.
		if (!member.wantReady || member.ready) return;
		member.ready = true;
		this.changed(member.party);
	}

	/** Their gamer tag or avatar changed (on the site): the party sees the new ones. */
	updateProfile(member: Member, profile: Profile): void {
		if (profile.gamerTag === member.name && profile.avatar === member.avatar) return;
		member.name = profile.gamerTag;
		member.avatar = profile.avatar;
		this.changed(member.party);
	}

	/** The countdown ran out with everyone still ready: the expedition starts for the whole party. */
	private descend(party: Party): void {
		party.launchTimer = null;
		party.launchAt = null;
		if (!party.affliction || !allReady(this.state(party))) return;
		/** Everyone who went down, whether or not they are still alive. */
		const descended = (): string[] =>
			party.members.filter((m) => m.playerId).map((m) => m.explorer);
		const session = new Session(party.affliction, {
			onClues: (clues) => this.progress.record(descended(), session.afflictionId, { clues }),
			onResolved: () => this.progress.record(descended(), session.afflictionId, { resolved: true }),
			onRiteReset: () => void this.progress.reset(descended(), session.afflictionId),
			onPlayerLeft: (explorer, carried) => {
				giveBack(explorer, session.id, carried);
				this.sweep(party);
				this.changed(party);
			},
			onEnded: () => {
				if (party.session !== session) return;
				party.session = null;
				for (const m of party.members) m.playerId = null;
				// What the host knows may have changed down there.
				party.progress = null;
				this.sweep(party);
				this.changed(party);
			}
		});
		party.session = session;
		log.info(
			`Party ${tag(party)}: expedition ${session.id.slice(0, 8)} against ${party.affliction} started with seed ${session.seed} (${party.members.length} players)`
		);
		// Taking each loadout (in `begin`) is also what unlocks it again.
		for (const m of party.members) {
			m.ready = false;
			m.wantReady = false;
		}
		this.changed(party);
		void this.begin(party, session, descended);
	}

	/**
	 * Everyone's loadout leaves the surface with them, then they appear underground. Fetching the
	 * loadouts takes a moment, so someone can have left by the time they arrive.
	 */
	private async begin(party: Party, session: Session, descended: () => string[]): Promise<void> {
		const going = [...party.members];
		const [kits, onSurface] = await Promise.all([
			Promise.all(going.map((m) => takeKit(m.explorer, session.id))),
			owned(going.map((m) => m.explorer))
		]);
		// A quest item someone already owns (kept on the surface, or brought down) isn't put in the map.
		const quest =
			AFFLICTIONS[session.afflictionId]?.rite.requirements
				.map((r) => r.item)
				.filter((item) => ITEMS[item]?.quest) ?? [];
		const carried = new Set(kits.flatMap((kit) => allStacks(kit).map((stack) => stack.item)));
		session.withhold(quest.filter((item) => onSurface.has(item) || carried.has(item)));
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
			this.changed(party);
			return;
		}
		// The expedition starts from what the host learned on earlier runs, not the most anyone has:
		// a friend who has done it already doesn't give it away. Everyone who went down knows it now.
		const host = party.members.find((m) => m.id === party.leader);
		if (host) {
			void this.progress.of(host.explorer, session.afflictionId).then(({ clues }) => {
				if (party.session !== session || clues <= 0) return;
				session.revealClues(clues);
				this.progress.record(descended(), session.afflictionId, { clues });
			});
		}
		this.changed(party);
	}

	/** The expedition this member is down in, if any. */
	expedition(member: Member): { session: Session; playerId: string } | null {
		const session = member.party.session;
		if (!session || !member.playerId || !session.has(member.playerId)) return null;
		return { session, playerId: member.playerId };
	}

	/** The member for this account, if they are in a party (connected, or with their place held). */
	find(account: string): Member | undefined {
		const member = this.byAccount.get(account);
		return member?.party.members.includes(member) ? member : undefined;
	}

	/** What this account is doing, as their friends see it. */
	presence(account: string): FriendStatus {
		const member = this.find(account);
		if (!member?.connected) return 'offline';
		if (this.expedition(member)) return 'underground';
		return member.party.members.length > 1 ? 'inParty' : 'online';
	}

	/** How busy the server is, for the admin app (server/stats.ts). */
	census(): { online: number; parties: number; expeditions: number; underground: number } {
		let online = 0;
		let underground = 0;
		let expeditions = 0;
		for (const party of this.parties.values()) {
			if (party.session) expeditions++;
			for (const member of party.members) {
				if (member.connected) online++;
				if (member.playerId) underground++;
			}
		}
		return { online, parties: this.parties.size, expeditions, underground };
	}

	/** Every account with a member here, connected or with their place held. */
	accounts(): string[] {
		return [...this.byAccount.keys()];
	}

	/**
	 * Send an account away for good (an admin suspended it, or it was deleted): told why,
	 * disconnected, and out of their party and expedition at once, with no place held.
	 */
	expel(account: string, reason: string): void {
		const member = this.find(account);
		if (!member) return;
		if (member.socket.readyState === member.socket.OPEN) {
			member.socket.send(encode({ type: 'reject', reason }));
			member.socket.close();
		}
		member.connected = false;
		log.info(`Party ${tag(member.party)}: ${member.name} was sent away (${reason}); removed`);
		this.remove(member);
	}

	/** Tell a member something only they should hear. */
	tell(member: Member, message: ServerMessage): void {
		this.send(member, message);
	}

	stop(): void {
		for (const member of this.byAccount.values()) {
			if (member.dropTimer) clearTimeout(member.dropTimer);
		}
		for (const party of this.parties.values()) {
			if (party.launchTimer) clearTimeout(party.launchTimer);
			party.session?.stop();
		}
	}

	/** Not ready any more: their loadout can be changed again. */
	private unready(member: Member): void {
		if (!member.ready && !member.wantReady) return;
		member.ready = false;
		member.wantReady = false;
		void lockKit(member.explorer, false);
	}

	/**
	 * Something about the party changed: start the countdown if everyone is now ready, stop it if
	 * not, and tell everyone.
	 */
	private changed(party: Party): void {
		this.hostProgress(party);
		const ready = allReady(this.state(party));
		if (ready && !party.launchTimer) {
			party.launchAt = Date.now() + PARTY.countdownSeconds * 1000;
			party.launchTimer = setTimeout(() => this.descend(party), PARTY.countdownSeconds * 1000);
		} else if (!ready && party.launchTimer) {
			clearTimeout(party.launchTimer);
			party.launchTimer = null;
			party.launchAt = null;
		}
		this.broadcast(party);
	}

	/** Dropped members with no place left to hold (they died, or it ended) leave the party. */
	private sweep(party: Party): void {
		for (const member of [...party.members]) {
			if (!member.connected && !this.expedition(member)) this.remove(member);
		}
	}

	private create(): Party {
		const party: Party = {
			id: randomUUID(),
			leader: '',
			members: [],
			affliction: null,
			session: null,
			launchAt: null,
			launchTimer: null,
			progress: null
		};
		this.parties.set(party.id, party);
		return party;
	}

	private add(party: Party, member: Member): void {
		this.unready(member);
		member.party = party;
		member.playerId = null;
		party.members.push(member);
		this.byAccount.set(member.account, member);
		if (!party.leader) party.leader = member.id;
		this.changed(party);
	}

	/**
	 * Take a member out of their party (and its expedition); an empty party is gone. `moving`
	 * means they are about to be put in another party: they have not gone anywhere, so nobody is
	 * told they left (joining the next party tells everyone where they are).
	 */
	private remove(member: Member, moving = false): void {
		const party = member.party;
		if (!party.members.includes(member)) return;
		if (member.dropTimer) clearTimeout(member.dropTimer);
		member.dropTimer = null;
		this.unready(member);
		party.members = party.members.filter((m) => m !== member);
		if (this.byAccount.get(member.account) === member) this.byAccount.delete(member.account);
		if (party.leader === member.id) party.leader = party.members[0]?.id ?? '';
		// Leaving the session last: its hooks broadcast the party without this member.
		const playerId = member.playerId;
		member.playerId = null;
		if (playerId) party.session?.removePlayer(playerId);
		if (party.members.length === 0) {
			if (party.launchTimer) clearTimeout(party.launchTimer);
			party.launchTimer = null;
			party.session?.stop();
			this.parties.delete(party.id);
		} else {
			this.changed(party);
		}
		if (!moving) this.onPresence([member.account]);
	}

	/**
	 * Look up the host's progress on the chosen Affliction when the host or the Affliction has
	 * changed (or it was cleared after an expedition), then tell the party.
	 */
	private hostProgress(party: Party): void {
		const host = party.members.find((m) => m.id === party.leader);
		if (!host || !party.affliction) {
			party.progress = null;
			return;
		}
		const key = `${host.explorer}:${party.affliction}`;
		if (party.progress?.key === key) return;
		party.progress = { key, clues: 0, resolved: false };
		const affliction = party.affliction;
		void this.progress.of(host.explorer, affliction).then((known) => {
			if (party.progress?.key !== key || !this.parties.has(party.id)) return;
			party.progress = { key, ...known };
			this.broadcast(party);
		});
	}

	private state(party: Party): PartyState {
		return {
			leader: party.leader,
			affliction: party.affliction,
			progress: party.progress
				? { clues: party.progress.clues, resolved: party.progress.resolved }
				: null,
			launchIn: party.launchAt === null ? null : Math.max(0, party.launchAt - Date.now()),
			members: party.members.map((m) => ({
				id: m.id,
				account: m.account,
				name: m.name,
				avatar: m.avatar,
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
		this.onPresence(party.members.map((m) => m.account));
	}

	private send(member: Member, message: ServerMessage): void {
		if (member.socket.readyState === member.socket.OPEN) member.socket.send(encode(message));
	}
}

/** A party, for the log. */
function tag(party: Party): string {
	return party.id.slice(0, 8);
}
