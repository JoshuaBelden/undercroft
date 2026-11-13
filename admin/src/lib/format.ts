/** How the admin app writes times and amounts. */

/** `2026-11-12 19:42`, in the admin's own time zone. */
export function formatTime(date: Date | string | undefined | null): string {
	if (!date) return '';
	const d = new Date(date);
	const pad = (n: number): string => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `3 h ago`, `2 d ago`: for "last seen". */
export function ago(date: Date | string | undefined | null, now = Date.now()): string {
	if (!date) return 'never';
	const seconds = Math.max(0, (now - new Date(date).getTime()) / 1000);
	if (seconds < 90) return 'just now';
	if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
	if (seconds < 129600) return `${Math.round(seconds / 3600)} h ago`;
	return `${Math.round(seconds / 86400)} d ago`;
}

/** Seconds as `12:05` (minutes and seconds), or `1:02:05` past an hour. */
export function duration(seconds: number): string {
	const s = Math.round(seconds);
	const pad = (n: number): string => String(n).padStart(2, '0');
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
