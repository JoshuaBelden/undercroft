import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAP_KIT } from '../src/lib/content/map/kit.ts';
import { SURVEY } from '../src/lib/content/map/survey.ts';
import { addItem, emptyInventory, newStack } from '../src/lib/shared/items/inventory.ts';
import { PIECES } from '../src/lib/shared/map/pieces.generated.ts';
import { roomPoints } from '../src/lib/shared/map/points.ts';
import type { Inventory } from '../src/lib/shared/player/types.ts';
import { config } from './config.ts';
import type { Session } from './session.ts';
import { Diver, FakeSocket, fakeTime, newSession } from './testing/harness.ts';

const SEED = 1;

let sessions: Session[] = [];
function open(seed = SEED): Session {
	const session = newSession(seed);
	sessions.push(session);
	return session;
}

beforeEach(() => {
	fakeTime();
	config.devMode = true;
});
afterEach(() => {
	for (const session of sessions) session.stop();
	sessions = [];
	vi.useRealTimers();
	config.devMode = false;
});

function notebook(): Inventory {
	const inv = emptyInventory();
	addItem(inv, newStack('notebook'));
	return inv;
}

/** A diver in a quiet session, settled on the floor. */
function diver(session: Session, name: string, inventory = notebook()): Diver {
	const d = new Diver(session, name, inventory);
	session.admin(d.id, { kind: 'clearCreatures' });
	d.hold({}, 0.3);
	return d;
}

const cells = (d: Diver) => d.socket.last('survey')!.cells.map((c) => c.join(','));

describe('the map', () => {
	it('starts empty, and standing still with a notebook sketches what is around you, once a hold', () => {
		const session = open();
		const a = diver(session, 'A');
		expect(a.socket.last('survey')!.cells).toEqual([]);
		a.hold({ survey: 'sketch' }, SURVEY.sketchSeconds + 0.2);
		const drawn = cells(a);
		expect(drawn.length).toBeGreaterThan(0);
		expect(a.state.sketching).toBe(-1);
		// Still holding: no second sketch until it is let go.
		const sent = a.socket.all('survey').length;
		a.hold({ survey: 'sketch' }, SURVEY.sketchSeconds + 0.2);
		expect(a.socket.all('survey')).toHaveLength(sent);
		a.hold({}, 0.1);
		expect(a.state.sketching).toBe(0);
	});

	it('needs a notebook, and to stand still', () => {
		const session = open();
		const bare = diver(session, 'Bare', emptyInventory());
		bare.hold({ survey: 'sketch' }, SURVEY.sketchSeconds + 0.2);
		expect(bare.socket.all('survey')).toHaveLength(1);
		expect(bare.state.sketching).toBe(0);
		const walker = diver(session, 'Walker');
		walker.hold({ survey: 'sketch', moveZ: 1 }, 0.5);
		expect(walker.state.sketching).toBe(0);
		walker.hold({ survey: 'sketch' }, 0.5);
		expect(walker.state.sketching).toBeGreaterThan(0);
	});

	it('is your own: showing it to a teammate close by gives you both everything either had', () => {
		const session = open();
		const a = diver(session, 'A');
		const b = diver(session, 'B');
		a.hold({ survey: 'sketch' }, SURVEY.sketchSeconds + 0.2);
		const far = roomPoints(session.layout, PIECES, MAP_KIT).find((r) => r.name !== 'stairwell')!;
		session.admin(b.id, { kind: 'teleport', room: far.name });
		b.hold({ survey: 'sketch' }, SURVEY.sketchSeconds + 0.2);
		const mine = cells(a);
		const theirs = cells(b);
		expect(theirs.some((cell) => !mine.includes(cell))).toBe(true);
		// Sketching added nothing to the other's map, and showing needs them close.
		expect(cells(a)).toEqual(mine);
		a.hold({ survey: 'share' }, SURVEY.shareSeconds + 0.2);
		expect(a.state.sharing).toBe(0);
		const [x, y, z] = a.state.position;
		b.put([x + 1, y, z]);
		a.hold({ survey: 'share' }, SURVEY.shareSeconds + 0.2);
		const both = new Set([...mine, ...theirs]);
		expect(new Set(cells(a))).toEqual(both);
		expect(new Set(cells(b))).toEqual(both);
	});

	it('is only shown to a teammate with a notebook of their own', () => {
		const session = open();
		const a = diver(session, 'A');
		const bare = diver(session, 'Bare', emptyInventory());
		const [x, y, z] = a.state.position;
		bare.put([x + 1, y, z]);
		a.hold({ survey: 'share' }, SURVEY.shareSeconds + 0.2);
		expect(a.state.sharing).toBe(0);
		expect(bare.socket.all('survey')).toHaveLength(1);
	});

	it('comes back on a reconnect, and starts over on a new map', () => {
		const session = open();
		const a = diver(session, 'A');
		a.hold({ survey: 'sketch' }, SURVEY.sketchSeconds + 0.2);
		const drawn = cells(a);
		const socket = new FakeSocket();
		expect(session.reattach(a.id, socket.ws)).toBe(true);
		expect(socket.last('survey')!.cells.map((c) => c.join(','))).toEqual(drawn);
		session.admin(a.id, { kind: 'regenerate', seed: 77 });
		expect(socket.last('survey')!.cells).toEqual([]);
	});

	it('admin: reveal the whole map, and clear it', () => {
		const session = open();
		const a = diver(session, 'A');
		session.admin(a.id, { kind: 'revealMap' });
		expect(a.socket.last('survey')!.cells).toHaveLength(session['survey'].cells.size);
		session.admin(a.id, { kind: 'clearMap' });
		expect(a.socket.last('survey')!.cells).toEqual([]);
	});
});
