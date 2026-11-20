import { describe, expect, it } from 'vitest';
import { CRATES } from '../../content/loot.ts';
import { LOOTABLES } from '../../content/lootables.ts';
import { MAP_KIT } from '../../content/map/kit.ts';
import { openable } from '../items/lootables.ts';
import { realMap } from '../testing/maps.ts';
import { placeCrates } from './crates.ts';
import { PIECES } from './pieces.generated.ts';
import { spawnPoint } from './points.ts';
import type { MapKit } from './types.ts';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

describe('placeCrates', () => {
	it('is seeded: the same map gets the same crates', () => {
		const map = realMap(42);
		expect(placeCrates(map, PIECES, 42)).toEqual(placeCrates(map, PIECES, 42));
	});

	it('keeps crates away from the start and gives them unique ids', () => {
		for (const seed of SEEDS) {
			const map = realMap(seed);
			const start = spawnPoint(map, PIECES).position;
			const ids = map.crates.map((crate) => crate.id);
			expect(new Set(ids).size).toBe(ids.length);
			for (const crate of map.crates) {
				// Corpses are pushed out from their marker a little.
				const away = Math.hypot(crate.position[0] - start[0], crate.position[2] - start[2]);
				expect(away, `seed ${seed} ${crate.id}`).toBeGreaterThan(CRATES.minDistance - 0.5);
			}
		}
	});

	it('turns some crates into corpses, never all of them', () => {
		let crates = 0;
		let corpses = 0;
		for (const seed of SEEDS) {
			for (const crate of realMap(seed).crates) {
				if (crate.kind === 'corpse') corpses++;
				else crates++;
			}
		}
		expect(corpses).toBeGreaterThan(0);
		expect(crates).toBeGreaterThan(corpses);
	});
});

describe('lootables in the map', () => {
	it('a lootable marker holds its own kind, at its own place', () => {
		const pieces = structuredClone(PIECES);
		// Make room-small's crate markers locker markers.
		const piece = pieces['room-small'];
		piece.lootables = piece.crates.map((marker) => ({ ...marker, type: 'locker' }));
		piece.crates = [];
		const kit = { ...MAP_KIT, 'room-small': { ...MAP_KIT['room-small'], lootables: undefined } };
		let lockers = 0;
		for (const seed of SEEDS) {
			const map = realMap(seed);
			for (const crate of placeCrates(map, pieces, seed, kit)) {
				if (crate.kind === 'locker') lockers++;
			}
		}
		expect(lockers).toBeGreaterThan(0);
	});

	it("a room's crates hold what its kit entry lists, where it fits; the dead still lie anywhere", () => {
		// Only the Charnel Vault has a mix here, of cocoons.
		const kit: MapKit = Object.fromEntries(
			Object.entries(MAP_KIT).map(([id, entry]) => [id, { ...entry, lootables: undefined }])
		);
		kit['room-vault'] = { ...MAP_KIT['room-vault'], lootables: { cocoon: 1 } };
		let cocoons = 0;
		for (const seed of SEEDS) {
			const map = realMap(seed);
			for (const crate of placeCrates(map, PIECES, seed, kit)) {
				expect(['cocoon', 'corpse', 'trunk', undefined]).toContain(crate.kind);
				if (crate.kind === 'cocoon') cocoons++;
			}
		}
		expect(cocoons).toBeGreaterThan(0);
	});

	it('never places a kind nothing can open yet', () => {
		for (const seed of SEEDS) {
			for (const crate of realMap(seed).crates) {
				expect(openable(LOOTABLES[crate.kind ?? 'crate']), crate.kind).toBe(true);
			}
		}
	});

	it('still has corpses and trunks, and a little of everything else', () => {
		const kinds = new Map<string, number>();
		for (const seed of SEEDS) {
			for (const crate of realMap(seed).crates) {
				kinds.set(crate.kind ?? 'crate', (kinds.get(crate.kind ?? 'crate') ?? 0) + 1);
			}
		}
		expect(kinds.get('corpse')).toBeGreaterThan(SEEDS.length * 4);
		expect(kinds.get('trunk')).toBeGreaterThan(0);
		for (const kind of ['niche', 'bonePile', 'toolChest', 'locker', 'sarcophagus']) {
			expect(kinds.get(kind), kind).toBeGreaterThan(0);
		}
	});
});
