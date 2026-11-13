import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addItem, emptyInventory, newStack } from '../src/lib/shared/items/inventory.ts';
import { identify, currentTag } from './accounts.ts';
import { giveBack, lockKit, owned, releaseAll, takeKit } from './belongings.ts';
import { crashMessage, serverCrash } from './errors.ts';
import { Progress } from './progress.ts';
import { carriedValue, logRun, watchStatus } from './stats.ts';
import { watchSuspensions } from './suspensions.ts';
import type { Parties } from './parties.ts';
import type { Social } from './social.ts';
import { log } from './log.ts';

/**
 * The game server's thin layer over the MongoDB stores (src/lib/server/store/). The stores are
 * replaced here: what is tested is what the server does with their answers, with no database,
 * and when they fail.
 */
const db = vi.hoisted(() => ({
	/** What `getDb()` returns: null is "no database". */
	current: null as null | object,
	docs: new Map<string, { clues?: number; resolved?: boolean }>(),
	fail: false
}));

vi.mock('./db.ts', () => ({ getDb: () => db.current }));

const store = vi.hoisted(() => ({
	redeemTicket: vi.fn(),
	getAccount: vi.fn(),
	takeLoadout: vi.fn(),
	itemsOwned: vi.fn(),
	returnFromExpedition: vi.fn(),
	markReady: vi.fn(),
	clearUnderground: vi.fn(),
	recordError: vi.fn(),
	recordRun: vi.fn(),
	writeServerStatus: vi.fn(),
	suspendedAmong: vi.fn(),
	deletedAmong: vi.fn()
}));

vi.mock('../src/lib/server/store/accounts.ts', () => ({
	redeemTicket: store.redeemTicket,
	getAccount: store.getAccount,
	suspendedAmong: store.suspendedAmong
}));
vi.mock('../src/lib/server/store/deletion.ts', () => ({ deletedAmong: store.deletedAmong }));
vi.mock('../src/lib/server/store/explorers.ts', () => ({
	takeLoadout: store.takeLoadout,
	itemsOwned: store.itemsOwned,
	returnFromExpedition: store.returnFromExpedition,
	markReady: store.markReady,
	clearUnderground: store.clearUnderground
}));
vi.mock('../src/lib/server/store/reports.ts', () => ({
	recordError: store.recordError,
	fingerprint: (source: string, message: string) => `${source}:${message}`
}));
vi.mock('../src/lib/server/store/runs.ts', () => ({
	recordRun: store.recordRun,
	writeServerStatus: store.writeServerStatus
}));

/** A database whose `progress` collection is a map. */
function fakeDb() {
	const fails = () => {
		if (db.fail) throw new Error('database down');
	};
	return {
		collection: () => ({
			findOne: async ({ _id }: { _id: string }) => {
				fails();
				return db.docs.get(_id) ?? null;
			},
			bulkWrite: async () => fails(),
			deleteMany: async ({ _id }: { _id: { $in: string[] } }) => {
				fails();
				for (const k of _id.$in) db.docs.delete(k);
			}
		})
	};
}

const boom = () => Promise.reject(new Error('database down'));

