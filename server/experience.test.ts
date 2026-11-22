import { describe, expect, it, vi } from 'vitest';
import { CREATURES } from '../src/lib/content/creatures.ts';
import { LOOTABLES } from '../src/lib/content/lootables.ts';
import { XP } from '../src/lib/content/progression.ts';
import { RECIPES } from '../src/lib/content/recipes.ts';
import { newStack } from '../src/lib/shared/items/inventory.ts';
import { modifiersFor } from '../src/lib/shared/progression/progression.ts';
import type { Crate } from './crates.ts';
import { playerExperience } from './experience.ts';
import type { Session } from './session.ts';
import { Diver, useSessions, wait } from './testing/harness.ts';

/** Experience earned down there (docs/dev/progression.md#earning). */

const open = useSessions();

function quiet(hooks = {}, affliction = 'gloaming'): Session {
	const session = open(1, hooks, affliction);
	session.admin('x', { kind: 'clearCreatures' });
	return session;
}

/** A plain crate (not sealed) holding these. */
function crateWith(session: Session, ...items: string[]): Crate {
	const crate = session['crates'].list().find(({ crate }) => !crate.kind)!.crate;
	crate.sealed = false;
	crate.slots = crate.slots.map((_, i) => (items[i] ? newStack(items[i]) : null));
	return crate;
}

const told = (diver: Diver): number[] => diver.socket.all('experience').map((m) => m.amount);

describe('looting', () => {
	it('the first opener earns the lootable, its best find, and the first-of-its-kind bonus once', () => {
		const session = quiet();
		const diver = new Diver(session);
		const crate = crateWith(session, 'rags');
		const event = {
			kind: 'crateOpen' as const,
			id: crate.id,
			player: diver.id,
			position: crate.position
		};
		session.experience.count([event]);
		session.experience.flush();
		expect(told(diver)).toEqual([LOOTABLES.crate.xp + XP.firstLootable]);
		session.experience.count([event]);
		expect(diver.player.experience.earned).toBe(2 * LOOTABLES.crate.xp + XP.firstLootable);
	});

	it('a sealed one pays for the work', () => {
		const session = quiet();
		const diver = new Diver(session);
		diver.player.experience.firsts.add('loot:crate');
		const crate = crateWith(session, 'rags');
		crate.sealed = true;
		session.experience.count([
			{ kind: 'crateOpen', id: crate.id, player: diver.id, position: crate.position }
		]);
		expect(diver.player.experience.earned).toBe(LOOTABLES.crate.sealed!.xp);
	});

	it('a first discovery pays', () => {
		const session = quiet();
		const diver = new Diver(session);
		session.discover(diver.player, 'rags', 'crate');
		session.discover(diver.player, 'rags', 'corpse');
		expect(diver.player.experience.bySource.discovery).toBe(XP.discovery);
	});
});

describe('crafting below', () => {
	it('pays each recipe twice a run, with its first-time bonus once', () => {
		const session = quiet();
		const diver = new Diver(session);
		const bandage = RECIPES.find((r) => r.id === 'bandage')!;
		for (let i = 0; i < 3; i++) session.experience.crafted(diver.player, bandage);
		expect(diver.player.experience.earned).toBe(2 * bandage.xp + XP.firstRecipe);
	});
});

describe('kills', () => {
	it('to the killer, half to a teammate near, nothing to one far off; moths pay nothing', () => {
		const session = quiet();
		const killer = new Diver(session, 'A');
		const near = new Diver(session, 'B');
		const far = new Diver(session, 'C');
		killer.put([0, 0, 0]);
		near.put([5, 0, 0]);
		far.put([100, 0, 0]);
		const kind = vi.spyOn(session['creatures'], 'kindOf').mockReturnValue('witch');
		session.experience.count([
			{ kind: 'creatureDie', id: 'w', position: [0, 0, 0], by: killer.id }
		]);
		expect(killer.player.experience.earned).toBe(CREATURES.witch.xp + XP.firstKill);
		expect(near.player.experience.earned).toBe(Math.round(CREATURES.witch.xp * XP.killShare));
		expect(far.player.experience.earned).toBe(0);
		kind.mockReturnValue('moth');
		killer.player.experience.firsts.add('kill:moth');
		const before = killer.player.experience.earned;
		session.experience.count([
			{ kind: 'creatureDie', id: 'm', position: [0, 0, 0], by: killer.id }
		]);
		expect(killer.player.experience.earned).toBe(before);
		expect(near.player.experience.earned).toBe(Math.round(CREATURES.witch.xp * XP.killShare));
	});
});

