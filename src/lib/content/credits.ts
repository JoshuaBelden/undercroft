/**
 * The Credits page (/about/credits): who made the game, how AI was used, and everything it
 * builds on. Data, so adding a credit is one entry. Entries marked `todo` are placeholders the
 * owner still has to fill in: they are only shown in dev mode, so players never see a blank slot.
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

/** Who made it: the first line of the page. */
export const CREATOR = 'Joshua Belden';

/**
 * Where the source code lives. The code is AGPL-3.0, which asks that players of a hosted copy can
 * get its source: the page links here. Null hides the link (before the repository is public).
 */
export const SOURCE_URL: string | null = null;

/** The statement on AI use, one paragraph per entry. Written in the creator's voice. */
export const AI_STATEMENT: string[] = [
	"Undercroft is made by one person with a lot of help from AI tools, and I'd rather be upfront about where.",
	'The design, the world, and every decision about how it should look, sound and feel are mine. The code and the developer docs are written with Claude Code (Anthropic): I decide what gets built, review the changes and play-test everything. Some 3D models, the item pictures and backgrounds, some sound effects and parts of the writing were made with AI tools, then edited, cleaned up and fitted to the game by hand.',
	'Wherever someone else’s work is used, it is credited below and used under its license. If something here is wrong or missing, please open an issue.'
];

/** Which AI tools made what. Fill in the generators: the statement above stays general. */
export const AI_TOOLS: Credit[] = [
	{
		name: 'Claude Code',
		detail: 'Code and developer documentation',
		url: 'https://claude.com/claude-code'
	},
	{ name: 'TODO: 3D model generator', detail: 'Which models it made', todo: true },
	{ name: 'TODO: image generator', detail: 'Item pictures and backgrounds', todo: true },
	{ name: 'TODO: sound or text tools', detail: 'Which sounds or writing', todo: true }
];

export const CREDIT_SECTIONS: CreditSection[] = [
	{
		id: 'inspirations',
		title: 'Inspirations',
		intro: 'Games, books and places that shaped Undercroft.',
		entries: [
			{ name: 'TODO: an inspiration', detail: 'What it gave the game', todo: true },
			{ name: 'TODO: an inspiration', detail: 'What it gave the game', todo: true }
		]
	},
	{
		id: 'art',
		title: 'Art',
		entries: [
			{
				name: 'ambientCG',
				detail:
					'Stone, tile, paving, marble, metal and wood textures (Rock061, Tiles093, Tiles133D, PavingStones127, Road015C, Marble023, MetalPlates013, Planks025A)',
				url: 'https://ambientcg.com',
				license: 'CC0 1.0'
			},
			{ name: 'TODO: explorer model and animations', detail: 'Source', todo: true },
			{ name: 'TODO: creature models', detail: 'Source', todo: true },
			{ name: 'TODO: item and prop models', detail: 'Source', todo: true },
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
			}
		]
	},
	{
		id: 'sound',
		title: 'Sound',
		entries: [{ name: 'TODO: sound effect sources', detail: 'Library or creator', todo: true }]
	},
	{
		id: 'tools',
		title: 'Built with',
		entries: [
			{ name: 'Blender', detail: 'Modelling the catacombs', url: 'https://www.blender.org' },
			{ name: 'three.js', detail: '3D rendering', url: 'https://threejs.org', license: 'MIT' },
			{
				name: 'Svelte and SvelteKit',
				detail: 'The interface and the site',
				url: 'https://svelte.dev',
				license: 'MIT'
			},
			{
				name: 'Node.js and ws',
				detail: 'The game server',
				url: 'https://nodejs.org',
				license: 'MIT'
			},
			{
				name: 'MongoDB',
				detail: 'Accounts and stashes',
				url: 'https://www.mongodb.com',
				license: 'Apache-2.0 (driver)'
			},
			{
				name: 'glTF Transform and meshoptimizer',
				detail: 'Model optimization',
				url: 'https://gltf-transform.dev',
				license: 'MIT'
			},
			{
				name: 'sharp',
				detail: 'Image conversion',
				url: 'https://sharp.pixelplumbing.com',
				license: 'Apache-2.0'
			},
			{
				name: 'FFmpeg',
				detail: 'Sound encoding (at build time)',
				url: 'https://ffmpeg.org',
				license: 'GPL'
			},
			{ name: 'Vite', detail: 'Builds', url: 'https://vite.dev', license: 'MIT' },
			{
				name: 'Caddy',
				detail: 'The web server',
				url: 'https://caddyserver.com',
				license: 'Apache-2.0'
			},
			{ name: 'DigitalOcean', detail: 'Hosting', url: 'https://www.digitalocean.com' }
		]
	},
	{
		id: 'testers',
		title: 'Beta testers',
		intro: 'The first people down. Thank you.',
		entries: [{ name: 'TODO: tester names (with their permission)', todo: true }]
	}
];
