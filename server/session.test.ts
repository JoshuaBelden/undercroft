import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AFFLICTIONS } from '../src/lib/content/afflictions.ts';
import { CRATES } from '../src/lib/content/loot.ts';
import { DEFAULT_MARK_WHEEL } from '../src/lib/content/marks.ts';
import { SANITY } from '../src/lib/content/player/sanity.ts';
import { addItem, emptyInventory, newStack } from '../src/lib/shared/items/inventory.ts';
import { segmentHit } from '../src/lib/shared/map/collision.ts';
import { crateCentre } from '../src/lib/shared/map/crates.ts';
import { PIECES } from '../src/lib/shared/map/pieces.generated.ts';
import { spawnPoint } from '../src/lib/shared/map/points.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';
import { HAND, type Inventory } from '../src/lib/shared/player/types.ts';
import { config } from './config.ts';
import { Diver, FakeSocket, fakeTime, newSession, wait } from './testing/harness.ts';
import type { Session } from './session.ts';

const SEED = 1;
const RITE = AFFLICTIONS.gloaming.rite;
const SYMBOL = DEFAULT_MARK_WHEEL[0];

let sessions: Session[] = [];
/** A session that is stopped after the test. */
function open(...args: Parameters<typeof newSession>): Session {
	const session = newSession(...args);
	sessions.push(session);
	return session;
}

beforeEach(() => {
	fakeTime();
	config.devMode = true;
});
afterEach(() => {
	for (const session of sessions) session.stop();
	sessions = [];
	vi.useRealTimers();
	config.devMode = false;
});

function kit(...stacks: [string, number?][]): Inventory {
	const inv = emptyInventory();
	for (const [item, count] of stacks) addItem(inv, newStack(item, count ?? 1, 99));
	return inv;
}

/** The middle of the first living creature's body. */
function creatureChest(session: Session): Vec3 {
	const body = session['creatures'].hitBodies()[0];
	return [body.position[0], body.position[1] + body.height * 0.55, body.position[2]];
}

/** Stand a diver in front of a crate (not a corpse) they can open, looking at it. */
function atCrate(session: Session, diver: Diver) {
	for (const { crate } of session['crates'].list()) {
		if (crate.kind) continue;
		const yaw = Number(session.layout.crates.find((c) => c.id === crate.id)?.yaw ?? 0);
		const front: Vec3 = [
			crate.position[0] + Math.sin(yaw) * 1.3,
			crate.position[1] + 0.05,
			crate.position[2] + Math.cos(yaw) * 1.3
		];
		diver.put(session['freeSpot'](front));
		diver.hold({}, 0.3);
		const look = diver.lookAt(crateCentre(crate));
		diver.state.yaw = look.yaw;
		diver.state.pitch = look.pitch;
		const ray = diverRay(diver);
		if (session['crates'].lookedAt(ray.origin, ray.direction) === crate) return { crate, look };
	}
	throw new Error('No crate to stand at');
}

function diverRay(diver: Diver): { origin: Vec3; direction: Vec3 } {
	const s = diver.state;
	const cp = Math.cos(s.pitch);
	return {
		origin: diver.eye,
		direction: [-Math.sin(s.yaw) * cp, Math.sin(s.pitch), -Math.cos(s.yaw) * cp]
	};
}

/** A stone surface within chalk reach, straight ahead at eye level on some heading. */
function wallInReach(session: Session, diver: Diver): { yaw: number; point: Vec3; normal: Vec3 } {
	const world = session['world'];
	for (let i = 0; i < 32; i++) {
		const yaw = (i / 32) * Math.PI * 2;
		const dir: Vec3 = [-Math.sin(yaw), 0, -Math.cos(yaw)];
		const eye = diver.eye;
		const far: Vec3 = [eye[0] + dir[0] * 1.8, eye[1], eye[2] + dir[2] * 1.8];
		const t = segmentHit(world, eye, far);
		if (t === null || t * 1.8 < 0.6) continue;
		const d = t * 1.8 + 0.02;
		return {
			yaw,
			point: [eye[0] + dir[0] * d, eye[1], eye[2] + dir[2] * d],
			normal: [-dir[0], 0, -dir[2]]
		};
	}
	throw new Error('No wall near');
}

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
		diver.hold({ moveZ: 1 }, 1);
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

