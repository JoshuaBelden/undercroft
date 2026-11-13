<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatTime } from '#lib/format.ts';
	import Action from './Action.svelte';

	/** Players' feedback: in the inbox, and under a member. */
	interface Props {
		feedback: {
			_id: string;
			account: string;
			gamerTag: string;
			text: string;
			version: string;
			read: boolean;
			archived: boolean;
			createdAt: Date;
		}[];
		/** Offer to mark and archive (only where the page has those actions). */
		actions?: boolean;
		hideSender?: boolean;
	}

	let { feedback, actions = false, hideSender = false }: Props = $props();
</script>

{#if feedback.length === 0}
	<p class="muted">Nothing here.</p>
{:else}
	<div class="stack">
		{#each feedback as item (item._id)}
			<article class="panel" class:unread={!item.read}>
				<p class="meta">
					{#if !item.read}<span class="badge info">New</span>{/if}
					{#if !hideSender}
						<a href={resolve('/members/[id]', { id: item.account })}>{item.gamerTag}</a> ·
					{/if}
					{formatTime(item.createdAt)} · {item.version}
				</p>
				<p class="text">{item.text}</p>
				{#if actions}
					<div class="toolbar">
						<Action
							action="read"
							label={item.read ? 'Mark unread' : 'Mark read'}
							fields={{ id: item._id, read: item.read ? 'false' : 'true' }}
						/>
						<Action
							action="archive"
							label={item.archived ? 'Back to the inbox' : 'Archive'}
							fields={{ id: item._id, archived: item.archived ? 'false' : 'true' }}
						/>
					</div>
				{/if}
			</article>
		{/each}
	</div>
{/if}

<style>
	.unread {
		border-color: var(--accent);
	}

	.meta {
		margin: 0 0 8px;
		color: var(--muted);
		display: flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
	}

	.text {
		margin: 0 0 10px;
		white-space: pre-wrap;
	}

	.toolbar {
		margin: 0;
	}
</style>
