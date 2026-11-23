import type { SoundHandle } from '#lib/game/audio/AudioManager.ts';
import type { PlayerSnapshot, PlayerState } from '#lib/shared/player/types.ts';

/** How long a sound cut short takes to fade out, s. */
const FADE = 0.15;

/**
 * Sounds that go with work held on interact (prying a crate or a wall), one per player, cut short
 * when they stop: let go, walked off or done. Each tick, `check` stops those whose work ended.
 */
export class HeldSounds {
	private playing = new Map<string, Promise<SoundHandle | null>>();

	/** `working` says from a player's state whether they are still at it. */
	constructor(private working: (state: PlayerState) => boolean) {}

	/** A player began: their sound, replacing any still going. */
	start(player: string, sound: Promise<SoundHandle | null>): void {
		this.stop(player);
		this.playing.set(player, sound);
	}

	/** Stop the sound of anyone no longer at work (or no longer here). */
	check(players: PlayerSnapshot[]): void {
		for (const id of [...this.playing.keys()]) {
			const player = players.find((p) => p.id === id);
			if (!player || !this.working(player.state)) this.stop(id);
		}
	}

	stop(player: string): void {
		const sound = this.playing.get(player);
		if (!sound) return;
		this.playing.delete(player);
		void sound.then((handle) => {
			if (!handle) return;
			handle.setVolume(0, FADE);
			setTimeout(() => handle.stop(), FADE * 1000 + 50);
		});
	}

	clear(): void {
		for (const id of [...this.playing.keys()]) this.stop(id);
	}
}
