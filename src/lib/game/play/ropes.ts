import { ROPE } from '#lib/content/rope.ts';
import { LaidRopes } from '#lib/game/items/LaidRopes.ts';
import { HangingRopes, type RopeClimber } from '#lib/game/map/HangingRopes.ts';
import { connection } from '#lib/game/net/connection.svelte.ts';
import { RopeCreaks } from '#lib/game/player/RopeCreaks.ts';
import { settings } from '#lib/settings/settings.svelte.ts';
import {
	applyPitons,
	applyTied,
	laidLength,
	ropeAction,
	ropeInHand,
	ropeLength
} from '#lib/shared/items/rope.ts';
import type { GameEvent } from '#lib/shared/items/types.ts';
import type { CollisionWorld } from '#lib/shared/map/collision.ts';
import type { Vec3 } from '#lib/shared/map/types.ts';
import { ropeById, ropeToGrab } from '#lib/shared/player/climb.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { ServerMessage } from '#lib/shared/protocol.ts';
import type { PlayContext, PlayFeature, Prompt } from './feature.ts';
import { keyPrompt } from './prompt.ts';

/** Where a sound of the hands on a rope comes from: up at the grip, not the feet. */
function grip(position: Vec3): Vec3 {
	return [position[0], position[1] + 1.4, position[2]];
}

/**
 * Rope and falls (docs/dev/rope.md): the hanging ropes (tied, and the extraction ropes) swaying
 * under whoever climbs them, ropes laid along the floor, their prompts and sounds, and falling.
 */
export class Ropes implements PlayFeature {
	private hanging = new HangingRopes();
	private laid = new LaidRopes();
	private creaks: RopeCreaks;

	constructor(private ctx: PlayContext) {
		ctx.engine.scene.add(this.hanging.root);
		ctx.engine.scene.add(this.laid.root);
		this.creaks = new RopeCreaks(ctx.sounds);
	}

	/** After the player has the new map's collision world (the page sets it first). */
	mapLoaded(_layout: unknown, world: CollisionWorld): void {
		this.hanging.sync(world);
	}

	restore(): void {
		this.show();
	}

	message(message: ServerMessage): void {
		if (!this.ctx.ui.inWorld) return;
		// connection.ropes has it already (connection.svelte.ts).
		if (message.type === 'ropes') this.show();
		else if (message.type === 'ropeGrow') {
			for (const grown of message.ropes) this.laid.grow(grown.id, grown.points);
		}
	}

	/** Ropes changed: draw the laid ones, and the tied ones are climbable (and drawn) from now. */
	private show(): void {
		this.laid.apply(connection.ropes.laid);
		const world = this.ctx.player.collision;
		if (world) {
			applyPitons(world, connection.ropes.pitons);
			applyTied(world, connection.ropes.tied);
			this.hanging.sync(world);
		}
	}

	event(event: GameEvent): void {
		const { sounds, client } = this.ctx;
		switch (event.kind) {
			case 'fall':
				sounds.playAt(event.hard ? 'fall.land.hard' : 'fall.land', event.position, 1, 2);
				if (event.player === client.playerId) sounds.play('condition.hobble');
				break;
			case 'piton':
				sounds.playAt('piton.hammer', event.position, 1, 8);
				break;
			case 'pitonFailed':
				if (event.player === client.playerId) sounds.play('crate.stuck');
				break;
			case 'ropeGrab':
				sounds.playAt('rope.grab', grip(event.position), 1, 2);
				break;
			case 'ropeTie':
			case 'ropeUntie':
			case 'ropeGather':
				sounds.playAt('rope.tie', event.position, 1, 2);
				break;
			case 'ropeLay':
				sounds.playAt('rope.payout', event.position, 1, 2);
				break;
			case 'ropeLetGo':
				sounds.playAt('rope.letgo', grip(event.position), 1, 2);
				break;
		}
	}

