import { describe, expect, it } from 'vitest';
import { SHOP, forSale } from '../../content/economy.ts';
import { ITEMS } from '../../content/items.ts';
import { PENDING_ITEMS } from '../../content/lootables.ts';
import { SIM_RATE } from '../constants.ts';
import { carriesAll, riteCount, takeForRite } from '../affliction/rite.ts';
import { aimSway, calmed, hasCondition, unseen } from '../player/conditions.ts';
import { createPlayerState, idleFrame } from '../player/simulate.ts';
import { HAND, type InputFrame, type PlayerState, type SimEvent } from '../player/types.ts';
import { wreck } from './durability.ts';
import { climbFactor, crawlFactor, hasCompass, sprintFactor, stepLoudness } from './gear.ts';
import { addItem, carriedCount, emptyInventory, newStack } from './inventory.ts';
import { firstKey } from './lootables.ts';
import { EQUIP_TIME, stepWeapon } from './weapons.ts';

/** The round's items (docs/handoff-gear-crafting-loot.md): their data and what they do. */

const DT = 1 / SIM_RATE;
const steps = (seconds: number) => Math.ceil(seconds * SIM_RATE);

function holding(item: string, ...carried: [string, number][]): PlayerState {
	const inv = emptyInventory();
	addItem(inv, newStack(item, 1));
	for (const [id, count] of carried) addItem(inv, newStack(id, count));
	const s = createPlayerState([0, 0, 0], 0, inv);
	// Quick-use things are taken in the hand from their slot.
	const quick = ITEMS[item]?.category === 'quick';
	run(s, quick ? { select: HAND.quick } : {}, steps(EQUIP_TIME) + 1);
	return s;
}

function run(s: PlayerState, input: Partial<InputFrame>, frames: number): SimEvent[] {
	const events: SimEvent[] = [];
	for (let i = 0; i < frames; i++)
		stepWeapon(
			s,
			{ ...idleFrame(i, s), select: s.inventory.selected, ...input },
			DT,
			true,
			1.6,
			events
		);
	return events;
}

/** Every item the handoff names, by the id it has in the game. */
const NAMED = [
	// Materials
	'rags',
	'twine',
	'wax',
	'nails',
	'wood',
	'metal',
	'leather',
	'rubber',
	'rope-length',
	'glass-bottle',
	'lamp-oil',
	'rock-salt',
	'holy-water',
	'bone',
	'gun-oil',
	'gun-parts',
	// Melee
	'knife',
	'crowbar',
	'brick',
	'hatchet',
	'trench-spade',
	'short-spear',
	'nail-club',
	'pickaxe',
	'sledgehammer',
	'throwing-knives',
	// Ranged and ammo
	'revolver',
	'shotgun',
	'rifle',
	'derringer',
	'crossbow',
	'slingshot',
	'oil-bottle',
	'ammo.revolver',
	'ammo.shotgun',
	'ammo.rifle',
	'bolts',
	'pebbles',
	// Defense and gear
	'coat',
	'jerkin',
	'crafting-kit',
	'kneepads',
	'overshoes',
	'gloves',
	'compass',
	// Quick use and backpack
	'bandage',
	'medkit',
	'salts',
	'laudanum',
	'battery',
	'glow-sticks',
	'chalk',
	'rope-pack',
	'rope-bundle',
	'pitons',
	'lockpicks',
	'snare',
	'tripwire-bell',
	'blessed-salt',
	'firecrackers',
	'bait',
	'grave-dirt',
	'censer',
	'whistle',
	'notebook',
	'candle',
	// Rite and quest
	'pendant',
	'key',
	'clue',
	// Treasure
	'coins',
	'rosary',
	'tooth',
	'signet',
	'silver-snuffbox',
	'jet-rosary',
	'candlestick',
	'cameo-brooch',
	'funeral-coin',
	'apothecary-jar',
	'medal',
	'tarot',
	'garnet',
	'black-candle',
	'chalice',
	'key-ring',
	'saints-icon',
	'ledger',
	'astrolabe',
	'doll',
	'relic',
	'crozier-head',
	'sealed-reliquary-jar'
];

