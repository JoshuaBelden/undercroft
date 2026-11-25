import * as THREE from 'three';
import { ITEMS } from '#lib/content/items.ts';
import { TAROT } from '#lib/content/tarot.ts';
import { raise } from '#lib/game/alerts.svelte.ts';
import { loadModel } from '#lib/game/assets.ts';
import { settings } from '#lib/settings/settings.svelte.ts';
import { allStacks, canTake, held } from '#lib/shared/items/inventory.ts';
import { lookedAtItem } from '#lib/shared/items/pickup.ts';
import { flightPath, throwOf } from '#lib/shared/items/projectile.ts';
import type { GameEvent, HazardsSnapshot } from '#lib/shared/items/types.ts';
import { aimRay, THROW_DRAW } from '#lib/shared/items/weapons.ts';
import type { CollisionWorld } from '#lib/shared/map/collision.ts';
import type { MapLayout, Vec3 } from '#lib/shared/map/types.ts';
import { eyeHeight } from '#lib/shared/player/simulate.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { Aim, PlayContext, PlayFeature, Prompt, TickMessage } from './feature.ts';
import { keyPrompt } from './prompt.ts';

/**
 * A fire's light: warm, close, `above` its patch, and only lit near enough to matter; the `lit`
 * nearest the camera get one (it counts in the light budget).
 */
const FIRE_LIGHT = {
	color: 0xff8a3a,
	intensity: 6,
	distance: 7,
	decay: 2,
	near: 22,
	lit: 2,
	above: 0.8
};
/**
 * A glow stick's light: green, small, `above` the stick, fading over its last `fade` share; only
 * the `lit` nearest the camera are lit at all, so a floor full of them stays in the light budget.
 */
