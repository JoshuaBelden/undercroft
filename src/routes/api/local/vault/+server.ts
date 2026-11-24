import { error, json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { localHost } from '#lib/server/local.ts';
import { requireAccount } from '#lib/server/session.ts';
import { explorerFor } from '#lib/server/store/accounts.ts';
import {
	itemsOwned,
	markReady,
	returnFromExpedition,
	takeLoadout
} from '#lib/server/store/explorers.ts';
import { sanitizeInventory } from '#lib/shared/items/inventory.ts';
import type { RequestHandler } from './$types';

/**
 * The desktop app only: a co-op host's game server asking, through this player's own client, for
 * their belongings (docs/dev/hosting.md#the-vault). The same store calls the game server makes
 * for its own players, on this player's own save. Body: `{ op, session, ready, carried }`.
 * - `take`: their loadout leaves the save for the host's expedition: `{ kit, owned, markWheel, look }`.
 * - `lock`: ready (or not): the hub can't change their loadout meanwhile.
 * - `return`: what they carried out (null: lost) comes back.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!localHost()) error(404, 'Not found');
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const db = await database();
	const account = await requireAccount(db, locals);
	const explorer = await explorerFor(db, account._id);
	const session = typeof body.session === 'string' && body.session.length <= 64 ? body.session : '';

	switch (body.op) {
		case 'take': {
			if (!session) return json({ error: 'No expedition' }, { status: 400 });
			// What they own, before the loadout leaves: the rite's items are kept out of the map.
			const owned = [...(await itemsOwned(db, [explorer._id]))];
			const kit = await takeLoadout(db, explorer._id, session);
			return json({
				kit,
				owned,
				markWheel: explorer.markWheel ?? null,
				look: explorer.look ?? null
			});
		}
		case 'lock':
			await markReady(db, explorer._id, body.ready === true);
			return json({ ok: true });
		case 'return': {
			if (!session) return json({ error: 'No expedition' }, { status: 400 });
			const carried = body.carried === null ? null : sanitizeInventory(body.carried);
			await returnFromExpedition(db, explorer._id, session, carried);
			return json({ ok: true });
		}
		default:
			return json({ error: 'Unknown request' }, { status: 400 });
	}
};
