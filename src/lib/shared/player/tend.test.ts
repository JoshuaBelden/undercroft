import { describe, expect, it } from 'vitest';
import { SIM_RATE } from '../constants.ts';
import { ITEMS } from '../../content/items.ts';
import { DEFAULT_HEADLAMP } from '../../content/items/headlamps.ts';
import { MOVEMENT } from '../../content/player/movement.ts';
import { SANITY } from '../../content/player/sanity.ts';
import { addItem, emptyInventory, newStack } from '../items/inventory.ts';
import { FLOOR, box, worldOf } from '../testing/maps.ts';
import { createPlayerState, eyeHeight, idleFrame, stepPlayer } from './simulate.ts';
import { lookedAtTeammate, needs, teammateSpot, type TeammateSpot } from './tend.ts';
import { HAND, type InputFrame, type SimEvent } from './types.ts';

const DT = 1 / SIM_RATE;
const flat = worldOf([FLOOR]);
const EYE: [number, number, number] = [0, eyeHeight(createPlayerState([0, 0, 0], 0)), 0];
/** Yaw 0, level: toward -Z. */
const AHEAD: [number, number, number] = [0, 0, -1];

function spot(at: [number, number, number], over: Partial<TeammateSpot> = {}): TeammateSpot {
	return { id: 'b', position: at, height: 1.8, hurt: true, lampLow: true, ...over };
}

describe('lookedAtTeammate', () => {
	it('finds the teammate in front within reach', () => {
		expect(lookedAtTeammate(flat, EYE, AHEAD, [spot([0, 0, -1.2])])?.id).toBe('b');
	});

	it('not out of reach, not off to the side, not behind a wall', () => {
		expect(lookedAtTeammate(flat, EYE, AHEAD, [spot([0, 0, -3])])).toBeNull();
		expect(lookedAtTeammate(flat, EYE, AHEAD, [spot([1.5, 0, -1])])).toBeNull();
		const wall = worldOf([FLOOR, box([0, 1, -0.6], [3, 2, 0.1])]);
		expect(lookedAtTeammate(wall, EYE, AHEAD, [spot([0, 0, -1.2])])).toBeNull();
	});

	it('the nearer of two in line', () => {
		const near = spot([0, 0, -1], { id: 'near' });
		const far = spot([0, 0, -1.8], { id: 'far' });
		expect(lookedAtTeammate(flat, EYE, AHEAD, [far, near])?.id).toBe('near');
	});
});

describe('teammateSpot and needs', () => {
	it('leaves out the downed, and says what they could use', () => {
		const s = createPlayerState([0, 0, 0], 0);
		expect(teammateSpot('b', s)).toMatchObject({ hurt: false, lampLow: false });
		s.sanity = 50;
		s.battery = 0.5;
		const hurt = teammateSpot('b', s)!;
		expect(needs(hurt, 'heal')).toBe(true);
		expect(needs(hurt, 'charge')).toBe(true);
		s.downed = true;
		expect(teammateSpot('b', s)).toBeNull();
	});
});

describe('tending in the step', () => {
	/** A player with `item` in hand, and the events of running `input` for `seconds`. */
	function tend(
		item: string,
		input: Partial<InputFrame>,
		seconds: number,
		teammates: TeammateSpot[]
	) {
		const inv = emptyInventory();
		addItem(inv, newStack(item, 2));
		const s = createPlayerState([0, 0, 0], 0, inv);
		const events: SimEvent[] = [];
		const step = (frame: Partial<InputFrame>, n: number, out?: SimEvent[]) => {
			for (let i = 0; i < n; i++) {
				const f = { ...idleFrame(i, s), select: HAND.quick, ...frame, seq: i };
				stepPlayer(s, f, flat, DT, MOVEMENT, DEFAULT_HEADLAMP, out, [], teammates);
			}
		};
		step({}, SIM_RATE);
		step(input, Math.round(seconds * SIM_RATE), events);
		return { s, events };
	}

	const front = [spot([0, 0, -1.2])];
	const BANDAGE = ITEMS.bandage.heal!.seconds;

	it('holding aim on a hurt teammate counts up, then spends one and reports it', () => {
		const half = tend('bandage', { aim: true }, BANDAGE / 2, front);
		expect(half.s.tending).toBeGreaterThan(0);
		expect(half.s.patient).toBe('b');
		const done = tend('bandage', { aim: true }, BANDAGE + 0.1, front);
		expect(done.events).toContainEqual({ kind: 'tend', patient: 'b', item: 'bandage' });
		expect(done.s.inventory.quick[0]?.count).toBe(1);
		// Not on yourself.
		expect(done.s.sanity).toBe(SANITY.max);
	});

	it('only for one who needs it: a full-health teammate gets no bandage', () => {
		const { s, events } = tend('bandage', { aim: true }, BANDAGE + 0.1, [
			spot([0, 0, -1.2], { hurt: false })
		]);
		expect(s.tending).toBe(0);
		expect(events.some((e) => e.kind === 'tend')).toBe(false);
	});

	it('a battery needs a lamp that is not full', () => {
		const seconds = ITEMS.battery.charge!.seconds + 0.1;
		const full = tend('battery', { aim: true }, seconds, [spot([0, 0, -1.2], { lampLow: false })]);
		expect(full.events.some((e) => e.kind === 'tend')).toBe(false);
		const low = tend('battery', { aim: true }, seconds, front);
		expect(low.events).toContainEqual({ kind: 'tend', patient: 'b', item: 'battery' });
	});

	it('moving stops it, and so does nobody being there', () => {
		expect(tend('bandage', { aim: true, moveZ: 1 }, 0.5, front).s.tending).toBe(0);
		expect(tend('bandage', { aim: true }, 0.5, []).s.tending).toBe(0);
	});
});
