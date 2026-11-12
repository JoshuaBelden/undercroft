/**
 * Dev tool: puts a set of items in an explorer's stash, so every slot, filter and menu on the
 * Loadout page has something to try. It adds to what is there, and stops when the stash is full.
 *
 *   pnpm dev:seed              every explorer in the database
 *   pnpm dev:seed <email>      only that account's explorer
 *
 * It refuses an explorer who is underground: the game server owns their belongings then.
 * See docs/dev/economy.md (Testing).
 */
import { MongoClient } from 'mongodb';
import { ITEMS } from '../src/lib/content/items.ts';
import {
	explorerFor,
	type AccountDoc,
	type ExplorerDoc
} from '../src/lib/server/store/accounts.ts';
import { addToSlots, newStack } from '../src/lib/shared/items/inventory.ts';

/** What is handed out: some of every kind, enough to stack, split and fill each slot. */
const SEED: { item: string; count: number }[] = [
	{ item: 'knife', count: 1 },
	{ item: 'crowbar', count: 1 },
	{ item: 'revolver', count: 1 },
	{ item: 'shotgun', count: 1 },
	{ item: 'coat', count: 1 },
	{ item: 'ammo.revolver', count: 36 },
	{ item: 'ammo.shotgun', count: 20 },
	{ item: 'bandage', count: 8 },
	{ item: 'salts', count: 4 },
	{ item: 'battery', count: 4 },
	{ item: 'brick', count: 2 },
	{ item: 'chalk', count: 3 },
	{ item: 'candle', count: 6 },
	{ item: 'coins', count: 30 },
	{ item: 'rosary', count: 3 },
	{ item: 'tooth', count: 4 },
	{ item: 'signet', count: 2 },
	{ item: 'candlestick', count: 1 },
	{ item: 'chalice', count: 1 },
	{ item: 'relic', count: 1 }
];
/** Money added, to try the store with. */
const MONEY = 500;

const email = process.argv[2]?.trim().toLowerCase();
const client = new MongoClient(process.env.MONGODB_URI ?? 'mongodb://localhost:27017', {
	serverSelectionTimeoutMS: 3000
});
await client.connect();
const db = client.db(process.env.MONGODB_DB ?? 'undercroft');

const accounts = await db
	.collection<AccountDoc>('accounts')
	.find(email ? { email } : {})
	.toArray();
if (accounts.length === 0) console.log(email ? `No account for ${email}` : 'No accounts yet');

for (const account of accounts) {
	// Also brings an explorer from before slots up to date.
	const explorer = await explorerFor(db, account._id);
	if (explorer.underground !== null) {
		console.log(`${account.gamerTag}: underground, left alone`);
		continue;
	}
	const missed: string[] = [];
	for (const { item, count } of SEED) {
		if (!ITEMS[item]) continue;
		const left = addToSlots(explorer.stash, newStack(item, count));
		if (left > 0) missed.push(`${ITEMS[item].name} × ${left}`);
	}
	await db
		.collection<ExplorerDoc>('explorers')
		.updateOne(
			{ _id: explorer._id, underground: null },
			{ $set: { stash: explorer.stash }, $inc: { money: MONEY } }
		);
	console.log(
		`${account.gamerTag}: stash filled, ${MONEY} added` +
			(missed.length ? ` (no room for ${missed.join(', ')})` : '')
	);
}
await client.close();
