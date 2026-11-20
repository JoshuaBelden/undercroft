import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { ALERT, mergesWith } from '#lib/content/alerts.ts';
import { settings } from '#lib/settings/settings.svelte.ts';
import type { Alert } from '#lib/shared/alerts/types.ts';

/**
 * Alerts showing at the right edge (src/lib/ui/Alerts.svelte), newest last. Anything can raise
 * one: the game server's `alert` messages (connection.svelte.ts), a purchase, a pickup. Each goes
 * after `ALERT.seconds`, with the time held while the pointer or focus is on it. See
 * docs/dev/alerts.md.
 */
export const alerts: { list: { id: number; alert: Alert }[] } = $state({ list: [] });

/** Where clicking an alert goes. The play page puts its own in while it is open. */
export interface AlertTargets {
	item: () => void;
	social: () => void;
	/** A note goes nowhere: clicking it only dismisses it. */
	note: () => void;
	/** A discovery: the Library. */
	discovery: () => void;
}

const SITE_TARGETS: AlertTargets = {
	item: () => void goto(resolve('/(hub)/loadout')),
	social: () => void goto(resolve('/(hub)/social')),
	note: () => {},
	discovery: () => void goto(resolve('/(hub)/library'))
};
let targets: AlertTargets = SITE_TARGETS;
let sound: () => void = () => {};
/** Each alert's time running out, by id. Not state: nothing on screen follows it. */
const timers: Record<number, ReturnType<typeof setTimeout>> = {};
let nextId = 1;

/** Show an alert (unless alerts are turned off in the settings). */
export function raise(alert: Alert): void {
	if (!settings.interface.alerts) return;
	const shown = alerts.list.find((entry) => mergesWith(entry.alert, alert));
	if (shown && shown.alert.kind === 'item' && alert.kind === 'item') {
		shown.alert = { ...shown.alert, count: shown.alert.count + alert.count };
		hold(shown.id, false);
		return;
	}
	const id = nextId++;
	alerts.list.push({ id, alert });
	while (alerts.list.length > ALERT.max) dismiss(alerts.list[0].id);
	hold(id, false);
	sound();
}

/** Take an alert away now. */
export function dismiss(id: number): void {
	clearTimeout(timers[id]);
	delete timers[id];
	alerts.list = alerts.list.filter((entry) => entry.id !== id);
}

/** Hold an alert while it is pointed at or focused; let go and its time starts over. */
export function hold(id: number, held: boolean): void {
	clearTimeout(timers[id]);
	delete timers[id];
	if (held) return;
	const entry = alerts.list.find((other) => other.id === id);
	const seconds = (entry?.alert.kind === 'note' && entry.alert.seconds) || ALERT.seconds;
	timers[id] = setTimeout(() => dismiss(id), seconds * 1000);
}

/** An alert was clicked: go where it is about, and take it away. */
export function follow(id: number): void {
	const entry = alerts.list.find((other) => other.id === id);
	if (!entry) return;
	dismiss(id);
	targets[entry.alert.kind]();
}

/** Put in other click targets (the play page's); returns a function that puts back the site's. */
export function useAlertTargets(own: AlertTargets): () => void {
	targets = own;
	return () => {
		if (targets === own) targets = SITE_TARGETS;
	};
}

/** What plays when an alert comes in (the root layout's UI sound). */
export function onAlertSound(play: () => void): void {
	sound = play;
}
