import { AFFLICTIONS } from '#lib/content/afflictions.ts';
import { Manifestation } from '#lib/game/affliction/Manifestation.ts';
import { FadingLoop } from '#lib/game/audio/FadingLoop.ts';
import type { SoundId } from '#lib/content/audio/sounds.ts';
import type { ManifestationSnapshot } from '#lib/shared/affliction/types.ts';
import type { GameEvent } from '#lib/shared/items/types.ts';
import type { PlayContext, PlayFeature, TickMessage } from './feature.ts';

type ManifestationState = ManifestationSnapshot['state'];

/** The fight music comes in quickly with the arrival, and fades out as the figure does (3 s). */
const FIGHT_FADES = { in: 0.5, out: 3 };

/**
 * The Affliction (docs/dev/affliction.md): the manifestation once the rite has summoned it, the
 * meter and omens (with their ambience), the fight music, the expedition's clock, and the strobe.
 */
export class Affliction implements PlayFeature {
	/** Its name, as it is underground (kept after leaving, for the results). */
	name = $state('');
	meter = $state<number | null>(null);
	omen = $state(0);
	/** Seconds left before anyone still underground is lost. */
	deadline = $state<number | null>(null);
	private manifestation: Manifestation;
	/** The fight music (`manifestation.music`), and which it is, once there is one to play. */
	private fight: FadingLoop | null = null;
	private fightId: SoundId | null = null;

	constructor(private ctx: PlayContext) {
		this.manifestation = new Manifestation(ctx.sounds);
		ctx.engine.scene.add(this.manifestation.root);
	}

	tick(tick: TickMessage): void {
		const { affliction } = tick;
		const def = AFFLICTIONS[affliction.id];
		this.manifestation.apply(affliction.manifestation, def?.manifestation);
		this.fightMusic(def?.manifestation.music, affliction.manifestation?.state);
		this.name = def?.name ?? '';
		this.omen = affliction.omen;
		this.meter = affliction.meter;
		this.deadline = affliction.deadline;
		this.ctx.ambience.setOmen(def?.stages[this.omen - 1]?.ambience ?? null);
	}

	event(event: GameEvent): void {
		const { sounds, client, ui } = this.ctx;
		switch (event.kind) {
			case 'creatureHit':
				if (event.id === 'manifestation') this.manifestation.hit();
				break;
			case 'strobe':
				// The lamp's own click already plays; a flash that stunned something cracks too.
				if (event.stunned <= 0) break;
				if (event.player === client.playerId) sounds.play('strobe.flash');
				else sounds.playAt('strobe.flash', event.position, 1, 4);
				break;
			case 'deadline':
				ui.banner('Lost in the dark');
				break;
		}
	}

	/**
	 * The fight music plays while the manifestation is in the world: from the rite to its
	 * banishing. It comes in fast, under the arrival; once it is banished it fades out with the
	 * figure, under the stinger (`rite.resolve`, from the rite feature).
	 */
	private fightMusic(music: SoundId | undefined, state: ManifestationState | undefined): void {
		// Another Affliction (the next expedition, from the same page): its own music.
		if ((music ?? null) !== this.fightId) {
			this.fight?.dispose();
			this.fight = null;
			this.fightId = music ?? null;
		}
		if (music && !this.fight) {
			this.fight = new FadingLoop(this.ctx.sounds, music, FIGHT_FADES);
			// The player has clicked their way down here: the page may make sound.
			this.fight.allow();
		}
		this.fight?.setWanted(state !== undefined && state !== 'banished');
	}

	update(delta: number): void {
		this.manifestation.update(delta);
	}

	clear(): void {
		this.deadline = null;
		this.manifestation.clear();
		this.fight?.setWanted(false);
		this.ctx.ambience.setOmen(null);
	}

	dispose(): void {
		this.manifestation.dispose();
		this.fight?.dispose();
	}
}
