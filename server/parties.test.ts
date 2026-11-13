import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PARTY } from '../src/lib/content/party.ts';
import { Parties, type Member } from './parties.ts';
import { FakeSocket, fakeTime } from './testing/harness.ts';

let parties: Parties;

beforeEach(() => {
	fakeTime();
	parties = new Parties();
});
afterEach(() => {
	parties.stop();
	vi.useRealTimers();
});

/** A player connecting, with their socket. */
function connect(name: string, socket = new FakeSocket()): { member: Member; socket: FakeSocket } {
	const member = parties.connect(socket.ws, {
		account: `acc-${name}`,
		explorer: `exp-${name}`,
		gamerTag: name
	});
	return { member, socket };
}

function partyOf(socket: FakeSocket) {
	return socket.last('party')!.party;
}

function errorOf(socket: FakeSocket): string | undefined {
	return socket.last('partyError')?.reason;
}

/** Wait out the countdown and the descent (loadouts are fetched asynchronously). */
async function descend(): Promise<void> {
	await vi.advanceTimersByTimeAsync(PARTY.countdownSeconds * 1000 + 100);
}

/** Two players in one party with the Affliction chosen. */
function pair() {
	const host = connect('Host');
	const guest = connect('Guest');
	expect(parties.join(guest.member, host.member)).toBeNull();
	parties.setAffliction(host.member, 'gloaming');
	return { host, guest };
}

