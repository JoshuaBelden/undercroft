import { describe, expect, it, vi } from 'vitest';
import { AFFLICTIONS } from '../../src/lib/content/afflictions.ts';
import { MIDDLE } from '../../src/lib/content/quests.ts';
import { addItem, carriedCount, newStack } from '../../src/lib/shared/items/inventory.ts';
import { emptyRecord } from '../../src/lib/shared/quests/engine.ts';
import type { QuestRecord } from '../../src/lib/shared/quests/types.ts';
import type { Session } from '../session.ts';
import { useSessions, kit, Diver } from '../testing/harness.ts';
import { HINTED_RITE, useRite } from '../testing/rites.ts';

const SEED = 1;
const RITE = HINTED_RITE;
// On a generated map: the fixed map has no room for what these test yet (docs/dev/fixed-map.md#tests).
const open = useSessions({ generated: true });

describe('a rite of carried things and hints', () => {
	useRite(HINTED_RITE);

	it('carrying everything into its room and holding interact performs it', () => {
		const resolved = vi.fn();
		const session = open(SEED, { onResolved: resolved });
		const stacks = RITE.requirements.map((r): [string, number] => [r.item, r.count]);
		const diver = new Diver(session, 'A', kit(...stacks));
		session.admin(diver.id, { kind: 'clearCreatures' });
		session.revealClues(RITE.clues.length);
		session.admin(diver.id, { kind: 'teleport', room: RITE.room });
		diver.hold({}, 0.5);
		expect(session['rite'].canPerform(diver.state)).toBe(true);
		diver.hold({ interact: true }, RITE.seconds + 0.5);
		// Performed: it summons the manifestation in the room, but nothing is resolved yet.
		const tick = diver.socket.last('tick')!;
		expect(tick.affliction.rite.performed).toBe(true);
		expect(tick.affliction.rite.resolved).toBe(false);
		expect(tick.affliction.calmed).toBe(false);
		expect(resolved).not.toHaveBeenCalled();
		expect(session['rite'].inRoom(tick.affliction.manifestation!.position)).toBe(true);
		expect(session['rite'].canPerform(diver.state)).toBe(false);
		// The rite used them up.
		expect(diver.state.inventory.backpack.every((s) => s === null)).toBe(true);
		// Banishing what it summoned resolves it.
		session.admin(diver.id, { kind: 'banish' });
		diver.hold({}, 0.1);
		expect(resolved).toHaveBeenCalledOnce();
		expect(diver.socket.last('tick')!.affliction.rite.resolved).toBe(true);
		expect(diver.socket.last('tick')!.affliction.calmed).toBe(true);
		expect(diver.inside).toBe(true);
	});

	it('shuts its room in until what it summoned is banished; then the door opens and the ladder comes down', () => {
		const session = open(SEED);
		const stacks = RITE.requirements.map((r): [string, number] => [r.item, r.count]);
		const diver = new Diver(session, 'A', kit(...stacks));
		session.admin(diver.id, { kind: 'clearCreatures' });
		session.admin(diver.id, { kind: 'openDoors' });
		session.revealClues(RITE.clues.length);
		const door = session.layout.doors.find((d) => d.piece === RITE.room)!;
		expect(door).toBeDefined();
		// No way out of the final room yet.
		expect(session.world.extracts).toEqual([]);
		expect(session.world.sealedExtracts).toHaveLength(1);
		session.admin(diver.id, { kind: 'teleport', room: RITE.room });
		diver.hold({}, 0.5);
		expect(diver.socket.last('tick')!.doors).toContain(door.id);
		diver.hold({ interact: true }, RITE.seconds + 0.5);
		// The rite slams it shut and seals it: it can't be opened.
		let ticks = diver.socket.all('tick');
		expect(ticks.flatMap((t) => t.events)).toContainEqual(
			expect.objectContaining({ kind: 'doorSeal', id: door.id, open: true })
		);
		let tick = diver.socket.last('tick')!;
		expect(tick.doors).not.toContain(door.id);
		expect(tick.sealed).toEqual([door.id]);
		expect(session.doors.open(door.id)).toBe(false);
		expect(session.nav.closed.has(door.id)).toBe(true);
		expect(session.world.extracts).toEqual([]);
		// Banished: the door opens by itself, and the ladder is a way out.
		session.admin(diver.id, { kind: 'banish' });
		diver.hold({}, 0.1);
		ticks = diver.socket.all('tick');
		expect(ticks.flatMap((t) => t.events)).toContainEqual(
			expect.objectContaining({ kind: 'doorRelease', id: door.id })
		);
		tick = diver.socket.last('tick')!;
		expect(tick.doors).toContain(door.id);
		expect(tick.sealed).toEqual([]);
		expect(session.world.extracts).toHaveLength(1);
		expect(session.world.sealedExtracts).toEqual([]);
	});

	it('summoning it from the admin panel seals the room the same way', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A');
		session.admin(diver.id, { kind: 'clearCreatures' });
		session.admin(diver.id, { kind: 'openDoors' });
		const door = session.layout.doors.find((d) => d.piece === RITE.room)!;
		session.admin(diver.id, { kind: 'manifest' });
		diver.hold({}, 0.1);
		const tick = diver.socket.last('tick')!;
		expect(tick.doors).not.toContain(door.id);
		expect(tick.sealed).toEqual([door.id]);
		session.admin(diver.id, { kind: 'banish' });
		diver.hold({}, 0.1);
		expect(diver.socket.last('tick')!.doors).toContain(door.id);
	});

	it('reading the last hint clears the copies left in the map', () => {
		const clues = vi.fn();
		const session = open(SEED, { onClues: clues });
		const diver = new Diver(session);
		session.revealClues(RITE.clues.length - 1);
		expect(session['items'].snapshots().some((i) => i.item === 'clue')).toBe(true);
		session.systems.rite.readClue(diver.player, diver.state.position);
		expect(clues).toHaveBeenCalledWith(RITE.clues.length);
		expect(session['items'].snapshots().some((i) => i.item === 'clue')).toBe(false);
		// Nothing left to learn.
		expect(session.systems.rite.readClue(diver.player, diver.state.position)).toBe(false);
	});

	it('withholding a quest item takes it out of the map', () => {
		const session = open(SEED);
		const inMap = () => session['items'].snapshots().some((i) => i.item === 'pendant');
		expect(inMap()).toBe(true);
		session.withhold(['pendant']);
		expect(inMap()).toBe(false);
	});
});

