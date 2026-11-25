import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ITEMS, type ItemDef } from '../../src/lib/content/items.ts';
import { LOOTABLES } from '../../src/lib/content/lootables.ts';
import { carriedCount } from '../../src/lib/shared/items/inventory.ts';
import { crateCentre } from '../../src/lib/shared/map/crates.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import type { Session } from '../session.ts';
import { Diver, kit, useSessions } from '../testing/harness.ts';

/**
 * Fonts (docs/dev/world.md#fonts). There are no glass bottles in the game yet, so maps leave fonts
 * out: these tests put a bottle and holy water in ITEMS first, and fonts come with the map.
 */

const ADDED: Record<string, ItemDef> = {
	'glass-bottle': item('glass-bottle'),
	'holy-water': item('holy-water')
};

function item(id: string): ItemDef {
	return {
		id,
		name: id === 'glass-bottle' ? 'Glass bottle' : 'Holy water',
		kind: 'loot',
		category: 'material',
		flavor: 'A test item.',
		model: null,
		maxStack: 5,
		weight: 0.3
	};
}

beforeAll(() => {
	for (const [id, def] of Object.entries(ADDED)) if (!ITEMS[id]) ITEMS[id] = def;
});
afterAll(() => {
	for (const [id, def] of Object.entries(ADDED)) if (ITEMS[id] === def) delete ITEMS[id];
});

// On a generated map: the fixed map has no room for what these test yet (docs/dev/fixed-map.md#tests).

const open = useSessions({ generated: true });
const FILL = LOOTABLES.font.fill!;

/** A map with a font (the gloaming chapel has one, the vestry and drowned chapel too). */
function withFont(): {
	session: Session;
	font: ReturnType<Session['crates']['list']>[number]['crate'];
} {
	for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
		const session = open(seed);
		const font = session['crates'].list().find(({ crate }) => crate.kind === 'font')?.crate;
		if (font) {
			session.admin('x', { kind: 'clearCreatures' });
			return { session, font };
		}
	}
	throw new Error('No map with a font');
}

function atFont(session: Session, diver: Diver, font: { id: string; position: Vec3 }) {
	const yaw = Number(session.layout.crates.find((c) => c.id === font.id)?.yaw ?? 0);
	diver.put(
		session['freeSpot']([
			font.position[0] + Math.sin(yaw) * 1.2,
			font.position[1] + 0.05,
			font.position[2] + Math.cos(yaw) * 1.2
		])
	);
	diver.hold({}, 0.3);
	return diver.lookAt(crateCentre(font));
}

describe('fonts', () => {
	it('holding interact with a glass bottle fills it with holy water, a few times', () => {
		const { session, font } = withFont();
		const diver = new Diver(session, 'A', kit(['glass-bottle', 5]));
		const look = atFont(session, diver, font);
		const fills = font.fills;
		expect(fills).toBeGreaterThanOrEqual(FILL.fills[0]);
		diver.hold({ ...look, interact: true }, FILL.seconds + 0.2);
		expect(carriedCount(diver.state.inventory, 'holy-water')).toBe(1);
		expect(carriedCount(diver.state.inventory, 'glass-bottle')).toBe(4);
		expect(font.fills).toBe(fills - 1);
		// Until it runs dry: then nothing, and everyone is told.
		for (let i = 1; i < fills; i++) {
			diver.hold(look, 0.1);
			diver.hold({ ...look, interact: true }, FILL.seconds + 0.2);
		}
		expect(font.fills).toBe(0);
		diver.hold(look, 0.1);
		diver.hold({ ...look, interact: true }, FILL.seconds + 0.2);
		expect(carriedCount(diver.state.inventory, 'holy-water')).toBe(fills);
		expect(diver.socket.last('tick')!.crates.dry).toContain(font.id);
	});

	it('without a bottle nothing happens', () => {
		const { session, font } = withFont();
		const diver = new Diver(session);
		const look = atFont(session, diver, font);
		const fills = font.fills;
		diver.hold({ ...look, interact: true }, FILL.seconds + 0.5);
		expect(font.fills).toBe(fills);
		expect(diver.player.crate).toBeNull();
	});
});
