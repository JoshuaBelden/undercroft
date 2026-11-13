import { error, fail, redirect } from '@sveltejs/kit';
import { GAME_ORIGIN } from '$app/env/private';
import { database } from '#lib/server/db.ts';
import { explorersOf, memberRow, sessionCount } from '#lib/server/members.ts';
import { requireAdmin } from '#lib/server/session.ts';
import {
	ACCOUNT_ERRORS,
	ADMIN,
	activeSuspension,
	audit,
	deleteAccount,
	deleteSessionsFor,
	disableTotp,
	getAccount,
	liftSuspension,
	listFeedback,
	listIdeas,
	listReports,
	readAudit,
	runsOf,
	requestReset,
	resetMail,
	sendMail,
	setGamerTag,
	setRole,
	suspendAccount
} from '#lib/server/store.ts';
import type { Actions, PageServerLoad } from './$types';

/** One member: who they are, how they sign in, what they own, and what admins have done. */
export const load: PageServerLoad = async ({ params }) => {
	const db = await database();
	const account = await getAccount(db, params.id);
	if (!account) error(404, 'No such member');
	const suspension = activeSuspension(account);
	const { explorers, ledger } = await explorersOf(db, account._id);
	return {
		member: memberRow(account),
		signIn: {
			password: account.password !== undefined,
			discord: account.discord?.username ?? null,
			totp: account.totp !== undefined,
			sessions: await sessionCount(db, account._id)
		},
		suspension: suspension
			? { reason: suspension.reason, until: suspension.until ?? null, at: suspension.at }
			: null,
		explorers: explorers.map((explorer) => ({
			id: explorer._id,
			money: explorer.money,
			stashed: explorer.stash.filter(Boolean).length,
			stashSlots: explorer.stash.length,
			underground: explorer.underground !== null
		})),
		ledger: ledger.map((line) => ({ ...line, _id: String(line._id) })),
		runs: await runsOf(
			db,
			explorers.map((explorer) => explorer._id)
		),
		reports: await listReports(db, { account: account._id, limit: 20 }),
		ideas: await listIdeas(db, { author: account._id, limit: 20 }),
		feedback: await listFeedback(db, { account: account._id, limit: 20 }),
		audit: await readAudit(db, { target: account._id }),
		reasonMax: ADMIN.reasonMax
	};
};

/** The member, for an action; 404 if they are gone. */
async function target(id: string) {
	const db = await database();
	const account = await getAccount(db, id);
	if (!account) error(404, 'No such member');
	return { db, account };
}

export const actions: Actions = {
	suspend: async ({ params, request, locals }) => {
		const admin = requireAdmin(locals);
		const { db, account } = await target(params.id);
		if (account._id === admin.id) return fail(400, { error: "You can't suspend yourself" });
		const form = await request.formData();
		const reason = String(form.get('reason') ?? '').trim();
		const days = Number(form.get('days') || 0);
		if (!reason || reason.length > ADMIN.reasonMax) {
			return fail(400, { error: `Give a reason (up to ${ADMIN.reasonMax} characters)` });
		}
		if (!Number.isFinite(days) || days < 0 || days > 3650) {
			return fail(400, { error: 'Days must be between 0 (until lifted) and 3650' });
		}
		const until = days > 0 ? new Date(Date.now() + days * 86400_000) : undefined;
		await suspendAccount(db, account._id, {
			reason,
			...(until ? { until } : {}),
			by: admin.id,
			at: new Date()
		});
		await audit(
			db,
			admin,
			'suspend',
			account._id,
			`${days > 0 ? `${days} d` : 'until lifted'}: ${reason}`
		);
		return { notice: 'Suspended. Their game connection closes within a minute' };
	},

	unsuspend: async ({ params, locals }) => {
		const admin = requireAdmin(locals);
		const { db, account } = await target(params.id);
		await liftSuspension(db, account._id);
		await audit(db, admin, 'unsuspend', account._id);
		return { notice: 'Suspension lifted' };
	},

	signOut: async ({ params, locals }) => {
		const admin = requireAdmin(locals);
		const { db, account } = await target(params.id);
		await deleteSessionsFor(db, account._id);
		await audit(db, admin, 'signOutEverywhere', account._id);
		return { notice: 'Signed out of every browser' };
	},

	sendReset: async ({ params, locals }) => {
		const admin = requireAdmin(locals);
		const { db, account } = await target(params.id);
		const reset = await requestReset(db, account.email);
		if (!reset) return fail(400, { error: 'No account for that email' });
		try {
			await sendMail({
				to: account.email,
				...resetMail(`${GAME_ORIGIN}/auth/reset?token=${reset.token}`)
			});
		} catch (failure) {
			console.error('[admin] reset email', failure);
			return fail(502, { error: 'The email could not be sent' });
		}
		await audit(db, admin, 'sendReset', account._id);
		return { notice: `Reset link sent to ${account.email}` };
	},

	disableTotp: async ({ params, locals }) => {
		const admin = requireAdmin(locals);
		const { db, account } = await target(params.id);
		await disableTotp(db, account._id);
		await audit(db, admin, 'disableTotp', account._id);
		return { notice: 'Two-step sign-in is off' };
	},

	rename: async ({ params, request, locals }) => {
		const admin = requireAdmin(locals);
		const { db, account } = await target(params.id);
		const form = await request.formData();
		const result = await setGamerTag(db, account._id, form.get('gamerTag'));
		if ('error' in result) return fail(400, { error: ACCOUNT_ERRORS[result.error] });
		await audit(db, admin, 'renameTag', account._id, `${account.gamerTag} → ${result.gamerTag}`);
		return { notice: `Now ${result.gamerTag}. Others see it from their next connection` };
	},

	grantAdmin: async ({ params, locals }) => {
		const admin = requireAdmin(locals);
		const { db, account } = await target(params.id);
		await setRole(db, account._id, true);
		await audit(db, admin, 'grantAdmin', account._id, account.gamerTag);
		return {
			notice: account.totp
				? 'Now an admin'
				: 'Now an admin. They need two-step sign-in on before they can sign in here'
		};
	},

	removeAdmin: async ({ params, locals }) => {
		const admin = requireAdmin(locals);
		const { db, account } = await target(params.id);
		if (account._id === admin.id) return fail(400, { error: "You can't remove your own role" });
		await setRole(db, account._id, false);
		await audit(db, admin, 'removeAdmin', account._id, account.gamerTag);
		return { notice: 'No longer an admin' };
	},

	/** Delete the account for good (docs/dev/accounts.md#deleting-an-account). */
	delete: async ({ params, request, locals }) => {
		const admin = requireAdmin(locals);
		const { db, account } = await target(params.id);
		if (account._id === admin.id) return fail(400, { error: "You can't delete your own account" });
		const form = await request.formData();
		if (String(form.get('confirmTag') ?? '').trim() !== account.gamerTag) {
			return fail(400, { error: `Type the gamer tag, ${account.gamerTag}, to delete the account` });
		}
		await deleteAccount(db, account._id);
		await audit(db, admin, 'deleteAccount', account._id, account.gamerTag);
		redirect(303, '/members?deleted=' + encodeURIComponent(account.gamerTag));
	}
};
