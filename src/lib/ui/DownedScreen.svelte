<script lang="ts">
	import HoldPrompt from './HoldPrompt.svelte';

	/**
	 * Shown while the player is downed: what's happening, how long they have left, and the way to
	 * give up.
	 */
	interface Props {
		/** 0..1 of the bleed-out time remaining. */
		remaining: number;
		/** What happens next ("Waiting for help...", "Reaching for your salts..."). */
		message: string;
		/** The key that surrenders when held, as bound ("Space"); empty when unbound. */
		surrenderKey: string;
		/** 0..1 of the hold to surrender. */
		surrender: number;
	}

	let { remaining, message, surrenderKey, surrender }: Props = $props();
</script>

<div class="downed" role="status">
	<h2>You're down</h2>
	<p>{message}</p>
	<div class="bar" aria-label="Time left">
		<div class="fill" style:width="{Math.max(0, Math.min(1, remaining)) * 100}%"></div>
	</div>
	<div class="surrender">
		<HoldPrompt
			key={surrenderKey || null}
			text={surrenderKey ? 'to surrender' : 'Climb to surrender'}
			progress={surrender}
		/>
	</div>
</div>

<style>
	.downed {
		position: fixed;
		left: 50%;
		top: 30%;
		transform: translateX(-50%);
		display: grid;
		justify-items: center;
		gap: 10px;
		pointer-events: none;
		z-index: 6;
	}

	h2 {
		margin: 0;
		font: 400 1.6rem var(--font-lore);
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: #e0c8c0;
		text-shadow: 0 0 18px rgb(0 0 0 / 0.9);
	}

	p {
		margin: 0;
		font: 12px var(--font-ui);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.bar {
		width: 200px;
		height: 3px;
		background: rgb(255 255 255 / 0.08);
	}

	.fill {
		height: 100%;
		background: rgb(190 60 60 / 0.8);
	}

	.surrender {
		margin-top: 28px;
	}
</style>
