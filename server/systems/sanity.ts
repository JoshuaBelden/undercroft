import { CREATURES } from '../../src/lib/content/creatures.ts';
import { SANITY } from '../../src/lib/content/player/sanity.ts';
import { segmentBlocked } from '../../src/lib/shared/map/collision.ts';
import {
	creatureLight,
	halfLightVisible,
	illumination
} from '../../src/lib/shared/creature/visibility.ts';
import { ITEMS } from '../../src/lib/content/items.ts';
import { allStacks, quickWith, spendQuick } from '../../src/lib/shared/items/inventory.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import { headlampOutput } from '../../src/lib/shared/player/headlamp.ts';
import { eyeHeight } from '../../src/lib/shared/player/simulate.ts';
import type { PlayerState } from '../../src/lib/shared/player/types.ts';
import { log } from '../log.ts';
import { TICK_DT, type SessionContext, type SessionSystem } from './system.ts';

/** A downed player with nobody able to help uses their own salts after this many seconds. */
const SELF_REVIVE_DELAY = 3;
/** Below this much lamp light from teammates, a player with their lamp off is in the dark. */
const DARK = 0.02;
/** Half-angle (radians) of the view cone used for "seeing" a creature. */
const VIEW_HALF_ANGLE = 0.9;

/**
 * Sanity (docs/dev/player.md): darkness and seeing creatures wear it down. At 0 a player is
 * down, and a teammate holding interact with smelling salts revives them.
 */
export class SanitySystem implements SessionSystem {
	constructor(private ctx: SessionContext) {}

	step(): void {
		this.drain();
		this.revives();
	}

	/** Darkness and seeing creatures wear sanity down. */
	private drain(): void {
		const ctx = this.ctx;
		const states = [...ctx.players.values()].map((p) => p.state);
		const bodies = ctx.creatures.bodies();
		for (const player of ctx.players.values()) {
			const s = player.state;
			if (s.downed || s.dead || s.extracted) continue;
			const eye: Vec3 = [s.position[0], s.position[1] + eyeHeight(s), s.position[2]];
			let drain = 0;
			if (!headlampOutput(s).on) {
				const others = states.filter((o) => o !== s);
				if (illumination(ctx.world, others, eye) < DARK) drain += SANITY.darknessDrain;
			}
			if (bodies.some((b) => this.sees(s, eye, b.position, b.kind, states))) {
				drain += SANITY.seeingDrain;
			}
			// Something cursed in the pack (the porcelain doll) wears at its carrier.
			for (const stack of allStacks(s.inventory)) drain += ITEMS[stack.item]?.cursed?.sanity ?? 0;
			if (drain > 0) ctx.hurt(player, drain * TICK_DT);
		}
	}

	/** A creature is in front of the player, in line of sight, within range and lit enough to see. */
	private sees(
		s: PlayerState,
		eye: Vec3,
		position: Vec3,
		kind: string,
		states: PlayerState[]
	): boolean {
		const def = CREATURES[kind];
		if (!def) return false;
		const mid: Vec3 = [position[0], position[1] + def.height * 0.6, position[2]];
		const d: Vec3 = [mid[0] - eye[0], mid[1] - eye[1], mid[2] - eye[2]];
		const dist = Math.hypot(d[0], d[1], d[2]);
		if (dist > SANITY.seeingRange || dist < 1e-3) return false;
		const cp = Math.cos(s.pitch);
		const look: Vec3 = [-Math.sin(s.yaw) * cp, Math.sin(s.pitch), -Math.cos(s.yaw) * cp];
		const along = (d[0] * look[0] + d[1] * look[1] + d[2] * look[2]) / dist;
		if (along < Math.cos(VIEW_HALF_ANGLE)) return false;
		const light = creatureLight(this.ctx.world, states, position, def.height);
		if (!halfLightVisible(light, def.visibleBand)) return false;
		return !segmentBlocked(this.ctx.world, eye, mid);
	}

	/**
	 * Holding interact next to a downed teammate, with something that revives (smelling salts) in
	 * a quick-use slot, revives them. When nobody is able to help (solo, or everyone else is
	 * down), a downed player's own are used.
	 */
	private revives(): void {
		const ctx = this.ctx;
		const players = [...ctx.players.values()];
		const able = players.filter((p) => !p.state.downed && !p.state.dead && !p.state.extracted);
		for (const reviver of players) {
			const s = reviver.state;
			const patient =
				!s.downed && !s.dead && quickWith(s.inventory, 'revive') >= 0 && reviver.lastInput?.interact
					? players.find(
							(p) =>
								p !== reviver &&
								p.state.downed &&
								!p.state.dead &&
								Math.hypot(
									p.state.position[0] - s.position[0],
									p.state.position[1] - s.position[1],
									p.state.position[2] - s.position[2]
								) <= SANITY.reviveRange
						)
					: undefined;
			if (!patient) {
				s.reviving = 0;
				continue;
			}
			s.reviving += TICK_DT;
			if (s.reviving >= SANITY.reviveSeconds) {
				s.reviving = 0;
				spendQuick(s.inventory, quickWith(s.inventory, 'revive'));
				ctx.revive(patient);
				log.info(`${reviver.name} revived ${patient.name}`);
			}
		}
		for (const player of players) {
			const s = player.state;
			if (!s.downed || s.dead || s.downedTime < SELF_REVIVE_DELAY) continue;
			const salts = quickWith(s.inventory, 'revive');
			if (salts < 0) continue;
			if (able.some((p) => p !== player)) continue;
			spendQuick(s.inventory, salts);
			ctx.revive(player);
		}
	}

	admin = {
		setSanity: (player, command) => {
			const value =
				typeof command.value === 'number' && Number.isFinite(command.value)
					? command.value
					: SANITY.max;
			player.state.sanity = Math.max(0, Math.min(SANITY.max, value));
			if (player.state.sanity <= 0) this.ctx.down(player);
			else if (player.state.downed) this.ctx.revive(player);
		}
	} satisfies SessionSystem['admin'];
}
