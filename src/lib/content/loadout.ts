/**
 * What lies around the map for anyone to pick up. Players bring their own kit: the loadout they
 * chose on the surface (see docs/dev/economy.md).
 */

/**
 * Bricks lie only by collapsed walls (rubble-* markers in the pieces): `perRubble` of them at
 * each, fewest and most, within `radius` (m) of it.
 */
export const BRICKS = { perRubble: [1, 3] as [number, number], radius: 1.8 };
