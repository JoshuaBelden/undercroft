import { describe, expect, it } from 'vitest';
import { SIM_RATE } from '../constants.ts';
import { FLOOR, box, realMap, realWorld, volume, worldOf } from '../testing/maps.ts';
import { MOVEMENT } from '../../content/player/movement.ts';
import { SANITY } from '../../content/player/sanity.ts';
import { addItem, emptyInventory, newStack } from '../items/inventory.ts';
import { buildCollisionWorld, findFreeSpot, type CollisionWorld } from '../map/collision.ts';
import type { Vec3 } from '../map/types.ts';
import { PIECES } from '../map/pieces.generated.ts';
import { spawnPoint } from '../map/points.ts';
import {
	bodyHeight,
	charging,
	clonePlayerState,
	createPlayerState,
	eyeHeight,
	healing,
	idleFrame,
	nearExtract,
	sanitizeFrame,
	stepPlayer
} from './simulate.ts';
import { HAND, type InputFrame, type PlayerState, type SimEvent } from './types.ts';
import { DEFAULT_HEADLAMP } from '../../content/items/headlamps.ts';

const DT = 1 / SIM_RATE;
const flat = worldOf([FLOOR]);

/** Run `frames` steps of the same input (with an increasing seq). */
function run(s: PlayerState, input: Partial<InputFrame>, frames: number, world = flat) {
	for (let i = 0; i < frames; i++)
		stepPlayer(s, { ...idleFrame(i, s), ...input, seq: i }, world, DT);
	return s;
}

/** Swings, shots and throws from two seconds of clicking attack with a knife, then a revolver. */
function attacks(world: CollisionWorld, at: Vec3, input: Partial<InputFrame> = {}): number {
	let count = 0;
	for (const item of ['knife', 'revolver']) {
		const inv = emptyInventory();
		inv.equipment.primary = { ...newStack(item), loaded: 6 };
		const s = createPlayerState(at, 0, inv);
		const events: SimEvent[] = [];
		for (let i = 0; i < seconds(2); i++) {
			const frame = { ...idleFrame(i, s), ...input, attack: i % 20 < 10, seq: i };
			stepPlayer(s, frame, world, DT, MOVEMENT, DEFAULT_HEADLAMP, events);
		}
		count += events.filter((e) => ['swing', 'shot', 'throw'].includes(e.kind)).length;
	}
	return count;
}

describe('sanitizeFrame', () => {
	it('rejects frames without an integer seq', () => {
		expect(sanitizeFrame(null)).toBeNull();
		expect(sanitizeFrame({})).toBeNull();
		expect(sanitizeFrame({ seq: 1.5 })).toBeNull();
	});

	it('clamps movement and pitch and zeroes junk numbers', () => {
		const frame = sanitizeFrame({
			seq: 1,
			moveX: 5,
			moveZ: Number.NaN,
			pitch: 99,
			yaw: Infinity
		})!;
		expect(frame.moveX).toBe(1);
		expect(frame.moveZ).toBe(0);
		expect(frame.pitch).toBe(1.5);
		expect(frame.yaw).toBe(0);
	});

	it('only accepts real booleans, stances and lamp modes', () => {
		const frame = sanitizeFrame({
			seq: 1,
			sprint: 'yes',
			attack: true,
			stance: 'fly',
			headlamp: 7,
			select: 'x'
		})!;
		expect(frame.sprint).toBe(false);
		expect(frame.attack).toBe(true);
		expect(frame.stance).toBe('stand');
		expect(frame.headlamp).toBe(0);
		expect(frame.select).toBe(-1);
	});

	it('takes the hands away while reading, and leaves walking alone', () => {
		const busy = {
			seq: 1,
			moveZ: 1,
			stance: 'crouch',
			headlamp: 2,
			sprint: true,
			interact: true,
			attack: true,
			aim: true,
			reload: true,
			select: 2
		};
		const reading = sanitizeFrame({ ...busy, reading: true })!;
		expect(reading).toMatchObject({ moveZ: 1, stance: 'crouch', headlamp: 2, reading: true });
		expect(reading).toMatchObject({
			sprint: false,
			interact: false,
			attack: false,
			aim: false,
			reload: false,
			select: -1
		});
		const playing = sanitizeFrame(busy)!;
		expect(playing).toMatchObject({ sprint: true, attack: true, select: 2, reading: false });
	});
});

