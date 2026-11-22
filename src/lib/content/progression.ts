import { ATTRACTION } from './attraction.ts';
import { CREATURES } from './creatures.ts';
import { HANDS, ITEMS } from './items.ts';
import { DEFAULT_HEADLAMP } from './items/headlamps.ts';
import { LOOTABLES } from './lootables.ts';
import { SANITY } from './player/sanity.ts';
import { CRAFT } from './recipes.ts';
import type { Rarity } from './items.ts';

/**
 * Explorer progression (docs/dev/progression.md, issue #18): what explorers earn across
 * expeditions, and the skill tree they spend it on. Each lootable, recipe and creature carries its
 * own `xp`; what is here is the rest of the table, and the skills.
 */

export const LEVELS = {
	/** Experience per level, flat. */
	xpPerLevel: 1000,
	max: 60,
	/** The tree isn't shown before this level. */
	treeAt: 1
};

/** What the rest of an expedition pays (lootables, recipes and creatures carry their own). */
export const XP = {
	/** Added for the best thing found in a lootable first opened. */
	rarity: { common: 0, uncommon: 3, rare: 8, epic: 20, legendary: 50 } as Record<Rarity, number>,
	/** First time an explorer opens each kind of lootable. */
	firstLootable: 25,
	/** An item seen for the first time (as discovery works). */
	discovery: 25,
	/** First time each recipe is made, below or in the Workshop. */
	firstRecipe: 50,
	/** The same recipe made below more often than this in a run pays nothing. */
	recipeRepeats: 2,
	/** First kill of each kind of creature. */
	firstKill: 25,
	/** Teammates within `shareRange` m of a kill get this share of it. */
	killShare: 0.5,
	shareRange: 15,
	/** Banishing the manifestation, to everyone still down there. */
	banish: 200,
	/** A hint found, to everyone on the expedition, the first time each explorer learns it. */
	clue: 50,
	/** Being there when the rite is performed; the first time for each Affliction pays more. */
	rite: 150,
	firstRite: 250,
	/** Getting out, by the deepest level reached (first level first; deeper counts as the last). */
	extract: [100, 200, 300],
	/** Dying (or running out of time) pays this share of getting out. */
	died: 0.25,
	/** The first time out after reaching each level. */
	firstExtract: 100
};

/** Coin to put every point back. */
export const RESPEC_COST = 1000;

export type SkillCategory = 'nerve' | 'grit' | 'craft';

export const SKILL_CATEGORIES: { id: SkillCategory; name: string; blurb: string }[] = [
	{ id: 'nerve', name: 'Nerve', blurb: 'The dark and the mind' },
	{ id: 'grit', name: 'Grit', blurb: 'The fight and the body' },
	{ id: 'craft', name: 'Craft', blurb: 'The hands and the route' }
];

/**
 * What a skill changes: each is a multiplier on a game value (1 does nothing), except `scrounge`,
 * a chance. They are carried on `PlayerState.mods` (src/lib/shared/progression/modifiers.ts).
 */
export type ModifierKey =
	| 'batteryDrain'
	| 'darkDrain'
	| 'moveNoise'
	| 'darkSpotted'
	| 'melee'
	| 'spread'
	| 'blowSanity'
	| 'healTime'
	| 'craftTime'
	| 'craftNoise'
	| 'wear'
	| 'openTime'
	| 'openNoise'
	| 'scrounge';

/** What the tooltip knows about the explorer: what they hold (their primary weapon). */
export interface SkillContext {
	weapon?: string | null;
}

export interface SkillDef {
	id: string;
	category: SkillCategory;
	name: string;
	/** A glyph for its icon. */
	icon: string;
	/** The bonus at rank 1, 2 and 3, as a fraction (0.15 is 15%). */
	ranks: [number, number, number];
	/**
	 * How the bonus works on each value: `less` takes it off (×(1 - bonus)), `more` adds it
	 * (×(1 + bonus)), `chance` is the bonus itself.
	 */
	effects: { key: ModifierKey; how: 'less' | 'more' | 'chance' }[];
	/** One line: what it does, with the bonus (`{n}` is the rank's percent). */
	summary: string;
	/** What it comes to at a bonus (0 for none), worked out from the game data. */
	detail: (bonus: number, context: SkillContext) => string;
}

