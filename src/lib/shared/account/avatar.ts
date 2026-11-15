import { AVATAR } from '../../content/account.ts';

/**
 * Where an account's avatar is shown from (docs/dev/accounts.md#avatars). A picture the player
 * uploaded comes first; without one, a linked Discord account's avatar; without that, none (the
 * screens draw a figure in the dark).
 */
export interface AvatarSource {
	/** The account id. */
	id: string;
	/** The version of the picture they uploaded, if they have one. */
	upload?: number;
	/** Their linked Discord account and its avatar hash (null: Discord's default picture). */
	discord?: { id: string; avatar?: string | null };
}

/** A Discord user id: a snowflake. */
const DISCORD_ID = /^\d{1,24}$/;
/** A Discord avatar hash: 32 hex digits, `a_` first if it is animated. */
const DISCORD_HASH = /^(a_)?[0-9a-f]{32}$/;

/** Whether this is an avatar hash Discord could have sent (it goes into a URL). */
export const isDiscordAvatar = (hash: unknown): hash is string =>
	typeof hash === 'string' && DISCORD_HASH.test(hash);

/** The URL of an uploaded avatar. The version changes with every upload, so it can be cached for good. */
export const uploadedAvatarUrl = (accountId: string, version: number): string =>
	`/avatars/${encodeURIComponent(accountId)}?v=${version}`;

/** A Discord avatar on Discord's image server, as a still picture. */
export function discordAvatarUrl(
	discordId: string,
	hash: string | null | undefined
): string | null {
	if (!DISCORD_ID.test(discordId) || !isDiscordAvatar(hash)) return null;
	return `https://cdn.discordapp.com/avatars/${discordId}/${hash}.webp?size=${AVATAR.size}`;
}

/** The avatar to show for an account, or null for none. */
export function avatarUrl(source: AvatarSource): string | null {
	if (source.upload !== undefined) return uploadedAvatarUrl(source.id, source.upload);
	if (source.discord) return discordAvatarUrl(source.discord.id, source.discord.avatar);
	return null;
}
