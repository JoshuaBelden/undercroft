import { log } from '../log.ts';
import type { Player, SessionContext, SessionSystem } from './system.ts';

/**
 * The expedition's clock (docs/dev/expedition.md): it counts from the first player's arrival.
 * When it runs out, everyone still underground is lost, and what they carry stays down here.
 */
export class DeadlineSystem implements SessionSystem {
	/** When the first player arrived (ms): the deadline counts from here. */
	startedAt: number | null = null;
	/** Time ran out: everyone still underground has been lost. */
	timedOut = false;
	/** Admin: seconds taken off (or put back on) the clock. */
	private shift = 0;

	constructor(private ctx: SessionContext) {}

	/** Seconds left before anyone still underground is lost. */
	get seconds(): number {
		const total = this.ctx.affliction.def.expeditionSeconds;
		if (this.startedAt === null) return total;
		return Math.max(0, total - (Date.now() - this.startedAt) / 1000 - this.shift);
	}

	joined(_player: Player, resumed: boolean): void {
		if (!resumed) this.startedAt ??= Date.now();
	}

	step(): void {
		if (this.timedOut || this.startedAt === null || this.seconds > 0) return;
		this.timedOut = true;
		this.ctx.events.push({ kind: 'deadline' });
		for (const player of this.ctx.players.values()) {
			if (player.state.extracted || player.state.dead) continue;
			player.state.dead = true;
			player.state.downed = false;
		}
		log.info(`Session ${this.ctx.id.slice(0, 8)}: time ran out`);
	}

	admin = {
		setDeadline: (_player, command) => {
			if (typeof command.seconds !== 'number' || !Number.isFinite(command.seconds)) return;
			this.shift += this.seconds - Math.max(0, command.seconds);
		}
	} satisfies SessionSystem['admin'];
}
