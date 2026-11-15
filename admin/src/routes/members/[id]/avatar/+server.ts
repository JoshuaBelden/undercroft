import { error } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { avatarImage } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** The member's uploaded avatar, for their page (the game site's copy is on another origin). */
export const GET: RequestHandler = async ({ params }) => {
	const image = await avatarImage(await database(), params.id);
	if (!image) error(404, 'No avatar');
	return new Response(new Uint8Array(image), {
		headers: { 'content-type': 'image/webp', 'x-content-type-options': 'nosniff' }
	});
};
