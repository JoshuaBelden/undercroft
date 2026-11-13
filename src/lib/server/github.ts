import type { Db } from 'mongodb';
import { GITHUB_REPO, GITHUB_TOKEN } from '$app/env/private';
import { REPORT } from '../content/reports.ts';
import {
	getError,
	markReportFailed,
	markReportFiled,
	setErrorIssue,
	type ErrorDoc,
	type IssueRef,
	type ReportDoc
} from './store/reports.ts';

/**
 * Filing bug reports as GitHub issues, with a fine-grained token that can only write issues on
 * `GITHUB_REPO`. Players need no GitHub account. Nothing that says who they are (email, gamer tag,
 * account id) goes on GitHub: only the report id, which the admin app maps back to the player.
 * Used by the site and the admin app (both define the variables). See docs/dev/reports.md.
 */

export const githubEnabled = (): boolean => Boolean(GITHUB_TOKEN && GITHUB_REPO);

async function github(path: string, body: unknown): Promise<{ number: number; html_url: string }> {
	const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}${path}`, {
		method: 'POST',
		headers: {
			accept: 'application/vnd.github+json',
			authorization: `Bearer ${GITHUB_TOKEN}`,
			'content-type': 'application/json',
			'user-agent': 'undercroft-reports',
			'x-github-api-version': '2022-11-28'
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(10_000)
	});
	if (!response.ok) {
		throw new Error(`GitHub answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
	}
	return (await response.json()) as { number: number; html_url: string };
}

/**
 * A player's words, safe to put in an issue: quoted, and with `@` broken so a report can't
 * mention (and notify) anyone on GitHub.
 */
function quote(text: string): string {
	if (!text) return '> _(nothing)_';
	return text
		.replace(/@/g, '@​')
		.split('\n')
		.map((line) => `> ${line}`)
		.join('\n');
}

const code = (text: string): string => '```\n' + text.replace(/```/g, "'''") + '\n```';

export function reportIssueBody(report: ReportDoc): string {
	const parts = [
		'### What happened',
		quote(report.description),
		'### How to make it happen',
		quote(report.steps)
	];
	if (report.crash) {
		parts.push(
			`### Error (${report.crash.source})`,
			code([report.crash.message, report.crash.stack ?? ''].join('\n').trim())
		);
	}
	const d = report.diagnostics;
	if (d) {
		const facts = [
			`- Version: ${d.version}`,
			`- Browser: ${d.userAgent}`,
			d.gpu && `- GPU: ${d.gpu}`,
			d.screen && `- Screen: ${d.screen}`,
			d.page && `- Page: ${d.page}`,
			d.mode && `- Mode: ${d.mode}`,
			d.seed !== undefined && `- Map seed: ${d.seed}`,
			d.room && `- Room: ${d.room}`,
			d.stats &&
				`- Stats: ${Object.entries(d.stats)
					.map(([key, value]) => `${key} ${value}`)
					.join(', ')}`
		].filter(Boolean);
		parts.push('<details><summary>Diagnostics</summary>', '', facts.join('\n'));
		if (d.console?.length) parts.push('', 'Console:', code(d.console.join('\n')));
		parts.push('', '</details>');
	}
	parts.push('', `<sub>Sent from the game · report \`${report._id}\`</sub>`);
	return parts.join('\n\n');
}

export function crashIssueBody(error: ErrorDoc): string {
	return [
		`A ${error.source} error, seen ${error.count} times from ${error.firstSeen.toISOString()} to ${error.lastSeen.toISOString()}.`,
		`Versions: ${error.versions.join(', ')}. Player reports about it: ${error.reports}.`,
		code([error.message, error.stack ?? ''].join('\n').trim()),
		`<sub>Filed from the admin app · error \`${error._id}\`</sub>`
	].join('\n\n');
}

/**
 * File a report. A report about a crash that already has an issue becomes a comment on it, so
 * the same crash is one issue. Without a token (development) it stays `pending`. A failure is
 * kept on the report, for the admin app to try again.
 */
export async function fileReport(db: Db, report: ReportDoc): Promise<IssueRef | null> {
	if (!githubEnabled()) {
		console.log(`[reports] (no GITHUB_TOKEN) kept report ${report._id}: ${report.title}`);
		return null;
	}
	try {
		const crash = report.errorId ? await getError(db, report.errorId) : null;
		let issue: IssueRef;
		if (crash?.issue) {
			await github(`/issues/${crash.issue.number}/comments`, {
				body: `Another player report: **${report.title.replace(/@/g, '@​')}**\n\n${reportIssueBody(report)}`
			});
			issue = crash.issue;
		} else {
			const created = await github('/issues', {
				title: report.title,
				body: reportIssueBody(report),
				labels: REPORT.labels
			});
			issue = { number: created.number, url: created.html_url };
			if (crash) await setErrorIssue(db, crash._id, issue);
		}
		await markReportFiled(db, report._id, issue);
		return issue;
	} catch (failure) {
		console.error('[reports] filing failed', failure);
		await markReportFailed(db, report._id, (failure as Error).message);
		return null;
	}
}

/** File a crash nobody reported yet (from the admin app's Crashes page). */
export async function fileCrash(db: Db, error: ErrorDoc): Promise<IssueRef> {
	if (!githubEnabled()) throw new Error('GITHUB_TOKEN is not set');
	const created = await github('/issues', {
		title: `Crash: ${error.message.slice(0, 100)}`,
		body: crashIssueBody(error),
		labels: REPORT.crashLabels
	});
	const issue = { number: created.number, url: created.html_url };
	await setErrorIssue(db, error._id, issue);
	return issue;
}
