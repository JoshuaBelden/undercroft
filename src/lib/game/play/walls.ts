import * as THREE from 'three';
import { MAP_KIT } from '#lib/content/map/kit.ts';
import { ITEMS } from '#lib/content/items.ts';
import { FALSE_WALLS, RUBBLE_WALLS } from '#lib/content/map/walls.ts';
import { works } from '#lib/shared/items/durability.ts';
import { loadModel } from '#lib/game/assets.ts';
import { held, heldWorking } from '#lib/shared/items/inventory.ts';
import type { GameEvent } from '#lib/shared/items/types.ts';
import { openDoor, type CollisionWorld } from '#lib/shared/map/collision.ts';
import { PIECES } from '#lib/shared/map/pieces.generated.ts';
import type { MapLayout, WallPlacement } from '#lib/shared/map/types.ts';
import { lookedAtPrySpot, prySpots, wallSpots, type PrySpot } from '#lib/shared/map/walls.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { Aim, PlayContext, PlayFeature, Prompt, TickMessage } from './feature.ts';
import { keyPrompt } from './prompt.ts';

/**
 * Walls across side passages (docs/dev/map-generation.md#false-walls, docs/dev/world.md): a false
 * wall drawn as the cap it looks like, a rubble wall as a fall of rock, a web as a sheet of web,
 * each until the tick says it is down, then gone and no longer solid. With a crowbar in the hand,
 * the wall at the end of any dead end prompts "Pry" (only a false wall gives); with something that
 * breaks rubble, a rubble wall prompts "Break through".
 */
export class Walls implements PlayFeature {
	private root = new THREE.Group();
	private models = new Map<string, THREE.Object3D>();
	private down = new Set<string>();
	private spots: PrySpot[] = [];
	private rubble: PrySpot[] = [];
	/** Whether what is aimed at is a rubble wall (broken), not a false wall (pried). */
	private breaking = false;
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
		this.rubble = wallSpots(layout, 'rubble');
		const id = this.buildId;
		for (const wall of layout.walls ?? []) {
			const def = PIECES[wall.piece];
			if (!def) continue;
			if (wall.kind) {
				if (wall.kind === 'web') this.webs.add(wall.id);
				const model = placeholder(wall);
				model.visible = !this.down.has(wall.id);
				this.models.set(wall.id, model);
				this.root.add(model);
				continue;
			}
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
			// A web's end is its own sound (webHit, below).
			if (!this.isWeb(event.id))
				sounds.playAt('crowbar.rocks', event.position, 1, FALSE_WALLS.fallNoise);
		} else if (event.kind === 'dig') {
			sounds.playAt('rubble.break', event.position, 1, RUBBLE_WALLS.noise);
		} else if (event.kind === 'webHit') {
			sounds.playAt(event.burned ? 'web.burn' : 'web.tear', event.position, 1, 4);
		} else if (event.kind === 'pry' && event.target === 'wall') {
			sounds.playAt('crowbar.pry', event.position, 1, FALSE_WALLS.pryNoise);
		}
	}

	target(state: PlayerState, aim: Aim | null, taken: boolean): boolean {
		this.aimedAt = null;
		this.breaking = false;
		if (!aim || taken) return false;
		// Something that breaks rubble in the hand, at a rubble wall: break through.
		const tool = held(state.inventory);
		if (works(tool) && ITEMS[tool.item]?.breaks?.includes('rubble')) {
			const standing = this.rubble.filter((spot) => !this.down.has(spot.wall!));
			this.aimedAt = lookedAtPrySpot(aim.world, aim.origin, aim.direction, standing);
			this.breaking = !!this.aimedAt;
			if (this.aimedAt) return true;
		}
		const bar = !!heldWorking(state.inventory, 'pry');
		const standing = this.spots.filter((spot) => !spot.wall || !this.down.has(spot.wall));
		this.aimedAt = bar ? lookedAtPrySpot(aim.world, aim.origin, aim.direction, standing) : null;
		return !!this.aimedAt;
	}

	private webs = new Set<string>();

	private isWeb(id: string): boolean {
		return this.webs.has(id);
	}

	prompt(state: PlayerState): Prompt | null {
		if (!this.aimedAt) return null;
		// Once it's done (and it held), nothing more until interact is let go.
		if (state.prying < 0) return null;
		if (this.breaking) {
			return keyPrompt('interact', 'Break through', state.prying / RUBBLE_WALLS.seconds);
		}
		return keyPrompt('interact', 'Pry', state.prying / FALSE_WALLS.prySeconds);
	}

	clear(): void {
		this.buildId++;
		for (const model of this.models.values()) model.removeFromParent();
		this.models.clear();
		this.webs.clear();
		this.rubble = [];
		this.down.clear();
		this.spots = [];
		this.aimedAt = null;
	}

	dispose(): void {
		this.clear();
		this.root.removeFromParent();
	}
}

/**
 * A rubble wall or a web until they have models: a heap of rock across the opening, or a pale
 * sheet of web (planned art: `shared/props/rubble-wall.glb`, `shared/props/spider-web.glb`).
 */
function placeholder(wall: WallPlacement): THREE.Object3D {
	const root = new THREE.Group();
	root.position.set(...wall.position);
	root.rotation.y = (wall.rotation * Math.PI) / 2;
	if (wall.kind === 'web') {
		const web = new THREE.Mesh(
			new THREE.PlaneGeometry(2.1, 2.8),
			new THREE.MeshStandardMaterial({
				color: 0xd8d4c4,
				transparent: true,
				opacity: 0.45,
				side: THREE.DoubleSide,
				roughness: 1,
				depthWrite: false
			})
		);
		web.position.set(0, 1.4, -FALSE_WALLS.depth);
		root.add(web);
	} else {
		const rock = new THREE.MeshStandardMaterial({ color: 0x4d463d, roughness: 1 });
		for (const [x, y, s] of [
			[-0.6, 0.45, 0.9],
			[0.55, 0.4, 0.85],
			[0, 1.2, 0.8],
			[-0.3, 1.9, 0.6],
			[0.4, 1.75, 0.55]
		]) {
			const lump = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rock);
			lump.position.set(x, y, -FALSE_WALLS.depth);
			root.add(lump);
		}
	}
	return root;
}
