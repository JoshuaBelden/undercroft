import * as THREE from 'three';
import { LOOTABLES, type LootableDef } from '#lib/content/lootables.ts';
import { loadModel } from '#lib/game/assets.ts';
import type { CratesSnapshot } from '#lib/shared/items/types.ts';
import type { CratePlacement } from '#lib/shared/map/types.ts';

interface Shown {
	root: THREE.Object3D;
	/** The lid: its origin is the hinge, and it turns about its X axis by `angle`. */
	lid: THREE.Object3D | null;
	angle: number;
	/** How far the lid is open, 0..1. */
	open: number;
	highlighted: boolean;
	/** Original materials, swapped for glowing copies while highlighted. */
	materials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
}

const HIGHLIGHT = new THREE.Color(0x2a2418);
/** Seconds the lid takes to swing up. */
const LID_TIME = 0.5;

/**
 * Lootables: crates, corpses, trunks and the rest (LOOTABLES). Where they lie comes with the map
 * layout; each tick says which have been opened (crate lids stay up) and which someone is going
 * through. One with no model yet is a box of its size and colour. The one you'd open glows faintly.
 * See docs/dev/lootables.md.
 */
export class Crates {
	readonly root = new THREE.Group();
	/** The crates of the current map (for the opening rule on the client). */
	placements: CratePlacement[] = [];
	private shown = new Map<string, Shown>();
	private opened = new Set<string>();
	private busy = new Set<string>();
	private jammed = new Set<string>();
	private locked = new Set<string>();
	private buildId = 0;

	constructor() {
		this.root.name = 'crates';
	}

	/** Put the lootable at each place in the layout. */
	build(placements: CratePlacement[]): void {
		this.clear();
		this.placements = placements;
		const id = this.buildId;
		for (const placement of placements) {
			const def = LOOTABLES[placement.kind ?? 'crate'];
			const loaded = def.model ? loadModel(def.model) : Promise.resolve(placeholder(def));
			void loaded.then((model) => {
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
					lid: def.lid ? (model.getObjectByName(def.lid.part) ?? null) : null,
					angle: def.lid?.angle ?? 0,
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
		this.jammed = new Set(snapshot.jammed);
		this.locked = new Set(snapshot.locked);
	}

	/** Found jammed and not pried open yet. */
	isJammed(id: string): boolean {
		return this.jammed.has(id);
	}

	/** A trunk still locked. */
	isLocked(id: string): boolean {
		return this.locked.has(id);
	}

	/** What stands at this id: a corpse, a trunk, or (undefined) a crate. */
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
			if (shown.lid) shown.lid.rotation.x = -eased * shown.angle;
		}
	}

	clear(): void {
		this.buildId++;
		for (const shown of this.shown.values()) {
			this.glow(shown, false);
			shown.root.removeFromParent();
			// A placeholder box is this map's own; a model is shared from the cache.
			if (shown.root.name.startsWith('placeholder-')) {
				shown.root.traverse((node) => {
					if (!(node instanceof THREE.Mesh)) return;
					node.geometry.dispose();
					(node.material as THREE.Material).dispose();
				});
			}
		}
		this.shown.clear();
		this.placements = [];
		this.opened.clear();
		this.busy.clear();
		this.jammed.clear();
		this.locked.clear();
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

/** A lootable with no model yet: a box of its size and colour, standing on the floor. */
function placeholder(def: LootableDef): THREE.Object3D {
	const [w, h, d] = def.size;
	const box = new THREE.Mesh(
		new THREE.BoxGeometry(w, h, d),
		new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.9 })
	);
	box.position.y = h / 2;
	const root = new THREE.Group();
	root.name = `placeholder-${def.id}`;
	root.add(box);
	return root;
}
