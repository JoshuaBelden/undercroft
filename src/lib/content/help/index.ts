/**
 * Player-facing help content. Each phase adds topics for the features it ships.
 * Body is plain text; blank lines separate paragraphs. `{action:name}` renders the
 * player's current key binding for that action, e.g. `{action:toggleHelp}` (the controller's
 * button while a controller is in use). `{pad:name}` always renders the controller's button.
 * `{button:PadA}` renders a fixed controller button (the menu ones) in the current icon set.
 * A paragraph whose lines all start with "- " is a list. The help screen (HelpScreen.svelte)
 * has a tab per category, in HELP_CATEGORIES order, showing its topics in the order they appear
 * here.
 */

/** The help screen's sections, in the order of its tabs. */
export const HELP_CATEGORIES = [
	'Getting started',
	'Expeditions',
	'The surface',
	'Moving',
	'Surviving',
	'Gear and loot',
	'The Gloaming',
	'Settings'
] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export interface HelpTopic {
	id: string;
	title: string;
	category: HelpCategory;
	body: string;
}

export const HELP_TOPICS: HelpTopic[] = [
	{
		id: 'first-descent',
		title: 'Your first descent',
		category: 'Getting started',
		body: `Undercroft is about going down into the catacombs, taking what you can, and getting back out alive. Here is how a first descent goes.

You land on the dashboard's Expedition page. Your party is only you for now; friends can join you from the Social page. First choose the Affliction you go against: the Gloaming, for now. Then press Launch Expedition, confirm your loadout, and the descent begins.

You start with nothing but a headlamp and your hands, in a candlelit chapel over a pit. Click the screen to take control, and press {action:headlamp} to switch the lamp on. The time at the top of your view is how long you have.

The way down is the rope tied on the pit's edge. Stand where it is tied, look at it and press {action:interact} to take hold, then {action:moveBack} to climb down. It stops short of the floor: at its end you let go and drop the last little way, unhurt.

Look for crates along the walls of rooms and dead ends, and for the dead lying where they fell. Hold {action:interact} on one to search it. What you find takes a moment to turn up; drag it into your pack. Treasure, marked with a small diamond, is what sells.

You are not alone. Keep quiet, keep your light off what you don't want to see, and listen.

The rope you came down can't be reached from the floor: there is no going back up it. The first way out is a rope at the end of the first level, beside the door down to the next. When your pack is full, or the time is running short, make for it. If you die, everything you carried stays down there.

On the surface, open the Loadout page and sell your treasure. Then click your money to open the store, and buy a knife, a bandage and smelling salts before you go deeper.

Press {action:toggleHelp} at any time, on the surface or underground, to read more.`
	},
	{
		id: 'keys',
		title: 'Keys',
		category: 'Getting started',
		body: `These are your keys now. The full list is under Controls in the settings ({action:toggleSettings}).

- {action:moveForward} {action:moveLeft} {action:moveBack} {action:moveRight} move, {action:sprint} run
- {action:stance} tap to crouch or crawl, hold to creep, let go of a rope
- {action:climb} jump; hold it to climb up a ledge, swim up
- {action:swimDown} swim down
- {action:headlamp} tap: headlamp off or on, hold: low or bright
- {action:interact} pick up, search, open, take hold of a rope, climb out, revive
- {action:attack} swing, fire, use what is in your hand; hold and let go to throw a knife or brick
- {action:aim} aim a gun
- {action:reload} reload
- {action:primaryWeapon} {action:secondaryWeapon} take a weapon in hand
- {action:quickUse} the quick-use wheel
- {action:inventory} your pack and the rite
- {action:map} your map, if you carry a notebook
- {action:toggleRitePanel} hide or show the rite
- {action:toggleSettings} settings, {action:toggleHelp} help. With your pack or the map open, {action:toggleSettings} puts it away; then move to carry on`
	},
	{
		id: 'controller',
		title: 'Playing with a controller',
		category: 'Getting started',
		body: `Any controller with the standard layout works, Xbox, PlayStation and Steam controllers among them. The keyboard and mouse keep working too, and the buttons shown on screen follow whichever you used last.

Move with the left stick: push it gently to creep, a slow walk that makes no footstep sound. Look with the right stick. Click {pad:sprint} to run until you stop, slow down, aim or creep.

{pad:climb} climbs and swims up, and held while you are down, surrenders. {pad:stance} changes stance, swims down in water and lets go of a rope. {pad:interact} interacts, takes hold of a rope and revives. {pad:attack} attacks, fires or uses what is in your hand, and held, throws a knife or brick when you let go. {pad:aim} aims and {pad:reload} reloads. {pad:nextItem} swaps weapons. Hold {pad:quickUse} for the quick-use wheel and point at an item with the right stick.

{pad:headlamp} switches the headlamp off and on (hold it to change between low and bright) and {pad:toggleHelp} opens this help. Click {pad:toggleRitePanel} to hide the rite down the left, and again to bring it back. {pad:inventory} opens your pack and the rite, and {pad:toggleSettings} the settings.

In menus, the D-pad or left stick moves between choices and {button:PadA} picks one; {button:PadB} goes back. {button:PadLB} and {button:PadRB} switch tabs, and the right stick scrolls. On a slider, or a setting with arrows, left and right change it. In the store, push the right stick left or right to choose how many. While a menu is open, the D-pad and face buttons work the menu, not the game.

In your pack, a crate or the Loadout page, {button:PadA} picks an item up and the slots that would take it light up; {button:PadA} on one puts it down, and {button:PadB} puts it back. {button:PadX} sends an item straight where it belongs, and {button:PadY} opens its menu. In a crate or a corpse, once {button:PadX} has sent an item to your pack you move on to the next one, so you can empty it by pressing {button:PadX} again and again. On the Loadout page {button:PadX} and {button:PadY} act when you let go, so that holding them can do something else (below). Typing, such as a friend's gamer tag, still needs a keyboard.

With a notebook in your pack, your pack has a Map tab: {button:PadLB} and {button:PadRB} go to it. On the map, hold {button:PadX} to sketch and {button:PadY} to show your map to a teammate. The Up and Down buttons at the top change level, {pad:mapZoomIn} and {pad:mapZoomOut} zoom, and the right stick moves the page. {button:PadB} puts it away.

On the dashboard, {button:PadLB} and {button:PadRB} switch tabs, {pad:inventory} goes to your Loadout and {pad:toggleSocial} opens Social; {button:PadB} comes back. Hold {button:PadX} to launch an expedition, then hold it again to confirm your loadout. Hold {button:PadY} to open the store from any page (it is closed once you are ready; while you confirm your loadout, holding it takes the free loadout instead), and in the store to purchase the item you picked. The button fills from left to right as you hold it: let go early and nothing happens. Each shortcut shows its button wherever it works.

Settings > Controller has look sensitivity, invert Y, the dead zone, vibration, sprint (toggle or hold) and the button icons. A controller the game doesn't recognise has to be mapped to the standard layout in your system's or Steam's own controller settings.`
	},
	{
		id: 'movement',
		title: 'Moving',
		category: 'Moving',
		body: `Click the screen to take control. Look with the mouse; move with {action:moveForward} {action:moveLeft} {action:moveBack} {action:moveRight}.

Hold {action:sprint} to run.

Tap {action:stance} to change stance: walking, crouching, crawling, then back to walking. Hold {action:stance} to creep: a slow walk that makes no footstep sound, for as long as you hold it. Your stance and creep show in the bottom-left corner. Running puts you back on your feet.

You see your explorer from over their shoulder. In the water, you see through their eyes.

Crawlspaces are too low to stand or crouch in: crawl through them. Squeezes are narrow but tall enough to walk, and long: you have to work your way through slowly, you can't run, and there's no room to fight. Make sure nothing is following you in. You can't stand up while something is overhead; you'll rise as soon as there is room.`
	},
	{
		id: 'stamina',
		title: 'Stamina',
		category: 'Moving',
		body: `Sprinting and climbing use stamina, and underwater it's your breath. It comes back after you stop for a moment, and your breathing tells you how winded you are.

Run it all the way down and you're spent: you can't sprint, climb or dive again until you've caught your breath. Don't empty it when something might be chasing you.`
	},
	{
		id: 'climbing',
		title: 'Climbing',
		category: 'Moving',
		body: `Walk up to a ledge or a low wall and hold {action:climb} to pull yourself up onto it, if there's room on top. Some tall passages have a ledge across them, chest high: drop down off it, or climb up it the same way. Whatever lives down here can't climb them. Climbing costs a little stamina, and you can't do it while you're spent.

Press {action:climb} anywhere else to jump: a short hop, enough to get over a low obstacle. It costs a little stamina too, and you can't jump while crawling, in a squeeze or in the water.

In the water, swim up to an edge and hold {action:climb} to pull yourself out.

Ropes hang in the ways out, and wherever someone has tied one. Stand beside a rope, look at it and press {action:interact} to take hold of it, then {action:moveForward} to climb up and {action:moveBack} to climb down. Hold {action:sprint} to haul yourself up faster (it tires you quicker) or to slide down. At the bottom you step off; at the top you haul yourself over onto the ledge. The rope down from the chapel where you start is the exception: it ends in the air, so climbing down past its end drops you to the floor, and from there it hangs out of reach. A rope can't hold two people at the same height: whoever is on it first is in your way, above or below, until they move.

Climbing wears you out, faster going up than down, and even hanging still tires you a little: you get no breath back until you are off the rope. Run out of stamina and your grip goes. Press {action:stance} to drop off the rope on purpose: a long drop hurts (see Falls).`
	},
	{
		id: 'falls',
		title: 'Falls and conditions',
		category: 'Moving',
		body: `A short drop does nothing. From much higher than your own height you land hard: it costs you sanity, and from high enough it can put you on the floor for someone to revive.

A fall that hurts leaves you hobbled for 20 seconds: you can go no faster than a crawl, and you can't run. Anything wrong with you like this shows beside your health, at the bottom left, with the seconds until it wears off. Snuffed is another: your lamp was put out, and won't come back on until it wears off. Poisoned, from a spider's bite, slows you to a crouching pace with no running for a full minute; nothing cures it yet.

Creatures hear a body hit the stone.`
	},
	{
		id: 'swimming',
		title: 'Swimming',
		category: 'Moving',
		body: `In deep water you swim where you look. At the surface you float with your head just above it. Hold {action:climb} to swim up and {action:swimDown} to dive; looking down while swimming forward also takes you under. Once you're under, you stay at the depth you swim to until you swim back up. You can only swim hard ({action:sprint}) at the surface, and there's no fighting in the water.

Underwater, your stamina is your breath: it drains and won't come back until you surface. When it runs out you're forced up for air, and you can't dive again until you've recovered. Keep an eye on it: nothing else brings you up.

Under the surface everything goes murky and close, and sounds are muffled.

Look for steps or a low edge to get out. Every pool has a way out.`
	},
	{
		id: 'water-passages',
		title: 'Water passages',
		category: 'Moving',
		body: `Canals run beside a narrow stone ledge. Keep to the ledge, or slip into the channel and swim; hold {action:climb} at the edge to pull yourself back out.

Flooded passages dip under the water: the ceiling comes down to meet it, and the only way on is to dive and swim through. It's only a few metres, but you're holding your breath the whole way. If your breath runs low, turn back.`
	},
	{
		id: 'extraction',
		title: 'Getting out',
		category: 'Expeditions',
		body: `There are three ways out of the catacombs, and none is the way you came in: the rope down from the chapel where you start ends out of reach of the floor, so it can't be climbed back up. At the end of the first and second levels is a shaft with a rope going up into the dark, beside the door down to the next level. The last is a ladder in the deepest room of all, on the third level, but it only comes down once the Affliction has been banished there.

The deeper ways out save you the long walk back with your haul. Remember where you saw them.

At a rope, look at it and press {action:interact} to take hold of it, then {action:moveForward} to climb: a few metres up, you are out. At the foot of the ladder, hold {action:interact} to climb out. It takes a few seconds: moving or letting go starts it over.

Don't stay too long. The time at the top of your view is how long you have left. When it runs out, anyone still down here is lost in the dark: it is as if they had died, and what they carried stays below.

Once you're out, your expedition is over. The results show how it went (time underground, how deep you got, creatures killed, crates opened, hints found) and what you brought out; Continue takes you to your loadout to put the haul away. In a group, the others can stay down; the expedition ends when everyone is out.

You can also give up from anywhere, as long as you're on your feet: press {action:inventory}, go to the Rite tab and choose Abandon expedition. You go back to the surface, but everything you carried stays where you stood.`
	},
	{
		id: 'levels',
		title: 'Levels and doors',
		category: 'Expeditions',
		body: `The catacombs go down in three levels, one under the other. Each is a maze of its own: passages, junctions, burial rooms and dead ends.

When you walk into a room with a name, its name comes up, with the level you are on. The first time you reach a new level, its number comes up instead.

At the far end of the first and second levels is a room with a shaft up to the surface, and a great double door. Behind the door a long stair leads down to the next level. It is the only way down.

The doors are barred. Hold {action:interact} on one to throw off the bar and push it open. It stays open for good, for everyone, and the sound carries: whatever is down there, or behind you, will hear it, and once it's open they can come through too.

Some rooms are only found on the deeper levels: crypts and mausoleums, the plague pit, the drowned chapel, and rarest of all a saints' crypt. Some places can only be reached on a rope: a sinkhole, a stair that ends in the air, a chamber under a grate.

The deeper you go, the better the finds. Most of what lies on the first two levels is everyday, though the dead were buried with fine things wherever they lie; the rarest of all lies on the third, where the rite is done.`
	},
	{
		id: 'parties',
		title: 'Going down together',
		category: 'Expeditions',
		body: `The dashboard's "Expedition" page is where you set out from. It shows everyone in your party: at first, only you. Descend alone, or bring up to three friends.

To bring someone, open the Social page ({action:toggleSocial}, or the Social button at the bottom right). Search for their gamer tag and add them; once they accept, they are your friend. The page lists all your friends, online or not. Invite one who is online and not already in a party and, when they accept, they join your party. Once you have invited someone, the page shows your party: who is in it, and who has yet to accept. The host can kick someone out of it, and anyone can leave. The others see your gamer tag, which you can change on your Account screen: click your gamer tag at the top right.

The host, whoever started the party, chooses the Affliction you go against. Then each of you presses Launch Expedition and confirms your loadout: that makes you ready, and the others see it. Once you are ready you can't change your loadout or use the store, unless you cancel.

When everyone is ready, a short countdown starts and the whole party goes down together. Anyone can cancel until it runs out.

Underground, a teammate's gamer tag hangs above their head while you can see them. Rock hides it, as it hides them, and it fades as they get farther away, so in the dark you still have to stay close. Turn the tags off under Interface in the settings.

Whoever climbs out waits on the surface until the rest are out. Nobody can launch again until then.

If you die while others are still down there, you watch through their eyes until it is over. "Next" changes who you watch; "Leave" takes you back to the surface.

If your connection drops underground, your place is held for a minute. You're still standing there, so come back quickly: the game reconnects on its own, and reloading the page works too. On the surface, reloading the page keeps you in your party.`
	},
	{
		id: 'the-surface',
		title: 'What you keep',
		category: 'The surface',
		body: `You start with a headlamp, your hands and 100 coin for the store.

Nothing to take down, or nothing you want to risk? Use free loadout (beside Confirm loadout, or hold {button:PadY}) puts everything in your loadout into your stash and takes you down with a crowbar, a padded coat and 3 bandages instead. If your stash has no room for it all, nothing moves: empty your backpack first. You keep the free things if you get out, but they sell for only 1 coin each and can't be salvaged.

Whatever you carry out of the catacombs is yours. You come back to your loadout packed the way you carried it, with what you found still in your backpack. Move it to your stash, or sell it, before the next descent.

The dashboard is where you land when you sign in. Its "Loadout" page shows what you own and what you're taking down: the stash on the left stays on the surface, and the loadout on the right goes down with you. Drag something from one to the other, or hold Shift and click it to send it across.

The loadout has a place for everything. Two weapons, and one thing worn for protection: it takes the blows of whatever catches you before you do, until it is worn through. The pale bar over your health underground is what it has left, and the wear stays on it when you come back up. Three gear slots, for things you wear that help just by being worn. A backpack that takes anything, materials included. And six quick-use slots for what you'll want in a hurry: bandages, smelling salts, something to throw. Only the quick-use slots are within reach of the wheel underground, so what sits in the backpack stays there until you move it.

Things of a kind share a slot, up to a few of each. Drop one stack on another to join them. Right-click anything to inspect it, equip it, split a stack, sell it or drop it. Inspect shows everything about it: damage, range, how fast it fires, how far it is heard, how long it lasts. Dropping something on the surface throws it away for good.

Hold the cursor over something to see what it is and what it does. The round buttons beside the stash show only weapons, ammunition, protection, quick-use items, gear, materials, treasure, quest items or everything else. The round button below them sorts the stash (and the store): as placed, by value, by name or by type. Click it again for the next order; the order you leave it in is kept. You can only take what you could carry: the weight is shown beside the Loadout title.

What the dead were buried with is worth money on the surface. Most of it is in crates, more and better the deeper you go. But it fills your backpack, some of it is heavy, and the more of it you carry the sooner the omens close in.

What you take down and don't bring back is gone. If you die, everything you carried stays where you fell, and so does anything you left lying down there.

Press {action:toggleFullscreen} on any screen, or choose Display under Graphics in the settings, to fill the whole screen. The game remembers it.`
	},
	{
		id: 'fontaine',
		title: 'Fontaine and her quests',
		category: 'The surface',
		body: `Fontaine hired you. She is an archaeologist, a historian, and a student of things that should stay buried, and she pays for what comes up from under the city. She never goes down herself. Find her under Contacts on the dashboard.

Her first quest is the first thing to do: go down into Rumors and get back out. After that she has nine more, one at a time: each comes once you have reported the one before.

- Each quest says what to do below. A search, a kill, something made or a task done counts for everyone down there with you who has that quest, and it counts the moment it happens, even if you die after.
- Most also ask you to bring something back. Each of you brings your own. On her page under Contacts, drag it from your stash onto the quest, or choose Commit: it is given up for good. What you were lent for a descent can't be.
- When everything is done and committed, Report to Fontaine for what she pays. The Contacts tab shows how many are ready.
- With more than one open, choose Track on the one you want to follow: it has a yellow dot, and it is the first one shown at the left of your view below.
- Each quest you report adds a page to her Research: what she has learned. Some of her quests teach you something new, like a recipe you won't find in the Library.

She sells things too, in her Store, once she has asked you for them.`
	},
	{
		id: 'the-shop',
		title: 'The store',
		category: 'The surface',
		body: `Click your money, at the top right of the dashboard, to open the store. It is closed to you once you are ready to descend. The round buttons beside it show only weapons, ammunition, protection, quick-use items, treasure, quest items or everything else. Hold the cursor over something to see what it is and what it does. Click it to see what it costs, choose how many, and press Purchase.

What you buy goes to your stash, which only has so many slots: open "Loadout" to take it with you. Firearms come empty, so buy rounds too.

Selling is done on the "Loadout" page: right-click something and choose Sell. What you find down there is what sells: treasure, marked with a small diamond in the corner of its slot. "Sell all treasure", under the stash, sells every piece of treasure in your stash at once (not what is in your loadout). Gear you bought can be sold back, for less than you paid. Some things nobody wants.

A first descent with nothing is a short one. Bring out what a crate or two holds, and buy a bandage before you go deeper. Smelling salts are what get you back on your feet when you go down alone.

The store doesn't sell everything. Some things are only found below or made: the knife, the hatchet, the crossbow, snares and more.

At first the store sells only the basics. The more you sell to the merchant, the more he trusts you, and the more he offers: a second tier once you have sold him a thousand coin's worth, a third at five thousand. Resolving the Gloaming opens another.`
	},
	{
		id: 'discovery',
		title: 'Discovery and the Library',
		category: 'The surface',
		body: `You learn what things are by finding them. Everything you see in a crate, a dead explorer, a tomb or anything else you open below is discovered: the first time, a chime and a note say so, and how many recipes it goes into. Everyone in your party who looks in discovers what is there. Buying something, or breaking something down into it, doesn't count: you have to find it.

The Library, on the dashboard, lists everything you have discovered, where you saw it and how many recipes it goes into. The recipes themselves are in the Workshop: every one you know any part of, with a ? for each part you haven't found yet. When every part is known, the recipe is yours.

Now and then you find a recipe fragment: a torn page of someone's notes. Read it where it lies and it tells you one thing you haven't found yet for a recipe you have started.

Newly discovered things shimmer in your stash and loadout until you look at them.`
	},
	{
		id: 'the-workshop',
		title: 'The Workshop',
		category: 'The surface',
		body: `The Workshop, on the dashboard, is where things are made and mended.

Craft: every recipe you know any part of, with a ? for each part you haven't found yet. What a recipe makes stays a mystery, a ? named ???, until you have made it once. One whose parts are all known can be made at once, from your stash and what you carried back up in your backpack and quick slots. Each thing it takes is a slot: dim with none on hand, the count red with too few. Pick materials above the list to see only the recipes that take them. Something you made sells only for what went into it.

Repair: mend something worn or broken. It takes a few materials (from your stash, then what you carried up) and some coin, more the more worn it is. You can also choose Repair from anything's menu on the Loadout page.

Salvage, in anything's menu in your stash or loadout (right-click it): break it down into the materials it was made from, into your stash. Salvaging never teaches you anything new: only finding things does.

Guns and rounds are never made. They are mended, and broken down.`
	},
	{
		id: 'explorer-levels',
		title: 'Experience and levels',
		category: 'The surface',
		body: `Everything you do down there earns experience: "+ Experience" shows on screen as it comes. Being the first to open any lootable pays 25, whatever it is and whatever is inside, so open everything. So does making things below, killing what hunts you (a teammate near a kill gets a share), being there for the rite and for laying it to rest, and getting out: more the deeper you went. The first time you do each thing (each recipe, creature, hint, each level you get out from) pays extra, once.

Experience is kept as you earn it. If you die you lose what you carried, not what you learned: dying pays a quarter of what getting out would have, and abandoning pays nothing for the way out. Rumors pays only its firsts.

Every 1000 experience is a level, up to 60, and every level is a skill point. The results screen after each expedition shows what you earned, your level and how far you are to the next. Your level sits beside your avatar on the dashboard; while you have skill points to spend it turns yellow and pulses. It opens the Skills page, where hovering a category tells you what it is good for.`
	},
	{
		id: 'skill-tree',
		title: 'The skill tree',
		category: 'The surface',
		body: `Once you reach level 1, your level shows in a round button beside your avatar at the top of the dashboard: it opens the Skills page. Three categories sit at the bottom: Nerve (the dark and the mind), Grit (the fight and the body) and Craft (the hands and the route). Opening one costs a point and shows its four skills. Each skill has three ranks, a point each, and each rank does more. Pointing at a skill shows what it does now and at the next rank, in the game's own numbers.

Hold a skill (or a closed category) to spend a point on it: the mouse button, a finger, Enter, or {button:PadA} on a controller with it focused. A quick press does nothing, so a point is never spent by accident.

Sixty levels won't buy everything, so choose. Respec puts every point back to spend again, for coin. Skills change nothing while you are ready to descend or underground; what you have when you go down is what you take.`
	},
	{
		id: 'field-crafting',
		title: 'Crafting below',
		category: 'Gear and loot',
		body: `With the field crafting kit worn in a gear slot, some recipes can be made down there: bandages, candles, snares, oil bottles, bolts and more. Open the menu ({action:inventory}) and choose the Craft tab. Pick something you have the materials for and you kneel over it for a few seconds. You need your lamp lit, it makes a little noise, and moving stops it. What you make goes in your pack.

As in the Workshop, a recipe you have never made shows only as ???: make it to find out what it is.

The Craft tab can also mend something you carry a little of the way, with its materials. Each thing made or mended wears the kit.`
	},
	{
		id: 'alerts',
		title: 'Alerts',
		category: 'The surface',
		body: `When something happens that is about you, a notice slides in at the right edge of the screen for a few seconds, then slides away. More than one stack up, and the rest move up as each goes. Hold the cursor over one to keep it there.

- A friend request sent to you, or one you sent, and a new friend when one is accepted.
- A party invite sent to you, or one you sent, and whether it was accepted or turned down.
- Something added to what you have: bought in the store, picked up below, or given to you. It shows the item and how many. More of the same thing in a row adds to the one notice.

Click a friend or party notice to open the Social page. Click an item notice to open your Loadout. Below, it opens your pack instead, once a menu has let go of the cursor.

They can be turned off in Settings, under Interface.`
	},
	{
		id: 'comfort',
		title: 'Comfort and accessibility',
		category: 'Settings',
		body: `The settings ({action:toggleSettings}) can make the catacombs easier to play.

Reduce flashing, under Accessibility: your lamp's flicker and cut-outs fade gently instead of strobing, and gunshots and the red flash when you are hurt are much softer. The lamp still lights as much as before, so you see what everyone else sees.

Sprint and Aim, under Accessibility: press the key once instead of holding it. You stop running when you stop moving or change stance. A gun stays raised until you press aim again or put it away.

Mono audio, under Accessibility: both ears hear everything. Turn on Captions too, to see which way a sound came from.

Under Graphics, turn down Camera shake, and if the game stutters, lower the Render resolution or set a Frame rate limit (on a laptop, 60 saves battery). Playing with others, Teammate lamp shadows on Nearest or Off helps most in a party of four, though a teammate's lamp without shadows shines through walls. Aiming sensitivity is under Mouse. Gamer tags, under Interface, hides your teammates' names above their heads. Under Audio, you can mute the game while another tab or window is in front.

To see how smoothly the game is running, press {action:toggleStats}: the frame rate shows in a corner.`
	},
	{
		id: 'headlamp',
		title: 'Headlamp',
		category: 'Surviving',
		body: `Tap {action:headlamp} to switch your headlamp off, and again to bring it back on as it was. Hold {action:headlamp} for a moment to change between low and bright.

Low is dim: enough to find your way, but something in the dark can be almost on you before you see it. Bright lights the passage wide and far, and drains the battery about three times as fast. The cells in the bottom-left corner show the charge left, with its voltage beside them: 24V is full, and at 0V the lamp dies.

Batteries turn up in crates and on the dead. Put one in a quick-use slot, take it in hand and hold {action:attack}, standing still, to swap it in. Each gives back 12V, never more than full, so don't waste one on a lamp that's nearly charged.

A teammate's lamp running low? Look at them with the battery in hand and hold {action:aim} instead: it goes into their lamp, not yours.

The starter headlamp is cheap: it flickers, and flickers more as the battery runs down.`
	},
	{
		id: 'sanity',
		title: 'Sanity',
		category: 'Surviving',
		body: `Sanity is your health. Your bars sit in the bottom-left corner, under your name: sanity above stamina. Your teammates' names and bars are stacked above yours, so you can see who is hurt or down. The edges of your sight darken as it falls.

It wears down when you're in the dark with your lamp off and no one else's light on you, and when you look at something you shouldn't. Being struck takes a great deal of it at once.

A bandage gives some of it back. Hold {action:quickUse}, pick the bandage from the wheel, then hold {action:attack}. Stand still: it takes a few seconds, and moving or letting go starts it over. The bandage has to be in a quick-use slot to be on the wheel. A medkit works the same way, but you kneel to open it on the floor; it takes a little longer, and gives it all back. They are rare below, and dear in the store.

To tend to a hurt teammate instead, stand close, look at them with the bandage in hand and hold {action:aim}. Stand still and keep them in front of you until it is done: it uses your bandage, and the sanity goes to them.

When your sanity runs out you go down. You can only look around and drag yourself slowly across the floor, and you don't have long. If you can reach a way out, you can still climb out: hold {action:interact} there.

If there is nothing to wait for, hold {action:climb} for a moment to surrender. It ends at once, as if your time had run out.`
	},
	{
		id: 'reviving',
		title: 'Reviving',
		category: 'Surviving',
		body: `If a teammate is down, go to them and hold {action:interact}. It takes a few seconds. By hand they come back shaken, with little sanity left.

With smelling salts to hand, one is used and they come back far steadier.

If no one can reach you, because you're alone or everyone else is down too, you use your own salts. Without salts, and without help, you won't get up again.

Salts only count when they are to hand, in a quick-use slot. At the bottom of your backpack they are no use to anyone.`
	},
	{
		id: 'things-in-the-dark',
		title: 'Things in the dark',
		category: 'Surviving',
		body: `You are not alone down here.

Noise and light draw them to you. Everything your party does adds up: walking and climbing carry, running carries far, and a gunshot carries furthest of all. A lamp on bright draws them too. Do enough of it and something comes to look, a little way off, and starts searching for you. It doesn't take one crate or a moment of bright light, but it doesn't take long either.

What you've drawn fades if you go quiet: keep still or creep, and put your lamp out. A lamp on low draws nothing more, but doesn't undo what you've already drawn either.

The dark hides them. Get a lamp on one and you'll see it, but it may see your light too.

When something catches their attention they stop, wait, and come to look. They hear you: creeping, crouching and crawling are quiet. They notice your light when they're facing it. In the dark, keeping still or moving quietly, you can wait one out. Don't stay where it saw your light. Very close, it will find you anyway.

Listen for breathing. If you can hear it, it's near.

Once one has you, it comes slowly, then all at once. Put your lamp out and get out of its sight, and it may lose you. They walk upright: they won't follow you into a squeeze, a crawl or deep water.`
	},
	{
		id: 'vermin',
		title: 'Rats and spiders',
		category: 'Surviving',
		body: `Rats nest all through the catacombs, a few together. They come for noise and light, and bite whoever they find. In the dark they only notice you right beside them. One bite is nothing much; a few add up. One stab finishes one.

Spiders sit in clusters all over the catacombs and leave you alone unless you hit one, or come right up to one, and then they bite. Every bite poisons you: for a full minute you can go no faster than a crouch, and you can't run. Nothing cures it yet.

Sometimes there is a much bigger spider. It hunts like the things in the dark do, its bite poisons, and it takes a lot more killing.`
	},
	{
		id: 'moths',
		title: 'Moths',
		category: 'Surviving',
		body: `Moths come to a bright headlamp: leave it on bright for more than a few seconds and they start to gather, more and more of them for as long as it stays bright, until there's a cloud of them. On low, no more come. They flutter in your beam and get in the way, but they do you no harm. Swat one and it falls. Put your lamp out for a few seconds and they scatter.`
	},
	{
		id: 'figures-in-corners',
		title: 'Figures in the corners',
		category: 'Surviving',
		body: `Some of the shapes crouched in corners and dead ends are only people who live down here. They keep still and watch, even with a light on them; come right up to one and it gets up and walks away. Hit one and it runs.

Not all of them are what they look like. Now and then one you come upon stands up as something else, and comes for you.`
	},
	{
		id: 'the-surveyor',
		title: 'The surveyor',
		category: 'Surviving',
		body: `Somewhere below the first level a surveyor wanders from corner to corner, mapping as he goes. He means you no harm, and nothing you do hurts him. He stops when you come close.

Look at him and hold {action:interact} and he shows you his map: everywhere he has been goes into yours (you need a notebook to read it). He does it once for each of you, so show yours to your party (see The map).`
	},
	{
		id: 'searching',
		title: 'Searching',
		category: 'Gear and loot',
		body: `Crates are not the only things down here worth going through. The dead were buried with what they owned, and the living left things behind.

Look at something and hold {action:interact} to search it. The prompt says how: some open in a moment, a bone pile takes a while to rummage through, a rat nest is a reach into the dark. Some need something in your hand. A crowbar pries a jammed crate, a sealed niche, a stone lid or a smuggler's brick. A blade cuts a cocoon open faster than your fingers can. A locked trunk takes a key, and a key can be anywhere in your pack. When the prompt is red, it says what you need.

What you find depends on where you look. Wall niches and sarcophagi hold what the dead were laid to rest with. Tool chests and lockers hold the things workmen used. The dead explorers carry rounds and supplies. The deeper you go, the better it gets.

Searching makes noise. Prying, smashing and digging through bones carry far. Every thing you take out is heard too.`
	},
	{
		id: 'items',
		title: 'Items',
		category: 'Gear and loot',
		body: `You carry two weapons. Press {action:primaryWeapon} or {action:secondaryWeapon} to take one in your hand, or {action:nextItem} or {action:prevItem} for the other one.

Everything else you can use is on the quick-use wheel. Hold {action:quickUse} and the wheel opens; move the mouse toward what you want and let go, and it is in your hand in place of your weapon. {action:attack} uses it: hold it to bind a wound, swing with a brick, draw with chalk. Press a weapon key to go back.

What is in your hand is named in the bottom-right corner, with the rounds loaded and spare when it is a firearm. Spare rounds are taken from your backpack.

Look at something on the floor and press {action:interact} to pick it up. It goes where it belongs if there is room: a weapon to an empty weapon slot, quick-use things to the wheel, the rest to your backpack. To put something down, open your pack and drop it from its menu. Some things have nothing to lie on the floor as: those go into a drop box of yours, an iron strongbox, in front of you. Anything you drop near your own box goes into it. Anyone can open a box and take from it, but what you drop never goes into someone else's. A box that is closed empty is gone.

If you die down here, everything you carried stays where you fell. Someone else might find it.`
	},
	{
		id: 'wear',
		title: 'Wear and broken things',
		category: 'Gear and loot',
		body: `Your gear wears out. A gun wears with every shot, a blade or a crowbar with every blow that lands, a coat with every blow it takes for you. Hold the cursor over something to see how much it has left: the bar under its name, and the percent.

When it runs out it breaks. A broken thing keeps its place and looks the same, under a red shade with a crack in the corner of its slot, but it does nothing. A broken gun only clicks. A broken blade won't swing. A broken coat takes nothing, and every blow goes straight to you. A broken crowbar won't pry. You can still carry it, and equip it, until it can be mended.

Worn things sell for less, and broken things for nothing. A brick is different: it is only good for a few blows, and then it crumbles away.

Some things wear by the minute instead. Kneepads wear while you crawl, felt overshoes while you walk, an incense censer while you hold it. Gloves wear a little every time they keep a bite or a sting off you.`
	},
	{
		id: 'pack',
		title: 'Your pack',
		category: 'Gear and loot',
		body: `Press {action:inventory} to open your pack. It is the first tab of the menu; the Rite tab beside it shows what you know of the rite. You can't open the menu while you're down. The catacombs don't wait while you look through it, and your hands are full: you can walk, but not fight, use or pick up anything, or run. With a controller you stand still.

It is laid out like your loadout on the surface. Equipment: two weapons, what you wear for protection, and three gear slots. The backpack, which takes anything. And the quick-use slots, which are what the wheel offers. The slot in your hand is outlined.

Drag things between slots. Hold Shift and click to send something between the backpack and the slot it belongs in. Right-click to inspect it, equip it, split a stack or drop it. Things of a kind share a slot, up to a few of each; drop one stack on another to join them. To hand something to someone, drop it and let them pick it up.

Everything weighs something, and the weight you carry is shown beside the title. Once it turns blue you have started to slow down, and the more you carry the slower you get. There's a limit to what you can lift at all: when the game says something is too heavy, you'll have to leave something else behind.`
	},
	{
		id: 'fighting-back',
		title: 'Fighting back',
		category: 'Surviving',
		body: `Press {action:attack} to swing or fire. Hold {action:aim} to aim a gun: you move slowly, but your shots go where you look. Press {action:reload} to reload.

Every swing takes stamina, more for heavy weapons. Out of breath, you can't swing until you get it back.

With nothing in your hand, {action:attack} throws a punch. It barely hurts anything and you have to be close, but it is better than nothing when your weapon is gone or broken. Fists tire you too.

Hold {action:attack} with something you can throw to draw it back: a faint arc shows where it will land (you can turn that off in the settings, under Interface). Let go to throw it, or press {action:aim} to put it down again.

A knife is quick and quiet. A crowbar is slow but hits hard enough to stop something mid-swing. Bricks are everywhere; they break after a few blows.

A knife or a brick can be thrown. Hold {action:attack} and your arm draws back; after a moment it is ready, with a click. Let go to throw. Let go sooner and you only swing. Whatever you threw lies where it lands until you pick it up again. To keep hold of it, take something else in your hand instead of letting go.

Guns are loud. Every shot is heard a long way off, on the floors above and below, and whatever hears it will come. A thrown brick makes noise where it lands, not where you are.

They can be put down. It takes more than you'd like.`
	},
	{
		id: 'crates',
		title: 'Crates, the dead and loot',
		category: 'Gear and loot',
		body: `Crates stand against the walls of rooms and dead ends. Look at one and hold {action:interact} to lift the lid.

Others came down before you and never left. Their bodies lie along the walls, and what they carried is still on them: look at one and hold {action:interact} to search it. A body is gone through just like a crate, only more quietly.

What is inside takes time to find. Each thing takes a moment to turn up, one after another, and until it does you can't tell what it is or take it. The best of a crate comes last. Step away before something has turned up and you start on it again next time; what you did find stays found.

The crate opens beside your pack. Drag things across, or hold Shift and click to send them over. You can put things in as well as take them out. Press a movement key, or Close, to step away.

Only one of you can go through a crate at a time. Once a crate has been opened its lid stays up, so you can tell which ones someone has been at. The lid can be heard, and so can the rummaging.

How hard something is to come by shows on the left and bottom edge of its slot: nothing for common things, then grey, green, blue and yellow for uncommon, rare, epic and legendary. Hold the cursor over it to read what it is and what it sells for.

A crate never holds much of the best. Deeper crates hold more.`
	},
	{
		id: 'weapons',
		title: 'Weapons',
		category: 'Gear and loot',
		body: `Every weapon has its way. Hold the cursor over one and choose Inspect from its menu to see all of it: how hard it hits, how far, how loud, how long it lasts.

A hatchet cuts webs in one blow, and can be thrown and picked up again. A trench spade hits everything in front of you, a little less each. A short spear reaches far but only straight ahead, and it is the one weapon that works while you crawl. A nail-studded club leaves things bleeding, but it can snag. A pickaxe breaks through rubble. A sledgehammer staggers anything it hits and smashes trunks open, but you can't run with it in your hand.

The bolt-action rifle's round goes through everything in a line; it loads one round at a time. The derringer fires from the floor, crawling or downed, and takes revolver rounds. It is small enough to go in a quick-use slot, not a weapon slot: take it in your hand from the quick-use wheel ({action:quickUse}). The crossbow makes no sound at all, but its bolt takes its time and drops. A slingshot won't kill anything; it makes a noise a long way off, and fires pebbles or old coins.

An oil bottle bursts into fire where it lands. Firecrackers go off a few seconds after they land, loudly, somewhere you are not. Throwing knives come three to a lot: go and get them back. Like the derringer they go in a quick-use slot and come to hand from the wheel.`
	},
	{
		id: 'gear',
		title: 'Gear',
		category: 'Gear and loot',
		body: `Gear is worn, not used: three gear slots in your loadout, and each thing works while it is there.

Kneepads make crawling faster and quieter. Felt overshoes soften your footsteps. Gloves keep a rat nest's teeth and a cocoon's poison off your hands, and make rope easier to climb. A pocket compass shows, at the top of the screen, which way the nearest way out is and how far; once you know where the rite is held, it points there instead. The field crafting kit lets you make things below.

A leather jerkin takes more than a padded coat before it gives, but you run a little slower in it.`
	},
	{
		id: 'tools-and-tricks',
		title: 'Tools and tricks',
		category: 'Gear and loot',
		body: `Most of these are used from the quick-use wheel: take one in your hand and hold {action:attack}.

Laudanum: for a minute, nothing the dark or the things in it do costs you sanity, but your aim sways and you move a little slower. Grave dirt: whatever is hunting you loses you for a few seconds. A whistle: everyone in your party sees where you are, for a moment, and so does everything nearby that hears it.

Thrown: a glow stick lights where it lands for a few minutes, and moths come to it. Bait draws rats to it, and off you. Set down: take it in your hand, stand still facing the floor where it should go, and hold {action:attack} for a moment; moving or letting go stops it. A snare is set where you face, and holds the first creature that steps in it fast for a few seconds; then it is spent. Blessed salt pours a line 3 m long across the way you face, and nothing hunting you crosses it for half a minute. A tripwire bell strings a line across the way you face: when something crosses it the bell rings, your party is told, and whatever is near hears it. It sets itself again a few times. A snare or a bell still set can be taken up again: look at it and press {action:interact}.

Held: an incense censer keeps moths, rats and spiders away while it smokes, and makes a little noise as it swings. Lockpicks open locks without a sound, but a pick can snap.

Bait doesn't keep: whatever you bring back up is gone.`
	},
	{
		id: 'curious-treasure',
		title: 'Curious treasure',
		category: 'Gear and loot',
		body: `Most treasure is only worth what it sells for. A few pieces are worth more than that, if you dare.

Carry a tarot deck down and you draw a card as you arrive: a small blessing, or a small curse. The custodian's key ring opens any one lock, and is gone. The porcelain doll sells for a great deal, but it is cursed. And an apothecary jar or a sealed reliquary jar won't survive a hard fall.`
	},
	{
		id: 'false-walls',
		title: 'False walls',
		category: 'Gear and loot',
		body: `Not every dead end is one. Here and there a passage has been walled up, and what lies beyond is untouched: nothing goes in there, and the crates are still full.

You can't tell a false wall by looking. Take a crowbar in your hand and walk up to the wall at the end of any dead end: the prompt reads Pry. Hold {action:interact} for five seconds. If it is solid rock, nothing happens. If it is false, it comes down. Either way it is loud, and the wall coming down is louder.`
	},
	{
		id: 'jammed-and-locked',
		title: 'Jammed crates and locked trunks',
		category: 'Gear and loot',
		body: `Some crates won't open: the lid is jammed fast. You only find out by trying one. After that the prompt reads Pry, and anyone can see the crate is stuck.

To pry one open, take a crowbar in your hand, look at the crate and hold {action:interact}. It takes six seconds and it is loud: anything nearby will hear it and come to look. Let go and you start over. Without a crowbar in your hand the prompt shows in red.

Deeper down a few of the lootables are iron-bound trunks, locked. Each holds something epic or legendary, among other things. To open one you need a key: somewhere in the map, in something you can open by hand, there is one key for every trunk and every locked gate. Look at the trunk and press {action:interact} to unlock it. The key is used up, and it doesn't need to be in your hand. Then hold {action:interact} to search the trunk like any crate. Without a key the prompt shows in red. A key you carry out is yours to bring down again.`
	},
	{
		id: 'webs-and-rubble',
		title: 'Webs and rubble',
		category: 'Gear and loot',
		body: `Some side passages are blocked by things you can see. They lead somewhere worth going.

A web across the way tears if you hit it: a few blows of anything you swing ({action:attack}), even your bare hands, and every blow tears more of it open. A blade made for cutting, like a hatchet, goes through in one. Fire burns it away, so an oil bottle thrown near it clears it too. Look at a web and it says what will get you through.

A fall of rubble needs a pickaxe. Take it in your hand, look at the rubble and hold {action:interact}. It takes a few seconds and it is loud. A crowbar does nothing to rubble.`
	},
	{
		id: 'gates',
		title: 'Locked gates',
		category: 'Gear and loot',
		body: `A family mausoleum keeps its dead behind an iron gate, locked. There is a key for every gate somewhere in the map, in something you can open by hand. Carry it, look at the gate and hold {action:interact}: the key is used up and the gate swings open, for everyone.

Lockpicks work too, held in your hand. Picking the lock takes longer but makes no sound, and each lock you pick may snap one of your picks.`
	},
	{
		id: 'what-bites',
		title: 'What bites back',
		category: 'Gear and loot',
		body: `Not everything you reach into is glad of it. A rat nest bites the hand that goes in. A webbed cocoon is poisoned, and spiders are rarely far. Gloves, worn in a gear slot, keep both off.

Disturb a bone pile and the rats under it may come boiling out. Lift a sarcophagus lid and you may find what the spiders left in it. Taking a saint's relic from a reliquary alcove does not go unnoticed by what haunts the place. And there are rooms where searching among the dead wears at you, whatever you find.

A sarcophagus lid is heavy. Lever it with a crowbar, or get a friend to push it with you: both of you look at it and hold {action:interact}.`
	},
	{
		id: 'fragile-and-cursed',
		title: 'Fragile and cursed things',
		category: 'Gear and loot',
		body: `Some treasure is fragile: a jar breaks if you take a hard fall carrying it. Smash a box open rather than pick it and something fragile inside may break too.

Some treasure is cursed. It sells well, but carrying it wears at your sanity, and whatever it is whispers to you, close by, when nobody else can hear.`
	},
	{
		id: 'fonts',
		title: 'Fonts',
		category: 'Gear and loot',
		body: `Chapels and vestries have fonts of still, cold water. Carry an empty glass bottle, look at the font and hold {action:interact} to fill it with holy water. Each font has only a few fills before it runs dry.`
	},
	{
		id: 'stashes',
		title: "Smugglers' stashes",
		category: 'Gear and loot',
		body: `Smugglers used these tunnels long before you. They hid their goods behind loose bricks and marked the spot in chalk only another smuggler would know.

You won't find a stash by walking past it. Get close to a wall and look properly: when you notice a chalk mark, the brick beside it is loose. Then it is there for anyone, and a crowbar pries it out.`
	},
	{
		id: 'pitons',
		title: 'Climbing pitons',
		category: 'Gear and loot',
		body: `A piton is a rope anchor you carry. Where there is a drop and nothing to tie a rope to, stand at the edge facing over it, take a piton in your hand and hold {action:attack} to hammer it in. It is loud. From then on it is an anchor like any other: anyone can tie a rope there and climb down. If there is no drop in front of you, the piton isn't used.`
	},
	{
		id: 'chalk',
		title: 'Chalk marks',
		category: 'Gear and loot',
		body: `Chalk lets you leave marks on the walls, for yourself or for whoever comes after you. Keep it in a quick-use slot and take it from the wheel.

Face a wall, the floor, or anything close enough to touch, and hold {action:attack}. A wheel of marks opens: arrows, a cross for a dead end, a circle for somewhere you have been, and more. Move the mouse toward one and let go, and it is drawn where you were looking. A stick of chalk makes one mark.

You choose the eight marks on your wheel. On the surface, open the Loadout page and press Chalk wheel: pick a place on the wheel, then the mark to go there, and save. There are marks for loot, traps, water, a way out, somewhere to wait or meet, and more, and every one is yours to use. The new wheel goes down with you on your next descent.

Marks are only chalk. In the dark you won't see them; a lamp on the wall brings them out. Come close to one and you can see who drew it.

You can rub out your own marks: look at one and hold {action:interact}. Other people's marks are theirs to keep.`
	},
	{
		id: 'rope',
		title: 'Rope',
		category: 'Gear and loot',
		body: `Rope packs, a hundred metres of rope each, are sold in the store. Down below you may find a bundle of old rope, but not often. Keep rope in a quick-use slot and take it from the wheel.

Lay it behind you to find your way back: with rope in your hand, hold {action:attack} and walk. It pays out along the floor wherever you go, as far as the rope reaches. Let go of {action:attack}, or put the rope away, and it stops where it lies. Once laid, the pack or bundle is spent, however little of it you used, so lay it where it counts. Like chalk, it only shows where a lamp falls on it. Anyone can gather up a laid rope: stand on it and hold {action:interact}, and you get the pack or bundle back.

Some places drop away into the dark, too far to climb down and too far to jump. At the top there is a post to tie a rope to. With a rope long enough for the drop in your hand, stand at the post and hold {action:interact} to tie it off and let it down. It takes the whole pack or bundle. Then anyone can climb it, down and back up (see Climbing): look out over the edge and press {action:interact} to go over. The rope can only be untied at the post, by holding {action:interact} there with your back to the drop, and not while someone is on it: you get the rope back. Leave it, and it is there for the way back.`
	},
	{
		id: 'map',
		title: 'The map',
		category: 'Gear and loot',
		body: `Nobody knows the way down here, and nobody gives you a map. You draw your own, in a surveyor's notebook from the store. It goes in your pack like anything else, and it is lost with everything else if you die.

With a notebook in your pack, press {action:map} to open your map: it is the Map tab of your pack, beside Pack and Rite, and opens on the level you are on (on a controller, open your pack and go to the Map tab). It starts blank. The catacombs don't wait while you look at it.

To draw, stand still with the map open and hold Sketch ({action:sketchMap}). After a moment what you can see from where you stand goes down on the page, a dozen paces at most. Only what you can see: a corner, a pillar or the far end of a big room stay blank until you go and look. Ways on that you haven't drawn yet trail off at the edge of the page. The pencil can be heard.

Your map is yours alone: what your friends draw goes in their notebooks, not yours. When you meet up again, stand close and hold Show ({action:showMap}): you each see the other's map and copy it into your own. They need a notebook of their own.

The map shows passages and rooms, the names of the rooms you have drawn, stairs and where they lead, the ways out, water, crawls and squeezes, and the chalk marks in places you have drawn. It shows you as a red arrow. It shows one level at a time: change level with the Up and Down buttons at the top, or {action:mapLevelUp} and {action:mapLevelDown}. Zoom with the mouse wheel or {action:mapZoomIn} and {action:mapZoomOut}, and drag the page to look around. Find me brings it back to where you are.`
	},
	{
		id: 'captions',
		title: 'Sound captions',
		category: 'Settings',
		body: `Down here you hear things long before you see them. If you can't rely on your ears, turn on "Captions" under Accessibility in the settings ({action:toggleSettings}).

What you would have heard appears as text above your items, with an arrow for where it came from: ahead, behind, to either side, or on the floor above or below. Sounds too far away to hear aren't shown.

Captions tell you what a sound is like, not what made it.`
	},
	{
		id: 'omens',
		title: 'Omens',
		category: 'The Gloaming',
		body: `The longer you stay down here, the worse it gets.

Listen. Knocking that comes more often. Whispers where no one is. A low hum under everything. Lamps that won't hold steady, that dim and fail for no reason.

These are warnings. When they come thick and close together, it is time to think about the way out.`
	},
	{
		id: 'rumors',
		title: 'Rumors',
		category: 'The Gloaming',
		body: `Everyone starts with Rumors: a short way into the catacombs, and an old vault where the keepers trained. Nothing down there wants you, and nobody goes down, though things still hurt.

On the way in you are shown, a step at a time, what you need: the rope and your lamp, opening a crate, discovering what is in it, making a bandage with the field crafting kit, the Library, chalk. The first time through, the crates and the kit are there for you, and what you take comes out with you.

The vault has training dummies at 5, 10, 20 and 40 metres, one running along a track, bricks by the door, a web across one arch and rubble in the other. Every hit on a dummy shows how hard it was. Everything works as it does anywhere else: rounds are spent, things wear out, what you use is gone.

Climb the ladder at the far end to get out. Once you have, the Gloaming is open to you. Rumors stays open after, as a place to train.`
	},
	{
		id: 'the-gloaming',
		title: 'The Gloaming',
		category: 'The Gloaming',
		body: `Perform the rite and the Gloaming answers it. Something vast breathes out through the stone, and it is there in the room with you, in the corner you were told not to look at. The rite alone doesn't end it: you have to banish what it brings.

It comes at whoever is nearest, slower while a lamp is on it and quick when none is. It doesn't just follow you: it heads where you are going, and circles round to come at you from the side, so running round a table won't keep it off. When it reaches you it rears back to strike. That is your moment to get out of reach. A blow that lands is hard: what you wear takes some of it, and two will put you down. It hits harder, and takes more to banish, the more of you there are.

And it doesn't always walk. Now and then it shrieks and charges, as fast as you can run.

Keeping your distance isn't safe either. From across a room it stops, and blue smoke gathers at its hands with a low, rising hiss. Then something dark strikes out at you, faster than you can see. It aims where you are until the very last moment: when the smoke is thickest, step out of the line, or put stone between you. If it hits, your lamp goes out, and won't come back on until it wears off (Snuffed, beside your health). Then it's up to you to switch it on again.

Now and then it slips into the dark and is gone. It comes back from somewhere else: behind you, or at whoever has wandered off alone. Stay together.

Steel and shot wear it down, every hit.

Turn your lamp off and back on ({action:headlamp}) with it in the beam, and the flash stuns it: it stands frozen for a moment, and a strike it was winding up is lost. It won't fall for that again for a while.

Banish it and the Gloaming is resolved: the omens lift and the dark lets go. The other things down here don't, and you still have to get out before time runs out.

Why it walks is what Fontaine wants to know. Her quests, and the pages of her research, tell it a piece at a time.`
	},
	{
		id: 'room-tasks',
		title: 'Room tasks',
		category: 'The Gloaming',
		body: `Some of Fontaine's quests want something done in a particular room: a bell rung, a winch hauled, a wall broken open, a rubbing taken. While you have that quest, the room is always in the map, and the thing is there.

Look at it and hold {action:interact}. It takes a while, and the whole time it is loud: everything that hears it comes. Let go and it starts over. One of you works while the others hold the door.

When it's done it stays done, for everyone with you. If it leaves something behind, it lies at your feet: pick it up and bring it back.`
	},
	{
		id: 'barred-stair',
		title: 'The barred stair',
		category: 'The Gloaming',
		body: `The stair down to the Gloaming's third level is barred from the far side. Hold {action:interact} on the door and it only rattles.

Fontaine knows the quarrymen's way through: a quarryman's charge, made below with the field crafting kit from her powder flask, firecrackers, lamp oil and twine. You won't find it in the Library: her quest What They Took teaches it, and the Craft tab shows it from then on.

Put the charge in a quick-use slot, take it in hand at the door, and hold {action:attack} to set it down. Then get well back. Eight seconds later it goes off, and everything on the level hears it.

The door stays open for good, for everyone who was there: on later descents it isn't barred for any party with one of them in it. The flask is used up, and Fontaine sells more.`
	},
	{
		id: 'the-rite',
		title: 'The rite',
		category: 'The Gloaming',
		body: `The rite is what ends it, and it is Fontaine's last quest, The Last Procession. It opens once you have done the eight before it: everything she asked you to bring back is committed already, so there is nothing to carry down for it.

What is known about it is always at the left of your view down here, and on the Rite tab of the menu: press {action:inventory} and choose Rite ({button:PadRB} with a controller). Your open quests are under it. If it covers too much of your screen, press {action:toggleRitePanel} to hide it. Only the Affliction's name stays at the left edge, with the button that brings the rest back, and the menu still shows all of it. It stays hidden on your next descent until you press it again, or turn Show rite and quest panel back on under Interface in the settings.

The Gloaming Chapel is the last room of all, on the third level, past the barred stair and behind a great double door: hold {action:interact} on the door to open it. It is vast, with a hall either side and stairs up to a balcony over the door.

Whoever has The Last Procession open goes to the altar and holds {action:interact} to begin it. When it's done, he comes, and the door slams shut behind you: nobody gets in or out until it is over. Be ready before you begin, and bring everyone in first.

Put him down and he falls, but it isn't over. He leaves his lantern, still burning, where he fell. Carry it to his tomb under the altar and hold {action:interact} to lay it there. Then it is resolved, the door opens, and a ladder comes down from a hatch over the dais: your way out. Killing him and getting out without laying the lantern resolves nothing, and the lantern doesn't come up with you.

It is resolved only for those of you who could begin it. Once it is, it's done for good: you can still go down into the Gloaming, but he won't rise for you again. In a party where nobody can still begin it, the altar does nothing.`
	},
	{
		id: 'look',
		title: 'Your look',
		category: 'The surface',
		body: `The Explorer tab on the dashboard is how other players see your explorer underground. Your explorer turns on the left: drag it round, or use Turn (left and right on a controller). Motion shows it standing, walking, running, crouching or crawling.

- Body and Face: two bodies, each with five faces.
- Hair, Shirt, Pants and Outer layer: what you wear. The outer layer goes over your shirt; choose None to go without.
- Colours: a row of colours for your skin and for each thing you wear. For hair and clothes, the first colour, split in two, is the way it was made.

Your explorer shows each change at once; Apply keeps it, and your party sees it straight away on the Expedition page (Revert goes back to what you had). Choosing on a controller: move to a row, then left and right step through it; on a row of colours, A picks the one in focus.`
	},
	{
		id: 'account',
		title: 'Your account',
		category: 'The surface',
		body: `Click your avatar and gamer tag at the top right of the dashboard for your Account screen, or to sign out.

- Profile: your avatar, the picture other players see beside your gamer tag and on your pane before a descent. Upload a picture, then move and zoom it until the right part shows in the circle (drag it, or use the right stick on a controller). If you linked Discord, your Discord avatar shows until you upload one; remove yours to go back to it. Your gamer tag is here too, the name other players see. Delete account is here too: it removes your account, your explorer, your stash and your friends list for good, after you type your gamer tag (and your password, and a two-step code if you use one). Bug reports, ideas and feedback you sent stay, without your name.
- Sign-in: change your password, and link your Discord account so you can sign in with it. If you made your account with Discord, you can set a password here too. In the desktop app, you can link your Steam account here as well.
- Security: two-step sign-in, and signing out every other browser.

Forgot your password? On the sign-in page, choose "Forgot your password?" and we'll email you a link to choose a new one. It works once, for an hour. Choosing a new password signs you out everywhere else.

Two-step sign-in asks for a code from an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password, Authy and others) after your password, so a stolen password isn't enough. When you turn it on you get eight recovery codes: keep them somewhere safe. If you lose your phone, each one signs you in once.`
	},
	{
		id: 'desktop-download',
		title: 'The desktop app (beta)',
		category: 'The surface',
		body: `Beta testers can play Undercroft in its own window on Windows. It is the same game as the website, with the same account and everything you keep.

- To get it, choose Get the desktop app from the menu under your gamer tag, or go to undercroft.us/download.
- Windows may say it protected your PC, because the installer isn't signed yet: choose More info, then Run anyway.
- Once it is installed, the Open the desktop app link on that tab starts it.
- It shows the game as it is on the website, so it keeps up to date by itself.
- To close it, choose Quit game from the menu under your gamer tag.`
	},
	{
		id: 'desktop-app',
		title: 'The desktop app on Steam',
		category: 'The surface',
		body: `Undercroft also comes as a desktop app for Windows. It is the same game, in its own window, played on your PC.

- There is nothing to sign in to: your Steam account is your account, and your gamer tag starts as your Steam name (change it on your Account screen). Without Steam running, you play on your own.
- Your save is on your PC, separate from an account on the website: what you keep in the desktop app stays there.
- Achievements unlock on Steam as you earn them, and your Steam friends can see whether you are on the surface or down in the undercroft, and with how many.
- Press Shift+Tab for the Steam overlay.
- To close the game, choose Quit game from the menu under your gamer tag.`
	},
	{
		id: 'playing-with-friends',
		title: 'Playing with friends (desktop)',
		category: 'The surface',
		body: `In the desktop app, the game runs on your own PC, and so does your save: your stash, your coins and your explorer are kept there, not on a server.

- To play together, open the Social page and choose Invite Steam friends. A friend can also choose Join game beside your name in their Steam friends list.
- When a friend joins, you are the host: the expedition runs on your PC, and they connect to it through Steam. They bring their own stash and loadout, and what they carry out goes back to their own save.
- When you join a friend, your hub stays yours: your stash, loadout and shop are on your PC. Choose Leave their game on the Social page to go back to playing on your own.
- Friends can join while the party is on the surface, not during an expedition.
- Without Steam running, you can still play on your own.`
	},
	{
		id: 'feedback',
		title: 'Bugs, ideas and feedback',
		category: 'The surface',
		body: `Found something broken, or want something added? Click your gamer tag at the top right of the dashboard.

- Report a bug: say what happened and how to make it happen again. It goes on the list of things to fix. You can also report one from the settings screen, down in the catacombs too.
- Run diagnostics: if the game runs slowly on your computer or tablet, this measures it. It walks through the same stretch of catacombs at each graphics quality (Low, Medium and High, alone and then with a party of four), takes about a minute, and changes none of your settings. Keep the screen in front while it runs; Escape (or B on a controller) stops it. Then you see the frame rates and can send them to us, with a note if you like, so we can make the game run better on machines like yours.
- Ideas and feedback: the board of ideas other players suggested. Vote for the ones you want most (once each, and you can take a vote back): the ones with the most votes are looked at first. Suggest your own: it shows on the board once the team has read it. Or send feedback only the team reads.

A bug report can carry details about the game and your computer: the version, your browser and graphics card, and, underground, the map, the room and the frame rate. You see all of it before sending, and can leave it out. It never includes your email, gamer tag or password.

If something goes wrong while you play, the game asks whether you want to report it, with the error already attached. Nothing is sent unless you choose to.`
	}
];
