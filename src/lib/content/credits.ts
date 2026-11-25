/**
 * The Credits page (/about/credits): how AI was used, the art and sound the game builds on, and
 * its testers. Data, so adding a credit is one entry. Entries marked `todo` are placeholders still
 * to fill in: they are only shown in dev mode, so players never see a blank slot.
 * See docs/dev/releasing.md.
 */

export interface Credit {
	name: string;
	/** What it is or what it was used for. */
	detail?: string;
	url?: string;
	license?: string;
	/** A placeholder to fill in: hidden from players until it isn't. */
	todo?: boolean;
}

export interface CreditSection {
	id: string;
	title: string;
	intro?: string;
	entries: Credit[];
}

/**
 * Where the source code lives. The code is AGPL-3.0, which asks that players of a hosted copy can
 * get its source: the page links here. Null hides the link (before the repository is public).
 */
export const SOURCE_URL: string | null = 'https://github.com/JoshuaBelden/undercroft';

/** The statement on AI use, one paragraph per entry. Written in the creator's voice. */
export const AI_STATEMENT: string[] = [
	"Undercroft is made by one person with a lot of help from AI tools, and I'd rather be upfront about where.",
	'The design, the world, and every decision about how it should look, sound and feel are mine. The code and the developer docs are written with Claude Code (Anthropic): I decide what gets built, review the changes and play-test everything. Some 3D models, the item pictures and backgrounds, some sound effects and parts of the writing were made with AI tools, then edited, cleaned up and fitted to the game by hand.'
];

export const CREDIT_SECTIONS: CreditSection[] = [
	{
		id: 'art',
		title: 'Art',
		entries: [
			{
				name: 'ambientCG',
				detail:
					'Stone, tile, paving, marble, metal, wood and brick textures (Rock061, Tiles093, Tiles133D, PavingStones127, Road015C, Marble023, MetalPlates013, Metal062C, Planks025A, Wood035, PaintedWood007B, Bricks073C)',
				url: 'https://ambientcg.com',
				license: 'CC0 1.0'
			},
			{
				name: 'MakeHuman',
				detail:
					"The explorer's bodies, faces, hair and clothes, built with MPFB in Blender from the MakeHuman system assets and the shirts01 and pants01 packs (the polo shirt by namuhekam, the cargo pants by Cortu, the wool trousers and sweater by Margaret Toigo)",
				url: 'https://static.makehumancommunity.org',
				license: 'CC0 1.0'
			},
			{
				name: 'Creature, corpse and item models',
				detail:
					'Generated, rigged and animated with Meshy, then cleaned up and fitted in Blender; the explorer still moves with the clips of its first, Meshy-made body. The catacombs, crates and remaining items are modelled by hand.',
				url: 'https://www.meshy.ai'
			},
			{
				name: 'Angel statue',
				detail: "The statue in the start room, the Angel's Well: source and license to fill in",
				todo: true
			},
			{
				name: 'Barlow',
				detail: 'Typeface, by Jeremy Tribby',
				url: 'https://fonts.google.com/specimen/Barlow',
				license: 'SIL Open Font License 1.1'
			},
			{
				name: 'Cinzel',
				detail: 'Typeface, by Natanael Gama',
				url: 'https://fonts.google.com/specimen/Cinzel',
				license: 'SIL Open Font License 1.1'
			},
			{
				name: 'Fontsource',
				detail: 'Packages the typefaces so the game serves them itself',
				url: 'https://fontsource.org',
				license: 'MIT'
			}
		]
	},
	{
		id: 'sound',
		title: 'Sound',
		entries: [
			{
				name: 'Pixabay',
				detail: 'Sound effects',
				url: 'https://pixabay.com/sound-effects/',
				license: 'Pixabay Content License'
			},
			{
				name: 'Freesound',
				detail: 'Sound effects shared by its community',
				url: 'https://freesound.org'
			}
		]
	},
	{
		id: 'contributors',
		title: 'Contributors',
		intro: 'The first people down. Thank you.',
		// The testers and contributors are on the repository, not listed here.
		entries: SOURCE_URL
			? [{ name: 'Undercroft on GitHub', detail: 'Testers and contributors', url: SOURCE_URL }]
			: []
	}
];
