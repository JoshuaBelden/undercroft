import type { AccountView } from '#lib/shared/account/types.ts';
import type { InventoryAction, SlotRef } from '#lib/shared/items/types.ts';

/**
 * The signed-in account as the browser knows it: gamer tag, explorer, rite progress. Loaded from
 * the site's own API; the server is the only thing that changes it. See docs/dev/accounts.md.
 */
export const session: { account: AccountView | null } = $state({ account: null });

/** A failed request, with the message the server gave and its HTTP status. */
export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}

	/** The server no longer knows who we are: the session ended. */
	get signedOut(): boolean {
		return this.status === 401;
	}
}

/** Call this site's JSON API. Throws `ApiError` with the server's message when it refuses. */
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
	const response = await fetch(path, {
		method,
		headers: body === undefined ? undefined : { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
	if (!response.ok) {
		throw new ApiError(data.error ?? data.message ?? 'Something went wrong', response.status);
	}
	return data as T;
}

/**
 * Fetch the account again (after an expedition, a purchase, a change of gamer tag). If the
 * request fails for any reason but being signed out (the site restarting, the network), what
 * was known before is kept.
 */
export async function loadAccount(): Promise<AccountView | null> {
	try {
		session.account = await api<AccountView>('/api/account');
	} catch (error) {
		if (error instanceof ApiError && error.signedOut) session.account = null;
	}
	return session.account;
}

/** Change the gamer tag. Throws `ApiError` if it is taken or not allowed. */
export async function changeGamerTag(gamerTag: string): Promise<void> {
	const result = await api<{ gamerTag: string }>('/api/account', 'PATCH', { gamerTag });
	if (session.account) session.account.gamerTag = result.gamerTag;
}

/**
 * Rearrange the stash and the loadout: move, equip or split something, or throw it away
 * (`drop`). Throws `ApiError` if it is refused.
 */
export async function changeLoadout(action: InventoryAction): Promise<void> {
	session.account = await api<AccountView>('/api/explorer/loadout', 'POST', action);
}

/** Buy from the shop, or sell from a stash or loadout slot. Throws `ApiError` if it is refused. */
export async function trade(
	change:
		{ action: 'buy'; item: string; lots: number } | { action: 'sell'; from: SlotRef; count: number }
): Promise<void> {
	session.account = await api<AccountView>('/api/shop', 'POST', change);
}

/** Dev-mode admin tools for the account (see `/api/admin`). Throws `ApiError` if refused. */
export async function adminAccount(
	change:
		| { action: 'grantMoney'; amount: number }
		| { action: 'grantItem'; item: string; count: number }
		| { action: 'resetExplorer' }
		| { action: 'resetPassword'; email: string; password: string }
): Promise<void> {
	session.account = await api<AccountView>('/api/admin', 'POST', change);
}

export async function signOut(): Promise<void> {
	await api('/api/auth/sign-out', 'POST');
	session.account = null;
	location.href = '/auth/sign-in';
}

/** A ticket that proves who we are to the game server. */
export async function gameTicket(): Promise<string> {
	return (await api<{ ticket: string }>('/api/ticket', 'POST')).ticket;
}
