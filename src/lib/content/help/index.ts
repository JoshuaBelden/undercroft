/**
 * Player-facing help content. Each phase adds topics for the features it ships.
 * Body is plain text; blank lines separate paragraphs. `{action:name}` renders the
 * player's current key binding for that action, e.g. `{action:toggleHelp}`.
 */

export interface HelpTopic {
	id: string;
	title: string;
	category: string;
	body: string;
}

export const HELP_TOPICS: HelpTopic[] = [];
