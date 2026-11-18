import { buildCatalog, readAssetDisk } from '#lib/server/assets.ts';
import type { PageServerLoad } from './$types';

/**
 * Every model, map piece, picture, sound and animation the game uses or names, and the files
 * nothing uses (docs/dev/admin.md#art-and-assets). Read from the repository each time, so it is
 * always what is checked out. Previews load from assets/file.
 */
export const load: PageServerLoad = async () => {
	return buildCatalog(await readAssetDisk());
};
