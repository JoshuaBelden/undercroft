import { error } from '@sveltejs/kit';
import { readFile, stat } from 'node:fs/promises';
import { assetFile } from '#lib/server/assets.ts';
import type { RequestHandler } from './$types';

/** What the previews load. Anything else is sent as bytes. */
const TYPES: Record<string, string> = {
	webm: 'audio/webm',
	webp: 'image/webp',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg'
};

/**
 * A built asset, for the Art & Assets page's previews (docs/dev/admin.md#art-and-assets): from
 * the admin app itself, so they work without the game site running. Behind the admin sign-in like
 * every page here; `assetFile` keeps it inside the assets folder.
 */
export const GET: RequestHandler = async ({ params }) => {
	const file = assetFile(params.path);
	if (!file || !(await stat(file)).isFile()) error(404, 'No such asset');
	const body = await readFile(file);
	const type = TYPES[file.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
	return new Response(body, {
		headers: { 'content-type': type, 'content-length': String(body.length) }
	});
};
