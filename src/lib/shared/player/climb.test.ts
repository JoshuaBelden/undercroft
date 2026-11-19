import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '../../content/player/conditions.ts';
import { CLIMB, FALL, MOVEMENT } from '../../content/player/movement.ts';
import { SIM_RATE } from '../constants.ts';
import type { CollisionWorld, RopeLine } from '../map/collision.ts';
import { FLOOR, box, worldOf } from '../testing/maps.ts';
import type { ClimberSpot } from './climb.ts';
import { ropeToGrab } from './climb.ts';
import { hasCondition } from './conditions.ts';
import { createPlayerState, idleFrame, stepPlayer } from './simulate.ts';
import type { InputFrame, PlayerState, SimEvent } from './types.ts';

const DT = 1 / SIM_RATE;
/** Looking toward -X (forward is -Z at yaw 0). */
const FACE_WEST = Math.PI / 2;

/** A floor with one rope hanging to it from 8 m, at the origin. */
function ropeWorld(rope: Partial<RopeLine> = {}, colliders = [FLOOR]): CollisionWorld {
	const world = worldOf(colliders);
	world.ropes.push({ id: 'r', top: [0, 8, 0], bottom: 0, ...rope });
	return world;
}

let seq = 0;

function run(
	s: PlayerState,
	world: CollisionWorld,
	input: Partial<InputFrame>,
	seconds: number,
	others: ClimberSpot[] = [],
	events: SimEvent[] = []
): PlayerState {
	for (let i = 0; i < Math.round(seconds * SIM_RATE); i++) {
		const frame = { ...idleFrame(seq, s), ...input, seq: seq++ };
		stepPlayer(s, frame, world, DT, MOVEMENT, undefined, events, others);
	}
	return s;
}

/** Standing beside the rope's foot, settled on the floor. */
function besideRope(world: CollisionWorld): PlayerState {
	const s = createPlayerState([0.5, 0.05, 0], FACE_WEST);
	return run(s, world, {}, 0.3);
}

/** On the rope: settled beside it, then a press of climb. */
function onRope(world: CollisionWorld, others: ClimberSpot[] = []): PlayerState {
	const s = besideRope(world);
	run(s, world, { interact: true }, DT, others);
	run(s, world, {}, DT, others);
	return s;
}

describe('grabbing a rope', () => {
	it('a press of climb beside the rope takes hold of it, hanging beside it', () => {
		const world = ropeWorld();
		const events: SimEvent[] = [];
		const s = besideRope(world);
		run(s, world, { interact: true }, DT, [], events);
		expect(s.climbing?.rope).toBe('r');
		expect(Math.hypot(s.position[0], s.position[2])).toBeCloseTo(CLIMB.hold, 3);
		expect(s.climbing?.side[0]).toBeCloseTo(1, 3);
		expect(events).toContainEqual({ kind: 'grab', rope: 'r' });
	});

	it('is out of reach from further away', () => {
		const world = ropeWorld();
		const s = run(createPlayerState([CLIMB.reach + 0.3, 0.05, 0], FACE_WEST), world, {}, 0.3);
		run(s, world, { interact: true }, 0.2);
		expect(s.climbing).toBeNull();
	});

	it('is refused where someone already hangs', () => {
		const world = ropeWorld();
		const s = besideRope(world);
		expect(ropeToGrab(world, s, [{ rope: 'r', y: 1 }])).toBeNull();
		run(s, world, { interact: true }, 0.2, [{ rope: 'r', y: 1 }]);
		expect(s.climbing).toBeNull();
		expect(ropeToGrab(world, s, [{ rope: 'r', y: 1 + CLIMB.gap + 0.5 }])).not.toBeNull();
	});
});

