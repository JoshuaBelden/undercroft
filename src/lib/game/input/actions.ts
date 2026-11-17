/**
 * Every input the game responds to is an action. Code checks actions, never raw keys,
 * so all bindings stay remappable. Bindings use KeyboardEvent.code values
 * (layout-independent) plus 'Mouse0'..'Mouse4' for mouse buttons and 'WheelUp'/'WheelDown'
 * for the scroll wheel (press-only: wheel actions never count as held). Controller buttons
 * are bound apart from the keys, in PAD_DEFAULTS (see docs/dev/controller.md).
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
		label: 'Stance (tap: walk/crouch/crawl, hold: creep) / let go of a rope',
		category: 'Movement',
		defaults: ['KeyC']
	},
	// Held while downed, it surrenders.
	climb: { label: 'Climb / swim up / surrender', category: 'Movement', defaults: ['Space'] },
	swimDown: { label: 'Swim down', category: 'Movement', defaults: ['KeyX'] },
	interact: {
		label: 'Interact / grab a rope / revive (hold)',
		category: 'Actions',
		defaults: ['KeyE']
	},
	// Tap: off, or back on at the last brightness. Hold 1 s: low / bright.
	headlamp: {
		label: 'Headlamp (tap: on/off, hold: low/bright)',
		category: 'Light',
		defaults: ['KeyF']
	},
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
	// Your map underground (docs/dev/map.md). The rest are heard only while it is open.
	map: { label: 'Map', category: 'Map', defaults: ['KeyM'] },
	sketchMap: { label: 'Sketch what is around you (hold)', category: 'Map', defaults: ['KeyE'] },
	showMap: { label: 'Show your map to a teammate (hold)', category: 'Map', defaults: ['KeyR'] },
	mapZoomIn: { label: 'Zoom in', category: 'Map', defaults: ['Equal', 'NumpadAdd'] },
	mapZoomOut: { label: 'Zoom out', category: 'Map', defaults: ['Minus', 'NumpadSubtract'] },
	mapLevelUp: { label: 'Level above', category: 'Map', defaults: ['PageUp'] },
	mapLevelDown: { label: 'Level below', category: 'Map', defaults: ['PageDown'] },
	toggleSettings: { label: 'Settings menu', category: 'Interface', defaults: ['Escape'] },
	toggleHelp: { label: 'Help', category: 'Interface', defaults: ['F1'] },
	toggleSocial: { label: 'Friends and invites', category: 'Interface', defaults: ['KeyO'] },
	// The browser's own fullscreen key; the page takes it, so fullscreen is the game's own.
	toggleFullscreen: { label: 'Fullscreen', category: 'Interface', defaults: ['F11'] },
	toggleView: {
		label: 'Camera: first person / shoulder',
		category: 'Interface',
		defaults: ['KeyV']
	},
	// Underground: hides or shows the rite down the left (docs/dev/rite.md).
	toggleRitePanel: { label: 'Rite panel', category: 'Interface', defaults: ['KeyH'] },
	toggleStats: { label: 'Performance stats', category: 'Interface', defaults: ['F3'] },
	toggleAdmin: { label: 'Admin panel (dev)', category: 'Interface', defaults: ['F10'] },
	// Dev only: fly the camera through the map, fully lit, with the debug grid (docs/dev/admin.md).
	toggleFreecam: { label: 'Free camera (dev)', category: 'Interface', defaults: ['F9'] }
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

/**
 * Each action's controller buttons, empty when it has none. Fixed until the keybinding screen.
 * Fullscreen can't have one: browsers only allow it from a click or a key.
 */
