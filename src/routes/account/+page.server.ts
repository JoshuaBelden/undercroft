import { discordEnabled, steamSignInEnabled } from '#lib/server/session.ts';
import type { PageServerLoad } from './$types';

/**
 * Whether to offer linking Discord (only when the Discord application is configured) and Steam
 * (only in the desktop app, when Steam sign-in is set up).
 */
export const load: PageServerLoad = () => {
	return { discord: discordEnabled(), steam: steamSignInEnabled() };
};
