import { describe, expect, it } from 'vitest';
import type { Alert, ItemAlertSource } from '#lib/shared/alerts/types.ts';
import { alertText, mergesWith } from './alerts.ts';

describe('mergesWith', () => {
	const pickup = (item: string, source: ItemAlertSource = 'pickup'): Alert => ({
		kind: 'item',
		item,
		count: 1,
		source
	});
	const ann = { account: 'a', name: 'Ann' };

	it('merges more of the same item from the same place', () => {
		expect(mergesWith(pickup('bandage'), pickup('bandage'))).toBe(true);
		expect(mergesWith(pickup('bandage'), pickup('knife'))).toBe(false);
		expect(mergesWith(pickup('bandage'), pickup('bandage', 'store'))).toBe(false);
	});

	it('keeps gifts from different players apart, and never merges social alerts', () => {
		const gift: Alert = { kind: 'item', item: 'knife', count: 1, source: 'gift', from: ann };
		expect(mergesWith(gift, gift)).toBe(true);
		expect(mergesWith(gift, { ...gift, from: { account: 'b', name: 'Bob' } })).toBe(false);
		const social: Alert = { kind: 'social', event: 'friendRequest', person: ann };
		expect(mergesWith(social, social)).toBe(false);
	});
});

describe('alertText', () => {
	it('names the other player in a social alert', () => {
		expect(
			alertText({ kind: 'social', event: 'friendRequest', person: { account: 'a', name: 'Ann' } })
		).toEqual({ title: 'Friend request', line: 'Ann wants to be friends' });
	});

	it('gives the count and name of an item, and who it came from for a gift', () => {
		expect(alertText({ kind: 'item', item: 'bandage', count: 3, source: 'store' })).toEqual({
			title: 'Bought',
			line: '3 × Bandage'
		});
		expect(alertText({ kind: 'item', item: 'knife', count: 1, source: 'pickup' }).line).toBe(
			'Knife'
		);
		expect(
			alertText({
				kind: 'item',
				item: 'knife',
				count: 1,
				source: 'gift',
				from: { account: 'a', name: 'Ann' }
			}).title
		).toBe('Gift from Ann');
	});
});