describe('clonePlayerState', () => {
	it('is deep: changing the copy leaves the original alone', () => {
		const s = createPlayerState([1, 2, 3], 0);
		const copy = clonePlayerState(s);
		copy.position[0] = 9;
		copy.velocity[1] = 9;
		copy.flags.noclip = true;
		copy.weapon.prev.attack = true;
		expect(s.position).toEqual([1, 2, 3]);
		expect(s.velocity).toEqual([0, 0, 0]);
		expect(s.flags.noclip).toBe(false);
		expect(s.weapon.prev.attack).toBe(false);
	});
});

describe('stepPlayer', () => {
	it('an idle player falls onto the floor and stays there', () => {
		const s = run(createPlayerState([0, 0.5, 0], 0), {}, SIM_RATE * 2);
		expect(s.grounded).toBe(true);
		expect(s.position[1]).toBeCloseTo(0, 1);
		const settled = [...s.position];
		run(s, {}, SIM_RATE);
		expect(s.position[0]).toBeCloseTo(settled[0], 3);
		expect(s.position[2]).toBeCloseTo(settled[2], 3);
	});

	it('walking forward at yaw 0 moves towards -Z', () => {
		const s = run(createPlayerState([0, 0, 0], 0), {}, 10);
		run(s, { moveZ: 1 }, SIM_RATE);
		expect(s.position[2]).toBeLessThan(-0.5);
		expect(Math.abs(s.position[0])).toBeLessThan(0.01);
	});

	it('sprinting goes further than walking and costs stamina', () => {
		const walk = run(run(createPlayerState([0, 0, 0], 0), {}, 10), { moveZ: 1 }, SIM_RATE);
		const sprint = run(
			run(createPlayerState([0, 0, 0], 0), {}, 10),
			{ moveZ: 1, sprint: true },
			SIM_RATE
		);
		expect(-sprint.position[2]).toBeGreaterThan(-walk.position[2]);
		expect(sprint.stamina).toBeLessThan(walk.stamina);
	});

	it('is deterministic: the same inputs give the same state (client prediction relies on it)', () => {
		const map = realMap(7);
		const world = realWorld(map);
		const spawn = spawnPoint(map, PIECES);
		const start = findFreeSpot(world, spawn.position, 1.7, 0.3);
		const inputs: Partial<InputFrame>[] = Array.from({ length: SIM_RATE * 4 }, (_, i) => ({
			moveZ: 1,
			moveX: Math.sin(i / 10),
			yaw: spawn.yaw + Math.sin(i / 25),
			sprint: i % 50 < 25,
			stance: i % 90 < 60 ? 'stand' : 'crouch'
		}));
		const play = () => {
			const s = createPlayerState(start, spawn.yaw);
			inputs.forEach((input, i) =>
				stepPlayer(s, { ...idleFrame(i, s), ...input, seq: i }, world, DT)
			);
			return s;
		};
		expect(play()).toEqual(play());
	});

	it('a dead player does not move', () => {
		const s = run(createPlayerState([0, 0, 0], 0), {}, 10);
		s.dead = true;
		const before = [...s.position];
		run(s, { moveZ: 1 }, SIM_RATE);
		expect(s.position).toEqual(before);
	});
});

const seconds = (n: number) => Math.round(n * SIM_RATE);

/** Standing still on the floor, settled. */
function standing(world = flat, at: [number, number, number] = [0, 0, 0], yaw = 0): PlayerState {
	return run(createPlayerState(at, yaw), {}, seconds(0.5), world);
}

describe('stances', () => {
	it('crouching and crawling lower the body and the eye', () => {
		const s = standing();
		const tall = eyeHeight(s);
		run(s, { stance: 'crouch' }, 2);
		expect(s.stance).toBe('crouch');
		expect(eyeHeight(s)).toBeLessThan(tall);
		run(s, { stance: 'crawl' }, 2);
		expect(bodyHeight(s)).toBe(MOVEMENT.stances.crawl.height);
	});

	it('under a low ceiling a crawler only gets up as far as fits', () => {
		// A ceiling at 1.4 m: room to crouch, not to stand.
		const world = worldOf([FLOOR, box([0, 1.65, 0], [20, 0.5, 20])]);
		const s = standing(world);
		run(s, { stance: 'crawl' }, 2, world);
		run(s, { stance: 'stand' }, 2, world);
		expect(s.stance).toBe('crouch');
	});
});

