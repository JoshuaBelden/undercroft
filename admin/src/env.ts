import { defineEnvVars } from '@sveltejs/kit/env';

/**
 * Environment variables for the admin app (docs/dev/admin.md). All server-only. In development
 * they come from the game's .env, one folder up.
 */
export const variables = defineEnvVars({
	MONGODB_URI: {
		description: 'MongoDB connection string: the same database as the game.',
		schema: (value) => value || 'mongodb://localhost:27017'
	},
	MONGODB_DB: {
		description: 'MongoDB database name.',
		schema: (value) => value || 'undercroft'
	},
	GAME_ORIGIN: {
		description: "The game site's origin, for links in emails sent from here (password resets).",
		schema: (value) => value || 'http://localhost:5173'
	},
	RESEND_API_KEY: {
		description:
			'Resend API key, for the password resets sent from here. Empty: written to the log.',
		schema: (value) => value ?? ''
	},
	MAIL_FROM: {
		description: 'Who emails come from (an address on the domain verified with Resend).',
		schema: (value) => value || 'Undercroft <noreply@undercroft.us>'
	},
	GITHUB_TOKEN: {
		description:
			'Fine-grained GitHub token with Issues read/write on GITHUB_REPO. Empty: no filing.',
		schema: (value) => value ?? ''
	},
	GITHUB_REPO: {
		description: 'Where bug reports are filed, as owner/name.',
		schema: (value) => value || 'JoshuaBelden/undercroft'
	}
});
