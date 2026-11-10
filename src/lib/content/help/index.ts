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

Hold {action:sprint} to run.

Tap {action:stance} to change stance: walking, crouching, crawling, then back to walking. Hold {action:stance} to start or stop creeping: a slow walk that makes no footstep sound. Your stance and creep show in the bottom-left corner. Running puts you back on your feet and ends creeping.

 Crawlspaces are too low to stand or crouch in: crawl through them. Squeezes are narrow but tall enough to walk. You can't stand up while something is overhead; you'll rise as soon as there is room.`
	},
	{
		id: 'climbing',
		title: 'Climbing',
		category: 'Basics',
		body: `Walk up to a ledge or a low wall and hold {action:climb} to pull yourself up onto it, if there's room on top. Climbing costs a little stamina, and you can't do it while you're spent.

In the water, swim up to an edge and hold {action:climb} to pull yourself out.`
	},
	{
		id: 'swimming',
		title: 'Swimming',
		category: 'Basics',
		body: `In deep water you swim where you look. You float with your head just above the surface. Hold {action:climb} to swim up and {action:swimDown} to dive; looking down while swimming forward also takes you under.

Underwater, your stamina is your breath: it drains and won't come back until you surface. When it runs out you're forced up for air, and you can't dive again until you've recovered.

Look for steps or a low edge to get out. Every pool has a way out.`
	},
	{
		id: 'extraction',
		title: 'Getting out',
		category: 'Basics',
		body: `The way out is the sealed door you started beside, in the cellar at the top of the stairs. Remember how to get back to it.

Stand at the door and hold {action:interact} to climb out. It takes a few seconds: moving or letting go starts it over.

Once you're out, your expedition is over. In a group, the others can stay down; the expedition ends when everyone is out.`
	},
	{
		id: 'stamina',
		title: 'Stamina',
		category: 'Basics',
		body: `Sprinting and climbing use stamina, and underwater it's your breath. It comes back after you stop for a moment, and your breathing tells you how winded you are.

Run it all the way down and you're spent: you can't sprint, climb or dive again until you've caught your breath. Don't empty it when something might be chasing you.`
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
