import { describe, expect, it, vi } from 'vitest';
import { AFFLICTIONS } from '../src/lib/content/afflictions.ts';
import { MAP_KIT } from '../src/lib/content/map/kit.ts';
import { SANITY } from '../src/lib/content/player/sanity.ts';
import { PIECES } from '../src/lib/shared/map/pieces.generated.ts';
import { entryPoint, roomPoints, spawnPoint } from '../src/lib/shared/map/points.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';
import { config } from './config.ts';
import { useSessions, kit, Diver, FakeSocket, wait } from './testing/harness.ts';

const SEED = 1;
const RITE = AFFLICTIONS.gloaming.rite;
const open = useSessions();

describe('joining and leaving', () => {
	it('welcomes a player with the map and starts ticking', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		const welcome = diver.socket.last('welcome')!;
		expect(welcome.playerId).toBe(diver.id);
		expect(welcome.layout).toEqual(JSON.parse(JSON.stringify(session.layout)));
		expect(welcome.resumed).toBe(false);
		expect(diver.socket.last('marks')!.marks).toEqual([]);
		wait(0.5);
		const ticks = diver.socket.all('tick');
		expect(ticks.length).toBeGreaterThanOrEqual(9);
		// The floor items go out once, then only when they change.
		expect(ticks[0].items).toBeDefined();
		expect(ticks.at(-1)!.items).toBeUndefined();
		const spawn = spawnPoint(session.layout, PIECES).position;
		const away = Math.hypot(diver.state.position[0] - spawn[0], diver.state.position[2] - spawn[2]);
		expect(away).toBeLessThan(3);
		expect(session.playerCount).toBe(1);
		expect(session.afflictionId).toBe('gloaming');
	});

	it('a full party starts side by side, each on their own spot, facing the pit', () => {
		const session = open(SEED);
		const divers = [0, 1, 2, 3].map(() => new Diver(session));
		for (const [i, diver] of divers.entries()) {
			const spawn = spawnPoint(session.layout, PIECES, i);
			expect(diver.state.position[0]).toBeCloseTo(spawn.position[0], 1);
			expect(diver.state.position[2]).toBeCloseTo(spawn.position[2], 1);
			expect(diver.state.yaw).toBeCloseTo(spawn.yaw);
			// Facing the middle of the room: where the pit and its rope are.
			const start = session.layout.placements[0].position;
			const ahead = [-Math.sin(spawn.yaw), -Math.cos(spawn.yaw)];
			const toMiddle = [start[0] - spawn.position[0], start[2] - spawn.position[2]];
			const along = (ahead[0] * toMiddle[0] + ahead[1] * toMiddle[1]) / Math.hypot(...toMiddle);
			expect(along).toBeCloseTo(1);
			for (const other of divers.slice(i + 1)) {
				const apart = Math.hypot(
					diver.state.position[0] - other.state.position[0],
					diver.state.position[2] - other.state.position[2]
				);
				expect(apart).toBeGreaterThan(1);
			}
		}
	});

	it('the start room is no way out: the nearest is at the end of level 1', () => {
		const session = open(SEED);
		const start = session.layout.placements[0];
		expect(PIECES[start.piece].extracts).toEqual([]);
		expect(PIECES[start.piece].ropes).toEqual([]);
	});

	it('the way down is the rope on the pit lip: off its end unhurt, and no way back up it', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'clearCreatures' });
		const rope = session['world'].ropes.find((r) => r.hangsFree)!;
		expect(rope).toBeDefined();
		expect(session['world'].anchors.some((a) => a.landing[1] === rope.landing![1])).toBe(false);
		// From the chapel floor: stand on the landing, look at the rope and take hold.
		diver.put(rope.landing!);
		const look = diver.lookAt(rope.top);
		diver.hold(look, 0.2);
		diver.press({ ...look, interact: true });
		expect(diver.state.climbing?.rope).toBe(rope.id);
		// All the way down, and off the end.
		for (let i = 0; i < 40 && diver.state.climbing; i++) diver.hold({ moveZ: -1 }, 0.5);
		diver.hold({}, 1);
		expect(diver.state.climbing).toBeNull();
		const foot = entryPoint(session['world'], session.layout, PIECES);
		expect(diver.state.position[1]).toBeCloseTo(foot[1] - 0.05, 1);
		expect(diver.state.sanity).toBe(SANITY.max);
		expect(diver.state.conditions).toEqual([]);
		// The end hangs out of reach: a press under it takes hold of nothing.
		const up = diver.lookAt([rope.top[0], rope.bottom + 1, rope.top[2]]);
		diver.put([rope.top[0] + 0.3, diver.state.position[1], rope.top[2]]);
		diver.press({ ...up, interact: true });
		expect(diver.state.climbing).toBeNull();
	});

	it('admin can teleport to the start room, or skip the climb to the foot of its pit', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		const start = session.layout.placements[0].piece;
		const foot = entryPoint(session['world'], session.layout, PIECES);
		session.admin(diver.id, { kind: 'teleport', room: `${start}-foot` });
		expect(diver.state.position[1]).toBeCloseTo(foot[1], 0);
		session.admin(diver.id, { kind: 'teleport', room: start });
		expect(diver.state.position[1]).toBeCloseTo(spawnPoint(session.layout, PIECES).position[1], 0);
	});

	it('falls back to the default Affliction for an unknown one', () => {
		expect(open(SEED, {}, 'no-such').afflictionId).toBe('gloaming');
	});

	it('a player who reconnects resumes where they stood', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		diver.hold({ moveZ: 1 }, 0.5);
		const where = [...diver.state.position];
		const again = new FakeSocket();
		expect(session.reattach(diver.id, again.ws)).toBe(true);
		expect(again.last('welcome')!.resumed).toBe(true);
		expect(diver.state.position).toEqual(where);
		expect(session.reattach('nobody', again.ws)).toBe(false);
	});

	it('the last player out ends the expedition and calls the hooks', () => {
		const left = vi.fn();
		const ended = vi.fn();
		const session = open(SEED, { onPlayerLeft: left, onEnded: ended });
		const a = new Diver(session, 'A');
		const b = new Diver(session, 'B');
		session.removePlayer(a.id);
		expect(left).toHaveBeenCalledWith('explorer-A', null);
		expect(session.ended).toBe(false);
		session.removePlayer(b.id);
		expect(ended).toHaveBeenCalledOnce();
		expect(session.ended).toBe(true);
		const ticks = b.socket.all('tick').length;
		wait(1);
		expect(b.socket.all('tick').length).toBe(ticks);
	});

	it('abandoning leaves everything carried on the floor', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['coins', 10], ['knife']));
		wait(0.2);
		const items = session['items'].snapshots().length;
		session.abandon(diver.id);
		const summary = diver.socket.last('abandoned')!;
		expect(summary.deepestLevel).toBe(0);
		expect(diver.inside).toBe(false);
		expect(session['items'].snapshots().length).toBe(items + 2);
	});
});

