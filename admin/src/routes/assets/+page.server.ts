import { GAME_ORIGIN } from '$app/env/private';
import { buildCatalog, readAssetDisk } from '#lib/server/assets.ts';
import type { PageServerLoad } from './$types';

/**
 * Every model, map piece, picture, sound and animation the game uses or names, and the files
 * nothing uses (docs/dev/admin.md#art-and-assets). Read from the repository each time, so it is
 * always what is checked out. Previews load from the game site.
 */
export const load: PageServerLoad = async () => {
	const catalog = buildCatalog(await readAssetDisk());
	return { ...catalog, gameOrigin: GAME_ORIGIN };
};
