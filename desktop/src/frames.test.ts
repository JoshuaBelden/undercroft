import { describe, expect, it } from 'vitest';
import { decodeFrame, encodeFrame, FRAME, MessageCodec } from './frames.ts';

describe('frames', () => {
	it('round-trip their kind, connection and payload', () => {
		const frame = { kind: FRAME.data, connection: 4_000_000_000, payload: Buffer.from('hi') };
		expect(decodeFrame(encodeFrame(frame))).toEqual(frame);
		const open = { kind: FRAME.open, connection: 1, payload: Buffer.alloc(0) };
		expect(decodeFrame(encodeFrame(open))).toEqual(open);
	});

	it('refuse what is not a frame', () => {
		expect(decodeFrame(Buffer.from([2, 0, 0]))).toBeNull();
		expect(decodeFrame(Buffer.from([9, 0, 0, 0, 1, 65]))).toBeNull();
	});
});

describe('message compression', () => {
	/** A tick-like message: mostly the same from one to the next. */
	const tick = (n: number): string =>
		JSON.stringify({
			type: 'tick',
			tick: n,
			players: Array.from({ length: 4 }, (_, i) => ({
				id: `player-${i}`,
				position: [10 + i, 0, 20 + n * 0.01],
				yaw: n * 0.001,
				inventory: { backpack: Array(16).fill(null), quick: [null, null, null, null] }
			})),
			creatures: Array.from({ length: 8 }, (_, i) => ({
				id: `c${i}`,
				position: [i, 0, i],
				state: 'idle'
			}))
		});

	it('gives back exactly what was sent, message after message', () => {
		const sender = new MessageCodec();
		const receiver = new MessageCodec();
		for (let n = 0; n < 50; n++) {
			const message = tick(n);
			expect(receiver.unpack(sender.pack(message))).toBe(message);
		}
		expect(receiver.unpack(sender.pack('é ✓ 🕯'))).toBe('é ✓ 🕯');
	});

	it('makes ticks after the first much smaller, using the one before', () => {
		const sender = new MessageCodec();
		const first = sender.pack(tick(0)).length;
		const second = sender.pack(tick(1)).length;
		expect(second).toBeLessThan(first / 3);
		expect(second).toBeLessThan(tick(1).length / 10);
	});

	it('keeps the two directions apart', () => {
		const a = new MessageCodec();
		const b = new MessageCodec();
		expect(b.unpack(a.pack('from a 1'))).toBe('from a 1');
		expect(a.unpack(b.pack('from b 1'))).toBe('from b 1');
		expect(b.unpack(a.pack('from a 2'))).toBe('from a 2');
		expect(a.unpack(b.pack('from b 2'))).toBe('from b 2');
	});
});
