import type { MapKit } from '../../shared/map/types.ts';

/**
 * Gameplay roles for map pieces. Geometry, sockets and colliders come from the Blender
 * exports (`src/lib/shared/map/pieces.generated.ts`); this file says how the generator uses them.
 * Connector weights are relative chances. See docs/dev/map-generation.md.
 */
export const MAP_KIT: MapKit = {
	stairwell: {
		role: 'start',
		exit: 'hall-stairs-down',
		title: 'The Stairwell',
		acoustics: 'hall'
	},

	'ossuary-hall': { role: 'major', title: 'Ossuary Hall', acoustics: 'hall' },
	'quarry-gallery': { role: 'major', title: 'Quarry Gallery', acoustics: 'vast' },
	cistern: { role: 'major', title: 'The Cistern', acoustics: 'vast' },
	'gloaming-chapel': {
		role: 'major',
		final: true,
		title: 'Gloaming Chapel',
		acoustics: 'vast'
	},

	// A way up to the surface: placed on the main route between the major rooms.
	'extraction-shaft': { role: 'extraction', title: 'The Shaft', acoustics: 'hall' },

	// Mostly halls, with frequent junctions; crawls and squeezes are rare.
	'hall-straight': { role: 'connector', weight: 5 },
	'hall-corner': { role: 'connector', weight: 3 },
	'hall-tee': { role: 'connector', weight: 3 },
	'hall-cross': { role: 'connector', weight: 1.5 },
	'hall-side-room': { role: 'connector', weight: 1 },
	'room-small': { role: 'connector', weight: 1 },
	'room-crypt': { role: 'connector', weight: 0.5, acoustics: 'hall' },
	'hall-crawl': { role: 'connector', weight: 0.2, acoustics: 'tight' },
	'hall-squeeze': { role: 'connector', weight: 0.2, acoustics: 'tight' },
	'hall-canal': { role: 'connector', weight: 0.4 },
	'hall-flooded': { role: 'connector', weight: 0.2, acoustics: 'tight' },
	'hall-stairs-down': { role: 'connector', weight: 0.8, descends: true },

	'hall-dead-end': { role: 'end' },
	'cap-hall': { role: 'cap', seals: 'hall' }
};
