import { createHmac, randomBytes } from 'node:crypto';
import { ACCOUNT } from '../content/account.ts';

/**
 * Authenticator-app codes (TOTP, RFC 6238, with SHA-1 as every app expects). The secret is
 * base32, the form apps and `otpauth://` links use. See docs/dev/accounts.md#two-step-sign-in.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** A new secret: 20 random bytes, base32. */
export function generateSecret(): string {
	const bytes = randomBytes(20);
	let bits = 0;
	let value = 0;
	let out = '';
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += ALPHABET[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
	return out;
}

function decode(secret: string): Buffer {
	let bits = 0;
	let value = 0;
	const out: number[] = [];
	for (const char of secret.replace(/=+$/, '').toUpperCase()) {
		const index = ALPHABET.indexOf(char);
		if (index < 0) continue;
		value = (value << 5) | index;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
	}
	return Buffer.from(out);
}

/** The code for one time step. */
function codeAt(key: Buffer, step: number): string {
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(step));
	const mac = createHmac('sha1', key).update(counter).digest();
	const offset = mac[mac.length - 1] & 15;
	const number = mac.readUInt32BE(offset) & 0x7fffffff;
	return String(number % 10 ** ACCOUNT.totpDigits).padStart(ACCOUNT.totpDigits, '0');
}

/**
 * The time step this code belongs to, or null if it is wrong. One step either side is allowed,
 * for a phone clock that is a little off. A step at or before `usedStep` is refused, so a code
 * someone saw can't be used again.
 */
export function verifyCode(secret: string, code: string, usedStep = -1): number | null {
	const typed = code.replace(/\s/g, '');
	if (!/^\d+$/.test(typed) || typed.length !== ACCOUNT.totpDigits) return null;
	const key = decode(secret);
	const now = Math.floor(Date.now() / 1000 / ACCOUNT.totpPeriod);
	for (const step of [now - 1, now, now + 1]) {
		if (step > usedStep && codeAt(key, step) === typed) return step;
	}
	return null;
}

/** The link an authenticator app reads from the QR code. */
export function otpauthUrl(secret: string, email: string): string {
	const label = encodeURIComponent(`Undercroft:${email}`);
	const params = new URLSearchParams({
		secret,
		issuer: 'Undercroft',
		digits: String(ACCOUNT.totpDigits),
		period: String(ACCOUNT.totpPeriod)
	});
	return `otpauth://totp/${label}?${params}`;
}
