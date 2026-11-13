import { discordEnabled } from '#lib/server/session.ts';
import type { PageServerLoad } from './$types';

/** Whether to offer linking Discord (only when the Discord application is configured). */
export const load: PageServerLoad = () => {
	return { discord: discordEnabled() };
};
