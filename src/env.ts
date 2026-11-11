import { defineEnvVars } from '@sveltejs/kit/env';

/**
 * Environment variables for the SvelteKit app. Public ones are visible to the browser and read
 * from `$app/env/public`; the rest are server-only and read from `$app/env/private`.
 * The game server reads its own variables from `process.env` (see server/config.ts).
 */
export const variables = defineEnvVars({
	PUBLIC_GAME_SERVER_URL: {
		public: true,
		description: 'WebSocket URL of the game server.',
		schema: (value) => value || 'ws://localhost:8787'
	},
	MONGODB_URI: {
		description: 'MongoDB connection string (accounts, sessions, the hub).',
		schema: (value) => value || 'mongodb://localhost:27017'
	},
	MONGODB_DB: {
		description: 'MongoDB database name.',
		schema: (value) => value || 'undercroft'
	},
	PUBLIC_DEV_MODE: {
		public: true,
		description: 'Enables admin and debug tools when "true". Never set in player builds.',
		schema: (value) => value === 'true'
	}
});
