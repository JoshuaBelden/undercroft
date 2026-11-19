import { SURVEY } from '#lib/content/map/survey.ts';
import { settings } from '#lib/settings/settings.svelte.ts';
import type { SurveyMap } from '#lib/shared/map/survey.ts';
import type { SurveyHold } from '#lib/shared/player/types.ts';
import type { SketchContent } from './mapSketch.ts';

/**
 * Where the map page is looking (docs/dev/map.md): the level shown, the point in the middle, the
 * zoom, and whether it follows you. Shared by the page (MapPane) and its buttons in the menu's
 * header (MapTools). It opens on your level, centred on you.
 */
export class MapView {
	level = $state(0);
	centre = $state({ x: 0, z: 0 });
	/** Keep you in the middle until the page is dragged away. */
	follow = $state(true);
	zoom = $state(clampZoom(settings.interface.mapZoom));
	/** What the controller holds down: X sketches, Y shows (the menu's holding). */
	padHold = $state<SurveyHold>(null);

	constructor(
		private map: () => SurveyMap,
		private self: () => SketchContent['self']
	) {
		const start = self();
		this.level = start?.level ?? map().levels[0] ?? 0;
		this.centre = { x: start?.x ?? 0, z: start?.z ?? 0 };
	}

	/** Position of the level shown in the map's list of levels. */
	get index(): number {
		return this.map().levels.indexOf(this.level);
	}

	get first(): boolean {
		return this.index <= 0;
	}

	get last(): boolean {
		return this.index < 0 || this.index >= this.map().levels.length - 1;
	}

	/** -1: the level above; 1: the one below. */
	changeLevel(by: -1 | 1): void {
		const next = this.map().levels[this.index + by];
		if (next === undefined) return;
		this.level = next;
		this.follow = this.level === this.self()?.level;
	}

	zoomBy(factor: number): void {
		this.zoom = clampZoom(this.zoom * factor);
	}

	/** The menu's X and Y buttons, held and let go. */
	holding(button: 'x' | 'y', down: boolean): void {
		const hold: SurveyHold = button === 'x' ? 'sketch' : 'share';
		if (down) this.padHold = hold;
		else if (this.padHold === hold) this.padHold = null;
	}

	/** Back to your level, centred on you. */
	findMe(): void {
		const self = this.self();
		if (!self) return;
		this.level = self.level;
		this.follow = true;
	}
}

export function clampZoom(value: number): number {
	return Math.max(SURVEY.zoom.min, Math.min(SURVEY.zoom.max, value || SURVEY.zoom.initial));
}
