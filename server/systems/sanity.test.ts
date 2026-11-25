import { describe, expect, it } from 'vitest';
import { SANITY } from '../../src/lib/content/player/sanity.ts';
import { useSessions, kit, Diver, wait } from '../testing/harness.ts';

const SEED = 1;
const open = useSessions();

describe('down, dead and revived', () => {
	it('at no sanity a player is down; holding climb gives up, and they die', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['coins', 3]));
		session.admin(diver.id, { kind: 'setSanity', value: 0 });
		expect(diver.state.downed).toBe(true);
		diver.hold({}, 0.1);
		diver.hold({ climb: true }, SANITY.surrenderSeconds + 0.3);
		const died = diver.socket.last('died')!;
		expect(died.spectating).toBe(false);
		expect(diver.inside).toBe(false);
		expect(session['items'].snapshots().some((i) => i.item === 'coins')).toBe(true);
	});

	it('a downed player alone uses their own smelling salts', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['salts']));
		session.admin(diver.id, { kind: 'setSanity', value: 0 });
		diver.hold({}, 4);
		expect(diver.state.downed).toBe(false);
		expect(diver.state.sanity).toBe(SANITY.saltsReviveTo);
		expect(diver.state.inventory.quick[0]).toBeNull();
	});

	it('a downed player alone without salts stays down', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A');
		session.admin(diver.id, { kind: 'setSanity', value: 0 });
		diver.hold({}, 4);
		expect(diver.state.downed).toBe(true);
	});

	it('a teammate revives a downed player by hand, holding interact, with a little sanity', () => {
		const session = open(SEED);
		const helper = new Diver(session, 'A');
		const patient = new Diver(session, 'B');
		patient.put(helper.state.position);
		session.admin(patient.id, { kind: 'setSanity', value: 0 });
		helper.hold({ interact: true }, SANITY.reviveSeconds + 0.5);
		expect(patient.state.downed).toBe(false);
		expect(patient.state.sanity).toBe(SANITY.reviveTo);
	});

	it('a teammate with salts revives a downed player stronger, using one', () => {
		const session = open(SEED);
		const helper = new Diver(session, 'A', kit(['salts']));
		const patient = new Diver(session, 'B');
		patient.put(helper.state.position);
		session.admin(patient.id, { kind: 'setSanity', value: 0 });
		helper.hold({ interact: true }, SANITY.reviveSeconds + 0.5);
		expect(patient.state.downed).toBe(false);
		expect(patient.state.sanity).toBe(SANITY.saltsReviveTo);
		expect(helper.state.inventory.quick[0]).toBeNull();
	});

	it('letting go of interact before the revive is done starts it over', () => {
		const session = open(SEED);
		const helper = new Diver(session, 'A');
		const patient = new Diver(session, 'B');
		patient.put(helper.state.position);
		session.admin(patient.id, { kind: 'setSanity', value: 0 });
		helper.hold({ interact: true }, SANITY.reviveSeconds / 2);
		helper.hold({}, 0.2);
		helper.hold({ interact: true }, SANITY.reviveSeconds / 2);
		expect(patient.state.downed).toBe(true);
	});

	it('admin sanity brings a downed player back up', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'setSanity', value: 0 });
		session.admin(diver.id, { kind: 'setSanity', value: 50 });
		expect(diver.state.downed).toBe(false);
		// Commands come off the network: a value that isn't a number gets the default.
		session.admin(diver.id, { kind: 'setSanity', value: 'lots' as unknown as number });
		expect(diver.state.sanity).toBe(SANITY.max);
	});

	it('a dead player watches the others until they are out too', () => {
		const session = open(SEED);
		const dead = new Diver(session, 'A');
		const alive = new Diver(session, 'B');
		session.admin(dead.id, { kind: 'setSanity', value: 0 });
		dead.hold({}, 0.1);
		dead.hold({ climb: true }, SANITY.surrenderSeconds + 0.3);
		expect(dead.socket.last('died')!.spectating).toBe(true);
		const ticks = dead.socket.all('tick').length;
		wait(0.5);
		expect(dead.socket.all('tick').length).toBeGreaterThan(ticks);
		session.removePlayer(alive.id);
		expect(dead.socket.last('spectateEnd')).toBeDefined();
	});

	it('the dark wears sanity down', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'clearCreatures' });
		diver.hold({ headlamp: 0 }, 3);
		expect(diver.state.sanity).toBeLessThan(SANITY.max);
	});
});