describe('input', () => {
	it('moves a player who walks forward and acknowledges their frames', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		diver.hold({}, 0.5);
		const before = [...diver.state.position];
		// Along the chapel's wall: straight ahead is the well curb, a step away.
		diver.hold({ moveZ: 1, yaw: diver.state.yaw + Math.PI / 2 }, 1);
		const moved = Math.hypot(
			diver.state.position[0] - before[0],
			diver.state.position[2] - before[2]
		);
		expect(moved).toBeGreaterThan(1);
		expect(diver.socket.last('tick')!.players[0].ack).toBeGreaterThan(0);
	});

	it('ignores junk, stale frames and other players', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		session.receiveInput(diver.id, 'nonsense');
		session.receiveInput(diver.id, [{ seq: 'x' }, null]);
		session.receiveInput('nobody', [{ seq: 1 }]);
		expect(diver.player.queue).toHaveLength(0);
		diver.hold({}, 0.2);
		const queued = diver.player.queue.length;
		session.receiveInput(diver.id, [{ seq: diver.player.ack - 1 }]);
		expect(diver.player.queue).toHaveLength(queued);
	});

	it('drops the oldest frames when a client runs far ahead', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		for (let n = 0; n < 10; n++) {
			session.receiveInput(
				diver.id,
				Array.from({ length: 30 }, (_, i) => ({ seq: n * 30 + i }))
			);
		}
		expect(diver.player.queue.length).toBeLessThanOrEqual(120);
		expect(diver.player.queue.at(-1)!.seq).toBe(299);
	});
});

