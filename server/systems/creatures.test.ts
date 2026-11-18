import { describe, expect, it } from 'vitest';
import { SANITY } from '../../src/lib/content/player/sanity.ts';
import { THROW_DRAW } from '../../src/lib/shared/items/weapons.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import { HAND } from '../../src/lib/shared/player/types.ts';
import type { Session } from '../session.ts';
import { useSessions, kit, Diver } from '../testing/harness.ts';

const SEED = 1;
const open = useSessions();

/** The middle of the first living creature's body. */
function creatureChest(session: Session): Vec3 {
	const body = session['creatures'].hitBodies()[0];
	return [body.position[0], body.position[1] + body.height * 0.55, body.position[2]];
}

describe('fighting', () => {
	it('a revolver shot hits a creature in front, and enough of them kill it', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['revolver'], ['ammo.revolver', 30]));
		diver.state.flags.godMode = true;
		session.admin(diver.id, { kind: 'clearCreatures' });
		session.admin(diver.id, { kind: 'spawnCreature' });
		diver.hold({}, 0.5);
		const events = () => diver.socket.all('tick').flatMap((t) => t.events);
		for (let i = 0; i < 12 && session['creatures'].hitBodies().length; i++) {
			const look = diver.lookAt(creatureChest(session));
			diver.hold({ ...look, aim: true }, 0.1);
			diver.press({ ...look, aim: true, attack: true });
			diver.hold({ ...look, aim: true, reload: i % 6 === 5 }, 0.6);
		}
		expect(events().some((e) => e.kind === 'shot' && e.creature)).toBe(true);
		expect(events().some((e) => e.kind === 'creatureHit')).toBe(true);
		expect(events().some((e) => e.kind === 'creatureDie' && e.by === diver.id)).toBe(true);
		expect(diver.player.stats.kills).toBe(1);
	});

	it('an empty gun clicks, and reloads from the ammo carried', () => {
		const session = open(SEED);
		const inv = kit(['revolver'], ['ammo.revolver', 6]);
		inv.equipment.primary!.loaded = 0;
		const diver = new Diver(session, 'A', inv);
		diver.hold({}, 0.5);
		diver.press({ attack: true });
		diver.hold({}, 3);
		const events = diver.socket.all('tick').flatMap((t) => t.events);
		expect(events.some((e) => e.kind === 'empty')).toBe(true);
		expect(events.some((e) => e.kind === 'reload')).toBe(true);
		expect(diver.state.inventory.equipment.primary!.loaded).toBe(6);
	});

	it('a knife swing hits a creature close in front', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['knife']));
		diver.state.flags.godMode = true;
		session.admin(diver.id, { kind: 'clearCreatures' });
		session.admin(diver.id, { kind: 'spawnCreature' });
		const events = () => diver.socket.all('tick').flatMap((t) => t.events);
		for (let i = 0; i < 40 && !events().some((e) => e.kind === 'creatureHit'); i++) {
			// Let it come to us, and stab at it: a tap (held, a knife is drawn back to throw).
			const look = diver.lookAt(creatureChest(session));
			diver.hold({ ...look, attack: true }, 0.1);
			diver.hold(look, 0.15);
		}
		expect(events().some((e) => e.kind === 'swing' && e.hit === 'creature')).toBe(true);
	});

	it('a brick held back and let go is thrown, and lands', () => {
		const session = open(SEED);
		session.admin('nobody', { kind: 'clearCreatures' });
		const diver = new Diver(session, 'A', kit(['brick']));
		diver.hold({ select: HAND.quick }, 0.5);
		diver.hold({ pitch: -0.3, attack: true }, THROW_DRAW + 0.1);
		diver.hold({ pitch: -0.3 }, 2);
		const events = diver.socket.all('tick').flatMap((t) => t.events);
		expect(events.some((e) => e.kind === 'throw' && e.item === 'brick')).toBe(true);
		expect(events.some((e) => e.kind === 'land' && e.item === 'brick')).toBe(true);
		expect(diver.state.inventory.quick[0]).toBeNull();
	});

	it('creatures attack a player who stands in front of them, and a coat takes the blows', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['coat']));
		session.admin(diver.id, { kind: 'clearCreatures' });
		session.admin(diver.id, { kind: 'spawnCreature' });
		diver.hold({}, 12);
		expect(
			diver.state.sanity < SANITY.max || diver.state.inventory.equipment.defense === null
		).toBe(true);
	});
});
