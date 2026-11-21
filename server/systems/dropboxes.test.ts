import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../src/lib/content/items.ts';
import { DROP_BOXES } from '../../src/lib/content/loot.ts';
import { LOOTABLES } from '../../src/lib/content/lootables.ts';
import { crateCentre } from '../../src/lib/shared/map/crates.ts';
import type { Session } from '../session.ts';
import { useSessions, Diver, kit } from '../testing/harness.ts';

/** Drop boxes (docs/dev/lootables.md#drop-boxes): what is dropped with no model of its own. */

const SEED = 1;
const open = useSessions();
const OPEN_SECONDS = LOOTABLES.dropBox.open[0].seconds;

/** Something that stacks and has no model: it goes in a box. */
const BOXED = Object.keys(ITEMS).find(
	(id) => !ITEMS[id].model && ITEMS[id].category === 'material' && ITEMS[id].maxStack >= 5
)!;
/** Something with a model of its own: it lies on the floor as itself. */
const LOOSE = Object.keys(ITEMS).find(
	(id) => !!ITEMS[id].model && ITEMS[id].category === 'quick' && ITEMS[id].maxStack >= 2
)!;

function quiet(session: Session) {
	session.admin('x', { kind: 'clearCreatures' });
}

const boxes = (session: Session) => session['crates'].snapshot().boxes;

/** Drop the whole stack in a slot, looking down in front. */
function drop(session: Session, diver: Diver, area: 'backpack' | 'quick', index = 0) {
	const count = diver.state.inventory[area][index]?.count ?? 1;
	session.inventory(diver.id, { kind: 'drop', from: { area, index }, count });
}

describe('drop boxes', () => {
	it('what has no model goes in a box of your own in front of you, not on the floor', () => {
		const session = open(SEED);
		quiet(session);
		const diver = new Diver(session, 'A', kit([BOXED, 5]));
		diver.hold({ pitch: -0.6 }, 0.3);
		// The map may have some lying about already: none more.
		const loose = () => session['items'].snapshots().filter((i) => i.item === BOXED).length;
		const before = loose();
		drop(session, diver, 'backpack');
		expect(diver.state.inventory.backpack[0]).toBeNull();
		expect(loose()).toBe(before);
		const [box] = boxes(session);
		expect(box).toMatchObject({ owner: diver.id });
		const flat = Math.hypot(
			box.position[0] - diver.state.position[0],
			box.position[2] - diver.state.position[2]
		);
		expect(flat).toBeLessThanOrEqual(DROP_BOXES.ahead + 0.01);
		expect(session['crates'].get(box.id)?.slots[0]).toMatchObject({ item: BOXED, count: 5 });
		// Told with the next tick.
		diver.hold({ pitch: -0.6 }, 0.1);
		const events = diver.socket.all('tick').flatMap((t) => t.events);
		expect(events.some((e) => e.kind === 'boxed' && e.item === BOXED)).toBe(true);
	});

	it('near a box of yours, anything you drop goes in it; something with a model elsewhere lies loose', () => {
		const session = open(SEED);
		quiet(session);
		const diver = new Diver(session, 'A', kit([BOXED, 3], [LOOSE, 2]));
		diver.hold({ pitch: -0.6 }, 0.3);
		// Away from any box, something with a model lies on the floor.
		drop(session, diver, 'quick');
		expect(session['items'].snapshots().some((i) => i.item === LOOSE)).toBe(true);
		expect(boxes(session)).toHaveLength(0);
		diver.hold({ pitch: -0.6 }, 0.2);
		const pickup = session['items'].snapshots().find((i) => i.item === LOOSE)!;
		const look = diver.lookAt(pickup.position);
		diver.hold(look, 0.1);
		diver.press({ ...look, interact: true });
		// A box made, and then what has a model goes in it too.
		drop(session, diver, 'backpack');
		drop(session, diver, 'quick');
		expect(boxes(session)).toHaveLength(1);
		const slots = session['crates'].get(boxes(session)[0].id)!.slots;
		expect(slots.map((s) => s?.item)).toEqual(expect.arrayContaining([BOXED, LOOSE]));
	});

	it("dropping by someone else's box makes a box of your own", () => {
		const session = open(SEED);
		quiet(session);
		const a = new Diver(session, 'A', kit([BOXED, 2]));
		const b = new Diver(session, 'B', kit([BOXED, 2]));
		b.put([...a.state.position]);
		a.hold({ pitch: -0.6 }, 0.3);
		drop(session, a, 'backpack');
		drop(session, b, 'backpack');
		expect(
			boxes(session)
				.map((box) => box.owner)
				.sort()
		).toEqual([a.id, b.id].sort());
	});

	it('anyone can open any box; taken empty and closed, it is gone', () => {
		const session = open(SEED);
		quiet(session);
		const a = new Diver(session, 'A', kit([BOXED, 4]));
		const b = new Diver(session, 'B');
		a.hold({ pitch: -0.6 }, 0.3);
		drop(session, a, 'backpack');
		const [box] = boxes(session);
		// B where A stood (A out of the way), looking at it.
		const crate = session['crates'].get(box.id)!;
		const stood = [...a.state.position] as typeof a.state.position;
		a.put([...b.state.position]);
		b.put(stood);
		b.hold({}, 0.2);
		const look = b.lookAt(crateCentre(crate));
		b.hold({ ...look, interact: true }, OPEN_SECONDS + 0.2);
		expect(b.player.crate).toBe(box.id);
		expect(b.socket.last('crate')!.slots[0]).toMatchObject({ item: BOXED, count: 4 });
		session.inventory(b.id, { kind: 'quick', from: { area: 'stash', index: 0 } });
		expect(b.state.inventory.backpack.some((s) => s?.item === BOXED)).toBe(true);
		session.closeCrate(b.id);
		expect(boxes(session)).toHaveLength(0);
		expect(session['crates'].get(box.id)).toBeNull();
	});

	it('the admin clears every box', () => {
		const session = open(SEED);
		quiet(session);
		const diver = new Diver(session, 'A', kit([BOXED, 2]));
		diver.hold({ pitch: -0.6 }, 0.3);
		drop(session, diver, 'backpack');
		expect(boxes(session)).toHaveLength(1);
		session.admin(diver.id, { kind: 'clearDropBoxes' });
		expect(boxes(session)).toHaveLength(0);
	});
});
