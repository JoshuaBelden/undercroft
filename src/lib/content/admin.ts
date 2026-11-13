/**
 * Rules for the admin app (admin/, docs/dev/admin.md).
 */
export const ADMIN = {
	/** Hours an admin stays signed in to the admin app. Shorter than a player's session. */
	sessionHours: 12,
	/** Rows on a page of a list (members, reports, the audit log...). */
	pageSize: 50,
	/** Longest suspension reason, as the player is shown it. */
	reasonMax: 300
};

/** What an admin did, as the audit log names it. */
export const AUDIT_ACTIONS = {
	grantAdmin: 'Made an admin',
	removeAdmin: 'Removed as admin',
	suspend: 'Suspended',
	unsuspend: 'Lifted the suspension',
	signOutEverywhere: 'Signed out everywhere',
	sendReset: 'Sent a password reset',
	disableTotp: 'Turned off two-step sign-in',
	renameTag: 'Changed the gamer tag',
	deleteAccount: 'Deleted the account',
	/** Not an admin: the player, from their Account screen (logged so admins can tell who it was). */
	deleteOwnAccount: 'Deleted their own account',
	fileReport: 'Filed a report on GitHub',
	fileCrash: 'Filed a crash on GitHub',
	approveIdea: 'Approved an idea',
	declineIdea: 'Declined an idea',
	updateIdea: 'Changed an idea',
	mergeIdea: 'Merged an idea',
	archiveFeedback: 'Archived feedback'
} satisfies Record<string, string>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;
