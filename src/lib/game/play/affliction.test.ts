import { describe, expect, it, vi } from 'vitest';
import { AFFLICTIONS } from '#lib/content/afflictions.ts';
import type { ManifestationSnapshot } from '#lib/shared/affliction/types.ts';
import type { PlayContext, TickMessage } from './feature.ts';

// The figure is three.js: not what these tests are about.
vi.mock('#lib/game/affliction/Manifestation.ts', () => ({
	Manifestation: class {
		root = {};
		ray = { root: { removeFromParent(): void {} } };
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
function context(): {
	ctx: PlayContext;
	loops: { id: string; stopped: boolean }[];
	played: string[];
} {
	const loops: { id: string; stopped: boolean }[] = [];
	const played: string[] = [];
	const sounds = {
		play: (id: string) => played.push(id),
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
	return { ctx, loops, played };
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
				? {
						position: [0, 0, 0],
						state,
						stunned: false,
						strikes: 0,
						casts: 0,
						charge: 0,
						aim: null,
						rushing: false
					}
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

describe('Omen stings', () => {
	it('play the omen drone once, as the Gloaming reaches three quarters', () => {
		const { ctx, played } = context();
		const affliction = new Affliction(ctx);
		affliction.tick(tick(null));
		for (const stage of [1, 2]) affliction.event({ kind: 'omen', stage });
		expect(played).toEqual([]);
		affliction.event({ kind: 'omen', stage: 3 });
		expect(played).toEqual(['omen.drone']);
		affliction.event({ kind: 'omen', stage: 4 });
		expect(played).toEqual(['omen.drone']);
	});

	it('the three-quarters stage is the one that stings', () => {
		const stages = AFFLICTIONS.gloaming.stages;
		expect(stages.filter((stage) => stage.sting).map((stage) => [stage.at, stage.sting])).toEqual([
			[0.75, 'omen.drone']
		]);
	});
});