const GLOW_LIGHT = { intensity: 2.5, decay: 2, near: 25, lit: 4, fade: 0.2, above: 0.25 };
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
	private fires = new Map<string, { group: THREE.Group; phase: number }>();
	private snares = new Map<string, THREE.Object3D>();
	private wards = new Map<string, THREE.Object3D>();
	private glows = new Map<string, Glow>();
	/**
	 * The lights fires and glow sticks share, the nearest of them lit each frame. They are made
	 * once and stay in the scene, dark when there is nothing to light: adding or taking away a light
	 * changes the scene's light count, and Three.js recompiles every material for it, a hitch of a
	 * second or more each time a glow stick landed or a fire caught.
	 */
	private fireLights: THREE.PointLight[] = [];
	private glowLights: THREE.PointLight[] = [];
	/** Fires made so far: each one's flicker phase, so two fires don't flicker together. */
	private firesMade = 0;
	private baits = new Map<string, THREE.Object3D>();
	private charges = new Map<string, THREE.Object3D>();
	private tripwires = new Map<string, THREE.Object3D>();
	/** What was set down that can be taken up again (snares, tripwire bells), as the tick says. */
	private takeable: { id: string; item: string; position: Vec3 }[] = [];
	/** The one of them interact would take up. */
	private aimedAt: { id: string; item: string } | null = null;
	private world: CollisionWorld | null = null;
	private arc: THREE.Line;
	private mark: THREE.Mesh;
	private sinceArc = 0;
	private time = 0;
	private untilWhisper = 0;
	private untilSwing = 0;

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
		for (let i = 0; i < FIRE_LIGHT.lit; i++) {
			const light = new THREE.PointLight(
				FIRE_LIGHT.color,
				0,
				FIRE_LIGHT.distance,
				FIRE_LIGHT.decay
			);
			this.fireLights.push(light);
			this.root.add(light);
		}
		for (let i = 0; i < GLOW_LIGHT.lit; i++) {
			const light = new THREE.PointLight(0xffffff, 0, 7, GLOW_LIGHT.decay);
			this.glowLights.push(light);
			this.root.add(light);
		}
	}

	mapLoaded(_layout: MapLayout, world: CollisionWorld): void {
		this.world = world;
	}

	tick(tick: TickMessage): void {
		this.apply(tick.hazards);
	}

	private apply(hazards: HazardsSnapshot): void {
		// What interact can take up again: where the server looks for it (HazardSystem.takeBack).
		this.takeable = [
			...hazards.snares.map(({ id, item, position }) => ({ id, item, position })),
			...hazards.tripwires.map(({ id, item, a, b }) => ({
				id,
				item,
				position: [(a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2] as Vec3
			}))
		];
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
		sync(
			this.glows,
			hazards.glows,
			(glow) => this.glow(glow.item, glow.position, glow.left, glow.seconds),
			(shown) => {
				this.root.remove(shown.group);
				dispose(shown.group);
			}
		);
		// How long each has left, as the server last said.
		for (const glow of hazards.glows) {
			const shown = this.glows.get(glow.id);
			if (shown) shown.left = glow.left;
		}
		sync(
			this.baits,
			hazards.baits,
			(bait) => this.snare(bait.item, bait.position, 0),
			(shown) => {
				this.root.remove(shown);
				dispose(shown);
			}
		);
		sync(
			this.charges,
			hazards.charges,
			(charge) => this.snare(charge.item, charge.position, 0),
			(shown) => {
				this.root.remove(shown);
				dispose(shown);
			}
		);
		sync(
			this.tripwires,
			hazards.tripwires,
			(wire) => this.tripwire(wire.item, wire.a, wire.b),
			(shown) => {
				this.root.remove(shown);
				dispose(shown);
			}
		);
	}

	/** A glow stick lying lit: a small green stick (its light is one of `glowLights`, if near). */
	private glow(item: string, position: Vec3, left: number, seconds: number): Glow {
		const spec = ITEMS[item]?.throwable?.glow;
		const color = spec?.color ?? 0x7dff8a;
		const group = new THREE.Group();
		group.position.set(...position);
		const stick = new THREE.Mesh(
			new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8).rotateZ(Math.PI / 2),
			new THREE.MeshBasicMaterial({ color })
		);
		stick.position.y = 0.02;
		group.add(stick);
		this.root.add(group);
		return { group, color, range: spec?.range ?? 7, left, seconds };
	}

	/**
	 * A snare or a tripwire bell set down, in view and in reach: interact takes it up again. A
	 * floor item comes first (its prompt is ahead of this one, and the server takes it first).
	 */
	target(state: PlayerState, aim: Aim | null, taken: boolean): boolean {
		const found =
			aim && !taken
				? lookedAtItem(aim.world, state.position, aim.origin, aim.direction, this.takeable)
				: null;
		this.aimedAt = found ? { id: found.id, item: found.item } : null;
		return !!found;
	}

	prompt(state: PlayerState): Prompt | null {
		if (!this.aimedAt) return null;
		const { item } = this.aimedAt;
		const name = ITEMS[item]?.name ?? item;
		const fit = canTake(state.inventory, { item, count: 1 });
		if (fit === 'heavy') return { prompt: name + ': too heavy to carry', progress: 0 };
		if (fit === 'full') return { prompt: name + ': no room for it', progress: 0 };
		return keyPrompt('interact', `to take up the ${name.toLowerCase()}`);
	}

	/** A tripwire: a taut line across the way, its bell at one end (the item's model when it has one). */
	private tripwire(item: string, a: Vec3, b: Vec3): THREE.Object3D {
		const group = new THREE.Group();
		const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
		const line = new THREE.Mesh(
			new THREE.BoxGeometry(length, 0.008, 0.008),
			new THREE.MeshBasicMaterial({ color: 0xb8ad94 })
		);
		line.position.set((a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 0.15, (a[2] + b[2]) / 2);
		line.rotation.y = -Math.atan2(b[2] - a[2], b[0] - a[0]);
		const bell = new THREE.Mesh(
			new THREE.ConeGeometry(0.04, 0.06, 10),
			new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 0.7, roughness: 0.4 })
		);
		bell.position.set(a[0], a[1] + 0.12, a[2]);
		group.add(line);
		const url = ITEMS[item]?.model;
		if (url) {
			const at = new THREE.Group();
			at.position.set(a[0], a[1], a[2]);
			at.rotation.y = -Math.atan2(b[2] - a[2], b[0] - a[0]);
			group.add(at);
			this.onFloor(url, at);
			bell.geometry.dispose();
			(bell.material as THREE.Material).dispose();
		} else group.add(bell);
		this.root.add(group);
		return group;
	}

	/** A fire: a low flame over its patch (its light is one of `fireLights`, if near). */
	private fire(position: Vec3, radius: number): { group: THREE.Group; phase: number } {
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
		group.add(flame, patch);
		this.root.add(group);
		return { group, phase: this.firesMade++ };
	}

	/** A snare set on the floor (or bait thrown down): its item's model, or a small box till it has one. */
	private snare(item: string, position: Vec3, yaw: number): THREE.Object3D {
		const def = ITEMS[item];
		const group = new THREE.Group();
		group.position.set(...position);
		group.rotation.y = yaw;
		this.root.add(group);
		if (def?.model) {
			this.onFloor(def.model, group);
			return group;
		}
		const [w, h, d] = def?.placeholder?.size ?? [0.4, 0.06, 0.4];
		const box = new THREE.Mesh(
			new THREE.BoxGeometry(w, h, d),
			new THREE.MeshStandardMaterial({ color: def?.placeholder?.color ?? 0x5b4a30, roughness: 0.9 })
		);
		box.position.y = h / 2;
		group.add(box);
		return group;
	}

	/**
	 * An item's model into `into`, resting on its lowest point on the floor there. The model's
	 * geometry is shared with every other copy (the asset cache), so it is marked never to be
	 * disposed with what it was put in.
	 */
	private onFloor(url: string, into: THREE.Object3D): void {
		void loadModel(url).then((model) => {
			model.traverse((node) => {
				if (!(node instanceof THREE.Mesh)) return;
				node.castShadow = true;
				node.receiveShadow = true;
				node.userData.shared = true;
			});
			const box = new THREE.Box3().setFromObject(model);
			model.position.y = -box.min.y;
			into.add(model);
		});
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
			case 'blast':
				// Heard all over the level.
				sounds.playAt('charge.blast', event.position, 1, 40);
				break;
			case 'fuseBang': {
				const fuse = ITEMS[event.item]?.throwable?.fuse;
				if (fuse) sounds.playAt(fuse.bang, event.position, 1, fuse.noise);
				break;
			}
			case 'tarot': {
				if (!mine) break;
				const card = TAROT.find((c) => c.id === event.card);
				if (!card) break;
				sounds.play('tarot.draw');
				raise({ kind: 'note', title: `You drew ${card.name}`, line: card.line });
				break;
			}
			case 'crafting':
				sounds.playAt('craft.field', event.position, 1, 4);
				break;
			case 'tripwire':
				// The party hears it wherever it is: it is what the bell is for.
				sounds.playAt('tripwire.ring', event.position, 1, 12);
				raise({ kind: 'note', title: 'A tripwire bell rang', line: 'Something crossed it.' });
				break;
			case 'dosed': {
				const dose = ITEMS[event.item]?.dose;
				if (dose && mine) sounds.play(dose.sound);
				break;
			}
			case 'whistle':
				sounds.playAt('whistle.blow', event.position, 1, 25);
				break;
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
		// A censer in the hand swings on its chain.
		if (ITEMS[held(state.inventory)?.item ?? '']?.censer) {
			this.untilSwing -= delta;
			if (this.untilSwing <= 0) {
				this.untilSwing = 2;
				this.ctx.sounds.play('censer.swing');
			}
		} else {
			this.untilSwing = 0;
		}
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
			this.drawArc(shown);
			if (landing) this.mark.position.set(landing[0], landing[1] + 0.03, landing[2]);
			this.mark.userData.landed = !!landing;
		}
		this.arc.visible = true;
		this.mark.visible = !!this.mark.userData.landed;
	}

	/**
	 * The arc's line through `points`. A filled geometry's buffer never grows (`setFromPoints`
	 * cuts a longer arc short, with a warning each time, and a shorter one leaves the old tail
	 * drawn), so the arc keeps a buffer of its own, made bigger when it must, and draws only what
	 * is in use.
	 */
	private drawArc(points: Vec3[]): void {
		let position = this.arc.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
		if (!position || position.count < points.length) {
			this.arc.geometry.dispose();
			this.arc.geometry = new THREE.BufferGeometry();
			position = new THREE.BufferAttribute(new Float32Array(points.length * 2 * 3), 3);
			position.setUsage(THREE.DynamicDrawUsage);
			this.arc.geometry.setAttribute('position', position);
		}
		const geometry = this.arc.geometry;
		points.forEach((p, i) => position.setXYZ(i, p[0], p[1], p[2]));
		position.needsUpdate = true;
		geometry.setDrawRange(0, points.length);
	}

	/**
	 * Carrying something cursed (the porcelain doll), its phantom sound (or a whisper) comes now
	 * and then from close by (docs/dev/world.md#cursed-loot). Only you hear it.
	 */
	private whisper(state: PlayerState, delta: number): void {
		const cursed = allStacks(state.inventory)
			.map((stack) => ITEMS[stack.item]?.cursed)
			.find((curse) => curse !== undefined);
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
		const sound = cursed.phantom ?? 'whisper';
		this.ctx.sounds.playAt(sound, [x + Math.cos(a) * 1.5, y + 1.4, z + Math.sin(a) * 1.5], 0.8);
	}

	update(delta: number): void {
		this.time += delta;
		const camera = this.ctx.engine.camera.position;
		// Fires: the nearest few in reach get the fire lights, so far fires cost no light.
		const fires = nearest(this.fires.values(), camera, FIRE_LIGHT.near);
		this.fireLights.forEach((light, i) => {
			const fire = fires[i];
			if (!fire) {
				light.intensity = 0;
				return;
			}
			const k = fire.phase;
			const flicker =
				0.75 + 0.25 * Math.sin(this.time * 17 + k * 2.3) * Math.sin(this.time * 7.1 + k);
			light.position.copy(fire.group.position);
			light.position.y += FIRE_LIGHT.above;
			light.intensity = FIRE_LIGHT.intensity * flicker;
		});
		// Glow sticks: all run down; the nearest few get the glow lights, fading as they run out.
		for (const glow of this.glows.values()) glow.left = Math.max(0, glow.left - delta);
		const glows = nearest(this.glows.values(), camera, GLOW_LIGHT.near);
		this.glowLights.forEach((light, i) => {
			const glow = glows[i];
			if (!glow) {
				light.intensity = 0;
				return;
			}
			const fade = Math.min(1, glow.left / (glow.seconds * GLOW_LIGHT.fade));
			light.position.copy(glow.group.position);
			light.position.y += GLOW_LIGHT.above;
			light.color.set(glow.color);
			light.distance = glow.range;
			light.intensity = GLOW_LIGHT.intensity * fade;
		});
	}

	clear(): void {
		this.apply({
			fires: [],
			snares: [],
			wards: [],
			glows: [],
			baits: [],
			tripwires: [],
			charges: []
		});
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

/** A glow stick lying lit, as shown: what its light looks like, and how long it has left (s). */
interface Glow {
	group: THREE.Group;
	color: number;
	range: number;
	left: number;
	seconds: number;
}

/** Those of `shown` within `reach` of `camera`, nearest first. */
function nearest<S extends { group: THREE.Object3D }>(
	shown: Iterable<S>,
	camera: THREE.Vector3,
	reach: number
): S[] {
	return [...shown]
		.map((item) => ({ item, d: item.group.position.distanceTo(camera) }))
		.filter(({ d }) => d < reach)
		.sort((x, y) => x.d - y.d)
		.map(({ item }) => item);
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
		// A loaded model's geometry and materials belong to the asset cache.
		if (!(node instanceof THREE.Mesh) || node.userData.shared) return;
		node.geometry.dispose();
		(node.material as THREE.Material).dispose();
	});
}
