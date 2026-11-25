/**
 * The rooms the dev server can show (`scripts/vite-rooms.ts`, `pnpm dev` only), and word when one
 * is exported again. See docs/dev/room-viewer.md.
 */

export type RoomGroup = 'rooms' | 'kit';

/** Mirrors `RoomFile` in `scripts/vite-rooms.ts`. */
export interface RoomFile {
	name: string;
	/** `rooms`: the fixed map's (`art/export/rooms/`); `kit`: the old generator's pieces. */
	group: RoomGroup;
	url: string;
	bytes: number;
	changed: number;
	lightmap: string | null;
}

export async function listRooms(): Promise<RoomFile[]> {
	const response = await fetch('/__rooms');
	if (!response.ok) throw new Error(`The dev server has no room list (${response.status})`);
	return (await response.json()) as RoomFile[];
}

/** One room by name: a fixed-map room before an old kit piece of the same name. */
export async function findRoom(name: string): Promise<RoomFile | null> {
	const rooms = await listRooms();
	return (
		rooms.find((r) => r.name === name && r.group === 'rooms') ??
		rooms.find((r) => r.name === name) ??
		null
	);
}

/** Called whenever a room's export or lightmap is written again. Returns an unsubscribe. */
export function onRoomChanged(
	listener: (room: { group: RoomGroup; name: string }) => void
): () => void {
	const hot = import.meta.hot;
	if (!hot) return () => {};
	hot.on('room:changed', listener);
	return () => hot.off('room:changed', listener);
}
