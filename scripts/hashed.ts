/**
 * Content-hashed file names for built assets. A file's name changes whenever its contents do,
 * so every built file can be cached forever (see docs/dev/asset-pipeline.md).
 */
import { createHash } from 'node:crypto';

/** Hex SHA-256 of some data, cut to `length` characters. */
export function contentHash(data: Uint8Array | string, length = 8): string {
	return createHash('sha256').update(data).digest('hex').slice(0, length);
}

/** `name.ext` -> `name.<hash>.ext`, hashed over the file's contents. */
export function hashedName(file: string, data: Uint8Array | string): string {
	const dot = file.lastIndexOf('.');
	return `${file.slice(0, dot)}.${contentHash(data)}${file.slice(dot)}`;
}