describe('getting out', () => {
	it('holding interact at an extraction point climbs out with what is carried', () => {
		const left = vi.fn();
		const session = open(SEED, { onPlayerLeft: left });
		const diver = new Diver(session, 'A', kit(['coins', 7]));
		session.admin(diver.id, { kind: 'clearCreatures' });
		const point = session['world'].extracts[0];
		diver.put(session['freeSpot']([point[0], point[1] - 0.3, point[2]]));
		diver.hold({}, 0.5);
		diver.hold({ interact: true }, 4);
		const out = diver.socket.last('extracted')!;
		expect(out.carried).toEqual([{ item: 'coins', count: 7 }]);
		expect(left).toHaveBeenCalledWith('explorer-A', expect.objectContaining({}));
		expect(session.ended).toBe(true);
	});

	it('climbing an extraction rope a few metres gets you out', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['coins', 3]));
		session.admin(diver.id, { kind: 'clearCreatures' });
		// The rope up the shaft of the extraction room at the end of the first level.
		const rope = session['world'].ropes.find((r) => r.exitY !== undefined)!;
		expect(rope).toBeDefined();
		// Beside it, looking at it (it is to the west).
		diver.put([rope.top[0] + 0.4, rope.bottom + 0.05, rope.top[2]], Math.PI / 2);
		diver.hold({}, 0.3);
		diver.hold({ interact: true }, 0.05);
		expect(diver.state.climbing?.rope).toBe(rope.id);
		diver.hold({ moveZ: 1 }, 14);
		expect(diver.socket.last('extracted')!.carried).toEqual([{ item: 'coins', count: 3 }]);
	});

	it('a long fall hurts, hobbles and is heard', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'clearCreatures' });
		const start = diver.state.position;
		diver.hold({}, 0.5);
		const floor = diver.state.position[1];
		// Already falling fast (as from a long drop), just above the floor.
		diver.put([start[0], floor + 0.5, start[2]]);
		diver.state.grounded = false;
		diver.state.velocity = [0, -15, 0];
		diver.hold({}, 1.5);
		expect(diver.state.sanity).toBeLessThan(SANITY.max - 20);
		expect(diver.state.conditions.map((c) => c.id)).toEqual(['hobble']);
		const ticks = diver.socket.all('tick');
		expect(ticks.some((t) => t.events.some((e) => e.kind === 'fall'))).toBe(true);
		session.admin(diver.id, { kind: 'clearConditions' });
		expect(diver.state.conditions).toEqual([]);
	});

	it("can't climb out with the menu open: the hands are on it", () => {
		const session = open(SEED);
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'clearCreatures' });
		const point = session['world'].extracts[0];
		diver.put(session['freeSpot']([point[0], point[1] - 0.3, point[2]]));
		diver.hold({}, 0.5);
		diver.hold({ interact: true, reading: true }, 4);
		expect(diver.socket.last('extracted')).toBeUndefined();
		expect(diver.state.extracting).toBe(0);
	});

	it('when time runs out, everyone still down is lost', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'setDeadline', seconds: 0 });
		wait(0.2);
		const died = diver.socket.last('died')!;
		expect(died.lost).toBe(true);
	});

	it('banishing what was summoned resolves it, and nobody is carried out', () => {
		const resolved = vi.fn();
		const session = open(SEED, { onResolved: resolved });
		const a = new Diver(session, 'A');
		const b = new Diver(session, 'B');
		session.admin(a.id, { kind: 'manifest' });
		wait(0.2);
		const manifestation = a.socket.last('tick')!.affliction.manifestation!;
		expect(manifestation).not.toBeNull();
		// Summoned into the rite's room.
		expect(session['rite'].inRoom(manifestation.position)).toBe(true);
		const events = a.socket.all('tick').flatMap((t) => t.events);
		expect(events.some((e) => e.kind === 'manifest')).toBe(true);
		session.admin(a.id, { kind: 'banish' });
		wait(0.2);
		expect(resolved).toHaveBeenCalledOnce();
		expect(a.socket.all('tick').some((t) => t.events.some((e) => e.kind === 'resolved'))).toBe(
			true
		);
		expect(a.socket.last('tick')!.affliction.rite.resolved).toBe(true);
		expect(a.socket.last('tick')!.affliction.calmed).toBe(true);
		expect(a.inside && b.inside).toBe(true);
		expect(session.ended).toBe(false);
	});
});