describe('the body and the world', () => {
	it('walks up a low step', () => {
		const world = worldOf([FLOOR, box([0, 0.15, -6], [4, 0.3, 8])]);
		const s = standing(world);
		run(s, { moveZ: 1 }, seconds(1.5), world);
		expect(s.position[1]).toBeCloseTo(0.3, 1);
	});

	it('a wall stops it', () => {
		const world = worldOf([FLOOR, box([0, 1.5, -2], [4, 3, 0.4])]);
		const s = standing(world);
		run(s, { moveZ: 1 }, seconds(2), world);
		expect(s.position[2]).toBeGreaterThan(-2);
	});

	it('holding climb at a ledge climbs onto it, which costs stamina', () => {
		const world = worldOf([FLOOR, box([0, 0.5, -1.5], [4, 1, 2])]);
		const s = standing(world);
		run(s, { moveZ: 1 }, seconds(0.5), world);
		run(s, { moveZ: 1, climb: true }, seconds(0.2), world);
		expect(s.mantle).not.toBeNull();
		const stamina = s.stamina;
		run(s, {}, seconds(1), world);
		expect(s.mantle).toBeNull();
		expect(s.position[1]).toBeCloseTo(1, 1);
		expect(stamina).toBeLessThan(MOVEMENT.stamina.max);
	});

	it('pressing climb with no ledge jumps, about 0.7 m, and holding it does not jump again', () => {
		const s = standing(flat);
		let top = 0;
		let landed = -1;
		run(s, { climb: true }, 1);
		expect(s.stamina).toBe(MOVEMENT.stamina.max - MOVEMENT.jump.staminaCost);
		for (let i = 1; i < seconds(2); i++) {
			run(s, { climb: true }, 1);
			top = Math.max(top, s.position[1]);
			if (landed < 0 && i > 2 && s.grounded) landed = i;
		}
		expect(top).toBeGreaterThan(0.6);
		expect(top).toBeLessThan(0.8);
		expect(landed).toBeGreaterThan(0);
		// Still holding it, back on the floor: no second hop.
		expect(s.position[1]).toBeLessThan(0.05);
		run(s, {}, 1);
		run(s, { climb: true }, seconds(0.2));
		expect(s.position[1]).toBeGreaterThan(0.3);
	});

	it('no jump under a low ceiling, crawling, or in water', () => {
		const low = worldOf([FLOOR, box([0, 1.9, 0], [4, 0.2, 4])]);
		const s = standing(low);
		run(s, { climb: true }, seconds(0.3), low);
		expect(s.position[1]).toBeLessThan(0.05);
		const crawler = standing(flat);
		run(crawler, { stance: 'crawl' }, seconds(0.5));
		run(crawler, { stance: 'crawl', climb: true }, seconds(0.3));
		expect(crawler.position[1]).toBeLessThan(0.05);
	});

	it('noclip flies through walls where it looks', () => {
		const world = worldOf([FLOOR, box([0, 1.5, -2], [4, 3, 0.4])]);
		const s = standing(world);
		s.flags.noclip = true;
		run(s, { moveZ: 1, pitch: 0.3 }, seconds(1), world);
		expect(s.position[2]).toBeLessThan(-3);
		expect(s.position[1]).toBeGreaterThan(1);
	});
});

