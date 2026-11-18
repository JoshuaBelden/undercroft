import { aimRay } from '#lib/shared/items/weapons.ts';
import { eyeHeight, tendSeconds } from '#lib/shared/player/simulate.ts';
import {
	lookedAtTeammate,
	needs,
	teammateSpot,
	tendKind,
	type TeammateSpot,
	type TendKind
} from '#lib/shared/player/tend.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { PlayContext, PlayFeature, Prompt } from './feature.ts';
import { keyPrompt } from './prompt.ts';

/** The bandage sound runs most of a bandage: at most one every this many ms per player. */
const SOUND_GAP = 2500;

/**
 * Using what is in your hand on a teammate (docs/dev/items.md#using-items-on-a-teammate): who
 * is there for prediction, the prompts (yours, and theirs while you tend them), and the bandage
 * sound as anyone starts. The client mirror of server/systems/tend.ts.
 */
export class Tend implements PlayFeature {
	private spots: TeammateSpot[] = [];
	/** Who was tending last frame (ids, yourself as 'self'), and when each last made a sound. */
	private tending = new Set<string>();
	private soundAt = new Map<string, number>();

	constructor(private ctx: PlayContext) {}

	/** Teammates on their feet (as the server last said), for the step to look for. */
	update(): void {
		const { player, remote } = this.ctx;
		this.spots = remote.players().flatMap(({ id, state }) => teammateSpot(id, state) ?? []);
		player.setTeammates(this.spots);
		for (const { id, state } of remote.players()) this.sound(id, state, false);
	}

	self(state: PlayerState): void {
		this.sound('self', state, true);
	}

	/** Bandaging someone sounds as it starts (a battery makes its own when it goes in). */
	private sound(id: string, state: PlayerState, own: boolean): void {
		const now = performance.now();
		const on = state.tending > 0;
		const started = on && !this.tending.has(id);
		if (on) this.tending.add(id);
		else this.tending.delete(id);
		if (!started || tendKind(state) !== 'heal') return;
		if (now - (this.soundAt.get(id) ?? -Infinity) < SOUND_GAP) return;
		this.soundAt.set(id, now);
		if (own) this.ctx.sounds.play('bandage');
		else this.ctx.sounds.playAt('bandage', state.position);
	}

	/**
	 * Tending a teammate (with how far along), or one in front of you who could use what is in
	 * your hand; or a teammate tending you.
	 */
	prompt(state: PlayerState): Prompt | null {
		const kind = tendKind(state);
		const seconds = tendSeconds(state);
		if (kind && seconds && state.tending > 0 && state.patient) {
			const name = this.name(state.patient);
			return { prompt: doing(kind, name), progress: state.tending / seconds };
		}
		const target = kind ? this.lookedAt(state, kind) : null;
		if (kind && target) return keyPrompt('aim', toDo(kind, this.name(target.id)));
		return this.beingTended();
	}

	/** The teammate you are looking at who could use what is in your hand. */
	private lookedAt(state: PlayerState, kind: TendKind): TeammateSpot | null {
		const world = this.ctx.player.collision;
		if (!world || state.swimming || state.bandaging > 0 || state.charging > 0) return null;
		const { origin, direction } = aimRay(state, eyeHeight(state));
		const spot = lookedAtTeammate(world, origin, direction, this.spots);
		return spot && needs(spot, kind) ? spot : null;
	}

	/** A teammate using something on you. */
	private beingTended(): Prompt | null {
		const self = this.ctx.client.playerId;
		for (const { name, state } of this.ctx.remote.players()) {
			const kind = tendKind(state);
			const seconds = tendSeconds(state);
			if (!self || state.patient !== self || !kind || !seconds || state.tending <= 0) continue;
			const text =
				kind === 'heal' ? `${name} is tending to you...` : `${name} is changing your battery...`;
			return { prompt: text, progress: state.tending / seconds };
		}
		return null;
	}

	private name(id: string): string {
		return this.ctx.remote.list().find((p) => p.id === id)?.name ?? 'them';
	}

	left(): void {
		this.tending.clear();
		this.spots = [];
		this.ctx.player.setTeammates([]);
	}
}

function toDo(kind: TendKind, name: string): string {
	return kind === 'heal' ? `to tend to ${name}` : `to change ${name}'s battery`;
}

function doing(kind: TendKind, name: string): string {
	return kind === 'heal' ? `Tending to ${name}...` : `Changing ${name}'s battery...`;
}
