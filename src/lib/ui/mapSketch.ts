import { MARK_SYMBOLS } from '#lib/content/marks.ts';
import type { MarkSnapshot } from '#lib/shared/items/types.ts';
import { CELL, EDGE_DIR, LEVEL_HEIGHT, cellKey } from '#lib/shared/map/grid.ts';
import type { SurveyCell, SurveyFeature, SurveyMap } from '#lib/shared/map/survey.ts';
import type { Edge } from '#lib/shared/map/types.ts';

/**
 * The map screen's page (docs/dev/map.md): what an explorer has drawn in their notebook, in
 * pencil on squared paper, north up. Passages are drawn 2 m wide down the middle of their cells,
 * rooms fill theirs, and a way out of a drawn cell into one not drawn yet is a short open stub.
 * Every line wobbles a little, the same way each time (seeded by where it is).
 */

/** What part of the map is on the page, and how big. */
export interface SketchView {
	/** World position (m) at the middle of the page. */
	x: number;
	z: number;
	/** Pixels per metre. */
	zoom: number;
	/** The level shown. */
	level: number;
}

export interface SketchContent {
	map: SurveyMap;
	/** Cells drawn so far (by `cellKey`). */
	drawn: ReadonlySet<string>;
	/** Where you are, if on the map: world position (m) and the way you face. */
	self: { x: number; z: number; level: number; yaw: number } | null;
	marks: readonly MarkSnapshot[];
}

const PAPER = '#e6dbc1';
const WASH = '#d6c59f';
const GRID = 'rgb(90 110 140 / 0.16)';
const INK = '#3b2f24';
const PENCIL = 'rgb(59 47 36 / 0.55)';
const RED = '#8c2f22';
/** Half a passage's width (m). */
const HALF = 1;
const HALF_CELL = CELL / 2;
const EDGES: Edge[] = ['n', 'e', 's', 'w'];

export function drawSketch(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	view: SketchView,
	content: SketchContent
): void {
	const toScreen = (x: number, z: number): [number, number] => [
		(x - view.x) * view.zoom + width / 2,
		(z - view.z) * view.zoom + height / 2
	];
	ctx.fillStyle = PAPER;
	ctx.fillRect(0, 0, width, height);
	drawGrid(ctx, width, height, view, toScreen);
	const cells = [...content.drawn]
		.map((key) => content.map.cells.get(key))
		.filter((c): c is SurveyCell => !!c && c.cell[2] === view.level);
	const pen = new Pen(ctx, toScreen, view.zoom);
	// The floor first, then the walls over it.
	ctx.fillStyle = WASH;
	for (const cell of cells) for (const [x0, z0, x1, z1] of floor(cell)) pen.fill(x0, z0, x1, z1);
	for (const cell of cells) walls(pen, cell, content);
	const shown = (piece: number) => cells.some((c) => c.piece === piece && c.cell[2] === view.level);
	for (const feature of content.map.features) {
		if (feature.level === view.level && shown(feature.piece)) symbol(pen, feature);
	}
	ctx.fillStyle = INK;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = `${Math.round(Math.max(11, Math.min(18, view.zoom * 1.6)))}px Cinzel, serif`;
	for (const room of content.map.rooms) {
		if (room.level !== view.level || !shown(room.piece)) continue;
		const [sx, sy] = toScreen(room.at[0], room.at[1]);
		ctx.fillText(room.title, sx, sy - view.zoom * 1.5);
	}
	for (const mark of content.marks) chalk(pen, mark, content, view.level);
	if (content.self && content.self.level === view.level) you(ctx, toScreen, content.self);
	compass(ctx, width);
}

/** The squared paper. */
function drawGrid(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	view: SketchView,
	toScreen: (x: number, z: number) => [number, number]
): void {
	const step = CELL * view.zoom;
	const [ox, oy] = toScreen(-HALF_CELL, -HALF_CELL);
	ctx.strokeStyle = GRID;
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let x = ((ox % step) + step) % step; x < width; x += step) {
		ctx.moveTo(Math.round(x) + 0.5, 0);
		ctx.lineTo(Math.round(x) + 0.5, height);
	}
	for (let y = ((oy % step) + step) % step; y < height; y += step) {
		ctx.moveTo(0, Math.round(y) + 0.5);
		ctx.lineTo(width, Math.round(y) + 0.5);
	}
	ctx.stroke();
}

