import { RUMBLE, type RumbleId } from '#lib/content/rumble.ts';
import { settings } from '#lib/settings/settings.svelte.ts';
import type { PadFamily } from './actions.ts';
import { device } from './device.svelte.ts';

/**
 * Controllers: read every frame (the Gamepad API has no button events), merged into one set of
 * held buttons and two sticks, and who used what last (`device`). Only controllers with the
 * standard layout count. `InputMap` turns the buttons into actions. See docs/dev/controller.md.
 */

/** A stick past its dead zone: each axis -1..1, y down; 0, 0 inside the dead zone. */
export interface Stick {
	x: number;
	y: number;
}

/** The standard layout's buttons, by index. The 17th, the guide button, belongs to the system. */
const BUTTONS = [
	'PadA',
	'PadB',
	'PadX',
	'PadY',
	'PadLB',
	'PadRB',
	'PadLT',
	'PadRT',
	'PadView',
	'PadMenu',
	'PadL3',
	'PadR3',
	'PadUp',
	'PadDown',
	'PadLeft',
	'PadRight'
] as const;
/** Indices of the analog triggers, pressed past TRIGGER_PRESS. */
const TRIGGERS = new Set([6, 7]);
const TRIGGER_PRESS = 0.3;
/** How far the left stick goes one way before it presses that move action. */
const STICK_PRESS = 0.3;
/** Pixels the mouse has to move to count as using it, so a bumped desk doesn't switch devices. */
const MOUSE_SWITCH = 12;
/** Sony's vendor id as Chrome ("Vendor: 054c"), Firefox ("054c-") and Safari ("54c-") write it. */
const PLAYSTATION = /\b0?54c\b|playstation|dualshock|dualsense/i;
const STILL: Stick = { x: 0, y: 0 };

let held = new Set<string>();
let left = STILL;
let right = STILL;
const listeners = new Set<(code: string) => void>();

/** The controllers' merged state, as `InputMap` reads it. */
export const pads = {
	/** True while any controller holds this button ('PadA'), or pushes the left stick that way. */
	isDown(code: string): boolean {
		return held.has(code);
	},
	/** The left stick (the one pushed furthest, with several controllers). */
	left(): Stick {
		return left;
	},
	right(): Stick {
		return right;
	},
	/** Called once each time a button is pressed. Returns an unsubscribe function. */
	onPress(listener: (code: string) => void): () => void {
		listeners.add(listener);
		return () => listeners.delete(listener);
	}
};

/** Every connected controller, standard or not (for the admin screen). */
export function connectedPads(): Gamepad[] {
	return navigator.getGamepads().filter((pad): pad is Gamepad => !!pad?.connected);
}

/** Which icons suit this controller, from its id. */
export function familyOf(pad: Gamepad): PadFamily {
	return PLAYSTATION.test(pad.id) ? 'playstation' : 'xbox';
}

/** Whether a controller in use can vibrate (Firefox, and some controllers, can't). */
export function canRumble(): boolean {
	return standardPads().some(canVibrate);
}

/** Whether this controller can vibrate, in this browser. */
export function canVibrate(pad: Gamepad): boolean {
	return actuator(pad) !== null;
}

/** Play a rumble effect, while the controller is in use and Vibration is on. */
export function rumble(id: RumbleId): void {
	if (device.kind === 'pad' && settings.controller.vibration) playRumble(id);
}

/** Play a rumble effect whatever the device and setting (the admin screen's test). */
export function playRumble(id: RumbleId): void {
	const effect = RUMBLE[id];
	for (const pad of standardPads()) {
		actuator(pad)
			?.playEffect('dual-rumble', {
				duration: effect.duration,
				strongMagnitude: effect.strong,
				weakMagnitude: effect.weak
			})
			// A controller that can't play it just doesn't.
			.catch(() => undefined);
	}
}

/**
 * Read controllers every frame, and watch the keyboard and mouse for the last device used. Call
 * once for the whole site (the root layout); returns a function that stops it.
 */
