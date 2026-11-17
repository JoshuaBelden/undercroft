import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoundHandle } from './AudioManager.ts';
import type { SoundBank } from './SoundBank.ts';
import { FadingLoop } from './FadingLoop.ts';

/** A loop that records what was asked of it. */
interface FakeLoop extends SoundHandle {
	volumes: [number, number | undefined][];
	stopped: boolean;
}

/** A sound bank whose loops finish loading when the test says so. */
function fakeBank(): { bank: SoundBank; loops: FakeLoop[]; load: () => Promise<void> } {
	const loops: FakeLoop[] = [];
	const pending: (() => void)[] = [];
	const bank = {
		loop: () =>
			new Promise<SoundHandle>((done) => {
				const loop: FakeLoop = {
					volumes: [],
					stopped: false,
					setVolume: (value, seconds) => loop.volumes.push([value, seconds]),
					setRate: () => {},
					stop: () => (loop.stopped = true)
				};
				loops.push(loop);
				pending.push(() => done(loop));
			})
	} as unknown as SoundBank;
	const load = async (): Promise<void> => {
		for (const done of pending.splice(0)) done();
		await Promise.resolve();
	};
	return { bank, loops, load };
}

describe('FadingLoop', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('waits for the audio to be allowed before it starts', async () => {
		const { bank, loops, load } = fakeBank();
		const fading = new FadingLoop(bank, 'ambience.dashboard', { in: 3, out: 1.5 });
		fading.setWanted(true);
		expect(loops).toHaveLength(0);
		fading.allow();
		await load();
		expect(loops).toHaveLength(1);
		expect(loops[0]?.volumes.at(-1)?.[0]).toBe(1);
	});

	it('fades out and stops on the expedition, and starts again on return', async () => {
		const { bank, loops, load } = fakeBank();
		const fading = new FadingLoop(bank, 'ambience.dashboard', { in: 3, out: 1.5 });
		fading.allow();
		fading.setWanted(true);
		await load();
		fading.setWanted(false);
		expect(loops[0]?.volumes.at(-1)?.[0]).toBe(0);
		expect(loops[0]?.stopped).toBe(false);
		vi.runAllTimers();
		expect(loops[0]?.stopped).toBe(true);
		fading.setWanted(true);
		await load();
		expect(loops).toHaveLength(2);
		expect(loops[1]?.stopped).toBe(false);
	});

	it('comes back up without restarting when wanted again mid-fade', async () => {
		const { bank, loops, load } = fakeBank();
		const fading = new FadingLoop(bank, 'ambience.dashboard', { in: 3, out: 1.5 });
		fading.allow();
		fading.setWanted(true);
		await load();
		fading.setWanted(false);
		fading.setWanted(true);
		vi.runAllTimers();
		expect(loops).toHaveLength(1);
		expect(loops[0]?.stopped).toBe(false);
		expect(loops[0]?.volumes.at(-1)?.[0]).toBe(1);
	});

	it('drops a loop that finishes loading after the surface was left', async () => {
		const { bank, loops, load } = fakeBank();
		const fading = new FadingLoop(bank, 'ambience.dashboard', { in: 3, out: 1.5 });
		fading.allow();
		fading.setWanted(true);
		fading.setWanted(false);
		await load();
		expect(loops[0]?.stopped).toBe(true);
	});

	it('plays one loop when allowed and wanted change while loading', async () => {
		const { bank, loops, load } = fakeBank();
		const fading = new FadingLoop(bank, 'ambience.dashboard', { in: 3, out: 1.5 });
		fading.setWanted(true);
		fading.allow();
		fading.setWanted(true);
		await load();
		expect(loops.filter((loop) => !loop.stopped)).toHaveLength(1);
	});
});
