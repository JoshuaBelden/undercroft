import { error } from '@sveltejs/kit';
import { NPCS } from '#lib/content/npcs.ts';
import type { PageLoad } from './$types';

/** One contact's page: /contacts/<npc id>. */
export const load: PageLoad = ({ params }) => {
	if (!NPCS[params.npc]) error(404, 'Not found');
	return { npc: params.npc };
};
