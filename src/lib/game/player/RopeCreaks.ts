import type { SoundBank } from '#lib/game/audio/SoundBank.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';

/** Every this many metres someone climbs, their rope creaks... */
export const ROPE_CREAK = 0.5;
/** ...but no more often than this (ms): sliding down fast would pile them up. */
export const ROPE_CREAK_GAP = 450;

/**
 * Other players climbing: their rope creaks where they are, every ROPE_CREAK metres they go up or
 * down it (your own creaks are PlayerAudio's). See docs/dev/rope.md.
 */
export class RopeCreaks {
	/** Each climber's feet last frame and the metres climbed since their last creak. */
	private climbers = new Map<string, { y: number; climbed: number; at: number }>();

	constructor(private sounds: SoundBank) {}

	update(players: Iterable<{ id: string; state: PlayerState }>): void {
		const seen = new Set<string>();
		for (const { id, state } of players) {
			if (!state.climbing) continue;
			seen.add(id);
			const [x, y, z] = state.position;
			const was = this.climbers.get(id);
			const now = performance.now();
			let climbed = was ? was.climbed + Math.abs(y - was.y) : 0;
			let at = was?.at ?? 0;
			if (climbed >= ROPE_CREAK && now - at >= ROPE_CREAK_GAP) {
				climbed = 0;
				at = now;
				this.sounds.playAt('rope.tension', [x, y + 1.4, z], 1, 3);
			}
			this.climbers.set(id, { y, climbed, at });
		}
		for (const id of this.climbers.keys()) if (!seen.has(id)) this.climbers.delete(id);
	}

	clear(): void {
		this.climbers.clear();
	}
}
