import type { LayoutServerLoad } from './$types';

/** The signed-in admin, for every page (null only on the sign-in page). */
export const load: LayoutServerLoad = ({ locals }) => ({ admin: locals.admin });
