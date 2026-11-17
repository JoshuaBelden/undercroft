import { MAP_KIT } from '#lib/content/map/kit.ts';
import { SURVEY } from '#lib/content/map/survey.ts';
import { LEVEL_HEIGHT, cellKey } from '#lib/shared/map/grid.ts';
import { PIECES } from '#lib/shared/map/pieces.generated.ts';
import { carriesSurvey, cellAt, surveyMap, type SurveyMap } from '#lib/shared/map/survey.ts';
import type { GameEvent } from '#lib/shared/items/types.ts';
import type { MapLayout } from '#lib/shared/map/types.ts';
import type { PlayerState, SurveyHold } from '#lib/shared/player/types.ts';
import type { ServerMessage } from '#lib/shared/protocol.ts';
import type { SketchContent } from '#lib/ui/mapSketch.ts';
import { SvelteSet } from 'svelte/reactivity';
import type { PlayContext, PlayFeature, Prompt } from './feature.ts';

/** The map screen's view: you on it, the holds (0..1, 1 once done) and who you could show it. */
export interface MapView {
	self: SketchContent['self'];
	sketch: number;
	share: number;
	partner: string | null;
}

/**
 * Your own map (docs/dev/map.md): what a map can show of this one, what you have drawn in it,
 * and the map screen's view while it is open. Opening it needs a notebook in the pack.
 */
export class Survey implements PlayFeature {
	/** What a map can show of this one. */
	map = $state.raw<SurveyMap | null>(null);
	/** The cells you have drawn. */
	drawn = $state.raw<ReadonlySet<string>>(new SvelteSet());
	/** While the map is open: you on it, how far the holds have got, and who you could show it. */
	view = $state<MapView>({ self: null, sketch: 0, share: 0, partner: null });
	/** Carrying a notebook: there is a map to open. */
	hasNotebook = false;
	/** Until when (ms) the HUD says there is no notebook, after the map key was pressed without one. */
	private noNotebookUntil = 0;

	constructor(private ctx: PlayContext) {}

	mapLoaded(layout: MapLayout): void {
		// What was drawn of a map that is gone is no use; the server sends what there is.
		this.map = surveyMap(layout, PIECES, MAP_KIT);
		this.drawn = new SvelteSet();
	}

	message(message: ServerMessage): void {
		if (message.type !== 'survey') return;
		this.drawn = new SvelteSet(message.cells.map(([x, z, level]) => cellKey(x, z, level)));
	}

	/** The map key pressed: false (and the HUD says why for a moment) without a notebook. */
	canOpen(): boolean {
		if (this.hasNotebook) return true;
		this.noNotebookUntil = performance.now() + 2500;
		return false;
	}

	/** What the map screen is holding (sketch, share or nothing): the server counts it. */
	hold(hold: SurveyHold): void {
		this.ctx.player.survey = hold;
	}

	/** First of all the prompts, for a moment after the map key found no notebook. */
	prompt(): Prompt | null {
		if (performance.now() < this.noNotebookUntil) {
			return { prompt: 'No notebook to draw a map in', progress: 0 };
		}
		return null;
	}

	event(event: GameEvent): void {
		const { sounds, client } = this.ctx;
		const self = client.playerId;
		// Your own pencil and pages are in your hands; someone else's are heard from where they are.
		if (event.kind === 'sketch') {
			if (event.player === self) sounds.play('map.sketch');
			else sounds.playAt('map.sketch', event.position, 1, 2);
		} else if (event.kind === 'showMap') {
			if (event.player === self || event.with === self) sounds.play('map.show');
			else sounds.playAt('map.show', event.position, 1, 2);
		}
	}

	self(state: PlayerState): void {
		const { ui } = this.ctx;
		this.hasNotebook = carriesSurvey(state.inventory);
		if (ui.panel !== 'map') return;
		// Going down, or the notebook gone from the pack, puts the map away.
		if (state.downed || !this.hasNotebook) ui.panel = null;
		else this.view = this.screenView(state);
	}

	private screenView(state: PlayerState): MapView {
		const { player, remote } = this.ctx;
		const feet = player.feetPosition() ?? state.position;
		const key = this.map ? cellAt(this.map, feet) : null;
		const level = key ? this.map!.cells.get(key)!.cell[2] : Math.round(feet[1] / LEVEL_HEIGHT);
		const progress = (seconds: number, of: number) => (seconds < 0 ? 1 : Math.min(1, seconds / of));
		let partner: string | null = null;
		let nearest: number = SURVEY.shareRange;
		for (const other of remote.players()) {
			const o = other.state;
			if (o.downed || o.dead) continue;
			const d = Math.hypot(
				o.position[0] - state.position[0],
				o.position[1] - state.position[1],
				o.position[2] - state.position[2]
			);
			if (d <= nearest) {
				nearest = d;
				partner = other.name;
			}
		}
		return {
			self: { x: feet[0], z: feet[2], level, yaw: player.look().yaw },
			sketch: progress(state.sketching, SURVEY.sketchSeconds),
			share: progress(state.sharing, SURVEY.shareSeconds),
			partner
		};
	}

	clear(): void {
		this.map = null;
		this.drawn = new SvelteSet();
	}
}
