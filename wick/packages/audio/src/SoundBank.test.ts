import { describe, expect, it, vi } from 'vitest';
import type { AudioManager, SoundHandle } from './AudioManager.ts';
import type { CaptionCue } from './captions.ts';
import { SoundBank, type SoundCatalog } from './SoundBank.ts';

type Id = 'step' | 'unrecorded' | 'door' | 'own';

/** A small registry: one recorded sound, one with no recording yet, two captioned. */
const CATALOG: SoundCatalog<Id, 'sfx'> = {
	sounds: {
		step: { file: 'step', category: 'sfx', volume: 0.5 },
		unrecorded: { category: 'sfx', volume: 1 },
		door: { file: 'door', category: 'sfx', volume: 1, caption: 'a door creaks' },
		own: { file: 'door', category: 'sfx', volume: 1, caption: 'a creak', captionOthers: true }
	},
	files: { step: ['/step-1.webm', '/step-2.webm'], door: ['/door.webm'] }
};

/** An audio manager that records what it was asked to play. */
function fakeAudio(unlocked = true) {
	const handle: SoundHandle = { setVolume: vi.fn(), setRate: vi.fn(), stop: vi.fn() };
	const audio = {
		unlocked,
		load: vi.fn(async () => ({}) as AudioBuffer),
		playBuffer: vi.fn(() => handle),
		playBufferAt: vi.fn(() => handle),
		distanceGain: () => 1,
		listener: { position: [0, 0, 0], forward: [0, 0, -1] }
	};
	const bank = new SoundBank(audio as unknown as AudioManager<'sfx'>, CATALOG);
	return { audio, bank };
}

/** Let the bank's loads settle. */
const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

describe('SoundBank', () => {
	it('plays nothing for a sound with no recording, without throwing', async () => {
		const { audio, bank } = fakeAudio();
		bank.play('unrecorded');
		bank.playAt('unrecorded', [1, 0, 1]);
		expect(await bank.playAtHeld('unrecorded', [1, 0, 1])).toBeNull();
		await settle();
		expect(audio.load).not.toHaveBeenCalled();
		expect(audio.playBuffer).not.toHaveBeenCalled();
		expect(audio.playBufferAt).not.toHaveBeenCalled();
	});

	it('a loop with no recording hands back a silent handle', async () => {
		const { audio, bank } = fakeAudio();
		const loop = await bank.loop('unrecorded', 0.5);
		expect(() => {
			loop.setVolume(1);
			loop.setRate(1.2);
			loop.stop();
		}).not.toThrow();
		expect(audio.playBuffer).not.toHaveBeenCalled();
	});

	it('plays a recorded sound on its category, at its volume, loading every variant', async () => {
		const { audio, bank } = fakeAudio();
		bank.play('step', 0.5);
		await settle();
		expect(audio.load).toHaveBeenCalledTimes(2);
		expect(audio.playBuffer).toHaveBeenCalledOnce();
		expect(audio.playBuffer.mock.calls[0]).toMatchObject([{}, { category: 'sfx', volume: 0.25 }]);
	});

	it('captions what the listener hears, with sound off too, and from the world where asked', () => {
		const { bank } = fakeAudio(false);
		const cues: CaptionCue<Id>[] = [];
		bank.oncaption = (cue) => cues.push(cue);
		bank.play('step');
		bank.play('door');
		bank.play('own');
		bank.playAt('door', [0, 0, -5]);
		bank.playAt('own', [5, 0, 0]);
		expect(cues).toEqual([
			{ id: 'door', text: 'a door creaks', direction: null },
			{ id: 'door', text: 'a door creaks', direction: 'ahead' },
			{ id: 'own', text: 'a creak', direction: 'right' }
		]);
	});
});
