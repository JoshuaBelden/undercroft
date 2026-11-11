<script lang="ts">
	import { onMount } from 'svelte';
	import { session } from '#lib/account/account.svelte.ts';
	import { AudioManager } from '#lib/game/audio/AudioManager.ts';
	import { SoundBank } from '#lib/game/audio/SoundBank.ts';
	import { settings } from '#lib/settings/settings.svelte.ts';
	import Outfit from '#lib/ui/Outfit.svelte';

	const explorer = $derived(session.account?.explorer ?? null);

	const audio = new AudioManager({ ...settings.audio });
	const sounds = new SoundBank(audio);

	/** Something was put down in a slot, sold or thrown away. */
	function changed(kind: 'move' | 'sell' | 'drop'): void {
		for (const category of ['master', 'sfx'] as const) {
			audio.setVolume(category, settings.audio[category]);
		}
		void audio.unlock().then(() => sounds.play(kind === 'sell' ? 'shop.sell' : 'inventory.drop'));
	}

	onMount(() => () => audio.dispose());
</script>

<!-- A full-width page: no centred column. -->
{#if explorer}
	<Outfit {explorer} onchange={changed} />
{:else}
	<p class="muted">Loading...</p>
{/if}

<style>
	.muted {
		margin: 32px 16px;
		color: var(--muted);
	}
</style>
