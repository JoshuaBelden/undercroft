import { describe, expect, it, vi } from 'vitest';
import { AFFLICTIONS } from '../../src/lib/content/afflictions.ts';
import { useSessions, kit, Diver } from '../testing/harness.ts';

const SEED = 1;
const RITE = AFFLICTIONS.gloaming.rite;
const open = useSessions();

describe('the rite', () => {
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
		const inCrates = () =>
			session['crates'].list().some(({ crate }) => crate.slots.some((s) => s?.item === 'pendant'));
		expect(inCrates()).toBe(true);
		session.withhold(['pendant']);
		expect(inCrates()).toBe(false);
	});
});
