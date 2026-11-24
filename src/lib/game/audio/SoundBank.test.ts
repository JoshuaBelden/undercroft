import { describe, expect, it, vi } from 'vitest';
import type { AudioManager, SoundHandle } from './AudioManager.ts';
import { SoundBank } from './SoundBank.ts';

/** An unlocked audio manager that records what it was asked to play. */
function fakeAudio() {
	const handle: SoundHandle = { setVolume: vi.fn(), setRate: vi.fn(), stop: vi.fn() };
	const audio = {
		unlocked: true,
		load: vi.fn(async () => ({}) as AudioBuffer),
		playBuffer: vi.fn(() => handle),
		playBufferAt: vi.fn(() => handle),
		distanceGain: () => 1,
		listener: { position: [0, 0, 0], forward: [0, 0, -1] }
	};
	return { audio, bank: new SoundBank(audio as unknown as AudioManager) };
}

/** Let the bank's loads settle. */
const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

describe('SoundBank', () => {
	// 'rope.letgo' has no recording yet; 'footstep.stone' plays the built walking recording.
	it('plays nothing for a sound with no recording, without throwing', async () => {
		const { audio, bank } = fakeAudio();
		bank.play('rope.letgo');
		bank.playAt('rope.letgo', [1, 0, 1]);
		expect(await bank.playAtHeld('rope.letgo', [1, 0, 1])).toBeNull();
		await settle();
		expect(audio.load).not.toHaveBeenCalled();
		expect(audio.playBuffer).not.toHaveBeenCalled();
		expect(audio.playBufferAt).not.toHaveBeenCalled();
	});

	it('a loop with no recording hands back a silent handle', async () => {
		const { audio, bank } = fakeAudio();
		const loop = await bank.loop('rope.letgo', 0.5);
		expect(() => {
			loop.setVolume(1);
			loop.setRate(1.2);
			loop.stop();
		}).not.toThrow();
		expect(audio.playBuffer).not.toHaveBeenCalled();
	});

	it('plays a recorded sound', async () => {
		const { audio, bank } = fakeAudio();
		bank.play('footstep.stone');
		await settle();
		expect(audio.load).toHaveBeenCalled();
		expect(audio.playBuffer).toHaveBeenCalledOnce();
	});
});
