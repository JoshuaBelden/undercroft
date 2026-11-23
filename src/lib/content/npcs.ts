/**
 * The people on the surface (docs/dev/quests.md#npcs): who they are, the quests they give, and
 * what they sell. They never go down. Shown on the Contacts page.
 */
import type { NpcDef } from '../shared/quests/types.ts';

const LIST: NpcDef[] = [
	{
		id: 'fontaine',
		name: 'Fontaine',
		role: 'Dr. Margaux Fontaine: archaeologist, historian, and student of things that should stay buried',
		portrait: 'npc-margaux-fontaine',
		greeting: [],
		// One of her four greetings, no more than once every three and a half minutes.
		voice: { sound: 'fontaine.greeting', every: 210 },
		quests: [
			'fontaine',
			'moved-dead',
			'by-candle',
			'walls-of-bone',
			'carters-road',
			'salt-for-carts',
			'sunken-box',
			'what-they-took',
			'carriers',
			'last-procession'
		],
		sells: [
			{
				// More of her father's powder, once she has asked for the stair to be blown.
				item: 'powder-flask',
				price: 120,
				when: {
					kind: 'any',
					of: [
						{ kind: 'open', quest: 'what-they-took' },
						{ kind: 'done', quest: 'what-they-took' }
					]
				}
			}
		]
	}
];

export const NPCS: Record<string, NpcDef> = Object.fromEntries(LIST.map((n) => [n.id, n]));

export const NPC_ORDER: string[] = LIST.map((n) => n.id);
