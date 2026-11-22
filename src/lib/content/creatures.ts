import type { AnimSlot, AnimationMap } from './animations.ts';
import type { SoundId } from './audio/sounds.ts';
import type { ConditionId } from './player/conditions.ts';
import type { MovementTuning } from './player/movement.ts';
import { MOVEMENT } from './player/movement.ts';
import { modelUrl } from './models.ts';
import type { StatusReactions, StatusSource } from './statuses.ts';
import type { NavReach } from '../shared/map/nav.ts';

/**
 * Creature definitions. "Creature" is the code/doc name; never name them in game text.
 * See docs/dev/creatures.md.
 */

/** The animation slot a creature is in, as the server sends it. See content/animations.ts. */
export type CreatureAnim = AnimSlot;

/** A creature's sounds; each falls back to the shared `creature.*` one. */
export type CreatureSound = 'step' | 'burst' | 'attack' | 'hurt' | 'die' | 'breath';

/**
 * How a kind comes to be in the catacombs.
 * - `attracted`: none at the start; the party's noise and light bring them (server/attraction.ts).
 * - `scatter`: placed when the map is made, in `groups` of `size`, each group within `spread` m
 *   of its first member, at least `minDistance` (along the grid) from the start. `chance` that
 *   any appear at all (default 1). `where`: anywhere it can stand, or only in corners and dead
 *   ends. `tiers`: only on these levels of the map (0 the first, at the top), and it keeps to
 *   them when it patrols; any level if left out.
 */
export type SpawnRule =
	| { kind: 'attracted' }
	/** None at the start: they come to lamps (`flight`). */
	| { kind: 'lamp' }
	| {
			kind: 'scatter';
			groups: [number, number];
			size: [number, number];
			spread: number;
			minDistance: number;
			chance?: number;
			where: 'anywhere' | 'corner';
			tiers?: number[];
	  };