describe('the item list', () => {
	it('has every item the handoff names, and nothing it does not', () => {
		const game = Object.keys(ITEMS).filter((id) => !id.startsWith('test.'));
		expect(game.filter((id) => !NAMED.includes(id))).toEqual([]);
		expect(NAMED.filter((id) => !ITEMS[id])).toEqual([]);
		// The recipe fragment waits for the Workshop's discovery.
		expect([...PENDING_ITEMS]).toEqual(['recipe-fragment']);
	});

	it('the store sells what the handoff says, tier by tier, and none of what is never sold', () => {
		const tier = (t: string) =>
			SHOP.filter((e) => e.tier === t)
				.map((e) => e.item)
				.sort();
		expect(tier('start')).toEqual(
			[
				'crowbar',
				'revolver',
				'ammo.revolver',
				'coat',
				'bandage',
				'salts',
				'battery',
				'chalk',
				'candle',
				'rope-pack',
				'notebook',
				'whistle',
				'glow-sticks',
				'bait',
				'crafting-kit'
			].sort()
		);
		expect(tier('trusted')).toEqual(
			[
				'shotgun',
				'ammo.shotgun',
				'trench-spade',
				'medkit',
				'lockpicks',
				'firecrackers',
				'compass',
				'gun-oil'
			].sort()
		);
		expect(tier('gloaming')).toEqual(
			['derringer', 'kneepads', 'overshoes', 'gloves', 'pitons', 'laudanum'].sort()
		);
		expect(tier('valued')).toEqual(
			['rifle', 'ammo.rifle', 'pickaxe', 'sledgehammer', 'jerkin', 'censer'].sort()
		);
		for (const never of ['knife', 'hatchet', 'crossbow', 'slingshot', 'snare', 'blessed-salt']) {
			expect(
				SHOP.some((e) => e.item === never),
				never
			).toBe(false);
		}
		// Only the start tier is open until trust and Afflictions open the rest.
		expect(forSale().every((e) => e.tier === 'start')).toBe(true);
	});

	it('everything has a worth, and the prices the handoff gives', () => {
		for (const def of Object.values(ITEMS)) {
			if (def.quest || def.kind === 'clue' || def.id === 'key') continue;
			expect(def.price !== undefined || def.value !== undefined, def.id).toBe(true);
		}
		expect(ITEMS.medkit.price).toBe(60);
		expect(ITEMS.chalice.value).toBe(300);
		expect(ITEMS.relic.value).toBe(800);
		expect(ITEMS.knife.price! * 0.4).toBe(2);
		expect(ITEMS.crossbow.price! * 0.4).toBe(20);
	});
});

describe('guns', () => {
	it('a rifle loads one round at a time, and carries on until it is full', () => {
		const s = holding('rifle', ['ammo.rifle', 3]);
		run(s, { reload: true }, 1);
		run(s, {}, steps(ITEMS.rifle.firearm!.reloadTime) + 1);
		expect(s.inventory.equipment.primary?.loaded).toBe(1);
		run(s, {}, steps(ITEMS.rifle.firearm!.reloadTime * 2) + 2);
		expect(s.inventory.equipment.primary?.loaded).toBe(3);
		expect(carriedCount(s.inventory, 'ammo.rifle')).toBe(0);
	});

	it('a slingshot with no pebbles fires old coins, and says so', () => {
		const s = holding('slingshot', ['coins', 4]);
		run(s, { reload: true }, 1);
		run(s, {}, steps(ITEMS.slingshot.firearm!.reloadTime) + 1);
		const sling = s.inventory.equipment.primary!;
		expect(sling.loaded).toBe(1);
		expect(sling.ammo).toBe('coins');
		const shot = run(s, { attack: true }, 1).find((e) => e.kind === 'shot');
		expect(shot && shot.kind === 'shot' && shot.round).toBe('coins');
		expect(sling.ammo).toBeUndefined();
	});
});

