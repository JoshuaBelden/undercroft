import { describe, expect, it } from 'vitest';
import { AFFLICTIONS, type RiteSpec } from '../src/lib/content/afflictions.ts';
import { MAP_KIT } from '../src/lib/content/map/kit.ts';
import { addItem, emptyInventory, newStack } from '../src/lib/shared/items/inventory.ts';
import { PIECES } from '../src/lib/shared/map/pieces.generated.ts';
import { roomPoints } from '../src/lib/shared/map/points.ts';
import { createPlayerState } from '../src/lib/shared/player/simulate.ts';
import { Crates } from './crates.ts';
import { WorldItems } from './items.ts';
import { RiteDirector, scatterRite } from './rite.ts';
import { mapFixture } from './testing/harness.ts';

const SPEC = AFFLICTIONS.gloaming.rite;
const map = mapFixture(1);

/** The map's items and crates, then the rite scattered into them. */
function scatter(spec: RiteSpec, withheld: string[] = [], crates = map.layout.crates) {
	const items = new WorldItems(map.world);
	const store = new Crates(map.world, crates, map.nav, map.start, map.seed);
	scatterRite(spec, { ...map, pieces: PIECES, kit: MAP_KIT }, items, store, new Set(withheld));
	const inCrates = (item: string) =>
		store
			.list()
			.flatMap(({ crate }) => crate.slots)
			.filter((s) => s?.item === item).length;
	const onFloor = (item: string) => items.snapshots().filter((i) => i.item === item);
	return { items, store, inCrates, onFloor };
}

describe('RiteDirector', () => {
	it('each hint found reveals what the next one names, and the last reveals everything', () => {
		const rite = new RiteDirector(SPEC, map.layout, PIECES);
		expect(rite.snapshot().requirements.every((r) => r === null)).toBe(true);
		const first = rite.find()!;
		expect(first.text).toBe(SPEC.clues[0].text);
		expect(first.requirements).toEqual([SPEC.clues[0].reveals]);
		for (let i = 1; i < SPEC.clues.length; i++) rite.find();
		expect(rite.complete).toBe(true);
		expect(rite.roomKnown).toBe(true);
		expect(rite.find()).toBeNull();
		expect(rite.snapshot().room).toBe(SPEC.room);
		rite.reset();
		expect(rite.clues).toBe(0);
		rite.reveal(2.7);
		expect(rite.clues).toBe(2);
		rite.reveal(99);
		expect(rite.clues).toBe(SPEC.clues.length);
	});

	it('can be performed only in its room, knowing it, with everything it needs', () => {
		const rite = new RiteDirector(SPEC, map.layout, PIECES);
		const room = roomPoints(map.layout, PIECES, MAP_KIT).find((r) => r.name === SPEC.room)!;
		const inv = emptyInventory();
		for (const { item, count } of SPEC.requirements) addItem(inv, newStack(item, count));
		const holder = createPlayerState(room.position, 0, inv);
		expect(rite.inRoom(holder.position)).toBe(true);
		expect(rite.inRoom(map.start)).toBe(false);
		expect(rite.canPerform(holder)).toBe(false);
		rite.reveal(SPEC.clues.length);
		expect(rite.canPerform(holder)).toBe(true);
		expect(rite.canPerform(createPlayerState(room.position, 0))).toBe(false);
		rite.take(holder);
		expect(holder.inventory.backpack.every((s) => s === null)).toBe(true);
		rite.resolved = true;
		expect(rite.canPerform(holder)).toBe(false);
	});
});

describe('scatterRite', () => {
	it('puts the crate item in a crate and every hint copy somewhere off the floor', () => {
		const { inCrates, onFloor } = scatter(SPEC);
		expect(inCrates('pendant')).toBe(1);
		const copies = SPEC.clues.length * SPEC.clueCopies;
		const hung = onFloor('clue');
		expect(inCrates('clue') + hung.length).toBe(copies);
	});

	it('leaves out a withheld quest item', () => {
		expect(scatter(SPEC, ['pendant']).inCrates('pendant')).toBe(0);
	});

	it('puts a room item in a major room, and a crate item on a floor when there are no crates', () => {
		const spec: RiteSpec = {
			...SPEC,
			requirements: [
				{ item: 'candle', count: 2, place: 'room' },
				{ item: 'pendant', count: 1, place: 'crate' }
			]
		};
		const { onFloor } = scatter(spec, [], []);
		expect(onFloor('candle')).toHaveLength(2);
		expect(onFloor('pendant')).toHaveLength(1);
	});

	it('for testing, lays it all out by the start with the hints in the nearest crate', () => {
		const { store, onFloor } = scatter({
			...SPEC,
			atStart: true,
			requirements: [...SPEC.requirements, { item: 'candle', count: 2, place: 'room' }]
		});
		const nearest = store.list().reduce((a, b) => (b.fromStart < a.fromStart ? b : a));
		expect(nearest.crate.slots.filter((s) => s?.item === 'clue').length).toBeGreaterThan(0);
		for (const candle of onFloor('candle')) {
			expect(
				Math.hypot(candle.position[0] - map.start[0], candle.position[2] - map.start[2])
			).toBeLessThan(6);
		}
	});
});

describe('Crates', () => {
	it('a full crate makes room for a placed item by losing its commonest thing', () => {
		const store = new Crates(map.world, map.layout.crates, map.nav, map.start, map.seed);
		const [{ crate }] = store.list();
		for (let i = 0; i < crate.slots.length + 2; i++) store.stowIn(crate.id, newStack('pendant'));
		expect(crate.slots.every((s) => s?.item === 'pendant')).toBe(true);
		expect(store.stowIn('nope', newStack('pendant'))).toBe(false);
		store.removeItem('pendant');
		expect(crate.slots.every((s) => s === null)).toBe(true);
	});

	it('refilling keeps what was put in on purpose', () => {
		const store = new Crates(map.world, map.layout.crates, map.nav, map.start, map.seed);
		const [{ crate }] = store.list();
		store.stowIn(crate.id, newStack('pendant'));
		store.fill();
		expect(crate.slots.some((s) => s?.item === 'pendant')).toBe(true);
	});

	it('with no crates there is nowhere to stow anything', () => {
		const store = new Crates(map.world, [], map.nav, map.start, map.seed);
		expect(store.stow(newStack('pendant'), { pick: () => null } as never)).toBe(false);
		expect(store.get('c1')).toBeNull();
	});
});
