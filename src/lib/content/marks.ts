/**
 * Chalk marks: the symbols explorers draw on walls, and the rules for drawing them. Symbols are
 * like emotes: a catalogue, and the eight on a player's wheel. For now everyone has the same
 * eight (`DEFAULT_MARK_WHEEL`); choosing your own goes through `markWheel`. See
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

/** Every symbol there is. */
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
	}
};

/**
 * The eight on the wheel, top first and clockwise. The arrows sit where they point. Later each
 * explorer chooses theirs.
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
 * The symbols on a player's wheel. Everyone has the default for now; when symbols can be
 * equipped, this reads the explorer's choice, and the wheel and the server follow.
 */
export function markWheel(): readonly string[] {
	return DEFAULT_MARK_WHEEL;
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
