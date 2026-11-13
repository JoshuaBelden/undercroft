// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			/** The signed-in admin (set in hooks.server.ts); null on the sign-in page. */
			admin: { id: string; email: string; gamerTag: string } | null;
		}
	}
}

export {};
