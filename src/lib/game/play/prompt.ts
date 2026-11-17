import { promptCode } from '#lib/game/input/device.svelte.ts';
import type { Action } from '#lib/game/input/actions.ts';
import type { Prompt } from './feature.ts';

/**
 * A prompt for `action`'s key: the key as a keycap, then `text` ("to climb out"), the pill
 * filling with `progress` while it is held. With the action unbound, its name in words.
 */
export function keyPrompt(action: Action, text: string, progress = 0): Prompt {
	const code = promptCode(action);
	if (code) return { prompt: text, promptKey: code, progress };
	return { prompt: `${action[0].toUpperCase()}${action.slice(1)} ${text}`, progress };
}
