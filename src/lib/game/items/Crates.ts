import * as THREE from 'three';
import { CRATES } from '#lib/content/loot.ts';
import { modelUrl } from '#lib/content/models.ts';
import { loadModel } from '#lib/game/assets.ts';
import type { CratesSnapshot } from '#lib/shared/items/types.ts';
import type { CratePlacement } from '#lib/shared/map/types.ts';

interface Shown {
	root: THREE.Object3D;
	/** The lid: its origin is the hinge, and it turns about its X axis. */
	lid: THREE.Object3D | null;
	/** How far the lid is open, 0..1. */
	open: number;
	highlighted: boolean;
	/** Original materials, swapped for glowing copies while highlighted. */
	materials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
}

const MODEL = modelUrl('shared/props/crate.glb');
const CORPSE_MODEL = modelUrl('shared/props/corpse.glb');
const LID = 'crate-lid';
const HIGHLIGHT = new THREE.Color(0x2a2418);
/** Seconds the lid takes to swing up. */
const LID_TIME = 0.5;

/**
 * Loot crates, and the corpses searched like them. Where they lie comes with the map layout; each
 * tick says which have been opened (crate lids stay up) and which someone is going through. The
 * one you'd open glows faintly.
 * See docs/dev/items.md.
 */
export class Crates {
	readonly root = new THREE.Group();
	/** The crates of the current map (for the opening rule on the client). */
	placements: CratePlacement[] = [];
	private shown = new Map<string, Shown>();
	private opened = new Set<string>();
	private busy = new Set<string>();
	private buildId = 0;

	constructor() {
		this.root.name = 'crates';
	}

	/** Put a crate (or a corpse) at each place in the layout. */
	build(placements: CratePlacement[]): void {
		this.clear();
		this.placements = placements;
		const id = this.buildId;
		for (const placement of placements) {
			void loadModel(placement.kind === 'corpse' ? CORPSE_MODEL : MODEL).then((model) => {
				// A newer map was loaded while this one was on its way.
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
				this.shown.set(placement.id, {
					root: model,
					lid: model.getObjectByName(LID) ?? null,
					// One that was opened before we got here is already up.
					open: this.opened.has(placement.id) ? 1 : 0,
					highlighted: false,
					materials: new Map()
				});
			});
		}
	}

	apply(snapshot: CratesSnapshot): void {
		this.opened = new Set(snapshot.open);
		this.busy = new Set(snapshot.busy);
	}

	/** What stands at this id: a corpse, or (undefined) a crate. */
	kind(id: string): CratePlacement['kind'] {
		return this.placements.find((placement) => placement.id === id)?.kind;
	}

	/** Someone else is going through it. */
	inUse(id: string): boolean {
		return this.busy.has(id);
	}

	/** Glow the crate with this id (or none). */
	highlight(id: string | null): void {
		for (const [key, shown] of this.shown) {
			const on = key === id;
			if (shown.highlighted === on) continue;
			shown.highlighted = on;
			this.glow(shown, on);
		}
	}

	update(delta: number): void {
		for (const [id, shown] of this.shown) {
			const target = this.opened.has(id) ? 1 : 0;
			if (shown.open === target) continue;
			const step = delta / LID_TIME;
			shown.open =
				target > shown.open
					? Math.min(target, shown.open + step)
					: Math.max(target, shown.open - step);
			// Ease out: quick off the catch, slow to rest.
			const eased = 1 - (1 - shown.open) * (1 - shown.open);
			if (shown.lid) shown.lid.rotation.x = -eased * CRATES.lidAngle;
		}
	}

	clear(): void {
		this.buildId++;
		for (const shown of this.shown.values()) {
			this.glow(shown, false);
			shown.root.removeFromParent();
		}
		this.shown.clear();
		this.placements = [];
		this.opened.clear();
		this.busy.clear();
	}

	dispose(): void {
		this.clear();
	}

	private glow(shown: Shown, on: boolean): void {
		shown.root.traverse((node) => {
			if (!(node instanceof THREE.Mesh)) return;
			if (on) {
				if (shown.materials.has(node)) return;
				shown.materials.set(node, node.material);
				const lit = (m: THREE.Material) => {
					const copy = m.clone();
					if (copy instanceof THREE.MeshStandardMaterial) copy.emissive.copy(HIGHLIGHT);
					return copy;
				};
				node.material = Array.isArray(node.material) ? node.material.map(lit) : lit(node.material);
			} else {
				const original = shown.materials.get(node);
				if (!original) return;
				for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
					m.dispose();
				}
				node.material = original;
				shown.materials.delete(node);
			}
		});
	}
}
