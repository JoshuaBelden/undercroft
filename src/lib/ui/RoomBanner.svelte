<script lang="ts">
	interface Props {
		title: string;
		/** A line under it, in ordinary case and wrapping (a hint's words). */
		subtitle?: string;
	}

	let { title, subtitle }: Props = $props();
</script>

<div class="banner" aria-live="polite">
	<div class="heading">
		<span class="rule"></span>
		<h2>{title}</h2>
		<span class="rule"></span>
	</div>
	{#if subtitle}
		<p>{subtitle}</p>
	{/if}
</div>

<style>
	.banner {
		position: fixed;
		left: 50%;
		top: 22%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		width: max-content;
		max-width: calc(100vw - 32px);
		pointer-events: none;
		animation: banner 4.2s ease-in-out forwards;
		z-index: 4;
	}

	h2 {
		margin: 0;
		font: 400 1.6rem var(--font-lore);
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: #e6dccb;
		text-shadow: 0 0 18px rgb(0 0 0 / 0.9);
		white-space: nowrap;
	}

	.heading {
		display: flex;
		align-items: center;
		gap: 18px;
	}

	p {
		margin: 0;
		max-width: 620px;
		font: italic 400 1.15rem var(--font-lore);
		line-height: 1.45;
		text-align: center;
		color: #e6dccb;
		text-shadow: 0 0 14px rgb(0 0 0 / 0.95);
	}

	.rule {
		width: 48px;
		height: 1px;
		background: rgb(230 220 203 / 0.45);
	}

	@keyframes banner {
		0% {
			opacity: 0;
			letter-spacing: 0.1em;
		}
		22% {
			opacity: 1;
		}
		75% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.banner {
			animation-name: banner-fade;
		}

		@keyframes banner-fade {
			0%,
			100% {
				opacity: 0;
			}
			15%,
			80% {
				opacity: 1;
			}
		}
	}
</style>
