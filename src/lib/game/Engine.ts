import * as THREE from 'three';

export interface FrameStats {
	fps: number;
	frameMs: number;
	drawCalls: number;
	triangles: number;
	lights: number;
}

/** Max dynamic lights active at once. Candles, headlamps, torches and glow sticks all count. */
export const LIGHT_BUDGET = 8;

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
		this.scene.background = new THREE.Color(0x050505);
		this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 200);

		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(canvas);
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
