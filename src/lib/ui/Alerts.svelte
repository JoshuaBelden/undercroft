<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import { alertText } from '#lib/content/alerts.ts';
	import { ITEMS, rarityOf } from '#lib/content/items.ts';
	import { alerts, follow, hold } from '#lib/game/alerts.svelte.ts';
	import Slot from './Slot.svelte';

	/**
	 * The alerts (src/lib/game/alerts.svelte.ts), stacked down from the middle of the right edge:
	 * each slides in from the right and, after its time, back out, and the ones below move up into
	 * its place. Clicking one goes where it is about. On every page, underground too. See
	 * docs/dev/alerts.md.
	 */

	const still =
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const slide = { x: 400, duration: still ? 0 : 320, opacity: 1 };
</script>

<section class="alerts" aria-label="Alerts" aria-live="polite">
	{#each alerts.list as { id, alert } (id)}
		{@const text = alertText(alert)}
		<button
			type="button"
			class="alert"
			class:item={alert.kind === 'item'}
			in:fly={slide}
			out:fly={slide}
			animate:flip={{ duration: still ? 0 : 240 }}
			onclick={() => follow(id)}
			onpointerenter={() => hold(id, true)}
			onpointerleave={() => hold(id, false)}
			onfocus={() => hold(id, true)}
			onblur={() => hold(id, false)}
		>
			{#if alert.kind === 'item'}
				{@const def = ITEMS[alert.item]}
				<Slot
					name={def?.name ?? alert.item}
					image={def?.image}
					count={alert.count}
					rarity={rarityOf(alert.item)}
					quest={def?.quest === true}
				/>
			{/if}
			<span class="text">
				<span class="title">{text.title}</span>
				<span class="line">{text.line}</span>
			</span>
		</button>
	{/each}
</section>

<style>
	.alerts {
		position: fixed;
		top: 50%;
		right: 16px;
		z-index: 60;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 10px;
		/* The stack itself doesn't catch the pointer; only the alerts in it do. */
		pointer-events: none;
	}

	.alert {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 14px;
		min-width: 300px;
		max-width: min(380px, calc(100vw - 32px));
		min-height: 100px;
		padding: 14px 32px;
		background: var(--panel);
		color: var(--text);
		border: 1px solid var(--text);
		/* The site's pill: half the height rounds each end. */
		border-radius: 50px;
		text-align: left;
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.5);
		cursor: pointer;
	}

	.alert:hover,
	.alert:focus-visible {
		border-color: var(--accent);
	}

	.alert.item {
		padding-left: 18px;
		/* A slot that sits inside the round end. */
		--slot-size: 64px;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.title {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.line {
		font-family: var(--font-body);
		font-size: 1rem;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
</style>
