import { Candles as CandleModels } from '#lib/game/map/Candles.ts';
import { PIECES } from '#lib/shared/map/pieces.generated.ts';
import type { MapLayout } from '#lib/shared/map/types.ts';
import type { PlayContext, PlayFeature } from './feature.ts';

/**
 * Candles standing in the map (docs/dev/map-generation.md#candles): the start room's, lit for
 * the party as they gather, fading out once they have gone on down.
 */
export class Candles implements PlayFeature {
	private models = new CandleModels();

	constructor(private ctx: PlayContext) {
		ctx.engine.scene.add(this.models.root);
	}

	mapLoaded(layout: MapLayout): void {
		this.models.build(layout, PIECES);
	}

	update(delta: number): void {
		this.models.update(delta, this.ctx.engine.camera);
	}

	clear(): void {
		this.models.clear();
	}

	dispose(): void {
		this.models.dispose();
		this.models.root.removeFromParent();
	}
}