describe('on a rope', () => {
	it('forward climbs up, back climbs down, and the foot steps off onto the floor', () => {
		const world = ropeWorld();
		const s = onRope(world);
		const start = s.position[1];
		run(s, world, { moveZ: 1 }, 2);
		expect(s.position[1]).toBeCloseTo(start + CLIMB.upSpeed * 2, 1);
		run(s, world, { moveZ: -1 }, 1);
		expect(s.climbing).not.toBeNull();
		run(s, world, { moveZ: -1 }, 3);
		expect(s.climbing).toBeNull();
		expect(s.grounded).toBe(true);
		expect(s.position[1]).toBeCloseTo(0, 2);
	});

	it('a held climb key does not grab the rope again after stepping off', () => {
		const world = ropeWorld();
		const s = onRope(world);
		run(s, world, { moveZ: -1, interact: true }, 1);
		expect(s.climbing).toBeNull();
		run(s, world, { interact: true }, 0.5);
		expect(s.climbing).toBeNull();
	});

	it('hands stay below the top', () => {
		const world = ropeWorld({ top: [0, 4, 0] });
		const s = onRope(world);
		s.flags.infiniteStamina = true;
		run(s, world, { moveZ: 1 }, 10);
		expect(s.climbing).not.toBeNull();
		expect(s.position[1]).toBeCloseTo(4 - MOVEMENT.stances.stand.height, 2);
	});

	it('nobody climbs past anyone: it stops short of the climber above, and below', () => {
		const world = ropeWorld();
		const above: ClimberSpot[] = [{ rope: 'r', y: 4 }];
		const s = onRope(world);
		run(s, world, { moveZ: 1 }, 12, above);
		expect(s.position[1]).toBeCloseTo(4 - CLIMB.gap, 2);

		s.position[1] = 6;
		const below: ClimberSpot[] = [{ rope: 'r', y: 3 }];
		run(s, world, { moveZ: -1 }, 8, below);
		expect(s.position[1]).toBeCloseTo(3 + CLIMB.gap, 2);
	});

	it('someone on another rope is no obstacle', () => {
		const world = ropeWorld();
		const s = onRope(world);
		run(s, world, { moveZ: 1 }, 4, [{ rope: 'other', y: 1.5 }]);
		expect(s.position[1]).toBeGreaterThan(1.8);
	});

	it('climbing wears out stamina, hanging only slowly, nothing comes back; spent, you drop', () => {
		const world = ropeWorld();
		const events: SimEvent[] = [];
		const s = onRope(world);
		const full = s.stamina;
		run(s, world, { moveZ: 1 }, 4);
		expect(s.stamina).toBeCloseTo(full - CLIMB.upDrain * 4, 0);
		const resting = s.stamina;
		run(s, world, {}, 5);
		expect(s.stamina).toBeCloseTo(resting - CLIMB.hangDrain * 5, 0);
		s.stamina = 0.1;
		run(s, world, {}, 0.5, [], events);
		expect(s.climbing).toBeNull();
		expect(events).toContainEqual({ kind: 'letgo', rope: 'r' });
	});

	it('at the top of a drop, it hauls over even from as high as the rope goes', () => {
		// A ledge higher than a haul reaches from the highest hang: the haul still happens.
		const ledge = box([0, 2.25, -2.5], [6, 4.5, 4]);
		const world = ropeWorld({ top: [0, 4.5, 0], landing: [0, 4.5, -1.2] }, [FLOOR, ledge]);
		const s = onRope(world);
		s.flags.infiniteStamina = true;
		for (let i = 0; i < 20 * SIM_RATE && s.climbing; i++) run(s, world, { moveZ: 1 }, DT);
		expect(s.climbing).toBeNull();
		run(s, world, {}, 1.5);
		expect(s.position[1]).toBeCloseTo(4.5, 1);
		expect(s.grounded).toBe(true);
	});

	it('swim down lets go: a fall from high up hurts and hobbles', () => {
		const world = ropeWorld();
		const events: SimEvent[] = [];
		const s = onRope(world);
		s.flags.infiniteStamina = true;
		run(s, world, { moveZ: 1 }, 12);
		const height = s.position[1];
		expect(height).toBeGreaterThan(5);
		run(s, world, { letGo: true }, DT, [], events);
		expect(s.climbing).toBeNull();
		run(s, world, {}, 2, [], events);
		expect(s.grounded).toBe(true);
		const land = events.find((e) => e.kind === 'land');
		expect(land?.kind === 'land' && land.speed).toBeGreaterThan(FALL.safeSpeed);
		expect(hasCondition(s, 'hobble')).toBe(true);
	});

	it('an extraction rope gets you out a little way up', () => {
		const world = ropeWorld({ exitY: 2.2 });
		const s = onRope(world);
		run(s, world, { moveZ: 1 }, 2);
		expect(s.extracted).toBe(false);
		run(s, world, { moveZ: 1 }, 3);
		expect(s.extracted).toBe(true);
		expect(s.position[1]).toBeGreaterThanOrEqual(2.2);
	});

	it('hauls over onto the landing at the top, and can get back on there', () => {
		// A 4 m ledge north of the rope; the rope hangs just off its edge.
		const ledge = box([0, 2, -2.5], [6, 4, 4]);
		const landing: [number, number, number] = [0, 4, -0.6];
		const world = ropeWorld({ top: [0, 5, 0], landing }, [FLOOR, ledge]);
		const s = createPlayerState([0, 0.05, 0.5], 0);
		run(s, world, {}, 0.3);
		run(s, world, { interact: true }, DT);
		expect(s.climbing).not.toBeNull();
		s.flags.infiniteStamina = true;
		for (let i = 0; i < 10 * SIM_RATE && s.climbing; i++) run(s, world, { moveZ: 1 }, DT);
		expect(s.climbing).toBeNull();
		expect(s.mantle).not.toBeNull();
		run(s, world, {}, 1.5);
		expect(s.mantle).toBeNull();
		expect(s.position[1]).toBeCloseTo(4, 1);
		expect(s.grounded).toBe(true);

		// From the top, looking out over the drop: back on, hanging below the edge on the far side
		// of the rope.
		run(s, world, { yaw: Math.PI }, DT);
		run(s, world, { interact: true, yaw: Math.PI }, DT);
		expect(s.climbing).not.toBeNull();
		expect(s.position[1]).toBeCloseTo(4 - CLIMB.topDrop, 2);
		expect(s.position[2]).toBeGreaterThan(0);
	});

	it('takes looking at it: back to it, interact does nothing', () => {
		const world = ropeWorld();
		const s = run(createPlayerState([0.5, 0.05, 0], -FACE_WEST), world, {}, 0.3);
		run(s, world, { interact: true }, 0.2);
		expect(s.climbing).toBeNull();
	});

	it('sprint held climbs faster, and slides down faster still', () => {
		const world = ropeWorld();
		const s = onRope(world);
		s.flags.infiniteStamina = true;
		const start = s.position[1];
		run(s, world, { moveZ: 1, sprint: true }, 2);
		expect(s.position[1] - start).toBeCloseTo(CLIMB.fastUpSpeed * 2, 1);
		const high = s.position[1];
		run(s, world, { moveZ: -1, sprint: true }, 0.5);
		expect(high - s.position[1]).toBeCloseTo(CLIMB.slideSpeed * 0.5, 1);
	});

	it('an untied rope drops whoever is on it', () => {
		const world = ropeWorld();
		const s = onRope(world);
		world.ropes = [];
		run(s, world, {}, DT);
		expect(s.climbing).toBeNull();
	});
});

