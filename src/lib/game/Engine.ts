import * as THREE from 'three';
import type { GraphicsSettings } from '#lib/settings/settings.svelte.ts';

export interface FrameStats {
	fps: number;
	frameMs: number;
	drawCalls: number;
	triangles: number;
	lights: number;
}

/** Max dynamic lights active at once. Candles, headlamps, torches and glow sticks all count. */
export const LIGHT_BUDGET = 8;

/** Per-quality render settings. */
const QUALITY = {
	low: { pixelRatio: 1, shadows: false, shadowMapSize: 512 },
	medium: { pixelRatio: 1.5, shadows: true, shadowMapSize: 512 },
	high: { pixelRatio: 2, shadows: true, shadowMapSize: 1024 }
} as const;

/**
 * Owns the Three.js renderer, scene, camera and frame loop.
 * One Engine per game view; call `dispose()` on teardown.
 */
export class Engine {
	readonly renderer: THREE.WebGLRenderer;
	readonly scene = new THREE.Scene();
	readonly camera: THREE.PerspectiveCamera;
	private timer = new THREE.Timer();
	private frameHandle = 0;
	private updaters = new Set<(delta: number) => void>();
	private resizeObserver: ResizeObserver;
	private statsWindow = { frames: 0, elapsed: 0 };
	private lastStats: FrameStats = { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, lights: 0 };

	constructor(private canvas: HTMLCanvasElement) {
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.shadowMap.enabled = true;
		this.scene.background = new THREE.Color(0x000000);
		this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 200);
		// In the scene so lights attached to it (the headlamp) render.
		this.scene.add(this.camera);

		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(canvas);
		this.resize();
	}

	/** Shadow map size for the current quality; lights read it when casting shadows. */
	shadowMapSize = 1024;

	/** Apply player graphics settings (FOV, brightness, quality). Safe to call any time. */
	applyGraphics(graphics: GraphicsSettings): void {
		const quality = QUALITY[graphics.quality] ?? QUALITY.high;
		this.camera.fov = graphics.fov;
		this.camera.updateProjectionMatrix();
		this.renderer.toneMappingExposure = graphics.brightness;
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
		this.shadowMapSize = quality.shadowMapSize;
		if (this.renderer.shadowMap.enabled !== quality.shadows) {
			this.renderer.shadowMap.enabled = quality.shadows;
			// Materials compile shadow support in; force a rebuild.
			this.scene.traverse((object) => {
				if (object instanceof THREE.Mesh) {
					const materials = Array.isArray(object.material) ? object.material : [object.material];
					for (const material of materials) material.needsUpdate = true;
				}
			});
		}
		this.resize();
	}

	start(): void {
		const frame = (timestamp?: number) => {
			this.frameHandle = requestAnimationFrame(frame);
			this.timer.update(timestamp);
			const delta = Math.min(this.timer.getDelta(), 0.1);
			for (const update of this.updaters) update(delta);
			this.renderer.render(this.scene, this.camera);
			this.trackStats(delta);
		};
		frame();
	}

	/** Register a per-frame update. Returns an unsubscribe function. */
	onUpdate(update: (delta: number) => void): () => void {
		this.updaters.add(update);
		return () => this.updaters.delete(update);
	}

	get stats(): FrameStats {
		return this.lastStats;
	}

	dispose(): void {
		cancelAnimationFrame(this.frameHandle);
		this.timer.dispose();
		this.resizeObserver.disconnect();
		this.updaters.clear();
		this.scene.traverse((object) => {
			if (object instanceof THREE.Mesh) {
				object.geometry.dispose();
				const materials = Array.isArray(object.material) ? object.material : [object.material];
				for (const material of materials) material.dispose();
			}
		});
		this.renderer.dispose();
	}

	private resize(): void {
		const width = this.canvas.clientWidth;
		const height = this.canvas.clientHeight;
		if (width === 0 || height === 0) return;
		this.renderer.setSize(width, height, false);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
	}

	private trackStats(delta: number): void {
		this.statsWindow.frames++;
		this.statsWindow.elapsed += delta;
		if (this.statsWindow.elapsed < 0.5) return;
		let lights = 0;
		this.scene.traverse((object) => {
			if (
				object instanceof THREE.Light &&
				object.visible &&
				object.intensity > 0 &&
				!(object instanceof THREE.AmbientLight)
			)
				lights++;
		});
		const info = this.renderer.info.render;
		this.lastStats = {
			fps: Math.round(this.statsWindow.frames / this.statsWindow.elapsed),
			frameMs: (this.statsWindow.elapsed / this.statsWindow.frames) * 1000,
			drawCalls: info.calls,
			triangles: info.triangles,
			lights
		};
		this.statsWindow = { frames: 0, elapsed: 0 };
	}
}
