import { ACOUSTICS, AMBIENCE } from '#lib/content/audio/ambience.ts';
import { MAP_KIT } from '#lib/content/map/kit.ts';
import type { OmenStage } from '#lib/content/afflictions.ts';
import type { CollisionWorld } from '#lib/shared/map/collision.ts';
import { LEVEL_HEIGHT, cellKey, occupiedCells, worldCell } from '#lib/shared/map/grid.ts';
import { PIECES } from '#lib/shared/map/pieces.generated.ts';
import type { Acoustics, MapLayout, Vec3 } from '#lib/shared/map/types.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { AudioManager, SoundHandle } from './AudioManager.ts';
import type { SoundBank } from './SoundBank.ts';

/**
 * The catacombs' background sound: drips around the listener, rare distant knocks, falls and
 * groans, lapping near water, and the acoustics of the space the player is in (reverb, damping).
 * The Affliction's omen stage (setOmen) makes the distant sounds and swells come more often and
 * adds whispers and a low drone (see docs/dev/affliction.md).
 * Tuning lives in src/lib/content/audio/ambience.ts. See docs/dev/player.md (Audio).
 */
export class Ambience {
	/** World cell + level -> acoustics of the piece there. */
	private acoustics: Record<string, Acoustics> = {};
	private world: CollisionWorld | null = null;
	private dripIn = 2;
	private distantIn = 30;
	private creepyIn = 45;
	private lap: SoundHandle | null = null;
	private lapStarting = false;
	private reverb = ACOUSTICS.tunnel.reverb;
	/** Current omen stage's ambience (null below the first stage). */
	private omen: OmenStage['ambience'] | null = null;
	private whisperIn = 30;
	private drone: SoundHandle | null = null;
	private droneStarting = false;
	private droneLevel = 0;
	private muffle = 0;

	constructor(
		private audio: AudioManager,
		private sounds: SoundBank
	) {}

	setMap(layout: MapLayout, world: CollisionWorld): void {
		this.world = world;
		this.acoustics = {};
		for (const placement of layout.placements) {
			const piece = PIECES[placement.piece];
			const kind = MAP_KIT[placement.piece]?.acoustics;
			if (!piece || !kind) continue;
			for (const [x, z, level] of occupiedCells(piece, placement)) {
				this.acoustics[cellKey(x, z, level)] = kind;
			}
		}
	}

	clear(): void {
		this.world = null;
		this.omen = null;
		this.lap?.setVolume(0);
		this.drone?.setVolume(0);
		this.droneLevel = 0;
	}

	/** The Affliction's omen layer (null for none). */
	setOmen(ambience: OmenStage['ambience'] | null): void {
		this.omen = ambience;
	}

	update(delta: number, listener: Vec3, state: PlayerState | null): void {
		if (!this.audio.unlocked) return;
		if (!this.world || !state) {
			this.audio.setMuffle(0);
			return;
		}

		// The space: ease toward the acoustics of the piece the player is in.
		const [cx, cz] = worldCell(state.position[0], state.position[2]);
		const level = Math.floor((state.position[1] + 0.5) / LEVEL_HEIGHT);
		const space = ACOUSTICS[this.acoustics[cellKey(cx, cz, level)] ?? 'tunnel'];
		const k = Math.min(1, delta * 2);
		this.reverb += (space.reverb - this.reverb) * k;
		this.muffle += (space.muffle - this.muffle) * k;
		this.audio.setReverb(state.underwater ? 0 : this.reverb);
		this.audio.setMuffle(state.underwater ? 1 : this.muffle);

		const water = this.waterDistance(listener);
		const nearWater = water < AMBIENCE.lap.radius;

		this.dripIn -= delta;
		if (this.dripIn <= 0) {
			const d = AMBIENCE.drip;
			this.dripIn = between(nearWater ? d.nearWaterInterval : d.interval);
			this.sounds.playAt('ambience.drip', around(listener, d.distance, -0.5, 2.5), d.volume);
		}

		this.distantIn -= delta;
		if (this.distantIn <= 0) {
			const d = AMBIENCE.distant;
			this.distantIn = between(d.interval) / (this.omen?.knocks ?? 1);
			const id = d.sounds[Math.floor(Math.random() * d.sounds.length)];
			// Large reference distance: far away, but still heard.
			this.sounds.playAt(id, around(listener, d.distance, -3, 3), d.volume, 12);
		}

		this.creepyIn -= delta;
		if (this.creepyIn <= 0) {
			this.creepyIn = between(AMBIENCE.creepy.interval) / (this.omen?.swells ?? 1);
			this.sounds.play('ambience.creepy', AMBIENCE.creepy.volume);
		}

		// Omens: whispers somewhere close, and a drone under everything.
		const whispers = this.omen?.whispers ?? 0;
		if (whispers > 0) {
			this.whisperIn -= delta;
			if (this.whisperIn <= 0) {
				this.whisperIn = (60 / whispers) * (0.5 + Math.random());
				this.sounds.playAt('whisper', around(listener, [1.5, 4], -0.5, 1), 0.8);
			}
		}
		const droneTarget = this.omen?.drone ?? 0;
		this.droneLevel += (droneTarget - this.droneLevel) * Math.min(1, delta * 0.3);
		if (this.droneLevel > 0.01 && !this.drone && !this.droneStarting) {
			this.droneStarting = true;
			void this.sounds.loop('omen.drone').then((handle) => (this.drone = handle));
		}
		this.drone?.setVolume(this.droneLevel);

		if (!this.lap && !this.lapStarting) {
			this.lapStarting = true;
			void this.sounds.loop('ambience.lap').then((handle) => (this.lap = handle));
		}
		const lapLevel = nearWater ? (1 - water / AMBIENCE.lap.radius) * AMBIENCE.lap.volume : 0;
		this.lap?.setVolume(lapLevel);
	}

	dispose(): void {
		this.lap?.stop();
		this.lap = null;
		this.drone?.stop();
		this.drone = null;
	}

	/** Distance from a point to the nearest water volume (by its bounds), or Infinity. */
	private waterDistance(p: Vec3): number {
		let best = Infinity;
		for (const v of this.world?.volumes ?? []) {
			if (v.kind !== 'water') continue;
			let sq = 0;
			for (let i = 0; i < 3; i++) {
				// Axis-aligned extent of the box (volumes are only yaw-rotated by placement).
				const ext = v.axes.reduce((sum, axis, a) => sum + Math.abs(axis[i]) * v.half[a], 0);
				const d = Math.max(0, Math.abs(p[i] - v.center[i]) - ext);
				sq += d * d;
			}
			best = Math.min(best, Math.sqrt(sq));
		}
		return best;
	}
}

function between([min, max]: [number, number]): number {
	return min + Math.random() * (max - min);
}

/** A random point `distance` metres from `p` horizontally, offset vertically by up to [lo, hi]. */
function around(p: Vec3, distance: [number, number], lo: number, hi: number): Vec3 {
	const a = Math.random() * Math.PI * 2;
	const r = between(distance);
	return [p[0] + Math.cos(a) * r, p[1] + between([lo, hi]), p[2] + Math.sin(a) * r];
}
