<script lang="ts">
	import { onMount } from 'svelte';
	import { session } from '#lib/account/account.svelte.ts';
	import { AudioManager } from '#lib/game/audio/AudioManager.ts';
	import { SoundBank } from '#lib/game/audio/SoundBank.ts';
	import { settings } from '#lib/settings/settings.svelte.ts';
	import Shop from '#lib/ui/Shop.svelte';

	const explorer = $derived(session.account?.explorer ?? null);

	const audio = new AudioManager({ ...settings.audio });
	const sounds = new SoundBank(audio);

	function traded(kind: 'buy' | 'sell'): void {
		for (const category of ['master', 'sfx'] as const) {
			audio.setVolume(category, settings.audio[category]);
		}
		void audio.unlock().then(() => sounds.play(kind === 'buy' ? 'shop.buy' : 'shop.sell'));
	}

	onMount(() => () => audio.dispose());
</script>

<div class="page-column">
	<section class="card">
		{#if explorer}
			<Shop {explorer} ontrade={traded} />
		{:else}
			<p class="muted">Loading...</p>
		{/if}
	</section>
</div>

<style>
	.card {
		padding: 20px;
		background: rgb(10 9 8 / 0.82);
		border: 1px solid var(--border);
	}

	.muted {
		margin: 0;
		color: var(--muted);
	}
</style>
