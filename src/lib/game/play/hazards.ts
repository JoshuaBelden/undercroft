import * as THREE from 'three';
import { ITEMS } from '#lib/content/items.ts';
import { settings } from '#lib/settings/settings.svelte.ts';
import { allStacks, held } from '#lib/shared/items/inventory.ts';
import { flightPath, throwOf } from '#lib/shared/items/projectile.ts';
import type { GameEvent, HazardsSnapshot } from '#lib/shared/items/types.ts';
import { aimRay, THROW_DRAW } from '#lib/shared/items/weapons.ts';
import type { CollisionWorld } from '#lib/shared/map/collision.ts';
import type { MapLayout, Vec3 } from '#lib/shared/map/types.ts';
import { eyeHeight } from '#lib/shared/player/simulate.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { PlayContext, PlayFeature, TickMessage } from './feature.ts';

/** A fire's light: warm, close, and only lit near enough to matter (it counts in the light budget). */
const FIRE_LIGHT = { color: 0xff8a3a, intensity: 6, distance: 7, decay: 2, near: 22 };
/** Whispers round a cursed thing's carrier: the first after this long, then every so often (s). */
const CURSE_WHISPER = { first: 6, every: [14, 30] as [number, number] };
/** The throw arc: how often it is worked out again (s), and its look. */
const ARC = { every: 1 / 30, color: 0xe6dccb, opacity: 0.35 };

/**
 * What is set down or set off in the map (docs/dev/combat.md): fires burning (a flame and a
 * light), snares set and lines of salt, as the tick says; the sounds of all of it, and of the
 * fighting the server tells (a gasp, a snag, a wound bleeding). And while a throw is drawn back,
 * its arc and where it will land (`flightPath`, the server's own flight), if the setting is on.
 */
export class Hazards implements PlayFeature {
	private root = new THREE.Group();
	private fires = new Map<string, { group: THREE.Group; light: THREE.PointLight }>();
	private snares = new Map<string, THREE.Object3D>();
	private wards = new Map<string, THREE.Object3D>();
	private world: CollisionWorld | null = null;
	private arc: THREE.Line;
	private mark: THREE.Mesh;
	private sinceArc = 0;
	private time = 0;
	private untilWhisper = 0;

	constructor(private ctx: PlayContext) {
		this.root.name = 'hazards';
		ctx.engine.scene.add(this.root);
		const line = new THREE.LineBasicMaterial({
			color: ARC.color,
			transparent: true,
			opacity: ARC.opacity,
			depthWrite: false
		});
		this.arc = new THREE.Line(new THREE.BufferGeometry(), line);
		this.arc.frustumCulled = false;
		this.arc.visible = false;
		this.mark = new THREE.Mesh(
			new THREE.RingGeometry(0.22, 0.3, 24).rotateX(-Math.PI / 2),
			new THREE.MeshBasicMaterial({
				color: ARC.color,
				transparent: true,
				opacity: ARC.opacity * 1.6,
				depthWrite: false
			})
		);
		this.mark.visible = false;
		this.root.add(this.arc, this.mark);
	}

	mapLoaded(_layout: MapLayout, world: CollisionWorld): void {
		this.world = world;
	}

	tick(tick: TickMessage): void {
		this.apply(tick.hazards);
	}

	private apply(hazards: HazardsSnapshot): void {
		sync(
			this.fires,
			hazards.fires,
			(fire) => this.fire(fire.position, fire.radius),
			(shown) => {
				this.root.remove(shown.group);
				dispose(shown.group);
			}
		);
		sync(
			this.snares,
			hazards.snares,
			(snare) => this.snare(snare.item, snare.position, snare.yaw),
			(shown) => {
				this.root.remove(shown);
				dispose(shown);
			}
		);
		sync(
			this.wards,
			hazards.wards,
			(ward) => this.ward(ward.a, ward.b),
			(shown) => {
				this.root.remove(shown);
				dispose(shown);
			}
		);
	}

