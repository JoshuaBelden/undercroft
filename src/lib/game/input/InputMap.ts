import { ACTIONS, type Action, type Bindings } from './actions.ts';
import type { InputDevice } from './device.svelte.ts';
import { pads, type Stick } from './gamepad.ts';
import { settings } from '#lib/settings/settings.svelte.ts';

/** `device` says what pressed it: the keyboard or mouse, or a controller. */
type Listener = (action: Action, device: InputDevice) => void;

/**
 * Translates raw keyboard, mouse and controller input into actions using the player's bindings.
 * Attach once per view; call `dispose()` on teardown. Controllers are read by
 * `gamepad.ts` (see docs/dev/controller.md).
 */
export class InputMap {
	private down = new Set<string>();
	private listeners = new Set<Listener>();
	private target: Window;
	private look = { x: 0, y: 0 };
	private unsubscribePad: () => void;

	/**
	 * `only` limits it to those actions: keys and clicks bound to anything else are left alone
	 * (for screens outside the game, where the page needs them).
	 */
	constructor(
		target: Window = window,
		private only: readonly Action[] | null = null
	) {
		this.target = target;
		target.addEventListener('keydown', this.onKeyDown);
		target.addEventListener('keyup', this.onKeyUp);
		target.addEventListener('mousedown', this.onMouseDown);
		target.addEventListener('mouseup', this.onMouseUp);
		target.addEventListener('blur', this.onBlur);
		target.addEventListener('mousemove', this.onMouseMove);
		target.addEventListener('wheel', this.onWheel, { passive: false });
		target.addEventListener('contextmenu', this.onContextMenu);
		this.unsubscribePad = pads.onPress(this.onPadPress);
	}

	/** True while any key or controller button bound to the action is held (or only `device`'s). */
	isDown(action: Action, device?: InputDevice): boolean {
		const key = device !== 'pad' && settings.bindings[action].some((code) => this.down.has(code));
		const pad =
			device !== 'keyboard' && settings.padBindings[action].some((code) => pads.isDown(code));
		return key || pad;
	}

	/** The controller's left stick (movement), past its dead zone. */
	moveStick(): Stick {
		return pads.left();
	}

	/** The controller's right stick (look), past its dead zone. */
	lookStick(): Stick {
		return pads.right();
	}

	/** Mouse movement (pixels) since the last call, while the pointer is locked. */
	consumeLook(): [number, number] {
		const delta: [number, number] = [this.look.x, this.look.y];
		this.look.x = 0;
		this.look.y = 0;
		return delta;
	}

	/** Called once each time a bound key is pressed. Returns an unsubscribe function. */
	onPressed(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	dispose(): void {
		this.target.removeEventListener('keydown', this.onKeyDown);
		this.target.removeEventListener('keyup', this.onKeyUp);
		this.target.removeEventListener('mousedown', this.onMouseDown);
		this.target.removeEventListener('mouseup', this.onMouseUp);
		this.target.removeEventListener('blur', this.onBlur);
		this.target.removeEventListener('mousemove', this.onMouseMove);
		this.target.removeEventListener('wheel', this.onWheel);
		this.target.removeEventListener('contextmenu', this.onContextMenu);
		this.unsubscribePad();
		this.listeners.clear();
	}

	private press(code: string, event: Event): void {
		if (this.down.has(code)) return;
		this.down.add(code);
		this.fire(code, settings.bindings, 'keyboard', event);
	}

	/** Tell the listeners about every action `code` is bound to in `bindings`. */
	private fire(code: string, bindings: Bindings, device: InputDevice, event: Event | null): void {
		for (const action of Object.keys(ACTIONS) as Action[]) {
			if (this.only && !this.only.includes(action)) continue;
			if (bindings[action].includes(code)) {
				event?.preventDefault();
				for (const listener of this.listeners) listener(action, device);
			}
		}
	}

	/** A dialog keeps key presses from the game (Dialog.svelte), and the controller's too. */
	private onPadPress = (code: string): void => {
		if (document.querySelector('dialog:modal')) return;
		this.fire(code, settings.padBindings, 'pad', null);
	};

	private onKeyDown = (event: KeyboardEvent): void => {
		if (event.repeat || isTyping(event)) return;
		this.press(event.code, event);
	};

	private onKeyUp = (event: KeyboardEvent): void => {
		this.down.delete(event.code);
	};

	/** Mouse buttons are game buttons only while the pointer is captured; otherwise they work the UI. */
	private onMouseDown = (event: MouseEvent): void => {
		if (!document.pointerLockElement) return;
		this.press(`Mouse${event.button}`, event);
	};

	private onMouseUp = (event: MouseEvent): void => {
		this.down.delete(`Mouse${event.button}`);
	};

	private onMouseMove = (event: MouseEvent): void => {
		if (!document.pointerLockElement) return;
		this.look.x += event.movementX;
		this.look.y += event.movementY;
	};

	/** The wheel only presses: it fires its actions but is never held. */
	private onWheel = (event: WheelEvent): void => {
		if (!document.pointerLockElement || event.deltaY === 0) return;
		const code = event.deltaY < 0 ? 'WheelUp' : 'WheelDown';
		this.press(code, event);
		this.down.delete(code);
	};

	/** Right-click is a game button (aim) while playing. */
	private onContextMenu = (event: MouseEvent): void => {
		if (document.pointerLockElement) event.preventDefault();
	};

	private onBlur = (): void => {
		this.down.clear();
	};
}

/** In a text field, keys are typing, not game input. Esc still gets out of a menu. */
function isTyping(event: KeyboardEvent): boolean {
	if (event.code === 'Escape') return false;
	const element = event.target as HTMLElement | null;
	return element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA';
}
