import { MAIL_FROM, RESEND_API_KEY } from '$app/env/private';

/**
 * Send an email through Resend (https://resend.com), over HTTPS: the droplet can't send mail
 * itself. Without `RESEND_API_KEY` (development) the email is written to the server log instead,
 * links and all. See docs/dev/accounts.md#email.
 */
export async function sendMail(mail: {
	to: string;
	subject: string;
	text: string;
	html: string;
}): Promise<void> {
	if (!RESEND_API_KEY) {
		console.log(`[mail] (no RESEND_API_KEY) to ${mail.to}: ${mail.subject}\n${mail.text}`);
		return;
	}
	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${RESEND_API_KEY}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({ from: MAIL_FROM, ...mail })
	});
	if (!response.ok) {
		throw new Error(`Resend refused the email (${response.status}): ${await response.text()}`);
	}
}

/** The password-reset email. */
export function resetMail(link: string): { subject: string; text: string; html: string } {
	const text = [
		'Someone asked to reset the password for your Undercroft account.',
		'',
		`Choose a new password here (the link works once, for an hour):`,
		link,
		'',
		"If it wasn't you, ignore this email: your password stays as it is."
	].join('\n');
	const html = `<p>Someone asked to reset the password for your Undercroft account.</p>
<p><a href="${link}">Choose a new password</a>. The link works once, for an hour.</p>
<p>If it wasn't you, ignore this email: your password stays as it is.</p>`;
	return { subject: 'Reset your Undercroft password', text, html };
}
