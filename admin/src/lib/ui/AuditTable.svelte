<script lang="ts">
	import { resolve } from '$app/paths';
	import { AUDIT_ACTIONS, type AuditAction } from '#lib/content.ts';
	import { formatTime } from '#lib/format.ts';

	/** Lines of the audit log: on its own page, and under a member. */
	interface Props {
		entries: {
			_id: string;
			admin: string;
			adminTag: string;
			action: AuditAction;
			target?: string;
			detail?: string;
			at: Date;
		}[];
		/** Leave out the target column (under a member, it is always them). */
		hideTarget?: boolean;
	}

	let { entries, hideTarget = false }: Props = $props();

	/** Actions done to an account: their target links to the member page. */
	const ON_ACCOUNT: AuditAction[] = [
		'grantAdmin',
		'removeAdmin',
		'suspend',
		'unsuspend',
		'signOutEverywhere',
		'sendReset',
		'disableTotp',
		'renameTag'
	];
</script>

{#if entries.length === 0}
	<p class="muted">Nothing yet.</p>
{:else}
	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>When</th>
					<th>Admin</th>
					<th>What</th>
					{#if !hideTarget}<th>Target</th>{/if}
					<th>Detail</th>
				</tr>
			</thead>
			<tbody>
				{#each entries as entry (entry._id)}
					<tr>
						<td>{formatTime(entry.at)}</td>
						<td>
							{#if entry.admin === 'script'}
								<span class="muted">{entry.adminTag}</span>
							{:else}
								<a href={resolve('/members/[id]', { id: entry.admin })}>{entry.adminTag}</a>
							{/if}
						</td>
						<td>{AUDIT_ACTIONS[entry.action]}</td>
						{#if !hideTarget}
							<td>
								{#if entry.target && ON_ACCOUNT.includes(entry.action)}
									<a href={resolve('/members/[id]', { id: entry.target })}>Member</a>
								{:else if entry.target}
									<code>{entry.target.slice(0, 8)}</code>
								{/if}
							</td>
						{/if}
						<td>{entry.detail ?? ''}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
