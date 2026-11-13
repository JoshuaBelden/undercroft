/**
 * Make an account an admin (or stop it being one), from the command line. This is how the first
 * admin is made; after that, admins can do it from the admin app's member page.
 *
 *   pnpm admin:grant <email>            make them an admin
 *   pnpm admin:grant <email> --remove   take it away
 *
 * The admin app also needs two-step sign-in on the account (the game's Account screen).
 * On the droplet, see docs/dev/deployment.md. See docs/dev/admin.md.
 */
import { MongoClient } from 'mongodb';
import { cleanEmail } from '../src/lib/content/account.ts';
import { accountByEmail } from '../src/lib/server/store/auth.ts';
import { audit, setRole } from '../src/lib/server/store/admin.ts';

const email = cleanEmail(process.argv[2]);
const remove = process.argv.includes('--remove');
if (!email) {
	console.log('Usage: pnpm admin:grant <email> [--remove]');
	process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI ?? 'mongodb://localhost:27017', {
	serverSelectionTimeoutMS: 3000
});
await client.connect();
const db = client.db(process.env.MONGODB_DB ?? 'undercroft');

const account = await accountByEmail(db, email);
if (!account) {
	console.log(`No account for ${email}`);
} else {
	await setRole(db, account._id, !remove);
	await audit(
		db,
		{ id: 'script', gamerTag: 'pnpm admin:grant' },
		remove ? 'removeAdmin' : 'grantAdmin',
		account._id,
		account.gamerTag
	);
	console.log(`${account.gamerTag} (${email}) is ${remove ? 'no longer an admin' : 'an admin'}`);
	if (!remove && !account.totp) {
		console.log('Turn on two-step sign-in on their Account screen before they use the admin app.');
	}
}
await client.close();