	/** A fire: a low flame over its patch and a light, that flickers. */
	private fire(position: Vec3, radius: number): { group: THREE.Group; light: THREE.PointLight } {
		const group = new THREE.Group();
		group.position.set(...position);
		const flame = new THREE.Mesh(
			new THREE.ConeGeometry(radius * 0.6, 0.9, 10, 1, true),
			new THREE.MeshBasicMaterial({
				color: 0xff9a40,
				transparent: true,
				opacity: 0.55,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
				side: THREE.DoubleSide
			})
		);
		flame.position.y = 0.45;
		const patch = new THREE.Mesh(
			new THREE.CircleGeometry(radius, 20).rotateX(-Math.PI / 2),
			new THREE.MeshBasicMaterial({
				color: 0x2a0d02,
				transparent: true,
				opacity: 0.6,
				depthWrite: false
			})
		);
		patch.position.y = 0.02;
		const light = new THREE.PointLight(FIRE_LIGHT.color, 0, FIRE_LIGHT.distance, FIRE_LIGHT.decay);
		light.position.y = 0.8;
		group.add(flame, patch, light);
		this.root.add(group);
		return { group, light };
	}

	/** A snare set on the floor: its item's model when it has one, a small box till then. */
	private snare(item: string, position: Vec3, yaw: number): THREE.Object3D {
		const def = ITEMS[item];
		const [w, h, d] = def?.placeholder?.size ?? [0.4, 0.06, 0.4];
		const box = new THREE.Mesh(
			new THREE.BoxGeometry(w, h, d),
			new THREE.MeshStandardMaterial({ color: def?.placeholder?.color ?? 0x5b4a30, roughness: 0.9 })
		);
		box.position.set(position[0], position[1] + h / 2, position[2]);
		box.rotation.y = yaw;
		this.root.add(box);
		return box;
	}

