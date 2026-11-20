import * as THREE from 'three';
import { hasCompass } from '#lib/shared/items/gear.ts';
import type { GameEvent } from '#lib/shared/items/types.ts';
import type { CollisionWorld } from '#lib/shared/map/collision.ts';
import type { MapLayout, Vec3 } from '#lib/shared/map/types.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { PlayContext, PlayFeature } from './feature.ts';

/** A whistle heard: where, for how long it is shown, and on the screen this frame. */
interface Ping {
	position: Vec3;
	left: number;
	mine: boolean;
}

/** On the screen this frame: a whistle's marker, clamped to the edges when it is out of view. */
export interface PingMark {
	x: number;
	y: number;
	/** Off the screen (or behind): drawn at the edge as an arrow. */
	edge: boolean;
	mine: boolean;
	fade: number;
}

/** A pocket compass's bearing: which way, relative to where you look, and how far. */
export interface Bearing {
	/** Radians, clockwise from straight ahead. */
	angle: number;
	distance: number;
	/** What it points at. */
	to: 'out' | 'rite';
}

/**
 * Where things are, without seeing them (docs/dev/items.md#bearings): a worn pocket compass's
 * bearing to the nearest way out (or to the rite's room, once a clue says where), and the
 * whistles the party blows, marked on the screen for a few seconds wherever they are.
 */
export class Bearings implements PlayFeature {
	/** The compass's bearing; null without one worn. */
	bearing = $state<Bearing | null>(null);
	/** Whistles on the screen. */
	pings = $state<PingMark[]>([]);
	private heard: Ping[] = [];
	private world: CollisionWorld | null = null;
	private layout: MapLayout | null = null;

	constructor(
		private ctx: PlayContext,
		/** The room the rite is held in, once known (a piece id). */
		private riteRoom: () => string | null
	) {}

	mapLoaded(layout: MapLayout, world: CollisionWorld): void {
		this.layout = layout;
		this.world = world;
		this.heard = [];
	}

	event(event: GameEvent): void {
		if (event.kind !== 'whistle') return;
		this.heard.push({
			position: [event.position[0], event.position[1] + 1.6, event.position[2]],
			left: event.seconds,
			mine: event.player === this.ctx.client.playerId
		});
	}

	self(state: PlayerState): void {
		if (!hasCompass(state.inventory)) {
			if (this.bearing) this.bearing = null;
			return;
		}
		const target = this.pointsAt(state.position);
		if (!target) {
			if (this.bearing) this.bearing = null;
			return;
		}
		const dx = target.position[0] - state.position[0];
		const dz = target.position[2] - state.position[2];
		// Yaw 0 looks down -Z; turning right is negative yaw.
		const heading = Math.atan2(-dx, -dz);
		let angle = state.yaw - heading;
		angle = Math.atan2(Math.sin(angle), Math.cos(angle));
		const next: Bearing = { angle, distance: Math.hypot(dx, dz), to: target.to };
		const was = this.bearing;
		// Put on (or the first look at it): the lid clicks open.
		if (!was) this.ctx.sounds.play('compass.open');
		if (
			!was ||
			was.to !== next.to ||
			Math.abs(was.angle - next.angle) > 0.01 ||
			Math.abs(was.distance - next.distance) > 0.5
		) {
			this.bearing = next;
		}
	}

	/** The rite's room once a clue has said where, else the nearest way out. */
	private pointsAt(from: Vec3): { position: Vec3; to: Bearing['to'] } | null {
		const room = this.riteRoom();
		const at = room ? this.layout?.placements.find((p) => p.piece === room) : undefined;
		if (at) return { position: at.position, to: 'rite' };
		let best: Vec3 | null = null;
		let bestD = Infinity;
		for (const exit of this.world?.extracts ?? []) {
			const d = Math.hypot(exit[0] - from[0], exit[2] - from[2]);
			if (d < bestD) {
				best = exit;
				bestD = d;
			}
		}
		return best ? { position: best, to: 'out' } : null;
	}

	update(delta: number): void {
		const { engine, canvas } = this.ctx;
		for (const ping of this.heard) ping.left -= delta;
		this.heard = this.heard.filter((ping) => ping.left > 0);
		if (!this.heard.length) {
			if (this.pings.length) this.pings = [];
			return;
		}
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		const margin = 28;
		this.pings = this.heard.map((ping) => {
			const p = new THREE.Vector3(...ping.position).project(engine.camera);
			const behind = p.z > 1;
			let x = ((p.x + 1) / 2) * w;
			let y = ((1 - p.y) / 2) * h;
			if (behind) {
				x = w - x;
				y = h - margin;
			}
			const edge = behind || x < margin || x > w - margin || y < margin || y > h - margin;
			x = Math.min(w - margin, Math.max(margin, x));
			y = Math.min(h - margin, Math.max(margin, y));
			return { x, y, edge, mine: ping.mine, fade: Math.min(1, ping.left) };
		});
	}

	clear(): void {
		this.heard = [];
		this.pings = [];
		this.bearing = null;
	}
}