describe('hints and the rite', () => {
	it('a hint pays everyone the first time each learns it, ever', () => {
		const session = quiet();
		const a = new Diver(session, 'A');
		const b = new Diver(session, 'B');
		b.player.experience.firsts.add(`hint:gloaming:${session['rite'].clues}`);
		const clue = {
			kind: 'clue' as const,
			player: a.id,
			position: [0, 0, 0] as [number, number, number],
			text: '',
			requirements: [],
			room: null
		};
		session.experience.count([clue]);
		expect(a.player.experience.earned).toBe(XP.clue);
		expect(b.player.experience.earned).toBe(0);
	});

	it('the rite pays everyone present, more the first time', () => {
		const session = quiet();
		const a = new Diver(session, 'A');
		session.experience.count([{ kind: 'rite', player: a.id, position: [0, 0, 0] }]);
		session.experience.count([{ kind: 'rite', player: a.id, position: [0, 0, 0] }]);
		expect(a.player.experience.earned).toBe(2 * XP.rite + XP.firstRite);
	});
});

describe('the run ends', () => {
	it('getting out pays by depth with a first bonus; dying a quarter; abandoning nothing', () => {
		const session = quiet();
		const out = new Diver(session, 'A');
		const dead = new Diver(session, 'B');
		const gone = new Diver(session, 'C');
		out.player.deepestLevel = 2;
		dead.player.deepestLevel = 2;
		session.experience.finish(out.player, 'extracted');
		session.experience.finish(out.player, 'extracted');
		session.experience.finish(dead.player, 'died');
		session.experience.finish(gone.player, 'abandoned');
		expect(out.player.experience.earned).toBe(XP.extract[2] + XP.firstExtract);
		expect(dead.player.experience.earned).toBe(XP.extract[2] * XP.died);
		expect(gone.player.experience.earned).toBe(0);
	});

	it('extracting sends the experience in the results, and it is kept', () => {
		const kept = vi.fn();
		const session = quiet({ onExperience: kept });
		const diver = new Diver(session);
		diver.player.experience = playerExperience({
			xp: 1500,
			categories: [],
			skills: {},
			firsts: []
		});
		const owner = diver.player.owner;
		diver.state.extracted = true;
		wait(0.2);
		const result = diver.socket.last('extracted')!;
		expect(result.experience).toEqual({ earned: XP.extract[0] + XP.firstExtract, before: 1500 });
		expect(kept).toHaveBeenCalledWith(owner, XP.extract[0] + XP.firstExtract, ['extract:1']);
	});

	it('a training ground (Rumors) pays only its firsts', () => {
		const session = quiet({}, 'rumors');
		const diver = new Diver(session);
		session.experience.finish(diver.player, 'extracted');
		expect(diver.player.experience.earned).toBe(XP.firstExtract);
	});
});

describe('skills down there', () => {
	it('come down with the explorer and change what the server does', () => {
		const session = quiet();
		const diver = new Diver(session);
		diver.state.mods = modifiersFor({ lamplighter: 3 });
		diver.state.headlamp = 2;
		diver.state.battery = 1;
		diver.hold({}, 10);
		const drained = 1 - diver.state.battery;
		expect(drained).toBeGreaterThan(0);
		expect(drained).toBeCloseTo((10 / 300) * 0.7, 2);
	});
});
