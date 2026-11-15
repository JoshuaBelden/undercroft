import sharp from 'sharp';
import { AVATAR } from '../content/account.ts';

/**
 * Turns an uploaded picture into the avatar we keep: a `AVATAR.size` square WebP. Whatever the
 * browser sent is decoded and drawn again, so only pixels survive: no metadata (a phone photo's
 * location goes), and nothing that isn't a picture. See docs/dev/accounts.md#avatars.
 *
 * The crop editor already sends a square; anything else is cropped to its middle.
 */
export async function processAvatar(bytes: Uint8Array): Promise<Buffer | null> {
	if (bytes.byteLength === 0 || bytes.byteLength > AVATAR.maxUploadBytes) return null;
	try {
		return await sharp(bytes, {
			// The crop editor sends 512 square; a few times that is still a sensible picture.
			limitInputPixels: (AVATAR.uploadSize * 4) ** 2,
			failOn: 'error'
		})
			.rotate()
			.resize(AVATAR.size, AVATAR.size, { fit: 'cover' })
			.webp({ quality: AVATAR.quality })
			.toBuffer();
	} catch {
		return null;
	}
}
