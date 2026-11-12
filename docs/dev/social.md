# Friends and invites

Players find each other by gamer tag, become friends when a request is accepted, and invite friends who are online to their party. There are no invite codes. Everything goes over the game server connection, so requests, answers, who is online and invites all show up as they happen.

## Files

| What                                      | Where                                                  |
| ----------------------------------------- | ------------------------------------------------------ |
| Friendships in MongoDB                    | `src/lib/server/store/friends.ts`                      |
| Requests, presence and invites            | `server/social.ts` (`Social`)                          |
| What a client is sent, and what it can do | `src/lib/shared/social/types.ts`                       |
| Invite lifetime                           | `PARTY.inviteSeconds` (`src/lib/content/party.ts`)     |
| Client state                              | `connection.social`, `connection.search`, `social()`   |
| The Social page                           | `src/lib/ui/Social.svelte`, `src/routes/(hub)/social/` |
| Its button and key                        | `src/routes/(hub)/+layout.svelte`, `toggleSocial` (O)  |

## Friendships

The `friends` collection has one document per pair of accounts: `_id` is the two account ids sorted and joined, `accounts` holds both (indexed), `requester` is who asked, and `status` is `pending` or `accepted`.

- `requestFriend` creates a pending document. If the other account had already asked, it accepts that instead.
- `acceptFriend` only works for the account that was asked.
- `removeFriend` deletes the document: declining a request, taking one back and ending a friendship are the same thing.
- `searchTags` finds accounts whose gamer tag starts with what was typed (on the lower-cased `tagKey`), at most `SOCIAL.searchResults`, never yourself.

## Messages

The client sends `social { action }` (`SocialAction`): `refresh`, `search`, `request`, `accept`, `decline`, `remove`, `invite`, `acceptInvite`, `declineInvite`. Each names the other account by id.

The server answers a search with `socialSearch { query, results }`, and otherwise sends the account its whole `SocialState` (`social { state }`) whenever anything in it changes:

- `friends`: each with a `status` (`offline`, `online`, `inParty`, `underground`) and `withYou` (in your party);
- `incoming` and `outgoing` friend requests;
- `invites` (friends who have invited you) and `invited` (friends you have invited who have not answered).

A refusal comes as `partyError { reason }`, like party refusals, and shows on the social screen and in the launch panel.

## How the server keeps it current

`Social` keeps, for each account that is here, its friendships as last read from MongoDB and the last state it was sent (so nothing is sent when nothing changed).

- After a friend action it reads both accounts' friendships again and sends each their state.
- `Parties` calls `onPresence(accounts)` whenever it tells a party anything, and when a member is removed for good (not when they are only moving to another party: joining, leaving or being kicked, where the next party's update covers them). `Social` then sends a new state to those accounts and to everyone here who has one of them as a friend. Status comes from `Parties.presence`, so it needs no database read.
- A new connection always gets its state (`Social.connected`).

## Invites

Invites are in memory only.

- To invite, the two must be friends, the friend must be online and on their own (not underground, and not in a party with anyone, yours or another), and your party must not be full or underground.
- An invite lasts `PARTY.inviteSeconds` (60 s). Inviting again starts it over. It is dropped if either side goes offline or underground, if the invited friend joins a party, or if the friendship ends.
- Accepting calls `Parties.join`, which moves the member to the inviter's party if it still has room and is on the surface. Joining makes the member not ready, and a new arrival stops a countdown.

## The Social page

`/social` (`src/routes/(hub)/social/+page.svelte`, drawing `Social.svelte`) is a full-width dashboard page. A column on the left holds Find players over Friends, and the friends list takes all the height that is left (`.side` in `Social.svelte`); the Party panel sits to its right:

- **Find players:** the gamer tag search, friend requests waiting for you, and the ones you sent.
- **Friends:** every friend, online or not: those who are here first. Refusals from the server show at the top of this panel. Invite (only for a friend who is online and not in a party, while your party has room and is on the surface) and Remove.
- **Party** (right of that column): only there when there is a party to show, so a player on their own does not see it. It appears once you invite someone, who is listed as "Invited: waiting for them to accept" under you until they answer (from `SocialState.invited`), or once someone invites you. It shows invites waiting for you, then everyone in your party with their state (Ready, Not ready, Underground, Reconnecting), then the friends you have invited. The host has a Kick button beside each other member; anyone in a party of more than one has Leave party.

It works out what each search result already is to you (friend, requested, asking) from `connection.social`, so the buttons stay right as answers arrive. Kick takes two clicks; Remove asks in a confirmation `Dialog` first.

The Social button in the frame is a link to the page and shows how many requests and invites are waiting. The `toggleSocial` action (O) goes to the page, and from the page back to Expedition.

## Kicking

`kick { member }` (a member id) is a party message, handled by `Parties.kick`: host only, never during an expedition, never yourself. The member is moved to a new party of their own, exactly as if they had left, and is told why with `partyError`. Being moved makes them not ready, which unlocks their loadout, and their leaving stops a countdown.

## Adding to it

- A new action: add it to `SocialAction`, handle it in `Social.act`, and call it with `social({ kind: ... })`.
- Something new for clients to see: add it to `SocialState` and fill it in `Social.state`; it is sent whenever it changes.
- Text chat is not built. It belongs on this connection and this page.
