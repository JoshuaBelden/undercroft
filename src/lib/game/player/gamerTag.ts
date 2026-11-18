import * as THREE from 'three';
import { GAMER_TAGS } from '#lib/content/player/gamerTags.ts';

/** The field of view `GAMER_TAGS.screenHeight` is measured at (degrees). */
const REFERENCE_FOV = 75;
/** Sprite height that fills `screenHeight` of the view: a sprite without attenuation is sized as at 1 m. */
const SPRITE_HEIGHT =
	GAMER_TAGS.screenHeight * 2 * Math.tan(THREE.MathUtils.degToRad(REFERENCE_FOV / 2));

/**
 * How opaque a tag `distance` metres from the camera is, 0..1 of its fullest: whole up to
 * `fullUntil`, gone from `goneAt`, eased in between so it doesn't seem to pop.
 */
export function tagOpacity(distance: number, fullUntil: number, goneAt: number): number {
	if (distance <= fullUntil) return 1;
	if (distance >= goneAt) return 0;
	const t = (distance - fullUntil) / (goneAt - fullUntil);
	return 1 - t * t * (3 - 2 * t);
}

/**
 * One explorer's gamer tag: their name on a sprite above their head, always facing the camera
 * and the same size on screen. It is depth-tested, so rock between you and them hides it, as it
 * hides them. Unlit, so it reads in the dark; fogged, so murky water swallows it.
 */
export class GamerTag {
	readonly sprite: THREE.Sprite;
	private readonly canvas = document.createElement('canvas');
	private readonly texture: THREE.CanvasTexture;
	private readonly material: THREE.SpriteMaterial;
	private name = '';

	constructor(name: string) {
		this.texture = new THREE.CanvasTexture(this.canvas);
		this.texture.colorSpace = THREE.SRGBColorSpace;
		this.material = new THREE.SpriteMaterial({
			map: this.texture,
			transparent: true,
			depthWrite: false,
			sizeAttenuation: false,
			toneMapped: false
		});
		this.sprite = new THREE.Sprite(this.material);
		this.sprite.name = 'gamer-tag';
		// Bottom middle on the anchor, so the name sits above the head.
		this.sprite.center.set(0.5, 0);
		this.sprite.renderOrder = 2;
		this.setName(name);
		// The typeface may still be loading: draw again once it's there.
		void globalThis.document?.fonts?.load(font()).then(
			() => this.draw(),
			() => {}
		);
	}

	/** Change the name shown (a no-op when it's the same). */
	setName(name: string): void {
		if (name === this.name) return;
		this.name = name;
		this.draw();
	}

	/**
	 * Place and fade the tag for this frame. `distance` is from the camera; `throughWalls` (admin)
	 * draws it over the rock.
	 */
	update(shown: boolean, distance: number, throughWalls: boolean): void {
		const opacity = shown
			? GAMER_TAGS.opacity * tagOpacity(distance, GAMER_TAGS.fullUntil, GAMER_TAGS.goneAt)
			: 0;
		this.sprite.visible = opacity > 0;
		this.material.opacity = opacity;
		if (this.material.depthTest === throughWalls) {
			this.material.depthTest = !throughWalls;
			this.sprite.renderOrder = throughWalls ? 999 : 2;
		}
	}

	dispose(): void {
		this.sprite.removeFromParent();
		this.texture.dispose();
		this.material.dispose();
	}

	private draw(): void {
		const ctx = this.canvas.getContext('2d');
		if (!ctx) return;
		const px = GAMER_TAGS.fontPx;
		const edge = Math.ceil(px * 0.12);
		ctx.font = font();
		const width = Math.ceil(ctx.measureText(this.name).width) + edge * 4;
		const height = Math.ceil(px * 1.3) + edge * 2;
		// Resizing clears the canvas and its state, so set the font again after.
		this.canvas.width = width;
		this.canvas.height = height;
		ctx.font = font();
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.lineJoin = 'round';
		ctx.lineWidth = edge * 2;
		ctx.strokeStyle = GAMER_TAGS.outline;
		ctx.strokeText(this.name, width / 2, height / 2);
		ctx.fillStyle = GAMER_TAGS.color;
		ctx.fillText(this.name, width / 2, height / 2);
		// A new canvas size needs a new GPU texture, not just new pixels.
		this.texture.dispose();
		this.texture.needsUpdate = true;
		this.sprite.scale.set((SPRITE_HEIGHT * width) / height, SPRITE_HEIGHT, 1);
	}
}

function font(): string {
	return GAMER_TAGS.font.replace('{px}', String(GAMER_TAGS.fontPx));
}
