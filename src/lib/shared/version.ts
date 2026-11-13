import pkg from '../../../package.json' with { type: 'json' };

/**
 * The game's version, from package.json (`pnpm release` bumps it). Semantic versioning while in
 * beta: 0.MINOR.PATCH, a minor for each release to testers, a patch for fixes in between. Shown on
 * the About pages and logged by the game server. See docs/dev/releasing.md.
 */
export const GAME_VERSION: string = pkg.version;
