import { absorbBlow } from '../../src/lib/shared/items/inventory.ts';
import { applyCondition } from '../../src/lib/shared/player/conditions.ts';
import type { SessionContext, SessionSystem } from './system.ts';

/**
 * Creatures hunt and strike (docs/dev/creatures.md). What is worn takes the blow first; a bite
 * that carries a condition (a spider's poison) gives it whatever the coat stops.
 */
export class CreatureSystem implements SessionSystem {
	constructor(private ctx: SessionContext) {}

	step(): void {
		const ctx = this.ctx;
		const prey = [...ctx.players.values()].map((p) => ({ id: p.id, state: p.state }));
		for (const hit of ctx.creatures.step(prey)) {
			const player = ctx.players.get(hit.playerId);
			if (!player) continue;
			const s = player.state;
			if (s.flags.godMode || s.downed || s.dead) continue;
			const { through, torn } = absorbBlow(s.inventory, hit.damage);
			if (torn) ctx.events.push({ kind: 'break', item: torn, position: [...s.position] });
			ctx.hurt(player, through);
			if (hit.condition && !s.dead) applyCondition(s, hit.condition.id, hit.condition.seconds);
		}
	}

	admin = {
		spawnCreature: (player, command) =>
			this.ctx.creatures.spawnNear(player.state, command.creature ?? 'witch'),
		clearCreatures: () => this.ctx.creatures.clear(),
		killCreatures: () => this.ctx.creatures.killAll()
	} satisfies SessionSystem['admin'];
}