describe('fighting', () => {
	it('a revolver shot hits a creature in front, and enough of them kill it', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['revolver'], ['ammo.revolver', 30]));
		diver.state.flags.godMode = true;
		session.admin(diver.id, { kind: 'clearCreatures' });
		session.admin(diver.id, { kind: 'spawnCreature' });
		diver.hold({}, 0.5);
		const events = () => diver.socket.all('tick').flatMap((t) => t.events);
		for (let i = 0; i < 12 && session['creatures'].hitBodies().length; i++) {
			const look = diver.lookAt(creatureChest(session));
			diver.hold({ ...look, aim: true }, 0.1);
			diver.press({ ...look, aim: true, attack: true });
			diver.hold({ ...look, aim: true, reload: i % 6 === 5 }, 0.6);
		}
		expect(events().some((e) => e.kind === 'shot' && e.creature)).toBe(true);
		expect(events().some((e) => e.kind === 'creatureHit')).toBe(true);
		expect(events().some((e) => e.kind === 'creatureDie' && e.by === diver.id)).toBe(true);
		expect(diver.player.stats.kills).toBe(1);
	});

	it('an empty gun clicks, and reloads from the ammo carried', () => {
		const session = open(SEED);
		const inv = kit(['revolver'], ['ammo.revolver', 6]);
		inv.equipment.primary!.loaded = 0;
		const diver = new Diver(session, 'A', inv);
		diver.hold({}, 0.5);
		diver.press({ attack: true });
		diver.hold({}, 3);
		const events = diver.socket.all('tick').flatMap((t) => t.events);
		expect(events.some((e) => e.kind === 'empty')).toBe(true);
		expect(events.some((e) => e.kind === 'reload')).toBe(true);
		expect(diver.state.inventory.equipment.primary!.loaded).toBe(6);
	});

	it('a knife swing hits a creature close in front', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['knife']));
		diver.state.flags.godMode = true;
		session.admin(diver.id, { kind: 'clearCreatures' });
		session.admin(diver.id, { kind: 'spawnCreature' });
		const events = () => diver.socket.all('tick').flatMap((t) => t.events);
		for (let i = 0; i < 40 && !events().some((e) => e.kind === 'creatureHit'); i++) {
			// Let it come to us, and swing at it.
			diver.hold({ ...diver.lookAt(creatureChest(session)), attack: true }, 0.25);
		}
		expect(events().some((e) => e.kind === 'swing' && e.hit === 'creature')).toBe(true);
	});

	it('a thrown brick flies, lands and can be picked up again', () => {
		const session = open(SEED);
		session.admin('nobody', { kind: 'clearCreatures' });
		const diver = new Diver(session, 'A', kit(['brick']));
		diver.hold({ select: HAND.quick }, 0.5);
		diver.press({ select: HAND.quick, pitch: -0.3, aim: true });
		diver.hold({ select: HAND.quick }, 2);
		const events = diver.socket.all('tick').flatMap((t) => t.events);
		expect(events.some((e) => e.kind === 'throw')).toBe(true);
		expect(events.some((e) => e.kind === 'land')).toBe(true);
		expect(diver.state.inventory.quick[0]).toBeNull();
	});

	it('creatures attack a player who stands in front of them, and a coat takes the blows', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['coat']));
		session.admin(diver.id, { kind: 'clearCreatures' });
		session.admin(diver.id, { kind: 'spawnCreature' });
		diver.hold({}, 12);
		expect(
			diver.state.sanity < SANITY.max || diver.state.inventory.equipment.defense === null
		).toBe(true);
	});
});

