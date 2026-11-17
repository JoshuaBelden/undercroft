import { redirect } from '@sveltejs/kit';
import { cleanTag } from '#lib/content/account.ts';
import { database } from '#lib/server/db.ts';
import { SIGNUP_COOKIE } from '#lib/server/session.ts';
import { getSignup } from '#lib/server/store/auth.ts';
import type { PageServerLoad } from './$types';

/** Signing up with Steam: only while the sign-up is waiting. The tag starts as their Steam name. */
export const load: PageServerLoad = async ({ cookies, url }) => {
	const signup = await getSignup(await database(), cookies.get(SIGNUP_COOKIE));
	if (!signup?.steam) redirect(303, '/auth/sign-in');
	const suggested = cleanTag(url.searchParams.get('suggest')) ?? cleanTag(signup.steam.persona);
	return { persona: signup.steam.persona, suggested: suggested ?? '' };
};