export interface CreatureDef {
	id: string;
	model: string;
	/** Model faces +Z in its file; the game faces -Z at yaw 0, so it's turned by this much. */
	yawOffset: number;
	/** Client: the model is drawn this much bigger (default 1) and raised this far (m). */
	scale?: number;
	lift?: number;
	/** Body height (m): visibility samples, its eyes, its reach, and the client marker. */
	height: number;
	/** Where it may go: into squeezes, crawls, water. Left out of its paths and spots otherwise. */
	reach: NavReach;
	/** Seeing it wears sanity down (see player.md#sanity). */
	dread: boolean;
	/** How much killing one feeds the Affliction meter (one per witch). */
	killWeight: number;
	/**
	 * Experience for killing one (docs/dev/progression.md#killing), to the killer; teammates near
	 * get a share. 0 for what must never pay (moths come to every bright beam).
	 */
	xp: number;
	/** Its own sounds, by what it's doing; the rest are the shared creature ones. */
	sounds?: Partial<Record<CreatureSound, SoundId>>;
	/** It makes no sound at all (not even the shared ones). */
	silent?: boolean;
	/** The model's animation map: its clip names by standard slot. */
	animations: AnimationMap;
	/**
	 * Which slot it is in while patrolling, holding still on alert, creeping (investigating, or
	 * closing in on someone), and bursting at them.
	 */
	gait: { patrol: CreatureAnim; alert: CreatureAnim; stalk: CreatureAnim; burst: CreatureAnim };
	movement: MovementTuning;
	/** Slow approach speed (m/s) and burst speed. */
	creepSpeed: number;
	burstSpeed: number;
	/** Seconds creeping before a burst, [min, max], and how long a burst lasts. */
	creepTime: [number, number];
	burstTime: [number, number];
	/** Patrol: wanders to random spots within `radius` (m, along the grid) of its anchor, pausing. */
	patrol: { radius: number; pause: [number, number] };
	/**
	 * Alert: holds still facing a noise or light for `wait` [min, max] seconds (more of it extends
	 * the wait, up to `maxWait`), creeps over to look, and lingers there `linger` seconds.
	 */
	alert: { wait: [number, number]; maxWait: number; linger: number };
	attack: {
		range: number;
		/** Seconds from starting the swing to the hit landing. */
		windup: number;
		/** Total seconds the attack takes before it can move again. */
		duration: number;
		damage: number;
		cooldown: number;
		/** A condition a landed hit gives (its own seconds, or the condition's). */
		condition?: { id: ConditionId; seconds?: number };
	};
	perception: {
		/** Hearing radius (m) by how the player moves. */
		hear: {
			sprint: number;
			walk: number;
			crouch: number;
			crawl: number;
			creep: number;
			swim: number;
		};
		/**
		 * Noise, or a lit lamp in front of it (in sight, or lighting it), alerts it within this
		 * distance. While it chases someone, they're lost beyond it.
		 */
		alertRange: number;
		/** Someone in sight in front of it is chased within `litRange` (lamp on) or `darkRange`. */
		agro: { litRange: number; darkRange: number };
		/** Always noticed (and chased) within this distance. */
		touch: number;
		/** Seconds without perceiving the one it chases before it gives up and patrols again. */
		evadeTime: number;
		/**
		 * It never notices anyone by itself (no alerts, no chases): only being hit sets it on
		 * someone, and then it tracks them as usual.
		 */
		passive?: boolean;
	};
	/**
	 * Damage it takes to kill, by party size: the first entry for one explorer, the next for two,
	 * and so on; the last covers any larger party.
	 */
	health: number[];
	/** A hit at least this hard staggers it: an attack not yet landed is cancelled. */
	stagger: { threshold: number; seconds: number };
	/**
	 * What causes it a status (content/statuses.ts), and how it takes each: how long it lasts on
	 * it and how long it is immune after. Stunned, it stands still and an attack not yet landed is
	 * cancelled. Left out, nothing does.
	 */
	vulnerable?: StatusSource[];
	statuses?: StatusReactions;
	/** Body radius for hits (m). */
	hitRadius: number;
	/** Seconds a dead creature stays before it's removed. */
	corpseTime: number;
	/**
	 * Visible only when the light on it is within this band (lamp units). A finite upper bound hides
	 * it in full light too (half-light); Infinity means any light above the lower bound shows it.
	 */
	visibleBand: [number, number];
	/** Its breathing is heard within this distance (m), through walls (none if left out). */
	breath?: { range: number };
	/** How it comes to be in the catacombs. Nothing comes back once killed. */
	spawn: SpawnRule;
	/**
	 * It sits where it is, looking about, until someone is right on top of it (within `seenRange`,
	 * in sight, any light, any way they face): then it gets up and walks off to a corner at least `fleeDistance`
	 * (along the grid) from everyone, and sits again. A hit sends it running. `turnChance` of them
	 * are something else: come upon or hit, they become a `turnInto` and attack.
	 */
	shy?: { seenRange: number; fleeDistance: number; turnChance: number; turnInto: string };
	/**
	 * It flies, and comes to bright lamps: a headlamp on bright for `after` seconds draws one every
	 * `arrive` seconds for as long as it stays bright, up to `max`, flying in from `from` m off. On low no more come, but those there stay. They flutter
	 * about a point `ahead` m out along the beam, within `radius` m of it, at up to `speed` m/s. A
	 * lamp off for `disperse` seconds sends its own away; they're gone `leave` seconds later. It
	 * ignores everything else (no perception, no attack) and falls when killed.
	 */
	/** Can't be hurt: hits pass through it (it has no hit capsule). */
	invulnerable?: boolean;
	/**
	 * A training dummy (Rumors, docs/dev/rumors.md): it stands (or runs its track), never notices
	 * or attacks anyone, and never dies: taking its health, it is whole again. Every hit tells
	 * its damage (and staggers and bleeding, as anything's do).
	 */
	dummy?: boolean;
	/**
	 * Patrols from corner to corner (dead ends and room corners within `patrol.radius`), starting
	 * each walk from where the last ended, and pauses there.
	 */
	wanders?: boolean;
	/**
	 * Friendly (the surveyor): it stops and faces anyone within `notice` m. Holding interact on it
	 * from within `range` m for `seconds` draws everywhere it has been into your map, once each.
	 * It "has been" `legs` walks' worth of the map before anyone arrives.
	 */
	friendly?: { notice: number; range: number; seconds: number; legs: number };
	flight?: {
		max: number;
		after: number;
		arrive: number;
		from: number;
		ahead: number;
		radius: number;
		speed: number;
		disperse: number;
		leave: number;
	};
}