export function startGamepads(): () => void {
	let frame = requestAnimationFrame(function loop() {
		poll();
		frame = requestAnimationFrame(loop);
	});
	let moved = 0;
	const keyboard = (): void => {
		device.kind = 'keyboard';
		device.lost = false;
		moved = 0;
	};
	const mouseMove = (event: MouseEvent): void => {
		if (device.kind === 'keyboard') return;
		moved += Math.abs(event.movementX) + Math.abs(event.movementY);
		if (moved > MOUSE_SWITCH) keyboard();
	};
	const connected = (): void => {
		device.lost = false;
	};
	const disconnected = (): void => {
		if (device.kind !== 'pad' || standardPads().length) return;
		device.kind = 'keyboard';
		device.lost = true;
	};
	window.addEventListener('keydown', keyboard);
	window.addEventListener('mousedown', keyboard);
	window.addEventListener('wheel', keyboard);
	window.addEventListener('mousemove', mouseMove);
	window.addEventListener('gamepadconnected', connected);
	window.addEventListener('gamepaddisconnected', disconnected);
	return () => {
		cancelAnimationFrame(frame);
		window.removeEventListener('keydown', keyboard);
		window.removeEventListener('mousedown', keyboard);
		window.removeEventListener('wheel', keyboard);
		window.removeEventListener('mousemove', mouseMove);
		window.removeEventListener('gamepadconnected', connected);
		window.removeEventListener('gamepaddisconnected', disconnected);
		held = new Set();
		left = STILL;
		right = STILL;
	};
}

/** The connected controllers that count: those with the standard layout. */
export function standardPads(): Gamepad[] {
	return connectedPads().filter((pad) => pad.mapping === 'standard');
}

/** `vibrationActuator` is missing in Firefox and on some controllers, whatever the DOM types say. */
function actuator(pad: Gamepad): GamepadHapticActuator | null {
	return (pad.vibrationActuator as GamepadHapticActuator | null | undefined) ?? null;
}

/** Read every controller: what is held, the sticks, what was just pressed, and who used it. */
function poll(): void {
	const down = new Set<string>();
	let nextLeft = STILL;
	let nextRight = STILL;
	let used: Gamepad | null = null;
	// Like the keyboard, a controller does nothing while the window isn't focused.
	const active = document.hasFocus() ? standardPads() : [];
	for (const pad of active) {
		for (const [index, code] of BUTTONS.entries()) {
			const button = pad.buttons[index];
			if (!button) continue;
			if (TRIGGERS.has(index) ? button.value < TRIGGER_PRESS : !button.pressed) continue;
			down.add(code);
			if (!held.has(code)) used = pad;
		}
		const l = deadZone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
		const r = deadZone(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
		if (length(l) > length(nextLeft)) nextLeft = l;
		if (length(r) > length(nextRight)) nextRight = r;
		if (length(l) > 0 || length(r) > 0) used ??= pad;
	}
	if (nextLeft.y < -STICK_PRESS) down.add('PadStickUp');
	if (nextLeft.y > STICK_PRESS) down.add('PadStickDown');
	if (nextLeft.x < -STICK_PRESS) down.add('PadStickLeft');
	if (nextLeft.x > STICK_PRESS) down.add('PadStickRight');

	const pressed = [...down].filter((code) => !held.has(code));
	held = down;
	left = nextLeft;
	right = nextRight;
	if (used) {
		device.kind = 'pad';
		device.detected = familyOf(used);
		device.lost = false;
	}
	for (const code of pressed) for (const listener of listeners) listener(code);
}

/** A radial dead zone: nothing inside it, and past it the push rescaled to start from 0. */
function deadZone(x: number, y: number): Stick {
	const zone = settings.controller.deadZone;
	const push = Math.hypot(x, y);
	if (push <= zone) return STILL;
	const scale = (Math.min(1, push) - zone) / (1 - zone) / push;
	return { x: x * scale, y: y * scale };
}

function length(stick: Stick): number {
	return Math.hypot(stick.x, stick.y);
}
