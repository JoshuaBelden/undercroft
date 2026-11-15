import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PARTY } from '../src/lib/content/party.ts';
import { Parties, type Member } from './parties.ts';
import { Social } from './social.ts';
import { FakeSocket, fakeTime } from './testing/harness.ts';

/**
 * Friendships live in MongoDB; here they are an in-memory book behind the same store functions,
 * so the social logic (lists, presence, invites) runs for real.
 */
const book = vi.hoisted(() => ({
	/** "a|b" with a < b: friends. */
	friends: new Set<string>(),
	/** "from>to": asked, not answered. */
	requests: new Set<string>(),
	tags: new Map<string, string>(),
	fail: false
}));

vi.mock('./db.ts', () => ({ getDb: () => ({}) }));
vi.mock('../src/lib/server/store/friends.ts', () => {
	const key = (a: string, b: string) => [a, b].sort().join('|');
	const tagged = (account: string) => ({ account, name: book.tags.get(account) ?? account });
	const check = () => {
		if (book.fail) throw new Error('database down');
	};
	return {
		FRIEND_ERRORS: {
			self: "You can't add yourself",
			missing: 'No such player',
			already: 'Already'
		},
		friendsOf: async (_db: unknown, account: string) => {
			check();
			const friends = [...book.friends]
				.map((k) => k.split('|'))
				.filter((pair) => pair.includes(account))
				.map((pair) => tagged(pair[0] === account ? pair[1] : pair[0]));
			const requests = [...book.requests].map((r) => r.split('>'));
			return {
				friends,
				incoming: requests.filter(([, to]) => to === account).map(([from]) => tagged(from)),
				outgoing: requests.filter(([from]) => from === account).map(([, to]) => tagged(to))
			};
		},
		areFriends: async (_db: unknown, a: string, b: string) => book.friends.has(key(a, b)),
		requestFriend: async (_db: unknown, from: string, to: string) => {
			if (from === to) return 'self';
			if (!book.tags.has(to)) return 'missing';
			book.requests.add(`${from}>${to}`);
			return null;
		},
		acceptFriend: async (_db: unknown, account: string, from: string) => {
			book.requests.delete(`${from}>${account}`);
			book.friends.add(key(account, from));
			return true;
		},
		removeFriend: async (_db: unknown, a: string, b: string) => {
			book.friends.delete(key(a, b));
			book.requests.delete(`${a}>${b}`);
			book.requests.delete(`${b}>${a}`);
			return true;
		},
		searchTags: async (_db: unknown, query: string, me: string) =>
			[...book.tags]
				.filter(([account, name]) => account !== me && name.includes(query))
				.map(([account, name]) => ({ account, name }))
	};
});

let parties: Parties;
let social: Social;

beforeEach(() => {
	fakeTime();
	book.friends.clear();
	book.requests.clear();
	book.tags.clear();
	book.fail = false;
	parties = new Parties();
	social = new Social(parties);
});
afterEach(() => {
	social.stop();
	parties.stop();
	vi.useRealTimers();
});

async function arrive(name: string): Promise<{ member: Member; socket: FakeSocket }> {
	book.tags.set(`acc-${name}`, name);
	const socket = new FakeSocket();
	const member = parties.connect(socket.ws, {
		account: `acc-${name}`,
		explorer: `exp-${name}`,
		gamerTag: name,
		avatar: null
	});
	await social.connected(member);
	return { member, socket };
}

const lists = (socket: FakeSocket) => socket.last('social')!.state;

async function befriend(a: Member, b: Member): Promise<void> {
	await social.act(a, { kind: 'request', account: b.account });
	await social.act(b, { kind: 'accept', account: a.account });
}