export const PAD_DEFAULTS: Record<Action, readonly string[]> = {
	moveForward: ['PadStickUp'],
	moveBack: ['PadStickDown'],
	moveLeft: ['PadStickLeft'],
	moveRight: ['PadStickRight'],
	sprint: ['PadL3'],
	stance: ['PadB'],
	climb: ['PadA'],
	swimDown: ['PadB'],
	interact: ['PadX'],
	headlamp: ['PadUp'],
	attack: ['PadRT'],
	aim: ['PadLT'],
	reload: ['PadRB'],
	drop: ['PadDown'],
	primaryWeapon: [],
	secondaryWeapon: [],
	nextItem: ['PadY'],
	prevItem: [],
	quickUse: ['PadLB'],
	inventory: ['PadView'],
	// Every button is taken: on the controller the map opens from the pack screen. On the map
	// screen X sketches, Y shows and LB/RB change level: menu buttons, fixed like A and B.
	map: [],
	sketchMap: [],
	showMap: [],
	mapZoomIn: ['PadRT'],
	mapZoomOut: ['PadLT'],
	mapLevelUp: [],
	mapLevelDown: [],
	toggleSettings: ['PadMenu'],
	toggleHelp: ['PadRight'],
	toggleSocial: ['PadR3'],
	toggleFullscreen: [],
	toggleView: ['PadLeft'],
	toggleRitePanel: ['PadR3'],
	toggleStats: [],
	toggleAdmin: [],
	toggleFreecam: []
};

export function defaultPadBindings(): Bindings {
	const result = {} as Bindings;
	for (const action of Object.keys(ACTIONS) as Action[]) {
		result[action] = [...PAD_DEFAULTS[action]];
	}
	return result;
}

/** Which names (and icons) controller buttons are shown with. */
export type PadFamily = 'xbox' | 'playstation';

/** Each controller button's name, Xbox style and PlayStation. */
const PAD_LABELS: Record<string, readonly [string, string]> = {
	PadA: ['A', 'Cross'],
	PadB: ['B', 'Circle'],
	PadX: ['X', 'Square'],
	PadY: ['Y', 'Triangle'],
	PadLB: ['LB', 'L1'],
	PadRB: ['RB', 'R1'],
	PadLT: ['LT', 'L2'],
	PadRT: ['RT', 'R2'],
	PadView: ['View', 'Create'],
	PadMenu: ['Menu', 'Options'],
	PadL3: ['LS', 'L3'],
	PadR3: ['RS', 'R3'],
	PadUp: ['D-pad up', 'D-pad up'],
	PadDown: ['D-pad down', 'D-pad down'],
	PadLeft: ['D-pad left', 'D-pad left'],
	PadRight: ['D-pad right', 'D-pad right'],
	PadStickUp: ['Left stick up', 'Left stick up'],
	PadStickDown: ['Left stick down', 'Left stick down'],
	PadStickLeft: ['Left stick left', 'Left stick left'],
	PadStickRight: ['Left stick right', 'Left stick right']
};

/** True for a controller binding code ('PadA'), false for a key or mouse button. */
export function isPadCode(code: string): boolean {
	return code in PAD_LABELS;
}

/** The three main mouse buttons, by name; side buttons stay numbered (Mouse 4, Mouse 5). */
const MOUSE_LABELS: Record<string, string> = { Mouse0: 'MLB', Mouse1: 'MMB', Mouse2: 'MRB' };

/**
 * Human-readable label for a binding code, e.g. 'KeyW' -> 'W', 'PadA' -> 'A' (or 'Cross' with
 * PlayStation names).
 */
export function bindingLabel(code: string, family: PadFamily = 'xbox'): string {
	const pad = PAD_LABELS[code];
	if (pad) return pad[family === 'playstation' ? 1 : 0];
	if (code.startsWith('Key')) return code.slice(3);
	if (code.startsWith('Digit')) return code.slice(5);
	if (code.startsWith('Mouse')) return MOUSE_LABELS[code] ?? `Mouse ${Number(code.slice(5)) + 1}`;
	if (code === 'WheelUp') return 'Wheel up';
	if (code === 'WheelDown') return 'Wheel down';
	return code;
}
