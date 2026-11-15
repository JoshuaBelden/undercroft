import { describe, expect, it } from 'vitest';
import { avatarUrl, discordAvatarUrl, isDiscordAvatar, uploadedAvatarUrl } from './avatar.ts';

const HASH = '0123456789abcdef0123456789abcdef';

describe('avatars', () => {
	it('an upload comes first, then Discord, then none', () => {
		const discord = { id: '80351110224678912', avatar: HASH };
		expect(avatarUrl({ id: 'acc', upload: 7, discord })).toBe('/avatars/acc?v=7');
		expect(avatarUrl({ id: 'acc', discord })).toBe(
			`https://cdn.discordapp.com/avatars/80351110224678912/${HASH}.webp?size=256`
		);
		expect(avatarUrl({ id: 'acc', discord: { id: '1', avatar: null } })).toBeNull();
		expect(avatarUrl({ id: 'acc', discord: { id: '1' } })).toBeNull();
		expect(avatarUrl({ id: 'acc' })).toBeNull();
	});

	it('only takes Discord ids and hashes that are safe in a URL', () => {
		expect(isDiscordAvatar(HASH)).toBe(true);
		expect(isDiscordAvatar(`a_${HASH}`)).toBe(true);
		expect(isDiscordAvatar('../../evil')).toBe(false);
		expect(isDiscordAvatar(HASH.toUpperCase())).toBe(false);
		expect(isDiscordAvatar(42)).toBe(false);
		expect(discordAvatarUrl('12/34', HASH)).toBeNull();
		expect(discordAvatarUrl('1234', '?x=1')).toBeNull();
	});

	it('escapes the account id in an upload URL', () => {
		expect(uploadedAvatarUrl('a/b', 1)).toBe('/avatars/a%2Fb?v=1');
	});
});
