/**
 * Fontaine's quests (docs/dev/quests.md): the basics, rummaging, crafting and combat, and one by
 * one the story of the Gloaming. One at a time, in order: each opens when the one
 * before it is done. (The engine allows several open at once: give them the same `requires`.) Read by the engine
 * (src/lib/shared/quests/engine.ts); checked by quests.test.ts.
 *
 * Every line has an id, so a voice can be added later: ids are `<quest>.<part>.<n>`, and a line
 * keeps its id when its text is changed. Add new lines at the end of a part, never in between.
 */
import type { Condition, Line, QuestDef } from '../shared/quests/types.ts';

/** Lines with ids `<prefix>.1`, `<prefix>.2`, ... */
function say(prefix: string, ...texts: string[]): Line[] {
	return texts.map((text, i) => ({ id: `${prefix}.${i + 1}`, text }));
}

function line(id: string, text: string): Line {
	return { id, text };
}

const done = (quest: string): Condition => ({ kind: 'done', quest });

/** The eight in the middle, in order: each opens once the one before it is done. */
export const MIDDLE = [
	'moved-dead',
	'by-candle',
	'walls-of-bone',
	'carters-road',
	'salt-for-carts',
	'sunken-box',
	'what-they-took',
	'carriers'
];

const LIST: QuestDef[] = [
	{
		id: 'fontaine',
		npc: 'fontaine',
		title: 'Fontaine',
		teaches: 'Basics',
		offer: say(
			'fontaine.offer',
			"You came. Good. I'm Fontaine. I pay for what comes up from under the city, and for what anyone down there can tell me about it.",
			"Start small. There's a way in at the old keepers' vault: they called it Rumors. Go down, find your feet, and come back up in one piece.",
			'Do that, and I have real work for you.'
		),
		objectives: [
			{
				kind: 'extract',
				affliction: 'rumors',
				text: line('fontaine.obj.1', 'Go down into Rumors and get back out')
			}
		],
		commit: [],
		page: say(
			'fontaine.page',
			"The keepers' vault is sound, and the new hire came back with all their fingers. Worth keeping on.",
			"I've given them my father's powder flask. For emergencies, I said. They'll find out what kind."
		),
		reward: { coins: 50, items: [{ item: 'powder-flask', count: 1 }] }
	},
	{
		id: 'moved-dead',
		npc: 'fontaine',
		title: 'The Moved Dead',
		teaches: 'Rummaging',
		requires: done('fontaine'),
		offer: say(
			'moved-dead.offer',
			'The Gloaming is what the quarrymen call the old galleries now. They say the light goes wrong down there at dusk.',
			'Search it. Every niche, every coffer, every pile of rags. And bring me a rosary: the bone kind. I want to know whose dead these are.'
		),
		objectives: [
			{
				kind: 'loot',
				affliction: 'gloaming',
				count: 8,
				text: line('moved-dead.obj.1', 'Search lootables in the Gloaming')
			}
		],
		commit: [{ item: 'rosary', count: 1 }],
		page: say(
			'moved-dead.page',
			'The rosary is a parish piece, cut and strung the way they did it two hundred years ago.',
			'The beads are stamped by a dozen different parishes. Nobody was ever buried down there. These dead were brought.'
		),
		reward: { coins: 80, xp: 60 }
	},
	{
		id: 'by-candle',
		npc: 'fontaine',
		title: 'By Candle, Never Torch',
		teaches: 'Crafting',
		requires: done('moved-dead'),
		offer: say(
			'by-candle.offer',
			'The old accounts all say the same thing: they went down by candle, never by torch. Torches were for workmen.',
			'Make candles below, with your kit, the way they would have. Five of them. Bring them to me unlit.'
		),
		objectives: [
			{
				kind: 'craft',
				recipe: 'candle',
				count: 5,
				text: line('by-candle.obj.1', 'Make candles below with the field kit')
			}
		],
		commit: [{ item: 'candle', count: 5 }],
		page: say(
			'by-candle.page',
			'Five candles, made in the dark. The wax down there is old church wax: someone stocked those galleries.',
			'The processions went by candlelight, every one of them. And one man walked at the front of every procession, carrying a lantern. The accounts only call him the Lamplighter.'
		),
		reward: { coins: 80, xp: 60 }
	},
	{
		id: 'walls-of-bone',
		npc: 'fontaine',
		title: 'The Walls of Bone',
		teaches: 'Room tasks',
		requires: done('by-candle'),
		offer: say(
			'walls-of-bone.offer',
			"The great walls in the Ossuary Hall weren't heaped. They were built, skull by skull, by someone who knew what he was doing.",
			"There's writing cut into one of them. Take a rubbing of it. It'll take a while, and the paper is loud on the bone. Have someone watch your back."
		),
		objectives: [
			{
				kind: 'task',
				task: 'oath-rubbing',
				text: line('walls-of-bone.obj.1', 'Take a rubbing of the oath in the Ossuary Hall')
			}
		],
		commit: [{ item: 'oath-rubbing', count: 1 }],
		page: say(
			'walls-of-bone.page',
			'The rubbing is an oath, sworn on a hand: "None of the dead shall lie in the dark while I carry light."',
			'Every bone in those walls was set by the same hands. The man who swore it built them.'
		),
		reward: { coins: 120, xp: 80 }
	},
	{
		id: 'carters-road',
		npc: 'fontaine',
		title: "The Carters' Road",
		teaches: 'Going deeper',
		requires: done('walls-of-bone'),
		offer: say(
			'carters-road.offer',
			"Someone drove the death carts. Below the first stair there's a gallery with a bell hung over the old cart road.",
			'Get down there and ring it. It will bring everything that hears it, so be quick. And bring me a signet if you find one: the carters were paid in rings.'
		),
		objectives: [
			{
				kind: 'reach',
				affliction: 'gloaming',
				level: 2,
				text: line('carters-road.obj.1', 'Go down to the second level of the Gloaming')
			},
			{
				kind: 'task',
				task: 'carters-bell',
				text: line('carters-road.obj.2', "Ring the carters' bell in the Quarry Gallery")
			}
		],
		commit: [{ item: 'signet', count: 1 }],
		page: say(
			'carters-road.page',
			'The bell called the carts in. The men who drove them called themselves the Night Carters.',
			'When the transfers ended they knew the quarries better than anyone alive, and they turned smugglers. That signet is one of theirs.'
		),
		reward: { coins: 150, xp: 100 }
	},
	{
		id: 'salt-for-carts',
		npc: 'fontaine',
		title: 'Salt for the Carts',
		teaches: 'Crafting',
		requires: done('carters-road'),
		offer: say(
			'salt-for-carts.offer',
			'The carts were salted every night before they went down, and a priest blessed the salt.',
			'Bless some of your own below: rock salt and holy water, with your kit. Make two. Use one if you need it, and bring me the other.'
		),
		objectives: [
			{
				kind: 'craft',
				recipe: 'blessed-salt',
				count: 2,
				text: line('salt-for-carts.obj.1', 'Make blessed salt below with the field kit')
			}
		],
		commit: [{ item: 'blessed-salt', count: 1 }],
		page: say(
			'salt-for-carts.page',
			'The salt was blessed by the priest who led the processions. His name is in the parish register at last: Father Lenoir.',
			'He asked to be buried under the altar of the chapel at the bottom of the quarries, with his dead. They let him.'
		),
		reward: { coins: 120, xp: 80 }
	},
	{
		id: 'sunken-box',
		npc: 'fontaine',
		title: 'The Sunken Box',
		teaches: 'Room tasks',
		requires: done('salt-for-carts'),
		offer: say(
			'sunken-box.offer',
			'Smugglers keep books. The quarrymen say the Carters sank a strongbox in the Cistern, on a chain, where no customs man would wade.',
			"The winch is still there. Haul it up. It's slow, and it screams. Bring me whatever is inside."
		),
		objectives: [
			{
				kind: 'task',
				task: 'cistern-winch',
				text: line('sunken-box.obj.1', 'Haul up the strongbox in the Cistern')
			}
		],
		commit: [{ item: 'carters-ledger', count: 1 }],
		page: say(
			'sunken-box.page',
			"The ledger is the Carters' own. Brandy, tobacco, lace. And one entry that isn't goods: \"Lenoir's tomb. A hand.\"",
			"They robbed him. Some of them never got out again: what's left of them still keeps to the galleries. The quarrymen call them dwellers."
		),
		reward: { coins: 150, xp: 100 }
	},
	{
		id: 'what-they-took',
		npc: 'fontaine',
		title: 'What They Took',
		teaches: 'Crafting, going deeper',
		requires: done('sunken-box'),
		offer: say(
			'what-they-took.offer',
			"After the robbery the parish barred the stair to the lowest level, from the far side. It won't open for you.",
			"So blow it. The quarrymen's way: my father's powder flask, a string of firecrackers, lamp oil and twine, packed together below with your kit. Set it on the door and get well back.",
			"Past the stair there's a crypt of saints, and in it a niche the Carters bricked up. Break it open and bring me what's inside."
		),
		objectives: [
			{
				kind: 'craft',
				recipe: 'quarrymans-charge',
				count: 1,
				text: line('what-they-took.obj.1', "Make a quarryman's charge below")
			},
			{
				kind: 'reach',
				affliction: 'gloaming',
				level: 3,
				text: line('what-they-took.obj.2', 'Blow the barred stair and go down to the lowest level')
			},
			{
				kind: 'task',
				task: 'bricked-niche',
				text: line('what-they-took.obj.3', "Break open the bricked niche in the Saints' Crypt")
			}
		],
		commit: [{ item: 'hand-of-glory', count: 1 }],
		page: say(
			'what-they-took.page',
			"It's his hand. They cut it off and made it a thieves' candle: a Hand of Glory, that keeps sleepers from waking while you rob them.",
			'His oath was sworn on that hand. With it gone, nothing keeps him to his rest.'
		),
		reward: { coins: 250, xp: 150 },
		teachesRecipes: ['quarrymans-charge']
	},
	{
		id: 'carriers',
		npc: 'fontaine',
		title: 'The Carriers',
		teaches: 'Combat',
		requires: done('what-they-took'),
		offer: say(
			'carriers.offer',
			"Something hunts in the Gloaming. The ones who've seen it close won't say what.",
			'Put one down. Then tell me what it was.'
		),
		objectives: [
			{
				kind: 'kill',
				creature: 'witch',
				count: 1,
				text: line('carriers.obj.1', 'Put down one of the things that hunt')
			}
		],
		commit: [],
		page: say(
			'carriers.page',
			'They walk bent, as if under a weight. They are carrying something that is no longer there.',
			'They are the procession. Every dusk it walks again, and Lenoir walks at the front of it.'
		),
		reward: { coins: 150, xp: 120 }
	},
	{
		id: 'last-procession',
		npc: 'fontaine',
		title: 'The Last Procession',
		teaches: 'Everything',
		requires: done('carriers'),
		offer: say(
			'last-procession.offer',
			'Here it is, then, all of it. Two hundred years ago the dead were carried into the quarries by night, and Father Lenoir lit their way.',
			'He swore on his hand that none of them would lie in the dark. The Night Carters robbed his tomb and took the hand, and his oath went with it. So he rose, and every dusk he leads the procession again, taking every light he finds, because the dead need it.',
			"Go down to his chapel. Begin the rite at the altar, and he'll come. Put him down. He'll leave his lantern: carry it to his tomb under the altar and lay it there. Then he can rest."
		),
		objectives: [
			{
				kind: 'resolve',
				affliction: 'gloaming',
				text: line('last-procession.obj.1', 'Put Lenoir down and lay his lantern in his tomb')
			}
		],
		commit: [],
		page: say(
			'last-procession.page',
			'The lantern is out, and laid where it belongs. The quarrymen say the light goes right at dusk now.',
			'Father Lenoir is at rest. I have his oath, his hand and his story. I owe the ones who went down more than I can pay.'
		),
		reward: { coins: 1000, xp: 500 }
	}
];

export const QUESTS: Record<string, QuestDef> = Object.fromEntries(LIST.map((q) => [q.id, q]));

/** Every quest's id, in the order listed. */
export const QUEST_ORDER: string[] = LIST.map((q) => q.id);

/** The quest whose rite it is: open, the rite can be begun; its `resolve` objective finishes it. */
export const RITE_QUEST: Record<string, string> = { gloaming: 'last-procession' };
