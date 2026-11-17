import { describe, expect, it } from 'vitest';
import { sampleResult } from '../../shared/testing/diagnostics.ts';
import { cleanReport } from './reports.ts';

describe('cleanReport', () => {
	it('needs a description for a bug report', () => {
		expect(cleanReport({ title: 'Lamp went out', description: '', steps: '' })).toEqual({
			error: 'Say what happened'
		});
	});

	it('takes a diagnostics report with no note', () => {
		const input = cleanReport({
			title: 'Diagnostics: Apple GPU',
			description: '',
			steps: '',
			benchmark: sampleResult()
		});
		expect(input).toEqual({
			title: 'Diagnostics: Apple GPU',
			description: '',
			steps: '',
			benchmark: sampleResult()
		});
	});

	it('refuses diagnostics it cannot read', () => {
		expect(
			cleanReport({
				title: 'Diagnostics: x',
				description: 'note',
				steps: '',
				benchmark: { stages: 3 }
			})
		).toEqual({ error: 'Those diagnostics are not readable' });
	});
});
