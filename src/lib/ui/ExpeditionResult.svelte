<script lang="ts">
	import { resolve } from '$app/paths';

	interface Props {
		seconds: number;
		deepestLevel: number;
		/** Bled out rather than climbed out. */
		died?: boolean;
		ondescend: () => void;
	}

	let { seconds, deepestLevel, died = false, ondescend }: Props = $props();

	const time = $derived(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
	const depth = $derived(
		deepestLevel === 0
			? 'the first level'
			: `${deepestLevel} level${deepestLevel === 1 ? '' : 's'} down`
	);
</script>

<div class="screen">
	<div class="card">
		<h1>{died ? "You didn't make it out" : 'You made it out'}</h1>
		<dl>
			<dt>Time underground</dt>
			<dd>{time}</dd>
			<dt>Deepest point</dt>
			<dd>{depth}</dd>
		</dl>
		<div class="actions">
			<button type="button" class="primary" onclick={ondescend}>Descend again</button>
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