describe('items on the floor', () => {
	it('dropping from the pack puts it in front, and interact picks it back up', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['coins', 5]));
		diver.hold({ pitch: -0.9 }, 0.3);
		session.inventory(diver.id, { kind: 'drop', from: { area: 'backpack', index: 0 }, count: 5 });
		expect(diver.state.inventory.backpack[0]).toBeNull();
		diver.hold({ pitch: -0.9 }, 0.2);
		const dropped = session['items'].snapshots().find((i) => i.item === 'coins')!;
		expect(dropped).toBeDefined();
		const look = diver.lookAt(dropped.position);
		diver.hold(look, 0.1);
		diver.press({ ...look, interact: true });
		expect(diver.state.inventory.backpack[0]).toMatchObject({ item: 'coins', count: 5 });
		const events = diver.socket.all('tick').flatMap((t) => t.events);
		expect(events.some((e) => e.kind === 'pickup')).toBe(true);
	});

	it('the drop button throws what is in the hand on the floor', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['knife']));
		diver.hold({}, 0.5);
		diver.press({ drop: true });
		expect(diver.state.inventory.equipment.primary).toBeNull();
		expect(session['items'].snapshots().some((i) => i.item === 'knife')).toBe(true);
	});

	it('ignores pack requests from someone who is down', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['coins', 5]));
		session.admin(diver.id, { kind: 'setSanity', value: 0 });
		session.inventory(diver.id, { kind: 'drop', from: { area: 'backpack', index: 0 }, count: 5 });
		expect(diver.state.inventory.backpack[0]).not.toBeNull();
		session.inventory('nobody', {});
	});
});

describe('crates', () => {
	it('holding interact opens a crate, its slots are revealed one at a time and can be taken', () => {
		const session = open(SEED);
		session.admin('x', { kind: 'clearCreatures' });
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'clearCreatures' });
		const { crate, look } = atCrate(session, diver);
		diver.hold({ ...look, interact: true }, CRATES.openSeconds + 0.2);
		expect(diver.player.crate).toBe(crate.id);
		const opened = diver.socket.last('crate')!;
		expect(opened.id).toBe(crate.id);
		expect(opened.slots.filter((s) => s === 'hidden').length).toBeGreaterThan(0);
		diver.hold(look, CRATES.revealSeconds * 9);
		const view = diver.socket.last('crate')!;
		expect(view.slots.every((s) => s !== 'hidden')).toBe(true);
		const index = view.slots.findIndex((s) => s !== null && s !== 'hidden' && s.item !== 'clue');
		session.inventory(diver.id, { kind: 'quick', from: { area: 'stash', index } });
		expect(crate.slots[index]).toBeNull();
		expect(diver.player.stats.crates).toBe(1);
		expect(diver.socket.last('tick')!.crates.open).toContain(crate.id);
		session.closeCrate(diver.id);
		expect(diver.player.crate).toBeNull();
		expect(diver.socket.last('crate')!.id).toBeNull();
		// Answered even when nothing is open.
		session.closeCrate(diver.id);
		expect(diver.socket.last('crate')!.id).toBeNull();
	});

	it('walking away shuts the crate', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'clearCreatures' });
		const { look } = atCrate(session, diver);
		diver.hold({ ...look, interact: true }, CRATES.openSeconds + 0.2);
		expect(diver.player.crate).not.toBeNull();
		diver.put(spawnPoint(session.layout, PIECES).position);
		diver.hold({}, 0.2);
		expect(diver.player.crate).toBeNull();
	});

	it('admin reset fills every crate again, shut', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'clearCreatures' });
		const { look } = atCrate(session, diver);
		diver.hold({ ...look, interact: true }, CRATES.openSeconds + 0.2);
		session.admin(diver.id, { kind: 'resetCrates' });
		expect(diver.player.crate).toBeNull();
		expect(session['crates'].snapshot().open).toEqual([]);
	});
});

