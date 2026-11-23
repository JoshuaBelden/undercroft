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
	discordAvatarUrl,
	disableTotp,
	getAccount,
	liftSuspension,
	markWheel,
	MARK_SYMBOLS,
	resetMarkWheel,
	resetExplorer,
	EXPLORER_ERRORS,
	listFeedback,
	listIdeas,
	listReports,
	readAudit,
	removeAvatar,
	runsOf,
	requestReset,
	resetMail,
	sendMail,
	setGamerTag,
	setRole,
	suspendAccount,
	LEVELS,
	SKILLS,
	levelOf,
	pointsLeft,
	progressionOf,
	resetProgression,
	setExperience,
	setRank,
	adminSetFlag,
	adminSetQuest,
	questsOf,
	questStatus,
	resolvedBy,
	setQuests,
	QUESTS,
	QUEST_ORDER
} from '#lib/server/store.ts';
import type { Actions, PageServerLoad } from './$types';

/** One member: who they are, how they sign in, what they own, and what admins have done. */
export const load: PageServerLoad = async ({ params }) => {
	const db = await database();
	const account = await getAccount(db, params.id);
	if (!account) error(404, 'No such member');
	const suspension = activeSuspension(account);
	const { explorers, ledger } = await explorersOf(db, account._id);
	const resolved = new Map(
		await Promise.all(explorers.map(async (e) => [e._id, await resolvedBy(db, e._id)] as const))
	);
	return {
		member: memberRow(account),
		avatar: {
			/** Their upload, served by this app (the game's URL is on another site). */
			uploaded:
				account.avatar !== undefined ? `/members/${account._id}/avatar?v=${account.avatar}` : null,
			discord: account.discord ? discordAvatarUrl(account.discord.id, account.discord.avatar) : null
		},
		signIn: {
			password: account.password !== undefined,
			discord: account.discord?.username ?? null,
			steam: account.steam ? { id: account.steam.id, persona: account.steam.persona } : null,
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
			underground: explorer.underground !== null,
			markWheel: markWheel(explorer.markWheel).map((id) => MARK_SYMBOLS[id]?.name ?? id),
			customWheel: explorer.markWheel !== undefined,
			quests: (() => {
				const done = resolved.get(explorer._id) ?? [];
				const record = questsOf(explorer, done);
				const context = { resolved: (id: string) => done.includes(id) };
				return {
					list: QUEST_ORDER.map((id) => ({
						id,
						title: QUESTS[id].title,
						status: questStatus(record, id, context) ?? 'locked'
					})),
					flags: record.flags
				};
			})(),
			progression: (() => {
				const p = progressionOf(explorer.progression);
				return {
					xp: p.xp,
					level: levelOf(p.xp),
					pointsLeft: pointsLeft(p),
					categories: p.categories,
					skills: SKILLS.map((s) => ({ id: s.id, name: s.name, rank: p.skills[s.id] ?? 0 })),
					firsts: p.firsts.length
				};
			})()
		})),
		maxLevel: LEVELS.max,
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

	resetMarkWheel: async ({ params, locals }) => {
		const admin = requireAdmin(locals);
		const { db, account } = await target(params.id);
		const { explorers } = await explorersOf(db, account._id);
		for (const explorer of explorers) await resetMarkWheel(db, explorer._id);
		await audit(db, admin, 'resetMarkWheel', account._id);
		return { notice: 'Chalk wheel back to the default (from their next descent)' };
	},

	setExperience: async ({ params, request, locals }) => {
		const admin = requireAdmin(locals);
		const { db, account } = await target(params.id);
		const form = await request.formData();
		const level = String(form.get('level') ?? '').trim();
		const xpField = String(form.get('xp') ?? '').trim();
		const xp = level ? Number(level) * LEVELS.xpPerLevel : Number(xpField);
		if (!Number.isFinite(xp) || xp < 0 || xp > LEVELS.max * LEVELS.xpPerLevel * 10) {
			return fail(400, { error: `Give a level (0 to ${LEVELS.max}) or an amount of experience` });
		}
		const { explorers } = await explorersOf(db, account._id);
		for (const explorer of explorers) await setExperience(db, explorer._id, xp);
		await audit(db, admin, 'setExperience', account._id, String(Math.round(xp)));
		return { notice: `Experience set to ${Math.round(xp)} (level ${levelOf(xp)})` };
	},

	setSkillRank: async ({ params, request, locals }) => {
		const admin = requireAdmin(locals);
		const { db, account } = await target(params.id);
		const form = await request.formData();
		const skill = String(form.get('skill') ?? '');
		const rank = Number(form.get('rank') ?? 0);
		if (!Number.isInteger(rank) || rank < 0 || rank > 3)
			return fail(400, { error: 'Rank is 0 to 3' });
		const { explorers } = await explorersOf(db, account._id);
		for (const explorer of explorers) {
			if (!(await setRank(db, explorer._id, skill, rank)))
				return fail(400, { error: 'No such skill' });
		}
		await audit(db, admin, 'setSkillRank', account._id, `${skill} ${rank}`);
		return {
			notice: rank === 0 ? `${skill} cleared` : `${skill} at rank ${rank} (from their next descent)`
		};
	},

	setQuest: async ({ params, request, locals }) => {
		const admin = requireAdmin(locals);
		const { db, account } = await target(params.id);
		const form = await request.formData();
		const quest = String(form.get('quest') ?? '');
		const state = String(form.get('state') ?? '');
		if (state !== 'done' && state !== 'met' && state !== 'open')
			return fail(400, { error: 'Done, met or open' });
		const { explorers } = await explorersOf(db, account._id);
		for (const explorer of explorers) {
			if (explorer.underground !== null)
				return fail(400, { error: 'They are underground: try again once they are up' });
			if (!(await adminSetQuest(db, explorer._id, quest, state)))
				return fail(400, { error: 'No such quest' });
		}
		await audit(db, admin, 'setQuest', account._id, `${quest} ${state}`);
		return {
			notice:
				state === 'done'
					? `${QUESTS[quest].title} done (no reward paid)`
					: state === 'met'
						? `${QUESTS[quest].title} ready to report`
						: `${QUESTS[quest].title} back to the start`
		};
	},

	setQuestFlag: async ({ params, request, locals }) => {
		const admin = requireAdmin(locals);
		const { db, account } = await target(params.id);
		const form = await request.formData();
		const flag = String(form.get('flag') ?? '').trim();
		const on = form.get('on') === 'on';
		if (!/^[a-z0-9.-]+$/.test(flag))
			return fail(400, { error: 'A flag like gloaming.level-3-open' });
		const { explorers } = await explorersOf(db, account._id);
		for (const explorer of explorers) await adminSetFlag(db, explorer._id, flag, on);
		await audit(db, admin, 'setQuestFlag', account._id, `${flag} ${on ? 'on' : 'off'}`);
		return { notice: `${flag} ${on ? 'set' : 'cleared'}` };
	},

	resetQuests: async ({ params, locals }) => {
		const admin = requireAdmin(locals);
		const { db, account } = await target(params.id);
		const { explorers } = await explorersOf(db, account._id);
		for (const explorer of explorers) await setQuests(db, explorer._id, null);
		await audit(db, admin, 'resetQuests', account._id);
		return { notice: 'Quests start again from Fontaine' };
	},

	resetProgression: async ({ params, locals }) => {
		const admin = requireAdmin(locals);
		const { db, account } = await target(params.id);
		const { explorers } = await explorersOf(db, account._id);
		for (const explorer of explorers) await resetProgression(db, explorer._id);
		await audit(db, admin, 'resetProgression', account._id);
		return { notice: 'Back to level 0: no experience, no skills, no firsts paid' };
	},

	resetExplorer: async ({ params, request, locals }) => {
		const admin = requireAdmin(locals);
		const { db, account } = await target(params.id);
		const form = await request.formData();
		if (String(form.get('confirmTag') ?? '').trim() !== account.gamerTag) {
			return fail(400, { error: `Type the gamer tag, ${account.gamerTag}, to reset them` });
		}
		const { explorers } = await explorersOf(db, account._id);
		for (const explorer of explorers) {
			const result = await resetExplorer(db, explorer._id);
			if ('error' in result) return fail(400, { error: EXPLORER_ERRORS[result.error] });
		}
		await audit(db, admin, 'resetExplorer', account._id, account.gamerTag);
		return { notice: `${account.gamerTag} starts again from nothing, as a new player` };
	},

	sendReset: async ({ params, locals }) => {
		const admin = requireAdmin(locals);
		const { db, account } = await target(params.id);
		const email = account.email;
		// An account made with Steam may have no email to send it to.
		if (!email) return fail(400, { error: 'This account has no email (it signs in with Steam)' });
		const reset = await requestReset(db, email);
		if (!reset) return fail(400, { error: 'No account for that email' });
		try {
			await sendMail({
				to: email,
				...resetMail(`${GAME_ORIGIN}/auth/reset?token=${reset.token}`)
			});
		} catch (failure) {
			console.error('[admin] reset email', failure);
			return fail(502, { error: 'The email could not be sent' });
		}
		await audit(db, admin, 'sendReset', account._id);
		return { notice: `Reset link sent to ${email}` };
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

	removeAvatar: async ({ params, locals }) => {
		const admin = requireAdmin(locals);
		const { db, account } = await target(params.id);
		if (!(await removeAvatar(db, account._id))) return fail(400, { error: 'They have no picture' });
		await audit(db, admin, 'removeAvatar', account._id);
		return { notice: 'Picture removed. Others see it gone from their next connection' };
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
