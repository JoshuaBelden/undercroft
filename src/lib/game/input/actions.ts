/**
 * Every input the game responds to is an action. Code checks actions, never raw keys,
 * so all bindings stay remappable. Bindings use KeyboardEvent.code values
 * (layout-independent) plus 'Mouse0'..'Mouse4' for mouse buttons.
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
	climb: { label: 'Climb / swim up', category: 'Movement', defaults: ['Space'] },
	swimDown: { label: 'Swim down', category: 'Movement', defaults: ['KeyX'] },
	interact: { label: 'Interact / revive (hold)', category: 'Actions', defaults: ['KeyE'] },
	heal: { label: 'Use bandage (hold)', category: 'Actions', defaults: ['KeyQ'] },
	headlamp: { label: 'Headlamp mode', category: 'Light', defaults: ['KeyF'] },
	toggleSettings: { label: 'Settings menu', category: 'Interface', defaults: ['Escape'] },
	toggleHelp: { label: 'Help', category: 'Interface', defaults: ['F1'] },
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
	return code;
}
