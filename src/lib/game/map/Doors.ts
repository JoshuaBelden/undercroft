import * as THREE from 'three';
import { DOORS } from '#lib/content/doors.ts';
import { modelUrl } from '#lib/content/models.ts';
import { loadModel } from '#lib/game/assets.ts';
import { openDoor, type CollisionWorld } from '#lib/shared/map/collision.ts';
import type { DoorPlacement } from '#lib/shared/map/types.ts';

interface Shown {
	root: THREE.Object3D;
	/** The leaves: origins on their hinges, turned about their vertical axes. */
	left: THREE.Object3D | null;
	right: THREE.Object3D | null;
	/** The bar across them, lifted off first. */
	bar: THREE.Object3D | null;
	barY: number;
	/** How far it is open, 0..1. */
	open: number;
}

const MODEL = modelUrl('shared/props/door-double.glb');
/** Share of the opening spent lifting the bar before the leaves move. */
const BAR_SHARE = 0.2;

/**
 * The double doors between levels. Where they stand comes with the map layout; each tick says
 * which are open. An opened door swings open (bar up, then the leaves) and stays open, and the
 * local collision world lets the player through. See docs/dev/map-generation.md#doors.
 */
export class Doors {
	readonly root = new THREE.Group();
	placements: DoorPlacement[] = [];
	private shown = new Map<string, Shown>();
	private opened = new Set<string>();
	private world: CollisionWorld | null = null;
	private buildId = 0;

	constructor() {
		this.root.name = 'doors';
	}

	/** Hang a door at each place in the layout; `world` is the player's collision world. */
	build(placements: DoorPlacement[], world: CollisionWorld): void {
		this.clear();
		this.placements = placements;
		this.world = world;
		const id = this.buildId;
		for (const placement of placements) {
			void loadModel(MODEL).then((model) => {
				if (id !== this.buildId) return;
				model.position.set(...placement.position);
				model.rotation.y = placement.yaw;
				model.traverse((node) => {
					if (node instanceof THREE.Mesh) {
						node.castShadow = true;
						node.receiveShadow = true;
					}
				});
				this.root.add(model);
				const bar = model.getObjectByName('door-bar') ?? null;
				this.shown.set(placement.id, {
					root: model,
					left: model.getObjectByName('door-leaf-l') ?? null,
					right: model.getObjectByName('door-leaf-r') ?? null,
					bar,
					barY: bar?.position.y ?? 0,
					// One opened before we got here is open already.
					open: this.opened.has(placement.id) ? 1 : 0
				});
				this.pose(this.shown.get(placement.id)!);
			});
		}
	}

	/** The doors open now (from the tick). Newly opened ones stop being solid at once. */
	apply(open: string[]): void {
		for (const id of open) {
			if (this.opened.has(id)) continue;
			this.opened.add(id);
			if (this.world) openDoor(this.world, id);
		}
	}

	isOpen(id: string): boolean {
		return this.opened.has(id);
	}

	update(delta: number): void {
		for (const [id, shown] of this.shown) {
			if (!this.opened.has(id) || shown.open >= 1) continue;
			shown.open = Math.min(1, shown.open + delta / DOORS.swingSeconds);
			this.pose(shown);
		}
	}

	private pose(shown: Shown): void {
		const bar = Math.min(1, shown.open / BAR_SHARE);
		if (shown.bar) {
			shown.bar.position.y = shown.barY + bar * 0.35;
			shown.bar.visible = shown.open < 1;
		}
		const t = Math.max(0, (shown.open - BAR_SHARE) / (1 - BAR_SHARE));
		// Heavy: slow to start, then swinging to rest.
		const swing = t * t * (3 - 2 * t) * DOORS.swing;
		// The room side is -Z in the model; the leaves swing away from it, toward +Z. The left leaf
		// (hinged at -X, reaching +X) turns clockwise seen from above, the right one the other way.
		if (shown.left) shown.left.rotation.y = -swing;
		if (shown.right) shown.right.rotation.y = swing;
	}

	clear(): void {
		this.buildId++;
		for (const shown of this.shown.values()) shown.root.removeFromParent();
		this.shown.clear();
		this.placements = [];
		this.opened.clear();
		this.world = null;
	}

	dispose(): void {
		this.clear();
	}
}