	/** A line of salt across the floor. */
	private ward(a: Vec3, b: Vec3): THREE.Object3D {
		const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
		const line = new THREE.Mesh(
			new THREE.BoxGeometry(length, 0.02, 0.12),
			new THREE.MeshStandardMaterial({ color: 0xe9e4d6, roughness: 1 })
		);
		line.position.set((a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 0.01, (a[2] + b[2]) / 2);
		line.rotation.y = -Math.atan2(b[2] - a[2], b[0] - a[0]);
		this.root.add(line);
		return line;
	}

	event(event: GameEvent): void {
		const { sounds, client } = this.ctx;
		const mine = 'player' in event && event.player === client.playerId;
		switch (event.kind) {
			case 'winded':
				if (mine) sounds.play('player.winded');
				else sounds.playAt('player.winded', event.position, 1, 4);
				break;
			case 'snag':
				sounds.playAt('club.snag', event.position, 1, 4);
				break;
			case 'bleed':
				sounds.playAt('creature.bleed', event.position, 1, 4);
				break;
			case 'bitten':
				if (mine) sounds.play('lootable.nest');
				else sounds.playAt('lootable.nest', event.position, 1, 4);
				break;
			case 'shatter':
				sounds.playAt('item.break', event.position, 1, 5);
				break;
			case 'snared':
				sounds.playAt('snare.spring', event.position, 1, 6);
				break;
			case 'placed': {
				const spec = ITEMS[event.item]?.place;
				if (spec) sounds.playAt(spec.sound, event.position, 1, 4);
				break;
			}
			case 'fuseLit': {
				const fuse = ITEMS[event.item]?.throwable?.fuse;
				if (fuse) sounds.playAt(fuse.hiss, event.position, 1, 4);
				break;
			}
			case 'fuseBang': {
				const fuse = ITEMS[event.item]?.throwable?.fuse;
				if (fuse) sounds.playAt(fuse.bang, event.position, 1, fuse.noise);
				break;
			}
			case 'fire': {
				const fire = ITEMS[event.item]?.throwable?.fire;
				if (fire) sounds.playAt(fire.sound, event.position, 1, 8);
				sounds.playAt('fire.burn', event.position, 1, 6);
				break;
			}
		}
	}

	/** The throw arc, while a throw is drawn back (and the setting is on); whispers if cursed. */
	self(state: PlayerState, delta: number): void {
		this.whisper(state, delta);
		const w = state.weapon;
		const spec = throwOf(ITEMS[held(state.inventory)?.item ?? '']);
		const showing =
			settings.interface.throwPreview &&
			!!this.world &&
			!!spec &&
			w.action === 'draw' &&
			w.time >= THROW_DRAW * 0.25;
		this.arc.visible = this.mark.visible = false;
		if (!showing || !spec || !this.world) return;
		this.sinceArc += delta;
		if (this.sinceArc >= ARC.every || !this.arc.geometry.getAttribute('position')) {
			this.sinceArc = 0;
			const { origin, direction } = aimRay(state, eyeHeight(state));
			const { points, landing } = flightPath(this.world, origin, direction, spec.speed, spec.lift);
			// The first stretch is in front of the eye: leave it out, so the line isn't in your face.
			const shown = points.slice(Math.min(3, points.length - 1));
			this.arc.geometry.setFromPoints(shown.map((p) => new THREE.Vector3(...p)));
			if (landing) this.mark.position.set(landing[0], landing[1] + 0.03, landing[2]);
			this.mark.userData.landed = !!landing;
		}
		this.arc.visible = true;
		this.mark.visible = !!this.mark.userData.landed;
	}

	/**
	 * Carrying something cursed (the porcelain doll), whispers come now and then from close by
	 * (docs/dev/world.md#cursed-loot). Only you hear them.
	 */
	private whisper(state: PlayerState, delta: number): void {
		const cursed = allStacks(state.inventory).some((stack) => ITEMS[stack.item]?.cursed);
		if (!cursed) {
			this.untilWhisper = CURSE_WHISPER.first;
			return;
		}
		this.untilWhisper -= delta;
		if (this.untilWhisper > 0) return;
		this.untilWhisper =
			CURSE_WHISPER.every[0] + Math.random() * (CURSE_WHISPER.every[1] - CURSE_WHISPER.every[0]);
		const a = Math.random() * Math.PI * 2;
		const [x, y, z] = state.position;
		this.ctx.sounds.playAt('whisper', [x + Math.cos(a) * 1.5, y + 1.4, z + Math.sin(a) * 1.5], 0.8);
	}

	update(delta: number): void {
		this.time += delta;
		const camera = this.ctx.engine.camera.position;
		let k = 0;
		for (const { group, light } of this.fires.values()) {
			// Only near the camera does it light anything, so far fires cost no light.
			const near = group.position.distanceTo(camera) < FIRE_LIGHT.near;
			const flicker =
				0.75 + 0.25 * Math.sin(this.time * 17 + k * 2.3) * Math.sin(this.time * 7.1 + k);
			light.intensity = near ? FIRE_LIGHT.intensity * flicker : 0;
			k++;
		}
	}

	clear(): void {
		this.apply({ fires: [], snares: [], wards: [] });
		this.arc.visible = this.mark.visible = false;
	}

	dispose(): void {
		this.clear();
		this.arc.geometry.dispose();
		(this.arc.material as THREE.Material).dispose();
		this.mark.geometry.dispose();
		(this.mark.material as THREE.Material).dispose();
		this.root.removeFromParent();
	}
}

/** Make `shown` match `wanted` by id: build what is new, take away what is gone. */
function sync<T extends { id: string }, S>(
	shown: Map<string, S>,
	wanted: T[],
	build: (item: T) => S,
	remove: (item: S) => void
): void {
	const ids = new Set(wanted.map((item) => item.id));
	for (const [id, item] of shown) {
		if (ids.has(id)) continue;
		remove(item);
		shown.delete(id);
	}
	for (const item of wanted) if (!shown.has(item.id)) shown.set(item.id, build(item));
}

/** Free an object's own geometry and materials. */
function dispose(root: THREE.Object3D): void {
	root.traverse((node) => {
		if (!(node instanceof THREE.Mesh)) return;
		node.geometry.dispose();
		(node.material as THREE.Material).dispose();
	});
}