describe('Social', () => {
	it('a request shows on both lists, and accepting makes them friends who see each other', async () => {
		const ann = await arrive('Ann');
		const bob = await arrive('Bob');
		await social.act(ann.member, { kind: 'request', account: 'acc-Bob' });
		expect(lists(ann.socket).outgoing).toEqual([{ account: 'acc-Bob', name: 'Bob' }]);
		expect(lists(bob.socket).incoming).toEqual([{ account: 'acc-Ann', name: 'Ann' }]);
		await social.act(bob.member, { kind: 'accept', account: 'acc-Ann' });
		expect(lists(ann.socket).friends).toEqual([
			{ account: 'acc-Bob', name: 'Bob', status: 'online', withYou: false }
		]);
		expect(social.listed().sort()).toEqual(['acc-Ann', 'acc-Bob']);
	});

	it('refuses requests the store refuses', async () => {
		const ann = await arrive('Ann');
		await social.act(ann.member, { kind: 'request', account: 'acc-Ann' });
		expect(ann.socket.last('partyError')!.reason).toBe("You can't add yourself");
		await social.act(ann.member, { kind: 'request', account: 'acc-Ghost' });
		expect(ann.socket.last('partyError')!.reason).toBe('No such player');
	});

	it('removing a friend takes them off both lists', async () => {
		const ann = await arrive('Ann');
		const bob = await arrive('Bob');
		await befriend(ann.member, bob.member);
		await social.act(bob.member, { kind: 'remove', account: 'acc-Ann' });
		expect(lists(ann.socket).friends).toEqual([]);
		expect(lists(bob.socket).friends).toEqual([]);
	});

	it('searches by gamer tag from two letters', async () => {
		const ann = await arrive('Ann');
		await arrive('Annabel');
		await social.act(ann.member, { kind: 'search', query: 'A' });
		expect(ann.socket.last('socialSearch')!.results).toEqual([]);
		await social.act(ann.member, { kind: 'search', query: 'Anna' });
		expect(ann.socket.last('socialSearch')!.results).toEqual([
			{ account: 'acc-Annabel', name: 'Annabel' }
		]);
	});

	it('a friend’s invite can be accepted to join their party', async () => {
		const ann = await arrive('Ann');
		const bob = await arrive('Bob');
		await befriend(ann.member, bob.member);
		await social.act(ann.member, { kind: 'invite', account: 'acc-Bob' });
		expect(lists(bob.socket).invites).toEqual([{ account: 'acc-Ann', name: 'Ann' }]);
		expect(lists(ann.socket).invited).toEqual(['acc-Bob']);
		await social.act(bob.member, { kind: 'acceptInvite', account: 'acc-Ann' });
		expect(bob.member.party).toBe(ann.member.party);
		expect(lists(ann.socket).friends[0]).toMatchObject({ status: 'inParty', withYou: true });
	});

	it('an invite can be declined, and runs out', async () => {
		const ann = await arrive('Ann');
		const bob = await arrive('Bob');
		await befriend(ann.member, bob.member);
		await social.act(ann.member, { kind: 'invite', account: 'acc-Bob' });
		await social.act(bob.member, { kind: 'declineInvite', account: 'acc-Ann' });
		expect(lists(bob.socket).invites).toEqual([]);
		await social.act(ann.member, { kind: 'invite', account: 'acc-Bob' });
		await vi.advanceTimersByTimeAsync(PARTY.inviteSeconds * 1000 + 10);
		expect(lists(bob.socket).invites).toEqual([]);
		// Answering an invite that is gone does nothing.
		await social.act(bob.member, { kind: 'acceptInvite', account: 'acc-Ann' });
		expect(bob.member.party).not.toBe(ann.member.party);
	});

	it('only invites friends who are online and free', async () => {
		const ann = await arrive('Ann');
		const bob = await arrive('Bob');
		await social.act(ann.member, { kind: 'invite', account: 'acc-Bob' });
		expect(ann.socket.last('partyError')!.reason).toBe('You can only invite friends');
		await befriend(ann.member, bob.member);
		parties.disconnect(bob.member, bob.socket.ws);
		await social.act(ann.member, { kind: 'invite', account: 'acc-Bob' });
		expect(ann.socket.last('partyError')!.reason).toBe('They are not online');
	});

	it('a friend going offline drops their invite and shows on the list', async () => {
		const ann = await arrive('Ann');
		const bob = await arrive('Bob');
		await befriend(ann.member, bob.member);
		await social.act(bob.member, { kind: 'invite', account: 'acc-Ann' });
		parties.disconnect(bob.member, bob.socket.ws);
		expect(lists(ann.socket).invites).toEqual([]);
		expect(lists(ann.socket).friends[0].status).toBe('offline');
	});

	it('forgets deleted accounts', async () => {
		const ann = await arrive('Ann');
		const bob = await arrive('Bob');
		await befriend(ann.member, bob.member);
		book.friends.clear();
		await social.forget(['acc-Bob']);
		expect(lists(ann.socket).friends).toEqual([]);
	});

	it('a store failure is reported, and junk is ignored', async () => {
		const ann = await arrive('Ann');
		book.fail = true;
		await social.act(ann.member, { kind: 'refresh' });
		expect(ann.socket.last('partyError')!.reason).toBe('Something went wrong. Try again');
		await social.act(ann.member, null as never);
		await social.act(ann.member, { kind: 'invite', account: 5 } as never);
	});
});
