import { describe, expect, it } from 'vitest';
import { cleanLook, DEFAULT_LOOK, sameLook, tintOf } from './look.ts';

describe('cleanLook', () => {
	it('keeps a valid look as it is', () => {
		const look = {
			body: 'female',
			face: 3,
			wear: { hair: 'hair-afro', shirt: 'shirt', pants: 'pants-wool' },
			tints: { skin: 'deep', hair: 'auburn', pants: 'moss' }
		};
		expect(cleanLook(look)).toEqual(look);
	});

	it('gives the default look for nothing, or for something that is not a look', () => {
		expect(cleanLook(undefined)).toEqual(DEFAULT_LOOK);
		expect(cleanLook('female')).toEqual(DEFAULT_LOOK);
		expect(cleanLook({})).toEqual({ ...DEFAULT_LOOK, tints: {} });
	});

	it('falls back on an unknown body or a face the body lacks', () => {
		expect(cleanLook({ body: 'ogre' }).body).toBe(DEFAULT_LOOK.body);
		expect(cleanLook({ body: 'male', face: 5 }).face).toBe(0);
		expect(cleanLook({ body: 'male', face: 1.5 }).face).toBe(0);
		expect(cleanLook({ body: 'male', face: -1 }).face).toBe(0);
	});

	it('drops a piece that is unknown or in the wrong slot, and fills a required slot', () => {
		const look = cleanLook({ wear: { hair: 'pants-wool', shirt: 'crown', pants: 'pants-wool' } });
		expect(look.wear.hair).toBe(DEFAULT_LOOK.wear.hair);
		expect(look.wear.shirt).toBe(DEFAULT_LOOK.wear.shirt);
		expect(look.wear.pants).toBe('pants-wool');
	});

	it('leaves an optional slot empty', () => {
		expect(cleanLook({ wear: { jacket: 'nope' } }).wear.jacket).toBeUndefined();
	});

	it('drops colours that are not in the part’s palette', () => {
		const look = cleanLook({ tints: { skin: 'moss', hair: 'black', ears: 'red' } });
		expect(look.tints).toEqual({ hair: 'black' });
	});
});

describe('tintOf', () => {
	it('is the chosen colour, or the palette’s first', () => {
		expect(tintOf(cleanLook({ tints: { hair: 'black' } }), 'hair')).toBe('#1b1716');
		// The hair's first swatch keeps the texture's own colour; the skin's is a colour.
		expect(tintOf(DEFAULT_LOOK, 'hair')).toBeNull();
		expect(tintOf(cleanLook({}), 'skin')).toBe('#e8c3a8');
	});
});

describe('sameLook', () => {
	it('compares looks after cleaning them', () => {
		expect(sameLook(DEFAULT_LOOK, cleanLook(structuredClone(DEFAULT_LOOK)))).toBe(true);
		expect(sameLook(DEFAULT_LOOK, { ...DEFAULT_LOOK, face: 2 })).toBe(false);
	});
});
