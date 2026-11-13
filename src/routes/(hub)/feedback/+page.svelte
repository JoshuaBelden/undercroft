<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '#lib/account/account.svelte.ts';
	import { FEEDBACK, IDEA, IDEA_STATUSES, type IdeaStatus } from '#lib/content/reports.ts';
	import { openBugReport } from '#lib/game/crash.svelte.ts';
	import type { IdeaView } from '#lib/shared/reports.ts';

	/**
	 * Ideas and feedback: the board of ideas players voted for, suggesting one, private feedback,
	 * and reporting a bug. Reached from the account menu. See docs/dev/reports.md.
	 */

	let ideas = $state<IdeaView[] | null>(null);
	let loadError = $state('');
	/** Which ideas the board shows. */
	let filter = $state<'open' | 'all' | IdeaStatus>('open');

	let ideaTitle = $state('');
	let ideaBody = $state('');
	let ideaState = $state<{ sending: boolean; error: string; sent: boolean }>({
		sending: false,
		error: '',
		sent: false
	});

	let feedbackText = $state('');
	let feedbackState = $state<{ sending: boolean; error: string; sent: boolean }>({
		sending: false,
		error: '',
		sent: false
	});

	/** Ideas that can still be voted for (the server's rule too). */
	const VOTABLE: string[] = ['open', 'planned', 'inProgress'];
	const FILTERS: { id: typeof filter; label: string }[] = [
		{ id: 'open', label: 'Open' },
		{ id: 'planned', label: 'Planned' },
		{ id: 'inProgress', label: 'In progress' },
		{ id: 'done', label: 'Done' },
		{ id: 'all', label: 'All' }
	];

	const waiting = $derived(ideas?.filter((idea) => idea.status === 'pending') ?? []);
	const shown = $derived(
		(ideas ?? []).filter((idea) => {
			if (idea.status === 'pending') return false;
			if (filter === 'all') return true;
			if (filter === 'open') return idea.status === 'open';
			return idea.status === filter;
		})
	);

	const statusLabel = (status: string): string =>
		IDEA_STATUSES[status as IdeaStatus]?.label ?? status;

	onMount(() => {
		api<{ ideas: IdeaView[] }>('/api/ideas')
			.then((result) => (ideas = result.ideas))
			.catch((failure: Error) => (loadError = failure.message));
	});

	async function vote(idea: IdeaView): Promise<void> {
		const on = !idea.voted;
		// Shown at once; put back if the server says no.
		idea.voted = on;
		idea.votes += on ? 1 : -1;
		try {
			const result = await api<{ votes: number; voted: boolean }>(
				`/api/ideas/${idea.id}/vote`,
				on ? 'POST' : 'DELETE'
			);
			idea.votes = result.votes;
			idea.voted = result.voted;
		} catch (failure) {
			idea.voted = !on;
			idea.votes += on ? -1 : 1;
			loadError = (failure as Error).message;
		}
	}

	async function suggest(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		ideaState = { sending: true, error: '', sent: false };
		try {
			const result = await api<{ ideas: IdeaView[] }>('/api/ideas', 'POST', {
				title: ideaTitle,
				body: ideaBody
			});
			ideas = result.ideas;
			ideaTitle = '';
			ideaBody = '';
			ideaState = { sending: false, error: '', sent: true };
		} catch (failure) {
			ideaState = { sending: false, error: (failure as Error).message, sent: false };
		}
	}

	async function sendFeedback(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		feedbackState = { sending: true, error: '', sent: false };
		try {
			await api('/api/feedback', 'POST', { text: feedbackText });
			feedbackText = '';
			feedbackState = { sending: false, error: '', sent: true };
		} catch (failure) {
			feedbackState = { sending: false, error: (failure as Error).message, sent: false };
		}
	}
</script>

