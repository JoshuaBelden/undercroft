import { error, fail } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { requireAdmin } from '#lib/server/session.ts';
import {
	REPORT_STATUSES,
	audit,
	fileReport,
	getReport,
	githubEnabled,
	listReports,
	type ReportStatus
} from '#lib/server/store.ts';
import type { Actions, PageServerLoad } from './$types';

/** Bug reports, newest first; `?status=` and `?error=` narrow them. */
export const load: PageServerLoad = async ({ url }) => {
	const status = url.searchParams.get('status');
	const errorId = url.searchParams.get('error') ?? undefined;
	const reports = await listReports(await database(), {
		status: status && status in REPORT_STATUSES ? (status as ReportStatus) : undefined,
		errorId,
		limit: 100
	});
	return { reports, status, errorId: errorId ?? null, github: githubEnabled() };
};

export const actions: Actions = {
	/** File a report that is waiting (no token then) or that failed. */
	file: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const db = await database();
		const report = await getReport(db, String((await request.formData()).get('id')));
		if (!report) error(404, 'No such report');
		if (report.status === 'filed') return fail(400, { error: 'Already filed' });
		if (!githubEnabled()) return fail(400, { error: 'GITHUB_TOKEN is not set' });
		const issue = await fileReport(db, report);
		if (!issue) return fail(502, { error: 'GitHub refused it: see the report for why' });
		await audit(db, admin, 'fileReport', report._id, `#${issue.number}`);
		return { notice: `Filed as #${issue.number}` };
	}
};
