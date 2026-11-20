import type { ConditionId } from './player/conditions.ts';

/**
 * The tarot deck's cards (docs/dev/items.md#tarot): carried down, a deck draws one at the start
 * of the run, a small blessing or curse, and says which. Each card's effect is made of things the
 * game already has: a share of the lamp's charge, sanity, a condition, the Affliction's meter.
 */
export interface TarotCard {
	id: string;
	name: string;
	/** What it did, for the alert. */
	line: string;
	blessing: boolean;
	effect: {
		/** Share of the headlamp's charge given (or taken). */
		battery?: number;
		sanity?: number;
		condition?: { id: ConditionId; seconds: number };
		/** The Affliction's meter fed (0..1). */
		meter?: number;
	};
}

export const TAROT: TarotCard[] = [
	{
		id: 'sun',
		name: 'The Sun',
		line: 'Your lamp burns a little brighter.',
		blessing: true,
		effect: { battery: 0.25 }
	},
	{
		id: 'star',
		name: 'The Star',
		line: 'A calm comes over you. For a while, the dark is only dark.',
		blessing: true,
		effect: { condition: { id: 'laudanum', seconds: 30 } }
	},
	{
		id: 'hermit',
		name: 'The Hermit',
		line: 'You go down unnoticed.',
		blessing: true,
		effect: { condition: { id: 'buried', seconds: 20 } }
	},
	{
		id: 'moon',
		name: 'The Moon',
		line: 'Your lamp dims. It was fuller when you came down.',
		blessing: false,
		effect: { battery: -0.25 }
	},
	{
		id: 'tower',
		name: 'The Tower',
		line: 'You turn your ankle on the first step.',
		blessing: false,
		effect: { condition: { id: 'hobble', seconds: 10 } }
	},
	{
		id: 'hanged-man',
		name: 'The Hanged Man',
		line: 'Something is wrong. You feel it in your chest.',
		blessing: false,
		effect: { sanity: -15 }
	},
	{
		id: 'death',
		name: 'Death',
		line: 'Something down there knows you are coming.',
		blessing: false,
		effect: { meter: 0.03 }
	}
];
