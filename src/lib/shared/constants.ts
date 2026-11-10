/** Bump when the client/server message format changes incompatibly. */
export const PROTOCOL_VERSION = 2;

/** Server simulation ticks per second. */
export const TICK_RATE = 20;

export const DEFAULT_GAME_SERVER_PORT = 8787;
export const DEFAULT_GAME_SERVER_URL = `ws://localhost:${DEFAULT_GAME_SERVER_PORT}`;