describe('Parties', () => {
	it('everyone starts in a party of their own, as its host', () => {
		const { member, socket } = connect('Solo');
		const party = partyOf(socket);
		expect(party.leader).toBe(member.id);
		expect(party.members.map((m) => m.name)).toEqual(['Solo']);
		expect(parties.presence('acc-Solo')).toBe('online');
		expect(parties.census()).toEqual({ online: 1, parties: 1, expeditions: 0, underground: 0 });
		expect(parties.accounts()).toEqual(['acc-Solo']);
	});

	it('joining moves a player into the host’s party, and leaving gives them their own again', () => {
		const { host, guest } = pair();
		expect(partyOf(host.socket).members).toHaveLength(2);
		expect(parties.presence('acc-Guest')).toBe('inParty');
		expect(parties.join(guest.member, host.member)).toBe("You're already in that party");
		parties.leave(guest.member);
		expect(partyOf(guest.socket).members).toHaveLength(1);
		expect(partyOf(host.socket).members).toHaveLength(1);
	});

	it('a full party takes nobody else', () => {
		const host = connect('Host');
		for (let i = 1; i < PARTY.maxSize; i++) parties.join(connect(`P${i}`).member, host.member);
		expect(parties.join(connect('Late').member, host.member)).toBe('That party is full');
	});

	it('only the host chooses the Affliction, and only a real one', () => {
		const { host, guest } = pair();
		parties.setAffliction(guest.member, 'gloaming');
		expect(errorOf(guest.socket)).toBe('Only the host chooses the Affliction');
		parties.setAffliction(host.member, 'no-such');
		expect(errorOf(host.socket)).toBe('No such Affliction');
		expect(partyOf(host.socket).affliction).toBe('gloaming');
	});

	it('the host can remove someone, and nobody else can', () => {
		const { host, guest } = pair();
		parties.kick(guest.member, host.member.id);
		expect(errorOf(guest.socket)).toBe('Only the host can remove someone from the party');
		parties.kick(host.member, 'nobody');
		expect(errorOf(host.socket)).toBe('They are not in your party');
		parties.kick(host.member, guest.member.id);
		expect(errorOf(guest.socket)).toBe('Host removed you from the party');
		expect(partyOf(guest.socket).members).toHaveLength(1);
	});

	it('readying needs an Affliction; once everyone is ready the countdown starts and stops', async () => {
		const solo = connect('Solo');
		await parties.setReady(solo.member, true);
		expect(errorOf(solo.socket)).toBe('No Affliction has been chosen yet');
		const { host, guest } = pair();
		await parties.setReady(host.member, true);
		expect(partyOf(host.socket).launchIn).toBeNull();
		await parties.setReady(guest.member, true);
		expect(partyOf(host.socket).launchIn).toBeGreaterThan(0);
		await parties.setReady(guest.member, false);
		expect(partyOf(host.socket).launchIn).toBeNull();
		// Changing the Affliction un-readies everyone.
		await parties.setReady(guest.member, true);
		parties.setAffliction(host.member, 'gloaming');
		expect(partyOf(host.socket).members.every((m) => m.ready)).toBe(true);
	});

	it('when the countdown runs out the whole party goes down together', async () => {
		const { host, guest } = pair();
		await parties.setReady(host.member, true);
		await parties.setReady(guest.member, true);
		await descend();
		expect(host.socket.last('welcome')).toBeDefined();
		expect(guest.socket.last('welcome')).toBeDefined();
		expect(partyOf(host.socket).expedition).toBe(true);
		expect(parties.presence('acc-Host')).toBe('underground');
		expect(parties.census().underground).toBe(2);
		const e = parties.expedition(host.member)!;
		expect(e.session.playerCount).toBe(2);
		// Nothing about the party changes while it is underground.
		await parties.setReady(host.member, true);
		parties.setAffliction(host.member, 'gloaming');
		expect(errorOf(host.socket)).toBe('An expedition is already under way');
		parties.kick(host.member, guest.member.id);
		expect(errorOf(host.socket)).toBe("You can't remove anyone during an expedition");
		expect(parties.join(connect('Late').member, host.member)).toBe('That party is underground');
		parties.leave(guest.member);
		expect(partyOf(host.socket).members).toHaveLength(2);
	});

	it('the party is back on the surface when everyone has left the expedition', async () => {
		const { host, guest } = pair();
		await parties.setReady(host.member, true);
		await parties.setReady(guest.member, true);
		await descend();
		const { session } = parties.expedition(host.member)!;
		session.abandon(parties.expedition(host.member)!.playerId);
		expect(partyOf(guest.socket).expedition).toBe(true);
		session.abandon(parties.expedition(guest.member)!.playerId);
		expect(partyOf(guest.socket).expedition).toBe(false);
		expect(parties.expedition(guest.member)).toBeNull();
	});

	it('a dropped player keeps their place for a while, and a new connection takes it back', async () => {
		const { host, guest } = pair();
		parties.disconnect(guest.member, guest.socket.ws);
		expect(partyOf(host.socket).members.find((m) => m.name === 'Guest')!.connected).toBe(false);
		expect(parties.presence('acc-Guest')).toBe('offline');
		const back = connect('Guest');
		expect(back.member).toBe(guest.member);
		expect(partyOf(back.socket).members).toHaveLength(2);
		// The old socket closing late is not them leaving.
		parties.disconnect(guest.member, guest.socket.ws);
		expect(guest.member.connected).toBe(true);
		parties.disconnect(guest.member, back.socket.ws);
		await vi.advanceTimersByTimeAsync(PARTY.lobbyGraceSeconds * 1000 + 100);
		expect(partyOf(host.socket).members).toHaveLength(1);
		expect(parties.find('acc-Guest')).toBeUndefined();
	});

	it('connecting from a second tab closes the first', () => {
		const first = connect('Solo');
		const second = connect('Solo');
		expect(second.member).toBe(first.member);
		expect(first.socket.last('reject')!.reason).toBe('You connected from somewhere else');
		expect(first.socket.readyState).not.toBe(first.socket.OPEN);
	});

	it('a dropped player underground rejoins their expedition', async () => {
		const { host, guest } = pair();
		await parties.setReady(host.member, true);
		await parties.setReady(guest.member, true);
		await descend();
		parties.disconnect(guest.member, guest.socket.ws);
		const back = connect('Guest');
		expect(back.socket.last('welcome')!.resumed).toBe(true);
		parties.stopSpectating(back.member);
	});

	it('an expelled account is told why and leaves at once', () => {
		const { host, guest } = pair();
		parties.expel('acc-Guest', 'Suspended');
		expect(guest.socket.last('reject')!.reason).toBe('Suspended');
		expect(partyOf(host.socket).members).toHaveLength(1);
		parties.expel('acc-Nobody', 'x');
	});

	it('renaming tells the party', () => {
		const { host, guest } = pair();
		parties.rename(guest.member, 'Renamed');
		expect(partyOf(host.socket).members.map((m) => m.name)).toContain('Renamed');
	});

	it('resetting an Affliction is refused for a bad id and underground, and told when done', async () => {
		const { host, guest } = pair();
		await parties.resetAffliction(host.member, 'no-such');
		expect(errorOf(host.socket)).toBe('No such Affliction');
		await parties.resetAffliction(host.member, 'gloaming');
		expect(host.socket.last('afflictionReset')!.id).toBe('gloaming');
		await parties.setReady(host.member, true);
		await parties.setReady(guest.member, true);
		await descend();
		await parties.resetAffliction(host.member, 'gloaming');
		expect(errorOf(host.socket)).toBe('An expedition is under way');
	});

	it('tells friends when presence changes', () => {
		const presence = vi.fn();
		parties.onPresence = presence;
		connect('Solo');
		expect(presence).toHaveBeenCalledWith(['acc-Solo']);
		parties.tell(parties.find('acc-Solo')!, { type: 'partyError', reason: 'hi' });
	});
});
