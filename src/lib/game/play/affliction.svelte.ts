import { AFFLICTIONS } from '#lib/content/afflictions.ts';
import { Manifestation } from '#lib/game/affliction/Manifestation.ts';
import type { GameEvent } from '#lib/shared/items/types.ts';
import type { PlayContext, PlayFeature, TickMessage } from './feature.ts';

/**
 * The Affliction (docs/dev/affliction.md): the manifestation once the rite has summoned it, the
 * meter and omens (with their ambience), the expedition's clock, and the strobe.
 */
export class Affliction implements PlayFeature {
	/** Its name, as it is underground (kept after leaving, for the results). */
	name = $state('');
	meter = $state<number | null>(null);
	omen = $state(0);
	/** Seconds left before anyone still underground is lost. */
	deadline = $state<number | null>(null);
	private manifestation: Manifestation;

	constructor(private ctx: PlayContext) {
		this.manifestation = new Manifestation(ctx.sounds);
		ctx.engine.scene.add(this.manifestation.root);
	}

	tick(tick: TickMessage): void {
		const { affliction } = tick;
		const def = AFFLICTIONS[affliction.id];
		this.manifestation.apply(affliction.manifestation, def?.manifestation);
		this.name = def?.name ?? '';
		this.omen = affliction.omen;
		this.meter = affliction.meter;
		this.deadline = affliction.deadline;
		this.ctx.ambience.setOmen(def?.stages[this.omen - 1]?.ambience ?? null);
	}

	event(event: GameEvent): void {
		const { sounds, client, ui } = this.ctx;
		switch (event.kind) {
			case 'manifest':
				// Heard everywhere: something has arrived.
				sounds.play('manifest.signal');
				break;
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

	update(delta: number): void {
		const cam = this.ctx.engine.camera.position;
		this.manifestation.update(delta, [cam.x, cam.y, cam.z]);
	}

	clear(): void {
		this.deadline = null;
		this.manifestation.clear();
		this.ctx.ambience.setOmen(null);
	}

	dispose(): void {
		this.manifestation.dispose();
	}
}
