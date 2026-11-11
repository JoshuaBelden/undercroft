import type { LayoutServerLoad } from './$types';

/** Who is signed in, for every page (null only on the sign-in pages). */
export const load: LayoutServerLoad = ({ locals }) => {
	return { account: locals.account };
};
