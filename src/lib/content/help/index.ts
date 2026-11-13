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

Press {action:toggleView} to step back and see yourself from over your shoulder, and again to look through your own eyes. Crouched, crawling or swimming, you always see through your own eyes.

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
		body: `There are four ways out of the catacombs. The first is the sealed door you started beside, in the cellar at the top of the stairs. Further in are two shafts, each with a ladder going up into the dark, the second deeper than the first. The last is a ladder in the deepest room of all.

The deeper ways out save you the long walk back with your haul. Remember where you saw them.

Stand at the foot of the ladder (or at the door) and hold {action:interact} to climb out. It takes a few seconds: moving or letting go starts it over.

Don't stay too long. The time at the top of your view is how long you have left. When it runs out, anyone still down here is lost in the dark: it is as if they had died, and what they carried stays below.

Once you're out, your expedition is over. The results show how it went (time underground, how deep you got, creatures killed, crates opened, hints found) and what you brought out; Continue takes you to your loadout to put the haul away. In a group, the others can stay down; the expedition ends when everyone is out.

You can also give up from anywhere: open the settings ({action:toggleSettings}) and choose Abandon expedition. You go back to the surface, but everything you carried stays where you stood.`
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

Bright reaches much further but drains the battery about three times as fast. The cells in the bottom-left corner show the charge left, with its voltage beside them: 24V is full, and at 0V the lamp dies.

Batteries turn up in crates and on the dead. Put one in a quick-use slot, take it in hand and hold {action:attack}, standing still, to swap it in. Each gives back 12V, never more than full, so don't waste one on a lamp that's nearly charged.

The starter headlamp is cheap: it flickers, and flickers more as the battery runs down.`
	},
	{
		id: 'the-surface',
		title: 'What you keep',
		category: 'Basics',
		body: `You start with nothing: a headlamp and your hands.

Whatever you carry out of the catacombs is yours. You come back to your loadout packed the way you carried it, with what you found still in your backpack. Move it to your stash, or sell it, before the next descent.

The dashboard is where you land when you sign in. Its "Loadout" page ({action:inventory} from anywhere on the dashboard) shows what you own and what you're taking down: the stash on the left stays on the surface, and the loadout on the right goes down with you. Drag something from one to the other, or hold Shift and click it to send it across.

The loadout has a place for everything. Two weapons, and one thing worn for protection: it takes the blows of whatever catches you before you do, until it is torn apart. The pale bar over your health underground is what it has left, and the wear stays on it when you come back up. A backpack that takes anything. And six quick-use slots for what you'll want in a hurry: bandages, smelling salts, something to throw. Only the quick-use slots are within reach of the wheel underground, so what sits in the backpack stays there until you move it.

Things of a kind share a slot, up to a few of each. Drop one stack on another to join them. Right-click anything to equip it, split a stack, sell it or drop it. Dropping something on the surface throws it away for good.

Hold the cursor over something to see what it is and what it does. The round buttons beside the stash show only weapons, ammunition, protection, quick-use items, treasure, quest items or everything else. You can only take what you could carry: the weight is shown beside the Loadout title.

What the dead were buried with is worth money on the surface. Most of it is in crates, more and better the deeper you go. But it fills your backpack, some of it is heavy, and the more of it you carry the sooner the Gloaming comes.

What you take down and don't bring back is gone. If you die, everything you carried stays where you fell, and so does anything you left lying down there.

Press {action:toggleFullscreen} on any screen, or choose Display under Graphics in the settings, to fill the whole screen. The game remembers it.`
	},
	{
		id: 'the-shop',
		title: 'The store',
		category: 'Basics',
		body: `Click your money, at the top right of the dashboard, to open the store. It is closed to you once you are ready to descend. The round buttons beside it show only weapons, ammunition, protection, quick-use items, treasure, quest items or everything else. Click something to see what it is and what it costs, choose how many, and press Purchase.

What you buy goes to your stash, which only has so many slots: open "Loadout" to take it with you. Firearms come empty, so buy rounds too.

Selling is done on the "Loadout" page: right-click something and choose Sell. What you find down there is what sells: treasure, marked with a small diamond in the corner of its slot. "Sell all treasure", under the stash, sells every piece of treasure in your stash at once (not what is in your loadout). Gear you bought can be sold back, for less than you paid. Some things nobody wants.

A first descent with nothing is a short one. Bring out what a crate or two holds, and buy a knife and a bandage before you go deeper. Smelling salts are what get you back on your feet when you go down alone.`
	},
	{
		id: 'parties',
		title: 'Going down together',
		category: 'Basics',
		body: `The dashboard's "Expedition" page is where you set out from. It shows everyone in your party: at first, only you. Descend alone, or bring up to three friends.

To bring someone, open the Social page ({action:toggleSocial}, or the Social button at the bottom right). Search for their gamer tag and add them; once they accept, they are your friend. The page lists all your friends, online or not. Invite one who is online and not already in a party and, when they accept, they join your party. Once you have invited someone, the page shows your party: who is in it, and who has yet to accept. The host can kick someone out of it, and anyone can leave. The others see your gamer tag, which you can change in the settings ({action:toggleSettings}).