/** The floor of a cell as rectangles [x0, z0, x1, z1] in metres. */
function floor(info: SurveyCell): [number, number, number, number][] {
	const [cx, cz] = [info.cell[0] * CELL, info.cell[1] * CELL];
	if (info.room) return [[cx - HALF_CELL, cz - HALF_CELL, cx + HALF_CELL, cz + HALF_CELL]];
	const out: [number, number, number, number][] = [[cx - HALF, cz - HALF, cx + HALF, cz + HALF]];
	for (const edge of EDGES) {
		if (info.sides[edge] === 'wall') continue;
		const [dx, dz] = EDGE_DIR[edge];
		const ex = cx + dx * HALF_CELL;
		const ez = cz + dz * HALF_CELL;
		out.push([
			Math.min(cx + dx * HALF, ex) - (dx ? 0 : HALF),
			Math.min(cz + dz * HALF, ez) - (dz ? 0 : HALF),
			Math.max(cx + dx * HALF, ex) + (dx ? 0 : HALF),
			Math.max(cz + dz * HALF, ez) + (dz ? 0 : HALF)
		]);
	}
	return out;
}

/**
 * A cell's walls: stone where there is no way on, and the sides of each way out. A way into a
 * cell not drawn yet trails off as a short stub.
 */
function walls(pen: Pen, info: SurveyCell, content: SketchContent): void {
	const [x, z, level] = info.cell;
	const [cx, cz] = [x * CELL, z * CELL];
	for (const edge of EDGES) {
		const side = info.sides[edge];
		const [dx, dz] = EDGE_DIR[edge];
		// Along the side (u) and out of the cell (d).
		const [ux, uz] = [-dz, dx];
		const across = cellKey(x + dx, z + dz, level);
		const acrossDrawn = content.drawn.has(across);
		const at = (along: number, out: number): [number, number] => [
			cx + ux * along + dx * out,
			cz + uz * along + dz * out
		];
		if (info.room) {
			if (side === 'open') continue;
			const edgeOut = HALF_CELL;
			if (side === 'wall') {
				pen.line(at(-HALF_CELL, edgeOut), at(HALF_CELL, edgeOut));
				continue;
			}
			pen.line(at(-HALF_CELL, edgeOut), at(-HALF, edgeOut));
			pen.line(at(HALF, edgeOut), at(HALF_CELL, edgeOut));
			if (!acrossDrawn) stub(pen, at);
			continue;
		}
		if (side === 'wall') {
			pen.line(at(-HALF, HALF), at(HALF, HALF));
			continue;
		}
		pen.line(at(-HALF, HALF), at(-HALF, HALF_CELL));
		pen.line(at(HALF, HALF), at(HALF, HALF_CELL));
		if (side === 'way' && !acrossDrawn) stub(pen, at);
	}
}

/** The sides of a way on, a little past the edge of what is drawn, fading out. */
function stub(pen: Pen, at: (along: number, out: number) => [number, number]): void {
	pen.line(at(-HALF, HALF_CELL), at(-HALF, HALF_CELL + 1.2), PENCIL);
	pen.line(at(HALF, HALF_CELL), at(HALF, HALF_CELL + 1.2), PENCIL);
}

