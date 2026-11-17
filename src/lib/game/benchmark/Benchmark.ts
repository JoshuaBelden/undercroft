import * as THREE from 'three';
import { BENCHMARK, BENCHMARK_SECONDS, type BenchmarkStageDef } from '#lib/content/diagnostics.ts';
import { CREATURES } from '#lib/content/creatures.ts';
import { MAP_KIT } from '#lib/content/map/kit.ts';
import { PLAYER_MODEL } from '#lib/content/player/model.ts';
import { Animator } from '#lib/game/Animator.ts';
import { loadCharacter, warmCharacter } from '#lib/game/assets.ts';
import { Engine } from '#lib/game/Engine.ts';
import { MapRenderer } from '#lib/game/map/MapRenderer.ts';
import { Headlamp } from '#lib/game/player/Headlamp.ts';
import { RemotePlayers } from '#lib/game/player/RemotePlayers.ts';
import { settings } from '#lib/settings/settings.svelte.ts';
import {
	estimateRefresh,
	summarizeFrames,
	type BenchmarkResult,
	type BenchmarkStageResult
} from '#lib/shared/diagnostics.ts';
import { generateLayout } from '#lib/shared/map/generate.ts';
import { PIECES } from '#lib/shared/map/pieces.generated.ts';
import type { Vec3 } from '#lib/shared/map/types.ts';
import { createPlayerState, eyeHeight } from '#lib/shared/player/simulate.ts';
import type { PlayerSnapshot } from '#lib/shared/player/types.ts';
import { gpuCapabilities, textureMemory } from './device.ts';
import { benchmarkRoute, pointAlong } from './route.ts';

/**
 * Run Diagnostics' benchmark (docs/dev/diagnostics.md). It builds the benchmark map the way the
 * game does (the same MapRenderer, headlamps, explorers and creatures), walks the camera along
 * the same stretch for each quality preset, and measures every frame. Everything runs in the
 * browser: no server, no expedition, nothing saved.
 */

export interface BenchmarkProgress {
	/** Loading the map and models, or measuring a stage. */
	phase: 'loading' | 'running';
	/** The stage under way (1-based) and its name, while running. */
	stage: number;
	label: string;
	/** 0..1 of the whole run. */
	fraction: number;
}

/** Metres ahead of the camera it looks at: smooths the nav grid's zigzag out of the view. */
const LOOK_AHEAD = 3;
/** How quickly the view turns to face where the walk goes (per second). */
const TURN_RATE = 4;
/** Looks a little down, as a player walking does, so the floor is in view. */
const PITCH = -0.12;

export class BenchmarkCancelled extends Error {
	constructor(reason: string) {
		super(reason);
		this.name = 'BenchmarkCancelled';
	}
}