The host, whoever started the party, chooses the Affliction you go against. Then each of you presses Launch Expedition and confirms your loadout: that makes you ready, and the others see it. Once you are ready you can't change your loadout or use the store, unless you cancel.

When everyone is ready, a short countdown starts and the whole party goes down together. Anyone can cancel until it runs out.

Whoever climbs out waits on the surface until the rest are out. Nobody can launch again until then.

If you die while others are still down there, you watch through their eyes until it is over. "Next" changes who you watch; "Leave" takes you back to the surface.

If your connection drops underground, your place is held for a minute. You're still standing there, so come back quickly: the game reconnects on its own, and reloading the page works too. On the surface, reloading the page keeps you in your party.`
	},
	{
		id: 'sanity',
		title: 'Sanity',
		category: 'Survival',
		body: `Sanity is your health. Your bars sit in the bottom-left corner, under your name: sanity above stamina. Your teammates' names and bars are stacked above yours, so you can see who is hurt or down. The edges of your sight darken as it falls.

It wears down when you're in the dark with your lamp off and no one else's light on you, and when you look at something you shouldn't. Being struck takes a great deal of it at once.

A bandage gives some of it back. Hold {action:quickUse}, pick the bandage from the wheel, then hold {action:attack}. Stand still: it takes a few seconds, and moving or letting go starts it over. The bandage has to be in a quick-use slot to be on the wheel.

When your sanity runs out you go down. You can only look around and drag yourself slowly across the floor, and you don't have long. If you can reach a way out, you can still climb out: hold {action:interact} there.

If there is nothing to wait for, hold {action:climb} for a moment to surrender. It ends at once, as if your time had run out.`
	},
	{
		id: 'reviving',
		title: 'Reviving',
		category: 'Survival',
		body: `Smelling salts bring someone back from being down.

If a teammate is down, go to them and hold {action:interact}. It takes a few seconds and uses one of your salts. They come back shaken, with little sanity left.

If no one can reach you, because you're alone or everyone else is down too, you use your own salts. Without salts, and without help, you won't get up again.

Salts only count when they are to hand, in a quick-use slot. At the bottom of your backpack they are no use to anyone.`
	},
	{
		id: 'things-in-the-dark',
		title: 'Things in the dark',
		category: 'Survival',
		body: `You are not alone down here.

The dark hides them. Get a lamp on one and you'll see it, but it may see your light too.

They wander. When something catches their attention they stop, wait, and come to look.

They hear you. Running is loud; walking carries; creeping, crouching and crawling are quiet. They notice your light when they're facing it. In the dark, keeping still or moving quietly, you can wait one out. Don't stay where it saw your light. Very close, it will find you anyway.

Listen for breathing. If you can hear it, it's near.

Once one has you, it comes slowly, then all at once. Put your lamp out and get out of its sight, and it may lose you.`
	},
	{
		id: 'items',
		title: 'Items',
		category: 'Survival',
		body: `You carry two weapons. Press {action:primaryWeapon} or {action:secondaryWeapon} to take one in your hand, or {action:nextItem} for the other one.

Everything else you can use is on the quick-use wheel. Hold {action:quickUse} and the wheel opens; move the mouse toward what you want and let go, and it is in your hand in place of your weapon. {action:attack} uses it: hold it to bind a wound, swing with a brick, draw with chalk. {action:aim} throws what can be thrown. Press a weapon key to go back.

What is in your hand is named in the bottom-right corner, with the rounds loaded and spare when it is a firearm. Spare rounds are taken from your backpack.

Look at something on the floor and press {action:interact} to pick it up. It goes where it belongs if there is room: a weapon to an empty weapon slot, quick-use things to the wheel, the rest to your backpack. Press {action:drop} to put down what you're holding.

If you die down here, everything you carried stays where you fell. Someone else might find it.`
	},
	{
		id: 'chalk',
		title: 'Chalk marks',
		category: 'Survival',
		body: `Chalk lets you leave marks on the walls, for yourself or for whoever comes after you. Keep it in a quick-use slot and take it from the wheel.

Face a wall, the floor, or anything close enough to touch, and hold {action:attack}. A wheel of marks opens: arrows, a cross for a dead end, a circle for somewhere you have been, and more. Move the mouse toward one and let go, and it is drawn where you were looking. A stick of chalk makes one mark.

Marks are only chalk. In the dark you won't see them; a lamp on the wall brings them out. Come close to one and you can see who drew it.

You can rub out your own marks: look at one and hold {action:interact}. Other people's marks are theirs to keep.`
	},
	{
		id: 'crates',
		title: 'Crates, the dead and loot',
		category: 'Survival',
		body: `Crates stand against the walls of rooms and dead ends. Look at one and hold {action:interact} to lift the lid.

Others came down before you and never left. Their bodies lie along the walls, and what they carried is still on them: look at one and hold {action:interact} to search it. A body is gone through just like a crate, only more quietly.

What is inside takes time to find. Each thing takes a moment to turn up, one after another, and until it does you can't tell what it is or take it. The best of a crate comes last. Step away before something has turned up and you start on it again next time; what you did find stays found.

The crate opens beside your pack. Drag things across, or hold Shift and click to send them over. You can put things in as well as take them out. Press a movement key, or Close, to step away.

Only one of you can go through a crate at a time. Once a crate has been opened its lid stays up, so you can tell which ones someone has been at. The lid can be heard, and so can the rummaging.

How hard something is to come by shows on the left and bottom edge of its slot: nothing for common things, then grey, green, blue and yellow for uncommon, rare, epic and legendary. Hold the cursor over it to read what it is and what it sells for.

A crate never holds much of the best. Deeper crates hold more.`
	},
	{
		id: 'pack',
		title: 'Your pack',
		category: 'Survival',
		body: `Press {action:inventory} to open your pack. The catacombs don't wait while you look through it.

It is laid out like your loadout on the surface. Equipment: two weapons, and what you wear for protection. The backpack, which takes anything. And the quick-use slots, which are what the wheel offers. The slot in your hand is outlined.

Drag things between slots. Hold Shift and click to send something between the backpack and the slot it belongs in. Right-click to equip it, split a stack or drop it. Things of a kind share a slot, up to a few of each; drop one stack on another to join them. To hand something to someone, drop it and let them pick it up.

Everything weighs something, and the weight you carry is shown beside the title. Once it turns blue you have started to slow down, and the more you carry the slower you get. There's a limit to what you can lift at all: when the game says something is too heavy, you'll have to leave something else behind.`
	},
	{
		id: 'captions',
		title: 'Sound captions',
		category: 'Survival',
		body: `Down here you hear things long before you see them. If you can't rely on your ears, turn on "Captions" under Accessibility in the settings ({action:toggleSettings}).

What you would have heard appears as text above your items, with an arrow for where it came from: ahead, behind, to either side, or on the floor above or below. Sounds too far away to hear aren't shown.

Captions tell you what a sound is like, not what made it.`
	},
	{
		id: 'comfort',
		title: 'Comfort and accessibility',
		category: 'Basics',
		body: `The settings ({action:toggleSettings}) can make the catacombs easier to play.

Reduce flashing, under Accessibility: your lamp's flicker and cut-outs fade gently instead of strobing, and gunshots and the red flash when you are hurt are much softer. The lamp still lights as much as before, so you see what everyone else sees.

Sprint and Aim, under Accessibility: press the key once instead of holding it. You stop running when you stop moving or change stance. A gun stays raised until you press aim again or put it away.

Mono audio, under Accessibility: both ears hear everything. Turn on Captions too, to see which way a sound came from.

Under Graphics, turn down Camera shake, and if the game stutters, lower the Render resolution or set a Frame rate limit (on a laptop, 60 saves battery). Aiming sensitivity is under Mouse. Under Audio, you can mute the game while another tab or window is in front.`
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
		body: `Stay too long and the Gloaming comes for you itself. The thin red bar under the time at the top of your view fills as it draws near; killing and carrying loot fill it faster. You'll know when it arrives: something vast breathes out through the stone, and then it is walking toward you.

Near it, the mind goes. Its touch is worse. It is slower while a lamp is on it, and quick when none is.

Light is how you fight it. Hold your lamp on it and keep it there. Only while the light holds does steel or shot bite. Two lamps are better than one.

Drive it off and you'll all be carried out. It isn't over, though. Only the rite ends the Gloaming.

Long ago, the keepers of the dead held back the dusk each evening with a rite. The last keeper died with it unspoken, and the robbers who broke into his grave brought down what he had kept shut away.`
	},
	{
		id: 'the-rite',
		title: 'The rite',
		category: 'Survival',
		body: `The rite is what ends it. What is known about it is always at the left of your view down here: the Affliction's name, the hints you have found, then a line joining everything the rite needs and where it must be done. Once a hint has told you what a thing is, its picture appears beside it, greyed out until you carry it yourself.

At first, nothing is. Scraps of writing were left about the catacombs by those who came before: pinned to the walls of the great rooms, lying on coffins and altars, stuffed in crates, in the pockets of the dead. Never just dropped on the floor. Press {action:interact} on one to read it (in a crate, right-click it and choose Read). Whichever scrap you find, it tells you the next thing, always in the same order, until you know everything the rite needs and where it must be done. Everyone with you learns it too, and what you've learned stays learned on your next descent.

The Afflictions page on the surface shows the hints you have found and what the rite needs. A thing is greyed out there until you have enough of it in your stash or loadout. Reset forgets everything you know of an Affliction, if you want to find it all again.

For the Gloaming, the rite needs five candles, a stick of chalk and the Pendant. Candles and chalk can be bought, or found. The Pendant is shut away in one of the crates, and there is only one: things like it are edged in purple and marked with a star in the corner of their slot. If someone in your party already owns it, it isn't down there: bring it.

One person has to carry everything the rite needs. If it's spread between you, drop things for that person to pick up. If they die, what they carried lies where they fell.

That person goes to the place and holds {action:interact}. Nothing has to be set down, and nothing has to be fought. When it's done the Affliction is resolved: the omens lift and it won't come for you. You still have to get out before time runs out.`
	}
];
