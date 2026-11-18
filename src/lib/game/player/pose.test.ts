import { describe, expect, it } from 'vitest';
import { addItem, emptyInventory, newStack } from '#lib/shared/items/inventory.ts';
import { createPlayerState } from '#lib/shared/player/simulate.ts';
import { HAND, type PlayerState } from '#lib/shared/player/types.ts';
import { upperBodyPose } from './pose.ts';

/** Standing, with `item` in the hand. */
function holding(item: string): PlayerState {
	const inv = emptyInventory();
	addItem(inv, newStack(item, 1, 6));
	inv.selected = inv.equipment.primary ? HAND.primary : HAND.quick;
	const s = createPlayerState([0, 0, 0], 0, inv);
	s.grounded = true;
	return s;
}

describe('upperBodyPose', () => {
	it('holds by the grip: one hand, two hands, or an item in front', () => {
		expect(upperBodyPose(holding('revolver'))?.slot).toBe('hold_one_hand');
		expect(upperBodyPose(holding('knife'))?.slot).toBe('hold_one_hand');
		expect(upperBodyPose(holding('shotgun'))?.slot).toBe('hold_two_hand');
		expect(upperBodyPose(holding('bandage'))?.slot).toBe('hold_item');
	});

	it('nothing in the hand leaves the arms alone', () => {
		expect(upperBodyPose(createPlayerState([0, 0, 0], 0))).toBeNull();
	});

	it('fires and reloads by the gun, from the weapon clock', () => {
		const revolver = holding('revolver');
		revolver.weapon.action = 'shot';
		revolver.weapon.time = 0.1;
		expect(upperBodyPose(revolver)).toEqual({ slot: 'fire_one_hand', at: 0.1 });
		const shotgun = holding('shotgun');
		shotgun.weapon.action = 'shot';
		expect(upperBodyPose(shotgun)?.slot).toBe('fire_two_hand');
		shotgun.weapon.action = 'reload';
		shotgun.weapon.time = 1;
		expect(upperBodyPose(shotgun)).toEqual({ slot: 'reload', at: 1, seconds: 3 });
	});

	it('bandaging and changing a battery, on yourself or a teammate', () => {
		const bandage = holding('bandage');
		bandage.bandaging = 0.5;
		expect(upperBodyPose(bandage)?.slot).toBe('use_bandage');
		bandage.bandaging = 0;
		bandage.tending = 0.5;
		expect(upperBodyPose(bandage)?.slot).toBe('use_bandage');
		const medkit = holding('medkit');
		medkit.bandaging = 0.5;
		expect(upperBodyPose(medkit)?.slot).toBe('use_medkit');
		medkit.bandaging = 0;
		medkit.tending = 0.5;
		expect(upperBodyPose(medkit)?.slot).toBe('use_bandage');
		const battery = holding('battery');
		battery.tending = 0.5;
		expect(upperBodyPose(battery)?.slot).toBe('use_battery');
	});

	it('the whole body takes over: a swing, a rope, down, swimming, crawling', () => {
		const swing = holding('crowbar');
		swing.weapon.action = 'swing';
		expect(upperBodyPose(swing)).toBeNull();
		for (const change of [
			(s: PlayerState) => (s.downed = true),
			(s: PlayerState) => (s.swimming = true),
			(s: PlayerState) => (s.stance = 'crawl'),
			(s: PlayerState) => (s.climbing = { rope: 'r', side: [0, 1] })
		]) {
			const s = holding('revolver');
			change(s);
			expect(upperBodyPose(s)).toBeNull();
		}
	});
});