describe('things taken', () => {
	it('laudanum, held, is taken standing still: calm, a sway, and it is gone', () => {
		const s = holding('laudanum');
		const events = run(s, { attack: true }, steps(ITEMS.laudanum.dose!.seconds) + 3);
		expect(events.some((e) => e.kind === 'dose')).toBe(true);
		expect(hasCondition(s, 'laudanum')).toBe(true);
		expect(calmed(s)).toBe(true);
		expect(aimSway(s).some((v) => v !== 0)).toBe(true);
		expect(carriedCount(s.inventory, 'laudanum')).toBe(0);
	});

	it('moving or letting go stops it', () => {
		const s = holding('grave-dirt');
		run(s, { attack: true }, 3);
		run(s, { attack: true, moveZ: 1 }, steps(2));
		expect(unseen(s)).toBe(false);
		expect(carriedCount(s.inventory, 'grave-dirt')).toBe(1);
	});

	it('grave dirt hides you from what hunts you', () => {
		const s = holding('grave-dirt');
		run(s, { attack: true }, steps(ITEMS['grave-dirt'].dose!.seconds) + 3);
		expect(unseen(s)).toBe(true);
	});

	it('a whistle is blown at once', () => {
		const s = holding('whistle');
		expect(run(s, { attack: true }, 1).map((e) => e.kind)).toContain('whistle');
	});
});

describe('worn things', () => {
	function wearing(...items: string[]): PlayerState {
		const inv = emptyInventory();
		items.forEach((item, i) => {
			if (ITEMS[item]?.category === 'defense') inv.equipment.defense = newStack(item);
			else inv.equipment[(['gear1', 'gear2', 'gear3'] as const)[i]] = newStack(item);
		});
		return createPlayerState([0, 0, 0], 0, inv);
	}

	it('kneepads quicken and quieten a crawl; overshoes quieten steps; gloves quicken a climb', () => {
		const s = wearing('kneepads', 'overshoes', 'gloves');
		expect(crawlFactor(s.inventory)).toBe(1.25);
		expect(stepLoudness(s.inventory, true)).toBe(0.5);
		expect(stepLoudness(s.inventory, false)).toBe(0.6);
		expect(climbFactor(s.inventory)).toBe(1.15);
	});

	it('a jerkin slows a sprint; a compass gives a bearing', () => {
		const s = wearing('jerkin', 'compass');
		expect(sprintFactor(s.inventory)).toBe(0.95);
		expect(hasCompass(s.inventory)).toBe(true);
	});

	it('broken, they do nothing', () => {
		const s = wearing('kneepads');
		wreck(s.inventory.equipment.gear1!);
		expect(crawlFactor(s.inventory)).toBe(1);
	});
});

describe('treasure with a use', () => {
	it('the black candle counts as all five rite candles, and goes only when it must', () => {
		const inv = emptyInventory();
		addItem(inv, newStack('black-candle'));
		expect(riteCount(inv, 'candle')).toBe(5);
		expect(carriesAll(inv, [{ item: 'candle', count: 5 }])).toBe(true);
		addItem(inv, newStack('candle', 2));
		takeForRite(inv, 'candle', 2);
		expect(carriedCount(inv, 'black-candle')).toBe(1);
		takeForRite(inv, 'candle', 5);
		expect(carriedCount(inv, 'black-candle')).toBe(0);
	});

	it('a lock takes an iron key before the custodian’s key ring', () => {
		const inv = emptyInventory();
		addItem(inv, newStack('key-ring'));
		expect(firstKey(inv)?.item).toBe('key-ring');
		addItem(inv, newStack('key'));
		expect(firstKey(inv)?.item).toBe('key');
	});
});
