import { describe, expect, it } from 'vitest';
import { cleanPersona, steamEnabled, verifySteamTicket, type SteamConfig } from './steam.ts';

const STEAM_ID = '76561197960287930';
const TICKET = '14000000a1b2c3d4e5f60718293a4b5c';

/** A fake Steam Web API that answers with `body` (and records what it was asked). */
function steam(body: unknown, status = 200): { fetch: typeof fetch; asked: URL[] } {
	const asked: URL[] = [];
	const fake = (async (input: string | URL | Request) => {
		asked.push(new URL(String(input)));
		return new Response(JSON.stringify(body), { status });
	}) as typeof fetch;
	return { fetch: fake, asked };
}

const ok = (params: Record<string, unknown> = {}): unknown => ({
	response: {
		params: {
			result: 'OK',
			steamid: STEAM_ID,
			ownersteamid: STEAM_ID,
			vacbanned: false,
			publisherbanned: false,
			...params
		}
	}
});

const config = (over: Partial<SteamConfig> = {}): SteamConfig => ({
	key: 'publisher-key',
	appId: 480,
	devTrust: false,
	devMode: false,
	...over
});

describe('verifySteamTicket', () => {
	it('asks Steam about the ticket, for our app and identity, and returns the SteamID', async () => {
		const api = steam(ok());
		expect(await verifySteamTicket(config({ fetch: api.fetch }), TICKET)).toEqual({
			steamId: STEAM_ID
		});
		const [url] = api.asked;
		expect(url.host).toBe('partner.steam-api.com');
		expect(url.searchParams.get('appid')).toBe('480');
		expect(url.searchParams.get('ticket')).toBe(TICKET);
		expect(url.searchParams.get('identity')).toBe('undercroft');
		expect(url.searchParams.get('key')).toBe('publisher-key');
	});

	it('refuses a ticket Steam rejects', async () => {
		const api = steam({ response: { error: { errorcode: 101, errordesc: 'Invalid ticket' } } });
		expect(await verifySteamTicket(config({ fetch: api.fetch }), TICKET)).toEqual({
			error: 'ticket'
		});
	});

	it('refuses banned accounts', async () => {
		for (const ban of [{ vacbanned: true }, { publisherbanned: true }]) {
			const api = steam(ok(ban));
			expect(await verifySteamTicket(config({ fetch: api.fetch }), TICKET)).toEqual({
				error: 'banned'
			});
		}
	});

	it('refuses an answer without a real SteamID', async () => {
		const api = steam(ok({ steamid: 'nope' }));
		expect(await verifySteamTicket(config({ fetch: api.fetch }), TICKET)).toEqual({
			error: 'ticket'
		});
	});

	it('says Steam is unreachable when it is down or the request fails', async () => {
		const down = steam({}, 503);
		expect(await verifySteamTicket(config({ fetch: down.fetch }), TICKET)).toEqual({
			error: 'unreachable'
		});
		const broken = (async () => {
			throw new Error('offline');
		}) as typeof fetch;
		expect(await verifySteamTicket(config({ fetch: broken }), TICKET)).toEqual({
			error: 'unreachable'
		});
	});

	it('never asks Steam about something that is not a ticket', async () => {
		const api = steam(ok());
		for (const bad of [undefined, 42, '', 'not hex!', 'ab', 'a'.repeat(5000)]) {
			expect(await verifySteamTicket(config({ fetch: api.fetch }), bad)).toEqual({
				error: 'ticket'
			});
		}
		expect(api.asked).toHaveLength(0);
	});

	it('ignores the SteamID the app claims once there is a key', async () => {
		const api = steam(ok());
		const result = await verifySteamTicket(
			config({ fetch: api.fetch, devTrust: true, devMode: true }),
			TICKET,
			'76561190000000000'
		);
		expect(result).toEqual({ steamId: STEAM_ID });
	});
});

describe('trusted local testing', () => {
	it('believes the claimed SteamID only with dev trust and dev mode, and no key', async () => {
		const trusted = config({ key: '', devTrust: true, devMode: true });
		expect(await verifySteamTicket(trusted, TICKET, STEAM_ID)).toEqual({ steamId: STEAM_ID });
		expect(await verifySteamTicket(trusted, TICKET, 'not-a-steam-id')).toEqual({
			error: 'ticket'
		});
	});

	it('is off outside dev mode, even when asked for', async () => {
		const players = config({ key: '', devTrust: true, devMode: false });
		expect(steamEnabled(players)).toBe(false);
		expect(await verifySteamTicket(players, TICKET, STEAM_ID)).toEqual({ error: 'off' });
	});

	it('is off without a key or dev trust', async () => {
		const off = config({ key: '', devTrust: false, devMode: true });
		expect(steamEnabled(off)).toBe(false);
		expect(await verifySteamTicket(off, TICKET, STEAM_ID)).toEqual({ error: 'off' });
	});
});

describe('cleanPersona', () => {
	it('keeps a Steam name to show, without control characters', () => {
		expect(cleanPersona('  Gaben  ')).toBe('Gaben');
		expect(cleanPersona('a\u0000b\nc\u007f')).toBe('abc');
		expect(cleanPersona('x'.repeat(50))).toHaveLength(32);
	});

	it('falls back when there is nothing usable', () => {
		expect(cleanPersona(undefined)).toBe('Steam player');
		expect(cleanPersona('\u0001\u0002')).toBe('Steam player');
	});
});
