import * as THREE from 'three';
import { ITEMS } from '#lib/content/items.ts';
import { loadModel } from '#lib/game/assets.ts';
import type { ProjectileSnapshot, WorldItemSnapshot } from '#lib/shared/items/types.ts';

interface Shown {
	root: THREE.Group;
	item: string;
	target: THREE.Vector3;
	highlighted: boolean;
	/** Hung on a wall (a hint): stood upright against it, at its position, not rested on a floor. */
	mounted: boolean;
	/** Original materials, swapped for glowing copies while highlighted. */
	materials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
}

const HIGHLIGHT = new THREE.Color(0x2a2418);
/** Box drawn for an item with no model and no placeholder of its own. */
const PLACEHOLDER = { size: [0.2, 0.1, 0.2] as [number, number, number], color: 0x777777 };

/**
 * Items on the floor and in flight, drawn from server snapshots. The item you'd pick up glows
 * faintly. Models rest on the floor by their lowest point. See docs/dev/items.md.
 */
export class WorldItems {
	readonly root = new THREE.Group();
	private items = new Map<string, Shown>();
	private flying = new Map<string, Shown>();
	/** Per model: how far its lowest point sits below its origin. */
	private rest = new Map<string, number>();
	/** Per item without a model: the box drawn in its place (shared by every one of them). */
	private placeholders = new Map<
		string,
		{ geometry: THREE.BoxGeometry; material: THREE.MeshStandardMaterial }
	>();
	/** Latest snapshots (for the pickup rule on the client). */
	snapshots: WorldItemSnapshot[] = [];

	constructor() {
		this.root.name = 'world-items';
	}

	/** Items undefined: unchanged since the last tick (the server leaves the list out). */
	apply(items: WorldItemSnapshot[] | undefined, projectiles: ProjectileSnapshot[]): void {
		if (items) {
			this.snapshots = items;
			this.sync(this.items, items, false);
		}
		this.sync(this.flying, projectiles, true);
	}

	clear(): void {
		this.apply([], []);
	}

	/** Glow the item with this id (or none). */
	highlight(id: string | null): void {
		for (const [key, shown] of this.items) this.setHighlight(shown, key === id);
	}

	update(delta: number): void {
		const t = Math.min(1, delta * 20);
		for (const shown of this.flying.values()) {
			shown.root.position.lerp(shown.target, t);
			shown.root.rotation.x += delta * 12;
		}
	}

	dispose(): void {
		this.clear();
		for (const { geometry, material } of this.placeholders.values()) {
			geometry.dispose();
			material.dispose();
		}
		this.placeholders.clear();
	}

	private sync(
		map: Map<string, Shown>,
		snaps: (WorldItemSnapshot | ProjectileSnapshot)[],
		flying: boolean
	): void {
		const seen = new Set<string>();
		for (const snap of snaps) {
			seen.add(snap.id);
			let shown = map.get(snap.id);
			if (!shown) {
				shown = this.create(snap.item, flying, 'normal' in snap && !!snap.normal);
				shown.root.position.set(...snap.position);
				map.set(snap.id, shown);
			}
			shown.target.set(...snap.position);
			if (shown.mounted) {
				// Its flat face against the wall, its long side upright.
				shown.root.position.copy(shown.target);
				shown.root.rotation.set(Math.PI / 2, 'yaw' in snap ? snap.yaw : 0, 0, 'YXZ');
			} else if (!flying) {
				shown.root.position.copy(shown.target);
				shown.root.position.y += this.rest.get(shown.item) ?? 0;
				shown.root.rotation.y = 'yaw' in snap ? snap.yaw : 0;
			}
		}
		for (const [id, shown] of map) {
			if (seen.has(id)) continue;
			shown.root.removeFromParent();
			for (const [mesh, original] of shown.materials) {
				disposeMaterial(mesh.material);
				mesh.material = original;
			}
			map.delete(id);
		}
	}

	private create(item: string, flying: boolean, mounted = false): Shown {
		const root = new THREE.Group();
		this.root.add(root);
		const shown: Shown = {
			root,
			item,
			target: new THREE.Vector3(),
			highlighted: false,
			mounted,
			materials: new Map()
		};
		const url = ITEMS[item]?.model;
		if (url) {
			void loadModel(url).then((model) => {
				model.traverse((node) => {
					if (node instanceof THREE.Mesh) {
						node.castShadow = true;
						node.receiveShadow = true;
					}
				});
				// Weapons lie on their side; boxes, bricks and bottles sit as modelled.
				const kind = ITEMS[item]?.kind;
				const lay = new THREE.Group();
				if (kind === 'melee' || kind === 'firearm') lay.rotation.z = Math.PI / 2;
				if (item === 'brick') lay.rotation.z = 0;
				lay.add(model);
				lay.updateMatrixWorld(true);
				if (!this.rest.has(item)) {
					// Rest on its lowest point.
					const box = new THREE.Box3().setFromObject(lay);
					this.rest.set(item, -box.min.y);
				}
				root.add(lay);
				if (!flying && !mounted) root.position.y = shown.target.y + (this.rest.get(item) ?? 0);
				if (shown.highlighted) this.applyGlow(shown, true);
			});
		} else {
			// No model yet: a plain box, so it can still be seen and picked up.
			const { size, color } = ITEMS[item]?.placeholder ?? PLACEHOLDER;
			let parts = this.placeholders.get(item);
			if (!parts) {
				parts = {
					geometry: new THREE.BoxGeometry(...size),
					material: new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
				};
				this.placeholders.set(item, parts);
			}
			const mesh = new THREE.Mesh(parts.geometry, parts.material);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			root.add(mesh);
			this.rest.set(item, size[1] / 2);
			if (!flying && !mounted) root.position.y = shown.target.y + size[1] / 2;
		}
		return shown;
	}

	private setHighlight(shown: Shown, on: boolean): void {
		if (shown.highlighted === on) return;
		shown.highlighted = on;
		this.applyGlow(shown, on);
	}

	private applyGlow(shown: Shown, on: boolean): void {
		shown.root.traverse((node) => {
			if (!(node instanceof THREE.Mesh)) return;
			if (on) {
				if (shown.materials.has(node)) return;
				shown.materials.set(node, node.material);
				const glow = (m: THREE.Material) => {
					const copy = m.clone();
					if (copy instanceof THREE.MeshStandardMaterial) copy.emissive.copy(HIGHLIGHT);
					return copy;
				};
				node.material = Array.isArray(node.material)
					? node.material.map(glow)
					: glow(node.material);
			} else {
				const original = shown.materials.get(node);
				if (!original) return;
				disposeMaterial(node.material);
				node.material = original;
				shown.materials.delete(node);
			}
		});
	}
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
	for (const m of Array.isArray(material) ? material : [material]) m.dispose();
}
