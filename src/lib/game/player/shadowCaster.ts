/**
 * "Teammate lamp shadows: Nearest" (docs/dev/player.md#teammate-shadows): which teammate's lamp
 * casts shadows. The nearest lit one, but the current one keeps it until another is closer by
 * `margin` metres, so two teammates side by side don't swap it back and forth every frame.
 *
 * With teammates there, someone is always picked, lit or not: the number of shadow-casting lights
 * is compiled into every material, so going from one to none would recompile them all (a freeze).
 * An unlit lamp's shadow map isn't redrawn, so it costs nothing. Null only with nobody there.
 */
export function pickShadowCaster(
	lamps: { id: string; distance: number; lit: boolean }[],
	current: string | null,
	margin: number
): string | null {
	const nearest = (list: typeof lamps) =>
		list.reduce<(typeof lamps)[number] | null>(
			(best, lamp) => (!best || lamp.distance < best.distance ? lamp : best),
			null
		);
	const lit = lamps.filter((lamp) => lamp.lit);
	const kept = lamps.find((lamp) => lamp.id === current);
	const best = nearest(lit);
	if (!best) return (kept ?? nearest(lamps))?.id ?? null;
	if (kept?.lit && kept.distance - best.distance < margin) return kept.id;
	return best.id;
}
