/**
 * Affliction definitions (data): how fast the meter fills, what each omen stage does, and how
 * the Affliction manifests. The meter is never shown to players; they read it through omens.
 * See docs/dev/affliction.md.
 */

export interface OmenStage {
	/** Meter fraction (0..1) at which this stage begins. */
	at: number;
	/** Baseline lamp failure for everyone (0..1, see PlayerState.gloom). */
	gloom: number;
	/** Ambience: multipliers on distant knocks and creepy swells, whispers per minute, drone 0..1. */
	ambience: { knocks: number; swells: number; whispers: number; drone: number };
	/** Creatures perceive and hear further by this factor, and creep for less time. */
	boldness: number;
	/** Extra creatures that appear when this stage begins (far from players). */
	spawn: number;
}

export interface ManifestationSpec {
	/** Seconds it gathers (lamps failing everywhere) before it starts hunting. */
	gatherSeconds: number;
	/** Hunting speed (m/s), and faster where no lamp lights it. */
	speed: number;
	darkSpeed: number;
	/** Inside this radius (m) sanity drains at `drain` per second. */
	radius: number;
	drain: number;
	/** Its core: touching it hits for `touchDamage` every `touchInterval` seconds. */
	core: number;
	touchDamage: number;
	touchInterval: number;
	/** Lamps within this distance (m) fail, completely at the core. */
	gutterRadius: number;
	/** Lamp light on its core (lamp units, summed over players) that exposes it. */
	exposeLight: number;
	/** Seconds it stays exposed after the light leaves it. */
	exposeLinger: number;
	/** Damage it takes while exposed before it's banished. Unexposed, hits only slow it. */
	health: number;
	/** Seconds a hit slows it when it isn't exposed. */
	slowSeconds: number;
	/** Spawns at least this far (m, along the grid) from every player. */
	spawnDistance: number;
	/** Hit capsule. */
	hitRadius: number;
	hitHeight: number;
}

export interface AfflictionDef {
	id: string;
	/** Player-facing name (results screen, help). */
	name: string;
	meter: {
		/** Seconds underground (with anyone inside) for time alone to fill it. */
		seconds: number;
		/** Meter added per creature killed. */
		perKill: number;
		/** Meter added per unit of loot value carried (loot arrives in Phase 6). */
		perLoot: number;
	};
	/** Omen stages, ascending by `at`. Stage 0 (no omens) is implicit below the first. */
	stages: OmenStage[];
	manifestation: ManifestationSpec;
}

export const AFFLICTIONS: Record<string, AfflictionDef> = {
	gloaming: {
		id: 'gloaming',
		name: 'The Gloaming',
		meter: { seconds: 1800, perKill: 0.04, perLoot: 0 },
		stages: [
			{
				at: 0.25,
				gloom: 0,
				ambience: { knocks: 1.6, swells: 1.5, whispers: 0, drone: 0 },
				boldness: 1.1,
				spawn: 0
			},
			{
				at: 0.5,
				gloom: 0.15,
				ambience: { knocks: 2.2, swells: 2, whispers: 0.6, drone: 0 },
				boldness: 1.2,
				spawn: 0
			},
			{
				at: 0.75,
				gloom: 0.3,
				ambience: { knocks: 2.8, swells: 2.5, whispers: 1.2, drone: 0.5 },
				boldness: 1.3,
				spawn: 1
			},
			{
				at: 0.9,
				gloom: 0.45,
				ambience: { knocks: 3.5, swells: 3, whispers: 2, drone: 0.9 },
				boldness: 1.4,
				spawn: 0
			}
		],
		manifestation: {
			gatherSeconds: 10,
			speed: 1.4,
			darkSpeed: 2.4,
			radius: 3.5,
			drain: 8,
			core: 1.2,
			touchDamage: 40,
			touchInterval: 1.5,
			gutterRadius: 7,
			exposeLight: 0.12,
			exposeLinger: 2.5,
			health: 300,
			slowSeconds: 0.3,
			spawnDistance: 30,
			hitRadius: 1,
			hitHeight: 2.2
		}
	}
};

export const DEFAULT_AFFLICTION = AFFLICTIONS.gloaming;
