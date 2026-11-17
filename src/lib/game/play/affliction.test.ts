import { describe, expect, it, vi } from 'vitest';
import type { ManifestationSnapshot } from '#lib/shared/affliction/types.ts';
import type { PlayContext, TickMessage } from './feature.ts';

// The figure is three.js: not what these tests are about.
vi.mock('#lib/game/affliction/Manifestation.ts', () => ({
	Manifestation: class {
		root = {};
		apply(): void {}
		update(): void {}
		hit(): void {}
		clear(): void {}
		dispose(): void {}
	}
}));

// Tests don't compile runes: `$state` is the plain value here.
vi.stubGlobal('$state', <T>(value: T): T => value);
const { Affliction } = await import('./affliction.svelte.ts');

/** A play context that records which loops start and stop. */
function context(): { ctx: PlayContext; loops: { id: string; stopped: boolean }[] } {
	const loops: { id: string; stopped: boolean }[] = [];
	const sounds = {
		play: () => {},
		playAt: () => {},
		loop: (id: string) => {
			const loop = { id, stopped: false };
			loops.push(loop);
			return Promise.resolve({
				setVolume: () => {},
				setRate: () => {},
				stop: () => (loop.stopped = true)
			});
		}
	};
	const ctx = {
		sounds,
		engine: { scene: { add: () => {} }, camera: { position: { x: 0, y: 0, z: 0 } } },
		ambience: { setOmen: () => {} },
		client: { playerId: 'p1' },
		ui: { banner: () => {} }
	} as unknown as PlayContext;
	return { ctx, loops };
}

function tick(state: ManifestationSnapshot['state'] | null): TickMessage {
	return {
		affliction: {
			id: 'gloaming',
			omen: 0,
			meter: 0,
			calmed: state === 'banished',
			deadline: null,
			manifestation: state
				? { position: [0, 0, 0], state, exposed: false, charge: 0, stunned: false, strikes: 0 }
				: null
		}
	} as unknown as TickMessage;
}

const flush = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

describe('Affliction fight music', () => {
	it('is silent until the manifestation is summoned, then plays the Affliction’s music', async () => {
		const { ctx, loops } = context();
		const affliction = new Affliction(ctx);
		affliction.tick(tick(null));
		await flush();
		expect(loops).toHaveLength(0);
		affliction.tick(tick('gathering'));
		affliction.tick(tick('hunting'));
		await flush();
		expect(loops.map((loop) => loop.id)).toEqual(['music.gloaming.fight']);
	});

	it('fades out and stops once it is banished', async () => {
		vi.useFakeTimers();
		try {
			const { ctx, loops } = context();
			const affliction = new Affliction(ctx);
			affliction.tick(tick('hunting'));
			await vi.runAllTimersAsync();
			affliction.tick(tick('banished'));
			await vi.runAllTimersAsync();
			expect(loops[0]?.stopped).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});
});