describe('falls', () => {
	it('a short drop does nothing; a long one hurts and hobbles', () => {
		const world = worldOf([FLOOR]);
		const events: SimEvent[] = [];
		const low = createPlayerState([0, 1.5, 0], 0);
		run(low, world, {}, 1.5, [], events);
		expect(events.filter((e) => e.kind === 'land')).toHaveLength(0);
		expect(low.conditions).toEqual([]);

		const high = createPlayerState([0, 4, 0], 0);
		run(high, world, {}, 1.5, [], events);
		expect(events.filter((e) => e.kind === 'land')).toHaveLength(1);
		expect(hasCondition(high, 'hobble')).toBe(true);
	});

	it('god mode takes no fall', () => {
		const events: SimEvent[] = [];
		const s = createPlayerState([0, 6, 0], 0);
		s.flags.godMode = true;
		run(s, worldOf([FLOOR]), {}, 1.5, [], events);
		expect(events.filter((e) => e.kind === 'land')).toHaveLength(0);
		expect(s.conditions).toEqual([]);
	});
});

describe('a rope that hangs free (the start room)', () => {
	/** Its end is 1.7 m up: climbing off it is a drop that doesn't hurt. */
	const FREE = { bottom: 1.7, hangsFree: true };

	it('climbing down off its end drops you to the floor, unhurt', () => {
		const world = ropeWorld(FREE);
		const events: SimEvent[] = [];
		const s = createPlayerState([CLIMB.hold, 5, 0], FACE_WEST);
		s.climbing = { rope: 'r', side: [1, 0] };
		run(s, world, { moveZ: -1 }, 8, [], events);
		expect(s.climbing).toBeNull();
		expect(s.grounded).toBe(true);
		expect(s.position[1]).toBeCloseTo(0, 1);
		expect(events.some((e) => e.kind === 'letgo')).toBe(true);
		expect(events.filter((e) => e.kind === 'land')).toHaveLength(0);
		expect(s.conditions).toEqual([]);
		// The drop is short of hurting, with room to spare.
		expect(Math.sqrt(2 * MOVEMENT.gravity * FREE.bottom)).toBeLessThan(FALL.safeSpeed * 0.9);
	});

	it("can't be taken hold of from the floor beneath it", () => {
		const world = ropeWorld(FREE);
		const s = besideRope(world);
		expect(ropeToGrab(world, s)).toBeNull();
		run(s, world, { interact: true }, DT);
		run(s, world, {}, DT);
		expect(s.climbing).toBeNull();
		// Out of reach by more than a grab from the floor allows.
		expect(FREE.bottom - s.position[1]).toBeGreaterThan(CLIMB.grabFromFloor * 2);
	});
});

describe('hobbled', () => {
	it('is no faster than a crawl, can not sprint, and wears off', () => {
		const world = worldOf([FLOOR]);
		const s = createPlayerState([0, 0.05, 0], 0);
		run(s, world, {}, 0.3);
		s.conditions = [{ id: 'hobble', remaining: CONDITIONS.hobble.seconds }];
		run(s, world, { moveZ: 1, sprint: true }, 2);
		const speed = Math.hypot(s.velocity[0], s.velocity[2]);
		expect(speed).toBeCloseTo(MOVEMENT.stances.crawl.speed, 1);
		run(s, world, { moveZ: 1 }, CONDITIONS.hobble.seconds);
		expect(s.conditions).toEqual([]);
		run(s, world, { moveZ: 1 }, 1);
		expect(Math.hypot(s.velocity[0], s.velocity[2])).toBeCloseTo(MOVEMENT.stances.stand.speed, 1);
	});
});
