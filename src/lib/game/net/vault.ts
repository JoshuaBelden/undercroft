import { api, loadAccount } from '#lib/account/account.svelte.ts';
import type { ClientMessage, ServerMessage } from '#lib/shared/protocol.ts';

/**
 * A co-op guest's side of the vault (docs/dev/hosting.md#the-vault): the host's game server asks
 * for this player's belongings, which are in their own save, and this client fetches and stores
 * them through its own desktop site (`/api/local/vault`). Only a host's server asks: the player's
 * own server keeps their belongings itself.
 */
export async function answerVault(
	message: Extract<ServerMessage, { type: 'vault' }>,
	send: (message: ClientMessage) => void
): Promise<void> {
	switch (message.op) {
		case 'take': {
			let reply: { kit: unknown; owned: unknown; markWheel: unknown; look?: unknown } = {
				kit: null,
				owned: [],
				markWheel: null
			};
			try {
				reply = await api('/api/local/vault', 'POST', { op: 'take', session: message.session });
			} catch (error) {
				// They go down with nothing rather than with something that isn't theirs.
				console.error('Could not take the loadout for the host', error);
			}
			send({ type: 'vault', id: message.id, ...reply });
			break;
		}
		case 'lock':
			await api('/api/local/vault', 'POST', { op: 'lock', ready: message.ready }).catch(
				(error: unknown) => console.error('Could not lock the loadout', error)
			);
			break;
		case 'return':
			await api('/api/local/vault', 'POST', {
				op: 'return',
				session: message.session,
				carried: message.carried
			}).catch((error: unknown) => console.error('Could not bring back what was carried', error));
			void loadAccount();
			break;
	}
}
