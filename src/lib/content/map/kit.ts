import type { MapKit } from '../../shared/map/types.ts';

/**
 * Gameplay roles for map pieces. Geometry, sockets and colliders come from the Blender
 * exports (`src/lib/shared/map/pieces.generated.ts`); this file says how the generator uses them.
 * Connector weights are relative chances. See docs/dev/map-generation.md.
 */
export const MAP_KIT: MapKit = {
	stairwell: { role: 'start', exit: 'hall-stairs-down', title: 'The Stairwell' },

	'ossuary-hall': { role: 'major', title: 'Ossuary Hall' },
	'quarry-gallery': { role: 'major', title: 'Quarry Gallery' },
	cistern: { role: 'major', title: 'The Cistern' },
	'gloaming-chapel': { role: 'major', final: true, title: 'Gloaming Chapel' },

	'hall-straight': { role: 'connector', weight: 6 },
	'hall-corner': { role: 'connector', weight: 4 },
	'hall-tee': { role: 'connector', weight: 1.5 },
	'hall-cross': { role: 'connector', weight: 0.8 },
	'hall-side-room': { role: 'connector', weight: 1.2 },
	'room-small': { role: 'connector', weight: 1.2 },
	'room-crypt': { role: 'connector', weight: 0.6 },
	'hall-crawl': { role: 'connector', weight: 0.8 },
	'hall-squeeze': { role: 'connector', weight: 0.8 },
	'hall-stairs-down': { role: 'connector', weight: 0.8, descends: true },

	'hall-dead-end': { role: 'end' },
	'cap-hall': { role: 'cap', seals: 'hall' }
};
