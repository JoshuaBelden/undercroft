import type { Attachment } from 'svelte/attachments';
import { device } from './device.svelte.ts';
import { pads } from './gamepad.ts';

/**
 * The controller in menus. Every screen is built from native buttons and inputs, so one focus
 * system drives them all: a screen marks itself as a menu (`{@attach menu(...)}`), and the one on
 * top gets the controller. The D-pad or left stick moves the focus to the nearest control that
 * way, A presses it, B backs out, LB/RB switch tabs and the right stick scrolls. See
 * docs/dev/controller.md.
 *
 * A menu opens on its first control outside its header (where tabs and Close live). Markup can
 * steer it:
 * - `data-pad-stop` with `tabindex="-1"`: somewhere the focus can rest that isn't a control
 *   (a crate's sealed slot), so a grid with gaps still moves as a grid.
 * - `data-pad-scroll`: what the right stick scrolls when nothing around the focus does (a
 *   TabScreen's fields, with the focus on its tabs).
 * - `data-pad-stepper`: a value with a button either side (and maybe a field between): it is one
 *   stop, and left and right press its first and last buttons.
 * - A `padpress` event (a `CustomEvent<PadButton>`) reaches the focused control first; calling
 *   `preventDefault()` on it means it was handled (item slots carry things this way).
 */

/** A face button pressed on the focused control. */
export type PadButton = 'a' | 'b' | 'x' | 'y';

export interface MenuOptions {
	/** B: back out one step (close it, or go up a page). */
	back?: () => void;
	/** LB (-1) or RB (1): the tab before or after this one. */
	tabs?: (by: -1 | 1) => void;
	/** Remember the control used last under this name, for the next time the menu opens. */
	key?: string;
}

type Direction = 'up' | 'down' | 'left' | 'right';

interface Menu extends MenuOptions {
	root: HTMLElement;
	/** The control focused last, and where it was then. */
	last: HTMLElement | null;
	lastRect: DOMRect | null;
}

const DIRECTIONS: Record<string, Direction> = {
	PadUp: 'up',
	PadDown: 'down',
	PadLeft: 'left',
	PadRight: 'right',
	PadStickUp: 'up',
	PadStickDown: 'down',
	PadStickLeft: 'left',
	PadStickRight: 'right'
};
const FACES: Record<string, PadButton> = { PadA: 'a', PadB: 'b', PadX: 'x', PadY: 'y' };
/** Every button a menu takes from the game while it is open. */
const TAKEN = new Set([...Object.keys(DIRECTIONS), ...Object.keys(FACES), 'PadLB', 'PadRB']);
const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]';
/** Milliseconds a direction is held before it repeats, and then between repeats. */
const REPEAT_DELAY = 400;
const REPEAT_EVERY = 90;
/** Pixels a second the right stick scrolls at full push. */
const SCROLL_SPEED = 1400;

const menus: Menu[] = [];
/** The control used last in each menu with a `key`, by its place among the menu's controls. */
const remembered = new Map<string, number>();
const moveListeners = new Set<() => void>();
/** The direction held, by which button, and when it next repeats. */
let held: { code: string; direction: Direction; at: number } | null = null;
/** The right stick's scroll not yet a whole pixel. */
const carry = { x: 0, y: 0 };
let frame = 0;
let lastFrame = 0;
let unsubscribe: (() => void) | null = null;

/** Make an element a menu the controller drives, while it is on the page. */
export function menu(options: MenuOptions = {}): Attachment<HTMLElement> {
	return (root) => {
		const entry: Menu = { ...options, root, last: null, lastRect: null };
		const focused = (event: FocusEvent): void => {
			const target = event.target;
			// A menu inside this one remembers its own.
			if (!(target instanceof HTMLElement) || owner(target) !== entry) return;
			entry.last = target;
			entry.lastRect = target.getBoundingClientRect();
			const index = controls(entry).indexOf(target);
			if (entry.key !== undefined && index >= 0) remembered.set(entry.key, index);
		};
		root.addEventListener('focusin', focused);
		menus.push(entry);
		if (menus.length === 1) start();
		return () => {
			root.removeEventListener('focusin', focused);
			menus.splice(menus.indexOf(entry), 1);
			if (menus.length === 0) stop();
		};
	};
}

/** Whether a menu is open and takes this controller button from the game (`InputMap`). */
export function menuTakes(code: string): boolean {
	return TAKEN.has(code) && top() !== null;
}

/** Called each time the controller moves the focus or switches tabs (the menu tick). */
export function onMenuMove(listener: () => void): () => void {
	moveListeners.add(listener);
	return () => moveListeners.delete(listener);
}

function start(): void {
	unsubscribe = pads.onPress(press);
	lastFrame = performance.now();
	frame = requestAnimationFrame(loop);
}

