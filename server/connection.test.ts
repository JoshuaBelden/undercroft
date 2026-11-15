import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PARTY } from '../src/lib/content/party.ts';
import { PROTOCOL_VERSION } from '../src/lib/shared/constants.ts';
import { serve } from './connection.ts';
import { Parties } from './parties.ts';
import { Social } from './social.ts';
import { FakeSocket, fakeTime } from './testing/harness.ts';

// Who a ticket is: the real lookup needs MongoDB.
vi.mock('./accounts.ts', () => ({
	identify: vi.fn(async (ticket: unknown) =>
		typeof ticket === 'string' && ticket.startsWith('ok-')
			? { account: `acc-${ticket}`, explorer: `exp-${ticket}`, gamerTag: ticket, avatar: null }
			: null
	),
	currentProfile: vi.fn(async () => ({ gamerTag: 'Renamed', avatar: '/avatars/x?v=2' }))
}));

let parties: Parties;
let social: Social;

beforeEach(() => {
	fakeTime();
	parties = new Parties();
	social = new Social(parties);
});
afterEach(() => {
	parties.stop();
	social.stop();
	vi.useRealTimers();
});

/** A connection that has said hello with this ticket. */
async function hello(ticket: string): Promise<FakeSocket> {
	const socket = new FakeSocket();
	serve(socket.ws, parties, social);
	socket.receive({ type: 'hello', protocol: PROTOCOL_VERSION, ticket });
	await vi.advanceTimersByTimeAsync(0);
	return socket;
}

describe('a connection', () => {
	it('is rejected for the wrong protocol or a bad ticket', async () => {
		const old = new FakeSocket();
		serve(old.ws, parties, social);
		old.receive({ type: 'hello', protocol: PROTOCOL_VERSION - 1, ticket: 'ok-a' });
		expect(old.last('reject')!.reason).toBe('Protocol version mismatch');
		const stranger = await hello('bad');
		expect(stranger.last('reject')!.reason).toBe('Sign in to play');
	});

	it('answers pings even before hello, and ignores junk', () => {
		const socket = new FakeSocket();
		serve(socket.ws, parties, social);
		socket.receive('not json');
		socket.receive({ type: 'nonsense' });
		socket.receive({ type: 'ready', ready: true });
		socket.receive({ type: 'ping', clientTime: 5 });
		expect(socket.sent).toEqual([{ type: 'pong', clientTime: 5, serverTime: Date.now() }]);
	});

	it('after hello, gets a party and routes party messages', async () => {
		const socket = await hello('ok-a');
		expect(socket.last('party')!.party.members[0].name).toBe('ok-a');
		socket.receive({ type: 'affliction', id: 'gloaming' });
		expect(socket.last('party')!.party.affliction).toBe('gloaming');
		socket.receive({ type: 'ready', ready: true });
		await vi.advanceTimersByTimeAsync(0);
		expect(socket.last('party')!.party.members[0].ready).toBe(true);
		socket.receive({ type: 'ready', ready: false });
		socket.receive({ type: 'kick', member: 'nobody' });
		expect(socket.last('partyError')!.reason).toBe('They are not in your party');
		socket.receive({ type: 'profile' });
		await vi.advanceTimersByTimeAsync(0);
		expect(socket.last('party')!.party.members[0].name).toBe('Renamed');
		expect(socket.last('party')!.party.members[0].avatar).toBe('/avatars/x?v=2');
		socket.receive({ type: 'resetAffliction', id: 'gloaming' });
		await vi.advanceTimersByTimeAsync(0);
		expect(socket.last('afflictionReset')).toBeDefined();
		socket.receive({ type: 'leaveParty' });
		socket.receive({ type: 'social', action: { kind: 'refresh' } });
		// A second hello changes nothing.
		socket.receive({ type: 'hello', protocol: PROTOCOL_VERSION, ticket: 'ok-b' });
		await vi.advanceTimersByTimeAsync(0);
		expect(parties.find('acc-ok-b')).toBeUndefined();
	});

	it('routes expedition messages once underground', async () => {
		const socket = await hello('ok-a');
		socket.receive({ type: 'affliction', id: 'gloaming' });
		socket.receive({ type: 'ready', ready: true });
		await vi.advanceTimersByTimeAsync(PARTY.countdownSeconds * 1000 + 100);
		expect(socket.last('welcome')).toBeDefined();
		const member = parties.find('acc-ok-a')!;
		const { session, playerId } = parties.expedition(member)!;
		socket.receive({ type: 'input', frames: [{ seq: 0 }] });
		expect(session['players'].get(playerId)!.queue).toHaveLength(1);
		socket.receive({
			type: 'inventory',
			action: { kind: 'quick', from: { area: 'backpack', index: 0 } }
		});
		socket.receive({ type: 'mark', symbol: 'up', position: [0, 0, 0], normal: [0, 0, 1] });
		socket.receive({ type: 'closeCrate' });
		expect(socket.last('crate')!.id).toBeNull();
		socket.receive({ type: 'admin', command: null });
		socket.receive({ type: 'admin', command: { kind: 'godMode', enabled: true } });
		socket.receive({ type: 'stopSpectating' });
		socket.receive({ type: 'abandon' });
		expect(socket.last('abandoned')).toBeDefined();
	});

	it('a message that throws is reported to that player', async () => {
		const socket = await hello('ok-a');
		vi.spyOn(parties, 'leave').mockImplementation(() => {
			throw new Error('boom');
		});
		socket.receive({ type: 'leaveParty' });
		await vi.advanceTimersByTimeAsync(0);
		expect(socket.last('serverError')!.message).toContain('boom');
	});

	it('closing holds the player’s place', async () => {
		const socket = await hello('ok-a');
		socket.hangUp();
		expect(parties.find('acc-ok-a')!.connected).toBe(false);
	});
});
