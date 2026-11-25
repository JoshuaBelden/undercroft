import * as THREE from 'three';
import { loadModel } from '#lib/game/assets.ts';
import { applyLightmap, loadLightmap } from '#lib/game/rooms/roomModel.ts';
import { MAP_PIECES } from '#lib/shared/map/fixed.ts';
import { PIECES } from '#lib/shared/map/pieces.generated.ts';
import type { MapLayout } from '#lib/shared/map/types.ts';

/** How far above its place (m) the final room's ladder starts, and how long (s) it takes to come down. */
const LADDER_DROP = 5;
const LADDER_SECONDS = 2.2;

/**
 * Draws the fixed map (docs/dev/fixed-map.md): each room the layout places, as built, lit by its
 * baked lightmap. Rooms are a few big models each (not the generator's hundreds of small pieces,
 * which were merged into chunks), so each is added as it is and never moves.
 *
 * `lowerLadders` is the rite's ladder coming down in the final room: no room has one yet, so it has
 * nothing to lower until the rite returns (Phase 7).
 */
export class MapRenderer {
	readonly root = new THREE.Group();
	private buildId = 0;
	/** The final room's ladders, kept apart: hidden, or coming down. None in the fixed map yet. */
	private ladders = new THREE.Group();
	/** 0..1 of the way down; null while still hidden. */
	private lowered: number | null = null;

	constructor() {
		this.root.name = 'map';
		this.ladders.name = 'map-ladders';
	}

	async build(layout: MapLayout): Promise<void> {
		const id = ++this.buildId;
		this.lowered = null;
		const models = await Promise.all(
			layout.placements.map(async (placement) => {
				// A room of the fixed map; or a piece of the retired generator's, for the diagnostics
				// benchmark's map (src/lib/game/benchmark), until it walks the fixed map.
				const def = MAP_PIECES[placement.piece] ?? PIECES[placement.piece];
				if (!def) throw new Error(`Unknown room "${placement.piece}"`);
				const [model, lightmap] = await Promise.all([
					loadModel(def.url),
					'lightmap' in def && def.lightmap ? loadLightmap(def.lightmap.url) : Promise.resolve(null)
				]);
				applyLightmap(model, lightmap);
				model.position.set(...placement.position);
				model.rotation.y = (placement.rotation * Math.PI) / 2;
				model.traverse((object) => {
					if (object instanceof THREE.Mesh) object.castShadow = object.receiveShadow = true;
				});
				// The map doesn't move: no need to recompute the matrices every frame.
				model.updateMatrixWorld(true);
				model.traverse((object) => (object.matrixAutoUpdate = false));
				return model;
			})
		);
		// A newer build started while this one was loading.
		if (id !== this.buildId) return;
		this.clearMeshes();
		this.root.add(...models, this.ladders);
		this.pose();
	}

	/** The Affliction is resolved: the final room's ladder comes down (`instant`: it is down). */
	lowerLadders(instant: boolean): void {
		if (instant) this.lowered = 1;
		else this.lowered ??= 0;
		this.pose();
	}

	/** Whether there is a ladder to lower, and where (world space) it stands, for its sound. */
	ladderAt(): THREE.Vector3 | null {
		const first = this.ladders.children[0];
		return first ? new THREE.Box3().setFromObject(first).getCenter(new THREE.Vector3()) : null;
	}

	update(delta: number): void {
		if (this.lowered === null || this.lowered >= 1) return;
		this.lowered = Math.min(1, this.lowered + delta / LADDER_SECONDS);
		this.pose();
	}

	private pose(): void {
		this.ladders.visible = this.lowered !== null;
		const t = this.lowered ?? 0;
		// Let down fast, then a bump as it lands.
		const fall = t < 0.85 ? 1 - (t / 0.85) ** 2 : Math.sin(((t - 0.85) / 0.15) * Math.PI) * 0.04;
		this.ladders.position.y = fall * LADDER_DROP;
	}

	clear(): void {
		this.buildId++;
		this.lowered = null;
		this.clearMeshes();
	}

	/** The room models are clones from the asset cache: their geometry stays there. */
	private clearMeshes(): void {
		this.root.clear();
		this.ladders.clear();
	}
}
