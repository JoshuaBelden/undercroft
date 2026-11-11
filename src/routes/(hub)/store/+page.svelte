<script lang="ts">
	import { onMount } from 'svelte';
	import { session } from '#lib/account/account.svelte.ts';
	import { AudioManager } from '#lib/game/audio/AudioManager.ts';
	import { SoundBank } from '#lib/game/audio/SoundBank.ts';
	import { me } from '#lib/game/net/connection.svelte.ts';
	import { settings } from '#lib/settings/settings.svelte.ts';
	import Shop from '#lib/ui/Shop.svelte';

	const explorer = $derived(session.account?.explorer ?? null);

	const audio = new AudioManager({ ...settings.audio });
	const sounds = new SoundBank(audio);

	function bought(): void {
		for (const category of ['master', 'sfx'] as const) {
			audio.setVolume(category, settings.audio[category]);
		}
		void audio.unlock().then(() => sounds.play('shop.buy'));
	}

	onMount(() => () => audio.dispose());
</script>

<!-- A full-width page: no centred column. -->
{#if explorer}
	<Shop {explorer} ready={me()?.ready ?? false} onbuy={bought} />
{:else}
	<p class="muted">Loading...</p>
{/if}

<style>
	.muted {
		margin: 32px 16px;
		color: var(--muted);
	}
</style>