function stop(): void {
	unsubscribe?.();
	unsubscribe = null;
	cancelAnimationFrame(frame);
	held = null;
}

/**
 * Every frame while the controller is in use: keep the focus in the menu on top (it opened, or
 * what had the focus went away), repeat a held direction, and scroll with the right stick.
 */
function loop(now: number): void {
	const seconds = Math.min(0.1, (now - lastFrame) / 1000);
	lastFrame = now;
	const menu = top();
	if (menu && device.kind === 'pad') {
		if (!focused(menu)) focusStart(menu);
		if (held && !pads.isDown(held.code)) held = null;
		if (held && now >= held.at) {
			held.at = now + REPEAT_EVERY;
			move(menu, held.direction);
		}
		scroll(menu, seconds);
	}
	frame = requestAnimationFrame(loop);
}

function press(code: string): void {
	const menu = top();
	if (!menu) return;
	const direction = DIRECTIONS[code];
	if (direction) {
		held = { code, direction, at: performance.now() + REPEAT_DELAY };
		move(menu, direction);
		return;
	}
	if ((code === 'PadLB' || code === 'PadRB') && menu.tabs) {
		menu.tabs(code === 'PadLB' ? -1 : 1);
		for (const listener of moveListeners) listener();
		return;
	}
	const button = FACES[code];
	if (!button) return;
	const target = focused(menu);
	// Nothing focused yet: the first press only puts the focus in the menu. B still backs out.
	if (!target && button !== 'b') {
		focusStart(menu);
		return;
	}
	const event = new CustomEvent<PadButton>('padpress', {
		detail: button,
		bubbles: true,
		cancelable: true
	});
	if (target && !target.dispatchEvent(event)) return;
	if (button === 'a' && target) activate(target);
	if (button === 'b') menu.back?.();
}

function move(menu: Menu, direction: Direction): void {
	const from = focused(menu);
	if (!from) {
		focusStart(menu);
		return;
	}
	const sideways = direction === 'left' || direction === 'right';
	if (sideways && adjust(from, direction === 'left' ? -1 : 1)) return;
	const rect = from.getBoundingClientRect();
	let best: HTMLElement | null = null;
	let bestDistance = Infinity;
	for (const control of controls(menu)) {
		if (control === from) continue;
		const distance = distanceTo(rect, control.getBoundingClientRect(), direction);
		if (distance !== null && distance < bestDistance) {
			best = control;
			bestDistance = distance;
		}
	}
	if (!best) return;
	focus(best);
	for (const listener of moveListeners) listener();
}

/** Left and right on a slider or stepper change its value. True if `control` is one. */
function adjust(control: HTMLElement, by: -1 | 1): boolean {
	if (control instanceof HTMLInputElement && control.type === 'range') {
		const before = control.value;
		if (by > 0) control.stepUp();
		else control.stepDown();
		if (control.value !== before) {
			control.dispatchEvent(new Event('input', { bubbles: true }));
			control.dispatchEvent(new Event('change', { bubbles: true }));
		}
		return true;
	}
	const stepper = control.closest('[data-pad-stepper]');
	if (!stepper) return false;
	const buttons = stepper.querySelectorAll('button');
	buttons[by < 0 ? 0 : buttons.length - 1]?.click();
	return true;
}

/** A: press the control. Typing needs the keyboard, and sliders move with left and right. */
function activate(control: HTMLElement): void {
	if (control.matches('input:not([type="checkbox"], [type="radio"]), textarea, select')) return;
	control.click();
}

/** The right stick scrolls whatever scrolls around the focus, or the menu's `data-pad-scroll`. */
function scroll(menu: Menu, seconds: number): void {
	const stick = pads.right();
	const from = focused(menu) ?? menu.root;
	const page = document.scrollingElement ?? document.documentElement;
	for (const axis of ['x', 'y'] as const) {
		carry[axis] = stick[axis] ? carry[axis] + stick[axis] * SCROLL_SPEED * seconds : 0;
		const by = Math.trunc(carry[axis]);
		if (!by) continue;
		carry[axis] -= by;
		const box = scroller(from, axis) ?? menu.root.querySelector('[data-pad-scroll]') ?? page;
		box.scrollBy(
			axis === 'x' ? { left: by, behavior: 'instant' } : { top: by, behavior: 'instant' }
		);
	}
}

/** The nearest element around `from` that can scroll along `axis`, if any. */
function scroller(from: Element, axis: 'x' | 'y'): Element | null {
	for (let at: Element | null = from; at; at = at.parentElement) {
		const style = getComputedStyle(at);
		const overflow = axis === 'x' ? style.overflowX : style.overflowY;
		const room = axis === 'x' ? at.scrollWidth > at.clientWidth : at.scrollHeight > at.clientHeight;
		if (room && (overflow === 'auto' || overflow === 'scroll')) return at;
	}
	return null;
}

