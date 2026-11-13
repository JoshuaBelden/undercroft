<script lang="ts">
	import { resolve } from '$app/paths';
	import { BOARD_STATUSES, IDEA, IDEA_STATUSES } from '#lib/content.ts';
	import { formatTime } from '#lib/format.ts';
	import Action from '#lib/ui/Action.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/** Ideas another can be merged into: on the board and not merged themselves. */
	const targets = $derived(data.board.filter((idea) => idea.status !== 'declined'));
</script>

<svelte:head><title>Ideas · Undercroft Admin</title></svelte:head>

<h1>Ideas</h1>

<nav class="toolbar" aria-label="View">
	<a href={resolve('/ideas')} aria-current={data.view === 'queue' ? 'page' : undefined}>
		Waiting for review ({data.pending.length})
	</a>
	<a
		href="{resolve('/ideas')}?view=board"
		aria-current={data.view === 'board' ? 'page' : undefined}
	>
		Board ({data.board.length})
	</a>
</nav>

{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
{#if form && 'notice' in form}<p class="notice" role="status">{form.notice}</p>{/if}

{#if data.view === 'queue'}
	{#if data.pending.length === 0}
		<p class="muted">Nothing waiting. Players' new ideas show here before the board.</p>
	{:else}
		<p class="muted">
			Tidy the wording if it helps, then approve it for the board, decline it, or merge it into an
			idea that is already there.
		</p>
		<div class="stack">
			{#each data.pending as idea (idea._id)}
				<article class="panel">
					<p class="meta">
						From <a href={resolve('/members/[id]', { id: idea.author })}>{idea.authorTag}</a> ·
						{formatTime(idea.createdAt)}
					</p>
					<Action action="approve" label="Approve" primary fields={{ id: idea._id }}>
						<input
							name="title"
							value={idea.title}
							maxlength={IDEA.titleMax}
							aria-label="Title"
							required
						/>
						<textarea name="body" maxlength={IDEA.bodyMax} aria-label="Description"
							>{idea.body}</textarea
						>
					</Action>
					<div class="row">
						<Action action="decline" label="Decline" danger fields={{ id: idea._id }}>
							<input
								name="note"
								maxlength={IDEA.noteMax}
								placeholder="Why (players see this)"
								aria-label="Why it was declined"
							/>
						</Action>
						{#if targets.length > 0}
							<Action action="merge" label="Merge" fields={{ id: idea._id }}>
								<select name="into" aria-label="Merge into">
									{#each targets as target (target._id)}
										<option value={target._id}>{target.title} ({target.votes})</option>
									{/each}
								</select>
							</Action>
						{/if}
					</div>
				</article>
			{/each}
		</div>
	{/if}
{:else if data.board.length === 0}
	<p class="muted">No ideas on the board yet.</p>
{:else}
	<div class="stack">
		{#each data.board as idea (idea._id)}
			<details class="panel">
				<summary>
					<span class="votes">{idea.votes}</span>
					<strong>{idea.title}</strong>
					<span
						class="badge {idea.status === 'done'
							? 'good'
							: idea.status === 'declined'
								? 'warn'
								: 'info'}">{IDEA_STATUSES[idea.status].label}</span
					>
					{#if idea.issue}<span class="badge">issue</span>{/if}
				</summary>
				<div class="body">
					<p class="meta">
						From <a href={resolve('/members/[id]', { id: idea.author })}>{idea.authorTag}</a> ·
						{formatTime(idea.createdAt)} · changed {formatTime(idea.updatedAt)}
					</p>
					<Action action="update" label="Save" primary fields={{ id: idea._id }}>
						<label>
							Status
							<select name="status" value={idea.status}>
								{#each BOARD_STATUSES as status (status)}
									<option value={status}>{IDEA_STATUSES[status].label}</option>
								{/each}
							</select>
						</label>
						<input
							name="title"
							value={idea.title}
							maxlength={IDEA.titleMax}
							aria-label="Title"
							required
						/>
						<textarea name="body" maxlength={IDEA.bodyMax} aria-label="Description"
							>{idea.body}</textarea
						>
						<textarea
							name="note"
							maxlength={IDEA.noteMax}
							placeholder="A note for players, shown under the idea"
							aria-label="Note for players">{idea.note ?? ''}</textarea
						>
						<input
							name="issue"
							value={idea.issue ?? ''}
							placeholder="GitHub issue URL"
							aria-label="GitHub issue"
						/>
					</Action>
					{#if targets.length > 1}
						<Action
							action="merge"
							label="Merge into"
							fields={{ id: idea._id }}
							confirm="Merge this idea into the one chosen? Its votes move there."
						>
							<select name="into" aria-label="Merge into">
								{#each targets.filter((target) => target._id !== idea._id) as target (target._id)}
									<option value={target._id}>{target.title} ({target.votes})</option>
								{/each}
							</select>
						</Action>
					{/if}
				</div>
			</details>
		{/each}
	</div>
{/if}

<style>
	nav a[aria-current='page'] {
		color: var(--text);
		font-weight: 600;
		text-decoration: none;
	}

	.meta {
		margin: 0 0 10px;
		color: var(--muted);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		margin-top: 10px;
	}

	details.panel {
		padding: 12px 16px;
	}

	summary {
		cursor: pointer;
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
	}

	.votes {
		min-width: 36px;
		text-align: center;
		font-family: var(--font-display);
		font-size: 20px;
		font-weight: 600;
	}

	.body {
		margin-top: 12px;
		display: grid;
		gap: 12px;
	}

	.panel :global(form input[name='title']),
	.panel :global(form textarea) {
		width: 100%;
	}

	label {
		display: flex;
		gap: 8px;
		align-items: center;
	}
</style>