describe('chalk marks', () => {
	it('draws a mark on the wall in front, and holding interact rubs it out', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['chalk', 2]));
		session.admin(diver.id, { kind: 'clearCreatures' });
		diver.hold({ select: HAND.quick }, 0.5);
		const wall = wallInReach(session, diver);
		diver.hold({ select: HAND.quick, yaw: wall.yaw, pitch: 0 }, 0.1);
		session.mark(diver.id, SYMBOL, wall.point, wall.normal);
		const marks = diver.socket.last('marks')!.marks;
		expect(marks).toHaveLength(1);
		expect(marks[0]).toMatchObject({ symbol: SYMBOL, by: diver.id, name: 'A' });
		// Not on top of the first one, and not with nothing in the hand.
		session.mark(diver.id, SYMBOL, wall.point, wall.normal);
		expect(diver.socket.last('marks')!.marks).toHaveLength(1);
		diver.hold({ select: HAND.quick, yaw: wall.yaw, pitch: 0, interact: true }, 1.5);
		expect(diver.socket.last('marks')!.marks).toEqual([]);
	});

	it('refuses a symbol that is not on the wheel, and a mark with no chalk', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['chalk']));
		diver.hold({ select: HAND.quick }, 0.5);
		const wall = wallInReach(session, diver);
		diver.hold({ select: HAND.quick, yaw: wall.yaw, pitch: 0 }, 0.1);
		session.mark(diver.id, 'no-such-symbol', wall.point, wall.normal);
		session.mark(diver.id, SYMBOL, 'here', wall.normal);
		expect(diver.socket.all('marks')).toHaveLength(1);
		const bare = new Diver(session, 'B');
		session.mark(bare.id, SYMBOL, wall.point, wall.normal);
		expect(bare.socket.all('marks')).toHaveLength(1);
	});
});

describe('down, dead and revived', () => {
	it('at no sanity a player is down; holding climb gives up, and they die', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['coins', 3]));
		session.admin(diver.id, { kind: 'setSanity', value: 0 });
		expect(diver.state.downed).toBe(true);
		diver.hold({}, 0.1);
		diver.hold({ climb: true }, SANITY.surrenderSeconds + 0.3);
		const died = diver.socket.last('died')!;
		expect(died.spectating).toBe(false);
		expect(diver.inside).toBe(false);
		expect(session['items'].snapshots().some((i) => i.item === 'coins')).toBe(true);
	});

	it('a downed player alone uses their own smelling salts', () => {
		const session = open(SEED);
		const diver = new Diver(session, 'A', kit(['salts']));
		session.admin(diver.id, { kind: 'setSanity', value: 0 });
		diver.hold({}, 4);
		expect(diver.state.downed).toBe(false);
		expect(diver.state.sanity).toBeGreaterThanOrEqual(SANITY.reviveTo);
		expect(diver.state.inventory.quick[0]).toBeNull();
	});

	it('a teammate with salts revives a downed player by holding interact', () => {
		const session = open(SEED);
		const helper = new Diver(session, 'A', kit(['salts']));
		const patient = new Diver(session, 'B');
		patient.put(helper.state.position);
		session.admin(patient.id, { kind: 'setSanity', value: 0 });
		helper.hold({ interact: true }, SANITY.reviveSeconds + 0.5);
		expect(patient.state.downed).toBe(false);
	});

	it('admin sanity brings a downed player back up', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'setSanity', value: 0 });
		session.admin(diver.id, { kind: 'setSanity', value: 50 });
		expect(diver.state.downed).toBe(false);
		// Commands come off the network: a value that isn't a number gets the default.
		session.admin(diver.id, { kind: 'setSanity', value: 'lots' as unknown as number });
		expect(diver.state.sanity).toBe(SANITY.max);
	});

	it('a dead player watches the others until they are out too', () => {
		const session = open(SEED);
		const dead = new Diver(session, 'A');
		const alive = new Diver(session, 'B');
		session.admin(dead.id, { kind: 'setSanity', value: 0 });
		dead.hold({}, 0.1);
		dead.hold({ climb: true }, SANITY.surrenderSeconds + 0.3);
		expect(dead.socket.last('died')!.spectating).toBe(true);
		const ticks = dead.socket.all('tick').length;
		wait(0.5);
		expect(dead.socket.all('tick').length).toBeGreaterThan(ticks);
		session.removePlayer(alive.id);
		expect(dead.socket.last('spectateEnd')).toBeDefined();
	});

	it('the dark wears sanity down', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'clearCreatures' });
		diver.hold({ headlamp: 0 }, 3);
		expect(diver.state.sanity).toBeLessThan(SANITY.max);
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

	it('when time runs out, everyone still down is lost', () => {
		const session = open(SEED);
		const diver = new Diver(session);
		session.admin(diver.id, { kind: 'setDeadline', seconds: 0 });
		wait(0.2);
		const died = diver.socket.last('died')!;
		expect(died.lost).toBe(true);
	});

	it('banishing the manifestation sends everyone home', () => {
		const session = open(SEED);
		const a = new Diver(session, 'A');
		const b = new Diver(session, 'B');
		session.admin(a.id, { kind: 'manifest' });
		wait(0.2);
		expect(a.socket.last('tick')!.affliction.manifestation).not.toBeNull();
		const events = a.socket.all('tick').flatMap((t) => t.events);
		expect(events.some((e) => e.kind === 'manifest')).toBe(true);
		session.admin(a.id, { kind: 'banish' });
		wait(0.2);
		expect(a.socket.last('banished')).toBeDefined();
		expect(b.socket.last('banished')).toBeDefined();
		expect(session.ended).toBe(true);
	});
});

