<script lang="ts">
	import { resolve } from '$app/paths';
	import { ago, formatTime } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Members · Undercroft Admin</title></svelte:head>

<h1>Members</h1>

<form class="toolbar" method="GET">
	<input
		name="q"
		type="search"
		value={data.query}
		placeholder="Email, gamer tag or Discord name"
		aria-label="Search members"
		size="36"
	/>
	<button type="submit">Search</button>
	{#if data.query}<a href={resolve('/members')}>Clear</a>{/if}
</form>

{#if data.members.length === 0}
	<p class="muted">No members match.</p>
{:else}
	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>Gamer tag</th>
					<th>Email</th>
					<th>Discord</th>
					<th>Joined</th>
					<th>Last seen</th>
					<th>Status</th>
				</tr>
			</thead>
			<tbody>
				{#each data.members as member (member.id)}
					<tr>
						<td><a href={resolve('/members/[id]', { id: member.id })}>{member.gamerTag}</a></td>
						<td>{member.email}</td>
						<td>{member.discord ?? ''}</td>
						<td>{formatTime(member.createdAt)}</td>
						<td>{ago(member.lastSeen)}</td>
						<td>
							{#if member.suspended}<span class="badge warn">Suspended</span>{/if}
							{#if member.admin}<span class="badge info">Admin</span>{/if}
							{#if !member.suspended && !member.admin}<span class="badge">Active</span>{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	{#if data.members.length === data.limit}
		<p class="muted">The newest {data.limit} shown. Search to find others.</p>
	{/if}
{/if}
