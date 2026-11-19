import * as THREE from 'three';
import { CANDLES } from '#lib/content/candles.ts';
import { toWorld } from '#lib/shared/map/grid.ts';
import type { MapLayout, PieceDef, Vec3 } from '#lib/shared/map/types.ts';

/** A room's candles: its flames, and the one light they make. */
interface CandleRoom {
	light: THREE.PointLight;
	/** A seed for its flicker, so two rooms don't flicker together. */
	phase: number;
}

/**
 * Candles standing in the map (candle-* markers, docs/dev/map-generation.md#candles): every
 * flame is a point in one `Points` (a single draw call), and each piece with candles gets one
 * warm light over them that flickers and fades out with distance, so it only counts against the
 * light budget (LIGHT_BUDGET) near the room. The wax is part of the piece's mesh.
 */
export class Candles {
	readonly root = new THREE.Group();
	private rooms: CandleRoom[] = [];
	private flames: THREE.Points | null = null;
	private material = new THREE.PointsMaterial({
		map: flameTexture(),
		color: CANDLES.flame.color,
		size: CANDLES.flame.size,
		sizeAttenuation: true,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending
	});
	private time = 0;
	private camera = new THREE.Vector3();

	build(layout: MapLayout, pieces: Record<string, PieceDef>): void {
		this.clear();
		const wicks: Vec3[] = [];
		for (const placement of layout.placements) {
			const local = pieces[placement.piece]?.candles ?? [];
			if (!local.length) continue;
			const here = local.map((point) => toWorld(placement, point));
			wicks.push(...here);
			const light = new THREE.PointLight(
				CANDLES.light.color,
				0,
				CANDLES.light.distance,
				CANDLES.light.decay
			);
			const middle = here.reduce((sum, p) => sum.add(new THREE.Vector3(...p)), new THREE.Vector3());
			middle.divideScalar(here.length);
			light.position.set(
				middle.x,
				Math.max(...here.map((p) => p[1])) + CANDLES.light.above,
				middle.z
			);
			this.root.add(light);
			this.rooms.push({ light, phase: this.rooms.length * 1.7 });
		}
		if (!wicks.length) return;
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(wicks.flat(), 3));
		this.flames = new THREE.Points(geometry, this.material);
		this.flames.frustumCulled = true;
		this.root.add(this.flames);
	}

	/** Flicker the flames and lights, and fade each light by how far the camera is from it. */
	update(delta: number, camera: THREE.Camera): void {
		if (!this.rooms.length) return;
		this.time += delta;
		camera.getWorldPosition(this.camera);
		const { depth, speed } = CANDLES.flicker;
		const [near, far] = CANDLES.fade;
		for (const room of this.rooms) {
			const t = this.time * speed + room.phase;
			// Two uneven waves: a candle's light never quite settles.
			const wave = 0.5 * Math.sin(t) + 0.3 * Math.sin(t * 2.7 + 1.3) + 0.2 * Math.sin(t * 5.1);
			const flicker = 1 - depth * (0.5 + 0.5 * wave);
			const distance = room.light.position.distanceTo(this.camera);
			const fade = THREE.MathUtils.clamp((far - distance) / (far - near), 0, 1);
			room.light.intensity = CANDLES.light.intensity * flicker * fade;
		}
		const t = this.time * CANDLES.flicker.speed;
		this.material.size = CANDLES.flame.size * (1 + 0.12 * Math.sin(t * 1.9) * Math.sin(t * 0.7));
	}

	clear(): void {
		for (const room of this.rooms) room.light.removeFromParent();
		this.rooms = [];
		if (this.flames) {
			this.flames.geometry.dispose();
			this.flames.removeFromParent();
			this.flames = null;
		}
	}

	dispose(): void {
		this.clear();
		this.material.map?.dispose();
		this.material.dispose();
	}
}

/** A small candle flame: a bright teardrop core in a soft glow, drawn once on a canvas. */
function flameTexture(): THREE.Texture {
	const size = 64;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d');
	if (ctx) {
		const glow = ctx.createRadialGradient(32, 36, 0, 32, 36, 32);
		glow.addColorStop(0, 'rgba(255, 220, 160, 0.55)');
		glow.addColorStop(1, 'rgba(255, 140, 50, 0)');
		ctx.fillStyle = glow;
		ctx.fillRect(0, 0, size, size);
		const core = ctx.createRadialGradient(32, 38, 0, 32, 38, 12);
		core.addColorStop(0, 'rgba(255, 250, 230, 1)');
		core.addColorStop(1, 'rgba(255, 190, 90, 0)');
		ctx.fillStyle = core;
		ctx.beginPath();
		ctx.moveTo(32, 14);
		ctx.quadraticCurveTo(42, 34, 32, 48);
		ctx.quadraticCurveTo(22, 34, 32, 14);
		ctx.fill();
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}