describe('the rite', () => {
	it('carrying everything into its room and holding interact performs it', () => {
		const resolved = vi.fn();
		const session = open(SEED, { onResolved: resolved });
		const stacks = RITE.requirements.map((r): [string, number] => [r.item, r.count]);
		const diver = new Diver(session, 'A', kit(...stacks));
		session.admin(diver.id, { kind: 'clearCreatures' });
		session.revealClues(RITE.clues.length);
		session.admin(diver.id, { kind: 'teleport', room: RITE.room });
		diver.hold({}, 0.5);
		expect(session['rite'].canPerform(diver.state)).toBe(true);
		diver.hold({ interact: true }, RITE.seconds + 0.5);
		expect(resolved).toHaveBeenCalledOnce();
		expect(diver.socket.last('tick')!.affliction.rite.resolved).toBe(true);
		expect(diver.socket.last('tick')!.affliction.calmed).toBe(true);
		// The rite used them up.
		expect(diver.state.inventory.backpack.every((s) => s === null)).toBe(true);
	});

	it('reading the last hint clears the copies left in the map', () => {
		const clues = vi.fn();
		const session = open(SEED, { onClues: clues });
		const diver = new Diver(session);
		session.revealClues(RITE.clues.length - 1);
		expect(session['items'].snapshots().some((i) => i.item === 'clue')).toBe(true);
		session['readClue'](diver.player, diver.state.position);
		expect(clues).toHaveBeenCalledWith(RITE.clues.length);
		expect(session['items'].snapshots().some((i) => i.item === 'clue')).toBe(false);
		// Nothing left to learn.
		expect(session['readClue'](diver.player, diver.state.position)).toBe(false);
	});

	it('withholding a quest item takes it out of the map', () => {
		const session = open(SEED);
		const inCrates = () =>
			session['crates'].list().some(({ crate }) => crate.slots.some((s) => s?.item === 'pendant'));
		expect(inCrates()).toBe(true);
		session.withhold(['pendant']);
		expect(inCrates()).toBe(false);
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
