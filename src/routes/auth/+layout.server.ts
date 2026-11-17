import { discordEnabled, steamSignInEnabled } from '#lib/server/session.ts';
import type { LayoutServerLoad } from './$types';

/**
 * Whether to offer "Continue with Discord" (only when the Discord application is configured) and
 * "Continue with Steam" (only in the desktop app, and when Steam sign-in is set up).
 */
export const load: LayoutServerLoad = () => {
	return { discord: discordEnabled(), steam: steamSignInEnabled() };
};
