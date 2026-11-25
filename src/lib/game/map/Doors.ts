import * as THREE from 'three';
import { DOORS, GATES } from '#lib/content/doors.ts';
import { modelUrl } from '#lib/content/models.ts';
import { loadModel } from '#lib/game/assets.ts';
import { closeDoor, openDoor, type CollisionWorld } from '#lib/shared/map/collision.ts';
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
/** How far (m) the bar is lifted in that time. */
const BAR_LIFT = 0.35;
/** How much faster a door slams than it swings open. */
const SLAM = 5;

/**
 * The double doors between levels. Where they stand comes with the map layout; each tick says
 * which are open. An opened door swings open (bar up, then the leaves), and the local collision
 * world lets the player through. One the tick no longer lists (the final room's, at the rite)
 * slams shut and is solid again. See docs/dev/map-generation.md#doors.
 */
export class Doors {
	readonly root = new THREE.Group();
	placements: DoorPlacement[] = [];
	private shown = new Map<string, Shown>();
	private opened = new Set<string>();
	/** Sealed shut: not to be opened (from the tick). */
	private sealed = new Set<string>();
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
			if (placement.kind === 'gate') {
				const model = gateModel();
				model.position.set(...placement.position);
				model.rotation.y = placement.yaw;
				this.root.add(model);
				this.shown.set(placement.id, {
					root: model,
					left: model.getObjectByName('door-leaf-l') ?? null,
					right: model.getObjectByName('door-leaf-r') ?? null,
					bar: null,
					barY: 0,
					open: this.opened.has(placement.id) ? 1 : 0
				});
				this.pose(this.shown.get(placement.id)!);
				continue;
			}
			void loadModel(MODEL).then((model) => {
				if (id !== this.buildId) return;
				model.position.set(...placement.position);
				model.rotation.y = placement.yaw;
				// A door of its own size (a fixed room's doorway): the double door, fitted to it,
				// until rooms have doors of their own.
				if (placement.size) {
					model.scale.set(placement.size[0] / DOORS.size[0], placement.size[1] / DOORS.size[1], 1);
				}
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

	/**
	 * The doors open now, and sealed (from the tick). Newly opened ones stop being solid at once;
	 * ones shut again are solid at once.
	 */
	apply(open: string[], sealed: string[]): void {
		const now = new Set(open);
		for (const id of now) {
			if (this.opened.has(id)) continue;
			this.opened.add(id);
			if (this.world) openDoor(this.world, id);
		}
		for (const id of [...this.opened]) {
			if (now.has(id)) continue;
			this.opened.delete(id);
			if (this.world) closeDoor(this.world, id);
		}
		this.sealed = new Set(sealed);
	}

	isOpen(id: string): boolean {
		return this.opened.has(id);
	}

	isSealed(id: string): boolean {
		return this.sealed.has(id);
	}

	update(delta: number): void {
		for (const [id, shown] of this.shown) {
			const want = this.opened.has(id) ? 1 : 0;
			if (shown.open === want) continue;
			shown.open =
				want > shown.open
					? Math.min(1, shown.open + delta / DOORS.swingSeconds)
					: Math.max(0, shown.open - (delta * SLAM) / DOORS.swingSeconds);
			this.pose(shown);
		}
	}

	private pose(shown: Shown): void {
		const bar = Math.min(1, shown.open / BAR_SHARE);
		if (shown.bar) {
			// Lifted up and off: gone before the leaves move, so it never hangs across the doorway
			// (at eye height) while they swing.
			shown.bar.position.y = shown.barY + bar * BAR_LIFT;
			shown.bar.visible = shown.open < BAR_SHARE;
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
		this.sealed.clear();
		this.world = null;
	}

	dispose(): void {
		this.clear();
	}
}

/**
 * An iron gate until it has a model (planned art: `shared/props/mausoleum-gate.glb`): two leaves
 * of bars, hinged at the sides of the opening, named as the door model's leaves are.
 */
function gateModel(): THREE.Object3D {
	const root = new THREE.Group();
	const iron = new THREE.MeshStandardMaterial({ color: 0x2b2a28, metalness: 0.7, roughness: 0.6 });
	const [w, h] = GATES.size;
	const half = w / 2;
	for (const [name, side] of [
		['door-leaf-l', -1],
		['door-leaf-r', 1]
	] as const) {
		const leaf = new THREE.Group();
		leaf.name = name;
		leaf.position.set(side * half, 0, 0);
		for (let k = 0; k < 6; k++) {
			const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, 0.03), iron);
			bar.position.set(-side * (0.08 + k * 0.16), h / 2, 0);
			leaf.add(bar);
		}
		for (const y of [0.15, h / 2, h - 0.1]) {
			const rail = new THREE.Mesh(new THREE.BoxGeometry(half, 0.05, 0.05), iron);
			rail.position.set(-side * (half / 2), y, 0);
			leaf.add(rail);
		}
		root.add(leaf);
	}
	root.traverse((node) => {
		if (node instanceof THREE.Mesh) node.castShadow = true;
	});
	return root;
}
