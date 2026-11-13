import { discordEnabled } from '#lib/server/session.ts';
import type { LayoutServerLoad } from './$types';

/** Whether to offer "Sign in with Discord" (only when the Discord application is configured). */
export const load: LayoutServerLoad = () => {
	return { discord: discordEnabled() };
};
