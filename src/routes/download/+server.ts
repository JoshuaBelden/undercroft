import { redirect } from '@sveltejs/kit';
import { DESKTOP_DOWNLOAD_URL } from '#lib/shared/desktop.ts';
import type { RequestHandler } from './$types';

/**
 * /download: the desktop app's installer, from the latest release. Open without signing in
 * (isOpen), so the link can be handed to anyone. See docs/dev/desktop.md#the-beta-testers-build.
 */
export const GET: RequestHandler = () => {
	redirect(302, DESKTOP_DOWNLOAD_URL);
};
