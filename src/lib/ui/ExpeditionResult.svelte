<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ItemStack } from '#lib/shared/player/types.ts';
	import { stackLabel } from './items.ts';

	interface Props {
		seconds: number;
		deepestLevel: number;
		/** How the expedition ended for this player. */
		outcome: 'extracted' | 'died' | 'banished' | 'resolved';
		/** After watching the rest of the expedition: how many of the others got out alive. */
		escaped?: number | null;
		/** What was carried out (kept); null when it was lost. */
		carried: ItemStack[] | null;
		/** Back to the party on the surface. */
		oncontinue: () => void;
	}

	let { seconds, deepestLevel, outcome, escaped = null, carried, oncontinue }: Props = $props();

	const TITLES = {
		extracted: 'You made it out',
		died: "You didn't make it out",
		banished: 'The dark recedes',
		resolved: 'The rite is done'
	};

	const time = $derived(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
	const depth = $derived(
		deepestLevel === 0
			? 'the first level'
			: `${deepestLevel} level${deepestLevel === 1 ? '' : 's'} down`
	);
</script>

<div class="screen">
	<div class="card">
		<h1>{TITLES[outcome]}</h1>
		{#if outcome === 'banished'}
			<p class="note">You drove it back, for now. The Gloaming is not resolved.</p>
		{:else if outcome === 'resolved'}
			<p class="note">The Gloaming is resolved. The dark lets go of this place.</p>
		{:else if escaped !== null}
			<p class="note">
				{escaped === 0 ? 'No one made it out.' : `${escaped} of the others made it out.`}
			</p>
		{/if}
		<dl>
			<dt>Time underground</dt>
			<dd>{time}</dd>
			<dt>Deepest point</dt>
			<dd>{depth}</dd>
		</dl>
		{#if carried === null}
			<p class="note">Everything you carried is lost.</p>
		{:else if carried.length === 0}
			<p class="note">You brought nothing out.</p>
		{:else}
			<p class="note">You brought out: {carried.map(stackLabel).join(', ')}.</p>
		{/if}
		<div class="actions">
			<button type="button" class="primary" onclick={oncontinue}>Continue</button>
			<a href={resolve('/')}>Main menu</a>
		</div>
	</div>
</div>

<style>
	.screen {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		background: radial-gradient(circle at 50% 40%, #1a1712 0%, #000 70%);
		z-index: 20;
	}

	.card {
		min-width: min(360px, calc(100vw - 32px));
		padding: 32px;
		border: 1px solid rgb(232 223 207 / 0.15);
		background: rgb(0 0 0 / 0.5);
		color: #e8dfcf;
		text-align: center;
	}

	h1 {
		margin: 0 0 24px;
		font:
			400 1.5rem Georgia,
			'Times New Roman',
			serif;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}

	dl {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 8px 24px;
		margin: 0 0 28px;
		text-align: left;
		font:
			13px ui-monospace,
			monospace;
	}

	dt {
		color: var(--muted);
	}

	.note {
		margin: -12px 0 24px;
		font:
			italic 0.95rem Georgia,
			'Times New Roman',
			serif;
		color: var(--muted);
	}

	dd {
		margin: 0;
	}

	.actions {
		display: flex;
		gap: 16px;
		justify-content: center;
		align-items: center;
	}

	.primary {
		padding: 10px 22px;
		font:
			13px ui-monospace,
			monospace;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: #e8dfcf;
		background: rgb(232 223 207 / 0.08);
		border: 1px solid rgb(232 223 207 / 0.35);
		cursor: pointer;
	}

	a {
		font:
			13px ui-monospace,
			monospace;
		color: var(--muted);
	}
</style>
