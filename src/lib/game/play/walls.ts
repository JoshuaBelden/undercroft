import * as THREE from 'three';
import { ITEMS } from '#lib/content/items.ts';
import { MAP_KIT } from '#lib/content/map/kit.ts';
import { FALSE_WALLS } from '#lib/content/map/walls.ts';
import { loadModel } from '#lib/game/assets.ts';
import { held } from '#lib/shared/items/inventory.ts';
import type { GameEvent } from '#lib/shared/items/types.ts';
import { openDoor, type CollisionWorld } from '#lib/shared/map/collision.ts';
import { PIECES } from '#lib/shared/map/pieces.generated.ts';
import type { MapLayout } from '#lib/shared/map/types.ts';
import { lookedAtPrySpot, prySpots, type PrySpot } from '#lib/shared/map/walls.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { Aim, PlayContext, PlayFeature, Prompt, TickMessage } from './feature.ts';
import { keyPrompt } from './prompt.ts';

/**
 * False walls (docs/dev/map-generation.md#false-walls): each drawn as the cap it looks like until
 * the tick says it is down, then gone and no longer solid. With a crowbar in the hand, the wall
 * at the end of any dead end prompts "Pry"; only a false wall gives.
 */
export class Walls implements PlayFeature {
	private root = new THREE.Group();
	private models = new Map<string, THREE.Object3D>();
	private down = new Set<string>();
	private spots: PrySpot[] = [];
	private world: CollisionWorld | null = null;
	private aimedAt: PrySpot | null = null;
	private buildId = 0;

	constructor(private ctx: PlayContext) {
		this.root.name = 'false-walls';
		ctx.engine.scene.add(this.root);
	}

	mapLoaded(layout: MapLayout, world: CollisionWorld): void {
		this.clear();
		this.world = world;
		this.spots = prySpots(layout, PIECES, MAP_KIT);
		const id = this.buildId;
		for (const wall of layout.walls ?? []) {
			const def = PIECES[wall.piece];
			if (!def) continue;
			void loadModel(def.url).then((model) => {
				if (id !== this.buildId) return;
				model.position.set(...wall.position);
				model.rotation.y = (wall.rotation * Math.PI) / 2;
				model.traverse((node) => {
					if (node instanceof THREE.Mesh) {
						node.castShadow = true;
						node.receiveShadow = true;
					}
				});
				model.visible = !this.down.has(wall.id);
				this.models.set(wall.id, model);
				this.root.add(model);
			});
		}
	}

	tick(tick: TickMessage): void {
		for (const id of tick.walls) {
			if (this.down.has(id)) continue;
			this.down.add(id);
			if (this.world) openDoor(this.world, id);
			const model = this.models.get(id);
			if (model) model.visible = false;
		}
	}

	event(event: GameEvent): void {
		const { sounds } = this.ctx;
		if (event.kind === 'wallDown') {
			sounds.playAt('crowbar.rocks', event.position, 1, FALSE_WALLS.fallNoise);
		} else if (event.kind === 'pry' && event.target === 'wall') {
			sounds.playAt('crowbar.pry', event.position, 1, FALSE_WALLS.pryNoise);
		}
	}

	target(state: PlayerState, aim: Aim | null, taken: boolean): boolean {
		const bar = !!ITEMS[held(state.inventory)?.item ?? '']?.pry;
		const standing = this.spots.filter((spot) => !spot.wall || !this.down.has(spot.wall));
		this.aimedAt =
			aim && !taken && bar ? lookedAtPrySpot(aim.world, aim.origin, aim.direction, standing) : null;
		return !!this.aimedAt;
	}

	prompt(state: PlayerState): Prompt | null {
		if (!this.aimedAt) return null;
		// Once it's done (and it held), nothing more until interact is let go.
		if (state.prying < 0) return null;
		return keyPrompt('interact', 'Pry', state.prying / FALSE_WALLS.prySeconds);
	}

	clear(): void {
		this.buildId++;
		for (const model of this.models.values()) model.removeFromParent();
		this.models.clear();
		this.down.clear();
		this.spots = [];
		this.aimedAt = null;
	}

	dispose(): void {
		this.clear();
		this.root.removeFromParent();
	}
}
