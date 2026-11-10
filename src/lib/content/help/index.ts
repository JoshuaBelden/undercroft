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

Tap {action:stance} to change stance: walking, crouching, crawling, then back to walking. Hold {action:stance} to creep: a slow walk that makes no footstep sound, for as long as you hold it. Your stance and creep show in the bottom-left corner. Running puts you back on your feet.

 Crawlspaces are too low to stand or crouch in: crawl through them. Squeezes are narrow but tall enough to walk: you have to work your way through slowly, and you can't run. You can't stand up while something is overhead; you'll rise as soon as there is room.`
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
		id: 'water-passages',
		title: 'Water passages',
		category: 'Basics',
		body: `Canals run beside a narrow stone ledge. Keep to the ledge, or slip into the channel and swim; hold {action:climb} at the edge to pull yourself back out.

Flooded passages dip under the water: the ceiling comes down to meet it, and the only way on is to dive and swim through. It's only a few metres, but you're holding your breath the whole way. If your breath runs low, turn back.`
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
	},
	{
		id: 'sanity',
		title: 'Sanity',
		category: 'Survival',
		body: `Sanity is your health. The bar above your stamina shows it once it starts to slip, and the edges of your sight darken as it falls.

It wears down when you're in the dark with your lamp off and no one else's light on you, and when you look at something you shouldn't. Being struck takes a great deal of it at once.

Hold {action:heal} to use a bandage. Stand still: it takes a few seconds, and moving or letting go starts it over. Each one gives back some sanity. Your bandages and smelling salts show in the bottom-right corner.

When your sanity runs out you go down. You can't move, only look around, and you don't have long.`
	},
	{
		id: 'reviving',
		title: 'Reviving',
		category: 'Survival',
		body: `Smelling salts bring someone back from being down.

If a teammate is down, go to them and hold {action:interact}. It takes a few seconds and uses one of your salts. They come back shaken, with little sanity left.

If no one can reach you, because you're alone or everyone else is down too, you use your own salts. Without salts, and without help, you won't get up again.`
	},
	{
		id: 'things-in-the-dark',
		title: 'Things in the dark',
		category: 'Survival',
		body: `You are not alone down here.

They stand very still. Full light shows nothing, and the dark shows nothing. You only see them in the half-light: in the glow of a low lamp, at the far edge of a bright beam, in the moment a lamp flickers.

They notice your light, and they hear you. Running is loud; walking carries; creeping, crouching and crawling are quiet. Very close, they'll find you anyway.

Once one has you, it comes slowly, then all at once.`
	}
];
