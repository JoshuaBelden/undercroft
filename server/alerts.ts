import type { Alert } from '../src/lib/shared/alerts/types.ts';
import type { Parties } from './parties.ts';

/**
 * Where any part of the game server tells a player something worth a notice (docs/dev/alerts.md):
 * a friend request, an invite, an item given to them. The account's connection gets it, on the
 * site or underground. Alerts are live only: an account that isn't connected gets nothing.
 */
export class Alerts {
	constructor(private parties: Parties) {}

	/** Send an alert to an account. False if they aren't connected. */
	send(account: string, alert: Alert): boolean {
		const member = this.parties.find(account);
		if (!member?.connected) return false;
		this.parties.tell(member, { type: 'alert', alert });
		return true;
	}
}
