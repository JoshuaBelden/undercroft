import * as THREE from 'three';
import { DISTANT_SHOT } from '#lib/content/audio/sounds.ts';
import { ITEMS } from '#lib/content/items.ts';
import { rumble } from '#lib/game/input/gamepad.ts';
import { Effects } from '#lib/game/items/Effects.ts';
import { ViewModel } from '#lib/game/items/ViewModel.ts';
import { held } from '#lib/shared/items/inventory.ts';
import type { GameEvent } from '#lib/shared/items/types.ts';
import { THROW_DRAW } from '#lib/shared/items/weapons.ts';
import type { Vec3 } from '#lib/shared/map/types.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { PlayContext, PlayFeature } from './feature.ts';

/**
 * Weapons (docs/dev/items.md): your own shots, swings and throws at once from the predicted
 * simulation (sound, recoil, rumble, the flash), everyone else's and what they hit from the tick.
 */
export class Combat implements PlayFeature {
	private effects = new Effects();
	private muzzle = new THREE.Vector3();
	/** The held item's action last frame (to start reload and swing sounds). */
	private lastAction = 'none';
	/** A throw was drawn back all the way last frame (for the click that says it's ready). */
	private throwReady = false;

	constructor(private ctx: PlayContext) {
		ctx.engine.scene.add(this.effects.root);
	}

	/** Instant feedback for what the local (predicted) simulation did. */
	self(state: PlayerState): void {
		const { sounds, player, viewModel, body, head, headlamp } = this.ctx;
		for (const event of player.drainEvents()) {
			if (event.kind === 'shot') {
				const gun = ITEMS[event.item]?.firearm;
				if (gun) sounds.play(gun.sound);
				// The kick throws your aim up and a little aside: you bring it back down yourself.
				if (gun) player.kick(gun.recoil.pitch, (Math.random() * 2 - 1) * gun.recoil.yaw);
				const heavy = (gun?.pellets ?? 1) > 1;
				rumble(heavy ? 'heavyShot' : 'shot');
				// First person, the flare is on the gun in your hands; over the shoulder, at the
				// barrel of the gun your body holds; otherwise just in front of your eyes.
				const drawn = viewModel.flash(heavy);
				const at = (!drawn && body.muzzle(this.muzzle)) || ViewModel.muzzle(head, this.muzzle);
				this.effects.shot(at, event.direction, {
					flare: !drawn,
					own: true,
					heavy
				});
				headlamp.flash();
			} else if (event.kind === 'empty') {
				sounds.play('gun.empty');
			} else if (event.kind === 'throw') {
				const spec = ITEMS[event.item]?.throwable;
				if (spec) sounds.play(spec.sound);
			}
		}
		const action = state.weapon.action;
		const ready = action === 'draw' && state.weapon.time >= THROW_DRAW;
		if (ready && !this.throwReady) {
			sounds.play('throw.ready');
			rumble('throwReady');
		}
		this.throwReady = ready;
		if (action !== this.lastAction) {
			if (action === 'reload') {
				const gun = ITEMS[held(state.inventory)?.item ?? '']?.firearm;
				if (gun) sounds.play(gun.reloadSound);
			}
			if (action === 'swing') sounds.play('melee.swing');
			this.lastAction = action;
		}
	}

	/** Other players' weapons, and what anyone's hit. */
	event(event: GameEvent): void {
		const { sounds, client, head, remote, creatures } = this.ctx;
		const self = client.playerId;
		switch (event.kind) {
			case 'shot': {
				if (event.player !== self) {
					const gun = ITEMS[event.item]?.firearm;
					const distance = Math.hypot(
						event.origin[0] - head.position.x,
						event.origin[1] - head.position.y,
						event.origin[2] - head.position.z
					);
					// Close, the gun itself; far off, the rolling distant report; between, both.
					const far = Math.min(1, Math.max(0, (distance - DISTANT_SHOT.from) / DISTANT_SHOT.span));
					if (gun && far < 1) sounds.playAt(gun.sound, event.origin, 1 - far, 10);
					if (far > 0) sounds.playAt('gun.distant', event.origin, far, DISTANT_SHOT.refDistance);
					const toward: [number, number, number] = [
						event.end[0] - event.origin[0],
						event.end[1] - event.origin[1],
						event.end[2] - event.origin[2]
					];
					// From the barrel of the gun in their hands; until it is drawn, out in front of
					// their eyes, near where it would be.
					const length = Math.hypot(...toward) || 1;
					const barrel = remote.muzzle(event.player, this.muzzle);
					const at: Vec3 = barrel
						? [barrel.x, barrel.y, barrel.z]
						: (event.origin.map((v, i) => v + (toward[i] / length) * 0.6) as Vec3);
					this.effects.shot(at, toward, {
						flare: true,
						own: false,
						heavy: (gun?.pellets ?? 1) > 1
					});
					remote.flash(event.player);
				}
				this.effects.impact(event.end, event.creature);
				if (!event.creature) sounds.playAt('bullet.impact', event.end, 1, 2);
				break;
			}
			case 'swing':
				if (event.hit === 'creature') sounds.playAt('melee.hit.creature', event.origin, 1, 3);
				else if (event.hit === 'wall') sounds.playAt('melee.hit', event.origin, 1, 3);
				else if (event.player !== self) sounds.playAt('melee.swing', event.origin, 1, 3);
				break;
			case 'throw': {
				const spec = ITEMS[event.item]?.throwable;
				if (spec && event.player !== self) sounds.playAt(spec.sound, event.origin, 1, 3);
				break;
			}
			case 'land': {
				const spec = ITEMS[event.item]?.throwable;
				if (spec) sounds.playAt(spec.land, event.position, 1, 4);
				break;
			}
			case 'break':
				// A coat torn through, or a brick or crowbar worn out.
				if (ITEMS[event.item]?.defense) sounds.playAt('defense.torn', event.position, 1, 3);
				else sounds.playAt('brick.break', event.position, 1, 3);
				break;
			case 'reload': {
				const gun = ITEMS[event.item]?.firearm;
				if (gun && event.player !== self) sounds.playAt(gun.reloadSound, event.position, 1, 3);
				break;
			}
			case 'empty':
				if (event.player !== self) sounds.playAt('gun.empty', event.position, 1, 2);
				break;
			// The manifestation's are the Affliction's (affliction.svelte.ts).
			case 'creatureHit':
				if (event.id === 'manifestation') break;
				creatures.hit(event.id);
				creatures.soundAt(event.id, 'hurt', event.position, 4);
				break;
			case 'creatureDie':
				if (event.id !== 'manifestation') creatures.soundAt(event.id, 'die', event.position, 5);
				break;
		}
	}

	update(delta: number): void {
		this.effects.update(delta, this.ctx.engine.camera);
	}

	dispose(): void {
		this.effects.dispose();
	}
}
