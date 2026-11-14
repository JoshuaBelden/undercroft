/**
 * Chalk marks: the symbols explorers draw on walls, and the rules for drawing them. Symbols are
 * like emotes: a catalogue, and the eight on a player's wheel. Each explorer chooses their eight
 * (saved with the explorer; `DEFAULT_MARK_WHEEL` until they do), read through `markWheel`. See
 * docs/dev/marks.md.
 */

/** A point in a symbol's unit square: x right, y down, both 0..1. */
export type MarkPoint = [number, number];

export interface MarkSymbol {
	id: string;
	/** Shown on the wheel. */
	name: string;
	/** Chalk strokes, each a polyline. A stroke of one point (or two very close) is a dot. */
	strokes: MarkPoint[][];
}

const ARROW: MarkPoint[][] = [
	[
		[0.5, 0.86],
		[0.5, 0.16]
	],
	[
		[0.24, 0.42],
		[0.5, 0.15],
		[0.76, 0.42]
	]
];

/** The arrow turned a quarter turn clockwise `turns` times. */
function turned(strokes: MarkPoint[][], turns: number): MarkPoint[][] {
	return strokes.map((stroke) =>
		stroke.map(([x, y]) => {
			let p: MarkPoint = [x, y];
			for (let i = 0; i < turns; i++) p = [1 - p[1], p[0]];
			return p;
		})
	);
}

function ring(cx: number, cy: number, r: number, steps = 28): MarkPoint[] {
	return Array.from({ length: steps + 1 }, (_, i) => {
		const a = (i / steps) * Math.PI * 2;
		return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as MarkPoint;
	});
}

/** A wave across the square at height `y`: for water. */
function wave(y: number, steps = 16): MarkPoint[] {
	return Array.from({ length: steps + 1 }, (_, i) => {
		const x = 0.15 + (i / steps) * 0.7;
		return [x, y + Math.sin((i / steps) * Math.PI * 3) * 0.06] as MarkPoint;
	});
}

/** A dot: a stroke of two points very close together. */
function dot(x: number, y: number): MarkPoint[] {
	return [
		[x, y],
		[x, y + 0.03]
	];
}

/** Every symbol there is. Everyone can put any of them on their wheel. */
export const MARK_SYMBOLS: Record<string, MarkSymbol> = {
	up: { id: 'up', name: 'Onward', strokes: ARROW },
	right: { id: 'right', name: 'Right', strokes: turned(ARROW, 1) },
	down: { id: 'down', name: 'Down', strokes: turned(ARROW, 2) },
	left: { id: 'left', name: 'Left', strokes: turned(ARROW, 3) },
	cross: {
		id: 'cross',
		name: 'Dead end',
		strokes: [
			[
				[0.2, 0.2],
				[0.8, 0.8]
			],
			[
				[0.8, 0.2],
				[0.2, 0.8]
			]
		]
	},
	circle: { id: 'circle', name: 'Been here', strokes: [ring(0.5, 0.5, 0.32)] },
	question: {
		id: 'question',
		name: 'Unknown',
		strokes: [
			[
				[0.3, 0.33],
				[0.36, 0.2],
				[0.5, 0.14],
				[0.64, 0.2],
				[0.69, 0.33],
				[0.62, 0.45],
				[0.5, 0.53],
				[0.5, 0.66]
			],
			[
				[0.5, 0.8],
				[0.5, 0.84]
			]
		]
	},
	danger: {
		id: 'danger',
		name: 'Danger',
		strokes: [
			[
				[0.5, 0.14],
				[0.5, 0.64]
			],
			[
				[0.5, 0.8],
				[0.5, 0.84]
			]
		]
	},
	loot: {
		id: 'loot',
		name: 'Loot',
		strokes: [
			[
				[0.5, 0.15],
				[0.82, 0.45],
				[0.5, 0.85],
				[0.18, 0.45],
				[0.5, 0.15]
			],
			[
				[0.18, 0.45],
				[0.82, 0.45]
			]
		]
	},
	trap: {
		id: 'trap',
		name: 'Trap',
		strokes: [
			[
				[0.12, 0.42],
				[0.27, 0.68],
				[0.42, 0.42],
				[0.57, 0.68],
				[0.72, 0.42],
				[0.88, 0.68]
			],
			[
				[0.12, 0.3],
				[0.88, 0.3]
			],
			[
				[0.12, 0.8],
				[0.88, 0.8]
			]
		]
	},
	water: { id: 'water', name: 'Water', strokes: [wave(0.32), wave(0.52), wave(0.72)] },
	exit: {
		id: 'exit',
		name: 'Way out',
		strokes: [
			[
				[0.28, 0.86],
				[0.28, 0.14],
				[0.72, 0.14],
				[0.72, 0.86]
			],
			dot(0.61, 0.5)
		]
	},
	stairs: {
		id: 'stairs',
		name: 'Stairs',
		strokes: [
			[
				[0.14, 0.84],
				[0.14, 0.64],
				[0.38, 0.64],
				[0.38, 0.44],
				[0.62, 0.44],
				[0.62, 0.24],
				[0.86, 0.24]
			]
		]
	},
	wait: {
		id: 'wait',
		name: 'Wait here',
		strokes: [
			[
				[0.25, 0.15],
				[0.75, 0.15],
				[0.25, 0.85],
				[0.75, 0.85],
				[0.25, 0.15]
			]
		]
	},
	meet: { id: 'meet', name: 'Meet here', strokes: [ring(0.5, 0.5, 0.32), dot(0.5, 0.485)] },
	creature: {
		id: 'creature',
		name: 'Creature',
		strokes: [
			[
				[0.22, 0.18],
				[0.38, 0.82]
			],
			[
				[0.42, 0.14],
				[0.58, 0.86]
			],
			[
				[0.62, 0.18],
				[0.78, 0.82]
			]
		]
	},
	safe: {
		id: 'safe',
		name: 'Safe',
		strokes: [
			[
				[0.16, 0.52],
				[0.4, 0.76],
				[0.84, 0.24]
			]
		]
	},
	locked: {
		id: 'locked',
		name: 'Locked',
		strokes: [
			[
				[0.24, 0.46],
				[0.76, 0.46],
				[0.76, 0.86],
				[0.24, 0.86],
				[0.24, 0.46]
			],
			[
				[0.34, 0.46],
				[0.34, 0.3],
				[0.4, 0.18],
				[0.5, 0.14],
				[0.6, 0.18],
				[0.66, 0.3],
				[0.66, 0.46]
			]
		]
	},
	crate: {
		id: 'crate',
		name: 'Crate',
		strokes: [
			[
				[0.18, 0.22],
				[0.82, 0.22],
				[0.82, 0.78],
				[0.18, 0.78],
				[0.18, 0.22]
			],
			[
				[0.18, 0.22],
				[0.82, 0.78]
			],
			[
				[0.82, 0.22],
				[0.18, 0.78]
			]
		]
	},
	help: {
		id: 'help',
		name: 'Help',
		strokes: [
			[
				[0.5, 0.16],
				[0.5, 0.84]
			],
			[
				[0.16, 0.5],
				[0.84, 0.5]
			]
		]
	},
	fallen: {
		id: 'fallen',
		name: 'Someone fell',
		strokes: [
			[
				[0.5, 0.12],
				[0.5, 0.88]
			],
			[
				[0.28, 0.34],
				[0.72, 0.34]
			]
		]
	}
};

