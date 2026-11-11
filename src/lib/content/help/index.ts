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
		id: 'the-surface',
		title: 'What you keep',
		category: 'Basics',
		body: `You start with nothing: a headlamp and your hands.

Whatever you carry out of the catacombs is yours. Your kit stays packed the way you carried it, ready for the next descent. Anything else you found goes into your stash.

The dashboard is where you land when you sign in. Its "Loadout" page shows what you own and what you're taking down: choose what to take before you start an expedition. Take something from the stash to carry it down; leave it behind to keep it safe. You can only take what you could carry.

Relics lie about the catacombs, more of them the deeper you go. They are worth money on the surface, but they are heavy, they fill your pack, and the more of them you carry the sooner the Gloaming comes.

What you take down and don't bring back is gone. If you die, everything you carried stays where you fell, and so does anything you left lying down there.`
	},
	{
		id: 'the-shop',
		title: 'The store',
		category: 'Basics',
		body: `Click your money, at the top right of the dashboard, to open the store. Sell what you've brought out and buy what you need.

Relics are what sell. Gear you bought can be sold back, for less than you paid. Some things nobody wants.

What you buy goes to your stash: open "Loadout" to take it with you. Firearms come empty, so buy rounds too.

A first descent with nothing is a short one. Bring out a relic or two, and buy a knife and a bandage before you go deeper. Smelling salts are what get you back on your feet when you go down alone.`
	},
	{
		id: 'parties',
		title: 'Going down together',
		category: 'Basics',
		body: `The dashboard's "Expedition" page is where you set out from. "Start an expedition" puts you in a party of your own, and that party screen is the only place you can descend from. To join a friend instead, enter their invite code. Descend alone, or bring up to three others.

To invite someone, give them your invite code, or use "Copy link" and send them the link. To join someone else, type their code under "Join a party". The others see your gamer tag, which you can change in the settings ({action:toggleSettings}).

Everyone but the leader presses Ready. When all are ready the leader presses Descend, and the whole party goes down together.

Whoever climbs out waits on the surface until the rest are out. Nobody can descend again until then. Join a party that is already underground and you wait for them too.

If you die while others are still down there, you watch through their eyes until it is over. "Next" changes who you watch; "Leave" takes you back to the surface.

If your connection drops underground, your place is held for a minute. You're still standing there, so come back quickly: the game reconnects on its own, and reloading the page works too.`
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
	},
	{
		id: 'items',
		title: 'Items',
		category: 'Survival',
		body: `The bar at the bottom of the screen holds what's in your hands: weapons and anything you can throw. Press {action:slot1} to {action:slot5}, or use {action:nextItem} and {action:prevItem}, to switch.

Ammunition, bandages and smelling salts go in your pockets; the counts are in the bottom-right corner.

Look at something on the floor and press {action:interact} to pick it up. Press {action:drop} to put down what you're holding. What doesn't fit in your hands goes in your pack.

If you die down here, everything you carried stays where you fell. Someone else might find it.`
	},
	{
		id: 'pack',
		title: 'Your pack',
		category: 'Survival',
		body: `Press {action:inventory} to open your pack. The catacombs don't wait while you look through it.

You carry things in three places. The quick slots are what you can have in your hands at a moment's notice. The pack holds everything else, and it only holds so much: bigger things take more room. Small things like rounds and bandages go in your pockets.

Choose something to move it between the pack and a quick slot, or to drop it. To hand something to someone, drop it and let them pick it up.

Everything weighs something. Past the mark on the weight bar you start to slow down, and the more you carry the slower you get. There's a limit to what you can lift at all: when the game says something is too heavy, you'll have to leave something else behind.`
	},
	{
		id: 'captions',
		title: 'Sound captions',
		category: 'Survival',
		body: `Down here you hear things long before you see them. If you can't rely on your ears, turn on "Subtitles and sound captions" in the settings ({action:toggleSettings}).

What you would have heard appears as text above your items, with an arrow for where it came from: ahead, behind, to either side, or on the floor above or below. Sounds too far away to hear aren't shown.

Captions tell you what a sound is like, not what made it.`
	},
	{
		id: 'fighting-back',
		title: 'Fighting back',
		category: 'Survival',
		body: `Press {action:attack} to swing or fire. Hold {action:aim} to aim a gun: you move slowly, but your shots go where you look. Press {action:reload} to reload.

A knife is quick and quiet. A crowbar is slow but hits hard enough to stop something mid-swing. Bricks are everywhere; they break after a few blows, and {action:aim} throws one.

Guns are loud. Every shot is heard a long way off, on the floors above and below, and whatever hears it will come. A thrown brick makes noise where it lands, not where you are.

They can be put down. It takes more than you'd like.`
	},
	{
		id: 'omens',
		title: 'Omens',
		category: 'Survival',
		body: `The longer you stay down here, the worse it gets.

Listen. Knocking that comes more often. Whispers where no one is. A low hum under everything. Lamps that won't hold steady, that dim and fail for no reason.

These are warnings. When they come thick and close together, it is time to think about the way out.`
	},
	{
		id: 'the-gloaming',
		title: 'The Gloaming',
		category: 'Survival',
		body: `Stay too long and the Gloaming comes for you itself: a darkness that moves. You'll know when it arrives. Every lamp falters at once, and something vast breathes out through the stone.

Near it, lamps die and the mind goes. Its touch is worse.

Light is how you fight it. Hold a bright beam on it from a distance, before it gets close enough to put your lamp out, and keep it there. Only while the light holds does steel or shot bite. Two lamps are better than one.

Drive it off and you'll all be carried out. It isn't over, though. Only the rite ends the Gloaming.`
	},
	{
		id: 'the-rite',
		title: 'The rite',
		category: 'Survival',
		body: `The rite is what ends it. Press {action:ritePanel} at any time down here to see what is known about it.

At first, nothing is. Scraps of writing lie about the catacombs, left by those who came before. Press {action:interact} on one to read it: each tells you something the rite needs, and the last tells you where it must be done. Everyone with you learns it too, and what you've learned stays learned on your next descent.

For the Gloaming, the rite needs the Pendant. It lies in one of the great rooms.

One person has to carry everything the rite needs. If it's spread between you, drop things for that person to pick up. If they die, what they carried lies where they fell.

That person goes to the place and holds {action:interact}. Nothing has to be set down, and nothing has to be fought. When it's done, you are all carried out, and it is over.`
	}
];
