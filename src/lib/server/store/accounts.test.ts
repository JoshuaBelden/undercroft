import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from 'mongodb';
import { LocalDb } from '../localdb/LocalDb.ts';
import {
	accountView,
	addEmail,
	createAccount,
	ensureIndexes,
	getAccount,
	setGamerTag,
	throttleKey,
	verifyLogin,
	type AccountDoc
} from './accounts.ts';
import {
	accountBySteam,
	finishSignup,
	linkSteam,
	startSteamSignup,
	unlinkDiscord,
	unlinkSteam
} from './auth.ts';

/**
 * The account store on LocalDb (the desktop app's save, and an in-memory database here): the
 * same code that runs on MongoDB. See docs/dev/testing.md#the-store.
 */

let db: Db;
beforeEach(async () => {
	db = new LocalDb().asDb();
	await ensureIndexes(db);
});

const STEAM = { id: '76561197960287930', persona: 'Gaben' };

async function made(input: Parameters<typeof createAccount>[1]): Promise<AccountDoc> {
	const result = await createAccount(db, input);
	if ('error' in result) throw new Error(result.error);
	return result.account;
}

describe('creating accounts', () => {
	it('needs an email and password, unless it signs in with Discord or Steam', async () => {
		expect(await createAccount(db, { gamerTag: 'Nobody' })).toEqual({ error: 'email' });
		expect(await createAccount(db, { email: 'a@b.co', gamerTag: 'NoPass' })).toEqual({
			error: 'password'
		});
		const steam = await made({ gamerTag: 'Steamer', steam: STEAM });
		expect(steam.email).toBeUndefined();
		expect(steam.steam).toEqual(STEAM);
	});

	it('still checks an email given with Steam', async () => {
		expect(await createAccount(db, { email: 'nope', gamerTag: 'Steamer', steam: STEAM })).toEqual({
			error: 'email'
		});
	});

	it('keeps gamer tags, emails and Steam accounts unique', async () => {
		await made({ email: 'a@b.co', password: 'longenough1', gamerTag: 'Taken' });
		expect(
			await createAccount(db, { email: 'c@d.co', password: 'longenough1', gamerTag: 'TAKEN' })
		).toEqual({ error: 'tagTaken' });
		expect(
			await createAccount(db, { email: 'A@B.CO', password: 'longenough1', gamerTag: 'Other' })
		).toEqual({ error: 'emailTaken' });
		await made({ gamerTag: 'First Steam', steam: STEAM });
		expect(await createAccount(db, { gamerTag: 'Second Steam', steam: STEAM })).toEqual({
			error: 'steamTaken'
		});
	});

	it('lets any number of accounts have no email', async () => {
		await made({ gamerTag: 'One', steam: { id: '76561197960287931', persona: 'a' } });
		await made({ gamerTag: 'Two', steam: { id: '76561197960287932', persona: 'b' } });
		expect(
			await setGamerTag(db, (await accountBySteam(db, '76561197960287932'))!._id, 'Two Two')
		).toEqual({
			gamerTag: 'Two Two'
		});
	});

	it('signs in with the email and password', async () => {
		await made({ email: 'a@b.co', password: 'longenough1', gamerTag: 'Pass' });
		expect((await verifyLogin(db, 'A@b.co', 'longenough1'))?.gamerTag).toBe('Pass');
		expect(await verifyLogin(db, 'a@b.co', 'wrong-password')).toBeNull();
	});
});

describe('an account made with Steam', () => {
	it('is made through a sign-up that waits for its gamer tag', async () => {
		const signup = await startSteamSignup(db, STEAM);
		// A Steam sign-up can't be finished as a Discord one.
		expect(await finishSignup(db, signup, 'Mine', 'discord')).toEqual({ error: 'expired' });
		const result = await finishSignup(db, signup, 'Mine', 'steam');
		expect('account' in result && result.account.steam).toEqual(STEAM);
		expect((await accountBySteam(db, STEAM.id))?.gamerTag).toBe('Mine');
	});

	it('can add an email once, and is shown without one until then', async () => {
		const account = await made({ gamerTag: 'Steamer', steam: STEAM });
		expect((await accountView(db, account)).email).toBeNull();
		expect(throttleKey(account)).toBe(account._id);
		expect(await addEmail(db, account._id, 'not an email')).toBe('email');
		expect(await addEmail(db, account._id, 'S@team.com')).toBeNull();
		expect(await addEmail(db, account._id, 'other@team.com')).toBe('hasEmail');
		const updated = (await getAccount(db, account._id))!;
		expect(updated.email).toBe('s@team.com');
		expect(throttleKey(updated)).toBe('s@team.com');
	});

	it("can't take an email another account has", async () => {
		await made({ email: 'used@x.com', password: 'longenough1', gamerTag: 'Owner' });
		const account = await made({ gamerTag: 'Steamer', steam: STEAM });
		expect(await addEmail(db, account._id, 'used@x.com')).toBe('emailTaken');
	});
});

describe('linking and unlinking', () => {
	it('links Steam to one account only', async () => {
		const a = await made({ email: 'a@b.co', password: 'longenough1', gamerTag: 'Alpha' });
		const b = await made({ email: 'c@d.co', password: 'longenough1', gamerTag: 'Bravo' });
		expect(await linkSteam(db, a._id, STEAM)).toBeNull();
		expect(await linkSteam(db, a._id, STEAM)).toBeNull();
		expect(await linkSteam(db, b._id, STEAM)).toBe('steamTaken');
	});

	it('never leaves an account with no way in', async () => {
		const steamOnly = await made({ gamerTag: 'Only Steam', steam: STEAM });
		expect(await unlinkSteam(db, steamOnly._id)).toBe('noOtherWay');

		const discord = { id: '123', username: 'disc' };
		const both = await made({
			email: 'd@e.co',
			gamerTag: 'Both',
			discord,
			steam: { id: '76561197960287939', persona: 'x' }
		});
		// Discord and Steam, no password: either can go, but not both.
		expect(await unlinkDiscord(db, both._id)).toBeNull();
		expect(await unlinkSteam(db, both._id)).toBe('noOtherWay');

		const withPassword = await made({
			email: 'p@q.co',
			password: 'longenough1',
			gamerTag: 'Password'
		});
		await linkSteam(db, withPassword._id, { id: '76561197960287940', persona: 'p' });
		expect(await unlinkSteam(db, withPassword._id)).toBeNull();
		expect((await getAccount(db, withPassword._id))?.steam).toBeUndefined();
	});
});
