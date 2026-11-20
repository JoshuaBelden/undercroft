import type { Person } from '../social/types.ts';

/**
 * Alerts: a short notice that slides in from the right edge so a player doesn't miss something
 * that happened to them. They are live only: nothing is stored, and a player who isn't connected
 * doesn't get one. The game server sends them (`{ type: 'alert' }`, server/alerts.ts) and the
 * client raises its own (a purchase, a pickup). See docs/dev/alerts.md.
 */

/** Something about friends or parties, between you and `person`. */
export type SocialAlertEvent =
	/** They asked to be friends. */
	| 'friendRequest'
	/** Your friend request went to them. */
	| 'friendRequestSent'
	/** You and they are friends now (either of you accepted). */
	| 'friendAccepted'
	/** They invited you to their party. */
	| 'partyInvite'
	/** Your party invite went to them. */
	| 'partyInviteSent'
	/** They accepted your invite and joined your party. */
	| 'partyJoined'
	/** They turned your invite down. */
	| 'partyInviteDeclined';

/** Where an item came from. */
export type ItemAlertSource =
	/** Bought in the store. */
	| 'store'
	/** Given by the dev admin tools. */
	| 'grant'
	/** Picked up underground. */
	| 'pickup'
	/** Given by another player (`from`). */
	| 'gift';

export type Alert =
	| { kind: 'social'; event: SocialAlertEvent; person: Person }
	/** Something to say underground (a tripwire bell rang, a tarot card drawn). */
	| { kind: 'note'; title: string; line: string }
	| {
			kind: 'item';
			/** Item id (key into ITEMS). */
			item: string;
			count: number;
			source: ItemAlertSource;
			/** Who it came from, for a gift. */
			from?: Person;
	  };