<div class="feedback">
	<section class="panel board" aria-labelledby="board-title">
		<header>
			<h2 id="board-title">Ideas</h2>
			<span class="count">Vote for what you want most</span>
		</header>
		<div class="filters" role="group" aria-label="Show">
			{#each FILTERS as option (option.id)}
				<button
					type="button"
					class:current={filter === option.id}
					aria-pressed={filter === option.id}
					onclick={() => (filter = option.id)}>{option.label}</button
				>
			{/each}
		</div>
		<div class="scroll">
			{#if loadError}<p class="error" role="alert">{loadError}</p>{/if}
			{#if ideas === null && !loadError}
				<p class="muted">Loading...</p>
			{:else if shown.length === 0}
				<p class="muted">No ideas here yet. Suggest one.</p>
			{:else}
				<ul>
					{#each shown as idea (idea.id)}
						<li>
							<button
								type="button"
								class="vote"
								class:voted={idea.voted}
								aria-pressed={idea.voted}
								aria-label="{idea.voted ? 'Take back your vote for' : 'Vote for'} {idea.title}"
								disabled={!VOTABLE.includes(idea.status)}
								onclick={() => void vote(idea)}
							>
								<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
									<path fill="currentColor" d="M6 2 11 9H1z" />
								</svg>
								<span>{idea.votes}</span>
							</button>
							<div class="idea">
								<p class="title">
									{idea.title}
									{#if idea.status !== 'open'}<span class="status">{statusLabel(idea.status)}</span
										>{/if}
									{#if idea.mine}<span class="status mine">Yours</span>{/if}
								</p>
								{#if idea.body}<p class="body">{idea.body}</p>{/if}
								{#if idea.note}<p class="note"><strong>From the team:</strong> {idea.note}</p>{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
			{#if waiting.length > 0}
				<h3>Your ideas waiting for review</h3>
				<ul>
					{#each waiting as idea (idea.id)}
						<li class="pending"><div class="idea"><p class="title">{idea.title}</p></div></li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>

	<div class="side">
		<section class="panel" aria-labelledby="suggest-title">
			<header><h2 id="suggest-title">Suggest an idea</h2></header>
			<form onsubmit={suggest}>
				<input
					bind:value={ideaTitle}
					required
					minlength={IDEA.titleMin}
					maxlength={IDEA.titleMax}
					placeholder="A short title"
					aria-label="Title"
				/>
				<textarea
					bind:value={ideaBody}
					maxlength={IDEA.bodyMax}
					rows="3"
					placeholder="What it is, and why it would make the game better"
					aria-label="Description"></textarea>
				<p class="hint">It shows on the board once the team has read it. Your vote is on it.</p>
				{#if ideaState.error}<p class="error" role="alert">{ideaState.error}</p>{/if}
				{#if ideaState.sent}<p class="done" role="status">Thanks: it's waiting for review.</p>{/if}
				<button type="submit" class="primary" disabled={ideaState.sending}>Suggest</button>
			</form>
		</section>

		<section class="panel" aria-labelledby="feedback-title">
			<header><h2 id="feedback-title">Send feedback</h2></header>
			<form onsubmit={sendFeedback}>
				<textarea
					bind:value={feedbackText}
					required
					minlength={FEEDBACK.textMin}
					maxlength={FEEDBACK.textMax}
					rows="4"
					placeholder="What you liked, what you didn't, anything at all"
					aria-label="Feedback"></textarea>
				<p class="hint">Only the team reads it.</p>
				{#if feedbackState.error}<p class="error" role="alert">{feedbackState.error}</p>{/if}
				{#if feedbackState.sent}<p class="done" role="status">Thank you for writing.</p>{/if}
				<button type="submit" class="primary" disabled={feedbackState.sending}>Send</button>
			</form>
		</section>

		<section class="panel" aria-labelledby="bug-title">
			<header><h2 id="bug-title">Found a bug?</h2></header>
			<p class="hint">Tell us what went wrong. It goes straight onto the list of things to fix.</p>
			<button type="button" class="primary" onclick={() => openBugReport()}>Report a bug</button>
		</section>
	</div>
</div>

<style>
	/* A full-width page under the bar: the board beside a column of forms. */
	.feedback {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(300px, 400px);
		align-items: start;
		gap: 20px;
		padding: 24px 0 84px;
	}

	.side {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	/* The same containers as the Social page. */
	.panel {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
		padding: 18px 20px 20px;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: rgb(14 12 10 / 0.55);
		backdrop-filter: blur(6px);
	}

	.board {
		max-height: calc(100vh - 170px);
	}

	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}

	h2 {
		margin: 0;
		font-size: 1.3rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	h3 {
		margin: 20px 0 8px;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.count,
	.hint,
	.muted {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--muted);
		margin: 0;
	}

	.scroll {
		min-height: 0;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.filters button {
		padding: 4px 14px;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.filters button.current {
		border-color: var(--text);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	li {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		padding: 12px 0;
		border-bottom: 1px solid rgb(58 51 44 / 0.5);
	}

	li:last-child {
		border-bottom: 0;
	}

	.vote {
		flex: none;
		width: 52px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 6px 0;
		border: 1px solid var(--border);
		border-radius: 10px;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 600;
	}

	.vote:hover:not(:disabled),
	.vote:focus-visible {
		background: rgb(255 255 255 / 0.08);
	}

	.vote.voted {
		border-color: var(--accent);
		background: rgb(0 129 157 / 0.25);
		color: #fff;
	}

	.vote:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.idea {
		flex: 1;
		min-width: 0;
	}

	.idea p {
		margin: 0;
	}

	.title {
		font-family: var(--font-ui);
		font-weight: 600;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: baseline;
	}

	.status {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.status.mine {
		color: var(--muted);
	}

	.body {
		margin-top: 4px !important;
		white-space: pre-wrap;
		color: var(--text);
		opacity: 0.85;
	}

	.note {
		margin-top: 6px !important;
		padding-left: 10px;
		border-left: 2px solid var(--accent);
		font-size: 0.9rem;
	}

	li.pending .title {
		color: var(--muted);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	input,
	textarea {
		width: 100%;
		padding: 8px 14px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: rgb(0 0 0 / 0.4);
		color: var(--text);
		font: inherit;
	}

	textarea {
		resize: vertical;
	}

	input:focus-visible,
	textarea:focus-visible {
		outline: none;
		border-color: var(--accent);
	}

	button.primary {
		align-self: flex-start;
		padding: 7px 20px;
		border: 1px solid var(--accent);
		border-radius: 999px;
		background: var(--accent);
		color: #fff;
		font-size: 0.85rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	button.primary:hover:not(:disabled),
	button.primary:focus-visible {
		border-color: var(--text);
	}

	.error {
		margin: 0;
		color: #ff9a70;
	}

	.done {
		margin: 0;
		color: #9fd8a8;
	}

	@media (max-width: 900px) {
		.feedback {
			grid-template-columns: 1fr;
		}
	}
</style>