describe('water', () => {
	// A pool 3 m deep, its surface at floor level, with the floor all round it.
	const pool = worldOf(
		[
			box([0, -3.25, 0], [6, 0.5, 6]),
			box([0, -0.25, -6.5], [20, 0.5, 7]),
			box([0, -0.25, 6.5], [20, 0.5, 7]),
			box([-6.5, -0.25, 0], [7, 0.5, 6]),
			box([6.5, -0.25, 0], [7, 0.5, 6])
		],
		[volume('water', [0, -1.5, 0], [6, 3, 6])]
	);

	it('deep water means swimming, floating at the surface', () => {
		const s = run(createPlayerState([0, -1.5, 0], 0), {}, seconds(3), pool);
		expect(s.swimming).toBe(true);
		expect(s.underwater).toBe(false);
		expect(bodyHeight(s)).toBe(MOVEMENT.swim.height);
	});

	it("can't fight in the water", () => {
		expect(attacks(pool, [0, -1.5, 0])).toBe(0);
	});

	it('once under, stays at the depth it swims to; swimming up floats again at the surface', () => {
		const s = run(createPlayerState([0, -1.5, 0], 0), {}, seconds(2), pool);
		run(s, { swimDown: true }, seconds(0.6), pool);
		expect(s.underwater).toBe(true);
		// Let the dive's momentum die away, then nothing lifts it.
		run(s, {}, seconds(1), pool);
		const depth = s.position[1];
		run(s, {}, seconds(2), pool);
		expect(s.underwater).toBe(true);
		expect(Math.abs(s.position[1] - depth)).toBeLessThan(0.05);
		run(s, { climb: true }, seconds(2), pool);
		expect(s.underwater).toBe(false);
		run(s, {}, seconds(2), pool);
		expect(s.underwater).toBe(false);
	});

	it('out of breath forces you up', () => {
		const s = run(createPlayerState([0, -1.5, 0], 0), {}, seconds(2), pool);
		run(s, { swimDown: true }, seconds(0.6), pool);
		s.stamina = 0;
		s.exhausted = true;
		run(s, {}, seconds(2), pool);
		expect(s.underwater).toBe(false);
	});

	it("can't swim hard under the water", () => {
		const under = (sprint: boolean) => {
			const s = run(createPlayerState([0, -1.5, 0], 0), {}, seconds(2), pool);
			run(s, { swimDown: true }, seconds(0.6), pool);
			s.velocity = [0, 0, 0];
			const z = s.position[2];
			run(s, { moveZ: 0.5, sprint }, seconds(0.5), pool);
			expect(s.underwater).toBe(true);
			return Math.abs(s.position[2] - z);
		};
		expect(under(true)).toBeCloseTo(under(false), 5);
	});

	it('diving holds the breath until it runs out', () => {
		const s = run(createPlayerState([0, -1.5, 0], 0), {}, seconds(2), pool);
		run(s, { swimDown: true }, seconds(1), pool);
		expect(s.underwater).toBe(true);
		const breath = s.stamina;
		run(s, { swimDown: true }, seconds(1), pool);
		expect(s.stamina).toBeLessThan(breath);
	});

	it('swims forward, and climbs out at the edge', () => {
		const s = run(createPlayerState([0, -1.5, 0], 0), {}, seconds(2), pool);
		run(s, { moveZ: 1 }, seconds(2), pool);
		run(s, { moveZ: 1, climb: true }, seconds(1.5), pool);
		expect(s.swimming).toBe(false);
		expect(s.position[1]).toBeGreaterThan(-0.2);
	});

	// Every real piece with water in it: from the middle of the water, there is a way out. A
	// walkway only a thin slab at the top (no wall below it to mantle against) once left a swimmer
	// in the Pump Room and the Drowned Chapel with none.
	const watery = Object.values(PIECES).filter((p) => p.volumes.some((v) => v.kind === 'water'));
	it.each(watery.map((p) => p.name))('%s: a swimmer can get out of the water', (name) => {
		const world = buildCollisionWorld(
			{
				seed: 0,
				affliction: null,
				placements: [{ piece: name, position: [0, 0, 0], rotation: 0, tier: 0 }],
				crates: [],
				doors: []
			},
			PIECES
		);
		for (const water of PIECES[name].volumes.filter((v) => v.kind === 'water')) {
			const surface = water.center[1] + water.halfExtents[1];
			const out = [0, 1, 2, 3].filter((quarter) => {
				const s = createPlayerState(
					[water.center[0], water.center[1], water.center[2]],
					(quarter * Math.PI) / 2
				);
				run(s, {}, seconds(1), world);
				// Out on dry ground at some point (the piece stands alone: walk on and you fall off it).
				for (let i = 0; i < seconds(6); i++) {
					run(s, { moveZ: 1, climb: true }, 1, world);
					if (!s.swimming && !s.wading && s.grounded && s.position[1] > surface) return true;
				}
				return false;
			});
			expect(out.length, `ways out of the water at ${water.center.join(', ')}`).toBeGreaterThan(0);
		}
	});

	it('shallow water is waded through, slower', () => {
		const shallow = worldOf([FLOOR], [volume('water', [0, 0.2, 0], [20, 0.4, 20])]);
		const dry = standing();
		const wet = standing(shallow);
		expect(wet.wading).toBe(true);
		run(dry, { moveZ: 1 }, seconds(1));
		run(wet, { moveZ: 1 }, seconds(1), shallow);
		expect(-wet.position[2]).toBeLessThan(-dry.position[2]);
	});

	it('a squeeze slows you and stops sprinting', () => {
		const squeeze = worldOf([FLOOR], [volume('squeeze', [0, 1, 0], [20, 2, 20])]);
		const s = standing(squeeze);
		run(s, { moveZ: 1, sprint: true }, seconds(1), squeeze);
		expect(s.squeezing).toBe(true);
		expect(s.stamina).toBe(MOVEMENT.stamina.max);
	});

	it('there is no room to fight in a squeeze, or crawling', () => {
		const squeeze = worldOf([FLOOR], [volume('squeeze', [0, 1, 0], [20, 2, 20])]);
		expect(attacks(flat, [0, 0, 0])).toBeGreaterThan(0);
		expect(attacks(squeeze, [0, 0, 0])).toBe(0);
		expect(attacks(flat, [0, 0, 0], { stance: 'crawl' })).toBe(0);
	});
});

