import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alert } from '../src/lib/shared/alerts/types.ts';
import { Alerts } from './alerts.ts';
import { Parties } from './parties.ts';
import { FakeSocket, fakeTime } from './testing/harness.ts';

let parties: Parties;
let alerts: Alerts;

beforeEach(() => {
	fakeTime();
	parties = new Parties();
	alerts = new Alerts(parties);
});
afterEach(() => {
	parties.stop();
	vi.useRealTimers();
});

function arrive(name: string) {
	const socket = new FakeSocket();
	const member = parties.connect(socket.ws, {
		account: `acc-${name}`,
		explorer: `exp-${name}`,
		gamerTag: name,
		avatar: null
	});
	return { member, socket };
}

const gift: Alert = {
	kind: 'item',
	item: 'bandage',
	count: 2,
	source: 'gift',
	from: { account: 'acc-Ann', name: 'Ann' }
};

describe('Alerts', () => {
	it('reaches the account it is for and no one else', () => {
		const ann = arrive('Ann');
		const bob = arrive('Bob');
		expect(alerts.send('acc-Bob', gift)).toBe(true);
		expect(bob.socket.all('alert')).toEqual([{ type: 'alert', alert: gift }]);
		expect(ann.socket.all('alert')).toEqual([]);
	});

	it('does nothing for an account that is not connected', () => {
		const bob = arrive('Bob');
		parties.disconnect(bob.member, bob.socket.ws);
		expect(alerts.send('acc-Bob', gift)).toBe(false);
		expect(alerts.send('acc-Nobody', gift)).toBe(false);
		expect(bob.socket.all('alert')).toEqual([]);
	});
});
