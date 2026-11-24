import type { IncomingMessage } from 'node:http';
import { DEFAULT_LOOK } from '../src/lib/shared/player/look.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PARTY } from '../src/lib/content/party.ts';
import { emptyInventory, newStack } from '../src/lib/shared/items/inventory.ts';
import { PROTOCOL_VERSION } from '../src/lib/shared/constants.ts';
import { GUEST_HEADERS } from '../src/lib/server/local.ts';
import { serve } from './connection.ts';
import {
	attachGuest,
	forgetGuest,
	guestReturn,
	guestTake,
	vaultAnswer,
	VAULT_TIMEOUT_MS
} from './guests.ts';
import { Parties } from './parties.ts';
import { Social } from './social.ts';
import { guestOf } from './start.ts';
import { FakeSocket, fakeTime } from './testing/harness.ts';

/**
 * Co-op guests on a desktop game (docs/dev/hosting.md): who they are, the host's party, and
 * their vault, the belongings they bring from their own save.
 */

// The desktop game's own player signs in with a ticket; the real lookup needs a database.
vi.mock('./accounts.ts', () => ({
	identify: vi.fn(async (ticket: unknown) =>
		ticket === 'host-ticket'
			? { account: 'acc-host', explorer: 'exp-host', gamerTag: 'Host', avatar: null }
			: null
	),
	currentProfile: vi.fn(async () => null)
}));

const STEAM_ID = '76561197960287930';
const KEY = 'k'.repeat(64);

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
	forgetGuest(`steam:${STEAM_ID}`);
	vi.useRealTimers();
});

async function host(): Promise<FakeSocket> {
	const socket = new FakeSocket();
	serve(socket.ws, parties, social);
	socket.receive({ type: 'hello', protocol: PROTOCOL_VERSION, ticket: 'host-ticket' });
	await vi.advanceTimersByTimeAsync(0);
	return socket;
}

async function guest(name = 'Friend'): Promise<FakeSocket> {
	const socket = new FakeSocket();
	serve(socket.ws, parties, social, { steamId: STEAM_ID });
	socket.receive({ type: 'hello', protocol: PROTOCOL_VERSION, ticket: '', name });
	await vi.advanceTimersByTimeAsync(0);
	return socket;
}

const request = (headers: Record<string, string>) => ({ headers }) as unknown as IncomingMessage;

describe('who a guest is', () => {
	it('comes from the tunnel, with the host key and a SteamID', () => {
		expect(guestOf(request({}), KEY)).toBeNull();
		expect(
			guestOf(request({ [GUEST_HEADERS.hostKey]: KEY, [GUEST_HEADERS.steamId]: STEAM_ID }), KEY)
		).toEqual({ steamId: STEAM_ID });
	});

	it('is refused without the right key, a real SteamID, or on a server with no guests', () => {
		const wrong = 'x'.repeat(64);
		expect(
			guestOf(request({ [GUEST_HEADERS.hostKey]: wrong, [GUEST_HEADERS.steamId]: STEAM_ID }), KEY)
		).toBe('refused');
		expect(
			guestOf(request({ [GUEST_HEADERS.hostKey]: KEY, [GUEST_HEADERS.steamId]: 'me' }), KEY)
		).toBe('refused');
		expect(guestOf(request({ [GUEST_HEADERS.steamId]: STEAM_ID }), KEY)).toBe('refused');
		expect(
			guestOf(
				request({ [GUEST_HEADERS.hostKey]: KEY, [GUEST_HEADERS.steamId]: STEAM_ID }),
				undefined
			)
		).toBe('refused');
	});
});

describe("the host's party", () => {
	it('a guest joins it on arrival, under the name they send', async () => {
		const h = await host();
		const g = await guest('My Friend');
		const party = g.last('party')!.party;
		expect(party.members.map((m) => m.name)).toEqual(['Host', 'My Friend']);
		expect(h.last('party')!.party.members).toHaveLength(2);
	});

	it('a guest is sent home when the host is not there', async () => {
		const g = await guest();
		expect(g.last('reject')!.reason).toBe("The host isn't in the game right now");
	});

	it('a guest who leaves the party goes home; one the host removes is told so', async () => {
		const h = await host();
		const g = await guest();
		g.receive({ type: 'leaveParty' });
		expect(g.last('reject')!.reason).toBe('You left the party');
		expect(h.last('party')!.party.members).toHaveLength(1);

		const again = await guest();
		const id = again.last('party')!.party.members[1].id;
		h.receive({ type: 'kick', member: id });
		expect(again.last('reject')!.reason).toBe('Host removed you from the party');
	});

	it("a guest can't use the host's friends list", async () => {
		await host();
		const g = await guest();
		g.receive({ type: 'social', action: { kind: 'search', query: 'a' } });
		expect(g.last('socialSearch')).toBeUndefined();
	});
});