const less = (value: number, bonus: number): number => value * (1 - bonus);
const more = (value: number, bonus: number): number => value * (1 + bonus);

/** 900 s as "15:00". */
export function clock(seconds: number): string {
	const s = Math.round(seconds);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Up to two decimals, trailing zeros dropped: 0.425 as "0.43", 3 as "3". */
function num(value: number, places = 2): string {
	// Halves round up (2.45 m reads 2.5), past the float error that makes 3.5 * 0.7 2.4499...
	const scale = 10 ** places;
	return String(Math.round(value * scale + 1e-6) / scale);
}

const lowDrain = DEFAULT_HEADLAMP.modes[1]?.drain ?? 1 / 900;
const brightDrain = DEFAULT_HEADLAMP.modes[2]?.drain ?? 1 / 300;
const WITCH = CREATURES.witch;

/** The melee weapon to show: the one held if it is one, else the fists. */
function meleeOf(context: SkillContext): { name: string; damage: number } {
	const def = context.weapon ? ITEMS[context.weapon] : undefined;
	if (def?.melee) return { name: def.name, damage: def.melee.damage };
	return { name: 'A punch', damage: HANDS.melee?.damage ?? 8 };
}

/** The gun to show: the one held, or the revolver. */
function gunOf(context: SkillContext): { name: string; hip: number; aimed: number } {
	const held = context.weapon ? ITEMS[context.weapon]?.firearm : undefined;
	const def = held ? ITEMS[context.weapon as string] : ITEMS.revolver;
	const spread = def?.firearm?.spread ?? { hip: 0, aimed: 0 };
	return { name: def?.name ?? 'A gun', ...spread };
}

/** Radians as degrees, one place. */
const degrees = (radians: number): string => `${num((radians * 180) / Math.PI, 1)}°`;

const pry = LOOTABLES.crate.sealed?.open.find((w) => w.tool === 'pry');
const pick = LOOTABLES.trunk.sealed?.open.find((w) => w.tool === 'picks');

export const SKILLS: SkillDef[] = [
	{
		id: 'lamplighter',
		category: 'nerve',
		name: 'Lamplighter',
		icon: '☀',
		ranks: [0.1, 0.2, 0.3],
		effects: [{ key: 'batteryDrain', how: 'less' }],
		summary: 'The headlamp drains {n} slower.',
		detail: (b) =>
			`Low beam lasts ${clock(1 / less(lowDrain, b))}; bright lasts ${clock(1 / less(brightDrain, b))}.`
	},
	{
		id: 'used-to-the-dark',
		category: 'nerve',
		name: 'Used to the Dark',
		icon: '☾',
		ranks: [0.15, 0.3, 0.45],
		effects: [{ key: 'darkDrain', how: 'less' }],
		summary: 'Darkness drains sanity {n} slower.',
		detail: (b) => {
			const drain = less(SANITY.darknessDrain, b);
			return `${num(drain)} a second; from full, the dark takes you down in ${clock(SANITY.max / drain)}.`;
		}
	},
	{
		id: 'soft-step',
		category: 'nerve',
		name: 'Soft Step',
		icon: '∴',
		ranks: [0.15, 0.25, 0.35],
		effects: [{ key: 'moveNoise', how: 'less' }],
		summary: 'Moving adds {n} less to the noise that draws her.',
		detail: (b) =>
			`Walking +${num(less(ATTRACTION.noise.move.walk, b))}; sprinting +${num(less(ATTRACTION.noise.move.sprint, b))} a second.`
	},
	{
		id: 'still-as-stone',
		category: 'nerve',
		name: 'Still as Stone',
		icon: '◆',
		ranks: [0.15, 0.3, 0.45],
		effects: [{ key: 'darkSpotted', how: 'less' }],
		summary: 'Creatures have to come {n} closer to spot you in the dark.',
		detail: (b) => `A witch spots you at ${num(less(WITCH.perception.agro.darkRange, b), 1)} m.`
	},
	{
		id: 'heavy-hand',
		category: 'grit',
		name: 'Heavy Hand',
		icon: '✊',
		ranks: [0.15, 0.3, 0.45],
		effects: [{ key: 'melee', how: 'more' }],
		summary: 'Melee hits deal {n} more damage, bare-handed or with a weapon.',
		detail: (b, context) => {
			const { name, damage } = meleeOf(context);
			return `${name} deals ${Math.round(more(damage, b))}.`;
		}
	},
	{
		id: 'steady-aim',
		category: 'grit',
		name: 'Steady Aim',
		icon: '⌖',
		ranks: [0.15, 0.3, 0.45],
		effects: [{ key: 'spread', how: 'less' }],
		summary: 'Firearms are {n} steadier.',
		detail: (b, context) => {
			const gun = gunOf(context);
			return `${gun.name}: ${degrees(less(gun.hip, b))} from the hip, ${degrees(less(gun.aimed, b))} aimed.`;
		}
	},
	{
		id: 'thick-skin',
		category: 'grit',
		name: 'Thick Skin',
		icon: '⛨',
		ranks: [0.05, 0.1, 0.15],
		effects: [{ key: 'blowSanity', how: 'less' }],
		summary: 'Blows take {n} less sanity.',
		detail: (b) => `A witch's blow takes ${num(less(WITCH.attack.damage, b), 1)}.`
	},
	{
		id: 'field-dressing',
		category: 'grit',
		name: 'Field Dressing',
		icon: '✚',
		ranks: [0.15, 0.3, 0.45],
		effects: [{ key: 'healTime', how: 'less' }],
		summary: 'Healing is {n} faster: bandages, medkits and tending a teammate.',
		detail: (b) => {
			const bandage = ITEMS.bandage?.heal?.seconds ?? 3;
			const medkit = ITEMS.medkit?.heal?.seconds ?? 5;
			return `A bandage takes ${num(less(bandage, b), 1)} s; a medkit ${num(less(medkit, b), 1)} s.`;
		}
	},
	{
		id: 'tinker',
		category: 'craft',
		name: 'Tinker',
		icon: '⚒',
		ranks: [0.15, 0.3, 0.45],
		effects: [
			{ key: 'craftTime', how: 'less' },
			{ key: 'craftNoise', how: 'less' }
		],
		summary: 'Field crafting is {n} faster and quieter.',
		detail: (b) =>
			`Kneeling ${num(less(CRAFT.field.seconds, b), 1)} s; heard ${num(less(CRAFT.field.noise, b), 1)} m away.`
	},
	{
		id: 'careful-hands',
		category: 'craft',
		name: 'Careful Hands',
		icon: '✋',
		ranks: [0.1, 0.2, 0.3],
		effects: [{ key: 'wear', how: 'less' }],
		summary: 'Gear wears {n} slower.',
		detail: (b, context) => {
			const def =
				(context.weapon && ITEMS[context.weapon]?.durability ? ITEMS[context.weapon] : null) ??
				ITEMS.knife;
			const max = def?.durability?.max ?? 50;
			const unit = def?.durability?.per ?? 'use';
			return `${def?.name ?? 'An item'} lasts ${Math.floor(max / (1 - b))} ${unit}s.`;
		}
	},
	{
		id: 'light-fingers',
		category: 'craft',
		name: 'Light Fingers',
		icon: '⚷',
		ranks: [0.15, 0.3, 0.45],
		effects: [
			{ key: 'openTime', how: 'less' },
			{ key: 'openNoise', how: 'less' }
		],
		summary: 'Lootables open {n} faster and quieter.',
		detail: (b) =>
			`Prying a jammed crate ${num(less(pry?.seconds ?? 10, b), 1)} s, heard ${num(less(pry?.noise ?? 10, b), 1)} m; picking a trunk ${num(less(pick?.seconds ?? 6, b), 1)} s.`
	},
	{
		id: 'scrounger',
		category: 'craft',
		name: 'Scrounger',
		icon: '✦',
		ranks: [0.1, 0.2, 0.3],
		effects: [{ key: 'scrounge', how: 'chance' }],
		summary: '{n} chance of one extra material from a lootable you open first.',
		detail: (b) => `${Math.round(b * 100)} in 100 lootables give one more material.`
	}
];

export const SKILL_IDS = new Set(SKILLS.map((s) => s.id));
