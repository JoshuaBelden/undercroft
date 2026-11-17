import * as THREE from 'three';
import { ITEMS } from '#lib/content/items.ts';
import { DEFAULT_MARK_WHEEL, MARKS } from '#lib/content/marks.ts';
import { Marks as MarkModels } from '#lib/game/items/Marks.ts';
import { connection } from '#lib/game/net/connection.svelte.ts';
import { settings } from '#lib/settings/settings.svelte.ts';
import { held } from '#lib/shared/items/inventory.ts';
import { lookedAtMark } from '#lib/shared/items/pickup.ts';
import type { GameEvent, MarkSnapshot } from '#lib/shared/items/types.ts';
import { aimRay } from '#lib/shared/items/weapons.ts';
import type { Vec3 } from '#lib/shared/map/types.ts';
import { eyeHeight } from '#lib/shared/player/simulate.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { ServerMessage } from '#lib/shared/protocol.ts';
import { wheelChoice } from '#lib/ui/wheel.ts';
import type { Aim, PlayContext, PlayFeature, Prompt } from './feature.ts';
import { keyPrompt } from './prompt.ts';

/**
 * Chalk marks (docs/dev/marks.md): drawn on the walls, the chalk wheel to choose a symbol, who
 * drew the one you are close to, and rubbing out your own.
 */
export class Marks implements PlayFeature {
	/** Every chalk mark, as the server last sent them: the map draws them too. */
	all = $state.raw<MarkSnapshot[]>([]);
	/** The chalk wheel while attack is held with chalk in the hand: the pointer and the symbol. */
	wheel = $state<{ pointer: { x: number; y: number }; chosen: number } | null>(null);
	/** The chalk symbols on this player's wheel, as the server sent them in `welcome`. */
	symbols = $state<readonly string[]>(DEFAULT_MARK_WHEEL);
	/** Who drew the chalk mark you are close to, and where it is on the screen. */
	label = $state<{ name: string; x: number; y: number } | null>(null);
	private models: MarkModels;
	private ray = new THREE.Raycaster();
	/** Your own chalk mark that interact would erase, if any (floor items and crates first). */
	private aimedAt: string | null = null;

	constructor(private ctx: PlayContext) {
		this.models = new MarkModels(ctx.map.root);
		ctx.engine.scene.add(this.models.root);
		this.ray.far = MARKS.reach;
	}

	restore(): void {
		if (connection.welcome) this.symbols = connection.welcome.markWheel;
		this.models.apply(connection.marks);
	}

	message(message: ServerMessage): void {
		if (message.type === 'welcome') this.symbols = message.markWheel;
		else if (message.type === 'marks' && this.ctx.ui.inWorld) {
			this.models.apply(message.marks);
			this.all = message.marks;
		}
	}

	event(event: GameEvent): void {
		if (event.kind === 'mark') this.ctx.sounds.playAt('chalk.draw', event.position, 1, 2);
		else if (event.kind === 'rub') this.ctx.sounds.playAt('chalk.rub', event.position, 1, 2);
	}

	target(_state: PlayerState, aim: Aim | null, taken: boolean): boolean {
		const self = this.ctx.client.playerId;
		const mine =
			aim && !taken
				? lookedAtMark(aim.world, aim.origin, aim.direction, this.models.list, (m) => m.by === self)
				: null;
		this.aimedAt = mine?.id ?? null;
		return !!this.aimedAt;
	}

	self(state: PlayerState): void {
		this.updateLabel(state);
	}

	/** Rubbing out your own, or with chalk in the hand facing stone, drawing one. */
	prompt(state: PlayerState): Prompt | null {
		if (this.aimedAt && settings.interface.itemPrompts) {
			return keyPrompt('interact', 'to erase your mark', state.erasing / MARKS.eraseSeconds);
		}
		if (
			this.holdingChalk(state) &&
			!this.wheel &&
			settings.interface.itemPrompts &&
			this.spot(state)
		) {
			return keyPrompt('attack', 'to draw a mark');
		}
		return null;
	}

	/** The chalk in the hand, if that is what is held. */
	private holdingChalk(state: PlayerState): boolean {
		return !!ITEMS[held(state.inventory)?.item ?? '']?.chalk;
	}

	/**
	 * Where a chalk mark would go: the visible stone where your view meets it, within reach, and
	 * which way it faces (world space). Null when there is none in reach.
	 */
	private spot(state: PlayerState): { position: Vec3; normal: Vec3 } | null {
		const { origin, direction } = aimRay(state, eyeHeight(state));
		this.ray.set(new THREE.Vector3(...origin), new THREE.Vector3(...direction));
		const hit = this.ray.intersectObject(this.ctx.map.root, true)[0];
		if (!hit || !(hit.object instanceof THREE.Mesh)) return null;
		const local = hit.normal ?? hit.face?.normal;
		if (!local) return null;
		const normal = local
			.clone()
			.applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
			.normalize();
		// Toward the one drawing, whichever way the face was modelled.
		if (normal.dot(this.ray.ray.direction) > 0) normal.negate();
		return { position: hit.point.toArray(), normal: normal.toArray() };
	}

	/**
	 * The chalk wheel: holding attack with chalk in the hand, facing stone in reach, opens it;
	 * letting go draws the symbol the pointer is on where you are looking. Called by the page
	 * before the player's input is read, with the quick-use wheel.
	 */
	updateWheel(state: PlayerState | null, active: boolean): void {
		const { input, player, client, ui } = this.ctx;
		const holding =
			active && !!state && !state.downed && this.holdingChalk(state) && input.isDown('attack');
		if (!this.wheel) {
			if (!holding || ui.quickWheelOpen || !this.spot(state)) return;
			player.openWheel();
		}
		const pointer = player.wheelPointer ?? { x: 0, y: 0 };
		const chosen = wheelChoice(pointer, this.symbols);
		if (holding) {
			this.wheel = { pointer, chosen };
			return;
		}
		player.closeWheel();
		this.wheel = null;
		const symbol = this.symbols[chosen];
		const spot = state && symbol ? this.spot(state) : null;
		if (spot && symbol) client.send({ type: 'mark', symbol, ...spot });
	}

	/** Who drew the mark you are close to, placed on the screen just under it. */
	private updateLabel(state: PlayerState): void {
		const { player, engine, canvas, client, ui } = this.ctx;
		const world = player.collision;
		let near: ReturnType<MarkModels['nearest']> = null;
		if (world && !state.downed && !this.wheel && !ui.quickWheelOpen) {
			const { origin, direction } = aimRay(state, eyeHeight(state));
			near = this.models.nearest(world, origin, direction);
		}
		if (!near) {
			if (this.label) this.label = null;
			return;
		}
		const screen = new THREE.Vector3(...near.position).project(engine.camera);
		const x = ((screen.x + 1) / 2) * canvas.clientWidth;
		const y = ((1 - screen.y) / 2) * canvas.clientHeight + 40;
		const name = near.by === client.playerId ? 'You' : near.name;
		const moved =
			!this.label || Math.abs(this.label.x - x) > 0.5 || Math.abs(this.label.y - y) > 0.5;
		if (moved || this.label?.name !== name) this.label = { name, x, y };
	}

	update(delta: number): void {
		this.models.update(delta);
	}

	clear(): void {
		this.all = [];
		this.label = null;
		this.wheel = null;
		this.models.clear();
	}

	dispose(): void {
		this.models.dispose();
	}
}
