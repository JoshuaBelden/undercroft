import { error } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { avatarImage } from '#lib/server/store/avatars.ts';
import type { RequestHandler } from './$types';

/**
 * An uploaded avatar (docs/dev/accounts.md#avatars), for signed-in players like the rest of the
 * site. Its URL carries the version (`?v=`), which changes with every upload, so a browser keeps
 * it for good.
 */
export const GET: RequestHandler = async ({ params }) => {
	const image = await avatarImage(await database(), params.id);
	if (!image) error(404, 'No avatar');
	return new Response(new Uint8Array(image), {
		headers: {
			'content-type': 'image/webp',
			'cache-control': 'private, max-age=31536000, immutable',
			'x-content-type-options': 'nosniff'
		}
	});
};
