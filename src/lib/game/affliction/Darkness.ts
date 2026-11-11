import * as THREE from 'three';
import type { SoundHandle } from '#lib/game/audio/AudioManager.ts';
import type { SoundBank } from '#lib/game/audio/SoundBank.ts';
import type { ManifestationSnapshot } from '#lib/shared/affliction/types.ts';
import type { Vec3 } from '#lib/shared/map/types.ts';

interface Wisp {
	sprite: THREE.Sprite;
	/** Orbit around the core: radius, height, angle, speed, size. */
	radius: number;
	height: number;
	angle: number;
	speed: number;
	size: number;
}

const WISPS = 46;
/** Metres at which its presence rumble fades out. */
const HEARD_FROM = 28;
/** Seconds the cloud takes to come apart when banished. */
const DISSOLVE = 3;

/**
 * The Gloaming's manifestation: a churning cloud of darkness, drawn as dark smoke sprites. It
 * stands out against lit stone and all but disappears in the dark. When light exposes it the
 * cloud thins and recoils, hissing; banished, it comes apart. A low rumble tells you it's near.
 * The real effect on players (lamps failing) is the shared gloom. See docs/dev/affliction.md.
 */
export class Darkness {
	readonly root = new THREE.Group();
	private wisps: Wisp[] = [];
	private texture: THREE.CanvasTexture;
	private material: THREE.SpriteMaterial;
	private target = new THREE.Vector3();
	private active = false;
	private state: ManifestationSnapshot['state'] = 'gathering';
	private exposed = false;
	/** 0..1 eased toward 1 while exposed. */
	private thin = 0;
	private recoil = 0;
	private time = 0;
	private dissolve = 0;
	private presence: SoundHandle | null = null;
	private presenceStarting = false;

	constructor(private sounds: SoundBank) {
		this.root.name = 'darkness';
		this.texture = new THREE.CanvasTexture(smokeCanvas());
		this.material = new THREE.SpriteMaterial({
			map: this.texture,
			color: 0x000000,
			transparent: true,
			opacity: 0.75,
			depthWrite: false
		});
		for (let i = 0; i < WISPS; i++) {
			const sprite = new THREE.Sprite(this.material);
			const wisp: Wisp = {
				sprite,
				radius: 0.2 + Math.random() * 1.6,
				height: 0.1 + Math.random() * 2.4,
				angle: Math.random() * Math.PI * 2,
				speed: (0.2 + Math.random() * 0.6) * (Math.random() < 0.5 ? -1 : 1),
				size: 0.9 + Math.random() * 1.6
			};
			this.wisps.push(wisp);
			this.root.add(sprite);
		}
		this.root.visible = false;
	}

	apply(snap: ManifestationSnapshot | null): void {
		if (!snap) {
			if (this.active && this.state !== 'banished') this.clear();
			return;
		}
		this.target.set(...snap.position);
		if (!this.active) {
			this.active = true;
			this.root.position.copy(this.target);
			this.root.visible = true;
			this.dissolve = 0;
		}
		if (snap.exposed && !this.exposed) {
			this.sounds.playAt('manifest.hiss', this.corePoint(), 1, 4);
		}
		if (snap.state === 'banished' && this.state !== 'banished') {
			this.sounds.playAt('manifest.banish', this.corePoint(), 1, 8);
		}
		this.exposed = snap.exposed;
		this.state = snap.state;
	}

	/** A weapon hit it: a shudder. */
	hit(): void {
		this.recoil = 1;
	}

	clear(): void {
		this.active = false;
		this.root.visible = false;
		this.presence?.setVolume(0);
	}

	update(delta: number, listener: Vec3): void {
		if (!this.active) return;
		this.time += delta;
		this.root.position.lerp(this.target, Math.min(1, delta * 6));
		this.thin += ((this.exposed ? 1 : 0) - this.thin) * Math.min(1, delta * 6);
		this.recoil = Math.max(0, this.recoil - delta * 3);
		if (this.state === 'banished') this.dissolve = Math.min(1, this.dissolve + delta / DISSOLVE);
		const gathering = this.state === 'gathering';
		// Gathering: drawn in tight, swelling. Exposed: thinner and pushed outward.
		const spread = (gathering ? 0.6 : 1) + this.thin * 0.5 + this.recoil * 0.4 + this.dissolve * 4;
		for (const w of this.wisps) {
			w.angle += w.speed * delta * (1 + this.thin + this.dissolve * 3);
			const r = w.radius * spread;
			const bob = Math.sin(this.time * 0.7 + w.angle * 3) * 0.15;
			w.sprite.position.set(
				Math.cos(w.angle) * r,
				w.height + bob + this.dissolve * w.height,
				Math.sin(w.angle) * r
			);
			w.sprite.scale.setScalar(w.size * (1 + this.dissolve));
		}
		this.material.opacity = 0.75 * (1 - this.thin * 0.45) * (1 - this.dissolve);
		if (this.dissolve >= 1) this.clear();

		// Presence rumble, louder the closer it is.
		if (!this.presence && !this.presenceStarting) {
			this.presenceStarting = true;
			void this.sounds.loop('manifest.presence').then((handle) => (this.presence = handle));
		}
		const p = this.root.position;
		const d = Math.hypot(listener[0] - p.x, listener[1] - p.y - 1, listener[2] - p.z);
		const level = Math.max(0, 1 - d / HEARD_FROM) ** 2 * (1 - this.dissolve);
		this.presence?.setVolume(level);
		this.presence?.setRate(1 + this.thin * 0.15);
	}

	dispose(): void {
		this.presence?.stop();
		this.presence = null;
		this.root.clear();
		this.material.dispose();
		this.texture.dispose();
	}

	private corePoint(): Vec3 {
		return [this.root.position.x, this.root.position.y + 1.1, this.root.position.z];
	}
}

/** Soft round smoke puff: opaque centre fading to transparent. */
function smokeCanvas(): HTMLCanvasElement {
	const size = 64;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const g = canvas.getContext('2d');
	if (g) {
		const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
		gradient.addColorStop(0, 'rgba(255,255,255,1)');
		gradient.addColorStop(0.45, 'rgba(255,255,255,0.55)');
		gradient.addColorStop(1, 'rgba(255,255,255,0)');
		g.fillStyle = gradient;
		g.fillRect(0, 0, size, size);
	}
	return canvas;
}
