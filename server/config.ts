import { DEFAULT_GAME_SERVER_PORT } from '../src/lib/shared/constants.ts';

export const config = {
	port: Number(process.env.GAME_SERVER_PORT ?? DEFAULT_GAME_SERVER_PORT),
	/**
	 * Only accept WebSockets on this path (`/ws` behind the production proxy, see
	 * docs/dev/deployment.md). Unset: any path.
	 */
	path: process.env.GAME_SERVER_PATH || undefined,
	mongoUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017',
	mongoDb: process.env.MONGODB_DB ?? 'undercroft',
	/** Accept admin/debug commands (noclip, teleport, regenerate...). Never enable for players. */
	devMode: process.env.DEV_MODE === 'true'
};