describe('stamina', () => {
	it('sprinting until it runs out leaves you exhausted until it recovers', () => {
		const s = standing();
		run(s, { moveZ: 1, sprint: true }, seconds(5.5));
		expect(s.exhausted).toBe(true);
		run(s, {}, seconds(6));
		expect(s.exhausted).toBe(false);
	});

	it('infinite stamina never runs out', () => {
		const s = standing();
		s.flags.infiniteStamina = true;
		run(s, { moveZ: 1, sprint: true }, seconds(8));
		expect(s.stamina).toBe(MOVEMENT.stamina.max);
	});
});

describe('the headlamp and what is in the hand', () => {
	it('the lamp drains the battery, unless the battery is infinite', () => {
		const s = standing();
		run(s, { headlamp: 2 }, seconds(5));
		expect(s.battery).toBeLessThan(1);
		const off = createPlayerState([0, 0, 0], 0);
		off.headlamp = 0;
		run(off, { headlamp: 0 }, seconds(5));
		expect(off.battery).toBe(1);
		const forever = createPlayerState([0, 0, 0], 0);
		forever.flags.infiniteBattery = true;
		run(forever, { headlamp: 2 }, seconds(5));
		expect(forever.battery).toBe(1);
	});

	it('holding attack with a bandage, standing still, heals', () => {
		const inv = emptyInventory();
		addItem(inv, newStack('bandage', 2));
		const s = run(createPlayerState([0, 0, 0], 0, inv), { select: HAND.quick }, seconds(1));
		s.sanity = 20;
		expect(healing(s)).toBeDefined();
		run(s, { select: HAND.quick, attack: true }, seconds(6));
		expect(s.sanity).toBeGreaterThan(20);
		expect(s.inventory.quick[0]?.count ?? 0).toBeLessThan(2);
	});

	it('a medkit fills sanity all the way back up', () => {
		const inv = emptyInventory();
		addItem(inv, newStack('medkit'));
		const s = run(createPlayerState([0, 0, 0], 0, inv), { select: HAND.quick }, seconds(1));
		s.sanity = 5;
		run(s, { select: HAND.quick, attack: true }, seconds(4));
		// Not yet: it takes longer than a bandage.
		expect(s.sanity).toBe(5);
		run(s, { select: HAND.quick, attack: true }, seconds(2));
		expect(s.sanity).toBe(SANITY.max);
		expect(s.inventory.quick[0]).toBeNull();
	});

	it('a medkit is used kneeling: you crouch for it, and stand back up after', () => {
		const inv = emptyInventory();
		addItem(inv, newStack('medkit'));
		const s = run(createPlayerState([0, 0, 0], 0, inv), { select: HAND.quick }, seconds(1));
		s.sanity = 5;
		// The client keeps asking to stand: crouching is the medkit's doing.
		run(s, { select: HAND.quick, attack: true, stance: 'stand' }, seconds(1));
		expect(s.stance).toBe('crouch');
		run(s, { select: HAND.quick, attack: false, stance: 'stand' }, seconds(1));
		expect(s.stance).toBe('stand');
		// A bandage is wound on standing.
		addItem(s.inventory, newStack('bandage'));
		run(s, { select: HAND.quick + 1, attack: true, stance: 'stand' }, seconds(1));
		expect(s.bandaging).toBeGreaterThan(0);
		expect(s.stance).toBe('stand');
	});

	it('holding attack with a battery charges the lamp', () => {
		const inv = emptyInventory();
		addItem(inv, newStack('battery'));
		const s = run(createPlayerState([0, 0, 0], 0, inv), { select: HAND.quick }, seconds(1));
		s.battery = 0.2;
		expect(charging(s)).toBeDefined();
		run(s, { select: HAND.quick, attack: true }, seconds(6));
		expect(s.battery).toBeGreaterThan(0.2);
		expect(s.inventory.quick[0]).toBeNull();
	});

	it('is nowhere near an extraction point on an empty floor', () => {
		expect(nearExtract(flat, standing())).toBeNull();
	});
});

describe('downed', () => {
	it('crawls slowly and bleeds out in the end', () => {
		const s = standing();
		s.downed = true;
		run(s, { moveZ: 1 }, seconds(1));
		expect(s.stance).toBe('crawl');
		expect(s.position[2]).toBeLessThan(0);
		run(s, {}, seconds(SANITY.bleedOut));
		expect(s.dead).toBe(true);
	});
});
