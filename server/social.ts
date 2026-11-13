import { PARTY } from '../src/lib/content/party.ts';
import {
	acceptFriend,
	areFriends,
	FRIEND_ERRORS,
	friendsOf,
	removeFriend,
	requestFriend,
	searchTags,
	type Friendships,
	type Tagged
} from '../src/lib/server/store/friends.ts';
import {
	SOCIAL,
	type Person,
	type SocialAction,
	type SocialState
} from '../src/lib/shared/social/types.ts';
import { getDb } from './db.ts';
import { log } from './log.ts';
import type { Member, Parties } from './parties.ts';

/** One party invite: `from` asked `to` to join them. */
interface Invite {
	from: string;
	to: string;
	timer: NodeJS.Timeout;
}

/** What is kept for each account that is here. */
interface Known {
	/** Their friends and requests, as last read from the database. */
	friendships: Friendships;
	/** The last `SocialState` sent, as JSON: nothing is sent when nothing changed. */
	sent: string;
}

/**
 * Friends and party invites. Friendships are kept in MongoDB (src/lib/server/store/friends.ts);
 * who is here and who has invited whom is only in memory. Every account that is connected gets
 * its whole `SocialState` whenever anything in it changes. See docs/dev/social.md.
 */
export class Social {
	private known = new Map<string, Known>();
	private invites: Invite[] = [];

	constructor(private parties: Parties) {
		parties.onPresence = (accounts) => this.presenceChanged(accounts);
	}

	/** A player connected: read their friends and send them the lists. */
	async connected(member: Member): Promise<void> {
		// A new connection knows nothing yet, whatever the last one was sent.
		const known = this.known.get(member.account);
		if (known) known.sent = '';
		await this.reload(member.account);
	}

	/** A request from a player's social screen. */
	async act(member: Member, action: SocialAction): Promise<void> {
		const db = getDb();
		if (!db || typeof action !== 'object' || action === null) return;
		const me = member.account;
		try {
			if (action.kind === 'refresh') {
				await this.reload(me);
				return;
			}
			if (action.kind === 'search') {
				await this.search(member, action.query);
				return;
			}
			const them = action.account;
			if (typeof them !== 'string') return;
			switch (action.kind) {
				case 'request': {
					const error = await requestFriend(db, me, them);
					if (error) this.refuse(member, FRIEND_ERRORS[error]);
					await this.reload(me, them);
					break;
				}
				case 'accept':
					await acceptFriend(db, me, them);
					await this.reload(me, them);
					break;
				case 'decline':
				case 'remove':
					await removeFriend(db, me, them);
					this.dropInvites((invite) => pair(invite, me, them));
					await this.reload(me, them);
					break;
				case 'invite':
					await this.invite(member, them);
					break;
				case 'acceptInvite':
					this.answerInvite(member, them, true);
					break;
				case 'declineInvite':
					this.answerInvite(member, them, false);
					break;
			}
		} catch (error) {
			log.warn(`Social ${action.kind} failed: ${(error as Error).message}`);
			this.refuse(member, 'Something went wrong. Try again');
		}
	}

	/** Everyone on the lists of the accounts that are here: friends, and requests either way. */
	listed(): string[] {
		const accounts = new Set<string>();
		for (const { friendships } of this.known.values()) {
			for (const entry of everyone(friendships)) accounts.add(entry.account);
		}
		return [...accounts];
	}

	/** These accounts were deleted: their invites go, and lists that had them are read again. */
	async forget(deleted: string[]): Promise<void> {
		const gone = new Set(deleted);
		this.dropInvites((invite) => gone.has(invite.from) || gone.has(invite.to));
		const affected = [...this.known]
			.filter(([, known]) => everyone(known.friendships).some((entry) => gone.has(entry.account)))
			.map(([account]) => account);
		await this.reload(...affected);
	}

	stop(): void {
		for (const invite of this.invites) clearTimeout(invite.timer);
		this.invites = [];
	}

	private async search(member: Member, query: unknown): Promise<void> {
		const db = getDb();
		if (!db || typeof query !== 'string') return;
		const wanted = query.trim().slice(0, 40);
		const found =
			wanted.length < SOCIAL.searchMin
				? []
				: await searchTags(db, wanted, member.account, SOCIAL.searchResults);
		const results: Person[] = found;
		this.parties.tell(member, { type: 'socialSearch', query, results });
	}

