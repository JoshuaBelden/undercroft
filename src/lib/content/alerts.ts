import type { Alert, ItemAlertSource, SocialAlertEvent } from '#lib/shared/alerts/types.ts';
import { ITEMS } from './items.ts';

/** How alerts behave (docs/dev/alerts.md). */
export const ALERT = {
	/** How long one shows before it slides away (paused while the pointer or focus is on it). */
	seconds: 3,
	/** Most shown at once: a new one past this pushes the oldest out. */
	max: 5
};

/** What each social alert says, with the other player's gamer tag. */
export const SOCIAL_ALERTS: Record<
	SocialAlertEvent,
	{ title: string; line: (name: string) => string }
> = {
	friendRequest: { title: 'Friend request', line: (name) => `${name} wants to be friends` },
	friendRequestSent: { title: 'Request sent', line: (name) => `You asked ${name} to be friends` },
	friendAccepted: { title: 'New friend', line: (name) => `You and ${name} are friends now` },
	partyInvite: { title: 'Party invite', line: (name) => `${name} invited you to their party` },
	partyInviteSent: { title: 'Invite sent', line: (name) => `You invited ${name} to your party` },
	partyJoined: { title: 'Joined your party', line: (name) => `${name} accepted your invite` },
	partyInviteDeclined: {
		title: 'Invite declined',
		line: (name) => `${name} turned down your invite`
	}
};

/** The heading of an item alert, by where it came from (a gift names the giver). */
export const ITEM_ALERTS: Record<ItemAlertSource, (from: string) => string> = {
	store: () => 'Bought',
	grant: () => 'Granted',
	pickup: () => 'Picked up',
	gift: (from) => `Gift from ${from}`
};

/**
 * Whether `next` adds to `shown` instead of showing on its own: more of the same item from the
 * same place (three bandages picked up in a row make one "3 × Bandage").
 */
export function mergesWith(shown: Alert, next: Alert): boolean {
	return (
		shown.kind === 'item' &&
		next.kind === 'item' &&
		shown.item === next.item &&
		shown.source === next.source &&
		shown.from?.account === next.from?.account
	);
}

/** "3 × Bandage", or just the name for one. */
export function itemLine(item: string, count: number): string {
	const name = ITEMS[item]?.name ?? item;
	return count > 1 ? `${count} × ${name}` : name;
}

/** An alert's heading and line, as shown. */
export function alertText(alert: Alert): { title: string; line: string } {
	if (alert.kind === 'social') {
		const text = SOCIAL_ALERTS[alert.event];
		return { title: text.title, line: text.line(alert.person.name) };
	}
	return {
		title: ITEM_ALERTS[alert.source](alert.from?.name ?? 'someone'),
		line: itemLine(alert.item, alert.count)
	};
}
