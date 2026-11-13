import { REPORT } from '#lib/content/reports.ts';
import type { Diagnostics } from '#lib/shared/reports.ts';
import { GAME_VERSION } from '#lib/shared/version.ts';

/**
 * What a bug report carries besides the player's words: the version, the browser and GPU, and,
 * underground, the mode, the map seed, the room and the F3 numbers. The latest console warnings
 * and errors are kept here as they happen. The player sees all of it before sending, and can
 * leave it out. See docs/dev/reports.md.
 */

const lines: string[] = [];
let installed = false;

/** What the game view knows right now (set by the play page while it is open). */
export interface GameContext {
	mode: 'solo' | 'coop';
	seed: number | null;
	room: string | null;
	stats: Record<string, number>;
}

let context: (() => GameContext | null) | null = null;

/** The play page tells us how to ask what is going on underground; null when it closes. */
export function setGameContext(source: (() => GameContext | null) | null): void {
	context = source;
}

function keep(level: string, args: unknown[]): void {
	const text = args
		.map((arg) => {
			if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
			if (typeof arg === 'string') return arg;
			try {
				return JSON.stringify(arg);
			} catch {
				return String(arg);
			}
		})
		.join(' ');
	lines.push(
		`[${new Date().toISOString().slice(11, 19)}] ${level} ${text}`.slice(0, REPORT.consoleLineMax)
	);
	if (lines.length > REPORT.consoleLines) lines.shift();
}

/** Keep a copy of every console warning and error from now on (they still reach the console). */
export function captureConsole(): void {
	if (installed || typeof console === 'undefined') return;
	installed = true;
	for (const level of ['warn', 'error'] as const) {
		const original = console[level].bind(console);
		console[level] = (...args: unknown[]) => {
			keep(level, args);
			original(...args);
		};
	}
}

let gpu: string | undefined | null = null;

/** The GPU, as WebGL names it (asked once). */
function gpuName(): string | undefined {
	if (gpu !== null) return gpu;
	gpu = undefined;
	try {
		const gl = document.createElement('canvas').getContext('webgl');
		const info = gl?.getExtension('WEBGL_debug_renderer_info');
		if (gl && info) gpu = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
		gl?.getExtension('WEBGL_lose_context')?.loseContext();
	} catch {
		// Not every browser will say.
	}
	return gpu;
}

/** Everything a report would carry, now. */
export function collectDiagnostics(): Diagnostics {
	const diagnostics: Diagnostics = {
		version: GAME_VERSION,
		userAgent: navigator.userAgent,
		screen: `${window.innerWidth}×${window.innerHeight} @${Math.round(window.devicePixelRatio * 100) / 100}`,
		page: location.pathname,
		console: [...lines]
	};
	const name = gpuName();
	if (name) diagnostics.gpu = name;
	const game = context?.();
	if (game) {
		diagnostics.mode = game.mode;
		if (game.seed !== null) diagnostics.seed = game.seed;
		if (game.room) diagnostics.room = game.room;
		diagnostics.stats = game.stats;
	}
	return diagnostics;
}
