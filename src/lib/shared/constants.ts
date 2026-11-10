/** Bump when the client/server message format changes incompatibly. */
export const PROTOCOL_VERSION = 4;

/** Server simulation ticks per second. */
export const TICK_RATE = 20;

/** Player simulation steps per second (fixed step, shared by server and client prediction). */
export const SIM_RATE = 60;

export const DEFAULT_GAME_SERVER_PORT = 8787;
export const DEFAULT_GAME_SERVER_URL = `ws://localhost:${DEFAULT_GAME_SERVER_PORT}`;
