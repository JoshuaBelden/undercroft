import { error } from '@sveltejs/kit';
import { devMode } from '#lib/dev.ts';

// Dev tools (docs/dev/room-viewer.md): in the browser only, and never for players.
export const ssr = false;

export const load = () => {
	if (!devMode) error(404, 'Not found');
};
