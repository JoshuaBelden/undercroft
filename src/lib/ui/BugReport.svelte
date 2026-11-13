<script lang="ts">
	import { api } from '#lib/account/account.svelte.ts';
	import { REPORT } from '#lib/content/reports.ts';
	import { bugReport, closeBugReport } from '#lib/game/crash.svelte.ts';
	import { collectDiagnostics } from '#lib/game/diagnostics.ts';
	import type { ReportInput } from '#lib/shared/reports.ts';
	import Dialog from './Dialog.svelte';

	/**
	 * The bug report form, opened from the account menu, the settings screen, the feedback page
	 * and the crash prompt (`openBugReport`). What it sends is filed on GitHub by the server; the
	 * player sees every detail that goes with it first, and can leave the details out.
	 * See docs/dev/reports.md.
	 */

	let title = $state('');
	let description = $state('');
	let steps = $state('');
	let includeDetails = $state(true);
	let sending = $state(false);
	let error = $state('');
	/** Sent: the issue number, or null while it waits to be filed. */
	let sent = $state<{ issue: number | null } | null>(null);

	const crash = $derived(bugReport.crash);
	/** Gathered when the form opens, so what is shown is what is sent. */
	const diagnostics = collectDiagnostics();

	/** The details as a list to read. */
	const shown = $derived(
		[
			['Version', diagnostics.version],
			['Browser', diagnostics.userAgent],
			['GPU', diagnostics.gpu],
			['Screen', diagnostics.screen],
			['Page', diagnostics.page],
			['Mode', diagnostics.mode],
			['Map seed', diagnostics.seed],
			['Room', diagnostics.room],
			[
				'Stats',
				diagnostics.stats &&
					Object.entries(diagnostics.stats)
						.map(([key, value]) => `${key} ${value}`)
						.join(', ')
			],
			['Console', diagnostics.console?.length ? `${diagnostics.console.length} lines` : undefined]
		].filter((row): row is [string, string | number] => row[1] !== undefined && row[1] !== '')
	);

	async function send(): Promise<void> {
		error = '';
		sending = true;
		const body: ReportInput = { title, description, steps };
		if (includeDetails) body.diagnostics = diagnostics;
		if (crash) body.crash = crash;
		try {
			sent = await api<{ issue: number | null }>('/api/report', 'POST', body);
		} catch (failure) {
			error = (failure as Error).message;
		} finally {
			sending = false;
		}
	}
</script>

<Dialog title={sent ? 'Report sent' : 'Report a bug'} onclose={closeBugReport} wide>
	{#if sent}
		<p>Thank you. It's on the list{sent.issue ? ` as issue #${sent.issue}` : ''}.</p>
		<p>Every report is read. Thanks for helping make the catacombs work as they should.</p>
	{:else}
		<form
			id="bug-report"
			onsubmit={(event) => {
				event.preventDefault();
				void send();
			}}
		>
			{#if crash}
				<p class="crash">
					<strong>The error</strong> is attached:
					<code>{crash.message}</code>
				</p>
			{/if}
			<label>
				Title
				<input
					bind:value={title}
					required
					minlength={REPORT.titleMin}
					maxlength={REPORT.titleMax}
					placeholder="The lantern went out after I climbed the stairs"
				/>
			</label>
			<label>
				What happened
				<textarea
					bind:value={description}
					required
					maxlength={REPORT.textMax}
					rows="4"
					placeholder="What you saw, and what you expected instead"></textarea>
			</label>
			<label>
				How to make it happen <span class="optional">(if you know)</span>
				<textarea
					bind:value={steps}
					maxlength={REPORT.textMax}
					rows="3"
					placeholder="1. Launch solo&#10;2. ..."></textarea>
			</label>
			<label class="check">
				<input type="checkbox" bind:checked={includeDetails} />
				Send details about the game and this computer
			</label>
			{#if includeDetails}
				<details>
					<summary>What is sent</summary>
					<dl>
						{#each shown as [name, value] (name)}
							<dt>{name}</dt>
							<dd>{value}</dd>
						{/each}
					</dl>
					{#if diagnostics.console?.length}
						<pre>{diagnostics.console.join('\n')}</pre>
					{/if}
					<p class="note">Never your email, gamer tag or password.</p>
				</details>
			{/if}
			{#if error}<p class="error" role="alert">{error}</p>{/if}
		</form>
	{/if}

	{#snippet footer()}
		{#if sent}
			<button type="button" class="primary" onclick={closeBugReport}>Close</button>
		{:else}
			<button type="button" onclick={closeBugReport}>Cancel</button>
			<button type="submit" form="bug-report" class="primary" disabled={sending}>
				{sending ? 'Sending…' : 'Send report'}
			</button>
		{/if}
	{/snippet}
</Dialog>

<style>
	form {
		display: grid;
		gap: 12px;
	}

	label {
		display: grid;
		gap: 4px;
		font-weight: 600;
	}

	.optional {
		font-weight: 400;
		opacity: 0.7;
	}

	input:not([type='checkbox']),
	textarea {
		font: inherit;
		font-weight: 400;
		padding: 7px 10px;
		border: 1px solid rgb(20 17 15 / 0.35);
		border-radius: 6px;
		background: rgb(255 255 255 / 0.7);
		color: #14110f;
	}

	textarea {
		resize: vertical;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 400;
	}

	.crash code,
	pre {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		word-break: break-word;
	}

	details {
		font-size: 0.9rem;
	}

	summary {
		cursor: pointer;
	}

	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 2px 12px;
		margin: 8px 0;
	}

	dt {
		opacity: 0.7;
	}

	dd {
		margin: 0;
		word-break: break-word;
	}

	pre {
		max-height: 160px;
		overflow: auto;
		white-space: pre-wrap;
		margin: 0 0 8px;
		padding: 8px;
		background: rgb(20 17 15 / 0.08);
		border-radius: 6px;
	}

	.note {
		opacity: 0.7;
	}

	.error {
		color: #8a1c0e;
		font-weight: 600;
	}
</style>
