import { config } from './config.ts';
import { serverCrash } from './errors.ts';
import { startGameServer } from './start.ts';

/**
 * The hosted game server, as its own process (`pnpm dev:server`, and in Docker in production).
 * The desktop app starts the same server inside its own host process instead (server/start.ts,
 * docs/dev/hosting.md).
 */
const server = await startGameServer({ port: config.port, path: config.path });

async function shutdown(): Promise<void> {
	await server.stop();
	process.exit(0);
}

/*
 * Anything else that throws: recorded, then the process exits and Docker starts it again (a
 * state nobody expected is not one to keep running in). A rejected promise is only recorded.
 */
process.on('uncaughtException', (error) => {
	void serverCrash(error, 'Uncaught').finally(() => process.exit(1));
});
process.on('unhandledRejection', (reason) => {
	void serverCrash(reason, 'Unhandled rejection');
});
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
