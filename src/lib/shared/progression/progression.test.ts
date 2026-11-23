import { describe, expect, it } from 'vitest';
import { LEVELS, SKILLS } from '../../content/progression.ts';
import {
	canSpend,
	emptyProgression,
	levelOf,
	modifiersFor,
	noModifiers,
	pointsLeft,
	progressionOf,
	respec,
	skillById,
	spend
} from './progression.ts';

describe('levels', () => {
	it('1000 a level, capped at 60, a point each', () => {
		expect(levelOf(0)).toBe(0);
		expect(levelOf(999)).toBe(0);
		expect(levelOf(1000)).toBe(1);
		expect(levelOf(2500)).toBe(2);
		expect(levelOf(10_000_000)).toBe(LEVELS.max);
		expect(pointsLeft({ ...emptyProgression(), xp: 3000 })).toBe(3);
	});

	it('reads a stored progression, dropping what no longer exists', () => {
		const p = progressionOf({
			xp: 12.7,
			categories: ['nerve', 'gone' as never],
			skills: { lamplighter: 2, nope: 1 }
		});
		expect(p).toEqual({ xp: 12, categories: ['nerve'], skills: { lamplighter: 2 }, firsts: [] });
		expect(progressionOf(undefined)).toEqual(emptyProgression());
	});
});

describe('spending', () => {
	it('a category opens first, then its skills rank up to 3, a point each', () => {
		const p = { ...emptyProgression(), xp: 5000 };
		expect(canSpend(p, { skill: 'lamplighter' })).toBe('locked');
		expect(spend(p, { category: 'nerve' })).toBeNull();
		expect(canSpend(p, { category: 'nerve' })).toBe('maxed');
		for (let i = 0; i < 3; i++) expect(spend(p, { skill: 'lamplighter' })).toBeNull();
		expect(canSpend(p, { skill: 'lamplighter' })).toBe('maxed');
		expect(spend(p, { skill: 'soft-step' })).toBeNull();
		expect(pointsLeft(p)).toBe(0);
		expect(canSpend(p, { skill: 'used-to-the-dark' })).toBe('points');
		expect(canSpend(p, { skill: 'nothing' })).toBe('unknown');
	});

	it('a respec gives every point back and keeps the experience', () => {
		const p = { ...emptyProgression(), xp: 3000 };
		spend(p, { category: 'grit' });
		spend(p, { skill: 'heavy-hand' });
		respec(p);
		expect(p.categories).toEqual([]);
		expect(p.skills).toEqual({});
		expect(pointsLeft(p)).toBe(3);
	});
});

describe('modifiers', () => {
	it('nothing spent changes nothing', () => {
		expect(modifiersFor({})).toEqual(noModifiers());
	});

	it('each rank takes off or adds its bonus', () => {
		const mods = modifiersFor({ lamplighter: 1, 'heavy-hand': 3, tinker: 2, scrounger: 3 });
		expect(mods.batteryDrain).toBeCloseTo(0.9);
		expect(mods.melee).toBeCloseTo(1.45);
		expect(mods.craftTime).toBeCloseTo(0.7);
		expect(mods.craftNoise).toBeCloseTo(0.7);
		expect(mods.scrounge).toBeCloseTo(0.3);
	});

	it('every skill works on a modifier and has three ranks rising', () => {
		const keys = Object.keys(noModifiers());
		for (const skill of SKILLS) {
			expect(skill.effects.every((e) => keys.includes(e.key))).toBe(true);
			expect(skill.ranks[0]).toBeLessThan(skill.ranks[1]);
			expect(skill.ranks[1]).toBeLessThan(skill.ranks[2]);
		}
	});
});

describe('tooltips read the game data', () => {
	const at = (id: string, bonus: number, weapon?: string) =>
		skillById(id)!.detail(bonus, { weapon });

	it('give the values the issue lists', () => {
		expect(at('lamplighter', 0)).toContain('15:00');
		expect(at('lamplighter', 0.1)).toContain('16:40');
		expect(at('lamplighter', 0.3)).toContain('21:26');
		expect(at('used-to-the-dark', 0)).toContain('3:20');
		expect(at('used-to-the-dark', 0.45)).toContain('6:04');
		expect(at('soft-step', 0.35)).toContain('+2.6');
		expect(at('still-as-stone', 0.3)).toContain('2.5 m');
		expect(at('heavy-hand', 0)).toContain('8');
		expect(at('heavy-hand', 0.45)).toContain('12');
		expect(at('tinker', 0.45)).toContain('3.3 s');
		expect(at('light-fingers', 0.15)).toContain('5.1 s');
	});
});