	/**
	 * Who is on a rope. The hanging ropes sway and pull taut under them (as drawn), and
	 * prediction stops short of the others (as the server last said) so nobody climbs past.
	 */
	update(delta: number): void {
		const { player, remote } = this.ctx;
		const climbers: RopeClimber[] = [];
		const self = player.state;
		const feet = player.feetPosition();
		if (self?.climbing && feet) climbers.push({ rope: self.climbing.rope, feet });
		for (const other of remote.states()) {
			if (other.climbing) climbers.push({ rope: other.climbing.rope, feet: other.position });
		}
		this.hanging.update(delta, climbers);
		player.setClimbers(
			remote
				.players()
				.flatMap(({ state }) =>
					state.climbing ? [{ rope: state.climbing.rope, y: state.position[1] }] : []
				)
		);
		this.creaks.update(remote.players());
	}

	/** On a rope: how to get out up it, or how to let go. Beside one: how to take hold. */
	climbPrompt(state: PlayerState): Prompt | null {
		const world = this.ctx.player.collision;
		if (!world || state.swimming) return null;
		if (state.climbing) {
			const rope = ropeById(world, state.climbing.rope);
			if (rope?.exitY !== undefined) {
				const progress = (state.position[1] - rope.bottom) / (rope.exitY - rope.bottom);
				return keyPrompt('moveForward', 'to climb out', Math.max(0, progress));
			}
			return keyPrompt('stance', 'to drop');
		}
		const others = this.ctx.remote
			.players()
			.flatMap(({ state: o }) => (o.climbing ? [{ rope: o.climbing.rope, y: o.position[1] }] : []));
		const grab = ropeToGrab(world, state, others);
		if (!grab) return null;
		const label =
			grab.rope.exitY !== undefined
				? 'to climb out'
				: grab.rope.landing && grab.y > grab.rope.bottom + 1
					? 'to climb down the rope'
					: 'to climb the rope';
		return keyPrompt('interact', label);
	}

	/**
	 * Rope as gear: tying it at an anchor, untying it, gathering a laid one up (interact, held),
	 * and paying it out with it in the hand (attack).
	 */
	gearPrompt(state: PlayerState): Prompt | null {
		const { player, remote, client } = this.ctx;
		const world = player.collision;
		if (!world || state.swimming || state.climbing) return null;
		const { laid, tied } = connection.ropes;
		const action = ropeAction(world, laid, tied, state);
		const tieProgress = state.roping / ROPE.tieSeconds;
		if (action?.kind === 'untie') {
			const climbing = [state, ...remote.players().map((p) => p.state)].some(
				(p) => p.climbing?.rope === `tied-${action.anchor.id}`
			);
			if (climbing) return { prompt: 'Someone is on the rope', progress: 0 };
			return keyPrompt('interact', 'to untie the rope', tieProgress);
		}
		if (action?.kind === 'tie') {
			return keyPrompt('interact', 'to tie the rope', tieProgress);
		}
		if (action?.kind === 'short') {
			return { prompt: `Not enough rope: this drop needs ${action.need} m`, progress: 0 };
		}
		const rope = ropeInHand(state);
		// Laying: held, the pill filling as the rope runs out.
		const laying = laid.find((r) => r.laying && r.by === client.playerId);
		if (laying && rope) {
			return keyPrompt('attack', 'to keep laying rope', laidLength(laying) / ropeLength(rope));
		}
		if (action?.kind === 'gather' && settings.interface.itemPrompts) {
			return keyPrompt('interact', 'to gather up the rope', state.roping / ROPE.pickupSeconds);
		}
		if (rope && settings.interface.itemPrompts) {
			return keyPrompt('attack', 'to lay rope behind you');
		}
		return null;
	}

	clear(): void {
		this.hanging.clear();
		this.creaks.clear();
		this.laid.clear();
	}

	dispose(): void {
		this.hanging.dispose();
		this.laid.dispose();
	}
}
