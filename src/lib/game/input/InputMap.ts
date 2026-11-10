import { ACTIONS, type Action } from './actions.ts';
import { settings } from '#lib/settings/settings.svelte.ts';

type Listener = (action: Action) => void;

/**
 * Translates raw keyboard and mouse events into actions using the player's bindings.
 * Attach once per game view; call `dispose()` on teardown.
 */
export class InputMap {
	private down = new Set<string>();
	private listeners = new Set<Listener>();
	private target: Window;

	constructor(target: Window = window) {
		this.target = target;
		target.addEventListener('keydown', this.onKeyDown);
		target.addEventListener('keyup', this.onKeyUp);
		target.addEventListener('mousedown', this.onMouseDown);
		target.addEventListener('mouseup', this.onMouseUp);
		target.addEventListener('blur', this.onBlur);
	}

	/** True while any key bound to the action is held. */
	isDown(action: Action): boolean {
		return settings.bindings[action].some((code) => this.down.has(code));
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
		this.listeners.clear();
	}

	private press(code: string, event: Event): void {
		if (this.down.has(code)) return;
		this.down.add(code);
		for (const action of Object.keys(ACTIONS) as Action[]) {
			if (settings.bindings[action].includes(code)) {
				event.preventDefault();
				for (const listener of this.listeners) listener(action);
			}
		}
	}

	private onKeyDown = (event: KeyboardEvent): void => {
		if (event.repeat || isTyping(event)) return;
		this.press(event.code, event);
	};

	private onKeyUp = (event: KeyboardEvent): void => {
		this.down.delete(event.code);
	};

	private onMouseDown = (event: MouseEvent): void => {
		this.press(`Mouse${event.button}`, event);
	};

	private onMouseUp = (event: MouseEvent): void => {
		this.down.delete(`Mouse${event.button}`);
	};

	private onBlur = (): void => {
		this.down.clear();
	};
}

function isTyping(event: KeyboardEvent): boolean {
	const element = event.target as HTMLElement | null;
	return element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA';
}