beforeEach(() => {
	db.current = null;
	db.docs.clear();
	db.fail = false;
	for (const fn of Object.values(store)) fn.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('without a database', () => {
	it('nobody is signed in, kits are empty and nothing is written', async () => {
		expect(await identify('ticket')).toBeNull();
		expect(await currentTag('acc')).toBeNull();
		expect(await takeKit('exp', 's')).toEqual(emptyInventory());
		expect(await owned(['exp'])).toEqual(new Set());
		giveBack('exp', 's', null);
		await lockKit('exp', true);
		await releaseAll();
		logRun({} as never);
		expect(await serverCrash(new Error('x'), 'here')).toBeNull();
		expect(store.returnFromExpedition).not.toHaveBeenCalled();
	});
});

describe('with a database', () => {
	beforeEach(() => {
		db.current = fakeDb();
	});

	it('identifies a ticket and reads a gamer tag', async () => {
		const identity = { account: 'a', explorer: 'e', gamerTag: 'Tag' };
		store.redeemTicket.mockResolvedValue({
			account: { _id: 'a', gamerTag: 'Tag' },
			explorer: { _id: 'e' }
		});
		store.getAccount.mockResolvedValue({ gamerTag: 'Tag' });
		expect(await identify('ticket')).toEqual(identity);
		store.redeemTicket.mockResolvedValue(null);
		expect(await identify('expired')).toBeNull();
		expect(await currentTag('a')).toBe('Tag');
		store.redeemTicket.mockImplementation(boom);
		store.getAccount.mockImplementation(boom);
		expect(await identify('ticket')).toBeNull();
		expect(await currentTag('a')).toBeNull();
	});

	it('takes and gives back belongings, falling back to nothing when the store fails', async () => {
		const kit = emptyInventory();
		addItem(kit, newStack('knife'));
		store.takeLoadout.mockResolvedValue(kit);
		store.itemsOwned.mockResolvedValue(new Set(['pendant']));
		store.returnFromExpedition.mockResolvedValue(undefined);
		store.clearUnderground.mockResolvedValue(2);
		expect(await takeKit('exp', 's')).toBe(kit);
		expect(await owned(['exp'])).toEqual(new Set(['pendant']));
		expect(await owned([])).toEqual(new Set());
		giveBack('exp', 's', kit);
		expect(store.returnFromExpedition).toHaveBeenCalledWith(db.current, 'exp', 's', kit);
		await releaseAll();
		store.takeLoadout.mockImplementation(boom);
		store.itemsOwned.mockImplementation(boom);
		store.returnFromExpedition.mockImplementation(boom);
		store.clearUnderground.mockImplementation(boom);
		expect(await takeKit('exp', 's')).toEqual(emptyInventory());
		expect(await owned(['exp'])).toEqual(new Set());
		giveBack('exp', 's', kit);
		await releaseAll();
	});

	it('locks a kit one request at a time, the last one asked winning', async () => {
		const order: boolean[] = [];
		store.markReady.mockImplementation(async (_db: unknown, _e: string, ready: boolean) => {
			order.push(ready);
		});
		await Promise.all([lockKit('exp', true), lockKit('exp', false), lockKit('exp', true)]);
		expect(order).toEqual([true, false, true]);
		store.markReady.mockImplementation(boom);
		await lockKit('exp', true);
	});

	it('records a crash once a minute per error', async () => {
		vi.useFakeTimers();
		store.recordError.mockResolvedValue('id-1');
		expect(await serverCrash(new Error('once'), 'here')).toBe('id-1');
		expect(await serverCrash(new Error('once'), 'here')).toBe('id-1');
		expect(store.recordError).toHaveBeenCalledOnce();
		vi.advanceTimersByTime(61_000);
		await serverCrash(new Error('once'), 'here');
		expect(store.recordError).toHaveBeenCalledTimes(2);
		store.recordError.mockImplementation(boom);
		expect(await serverCrash('not an error', 'here')).toBeNull();
		expect(crashMessage(new TypeError('bad'))).toBe('TypeError: bad');
		expect(crashMessage(42)).toBe('42');
	});

	it('records runs, and the server status every few seconds', async () => {
		vi.useFakeTimers();
		store.recordRun.mockImplementation(boom);
		store.writeServerStatus.mockImplementation(boom);
		logRun({ explorer: 'e' } as never);
		expect(store.recordRun).toHaveBeenCalledOnce();
		const census = { online: 1, parties: 1, expeditions: 0, underground: 0 };
		const stop = watchStatus({ census: () => census } as unknown as Parties);
		vi.advanceTimersByTime(31_000);
		stop();
		expect(store.writeServerStatus).toHaveBeenCalledTimes(3);
		expect(store.writeServerStatus.mock.calls[0][1]).toMatchObject(census);
	});

	it('sends suspended and deleted accounts away', async () => {
		vi.useFakeTimers();
		const expel = vi.fn();
		const forget = vi.fn();
		const parties = { accounts: () => ['a', 'b', 'c'], expel } as unknown as Parties;
		const social = { listed: () => ['d'], forget } as unknown as Social;
		store.suspendedAmong.mockResolvedValue(new Map([['a', 'Cheating']]));
		store.deletedAmong.mockResolvedValue(['b']);
		const stop = watchSuspensions(parties, social);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(expel).toHaveBeenCalledWith('a', 'Cheating');
		expect(expel).toHaveBeenCalledWith('b', 'This account was deleted');
		expect(forget).toHaveBeenCalledWith(['b']);
		store.deletedAmong.mockResolvedValue([]);
		await vi.advanceTimersByTimeAsync(60_000);
		store.suspendedAmong.mockImplementation(boom);
		const warn = vi.mocked(log.warn);
		warn.mockClear();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(warn).toHaveBeenCalled();
		stop();
	});

	it('rite progress is kept in memory and in the database, and never goes down', async () => {
		const progress = new Progress();
		db.docs.set('exp:gloaming', { clues: 2, resolved: false });
		expect(await progress.of('exp', 'gloaming')).toEqual({ clues: 2, resolved: false });
		progress.record(['exp'], 'gloaming', { clues: 3 });
		progress.record(['exp'], 'gloaming', { clues: 1, resolved: true });
		expect(await progress.of('exp', 'gloaming')).toEqual({ clues: 3, resolved: true });
		progress.record([], 'gloaming', { clues: 9 });
		await progress.reset(['exp'], 'gloaming');
		expect(await progress.of('exp', 'gloaming')).toEqual({ clues: 0, resolved: false });
		db.fail = true;
		expect(await progress.of('exp', 'gloaming')).toEqual({ clues: 0, resolved: false });
		progress.record(['exp'], 'gloaming', { clues: 1 });
		await progress.reset(['exp'], 'gloaming');
	});
});

describe('carriedValue', () => {
	it('is what the store would pay for what was brought out', () => {
		expect(carriedValue(null)).toBe(0);
		const inv = emptyInventory();
		addItem(inv, newStack('coins', 10));
		expect(carriedValue(inv)).toBeGreaterThan(0);
	});
});