describe('the vault', () => {
	/** Host and guest both ready with the Affliction chosen: the countdown runs. */
	async function readyBoth(h: FakeSocket, g: FakeSocket): Promise<void> {
		h.receive({ type: 'affliction', id: 'rumors' });
		h.receive({ type: 'ready', ready: true });
		g.receive({ type: 'ready', ready: true });
		await vi.advanceTimersByTimeAsync(0);
	}

	it("locks the guest's hub when they are ready, then asks for their kit at the descent", async () => {
		const h = await host();
		const g = await guest();
		await readyBoth(h, g);
		expect(g.all('vault').some((m) => m.op === 'lock' && m.ready)).toBe(true);
		await vi.advanceTimersByTimeAsync(PARTY.countdownSeconds * 1000 + 10);
		const take = g.all('vault').find((m) => m.op === 'take');
		expect(take).toBeDefined();

		const kit = emptyInventory();
		kit.equipment.primary = newStack('knife');
		g.receive({ type: 'vault', id: take!.id, kit, owned: ['knife'], markWheel: null });
		await vi.advanceTimersByTimeAsync(100);
		const member = [...parties['byAccount'].values()].find((m) => m.remote)!;
		const expedition = parties.expedition(member)!;
		const player = expedition.session['players'].get(expedition.playerId)!;
		expect(player.state.inventory.equipment.primary?.item).toBe('knife');
	});

	it('a guest whose game never answers goes down with nothing', async () => {
		const h = await host();
		const g = await guest();
		await readyBoth(h, g);
		await vi.advanceTimersByTimeAsync(PARTY.countdownSeconds * 1000 + VAULT_TIMEOUT_MS + 100);
		const member = [...parties['byAccount'].values()].find((m) => m.remote)!;
		const expedition = parties.expedition(member)!;
		const player = expedition.session['players'].get(expedition.playerId)!;
		expect(player.state.inventory).toEqual(emptyInventory());
	});

	it('a kit that is too good is cut down to what the rules allow', async () => {
		const socket = new FakeSocket();
		attachGuest(`steam:${STEAM_ID}`, socket.ws);
		const taking = guestTake(`steam:${STEAM_ID}`, 's1');
		const ask = socket.last('vault')!;
		const kit = {
			...emptyInventory(),
			equipment: { primary: { item: 'knife', count: 50 }, secondary: null, defense: null }
		};
		// The answer comes in through the connection in real use; here it goes straight in.
		vaultAnswer(`steam:${STEAM_ID}`, {
			type: 'vault',
			id: ask.id,
			kit,
			owned: 'nope',
			markWheel: ['?'],
			look: { body: 'ogre', wear: { hair: 'hair-afro' } }
		});
		const reply = await taking;
		expect(reply.kit.equipment.primary).toBeNull();
		expect(reply.owned.size).toBe(0);
		expect(reply.markWheel).toBeNull();
		// What a guest wears is cleaned like any look: unknown parts fall back to the default.
		expect(reply.look.body).toBe(DEFAULT_LOOK.body);
		expect(reply.look.wear.hair).toBe('hair-afro');
	});

	it('what a guest carried out waits for them if their connection is down', () => {
		const away = new FakeSocket();
		attachGuest(`steam:${STEAM_ID}`, away.ws);
		away.close();
		const carried = emptyInventory();
		guestReturn(`steam:${STEAM_ID}`, 's1', carried);
		// They left the party meanwhile: still kept until it reaches them.
		forgetGuest(`steam:${STEAM_ID}`);
		const back = new FakeSocket();
		attachGuest(`steam:${STEAM_ID}`, back.ws);
		expect(back.last('vault')).toMatchObject({ op: 'return', session: 's1', carried });
	});
});

describe('the suspension check', () => {
	it('leaves guests out: they have no account here, so they would look deleted', async () => {
		await host();
		await guest();
		expect(parties.accounts()).toEqual(['acc-host']);
	});
});
