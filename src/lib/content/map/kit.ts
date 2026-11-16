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
		affliction: 'gloaming',
		title: 'Gloaming Chapel',
		acoustics: 'vast'
	},

	// The end of a level: a way up to the surface, and the double door to the long stair down to
	// the next level (its `gate` socket). Placed last on every level but the deepest.
	'extraction-gate': { role: 'extraction', title: 'The Shaft', acoustics: 'hall' },
	// The only way between levels, behind the extraction room's double door.
	'stairs-deep': { role: 'descent', title: 'The Long Stair', acoustics: 'hall' },

	// Mostly halls, with frequent junctions; crawls and squeezes are rare.
	'hall-straight': { role: 'connector', weight: 5 },
	'hall-corner': { role: 'connector', weight: 3 },
	'hall-tee': { role: 'connector', weight: 3 },
	'hall-cross': { role: 'connector', weight: 1.5 },
	'hall-side-room': { role: 'connector', weight: 1 },
	'room-small': { role: 'connector', weight: 1, room: true },
	'room-crypt': { role: 'connector', weight: 0.5, room: true, acoustics: 'hall' },
	'room-vault': {
		role: 'connector',
		weight: 1,
		room: true,
		title: 'Charnel Vault',
		acoustics: 'vast'
	},
	'room-gallery': {
		role: 'connector',
		weight: 0.8,
		room: true,
		title: 'Burial Gallery',
		acoustics: 'hall'
	},
	'hall-crawl': { role: 'connector', weight: 0.2, acoustics: 'tight' },
	'hall-squeeze-long': { role: 'connector', weight: 0.2, acoustics: 'tight' },
	'hall-canal': { role: 'connector', weight: 0.4 },
	'hall-flooded': { role: 'connector', weight: 0.2, acoustics: 'tight' },
	'hall-stairs-down': { role: 'connector', weight: 0.8, descends: true },

	'hall-dead-end': { role: 'end' },
	'cap-hall': { role: 'cap', seals: 'hall' }
};
