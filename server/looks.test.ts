import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, type Look } from '../src/lib/shared/player/look.ts';
import { Diver, useSessions, wait } from './testing/harness.ts';

const open = useSessions();

const DRESSED: Look = {
	body: 'female',
	face: 2,
	wear: { hair: 'hair-afro', shirt: 'shirt', pants: 'pants-wool', jacket: 'jacket-sweater' },
	tints: { skin: 'deep', hair: 'black', jacket: 'oxblood' }
};

/** How each player looks goes out with their state, so everyone draws them the same. */
describe('looks', () => {
	it('sends each player’s look to everyone in every tick', () => {
		const session = open(1);
		const a = new Diver(session, 'A', undefined, undefined, DRESSED);
		const b = new Diver(session, 'B');
		wait(0.2);
		for (const diver of [a, b]) {
			const tick = diver.socket.last('tick');
			const players = tick?.type === 'tick' ? tick.players : [];
			expect(players.find((p) => p.id === a.id)?.look).toEqual(DRESSED);
			expect(players.find((p) => p.id === b.id)?.look).toEqual(DEFAULT_LOOK);
		}
	});
});
