import { fail, redirect } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { setAdminCookie } from '#lib/server/session.ts';
import {
	checkSecondFactor,
	cleanEmail,
	createAdminSession,
	isAdmin,
	throttle,
	throttled,
	verifyLogin
} from '#lib/server/store.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.admin) redirect(303, '/');
};

/**
 * Email, password and the two-step code, all at once: every admin has two-step sign-in on.
 * The same answer for a wrong password, an unknown email and an account that isn't an admin.
 */
export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const email = cleanEmail(form.get('email'));
		const password = form.get('password');
		const code = form.get('code');
		if (!email) return fail(400, { email: '', error: 'Enter a valid email address' });
		const db = await database();
		if (await throttled(db, 'signIn', email)) {
			return fail(429, { email, error: 'Too many tries. Wait a few minutes' });
		}
		const account = await verifyLogin(db, email, password);
		if (!account || !isAdmin(account)) {
			await throttle(db, 'signIn', email);
			return fail(400, { email, error: 'Wrong email or password, or not an admin account' });
		}
		if (!account.totp) {
			return fail(400, {
				email,
				error: 'Turn on two-step sign-in on your Account screen in the game first'
			});
		}
		const checked = await checkSecondFactor(db, account, typeof code === 'string' ? code : '');
		if (checked === 'throttled') {
			return fail(429, { email, error: 'Too many wrong codes. Wait a few minutes' });
		}
		if (checked === 'code') return fail(400, { email, error: 'That code is wrong' });
		setAdminCookie(cookies, await createAdminSession(db, account._id), url.protocol === 'https:');
		redirect(303, '/');
	}
};
