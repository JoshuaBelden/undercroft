import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { AVATAR } from '../content/account.ts';
import { processAvatar } from './avatarImage.ts';

/** A plain picture of this size, as a browser might send one. */
const picture = (width: number, height: number, format: 'png' | 'jpeg' = 'png') =>
	sharp({ create: { width, height, channels: 3, background: { r: 120, g: 30, b: 20 } } })
		[format]()
		.toBuffer();

describe('processAvatar', () => {
	it('stores a square WebP of the avatar size, whatever came in', async () => {
		for (const [width, height] of [
			[512, 512],
			[800, 300],
			[64, 64]
		]) {
			const out = await processAvatar(await picture(width, height));
			expect(out).not.toBeNull();
			const meta = await sharp(out!).metadata();
			expect([meta.format, meta.width, meta.height]).toEqual(['webp', AVATAR.size, AVATAR.size]);
		}
	});

	it('drops the metadata (a phone photo says where it was taken)', async () => {
		const tagged = await sharp(await picture(300, 300, 'jpeg'))
			.withExif({ IFD0: { Copyright: 'Someone' } })
			.jpeg()
			.toBuffer();
		expect((await sharp(tagged).metadata()).exif).toBeDefined();
		const out = await processAvatar(tagged);
		expect((await sharp(out!).metadata()).exif).toBeUndefined();
	});

	it('refuses what is not a picture, nothing, too many bytes and too many pixels', async () => {
		expect(await processAvatar(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
		expect(await processAvatar(new Uint8Array(0))).toBeNull();
		expect(await processAvatar(new Uint8Array(AVATAR.maxUploadBytes + 1))).toBeNull();
		const huge = await sharp({
			create: { width: 4000, height: 4000, channels: 3, background: { r: 0, g: 0, b: 0 } }
		})
			.png({ compressionLevel: 9 })
			.toBuffer();
		expect(huge.byteLength).toBeLessThan(AVATAR.maxUploadBytes);
		expect(await processAvatar(huge)).toBeNull();
	});
});
