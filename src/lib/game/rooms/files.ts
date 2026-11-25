/**
 * The rooms the dev server can show (`scripts/vite-rooms.ts`, `pnpm dev` only: the exports in
 * `art/export/rooms/`), and word when one is exported again. See docs/dev/room-viewer.md.
 */

/** Mirrors `RoomFile` in `scripts/vite-rooms.ts`. */
export interface RoomFile {
	name: string;
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

export async function findRoom(name: string): Promise<RoomFile | null> {
	return (await listRooms()).find((room) => room.name === name) ?? null;
}

/** Called whenever a room's export or lightmap is written again. Returns an unsubscribe. */
export function onRoomChanged(listener: (room: { name: string }) => void): () => void {
	const hot = import.meta.hot;
	if (!hot) return () => {};
	hot.on('room:changed', listener);
	return () => hot.off('room:changed', listener);
}
