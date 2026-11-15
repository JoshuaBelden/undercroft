<script lang="ts">
	import { resolve } from '$app/paths';
	import { IDEA_STATUSES } from '#lib/content.ts';
	import { ago, duration, formatTime } from '#lib/format.ts';
	import Action from '#lib/ui/Action.svelte';
	import AuditTable from '#lib/ui/AuditTable.svelte';
	import FeedbackList from '#lib/ui/FeedbackList.svelte';
	import ReportList from '#lib/ui/ReportList.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const member = $derived(data.member);
	const self = $derived(data.admin?.id === member.id);
</script>

<svelte:head><title>{member.gamerTag} · Undercroft Admin</title></svelte:head>

<p><a href={resolve('/members')}>← Members</a></p>
<h1>
	{member.gamerTag}
	{#if data.suspension}<span class="badge warn">Suspended</span>{/if}
	{#if member.admin}<span class="badge info">Admin</span>{/if}
</h1>

{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
{#if form && 'notice' in form}<p class="notice" role="status">{form.notice}</p>{/if}

<div class="grid">
	<section class="panel">
		<h2>Profile</h2>
		<dl>
			<dt>Email</dt>
			<dd>{member.email}</dd>
			<dt>Joined</dt>
			<dd>{formatTime(member.createdAt) || 'unknown'}</dd>
			<dt>Last seen</dt>
			<dd>{ago(member.lastSeen)}</dd>
			<dt>Account id</dt>
			<dd><code>{member.id}</code></dd>
		</dl>
		<div class="avatar">
			{#if data.avatar.uploaded}
				<img src={data.avatar.uploaded} alt="Their uploaded avatar" width="96" height="96" />
				<Action
					action="removeAvatar"
					label="Remove picture"
					confirm="Remove {member.gamerTag}'s picture?"
					danger
				/>
			{:else if data.avatar.discord}
				<img
					src={data.avatar.discord}
					alt="Their Discord avatar"
					width="96"
					height="96"
					referrerpolicy="no-referrer"
				/>
				<span class="muted">From Discord: they have no upload to remove</span>
			{:else}
				<span class="muted">No avatar</span>
			{/if}
		</div>
		<Action action="rename" label="Change gamer tag">
			<input
				name="gamerTag"
				value={member.gamerTag}
				aria-label="New gamer tag"
				required
				size="18"
			/>
		</Action>
	</section>

	<section class="panel">
		<h2>Sign-in</h2>
		<dl>
			<dt>Password</dt>
			<dd>{data.signIn.password ? 'Set' : 'None'}</dd>
			<dt>Discord</dt>
			<dd>{data.signIn.discord ?? 'Not linked'}</dd>
			<dt>Two-step</dt>
			<dd>{data.signIn.totp ? 'On' : 'Off'}</dd>
			<dt>Browsers</dt>
			<dd>{data.signIn.sessions} signed in</dd>
		</dl>
		<div class="actions">
			<Action
				action="sendReset"
				label="Email a password reset"
				confirm="Email {member.email} a password reset link?"
			/>
			<Action
				action="signOut"
				label="Sign out everywhere"
				confirm="Sign {member.gamerTag} out of every browser?"
			/>
			{#if data.signIn.totp}
				<Action
					action="disableTotp"
					label="Turn off two-step"
					danger
					confirm="Turn off two-step sign-in for {member.gamerTag}? Only do this once you are sure it is them."
				/>
			{/if}
		</div>
	</section>

	<section class="panel">
		<h2>Suspension</h2>
		{#if data.suspension}
			<p>
				Since {formatTime(data.suspension.at)},
				{data.suspension.until ? `until ${formatTime(data.suspension.until)}` : 'until lifted'}.
			</p>
			<p class="reason">{data.suspension.reason}</p>
			<Action action="unsuspend" label="Lift the suspension" primary />
		{:else if self}
			<p class="muted">You can't suspend yourself.</p>
		{:else}
			<Action
				action="suspend"
				label="Suspend"
				danger
				confirm="Suspend {member.gamerTag}? They are signed out and removed from any expedition."
			>
				<textarea
					name="reason"
					required
					maxlength={data.reasonMax}
					placeholder="Reason (the player sees this)"
					aria-label="Reason"></textarea>
				<label class="days">
					Days
					<input name="days" type="number" min="0" max="3650" value="7" />
				</label>
				<span class="muted">0: until lifted</span>
			</Action>
		{/if}
	</section>

	<section class="panel">
		<h2>Role</h2>
		{#if member.admin}
			<p>An admin: can sign in here (with two-step sign-in).</p>
			{#if !self}
				<Action
					action="removeAdmin"
					label="Remove admin"
					danger
					confirm="Take admin away from {member.gamerTag}?"
				/>
			{/if}
		{:else}
			<p class="muted">A player.</p>
			<Action
				action="grantAdmin"
				label="Make admin"
				confirm="Make {member.gamerTag} an admin? They can then do everything you can here."
			/>
		{/if}
	</section>

	<section class="panel">
		<h2>Delete account</h2>
		{#if self}
			<p class="muted">You can't delete your own account here.</p>
		{:else}
			<p>
				For good: the account, its explorer and stash, its friendships and votes. Bug reports, ideas
				and feedback stay, shown as by a deleted player; runs stay in the stats.
			</p>
			<Action
				action="delete"
				label="Delete account"
				danger
				confirm="Delete {member.gamerTag} for good? This can't be undone."
			>
				<input
					name="confirmTag"
					required
					autocomplete="off"
					placeholder="Type {member.gamerTag}"
					aria-label="Type the gamer tag to confirm"
				/>
			</Action>
		{/if}
	</section>
</div>

<section class="panel wide">
	<h2>Explorer</h2>
	{#each data.explorers as explorer (explorer.id)}
		<p>
			{explorer.money} money · {explorer.stashed} of {explorer.stashSlots} stash slots used
			{#if explorer.underground}· <span class="badge info">Underground</span>{/if}
		</p>
	{:else}
		<p class="muted">No explorer yet.</p>
	{/each}
	<h3>Ledger</h3>
	{#if data.ledger.length === 0}
		<p class="muted">Nothing bought or sold yet.</p>
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr><th>When</th><th>What</th><th>Item</th><th>Money</th><th>Balance</th></tr>
				</thead>
				<tbody>
					{#each data.ledger as line (line._id)}
						<tr>
							<td>{formatTime(line.at)}</td>
							<td>{line.kind}</td>
							<td>{line.item ? `${line.count ?? 1} × ${line.item}` : ''}</td>
							<td>{line.money > 0 ? `+${line.money}` : line.money}</td>
							<td>{line.balance}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<section class="panel wide">
	<h2>Runs</h2>
	{#if data.runs.length === 0}
		<p class="muted">No expeditions yet.</p>
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>When</th><th>How it ended</th><th>Time</th><th>Level</th><th>Kills</th><th
							>Crates</th
						><th>Carried out</th><th>Party</th><th>Seed</th>
					</tr>
				</thead>
				<tbody>
					{#each data.runs as run (run._id)}
						<tr>
							<td>{formatTime(run.at)}</td>
							<td>{run.outcome}</td>
							<td>{duration(run.seconds)}</td>
							<td>{run.deepestLevel}</td>
							<td>{run.kills}</td>
							<td>{run.crates}</td>
							<td>{run.carriedValue}</td>
							<td>{run.partySize}</td>
							<td><code>{run.seed}</code></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<section class="panel wide">
	<h2>Bug reports</h2>
	<ReportList reports={data.reports} hideSender />
</section>

<section class="panel wide">
	<h2>Ideas</h2>
	{#if data.ideas.length === 0}
		<p class="muted">No ideas suggested.</p>
	{:else}
		<ul>
			{#each data.ideas as idea (idea._id)}
				<li>
					{idea.title} <span class="badge">{IDEA_STATUSES[idea.status].label}</span>
					<span class="muted">{idea.votes} votes</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section class="panel wide">
	<h2>Feedback</h2>
	<FeedbackList feedback={data.feedback} hideSender />
</section>

<section class="panel wide">
	<h2>Audit</h2>
	<AuditTable entries={data.audit} hideTarget />
</section>

<style>
	h1 {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	h2 {
		margin: 0 0 12px;
		font-size: 20px;
	}

	.avatar {
		display: flex;
		align-items: center;
		gap: 14px;
		margin: 0 0 12px;
	}

	.avatar img {
		border-radius: 50%;
		object-fit: cover;
	}

	h3 {
		margin: 18px 0 8px;
		font-size: 16px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: 16px;
		margin-bottom: 16px;
	}

	.wide {
		margin-bottom: 16px;
	}

	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 6px 14px;
		margin: 0 0 14px;
	}

	dt {
		color: var(--muted);
	}

	dd {
		margin: 0;
		word-break: break-word;
	}

	.actions {
		display: grid;
		gap: 8px;
		justify-items: start;
	}

	.reason {
		white-space: pre-wrap;
		border-left: 3px solid #a33;
		padding-left: 10px;
	}

	textarea {
		width: 100%;
	}

	.days {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.days input {
		width: 80px;
	}
</style>