/** How many symbols a wheel holds. */
export const MARK_WHEEL_SIZE = 8;

/**
 * The eight on a new explorer's wheel, top first and clockwise. The arrows sit where they point.
 * Each explorer can choose their own on the Loadout page.
 */
export const DEFAULT_MARK_WHEEL: readonly string[] = [
	'up',
	'danger',
	'right',
	'question',
	'down',
	'circle',
	'left',
	'cross'
];

/**
 * A wheel as asked for, checked: exactly `MARK_WHEEL_SIZE` symbol ids, each one known and none
 * twice. Null if it isn't one.
 */
export function cleanMarkWheel(value: unknown): string[] | null {
	if (!Array.isArray(value) || value.length !== MARK_WHEEL_SIZE) return null;
	if (!value.every((id) => typeof id === 'string' && Object.hasOwn(MARK_SYMBOLS, id))) return null;
	if (new Set(value).size !== value.length) return null;
	return [...(value as string[])];
}

/**
 * The symbols on an explorer's wheel: the one they saved, or the default if they never chose one
 * (or what they saved no longer checks out, say a symbol was taken away).
 */
export function markWheel(saved?: unknown): readonly string[] {
	return cleanMarkWheel(saved) ?? DEFAULT_MARK_WHEEL;
}

/** Drawing and erasing marks. */
export const MARKS = {
	/** How far from the eye (m) a mark can be drawn. */
	reach: 2,
	/** Width and height of a mark on the wall (m). */
	size: 0.35,
	/**
	 * How far (m) the visible stone may stand off the collision boxes. The client aims at the
	 * stone; the server checks a collider is that close behind it.
	 */
	tolerance: 0.45,
	/** No two marks closer than this (m). */
	minSpacing: 0.2,
	/** Marks in one expedition; past it the oldest is gone. */
	max: 200,
	/** How close (m) you must be to a mark to see who drew it. */
	labelRange: 2.5,
	/** Seconds interact is held on your own mark to erase it. */
	eraseSeconds: 1,
	/** How directly a mark must be looked at to erase it (radians). */
	eraseAngle: 0.4,
	/** Radius (m) drawing one can be heard. */
	noise: 2
};
