// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			/** A bug on the server: its id in `errors`, so a report about it is grouped with it. */
			errorId?: string;
		}
		interface Locals {
			/** The signed-in account (set in hooks.server.ts); null on the sign-in pages. */
			account: { id: string; email: string; gamerTag: string } | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
