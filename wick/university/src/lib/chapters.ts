/**
 * The University's chapters, in reading order. A package's chapter is written along with the
 * package; until then it is listed as coming.
 */
/** The chapters that have pages. A chapter's route is added here when it is written. */
export type ChapterRoute = '/architecture' | '/audio';

interface ChapterBase {
	title: string;
	/** One line under the title on the home page. */
	summary: string;
}

/** Written (its package is in WICK), with its page; or still to come. */
export type Chapter =
	| (ChapterBase & { ready: true; path: ChapterRoute })
	| (ChapterBase & { ready: false; path: string });

export const CHAPTERS: Chapter[] = [
	{
		path: '/architecture',
		title: 'Architecture',
		summary: 'The packages, the boundary rule, and how a game wires WICK together.',
		ready: true
	},
	{
		path: '/audio',
		title: 'Audio',
		summary: 'Category buses, world muffling and reverb, positional sound, recordings by id.',
		ready: true
	},
	{
		path: '/render',
		title: 'Render',
		summary: 'The Three.js engine loop, glTF loading, animation and the light budget.',
		ready: false
	},
	{
		path: '/input',
		title: 'Input',
		summary: 'Remappable keyboard, mouse and controller actions, and controller menus.',
		ready: false
	},
	{
		path: '/settings',
		title: 'Settings',
		summary: 'A persisted settings store with engine sections and the game’s own.',
		ready: false
	},
	{
		path: '/net',
		title: 'Multiplayer',
		summary: 'The authoritative server tick, client prediction and the event bus.',
		ready: false
	},
	{
		path: '/membership',
		title: 'Membership',
		summary: 'Accounts, sign-in and two-factor, friends, admin, crash and bug reports.',
		ready: false
	},
	{
		path: '/tooling',
		title: 'Tooling',
		summary: 'The asset pipeline, releases and deploys, and the desktop app with Steam.',
		ready: false
	}
];
