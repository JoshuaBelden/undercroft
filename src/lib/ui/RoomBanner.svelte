<script lang="ts">
	interface Props {
		title: string;
	}

	let { title }: Props = $props();
</script>

<div class="banner" aria-live="polite">
	<span class="rule"></span>
	<h2>{title}</h2>
	<span class="rule"></span>
</div>

<style>
	.banner {
		position: fixed;
		left: 50%;
		top: 22%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 18px;
		pointer-events: none;
		animation: banner 4.2s ease-in-out forwards;
		z-index: 4;
	}

	h2 {
		margin: 0;
		font:
			400 1.6rem Georgia,
			'Times New Roman',
			serif;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: #e6dccb;
		text-shadow: 0 0 18px rgb(0 0 0 / 0.9);
		white-space: nowrap;
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