/**
 * How far `to` is from `from` going `direction`, or null if it isn't that way: the gap along the
 * way, plus a heavy price for being off to the side, so a control in line wins over a nearer one
 * off the line.
 */
function distanceTo(from: DOMRect, to: DOMRect, direction: Direction): number | null {
	const across = direction === 'left' || direction === 'right';
	const sign = direction === 'right' || direction === 'down' ? 1 : -1;
	const [fromStart, fromEnd, toStart, toEnd] = across
		? [from.left, from.right, to.left, to.right]
		: [from.top, from.bottom, to.top, to.bottom];
	const [sideStart, sideEnd, toSideStart, toSideEnd] = across
		? [from.top, from.bottom, to.top, to.bottom]
		: [from.left, from.right, to.left, to.right];
	// Its centre has to be ahead of this one's.
	const ahead = ((toStart + toEnd) / 2 - (fromStart + fromEnd) / 2) * sign;
	if (ahead <= 1) return null;
	const gap = Math.max(0, sign > 0 ? toStart - fromEnd : fromStart - toEnd);
	const aside = Math.max(0, toSideStart - sideEnd, sideStart - toSideEnd);
	const offset = Math.abs((toSideStart + toSideEnd) / 2 - (sideStart + sideEnd) / 2);
	return gap + aside * 3 + offset * 0.1;
}

/**
 * The menu the controller drives: inside a modal dialog if one is open, otherwise the one latest
 * in the page (an overlay comes after what it covers, a menu inside another after that one).
 */
function top(): Menu | null {
	const modal = document.querySelector('dialog:modal');
	let found: Menu | null = null;
	for (const menu of menus) {
		// Inert while it is on its way out (a transition), or behind a modal dialog.
		if (!menu.root.isConnected || menu.root.closest('[inert]')) continue;
		if (modal && !modal.contains(menu.root)) continue;
		const later = found?.root.compareDocumentPosition(menu.root) ?? 0;
		if (!found || later & Node.DOCUMENT_POSITION_FOLLOWING) found = menu;
	}
	return found;
}

/** The innermost menu `element` is in. */
function owner(element: Element): Menu | null {
	let found: Menu | null = null;
	for (const menu of menus) {
		if (menu.root.contains(element) && (!found || found.root.contains(menu.root))) found = menu;
	}
	return found;
}

/** The controls in a menu the focus can stop on, in page order (not those of a menu inside it). */
function controls(menu: Menu): HTMLElement[] {
	return [...menu.root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((control) => {
		if (control.matches(':disabled, [tabindex="-1"]:not([data-pad-stop])')) return false;
		if (control.closest('[inert]')) return false;
		if (!control.checkVisibility({ visibilityProperty: true })) return false;
		// A stepper is one stop: its first control stands for it.
		const stepper = control.closest('[data-pad-stepper]');
		if (stepper && stepperStop(stepper) !== control) return false;
		return owner(control) === menu;
	});
}

function stepperStop(stepper: Element): Element | undefined {
	return [...stepper.querySelectorAll(FOCUSABLE)].find((control) => !control.matches(':disabled'));
}

/** The control in the menu that has the focus, if any. */
function focused(menu: Menu): HTMLElement | null {
	const active = document.activeElement;
	return active instanceof HTMLElement && active !== menu.root && menu.root.contains(active)
		? active
		: null;
}

/**
 * Put the focus in a menu: back on the control used last, or the one nearest where it was (that
 * one went away), or the one used last time it was open, or where it opens.
 */
function focusStart(menu: Menu): void {
	const all = controls(menu);
	let start: HTMLElement | undefined;
	if (menu.last && all.includes(menu.last)) start = menu.last;
	else if (menu.lastRect) start = nearest(all, menu.lastRect);
	else {
		const index = menu.key === undefined ? undefined : remembered.get(menu.key);
		start = index === undefined ? undefined : all[index];
		start ??= all.find((control) => !inHeader(menu, control)) ?? all[0];
	}
	if (start) focus(start);
}

function inHeader(menu: Menu, control: HTMLElement): boolean {
	const header = control.closest('header');
	return !!header && menu.root.contains(header);
}

function nearest(controls: HTMLElement[], to: DOMRect): HTMLElement | undefined {
	let best: HTMLElement | undefined;
	let bestDistance = Infinity;
	for (const control of controls) {
		const rect = control.getBoundingClientRect();
		const distance = Math.hypot(
			rect.left + rect.width / 2 - (to.left + to.width / 2),
			rect.top + rect.height / 2 - (to.top + to.height / 2)
		);
		if (distance < bestDistance) {
			best = control;
			bestDistance = distance;
		}
	}
	return best;
}

function focus(control: HTMLElement): void {
	control.focus({ preventScroll: true, focusVisible: true });
	control.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}
