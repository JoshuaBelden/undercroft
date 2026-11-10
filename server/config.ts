import { DEFAULT_GAME_SERVER_PORT } from '../src/lib/shared/constants.ts';

export const config = {
	port: Number(process.env.GAME_SERVER_PORT ?? DEFAULT_GAME_SERVER_PORT),
	mongoUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017',
	mongoDb: process.env.MONGODB_DB ?? 'undercroft'
};