describe('achievements', () => {
	const earned = (diver: Diver): string[] =>
		diver.socket.all('achievement').flatMap((message) => message.ids);

	it('getting out alive alone earns the first extraction, not the co-op one', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A');
		session.admin(diver.id, { kind: 'clearCreatures' });
		const point = session['world'].extracts[0];
		diver.put(session['freeSpot']([point[0], point[1] - 0.3, point[2]]));
		diver.hold({}, 0.5);
		diver.hold({ interact: true }, 4);
		expect(diver.socket.last('extracted')).toBeDefined();
		expect(earned(diver)).toEqual(['FIRST_EXTRACTION']);
	});

	it('a banishing earns it for everyone still down there, who then still have to get out', () => {
		const session = open(SEED);
		const a = new Diver(session, 'A');
		const b = new Diver(session, 'B');
		session.admin(a.id, { kind: 'manifest' });
		wait(0.2);
		session.admin(a.id, { kind: 'banish' });
		wait(0.2);
		for (const diver of [a, b]) {
			expect(diver.inside).toBe(true);
			expect(earned(diver)).toEqual(['BANISHED']);
		}
	});

	it('dying earns nothing', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'setDeadline', seconds: 0 });
		wait(0.2);
		expect(diver.socket.last('died')).toBeDefined();
		expect(earned(diver)).toEqual([]);
	});

	it('performing the rite earns it for everyone still down there', () => {
		const session = open(SEED);
		const stacks = RITE.requirements.map((r): [string, number] => [r.item, r.count]);
		const performer = new Diver(session, 'A', kit(...stacks));
		const other = new Diver(session, 'B');
		session.admin(performer.id, { kind: 'clearCreatures' });
		session.revealClues(RITE.clues.length);
		session.admin(performer.id, { kind: 'teleport', room: RITE.room });
		performer.hold({}, 0.5);
		performer.hold({ interact: true }, RITE.seconds + 0.5);
		// Performed, not resolved: that takes banishing what it summons.
		expect(session['rite'].performed).toBe(true);
		expect(session['rite'].resolved).toBe(false);
		expect(earned(performer)).toEqual(['RITE_PERFORMED']);
		expect(earned(other)).toEqual(['RITE_PERFORMED']);
	});
});

