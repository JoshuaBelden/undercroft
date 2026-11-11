import { getDb } from './db.ts';
import { log } from './log.ts';

/** What one player has learned about one Affliction's rite, kept across expeditions. */
interface ProgressDoc {
	/** `<player>:<affliction>` */
	_id: string;
	player: string;
	affliction: string;
	/** Clues found so far. */
	clues?: number;
	/** The rite has been performed: the Affliction is resolved for this player. */
	resolved?: boolean;
}

const COLLECTION = 'progress';

/**
 * Rite progress per player and Affliction. Stored in MongoDB; without a database it is kept in
 * memory, so it lasts until the server restarts. Players are identified by the id their browser
 * sends in `hello` until accounts exist (Phase 5). See docs/dev/rite.md.
 */
export class Progress {
	private memory = new Map<string, { clues: number; resolved: boolean }>();

	/** The most any of these players knows. */
	async best(players: string[], affliction: string): Promise<{ clues: number }> {
		const keys = players.map((player) => key(player, affliction));
		let clues = 0;
		for (const k of keys) clues = Math.max(clues, this.memory.get(k)?.clues ?? 0);
		const db = getDb();
		if (db) {
			try {
				const docs = await db
					.collection<ProgressDoc>(COLLECTION)
					.find({ _id: { $in: keys } })
					.toArray();
				for (const doc of docs) clues = Math.max(clues, doc.clues ?? 0);
			} catch (error) {
				log.warn(`Could not read rite progress: ${(error as Error).message}`);
			}
		}
		return { clues };
	}

	/** Record clues found (never lowers a count) and, once performed, the resolution. */
	record(
		players: string[],
		affliction: string,
		progress: { clues?: number; resolved?: boolean }
	): void {
		if (players.length === 0) return;
		for (const player of players) {
			const k = key(player, affliction);
			const now = this.memory.get(k) ?? { clues: 0, resolved: false };
			this.memory.set(k, {
				clues: Math.max(now.clues, progress.clues ?? 0),
				resolved: now.resolved || progress.resolved === true
			});
		}
		const db = getDb();
		if (!db) return;
		const operations = players.map((player) => ({
			updateOne: {
				filter: { _id: key(player, affliction) },
				update: {
					$setOnInsert: { player, affliction },
					...(progress.clues !== undefined ? { $max: { clues: progress.clues } } : {}),
					...(progress.resolved ? { $set: { resolved: true } } : {})
				},
				upsert: true
			}
		}));
		db.collection<ProgressDoc>(COLLECTION)
			.bulkWrite(operations)
			.catch((error: Error) => log.warn(`Could not save rite progress: ${error.message}`));
	}

	/** Forget what these players know (admin). */
	reset(players: string[], affliction: string): void {
		const keys = players.map((player) => key(player, affliction));
		for (const k of keys) this.memory.delete(k);
		getDb()
			?.collection<ProgressDoc>(COLLECTION)
			.deleteMany({ _id: { $in: keys } })
			.catch((error: Error) => log.warn(`Could not reset rite progress: ${error.message}`));
	}
}

function key(player: string, affliction: string): string {
	return `${player}:${affliction}`;
}
