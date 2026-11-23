/**
 * When a contact last greeted this player (NpcDef.voice), so going back and forth between pages
 * doesn't repeat it. Kept in the browser's storage (a reload doesn't reset it); without storage
 * (a private window), for as long as the page is open.
 */
const KEY = 'undercroft.greeted';
const memory: Record<string, number> = {};

function read(): Record<string, number> {
	try {
		const raw = globalThis.localStorage?.getItem(KEY);
		return raw ? { ...memory, ...(JSON.parse(raw) as Record<string, number>) } : memory;
	} catch {
		return memory;
	}
}

/** Whether it has been at least `every` seconds since `last` (ms; undefined: never). */
export function greetingDue(last: number | undefined, every: number, now: number): boolean {
	return last === undefined || now < last || now - last >= every * 1000;
}

/** True, and the time noted, if `npc` may greet now: at most once every `every` seconds. */
export function greet(npc: string, every: number, now = Date.now()): boolean {
	const greeted = read();
	if (!greetingDue(greeted[npc], every, now)) return false;
	memory[npc] = now;
	try {
		globalThis.localStorage?.setItem(KEY, JSON.stringify({ ...greeted, [npc]: now }));
	} catch {
		// No storage: the note in memory is enough for this page.
	}
	return true;
}