describe('admin commands', () => {
	it('are ignored unless the server runs in dev mode', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		config.devMode = false;
		session.admin(diver.id, { kind: 'noclip', enabled: true });
		expect(diver.state.flags.noclip).toBe(false);
	});

	it('set the player flags, the meter, the clock and the items', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['revolver']));
		for (const kind of ['noclip', 'infiniteStamina', 'infiniteBattery', 'godMode'] as const) {
			session.admin(diver.id, { kind, enabled: true });
			expect(diver.state.flags[kind]).toBe(true);
		}
		session.admin(diver.id, { kind: 'infiniteAmmo', enabled: true });
		expect(diver.state.flags.infiniteAmmo).toBe(true);
		session.admin(diver.id, { kind: 'setMeter', value: 0.6 });
		wait(0.1);
		expect(diver.socket.last('tick')!.affliction.omen).toBe(2);
		session.admin(diver.id, { kind: 'setDeadline', seconds: 100 });
		wait(0.1);
		expect(diver.socket.last('tick')!.affliction.deadline).toBeLessThanOrEqual(100);
		session.admin(diver.id, { kind: 'give', item: 'bandage', count: 3 });
		session.admin(diver.id, { kind: 'give', item: 'no-such-item', count: 1 });
		expect(diver.state.inventory.quick[0]).toMatchObject({ item: 'bandage', count: 3 });
		session.admin(diver.id, { kind: 'refillAmmo' });
		expect(diver.state.inventory.backpack.some((s) => s?.item === 'ammo.revolver')).toBe(true);
		session.admin(diver.id, { kind: 'killCreatures' });
		expect(session['creatures'].hitBodies()).toHaveLength(0);
		session.admin(diver.id, { kind: 'teleport', room: 'no-such-room' });
		expect(() => session.admin(diver.id, { kind: 'throw' })).toThrow();
	});

	it('moves the body to the free camera: it falls to the floor, or stays with noclip', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'clearCreatures' });
		const room = roomPoints(session['layout'], PIECES, MAP_KIT).find(
			(r) => MAP_KIT[r.name]?.role === 'major'
		)!;
		const [x, y, z] = room.position;
		// The camera a few metres over the room's floor: the eyes go there, then the body falls.
		session.admin(diver.id, { kind: 'teleportTo', position: [x, y + 4, z] });
		expect(Math.hypot(diver.state.position[0] - x, diver.state.position[2] - z)).toBeLessThan(3);
		expect(diver.state.position[1]).toBeGreaterThan(y + 1);
		diver.hold({}, 2);
		expect(diver.state.position[1]).toBeLessThan(y + 1);
		// Over no floor at all, or not a position: nothing happens.
		const before = [...diver.state.position];
		session.admin(diver.id, { kind: 'teleportTo', position: [99999, 0, 99999] });
		session.admin(diver.id, { kind: 'teleportTo', position: [NaN, 0, 0] as Vec3 });
		expect(diver.state.position).toEqual(before);
		// Noclip: the body stays under the camera, in the air.
		session.admin(diver.id, { kind: 'noclip', enabled: true });
		session.admin(diver.id, { kind: 'teleportTo', position: [x, y + 20, z] });
		diver.hold({}, 1);
		expect(diver.state.position[1]).toBeGreaterThan(y + 15);
	});
	it('reveal and reset the rite, and clear the marks', () => {
		const clues = vi.fn();
		const reset = vi.fn();
		const session = open(SEED, { onClues: clues, onRiteReset: reset });
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'revealClues' });
		expect(clues).toHaveBeenCalledWith(RITE.clues.length);
		session.admin(diver.id, { kind: 'resetRite' });
		expect(reset).toHaveBeenCalledOnce();
		session.admin(diver.id, { kind: 'clearMarks' });
		expect(diver.socket.last('marks')!.marks).toEqual([]);
	});

	it('regenerate builds a new map from a seed and puts everyone at its start', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'regenerate', seed: 99 });
		expect(session.seed).toBe(99);
		expect(diver.socket.last('map')!.layout.seed).toBe(99);
		const spawn = spawnPoint(session.layout, PIECES).position;
		expect(
			Math.hypot(diver.state.position[0] - spawn[0], diver.state.position[2] - spawn[2])
		).toBeLessThan(3);
	});
});

describe('a tick that throws', () => {
	it('tells every player once and keeps the expedition going', async () => {
		const session = open(SEED);
		const diver = new Diver(session);
		const step = session['step'].bind(session);
		let fail = true;
		session['step'] = () => {
			if (fail) throw new Error('boom');
			step();
		};
		wait(0.2);
		await vi.waitFor(() => expect(diver.socket.last('serverError')).toBeDefined());
		expect(diver.socket.all('serverError')).toHaveLength(1);
		fail = false;
		const ticks = diver.socket.all('tick').length;
		wait(0.2);
		expect(diver.socket.all('tick').length).toBeGreaterThan(ticks);
	});
});