	/** `member` invites a friend to their party. */
	private async invite(member: Member, to: string): Promise<void> {
		const db = getDb();
		if (!db) return;
		const from = member.account;
		const target = this.parties.find(to);
		let problem: string | null = null;
		if (!(await areFriends(db, from, to))) problem = 'You can only invite friends';
		else if (!target?.connected) problem = 'They are not online';
		else if (target.party === member.party) problem = "They're already in your party";
		else if (this.parties.expedition(target)) problem = 'They are underground';
		else if (target.party.members.length > 1) problem = 'They are already in a party';
		else if (this.parties.expedition(member) || member.party.members.some((m) => m.playerId)) {
			problem = "You can't invite anyone during an expedition";
		} else if (member.party.members.length >= PARTY.maxSize) problem = 'Your party is full';
		if (problem) {
			this.refuse(member, problem);
			return;
		}
		// Asking again starts the invite's time over.
		this.dropInvites((invite) => invite.from === from && invite.to === to);
		const invite: Invite = {
			from,
			to,
			timer: setTimeout(() => {
				this.invites = this.invites.filter((other) => other !== invite);
				this.push(from, to);
			}, PARTY.inviteSeconds * 1000)
		};
		this.invites.push(invite);
		this.push(from, to);
	}

	/** `member` answers the invite `from` sent them. */
	private answerInvite(member: Member, from: unknown, accept: boolean): void {
		const to = member.account;
		const invite = this.invites.find((other) => other.from === from && other.to === to);
		if (!invite) return;
		this.dropInvites((other) => other === invite);
		if (accept) {
			const host = this.parties.find(invite.from);
			const problem = host ? this.parties.join(member, host) : 'That party is gone';
			if (problem) this.refuse(member, problem);
		}
		this.push(invite.from, to);
	}

	private dropInvites(which: (invite: Invite) => boolean): void {
		for (const invite of this.invites) if (which(invite)) clearTimeout(invite.timer);
		this.invites = this.invites.filter((invite) => !which(invite));
	}

	/** Read these accounts' friends again and send each of them (if here) their lists. */
	private async reload(...accounts: string[]): Promise<void> {
		const db = getDb();
		if (!db) return;
		for (const account of accounts) {
			if (!this.parties.find(account)) continue;
			const friendships = await friendsOf(db, account);
			const before = this.known.get(account);
			this.known.set(account, { friendships, sent: before?.sent ?? '' });
		}
		this.push(...accounts);
	}

	/**
	 * These accounts came, went or changed what they are doing: tell them and everyone who has
	 * them as a friend.
	 */
	private presenceChanged(accounts: string[]): void {
		const changed = new Set(accounts);
		// Invites to or from someone who is gone (or went underground) can't be answered, and
		// neither can one to someone who has since joined a party.
		this.dropInvites((invite) =>
			[invite.from, invite.to].some((account) => {
				if (!changed.has(account)) return false;
				const presence = this.parties.presence(account);
				if (presence === 'offline' || presence === 'underground') return true;
				return account === invite.to && presence === 'inParty';
			})
		);
		const affected = new Set(accounts);
		for (const [account, known] of this.known) {
			if (known.friendships.friends.some((friend) => changed.has(friend.account))) {
				affected.add(account);
			}
		}
		this.push(...affected);
		for (const account of accounts) {
			if (!this.parties.find(account)) this.known.delete(account);
		}
	}

	/** Send these accounts their lists, if they are here and anything changed. */
	private push(...accounts: string[]): void {
		for (const account of accounts) {
			const member = this.parties.find(account);
			const known = this.known.get(account);
			if (!member || !known) continue;
			const state = this.state(member, known.friendships);
			const json = JSON.stringify(state);
			if (json === known.sent) continue;
			known.sent = json;
			this.parties.tell(member, { type: 'social', state });
		}
	}

	private state(member: Member, friendships: Friendships): SocialState {
		const me = member.account;
		/** Their gamer tag as it is now, if they are here (it may have changed since it was read). */
		const person = (entry: Tagged): Person => ({
			account: entry.account,
			name: this.parties.find(entry.account)?.name ?? entry.name
		});
		const friend = (account: string): Tagged | undefined =>
			friendships.friends.find((entry) => entry.account === account);
		return {
			friends: friendships.friends.map((entry) => ({
				...person(entry),
				status: this.parties.presence(entry.account),
				withYou: this.parties.find(entry.account)?.party === member.party
			})),
			incoming: friendships.incoming.map(person),
			outgoing: friendships.outgoing.map(person),
			invites: this.invites
				.filter((invite) => invite.to === me)
				.map((invite) => friend(invite.from))
				.filter((entry) => entry !== undefined)
				.map(person),
			invited: this.invites.filter((invite) => invite.from === me).map((invite) => invite.to)
		};
	}

	private refuse(member: Member, reason: string): void {
		this.parties.tell(member, { type: 'partyError', reason });
	}
}

/** Every account on someone's lists. */
function everyone(friendships: Friendships): Tagged[] {
	return [...friendships.friends, ...friendships.incoming, ...friendships.outgoing];
}

/** Whether an invite is between these two accounts, either way round. */
function pair(invite: Invite, a: string, b: string): boolean {
	return (invite.from === a && invite.to === b) || (invite.from === b && invite.to === a);
}