/** A symbol for a stair, the way out, water, a crawl or a squeeze. */
function symbol(pen: Pen, feature: SurveyFeature): void {
	const [x, z] = feature.at;
	switch (feature.kind) {
		case 'down':
		case 'up': {
			// Treads, and an arrow the way the stair goes.
			for (let i = -2; i <= 2; i++) pen.line([x - 0.8, z + i * 0.4], [x + 0.8, z + i * 0.4]);
			const tip = feature.kind === 'down' ? 1.4 : -1.4;
			pen.line([x, z - tip], [x, z + tip], RED);
			pen.line([x - 0.5, z + tip * 0.6], [x, z + tip], RED);
			pen.line([x + 0.5, z + tip * 0.6], [x, z + tip], RED);
			const next = feature.level + (feature.kind === 'down' ? -1 : 1);
			pen.label(`to level ${levelNumber(next)}`, [x, z + 2.4], RED);
			break;
		}
		case 'extraction':
			// A ladder up the shaft, in a ring.
			pen.ring([x, z], 1.4, RED);
			pen.line([x - 0.4, z - 1], [x - 0.4, z + 1], RED);
			pen.line([x + 0.4, z - 1], [x + 0.4, z + 1], RED);
			for (const t of [-0.5, 0, 0.5]) pen.line([x - 0.4, z + t], [x + 0.4, z + t], RED);
			pen.label('way out', [x, z + 2.2], RED);
			break;
		case 'water':
			for (const t of [-0.5, 0, 0.5]) pen.wave([x - 0.9, z + t], 1.8);
			break;
		case 'crawl':
			pen.label('crawl', [x, z], INK);
			break;
		// A ledge to climb (hall-ledge): a step drawn across, and the word.
		case 'ledge':
			pen.line([x - 0.9, z], [x + 0.9, z]);
			pen.label('ledge', [x, z + 1.2], INK);
			break;
		case 'squeeze':
			pen.line([x - 1, z - 0.6], [x - 0.2, z], INK);
			pen.line([x - 1, z + 0.6], [x - 0.2, z], INK);
			pen.line([x + 1, z - 0.6], [x + 0.2, z], INK);
			pen.line([x + 1, z + 0.6], [x + 0.2, z], INK);
			break;
	}
}

/** A chalk mark in a drawn cell, as its symbol, small. */
function chalk(pen: Pen, mark: MarkSnapshot, content: SketchContent, level: number): void {
	const [x, y, z] = mark.position;
	// Floor to ceiling of a level, a little slack for a mark on the floor itself.
	const markLevel = Math.floor(y / LEVEL_HEIGHT + 0.05);
	if (markLevel !== level) return;
	if (!content.drawn.has(cellKey(Math.round(x / CELL), Math.round(z / CELL), level))) return;
	const strokes = MARK_SYMBOLS[mark.symbol]?.strokes;
	if (!strokes) return;
	const size = 1.2;
	for (const stroke of strokes) {
		const points = stroke.map(([u, v]): [number, number] => [
			x + (u - 0.5) * size,
			z + (v - 0.5) * size
		]);
		if (points.length === 1) points.push([points[0][0] + 0.05, points[0][1]]);
		for (let i = 1; i < points.length; i++) pen.line(points[i - 1], points[i], RED, 0);
	}
}

/** You: an arrowhead where you stand, pointing the way you face. */
function you(
	ctx: CanvasRenderingContext2D,
	toScreen: (x: number, z: number) => [number, number],
	self: NonNullable<SketchContent['self']>
): void {
	const [sx, sy] = toScreen(self.x, self.z);
	// Facing yaw looks along (-sin yaw, -cos yaw) in x and z; north (-z) is up the page.
	const fx = -Math.sin(self.yaw);
	const fy = -Math.cos(self.yaw);
	const r = 9;
	ctx.fillStyle = RED;
	ctx.strokeStyle = PAPER;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(sx + fx * r * 1.4, sy + fy * r * 1.4);
	ctx.lineTo(sx - fx * r + fy * r * 0.8, sy - fy * r - fx * r * 0.8);
	ctx.lineTo(sx - fx * r * 0.4, sy - fy * r * 0.4);
	ctx.lineTo(sx - fx * r - fy * r * 0.8, sy - fy * r + fx * r * 0.8);
	ctx.closePath();
	ctx.stroke();
	ctx.fill();
}

