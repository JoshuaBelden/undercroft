import type { WebSocket } from 'ws';
import { log } from './log.ts';
import { Session } from './session.ts';

/**
 * Hands out expeditions. Everyone who descends joins the current expedition while it's running;
 * once its last player has extracted or left, it ends and the next descent starts a new one with
 * a fresh seed. Parties and invites (Phase 3) will replace the single shared expedition.
 */
export class Expeditions {
	private current: Session | null = null;

	join(socket: WebSocket, name: string): { session: Session; playerId: string } {
		if (!this.current || this.current.ended) {
			this.current = new Session();
			log.info(`Expedition ${this.current.id.slice(0, 8)} started with seed ${this.current.seed}`);
		}
		const player = this.current.addPlayer(socket, name);
		return { session: this.current, playerId: player.id };
	}

	stop(): void {
		this.current?.stop();
	}
}
