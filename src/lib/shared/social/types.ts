/**
 * Friends and party invites, as one account sees them. The game server owns them
 * (server/social.ts) and sends the whole `SocialState` whenever it changes.
 * See docs/dev/social.md.
 */

/** Another player, as shown in lists. */
export interface Person {
	/** Account id. */
	account: string;
	/** Gamer tag. */
	name: string;
}

/** What a friend is doing: not connected, alone on the surface, in a party, or in an expedition. */
export type FriendStatus = 'offline' | 'online' | 'inParty' | 'underground';

export interface Friend extends Person {
	status: FriendStatus;
	/** They are in your party. */
	withYou: boolean;
}

export interface SocialState {
	friends: Friend[];
	/** Friend requests waiting for your answer. */
	incoming: Person[];
	/** Friend requests you sent that have not been answered. */
	outgoing: Person[];
	/** Friends who have invited you to their party. */
	invites: Person[];
	/** Friends you have invited who have not answered yet (account ids). */
	invited: string[];
}

export type SocialAction =
	/** Send the lists again. */
	| { kind: 'refresh' }
	/** Find players whose gamer tag starts with `query`. */
	| { kind: 'search'; query: string }
	/** Ask to be friends (or accept, if they already asked you). */
	| { kind: 'request'; account: string }
	| { kind: 'accept'; account: string }
	/** Turn a request down, or take back one you sent. */
	| { kind: 'decline'; account: string }
	| { kind: 'remove'; account: string }
	/** Invite a friend to your party. */
	| { kind: 'invite'; account: string }
	| { kind: 'acceptInvite'; account: string }
	| { kind: 'declineInvite'; account: string };

export const SOCIAL = {
	/** Fewest characters of a gamer tag to search for. */
	searchMin: 2,
	/** Most search results returned. */
	searchResults: 12
};