/** North, in the top right corner. */
function compass(ctx: CanvasRenderingContext2D, width: number): void {
	const [x, y] = [width - 36, 44];
	ctx.strokeStyle = INK;
	ctx.fillStyle = INK;
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.arc(x, y, 16, 0, Math.PI * 2);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(x, y - 14);
	ctx.lineTo(x + 5, y + 2);
	ctx.lineTo(x, y - 2);
	ctx.lineTo(x - 5, y + 2);
	ctx.closePath();
	ctx.fill();
	ctx.font = '13px Cinzel, serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'bottom';
	ctx.fillText('N', x, y - 18);
}

/** Levels as the player counts them: the start is level 1, the next one down level 2. */
export function levelNumber(level: number): number {
	return 1 - level;
}

/** A pencil that wobbles: lines a little uneven, the same each time for the same line. */
class Pen {
	constructor(
		private ctx: CanvasRenderingContext2D,
		private toScreen: (x: number, z: number) => [number, number],
		private zoom: number
	) {}

	fill(x0: number, z0: number, x1: number, z1: number): void {
		const [ax, ay] = this.toScreen(x0, z0);
		const [bx, by] = this.toScreen(x1, z1);
		this.ctx.fillRect(ax, ay, bx - ax + 0.5, by - ay + 0.5);
	}

	/** From a to b (metres), in two light passes. `wobble` is how much it strays, in metres. */
	line(a: [number, number], b: [number, number], color = INK, wobble = 0.12): void {
		const ctx = this.ctx;
		ctx.strokeStyle = color;
		ctx.lineCap = 'round';
		const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
		const steps = Math.max(1, Math.round(length / 0.8));
		const [nx, nz] = length ? [-(b[1] - a[1]) / length, (b[0] - a[0]) / length] : [0, 0];
		for (let pass = 0; pass < 2; pass++) {
			ctx.lineWidth = pass ? 1 : 1.7;
			ctx.beginPath();
			for (let i = 0; i <= steps; i++) {
				const t = i / steps;
				const stray = (noise(a[0] + b[0] * 3, a[1] + b[1] * 3, i + pass * 17) - 0.5) * 2 * wobble;
				const [sx, sy] = this.toScreen(
					a[0] + (b[0] - a[0]) * t + nx * stray,
					a[1] + (b[1] - a[1]) * t + nz * stray
				);
				if (i === 0) ctx.moveTo(sx, sy);
				else ctx.lineTo(sx, sy);
			}
			ctx.stroke();
		}
	}

	ring(at: [number, number], radius: number, color: string): void {
		const [sx, sy] = this.toScreen(at[0], at[1]);
		this.ctx.strokeStyle = color;
		this.ctx.lineWidth = 1.5;
		this.ctx.beginPath();
		this.ctx.arc(sx, sy, radius * this.zoom, 0, Math.PI * 2);
		this.ctx.stroke();
	}

	/** A wavy line from `from`, `length` metres east: water. */
	wave(from: [number, number], length: number): void {
		const ctx = this.ctx;
		ctx.strokeStyle = INK;
		ctx.lineWidth = 1.2;
		ctx.beginPath();
		for (let i = 0; i <= 16; i++) {
			const t = i / 16;
			const [sx, sy] = this.toScreen(
				from[0] + t * length,
				from[1] + Math.sin(t * Math.PI * 4) * 0.15
			);
			if (i === 0) ctx.moveTo(sx, sy);
			else ctx.lineTo(sx, sy);
		}
		ctx.stroke();
	}

	label(text: string, at: [number, number], color: string): void {
		const [sx, sy] = this.toScreen(at[0], at[1]);
		this.ctx.fillStyle = color;
		this.ctx.font = `italic ${Math.round(Math.max(10, Math.min(15, this.zoom * 1.2)))}px Cinzel, serif`;
		this.ctx.textAlign = 'center';
		this.ctx.textBaseline = 'middle';
		this.ctx.fillText(text, sx, sy);
	}
}

/** A repeatable 0..1 from three numbers. */
function noise(a: number, b: number, c: number): number {
	const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
	return s - Math.floor(s);
}
