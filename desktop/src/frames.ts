import { constants, deflateRawSync, inflateRawSync } from 'node:zlib';

/**
 * The tunnel's frames (docs/dev/hosting.md#the-tunnel): a co-op guest's WebSocket messages to and
 * from the host's game server, carried as Steam P2P packets. One byte for the kind, four for the
 * connection (a guest's page can reconnect, so there can be several), then the payload.
 * Pure, so it is unit tested without Steam.
 */

export const FRAME = { open: 1, data: 2, close: 3 } as const;
export type FrameKind = (typeof FRAME)[keyof typeof FRAME];

export interface Frame {
	kind: FrameKind;
	connection: number;
	payload: Buffer;
}

/** Steam's limit for a reliable packet is 1 MB; nothing the game sends comes near it. */
export const MAX_FRAME = 1024 * 1024 - 16;

export function encodeFrame(frame: Frame): Buffer {
	const head = Buffer.alloc(5);
	head.writeUInt8(frame.kind, 0);
	head.writeUInt32BE(frame.connection >>> 0, 1);
	return Buffer.concat([head, frame.payload]);
}

/** A frame from a packet, or null if it isn't one. */
export function decodeFrame(packet: Buffer): Frame | null {
	if (packet.length < 5) return null;
	const kind = packet.readUInt8(0);
	if (kind !== FRAME.open && kind !== FRAME.data && kind !== FRAME.close) return null;
	return { kind, connection: packet.readUInt32BE(1), payload: packet.subarray(5) };
}

/** zlib's dictionary is at most 32 KB: the end of the previous message is what helps most. */
const DICTIONARY = 32 * 1024;

/**
 * Compression for one direction of one connection. Each message is compressed with the one before
 * it as the dictionary: ticks are nearly the same each time, so a four-player tick of about 8 KB
 * goes as a few hundred bytes, as with the WebSocket's own permessage-deflate. Both ends keep the
 * last message, which works because Steam's reliable packets arrive once and in order.
 */
export class MessageCodec {
	private sentLast: Buffer = Buffer.alloc(0);
	private receivedLast: Buffer = Buffer.alloc(0);

	pack(message: string): Buffer {
		const data = Buffer.from(message, 'utf8');
		const packed =
			this.sentLast.length > 0
				? deflateRawSync(data, { level: 3, dictionary: this.sentLast })
				: deflateRawSync(data, { level: 3 });
		this.sentLast = data.subarray(Math.max(0, data.length - DICTIONARY));
		return packed;
	}

	unpack(packed: Buffer): string {
		const data =
			this.receivedLast.length > 0
				? inflateRawSync(packed, {
						dictionary: this.receivedLast,
						finishFlush: constants.Z_SYNC_FLUSH
					})
				: inflateRawSync(packed, { finishFlush: constants.Z_SYNC_FLUSH });
		this.receivedLast = data.subarray(Math.max(0, data.length - DICTIONARY));
		return data.toString('utf8');
	}
}
