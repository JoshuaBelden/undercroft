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
	RESEND_API_KEY: {
		description:
			'Resend API key, for password-reset emails. Without it the email is written to the server log.',
		schema: (value) => value ?? ''
	},
	MAIL_FROM: {
		description: 'Who emails come from (an address on the domain verified with Resend).',
		schema: (value) => value || 'Undercroft <noreply@undercroft.us>'
	},
	DISCORD_CLIENT_ID: {
		description: 'Discord application client id, for "Sign in with Discord". Empty hides it.',
		schema: (value) => value ?? ''
	},
	DISCORD_CLIENT_SECRET: {
		description: 'Discord application client secret.',
		schema: (value) => value ?? ''
	},
	PUBLIC_DEV_MODE: {
		public: true,
		description: 'Enables admin and debug tools when "true". Never set in player builds.',
		schema: (value) => value === 'true'
	}
});