export async function runBenchmark(
	canvas: HTMLCanvasElement,
	onProgress: (progress: BenchmarkProgress) => void,
	signal: AbortSignal
): Promise<BenchmarkResult> {
	onProgress({ phase: 'loading', stage: 0, label: '', fraction: 0 });
	const engine = new Engine(canvas);
	engine.camera.rotation.order = 'YXZ';
	let contextLost = false;
	const lost = (event: Event): void => {
		event.preventDefault();
		contextLost = true;
	};
	canvas.addEventListener('webglcontextlost', lost);

	const map = new MapRenderer();
	engine.scene.add(map.root);
	// Near-black, as underground: the headlamps are the light.
	engine.scene.add(new THREE.AmbientLight(0xffffff, 0.012));
	const remote = new RemotePlayers();
	engine.scene.add(remote.root);
	const headlamp = new Headlamp(engine.camera);
	const creatures = new THREE.Group();
	engine.scene.add(creatures);
	const animators: Animator[] = [];

	try {
		const maxParty = Math.max(...BENCHMARK.stages.map((s) => s.party));
		const start = BENCHMARK.spacing * (maxParty - 1);
		const walk = BENCHMARK.speed * (BENCHMARK.warmup + BENCHMARK.seconds);
		const layout = generateLayout(BENCHMARK.seed, PIECES, MAP_KIT, {
			affliction: BENCHMARK.affliction
		});
		const route = benchmarkRoute(layout, PIECES, MAP_KIT, start + walk + LOOK_AHEAD);

		const loadStart = performance.now();
		const creature = Object.values(CREATURES)[0];
		await Promise.all([
			map.build(layout),
			warmCharacter(PLAYER_MODEL.model),
			...BENCHMARK.creatures.map(async (distance) => {
				const { scene, clips } = await loadCharacter(creature.model);
				const { position, heading } = pointAlong(route, distance);
				scene.rotation.y = creature.yawOffset + Math.atan2(heading[0], heading[2]);
				scene.position.set(...position);
				scene.traverse((node) => {
					if (node instanceof THREE.Mesh) {
						node.castShadow = true;
						node.frustumCulled = false;
					}
				});
				creatures.add(scene);
				const animator = new Animator(scene, clips, creature.animations);
				animator.play('idle');
				animators.push(animator);
			})
		]);
		const loadMs = Math.round(performance.now() - loadStart);
		if (signal.aborted) throw new BenchmarkCancelled('Cancelled');

		const stages: BenchmarkStageResult[] = [];
		const allFrames: number[] = [];
		const base = createPlayerState(route[0], 0);
		base.grounded = true;
		let yaw: number | null = null;

		await new Promise<void>((resolve, reject) => {
			let index = -1;
			let stage: BenchmarkStageDef = BENCHMARK.stages[0];
			let time = 0;
			let last = performance.now();
			let frames: number[] = [];
			let draws = 0;
			let triangles = 0;

			const begin = (next: number): void => {
				index = next;
				stage = BENCHMARK.stages[index];
				time = 0;
				frames = [];
				draws = 0;
				triangles = 0;
				yaw = null;
				engine.applyGraphics({
					...settings.graphics,
					quality: stage.quality,
					fov: 75,
					renderScale: 1,
					frameCap: 0
				});
				const shadows = stage.quality !== 'low';
				headlamp.setShadows(shadows, engine.shadowMapSize);
				// Every teammate's lamp, whatever the player's setting: results compare across machines.
				remote.setShadows(shadows, engine.shadowMapSize, 'all');
				// Others join (or leave) at the stage's start: their first frames fall in the warmup.
				if (stage.party <= 1) remote.clear();
			};

			const finish = (): void => {
				const summary = summarizeFrames(frames);
				allFrames.push(...frames);
				const n = Math.max(1, summary.frames);
				stages.push({
					id: stage.id,
					label: stage.label,
					...summary,
					drawCalls: Math.round(draws / n),
					triangles: Math.round(triangles / n),
					lights: engine.stats.lights
				});
			};

			const stop = engine.onUpdate((delta) => {
				const now = performance.now();
				const frameMs = now - last;
				last = now;
				if (signal.aborted || document.hidden || contextLost) {
					stop();
					reject(
						new BenchmarkCancelled(
							contextLost
								? 'The graphics card reset (WebGL context lost)'
								: document.hidden
									? 'The page was hidden, which pauses drawing'
									: 'Cancelled'
						)
					);
					return;
				}
				if (index < 0) begin(0);
				else {
					// The frame drawn since the last update, measured once the stage has settled.
					if (time >= BENCHMARK.warmup) {
						const info = engine.renderer.info.render;
						frames.push(frameMs);
						draws += info.calls;
						triangles += info.triangles;
					}
					time += frameMs / 1000;
				}
				if (time >= BENCHMARK.warmup + BENCHMARK.seconds) {
					finish();
					if (index + 1 >= BENCHMARK.stages.length) {
						stop();
						resolve();
						return;
					}
					begin(index + 1);
				}

				const distance = start + BENCHMARK.speed * time;
				place(distance, delta);
				const lampClock = time;
				headlamp.update({ ...base, lampClock });
				if (stage.party > 1) {
					const snaps: PlayerSnapshot[] = [];
					for (let i = 1; i < stage.party; i++) {
						const at = pointAlong(route, distance - i * BENCHMARK.spacing);
						const ahead = pointAlong(route, distance - i * BENCHMARK.spacing + LOOK_AHEAD);
						const state = createPlayerState(at.position, faceYaw(at.position, ahead.position));
						state.grounded = true;
						state.lampClock = lampClock + i * 3.7;
						state.velocity = [at.heading[0] * BENCHMARK.speed, 0, at.heading[2] * BENCHMARK.speed];
						snaps.push({ id: `bench-${i}`, name: `Explorer ${i + 1}`, state, ack: 0 });
					}
					remote.apply(snaps, null, now);
				}
				remote.update(delta, engine.camera);
				for (const animator of animators) animator.update(delta);
				onProgress({
					phase: 'running',
					stage: index + 1,
					label: stage.label,
					fraction: Math.min(
						1,
						(index * (BENCHMARK.warmup + BENCHMARK.seconds) + time) / BENCHMARK_SECONDS
					)
				});
			});

			/** The camera at eye height on the route, turning smoothly toward where it goes. */
			function place(distance: number, delta: number): void {
				const here = pointAlong(route, distance).position;
				const ahead = pointAlong(route, distance + LOOK_AHEAD).position;
				const want = faceYaw(here, ahead);
				if (yaw === null) yaw = want;
				else {
					const turn = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
					yaw += turn * Math.min(1, delta * TURN_RATE);
				}
				engine.camera.position.set(here[0], here[1] + eyeHeight(base), here[2]);
				engine.camera.rotation.set(PITCH, yaw, 0);
			}

			engine.start();
		});

		const memory = textureMemory(engine.scene);
		const size = engine.renderer.getDrawingBufferSize(new THREE.Vector2());
		return {
			seed: BENCHMARK.seed,
			loadMs,
			textures: memory.textures,
			textureMb: memory.mb,
			geometries: engine.renderer.info.memory.geometries,
			device: {
				...gpuCapabilities(engine.renderer),
				pixelRatio: Math.round(engine.renderer.getPixelRatio() * 100) / 100,
				canvas: `${size.x}×${size.y}`,
				refreshHz: estimateRefresh(allFrames)
			},
			stages,
			contextLost
		};
	} finally {
		for (const animator of animators) animator.dispose();
		remote.dispose();
		headlamp.dispose();
		map.clear();
		canvas.removeEventListener('webglcontextlost', lost);
		engine.dispose();
		// Give the GPU memory back now: Safari allows only a few live WebGL contexts.
		engine.renderer.forceContextLoss();
	}
}

/** The yaw that faces from `from` toward `to` (the camera looks down -Z). */
function faceYaw(from: Vec3, to: Vec3): number {
	return Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));
}