describe("the Gloaming's rite (docs/dev/quests.md#the-rite)", () => {
	const GLOAMING = AFFLICTIONS.gloaming.rite;

	/** Every quest before the last done: the last is open, and they may begin the rite. */
	function ready(): QuestRecord {
		const record = emptyRecord();
		['fontaine', ...MIDDLE].forEach((id, i) => {
			record.quests[id] = { counts: [], committed: {}, done: i + 1 };
		});
		return record;
	}

	function diver(session: Session, name: string, record: QuestRecord | null): Diver {
		const d = new Diver(session, name);
		session.systems.quests.set(d.player, record ? { record, resolved: [] } : null);
		return d;
	}

	/** In the chapel, at the altar, with the creatures gone. */
	function inChapel(session: Session, ...divers: Diver[]): void {
		session.admin(divers[0].id, { kind: 'clearCreatures' });
		for (const d of divers) {
			session.admin(d.id, { kind: 'teleport', room: 'tomb' });
			d.hold({}, 0.3);
		}
	}

	it('only those whose last quest is open can begin it; with none of them there it never starts', () => {
		const session = open(SEED);
		const a = diver(session, 'A', emptyRecord());
		inChapel(session, a);
		a.hold({ interact: true }, GLOAMING.seconds + 0.5);
		expect(session['rite'].performed).toBe(false);
		expect(a.socket.last('tick')!.affliction.rite.gated).toBe(true);
	});

	it('put down, he leaves his lantern; laid in his tomb it is resolved, for those who could begin it', () => {
		const resolved = vi.fn();
		const session = open(SEED, { onResolved: resolved });
		const a = diver(session, 'A', ready());
		const b = diver(session, 'B', emptyRecord());
		inChapel(session, a, b);
		a.hold({ interact: true }, GLOAMING.seconds + 0.5);
		expect(session['rite'].performed).toBe(true);
		session.admin(a.id, { kind: 'banish' });
		a.hold({}, 0.2);
		// Fallen, not resolved: the door stays sealed, and his lantern lies where he fell.
		let tick = a.socket.last('tick')!;
		expect(tick.affliction.rite.resolved).toBe(false);
		expect(tick.affliction.rite.laid).toMatchObject({ item: GLOAMING.laid!.item });
		expect(tick.sealed.length).toBeGreaterThan(0);
		expect(resolved).not.toHaveBeenCalled();
		expect(session['items'].snapshots().some((i) => i.item === GLOAMING.laid!.item)).toBe(true);
		// Carried to his tomb and laid there.
		addItem(a.state.inventory, newStack(GLOAMING.laid!.item));
		session['items'].removeAll(GLOAMING.laid!.item);
		session.admin(a.id, { kind: 'teleport', room: 'tomb' });
		a.hold({}, 0.3);
		a.hold({ interact: true }, GLOAMING.laid!.seconds + 0.3);
		tick = a.socket.last('tick')!;
		expect(tick.affliction.rite.resolved).toBe(true);
		expect(tick.sealed).toEqual([]);
		expect(carriedCount(a.state.inventory, GLOAMING.laid!.item)).toBe(0);
		expect(resolved).toHaveBeenCalledWith([a.player.owner]);
		const quest = session.systems.quests.of(a.player)!.record.quests['last-procession'];
		expect(quest.counts).toEqual([1]);
		expect(session.systems.quests.of(b.player)!.record.quests['last-procession']).toBeUndefined();
	});

	it('killing him and getting out resolves nothing', () => {
		const resolved = vi.fn();
		const session = open(SEED, { onResolved: resolved });
		const a = diver(session, 'A', ready());
		inChapel(session, a);
		a.hold({ interact: true }, GLOAMING.seconds + 0.5);
		session.admin(a.id, { kind: 'banish' });
		a.hold({}, 0.2);
		a.state.extracted = true;
		a.hold({}, 0.2);
		expect(resolved).not.toHaveBeenCalled();
	});

	it('resolved once, he never rises for them again', () => {
		const session = open(SEED);
		const d = new Diver(session, 'A');
		session.systems.quests.set(d.player, { record: ready(), resolved: ['gloaming'] });
		inChapel(session, d);
		d.hold({ interact: true }, GLOAMING.seconds + 0.5);
		expect(session['rite'].performed).toBe(false);
	});
});
