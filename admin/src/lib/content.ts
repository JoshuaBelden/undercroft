/**
 * The game's data definitions the admin app's pages show (labels, statuses), from src/lib/content
 * one folder up. Safe in the browser: nothing here touches the database.
 */
export { AUDIT_ACTIONS, type AuditAction } from '../../../src/lib/content/admin.ts';
export { DELETED_ACCOUNT } from '../../../src/lib/content/account.ts';
export {
	BOARD_STATUSES,
	IDEA,
	IDEA_STATUSES,
	REPORT_STATUSES,
	type IdeaStatus,
	type ReportStatus
} from '../../../src/lib/content/reports.ts';
export type { CrashInfo, Diagnostics } from '../../../src/lib/shared/reports.ts';
