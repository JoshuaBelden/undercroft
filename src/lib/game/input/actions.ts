/**
 * Every input the game responds to is an action. Code checks actions, never raw keys,
 * so all bindings stay remappable. Bindings use KeyboardEvent.code values
 * (layout-independent) plus 'Mouse0'..'Mouse4' for mouse buttons and 'WheelUp'/'WheelDown'
 * for the scroll wheel (press-only: wheel actions never count as held).
 */

export const ACTIONS = {
	moveForward: { label: 'Move forward', category: 'Movement', defaults: ['KeyW', 'ArrowUp'] },
	moveBack: { label: 'Move back', category: 'Movement', defaults: ['KeyS', 'ArrowDown'] },
	moveLeft: { label: 'Move left', category: 'Movement', defaults: ['KeyA', 'ArrowLeft'] },
	moveRight: { label: 'Move right', category: 'Movement', defaults: ['KeyD', 'ArrowRight'] },
	sprint: { label: 'Sprint (hold)', category: 'Movement', defaults: ['ShiftLeft'] },
	// Not Ctrl: Ctrl+W closes the browser tab and pages cannot block it.
	// Tap: walk / crouch / crawl. Hold: creep while held (slow, silent walk). Sprint cancels both.
	stance: {
		label: 'Stance (tap: walk/crouch/crawl, hold: creep)',
		category: 'Movement',
		defaults: ['KeyC']
	},
	// Held while downed, it surrenders.
	climb: { label: 'Climb / swim up / surrender', category: 'Movement', defaults: ['Space'] },
	swimDown: { label: 'Swim down', category: 'Movement', defaults: ['KeyX'] },
	interact: { label: 'Interact / revive (hold)', category: 'Actions', defaults: ['KeyE'] },
	headlamp: { label: 'Headlamp mode', category: 'Light', defaults: ['KeyF'] },
	attack: { label: 'Attack / fire / use (hold)', category: 'Items', defaults: ['Mouse0'] },
	aim: { label: 'Aim (hold) / throw', category: 'Items', defaults: ['Mouse2'] },
	reload: { label: 'Reload', category: 'Items', defaults: ['KeyR'] },
	drop: { label: 'Drop held item', category: 'Items', defaults: ['KeyG'] },
	primaryWeapon: { label: 'Primary weapon', category: 'Items', defaults: ['Digit1'] },
	secondaryWeapon: { label: 'Secondary weapon', category: 'Items', defaults: ['Digit2'] },
	nextItem: { label: 'Other weapon', category: 'Items', defaults: ['WheelDown'] },
	prevItem: { label: 'Other weapon (back)', category: 'Items', defaults: ['WheelUp'] },
	// Hold: the wheel of quick-use items; move the mouse to one and let go to take it in hand.
	quickUse: { label: 'Quick-use wheel (hold)', category: 'Items', defaults: ['KeyQ'] },
	inventory: { label: 'Pack / Loadout', category: 'Items', defaults: ['Tab', 'KeyI'] },
	ritePanel: { label: 'The rite', category: 'Items', defaults: ['KeyJ'] },
	toggleSettings: { label: 'Settings menu', category: 'Interface', defaults: ['Escape'] },
	toggleHelp: { label: 'Help', category: 'Interface', defaults: ['F1'] },
	toggleSocial: { label: 'Friends and invites', category: 'Interface', defaults: ['KeyO'] },
	// The browser's own fullscreen key; the page takes it, so fullscreen is the game's own.
	toggleFullscreen: { label: 'Fullscreen', category: 'Interface', defaults: ['F11'] },
	toggleStats: { label: 'Performance stats', category: 'Interface', defaults: ['F3'] },
	toggleAdmin: { label: 'Admin panel (dev)', category: 'Interface', defaults: ['F10'] }
} as const satisfies Record<string, ActionDefinition>;

export interface ActionDefinition {
	label: string;
	category: string;
	defaults: readonly string[];
}

export type Action = keyof typeof ACTIONS;

export type Bindings = Record<Action, string[]>;

export function defaultBindings(): Bindings {
	const result = {} as Bindings;
	for (const action of Object.keys(ACTIONS) as Action[]) {
		result[action] = [...ACTIONS[action].defaults];
	}
	return result;
}

/** Human-readable label for a binding code, e.g. 'KeyW' -> 'W'. */
export function bindingLabel(code: string): string {
	if (code.startsWith('Key')) return code.slice(3);
	if (code.startsWith('Digit')) return code.slice(5);
	if (code.startsWith('Mouse')) return `Mouse ${Number(code.slice(5)) + 1}`;
	if (code === 'WheelUp') return 'Wheel up';
	if (code === 'WheelDown') return 'Wheel down';
	return code;
}