/** Can't get down for squeezes or crawls, and won't go into water. */
const UPRIGHT: NavReach = { crouch: false, crawl: false, swim: false };
/** The spider's clips (keyed by scripts/blender/critters.py), for both sizes. */
const SPIDER_CLIPS: AnimationMap = {
	idle: { clip: 'Idle' },
	walking: { clip: 'Walk' },
	running: { clip: 'Run' },
	melee_attack: { clip: 'Strike' },
	take_damage: { clip: 'Hurt' },
	die: { clip: 'Die' }
};

/** Goes anywhere: small enough for every squeeze and crawl, and swims. */
const ANYWHERE: NavReach = { crouch: true, crawl: true, swim: true };

/**
 * Movement for something small and low: as quick through a crawl as in the open (it moves with
 * the player simulation, which slows a body down for a low ceiling).
 */
function small(speed: number, sprintSpeed: number): MovementTuning {
	const stances = MOVEMENT.stances;
	return {
		...MOVEMENT,
		radius: 0.2,
		stances: {
			stand: { ...stances.stand, speed },
			crouch: { ...stances.crouch, speed },
			crawl: { ...stances.crawl, speed }
		},
		sprintSpeed,
		acceleration: 40
	};
}

export const CREATURES: Record<string, CreatureDef> = {
	witch: {
		id: 'witch',
		model: modelUrl('shared/creatures/witch.glb'),
		yawOffset: Math.PI,
		height: 1.7,
		// She never crawls, squeezes or swims: a low or flooded way is a way to lose her.
		reach: UPRIGHT,
		dread: true,
		killWeight: 1,
		xp: 75,
		// The model has no melee, jump, dodge, climb or crawl clip; those slots fall back or are
		// skipped. Its strike is the spell cast, standing in for melee_attack. Also in the file and
		// unused: 'Standard_Forward_Charge_inplace' (another run).
		animations: {
			idle: { clip: 'Idle_9' },
			walking: { clip: 'Walking', speed: 0.8 },
			running: { clip: 'Running', speed: 1.2 },
			crouch: { clip: 'Cautious_Crouch_Walk_Forward', speed: 0.9 },
			spell_attack: { clip: 'mage_soell_cast_3' },
			take_damage: { clip: 'Hit_Reaction', speed: 1.5 },
			// The clip opens with three seconds of clutching at its throat; start as it buckles.
			die: { clip: 'Strangled_and_Fall_Forward', speed: 1.8, start: 3.2 }
		},
		// It walks upright on patrol, and creeps up low.
		gait: { patrol: 'walking', alert: 'idle', stalk: 'crouch', burst: 'running' },
		movement: {
			...MOVEMENT,
			// Creatures use the player movement code with their own speeds; stance is always stand.
			stances: { ...MOVEMENT.stances, stand: { ...MOVEMENT.stances.stand, speed: 0.8 } },
			sprintSpeed: 5.5,
			acceleration: 30
		},
		creepSpeed: 0.8,
		burstSpeed: 5.5,
		creepTime: [1.2, 2.5],
		burstTime: [0.6, 1.0],
		patrol: { radius: 15, pause: [2, 6] },
		alert: { wait: [2.5, 4.5], maxWait: 8, linger: 4 },
		attack: { range: 1.6, windup: 0.5, duration: 1.4, damage: 40, cooldown: 1.6 },
		perception: {
			hear: { sprint: 12, walk: 6, crouch: 3, crawl: 2, creep: 1.5, swim: 7 },
			alertRange: 14,
			agro: { litRange: 10, darkRange: 3.5 },
			touch: 2.5,
			evadeTime: 6
		},
		// 240 solo, 290 for two, 340 for three or more.
		health: [240, 290, 340],
		stagger: { threshold: 20, seconds: 0.5 },
		hitRadius: 0.35,
		corpseTime: 4,
		// Seen in any light but the faintest; a bright lamp doesn't hide it.
		visibleBand: [0.04, Infinity],
		breath: { range: 6 },
		// Drawn by the party's noise and light (server/attraction.ts), and by omens.
		spawn: { kind: 'attracted' }
	},
	rat: {
		id: 'rat',
		model: modelUrl('shared/creatures/rat.glb'),
		yawOffset: Math.PI,
		// The model is 1.9 m nose to tail, centred on its origin.
		scale: 0.16,
		lift: 0.055,
		height: 0.25,
		reach: ANYWHERE,
		dread: false,
		killWeight: 0,
		xp: 2,
		// Clips keyed by scripts/blender/critters.py.
		animations: {
			idle: { clip: 'Idle' },
			walking: { clip: 'Walk' },
			running: { clip: 'Run' },
			melee_attack: { clip: 'Bite' },
			take_damage: { clip: 'Hurt' },
			die: { clip: 'Die' }
		},
		gait: { patrol: 'walking', alert: 'idle', stalk: 'walking', burst: 'running' },
		movement: small(1.4, 3.8),
		creepSpeed: 1.4,
		burstSpeed: 3.8,
		creepTime: [0.5, 1.2],
		burstTime: [0.8, 1.6],
		// Scurries about its nest in short dashes.
		patrol: { radius: 6, pause: [0.4, 2] },
		alert: { wait: [0.4, 1.2], maxWait: 3, linger: 2 },
		attack: { range: 0.8, windup: 0.2, duration: 0.5, damage: 6, cooldown: 1 },
		perception: {
			hear: { sprint: 10, walk: 6, crouch: 3, crawl: 2, creep: 1, swim: 6 },
			alertRange: 12,
			// Drawn to noise and light; it comes for whoever it finds there.
			agro: { litRange: 6, darkRange: 1.5 },
			touch: 1.5,
			evadeTime: 5
		},
		health: [12],
		stagger: { threshold: 1, seconds: 0.3 },
		hitRadius: 0.2,
		corpseTime: 4,
		visibleBand: [0.04, Infinity],
		sounds: {
			step: 'rat.step',
			burst: 'rat.squeak',
			attack: 'rat.bite',
			hurt: 'rat.squeak',
			die: 'rat.die'
		},
		// 4-7 nests of 1-4 about the catacombs.
		spawn: {
			kind: 'scatter',
			groups: [4, 7],
			size: [1, 4],
			spread: 3,
			minDistance: 20,
			where: 'anywhere'
		}
	},
	// Rumors' training dummies (docs/dev/rumors.md): placed by the training ground, never spawned.
	dummy: {
		id: 'dummy',
		model: modelUrl('shared/creatures/dummy.glb'),
		yawOffset: 0,
		height: 1.8,
		reach: ANYWHERE,
		dread: false,
		killWeight: 0,
		xp: 0,
		dummy: true,
		animations: {},
		gait: { patrol: 'idle', alert: 'idle', stalk: 'idle', burst: 'idle' },
		movement: small(1.5, 1.5),
		creepSpeed: 1.5,
		burstSpeed: 1.5,
		creepTime: [1, 1],
		burstTime: [1, 1],
		patrol: { radius: 0, pause: [1, 1] },
		alert: { wait: [1, 1], maxWait: 1, linger: 1 },
		attack: { range: 0, windup: 1, duration: 1, damage: 0, cooldown: 1 },
		perception: {
			hear: { sprint: 0, walk: 0, crouch: 0, crawl: 0, creep: 0, swim: 0 },
			alertRange: 0,
			agro: { litRange: 0, darkRange: 0 },
			touch: 0,
			evadeTime: 1,
			passive: true
		},
		health: [100],
		stagger: { threshold: 20, seconds: 0.5 },
		hitRadius: 0.35,
		corpseTime: 0,
		visibleBand: [0, Infinity],
		sounds: { hurt: 'dummy.hit' },
		spawn: { kind: 'attracted' }
	},
	spider: {
		id: 'spider',
		model: modelUrl('shared/creatures/spider.glb'),
		yawOffset: Math.PI,
		// The model is 4 m across: this one is about 40 cm.
		scale: 0.1,
		height: 0.2,
		reach: ANYWHERE,
		dread: false,
		killWeight: 0,
		xp: 2,
		animations: SPIDER_CLIPS,
		gait: { patrol: 'walking', alert: 'idle', stalk: 'walking', burst: 'running' },
		movement: small(1.1, 3.5),
		creepSpeed: 1.1,
		burstSpeed: 3.5,
		creepTime: [0.6, 1.4],
		burstTime: [0.6, 1.2],
		patrol: { radius: 4, pause: [2, 8] },
		alert: { wait: [1, 2], maxWait: 3, linger: 2 },
		// A minor bite, but it poisons.
		attack: {
			range: 0.6,
			windup: 0.25,
			duration: 0.6,
			damage: 4,
			cooldown: 1.2,
			condition: { id: 'poisoned' }
		},
		perception: {
			hear: { sprint: 0, walk: 0, crouch: 0, crawl: 0, creep: 0, swim: 0 },
			alertRange: 8,
			agro: { litRange: 4, darkRange: 1.5 },
			touch: 1,
			evadeTime: 4,
			// Drawn to nothing: it bites back only once it's been hit.
			passive: true
		},
		health: [10],
		stagger: { threshold: 1, seconds: 0.3 },
		hitRadius: 0.2,
		corpseTime: 4,
		visibleBand: [0.04, Infinity],
		sounds: {
			step: 'spider.step',
			burst: 'spider.hiss',
			attack: 'spider.hiss',
			hurt: 'spider.hiss',
			die: 'spider.die'
		},
		spawn: {
			kind: 'scatter',
			groups: [6, 10],
			size: [2, 5],
			spread: 3,
			minDistance: 15,
			where: 'anywhere'
		}
	},
	dweller: {
		id: 'dweller',
		model: modelUrl('shared/creatures/dweller.glb'),
		yawOffset: Math.PI,
		height: 1.7,
		reach: UPRIGHT,
		dread: false,
		killWeight: 0,
		xp: 8,
		// Sitting, it crouches and looks about; seen, it walks off (running, if hit).
		animations: {
			idle: { clip: 'CrouchLookAroundBow' },
			crouch: { clip: 'CrouchLookAroundBow' },
			walking: { clip: 'Walking' },
			running: { clip: 'Running' }
		},
		gait: { patrol: 'crouch', alert: 'crouch', stalk: 'walking', burst: 'running' },
		movement: {
			...MOVEMENT,
			stances: { ...MOVEMENT.stances, stand: { ...MOVEMENT.stances.stand, speed: 1.3 } },
			sprintSpeed: 4.5,
			acceleration: 30
		},
		creepSpeed: 1.3,
		burstSpeed: 4.5,
		creepTime: [1, 2],
		burstTime: [1, 2],
		patrol: { radius: 0, pause: [1, 1] },
		alert: { wait: [1, 1], maxWait: 1, linger: 1 },
		// It never attacks (one that turns uses the witch's).
		attack: { range: 0, windup: 0, duration: 0, damage: 0, cooldown: 1 },
		perception: {
			hear: { sprint: 0, walk: 0, crouch: 0, crawl: 0, creep: 0, swim: 0 },
			alertRange: 0,
			agro: { litRange: 0, darkRange: 0 },
			touch: 0,
			evadeTime: 0,
			passive: true
		},
		health: [20],
		stagger: { threshold: 1, seconds: 0.4 },
		hitRadius: 0.35,
		corpseTime: 4,
		visibleBand: [0.04, Infinity],
		sounds: { step: 'dweller.step', hurt: 'dweller.murmur', die: 'creature.die' },
		spawn: {
			kind: 'scatter',
			groups: [3, 6],
			size: [1, 1],
			spread: 0,
			minDistance: 15,
			where: 'corner'
		},
		// One in five is a witch.
		shy: { seenRange: 2.5, fleeDistance: 25, turnChance: 0.2, turnInto: 'witch' }
	},
	moth: {
		id: 'moth',
		model: modelUrl('shared/creatures/moth.glb'),
		yawOffset: Math.PI,
		// The model is 3.5 m across, standing on its legs: this one is about 15 cm, centred on
		// where it flies.
		scale: 0.045,
		lift: -0.04,
		height: 0.08,
		reach: ANYWHERE,
		dread: false,
		killWeight: 0,
		xp: 0,
		// Clips keyed by scripts/blender/critters.py: wingbeats at three rates.
		animations: {
			idle: { clip: 'Hover' },
			walking: { clip: 'Fly' },
			running: { clip: 'Dart' },
			take_damage: { clip: 'Hurt' },
			die: { clip: 'Die' }
		},
		gait: { patrol: 'walking', alert: 'walking', stalk: 'walking', burst: 'running' },
		movement: small(1, 3),
		creepSpeed: 1,
		burstSpeed: 3,
		creepTime: [1, 1],
		burstTime: [1, 1],
		patrol: { radius: 0, pause: [1, 1] },
		alert: { wait: [1, 1], maxWait: 1, linger: 1 },
		// Harmless: only in the way.
		attack: { range: 0, windup: 0, duration: 0, damage: 0, cooldown: 1 },
		perception: {
			hear: { sprint: 0, walk: 0, crouch: 0, crawl: 0, creep: 0, swim: 0 },
			alertRange: 0,
			agro: { litRange: 0, darkRange: 0 },
			touch: 0,
			evadeTime: 0,
			passive: true
		},
		health: [1],
		stagger: { threshold: 1, seconds: 0.2 },
		hitRadius: 0.12,
		corpseTime: 3,
		// Seen in the faintest light: they're in the beam.
		visibleBand: [0.02, Infinity],
		silent: true,
		spawn: { kind: 'lamp' },
		flight: {
			// Only a high beam, and only once it's been on a while.
			// One every few seconds while it stays bright, up to a cloud of them.
			max: 15,
			after: 5,
			arrive: 3,
			from: 6,
			ahead: 1.1,
			radius: 0.5,
			speed: 2.5,
			disperse: 3,
			leave: 2
		}
	},
	surveyor: {
		id: 'surveyor',
		model: modelUrl('shared/creatures/surveyor.glb'),
		yawOffset: Math.PI,
		height: 1.7,
		reach: UPRIGHT,
		dread: false,
		killWeight: 0,
		xp: 0,
		// He walks from corner to corner, crouching to look about at each.
		animations: {
			idle: { clip: 'CrouchLookAroundBow' },
			crouch: { clip: 'CrouchLookAroundBow' },
			walking: { clip: 'Walking' },
			running: { clip: 'Running' }
		},
		gait: { patrol: 'walking', alert: 'idle', stalk: 'walking', burst: 'running' },
		movement: {
			...MOVEMENT,
			stances: { ...MOVEMENT.stances, stand: { ...MOVEMENT.stances.stand, speed: 1.2 } },
			sprintSpeed: 4,
			acceleration: 30
		},
		creepSpeed: 1.2,
		burstSpeed: 4,
		creepTime: [1, 2],
		burstTime: [1, 2],
		patrol: { radius: 35, pause: [6, 14] },
		alert: { wait: [1, 1], maxWait: 1, linger: 1 },
		attack: { range: 0, windup: 0, duration: 0, damage: 0, cooldown: 1 },
		perception: {
			hear: { sprint: 0, walk: 0, crouch: 0, crawl: 0, creep: 0, swim: 0 },
			alertRange: 0,
			agro: { litRange: 0, darkRange: 0 },
			touch: 0,
			evadeTime: 0,
			passive: true
		},
		health: [1],
		stagger: { threshold: Infinity, seconds: 0 },
		hitRadius: 0.35,
		corpseTime: 4,
		visibleBand: [0.04, Infinity],
		sounds: { step: 'dweller.step' },
		// Always one, somewhere off from the start.
		spawn: {
			kind: 'scatter',
			groups: [1, 1],
			size: [1, 1],
			spread: 0,
			minDistance: 30,
			where: 'corner',
			// Never on the first level: he's further down.
			tiers: [1, 2]
		},
		invulnerable: true,
		wanders: true,
		friendly: { notice: 4, range: 2.5, seconds: 1.5, legs: 5 }
	},
	'giant-spider': {
		id: 'giant-spider',
		model: modelUrl('shared/creatures/spider.glb'),
		yawOffset: Math.PI,
		// About 1.6 m across.
		scale: 0.4,
		height: 0.7,
		// Too big for a crawl, and it won't swim; it can squeeze.
		reach: { crouch: true, crawl: false, swim: false },
		dread: true,
		killWeight: 1,
		xp: 40,
		animations: SPIDER_CLIPS,
		gait: { patrol: 'walking', alert: 'idle', stalk: 'walking', burst: 'running' },
		movement: { ...small(1.2, 5), radius: MOVEMENT.radius },
		creepSpeed: 1.2,
		burstSpeed: 5,
		creepTime: [1, 2.2],
		burstTime: [0.6, 1.1],
		patrol: { radius: 12, pause: [3, 8] },
		alert: { wait: [1.5, 3], maxWait: 6, linger: 4 },
		attack: {
			range: 1.2,
			windup: 0.35,
			duration: 0.6,
			damage: 18,
			cooldown: 1.5,
			condition: { id: 'poisoned' }
		},
		// It hunts: noise and light draw it, and it chases.
		perception: {
			hear: { sprint: 10, walk: 5, crouch: 2.5, crawl: 1.5, creep: 1, swim: 5 },
			alertRange: 12,
			agro: { litRange: 8, darkRange: 3 },
			touch: 2,
			evadeTime: 6
		},
		health: [90, 110, 130],
		stagger: { threshold: 25, seconds: 0.4 },
		hitRadius: 0.5,
		corpseTime: 5,
		visibleBand: [0.04, Infinity],
		sounds: {
			step: 'spider.giant.step',
			burst: 'spider.giant.hiss',
			attack: 'spider.giant.hiss',
			hurt: 'spider.giant.hiss',
			die: 'spider.die'
		},
		// Only sometimes, and only ever one, somewhere far off.
		spawn: {
			kind: 'scatter',
			groups: [1, 1],
			size: [1, 1],
			spread: 0,
			minDistance: 30,
			chance: 0.6,
			where: 'corner'
		}
	}
};

/** A creature's sound for what it's doing: its own, or the shared one. */
export function creatureSound(def: CreatureDef | undefined, which: CreatureSound): SoundId | null {
	if (def?.silent) return null;
	return def?.sounds?.[which] ?? `creature.${which}`;
}

export const DEFAULT_CREATURE = CREATURES.witch;

/** How much damage kills this creature, for a party of this size. */
export function creatureHealth(def: CreatureDef, party: number): number {
	const table = def.health;
	return table[Math.max(0, Math.min(table.length, party) - 1)] ?? 0;
}
