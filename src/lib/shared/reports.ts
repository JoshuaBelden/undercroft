/**
 * What a bug report carries besides the player's words, and the ideas board as the browser sees
 * it. Sent by the client, checked by the server (src/lib/server/store/reports.ts).
 * See docs/dev/reports.md.
 */

/** Facts about the game and the machine, gathered by src/lib/game/diagnostics.ts. */
export interface Diagnostics {
	version: string;
	userAgent: string;
	/** The WebGL renderer, when the browser says. */
	gpu?: string;
	/** Window size and pixel ratio, `1920×1080 @2`. */
	screen?: string;
	/** The page the report was sent from. */
	page?: string;
	/** Underground: solo or co-op, the map seed, the room. */
	mode?: 'solo' | 'coop';
	seed?: number;
	room?: string;
	/** The F3 numbers when it was sent. */
	stats?: Record<string, number>;
	/** The latest console warnings and errors. */
	console?: string[];
}

/** An error the crash prompt asked about, sent along with the report. */
export interface CrashInfo {
	/** Where it happened: in the browser, on the site's server, or on the game server. */
	source: 'client' | 'web' | 'game';
	message: string;
	stack?: string;
	/** For an error a server already recorded: its id in `errors`. */
	errorId?: string;
}

/** The body of `POST /api/report`. */
export interface ReportInput {
	title: string;
	description: string;
	steps: string;
	diagnostics?: Diagnostics;
	crash?: CrashInfo;
}

/** An idea on the board, as a player sees it. */
export interface IdeaView {
	id: string;
	title: string;
	body: string;
	status: string;
	votes: number;
	/** This player has voted for it. */
	voted: boolean;
	/** This player suggested it. */
	mine: boolean;
	/** What the team said about it. */
	note: string | null;
	createdAt: string;
}
