import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** /about opens the release notes. */
export const load: PageLoad = () => {
	redirect(307, '/about/changes');
};
