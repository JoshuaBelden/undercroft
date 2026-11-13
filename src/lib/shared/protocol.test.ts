import { describe, expect, it } from 'vitest';
import { allReady, type PartyState } from './party/types.ts';
import { decodeClient, decodeServer, encode } from './protocol.ts';

describe('protocol', () => {
	it('round-trips a message', () => {
		const message = { type: 'ping', clientTime: 12 } as const;
		expect(decodeClient(encode(message))).toEqual(message);
	});

	it('only accepts the message types each side may send', () => {
		expect(decodeClient(JSON.stringify({ type: 'tick' }))).toBeNull();
		expect(decodeServer(JSON.stringify({ type: 'hello' }))).toBeNull();
		expect(decodeServer(JSON.stringify({ type: 'pong', clientTime: 1, serverTime: 2 }))).toEqual({
			type: 'pong',
			clientTime: 1,
			serverTime: 2
		});
	});

	it('rejects malformed messages', () => {
		for (const raw of ['', 'not json', 'null', '42', '[]', '{}', '{"type":5}']) {
			expect(decodeClient(raw), raw).toBeNull();
		}
	});
});

describe('allReady', () => {
	const member = (ready: boolean, connected = true) => ({
		id: 'm',
		account: 'a',
		name: 'n',
		ready,
		inExpedition: false,
		connected
	});
	const party = (over: Partial<PartyState>): PartyState => ({
		leader: 'm',
		affliction: 'gloaming',
		progress: null,
		launchIn: null,
		members: [member(true)],
		expedition: false,
		...over
	});

	it('needs an Affliction, everyone here and ready, and nobody underground', () => {
		expect(allReady(party({}))).toBe(true);
		expect(allReady(party({ affliction: null }))).toBe(false);
		expect(allReady(party({ expedition: true }))).toBe(false);
		expect(allReady(party({ members: [] }))).toBe(false);
		expect(allReady(party({ members: [member(true), member(false)] }))).toBe(false);
		expect(allReady(party({ members: [member(true, false)] }))).toBe(false);
	});
});
