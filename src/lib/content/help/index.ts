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

export const HELP_TOPICS: HelpTopic[] = [
	{
		id: 'movement',
		title: 'Moving',
		category: 'Basics',
		body: `Click the screen to take control. Look with the mouse; move with {action:moveForward} {action:moveLeft} {action:moveBack} {action:moveRight}.

Hold {action:sprint} to run. Hold {action:crouch} to crouch. Press {action:crawl} to drop to a crawl, and again to get up.

Crawlspaces are too low to stand or crouch in: crawl through them. Squeezes are narrow but tall enough to walk. You can't stand up while something is overhead; you'll rise as soon as there is room.`
	},
	{
		id: 'stamina',
		title: 'Stamina',
		category: 'Basics',
		body: `Sprinting uses stamina. It comes back after you stop running for a moment, and your breathing tells you how winded you are.

Run it all the way down and you're spent: you can't sprint again until you've caught your breath. Don't empty it when something might be chasing you.`
	},
	{
		id: 'headlamp',
		title: 'Headlamp',
		category: 'Light',
		body: `Press {action:headlamp} to switch your headlamp between off, low and bright.

Bright reaches much further but drains the battery about three times as fast. The cells in the bottom-left corner show the charge left. When it's empty, the lamp dies.

The starter headlamp is cheap: it flickers, and flickers more as the battery runs down. Some things in the dark are easier to see in a flicker.`
	}
];
