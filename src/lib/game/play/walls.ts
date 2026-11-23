import * as THREE from 'three';
import { MAP_KIT } from '#lib/content/map/kit.ts';
import { ITEMS } from '#lib/content/items.ts';
import { FALSE_WALLS, RUBBLE_WALLS, WEBS } from '#lib/content/map/walls.ts';
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
import { HeldSounds } from './heldSounds.ts';
import { keyPrompt } from './prompt.ts';

/**
 * Walls across side passages (docs/dev/map-generation.md#false-walls, docs/dev/world.md): a false
 * wall drawn as the cap it looks like, a rubble wall as a fall of rock, a web as its strands
 * (torn into holes blow by blow, shaking as it is hit), each until the tick says it is down, then
 * gone and no longer solid. With a crowbar in the hand, the wall at the end of any dead end
 * prompts "Pry" (only a false wall gives); with something that breaks rubble, a rubble wall
 * prompts "Break through"; looking at a web says how to get through it.
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
	/** The web looked at (its prompt says how to get through), when nothing else is. */
	private aimedWeb: PrySpot | null = null;
	private webSpots: PrySpot[] = [];
	/** Each web as drawn: how torn it is (now, and heading to), and the shake left from a blow. */
	private webState = new Map<
		string,
		{ root: THREE.Object3D; torn: { value: number }; target: number; shake: number; hits: number }
	>();
	private buildId = 0;

	/** Prying at a wall: cut short when they let go (done, it is -1 and plays out). */
	private prying = new HeldSounds((state) => state.prying !== 0);

	constructor(private ctx: PlayContext) {
		this.root.name = 'false-walls';
		ctx.engine.scene.add(this.root);
	}

	mapLoaded(layout: MapLayout, world: CollisionWorld): void {
		this.clear();
		this.world = world;
		this.spots = prySpots(layout, PIECES, MAP_KIT);
		this.rubble = wallSpots(layout, 'rubble');
		this.webSpots = wallSpots(layout, 'web');
		const id = this.buildId;
		for (const wall of layout.walls ?? []) {
			const def = PIECES[wall.piece];
			if (!def) continue;
			if (wall.kind === 'web') {
				this.webs.add(wall.id);
				this.web(wall, id);
				continue;
			}
			if (wall.kind) {
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
		this.prying.check(tick.players);
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
			// A blow that didn't bring it down tears more of it, and shakes it.
			const web = this.webState.get(event.id);
			if (web && !event.down) {
				web.hits++;
				web.target = Math.min(0.9, web.hits * WEBS.torn);
				web.shake = WEBS.shake;
			}
		} else if (event.kind === 'pry' && event.target === 'wall') {
			this.prying.start(
				event.player,
				sounds.playAtHeld('crowbar.pry', event.position, 1, FALSE_WALLS.pryNoise)
			);
		}
	}

	target(state: PlayerState, aim: Aim | null, taken: boolean): boolean {
		this.aimedAt = null;
		this.aimedWeb = null;
		this.breaking = false;
		if (!aim || taken) return false;
		// A web: nothing to hold interact on, but the prompt says what gets through it.
		const webs = this.webSpots.filter((spot) => !this.down.has(spot.wall!));
		this.aimedWeb = lookedAtPrySpot(aim.world, aim.origin, aim.direction, webs);
		if (this.aimedWeb) return true;
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
		if (this.aimedWeb) return webPrompt(state);
		if (!this.aimedAt) return null;
		// Once it's done (and it held), nothing more until interact is let go.
		if (state.prying < 0) return null;
		if (this.breaking) {
			return keyPrompt('interact', 'Break through', state.prying / RUBBLE_WALLS.seconds);
		}
		return keyPrompt('interact', 'Pry', state.prying / FALSE_WALLS.prySeconds);
	}

	/** Every frame: webs ease toward how torn they are, and shake off a blow. */
	update(delta: number): void {
		for (const web of this.webState.values()) {
			web.torn.value += (web.target - web.torn.value) * Math.min(1, delta * 6);
			if (web.shake <= 0) continue;
			web.shake = Math.max(0, web.shake - delta);
			const k = web.shake / WEBS.shake;
			web.root.rotation.x = Math.sin(web.shake * 40) * 0.05 * k;
			web.root.position.z = -FALSE_WALLS.depth + Math.sin(web.shake * 33) * 0.04 * k;
		}
	}

	/**
	 * A web across an arch: its model, with a material of its own that tears holes in the strands
	 * as `torn` rises (`tearable`). Its geometry is the asset cache's; only the material is its own.
	 */
	private web(wall: WallPlacement, build: number): void {
		const anchor = new THREE.Group();
		anchor.position.set(...wall.position);
		anchor.rotation.y = (wall.rotation * Math.PI) / 2;
		anchor.visible = !this.down.has(wall.id);
		this.models.set(wall.id, anchor);
		this.root.add(anchor);
		void loadModel(WEBS.model).then((model) => {
			if (build !== this.buildId) return;
			model.position.z = -FALSE_WALLS.depth;
			const torn = { value: 0 };
			model.traverse((node) => {
				if (!(node instanceof THREE.Mesh)) return;
				node.material = tearable(node.material as THREE.Material, torn, wall.id);
				node.renderOrder = 1;
			});
			anchor.add(model);
			this.webState.set(wall.id, { root: model, torn, target: 0, shake: 0, hits: 0 });
		});
	}

	clear(): void {
		this.prying.clear();
		this.buildId++;
		for (const model of this.models.values()) model.removeFromParent();
		for (const web of this.webState.values()) {
			web.root.traverse((node) => {
				if (node instanceof THREE.Mesh) (node.material as THREE.Material).dispose();
			});
		}
		this.webState.clear();
		this.webSpots = [];
		this.aimedWeb = null;
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
 * What a web says to someone looking at it: with a weapon (or nothing) in the hand, swing at it;
 * with something that burns, throw it; otherwise, what would do.
 */
function webPrompt(state: PlayerState): Prompt {
	const stack = held(state.inventory);
	if (!stack) return keyPrompt('attack', 'to tear the web with your hands');
	const def = works(stack) ? ITEMS[stack.item] : undefined;
	if (def?.melee) return keyPrompt('attack', 'to tear the web');
	if (def?.throwable?.fire) return keyPrompt('attack', 'to throw it and burn the web');
	return { prompt: 'A web: tear it down with a weapon or your hands, or burn it', progress: 0 };
}

/** GLSL for the tearing: the uniform, the uv, and a patchy two-octave value noise. */
const WEB_NOISE = `#include <common>
uniform float uTorn;
varying vec2 vWebUv;
float webHash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float webNoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(webHash(i), webHash(i + vec2(1.0, 0.0)), f.x),
		mix(webHash(i + vec2(0.0, 1.0)), webHash(i + vec2(1.0, 1.0)), f.x),
		f.y
	);
}`;

/** Cuts the strands where the noise is under `uTorn`, softly, before the alpha test. */
const WEB_CUT = `float webCut = webNoise(vWebUv * 6.0) * 0.65 + webNoise(vWebUv * 17.0) * 0.35;
diffuseColor.a *= smoothstep(uTorn, uTorn + 0.05, webCut);
#include <alphatest_fragment>`;

/**
 * A copy of a web's material that cuts holes in its strands as `torn.value` rises (0 whole, 1
 * all holes): a patchy noise over its texture, so it comes apart in tatters rather than fading.
 * Its own program per web (the uniform is per web).
 */
function tearable(source: THREE.Material, torn: { value: number }, id: string): THREE.Material {
	const material = source.clone();
	material.depthWrite = false;
	material.onBeforeCompile = (shader) => {
		shader.uniforms.uTorn = torn;
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nvarying vec2 vWebUv;')
			.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWebUv = uv;');
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', WEB_NOISE)
			.replace('#include <alphatest_fragment>', WEB_CUT);
	};
	material.customProgramCacheKey = () => `web-${id}`;
	return material;
}

/**
 * A rubble wall until it has a model: a heap of rock across the opening (planned art:
 * `shared/props/rubble-wall.glb`).
 */
function placeholder(wall: WallPlacement): THREE.Object3D {
	const root = new THREE.Group();
	root.position.set(...wall.position);
	root.rotation.y = (wall.rotation * Math.PI) / 2;
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
	return root;
}
