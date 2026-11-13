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
 * Change the password (`current` is needed when it has one), or set one for an account made with
 * Discord. Every other browser is signed out. Throws `ApiError` if refused.
 */
export async function changePassword(current: string, password: string): Promise<void> {
	session.account = await api<AccountView>('/api/account/password', 'POST', { current, password });
}

/** Start turning on two-step sign-in: the secret, and a QR code (SVG) of it for the app. */
export async function startTwoStep(): Promise<{ secret: string; qr: string }> {
	return api<{ secret: string; qr: string }>('/api/account/mfa/setup', 'POST');
}

/** Turn two-step sign-in on with a code from the app. Returns the recovery codes, shown once. */
export async function enableTwoStep(code: string): Promise<string[]> {
	const result = await api<{ codes: string[]; account: AccountView }>(
		'/api/account/mfa/enable',
		'POST',
		{ code }
	);
	session.account = result.account;
	return result.codes;
}

/** Turn two-step sign-in off, with a code from the app or a recovery code. */
export async function disableTwoStep(code: string): Promise<void> {
	session.account = await api<AccountView>('/api/account/mfa/disable', 'POST', { code });
}

/** Unlink Discord. Refused when the account has no password. */
export async function unlinkDiscord(): Promise<void> {
	session.account = await api<AccountView>('/api/account/discord', 'DELETE');
}

/** Sign out every other browser; this one stays signed in. */
export async function signOutElsewhere(): Promise<void> {
	await api('/api/account/sessions', 'DELETE');
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
