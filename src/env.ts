import { defineEnvVars } from '@sveltejs/kit/env';

/**
 * Client-visible environment variables. Read them from `$app/env/public`.
 * The game server reads its own variables from `process.env` (see server/config.ts).
 */
export const variables = defineEnvVars({
	PUBLIC_GAME_SERVER_URL: {
		public: true,
		description: 'WebSocket URL of the game server.',
		schema: (value) => value || 'ws://localhost:8787'
	},
	PUBLIC_DEV_MODE: {
		public: true,
		description: 'Enables admin and debug tools when "true". Never set in player builds.',
		schema: (value) => value === 'true'
	}
});
